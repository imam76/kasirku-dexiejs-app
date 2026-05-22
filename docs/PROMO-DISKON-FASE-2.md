# Fitur Promo & Diskon - Fase Lanjutan

Dokumen ini adalah rencana fase setelah `PROMO-DISKON.md`. Jangan mulai dari dokumen ini sebelum fase 1 stabil, karena fitur lanjutan akan menyentuh aturan kombinasi promo, alokasi diskon, audit, dan validasi checkout.

## Prasyarat Sebelum Mulai

Fase 1 dianggap siap jika:
- `promos` table sudah ada di Dexie.
- `promoService` sudah bisa menghitung diskon percent/fixed secara pure.
- `checkoutService` sudah menghitung ulang total final dari cart dan promo.
- `Transaction.total_amount`, `TransactionItem.subtotal`, dan `TransactionItem.profit` sudah memakai nilai final setelah diskon.
- Receipt, history, report, finance, profit, void, dan backup/restore aman untuk transaksi diskon.
- Manual QA fase 1 sudah lolos.

Jika salah satu belum selesai, jangan lanjut ke fase ini dulu.

## Tujuan Fase Lanjutan

Fase lanjutan menambah kemampuan promo tanpa membuat sistem accounting baru:
- Kombinasi promo dengan `stackable` dan `exclusive_group`.
- Promo Buy X Get Y untuk produk yang sama.
- Bundle sederhana lintas produk.
- Voucher yang lebih ketat.
- Promo audit/versioning jika perlu rollback aturan.
- Limit pemakaian promo secara lokal.

Yang tetap harus dijaga:
- Product master tidak berubah karena promo.
- Checkout final tetap dihitung ulang di service.
- Diskon tetap dialokasikan ke line item supaya profit/report benar.
- Snapshot promo di transaksi menjadi sumber kebenaran historis.
- Void tidak membuat expense diskon atau expense pembatalan.

## Urutan Implementasi

Kerjakan bertahap. Jangan memasukkan semua fitur lanjutan dalam satu patch.

1. Fase 2A: stackable, exclusive group, dan resolver kombinasi.
2. Fase 2B: promo Buy X Get Y untuk produk yang sama.
3. Fase 2C: bundle sederhana lintas produk.
4. Fase 2D: usage limit lokal dan redemption log.
5. Fase 2E: promo history/versioning jika benar-benar dibutuhkan.

## Fase 2A - Stackable dan Exclusive Group

Tambahkan field ke `Promo`:

```ts
stackable?: boolean;
exclusive_group?: string | null;
```

Aturan:
- Default `stackable` adalah `false`.
- Promo dalam `exclusive_group` yang sama tidak boleh dipakai bersamaan.
- Promo non-stackable tidak boleh digabung dengan promo lain.
- Promo stackable boleh digabung selama tidak melanggar `exclusive_group`.
- Urutan evaluasi tetap memakai `priority`, tetapi keputusan akhir harus memilih total diskon terbaik yang valid.

Resolver kombinasi:
- Input: cart, candidate promos, voucher code.
- Output: kombinasi promo yang valid dan menghasilkan total diskon terbaik.
- Untuk fase ini, jumlah promo biasanya kecil. Boleh brute force kombinasi selama diberi batas aman.
- Batas aman awal: maksimal 8 candidate promo per cart. Jika lebih dari itu, ambil kandidat teratas berdasarkan eligibility dan priority dulu.

Jangan:
- Membuat optimizer rumit sebelum ada kebutuhan nyata.
- Mengubah harga produk.
- Menghitung stack promo di komponen UI.

QA minimal:
- Dua promo non-stackable eligible, hanya satu terbaik dipakai.
- Dua promo stackable eligible, keduanya dipakai.
- Dua promo dalam exclusive group yang sama, hanya satu dipakai.
- Promo stackable dari group berbeda bisa dipakai bersama.
- Total final dan profit tetap benar setelah beberapa diskon.

## Fase 2B - Buy X Get Y Produk Sama

Tambahkan type:

```ts
export type PromoType = 'percent' | 'fixed' | 'buy_x_get_y';
```

Tambahkan value shape:

```ts
type BuyXGetYValue = {
  buy_qty: number;
  get_qty: number;
  discount_percent?: number; // default 100 untuk gratis
};
```

Scope fase ini:
- Hanya untuk produk yang sama.
- Contoh: beli 2 dapat 1 gratis untuk produk A.
- Belum lintas SKU.
- Belum auto-add item gratis ke cart.

Aturan engine:
- Hitung jumlah eligible per product.
- Free quantity = `floor(quantity / (buy_qty + get_qty)) * get_qty`.
- Diskon line = harga unit eligible termurah dalam line tersebut * free quantity * discount percent.
- Karena cart saat ini satu line per product+unit, fase awal boleh memakai harga line itu.
- Jika unit berbeda untuk produk yang sama nanti didukung, evaluasi harus dinormalisasi dulu.

Penyimpanan transaksi:
- Tetap simpan sebagai discount line, bukan item harga nol baru.
- Snapshot harus menyimpan rule `buy_qty`, `get_qty`, dan `free_qty`.

Contoh snapshot adjustment:

```json
{
  "promo_id": "bogo-001",
  "promo_name": "Beli 2 Gratis 1",
  "scope": "line",
  "product_id": "product-id-a",
  "amount": 12000,
  "reason": "Buy 2 Get 1, free_qty=1"
}
```

QA minimal:
- Qty 1 tidak dapat diskon untuk B2G1.
- Qty 3 dapat 1 gratis.
- Qty 6 dapat 2 gratis.
- Diskon tidak melebihi subtotal line.
- Profit line memakai subtotal final setelah diskon.

## Fase 2C - Bundle Sederhana Lintas Produk

Tambahkan type:

```ts
export type PromoType = 'percent' | 'fixed' | 'buy_x_get_y' | 'bundle';
```

Tambahkan value shape:

```ts
type BundleValue = {
  required_product_ids: string[];
  discount_type: 'percent' | 'fixed';
  discount_value: number;
};
```

Scope fase ini:
- Bundle berlaku jika semua `required_product_ids` ada di cart.
- Minimal qty awal: masing-masing produk harus ada qty > 0.
- Bundle discount dialokasikan proporsional ke product yang ikut bundle.
- Jika satu produk punya qty besar, tetap dihitung satu set bundle dulu. Multi-set bundle bisa ditunda kecuali dibutuhkan.

Aturan:
- `required_product_ids` tetap memakai `Product.id`, bukan `sku`.
- Jangan membuat product bundle baru di product master.
- Jangan menggabungkan item cart menjadi satu line palsu.
- Snapshot harus mencatat product apa saja yang memenuhi bundle.

QA minimal:
- Bundle tidak berlaku jika salah satu produk kurang.
- Bundle fixed tidak membuat total eligible negatif.
- Bundle percent hanya mengenai produk yang ikut bundle.
- Report top product tetap memakai line product asli.

## Fase 2D - Usage Limit Lokal

Field tambahan:

```ts
usage_limit?: number | null;
usage_count?: number;
```

Tambahkan table jika benar-benar diperlukan:

```ts
promoRedemptions!: Table<PromoRedemption>;

this.version(13).stores({
  promoRedemptions: 'id, promo_id, transaction_id, created_at'
});
```

Tipe:

```ts
export interface PromoRedemption {
  id: string;
  promo_id: string;
  transaction_id: string;
  transaction_number: string;
  discount_amount: number;
  created_at: string;
}
```

Aturan:
- Usage limit dihitung lokal dari `promoRedemptions`.
- Tulis redemption di transaksi Dexie yang sama dengan checkout supaya atomic.
- Jika checkout gagal, redemption tidak boleh tercatat.
- Jika transaksi void, jangan hapus redemption otomatis. Tambahkan status/field jika nanti bisnis menganggap void mengembalikan kuota.

Catatan penting:
- Limit ini belum aman untuk multi-device tanpa source of truth pusat.
- Jangan membuat `per_user_limit` memakai staff auth, karena user auth saat ini adalah pegawai toko, bukan customer.

QA minimal:
- Promo dengan limit 1 hanya bisa dipakai sekali.
- Promo tanpa limit tetap bisa dipakai berkali-kali.
- Checkout gagal tidak menambah redemption.
- Backup/restore ikut membawa `promoRedemptions`.

## Fase 2E - Promo History / Versioning

Jangan tambah `promo_history` hanya karena terlihat rapi. Tambahkan jika ada kebutuhan nyata seperti:
- Owner ingin melihat perubahan aturan promo.
- Owner ingin restore promo versi sebelumnya.
- Ada promo kompleks yang rawan salah input.

Jika dibutuhkan, tambahkan table:

```ts
promoHistory!: Table<PromoHistory>;

this.version(14).stores({
  promoHistory: 'id, promo_id, version, created_at, changed_by'
});
```

Tipe:

```ts
export interface PromoHistory {
  id: string;
  promo_id: string;
  version: number;
  snapshot: Promo;
  change_type: 'create' | 'update' | 'delete' | 'restore';
  changed_by?: string;
  created_at: string;
}
```

Aturan:
- Simpan snapshot penuh promo sebelum atau sesudah perubahan, pilih satu pola dan konsisten.
- `activityLogs` tetap dipakai untuk audit user-facing.
- `promoHistory` dipakai untuk data rollback/versi, bukan pengganti `activityLogs`.
- Transaksi lama tetap memakai `applied_promos_snapshot`, bukan membaca promo master atau promoHistory.

## Customer dan Per-User Limit

Jangan implement `per_user_limit` sampai ada konsep customer/member yang jelas.

Jika nanti butuh member:
- Buat model customer terpisah dari `AuthUser`.
- Transaction perlu optional `customer_id`.
- Promo redemption bisa menyimpan `customer_id`.
- Per-user limit harus berarti customer, bukan kasir/admin yang login.

Tanpa customer model, `per_user_limit` akan menyesatkan.

## Perubahan Checkout Yang Wajib Tetap Dipertahankan

Setiap fase lanjutan harus tetap mengikuti alur ini:

1. UI membuat preview.
2. Checkout service mengambil promo aktif terbaru.
3. Checkout service menghitung ulang promo final.
4. Service menyimpan transaction, items, profit, finance, stock, redemption, dan activity log dalam flow yang konsisten.
5. Return shape tetap kompatibel dengan receipt: `{ transaction, items }`.

Jika `checkoutService` perlu return tambahan, tambahkan field tanpa menghapus `transaction` dan `items`.

## Report dan Export

Untuk fitur lanjut, report tidak boleh menghitung ulang promo dari master promo.

Tambahkan data report dari snapshot:
- Nama promo yang dipakai.
- Total diskon.
- Diskon per item.
- Type promo.

Export CSV/PDF boleh menampilkan:
- Subtotal sebelum diskon.
- Diskon.
- Subtotal final.
- Promo name.

Tetap gunakan fallback untuk transaksi lama yang tidak punya field promo.

## Manual QA Gabungan

Setelah semua subfase selesai, jalankan skenario ini:
- Percent + fixed non-stackable, hanya promo terbaik masuk.
- Percent + fixed stackable, keduanya masuk dan alokasi line benar.
- Exclusive group menolak promo ganda dalam group yang sama.
- BOGO qty 3 menghasilkan free qty 1.
- Bundle produk A+B berlaku hanya saat A dan B ada.
- Voucher bundle tidak berlaku jika kode salah.
- Usage limit habis membuat promo tidak eligible.
- Checkout diskon tetap mengurangi stok sesuai qty asli.
- Profit turun sesuai diskon.
- Finance income memakai total final.
- Void transaksi diskon membalik stok, finance, dan profit final.
- Recalculate finance/profit menghasilkan angka yang sama.
- Receipt/history/report menampilkan diskon tanpa error.
- Backup/restore tidak menghilangkan promo, redemption, dan history jika table-nya sudah ada.

## Checklist Fase Lanjutan

- [ ] Fase 1 sudah stabil.
- [ ] Tambah `stackable` dan `exclusive_group`.
- [ ] Buat resolver kombinasi promo.
- [ ] Tambah test/manual QA untuk stackable dan exclusive group.
- [ ] Tambah `buy_x_get_y` untuk produk yang sama.
- [ ] Tambah snapshot detail free quantity.
- [ ] Tambah `bundle` sederhana lintas produk.
- [ ] Tambah usage limit lokal jika dibutuhkan.
- [ ] Tambah `promoRedemptions` hanya saat usage limit dikerjakan.
- [ ] Tambah `promoHistory` hanya saat rollback/versioning dibutuhkan.
- [ ] Update backup/restore untuk setiap table baru.
- [ ] Update receipt/history/report/export untuk field baru.
- [ ] Pastikan semua perubahan tetap menjaga total final, profit final, dan void semantics.
