# Fitur Promo & Diskon - Spesifikasi Aman

Dokumen ini adalah hasil audit ulang terhadap rencana promo/diskon dengan kondisi project Frayukti saat ini. Targetnya: junior developer bisa mengerjakan fitur ini tanpa merusak transaksi, stok, finance, profit, receipt, dan laporan.

## Ringkasan Keputusan

Fase 1 dibuat kecil dulu:
- Diskon persentase.
- Diskon nominal.
- Berlaku untuk semua produk, kategori, atau produk tertentu.
- Berlaku berdasarkan rentang waktu `start_at` / `end_at`.
- Optional kode voucher.
- Syarat minimum `min_qty` dan `min_total`.
- Default tidak stackable: ambil promo terbaik berdasarkan diskon terbesar, lalu `priority` sebagai tie-breaker.

Ditunda ke fase berikutnya:
- Buy X Get Y / BOGO.
- Bundling lintas SKU.
- Kombinasi promo kompleks dengan `stackable` dan `exclusive_group`.
- `usage_limit` dan `per_user_limit`.
- Promo khusus customer, karena auth saat ini adalah user internal toko, bukan customer.

## Prinsip Project

- Jangan mengubah `Product.selling_price` untuk diskon. Harga produk tetap menjadi harga master.
- Jangan menambahkan `original_price` permanen ke product. Di project ini `original_price` sudah dipakai pada `TransactionItem` untuk jejak harga manual/edit price.
- `src/store/transactionStore.ts` hanya state keranjang UI, bukan tempat menyimpan transaksi.
- Penyimpanan transaksi tetap di `src/services/checkoutService.ts`.
- Tipe utama tetap di `src/types/index.ts`.
- DB schema tetap di `src/lib/db.ts`.
- Perhitungan harga dasar tetap memakai helper dari `src/utils/pricing.ts`.
- UI boleh menampilkan preview promo, tetapi hasil final checkout harus dihitung ulang di service.
- Angka finance, profit, receipt, history, dan report harus memakai nilai final setelah diskon.

## Data Model

Tambahkan tipe di `src/types/index.ts`.

```ts
export type PromoType = 'percent' | 'fixed';
export type PromoAppliesTo = 'all' | 'product' | 'category';

export interface Promo {
  id: string;
  name: string;
  type: PromoType;
  value: number;
  applies_to: PromoAppliesTo;
  product_ids?: string[]; // Product.id, bukan sku
  categories?: ProductCategory[];
  start_at?: string | null;
  end_at?: string | null;
  min_qty?: number | null;
  min_total?: number | null;
  voucher_code?: string | null;
  active: boolean;
  priority: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PromoAdjustment {
  promo_id: string;
  promo_name: string;
  scope: 'line' | 'order';
  product_id?: string;
  amount: number; // selalu positif, misalnya 5000 berarti diskon Rp 5.000
  reason: string;
}

export interface AppliedPromoSnapshot {
  promo_id: string;
  name: string;
  type: PromoType;
  value: number;
  applies_to: PromoAppliesTo;
  product_ids?: string[];
  categories?: ProductCategory[];
  voucher_code?: string | null;
  adjustments: PromoAdjustment[];
}
```

Catatan penting:
- `product_ids` wajib berisi `Product.id`, bukan `sku`.
- Untuk kategori, pakai string kategori yang sudah ada di `Product.category`; jangan membuat tabel kategori baru untuk fase 1.
- Jangan pakai `amount` negatif untuk diskon. Simpan diskon sebagai angka positif supaya tidak rancu dengan expense finance.

## DB Schema Dexie

Saat ini `src/lib/db.ts` sudah sampai `version(11)`. Jangan menambahkan table ke `version(1)`.

Tambahkan import type:

```ts
import type { Promo } from '@/types';
```

Tambahkan table property:

```ts
promos!: Table<Promo>;
```

Tambahkan schema baru:

```ts
this.version(12).stores({
  promos: 'id, active, type, applies_to, voucher_code, priority, start_at, end_at, created_at'
});
```

Untuk fase 1, tidak perlu membuat `promo_history` table dulu. Audit CRUD promo cukup pakai `activityLogs` yang sudah ada. Jika nanti butuh rollback versi promo, baru tambahkan `promoHistory` di fase terpisah.

Backup/restore juga wajib ikut diubah:
- `backupDatabase()` harus export `promos`.
- `restoreDatabase()` harus validasi, clear, dan import `promos`.
- Naikkan versi payload backup jika diperlukan.

## Promo Service

Buat `src/services/promoService.ts`.

Kontrak minimal:

```ts
interface EvaluatePromoInput {
  cart: CartItem[];
  promos: Promo[];
  voucherCode?: string;
  now?: Date;
}

interface PromoLineResult {
  product_id: string;
  price_before_discount: number;
  quantity: number;
  subtotal_before_discount: number;
  discount_amount: number;
  final_unit_price: number;
  final_subtotal: number;
  adjustments: PromoAdjustment[];
}

interface PromoEvaluationResult {
  subtotal_before_discount: number;
  discount_amount: number;
  total_amount: number;
  lines: PromoLineResult[];
  applied_promos_snapshot: AppliedPromoSnapshot[];
  discount_breakdown: Array<{ label: string; amount: number }>;
}
```

Fungsi:
- `getActivePromos(now: Date): Promise<Promo[]>`
- `evaluatePromos(input: EvaluatePromoInput): PromoEvaluationResult`

Aturan engine:
- `evaluatePromos` harus pure: tidak menulis DB, tidak mengubah product, tidak mengubah cart.
- Filter promo aktif berdasarkan `active`, `start_at`, `end_at`, dan `voucher_code`.
- Hitung subtotal awal dari `getCartItemPrice(item) * item.quantity`.
- `percent`: diskon = subtotal eligible * `value / 100`.
- `fixed`: diskon nominal tidak boleh melebihi subtotal eligible.
- `min_qty` dicek terhadap total quantity line eligible.
- `min_total` dicek terhadap subtotal eligible sebelum diskon.
- Jika ada lebih dari satu promo eligible, fase 1 pilih satu promo terbaik: diskon terbesar menang; jika sama, `priority` paling kecil menang.
- Diskon order-level harus dialokasikan kembali ke line eligible secara proporsional supaya `TransactionItem.subtotal` dan `TransactionItem.profit` tetap benar.
- Setelah alokasi, pastikan jumlah diskon line sama dengan total diskon. Jika ada selisih rounding, taruh selisih di line eligible terakhir.

## Integrasi Checkout

Ubah `src/services/checkoutService.ts`.

Saat ini `checkout` menerima `total` dari UI. Untuk promo, service harus menghitung ulang total final dari cart:

1. UI boleh mengirim `voucherCode`.
2. `checkoutService` mengambil promo aktif.
3. `checkoutService` menjalankan `evaluatePromos`.
4. `payment`, `change_amount`, `finance income`, `profit`, dan `stock reduction` memakai hasil final dari service.
5. Jangan percaya `total` dari UI sebagai sumber kebenaran promo.

Fields yang perlu ditambahkan ke `Transaction`:

```ts
subtotal_amount?: number;
discount_amount?: number;
discount_breakdown?: Array<{ label: string; amount: number }>;
applied_promos_snapshot?: AppliedPromoSnapshot[];
```

Fields yang perlu ditambahkan ke `TransactionItem`:

```ts
price_before_discount?: number;
subtotal_before_discount?: number;
discount_amount?: number;
```

Aturan penyimpanan item:
- `price_before_discount` adalah harga dari `getCartItemPrice(item)` sebelum promo.
- `subtotal_before_discount` adalah `price_before_discount * quantity`.
- `discount_amount` adalah alokasi diskon untuk line tersebut.
- `price` dan `selling_price` sebaiknya berisi harga final per unit setelah diskon supaya tampilan lama `qty x price = subtotal` tetap konsisten.
- `subtotal` adalah subtotal final setelah diskon.
- `profit` adalah `subtotal final - total HPP line`.

Jangan mengubah logic stok karena promo tidak mengubah jumlah barang keluar.

## Finance, Profit, Void, dan Report

Jaga invariant ini:
- `Transaction.total_amount` adalah total final yang dibayar customer setelah diskon.
- `FinanceTransaction` kategori sales tetap memakai `transaction.total_amount`.
- `ProfitLog` sales tetap memakai total profit dari `TransactionItem.profit`.
- `recalculateFinance()` tidak perlu logic promo khusus selama `transaction.total_amount` sudah final.
- `recalculateProfit()` tidak perlu logic promo khusus selama `item.profit` sudah final.
- `voidTransaction()` tetap membalik stok, finance, dan profit dari angka transaksi final. Jangan membuat expense baru untuk diskon atau void.
- Sales report dan transaction detail report tetap memakai `transaction.total_amount`, `item.subtotal`, dan `item.profit` final.

Jika laporan perlu menampilkan diskon, tambahkan kolom optional dari `discount_amount`; jangan menghitung ulang promo dari promo master karena promo bisa berubah setelah transaksi.

## UI Minimal

Fase 1 jangan membuat route besar dulu. Gunakan area Settings yang sudah ada:
- Buat komponen `src/view/settings/PromoManagement.tsx` atau lokasi sejenis sesuai struktur Settings saat implementasi.
- Import ke `src/routes/settings.lazy.tsx`.
- Akses cukup pakai permission `SETTINGS_ACCESS` untuk fase 1.
- Catat create/update/delete promo ke `activityLogs`.

Di kasir:
- Tambahkan input voucher optional di `CartSummary`.
- Tampilkan subtotal, diskon, dan total final.
- Desktop `CartSidebar` dan mobile `MobileCartDrawer` harus sama-sama menerima hasil preview promo.
- Jika preview gagal atau belum selesai, checkout tetap aman karena `checkoutService` menghitung ulang.

Jangan copy logic promo ke komponen UI. UI hanya memanggil service/helper untuk preview.

## Receipt dan History

Receipt perlu menampilkan diskon agar total tidak terasa "misterius":
- Subtotal sebelum diskon.
- Diskon total.
- Total final.

History detail perlu menampilkan diskon line jika `discount_amount > 0`:
- Harga sebelum diskon.
- Diskon line.
- Subtotal final.

Pastikan data lama tanpa field promo tetap aman dibaca dengan fallback `0`.

## Contoh Promo Fase 1

Diskon 10% semua produk:

```json
{
  "id": "promo-001",
  "name": "Diskon 10%",
  "type": "percent",
  "value": 10,
  "applies_to": "all",
  "active": true,
  "priority": 10,
  "start_at": null,
  "end_at": null
}
```

Diskon Rp 5.000 untuk produk tertentu:

```json
{
  "id": "promo-002",
  "name": "Diskon Produk Pilihan",
  "type": "fixed",
  "value": 5000,
  "applies_to": "product",
  "product_ids": ["product-id-a"],
  "active": true,
  "priority": 20
}
```

Voucher kategori sembako:

```json
{
  "id": "promo-003",
  "name": "Voucher Sembako",
  "type": "percent",
  "value": 5,
  "applies_to": "category",
  "categories": ["sembako"],
  "voucher_code": "SEMBAKO5",
  "min_total": 50000,
  "active": true,
  "priority": 5
}
```

Happy hour tidak perlu type khusus di fase 1. Pakai `start_at` dan `end_at` pada promo percent/fixed.

## Testing dan QA

Saat dokumen ini ditulis, `package.json` belum punya test script. Jadi jangan menulis checklist "unit test lulus" kalau test runner belum ditambahkan.

Pilihan verifikasi:
- Jika menambah test runner, gunakan Vitest dan buat `src/services/__tests__/promoService.test.ts`.
- Jika tidak menambah test runner di fase 1, minimal jalankan build/typecheck yang tersedia dan lakukan manual QA.

Kasus minimal yang wajib diverifikasi:
- Promo nonaktif tidak diterapkan.
- Promo expired tidak diterapkan.
- Voucher salah tidak diterapkan.
- Diskon persen all-product benar.
- Diskon fixed tidak membuat total line negatif.
- Promo kategori hanya mengenai produk kategori itu.
- Promo product memakai `Product.id`, bukan `sku`.
- Dari beberapa promo eligible, hanya promo terbaik yang dipakai.
- `Transaction.total_amount` final sama dengan yang dibayar.
- `TransactionItem.subtotal` dan `TransactionItem.profit` sudah setelah diskon.
- `recalculateFinance()` dan `recalculateProfit()` tetap menghasilkan angka yang sama dengan transaksi final.
- Void transaksi diskon mengembalikan stok dan membalik finance/profit sesuai angka final.
- Backup lalu restore tidak menghilangkan promo.

## Checklist Implementasi

- [ ] Tambah tipe `Promo`, `PromoAdjustment`, dan `AppliedPromoSnapshot`.
- [ ] Tambah table `promos` di Dexie `version(12)`.
- [ ] Tambah backup/restore untuk `promos`.
- [ ] Buat `promoService` dengan evaluator pure.
- [ ] Integrasikan evaluator ke `checkoutService` sebagai sumber kebenaran final.
- [ ] Tambah field snapshot promo ke `Transaction`.
- [ ] Tambah field diskon line ke `TransactionItem`.
- [ ] Update receipt/history untuk menampilkan diskon.
- [ ] Update report/export jika ingin menampilkan kolom diskon.
- [ ] Buat UI CRUD minimal di Settings.
- [ ] Buat voucher input dan preview diskon di desktop dan mobile cart.
- [ ] Catat CRUD promo ke `activityLogs`.
- [ ] Jalankan build/typecheck dan manual QA minimal.

## Hal Yang Jangan Dilakukan

- Jangan menyimpan diskon dengan mengubah `Product.selling_price`.
- Jangan menaruh logic final promo hanya di frontend.
- Jangan memakai `sku` sebagai `product_ids`.
- Jangan menambahkan `promo_history` sebelum ada kebutuhan rollback versi promo.
- Jangan membuat expense finance untuk diskon.
- Jangan menghitung profit dari harga sebelum diskon.
- Jangan mengubah `transactionStore` menjadi persistence layer transaksi.
