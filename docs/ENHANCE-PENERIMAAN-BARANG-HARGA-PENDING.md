# Enhancement Purchase Receipt: Harga Pending dan Rekonsiliasi HPP

Dokumen ini adalah langkah implementasi enhancement pada alur Purchase Receipt / Penerimaan Barang yang sudah ada.

Masalah yang ditutup: barang sudah diterima dari supplier dan langsung bisa terjual, tetapi harga beli final belum diketahui karena petugas hanya membawa surat jalan.

Target utama enhancement ini: stok tetap bisa operasional, tetapi HPP, margin, dan laporan laba tidak diam-diam memakai angka yang salah.

Scope implementasi: perubahan ini harus menempel ke Purchase Receipt / Penerimaan Barang existing. Jangan dibuat sebagai module, route root, atau menu utama baru yang berdiri sendiri.

## Penamaan di UI

Nama user-facing berikut dipakai sebagai label action, status, atau filter di dalam alur Purchase Receipt/Purchases, bukan sebagai nama module baru:

```txt
Penerimaan Barang Harga Pending
Rekonsiliasi HPP
```

Nama teknis yang disarankan:

```txt
Pending Purchase Cost
Purchase Cost Reconciliation
```

## Arah Implementasi

Enhancement ini tetap berada di alur existing:

```txt
Finance > Purchases > Purchase Receipt
```

Yang ditambahkan adalah kemampuan baru di Purchase Receipt existing:

- Menerima barang dari surat jalan walaupun harga final belum ada.
- Menandai harga sebagai `Harga Final`, `Harga Sementara`, atau `Belum Ada Harga`.
- Membuat FIFO lot dengan metadata status HPP.
- Memberi warning saat lot harga sementara dijual di POS.
- Menyediakan action `Rekonsiliasi Harga` dari dokumen Purchase Receipt.
- Menyediakan filter/list `Harga Belum Final` sebagai view pendukung di area Purchases.

Yang tidak boleh dibuat sebagai scope enhancement ini:

```txt
src/modules/pending-cost/
src/features/pending-cost/
route root baru di luar /finance/purchases
```

Service, hook, dan view tambahan boleh dibuat, tetapi tetap sebagai bagian dari Purchase Receipt/Purchases.

## Problem Bisnis

Flow yang terjadi di lapangan:

1. Barang datang dari supplier.
2. Dokumen yang dibawa hanya surat jalan.
3. Harga beli final belum diketahui.
4. Barang tetap perlu masuk stok karena fisiknya sudah ada.
5. Barang bisa langsung laku sebelum invoice supplier datang.
6. Saat harga final datang, margin transaksi yang sudah terjadi bisa berubah.

Risiko jika aplikasi tidak menutup celah ini:

- HPP transaksi bisa salah.
- Laba terlihat lebih besar atau lebih kecil dari kenyataan.
- Stok FIFO punya cost 0 atau cost lama tanpa tanda bahwa angka itu hanya estimasi.
- Owner tidak punya daftar barang yang masih perlu dikonfirmasi harganya.
- Setelah invoice supplier datang, tidak ada proses rapi untuk koreksi margin.

## Kondisi Project Saat Ini

Project sudah punya fondasi yang bisa dipakai:

- Purchase Document sudah tersedia di `src/services/purchaseDocumentService.ts`.
- Purchase Receipt sudah menambah stok dan membuat FIFO lot lewat `addInventoryLot()`.
- POS checkout sudah mengambil HPP dari FIFO lot lewat `consumeFifoLots()`.
- Tipe `PurchaseDocument`, `PurchaseDocumentItem`, `TransactionItem`, dan `InventoryLot` ada di `src/types/index.ts`.
- Dexie schema terakhir saat dokumen ini dibuat sudah sampai `version(45)`, jadi migrasi baru memakai `version(46)` atau versi berikutnya jika sudah ada migrasi baru.
- Backup/restore saat ini membawa purchase document dan transaction, tetapi belum membawa `inventoryLots`. Ini wajib diperbaiki karena FIFO cost bergantung ke table tersebut.

Kesimpulan teknis: fitur ini sebaiknya memperluas alur Purchase Receipt dan FIFO inventory lot, bukan membuat stok pending di jalur terpisah.

## Prinsip Implementasi

- Jangan membuat stok masuk tanpa jejak harga.
- Jika harga final belum ada, wajib ada status cost: `ESTIMATED` atau `PENDING`.
- Jangan memakai HPP 0 untuk barang yang sebenarnya belum diketahui harga belinya.
- Jika barang harga pending dijual, transaksi harus menyimpan bahwa HPP dan profit masih estimasi.
- Rekonsiliasi harga final harus bisa menghitung ulang dampak ke transaksi yang sudah memakai lot tersebut.
- Selisih harga final harus dipisahkan antara stok yang masih tersisa dan stok yang sudah terjual.
- Biaya tambahan pembelian seperti ongkir, diskon supplier, pajak, dan biaya admin harus punya aturan apakah masuk HPP atau biaya operasional.
- Selisih qty antara surat jalan dan invoice supplier harus ditangani eksplisit, tidak boleh diam-diam mengubah stok.
- Jangan mengubah flow POS secara besar-besaran. Tambahkan proteksi dan metadata di titik checkout.
- Jangan mengubah `Product.purchase_price` menjadi harga estimasi tanpa konteks. Harga master boleh dijadikan fallback, tetapi status lot tetap harus jelas.

## Definisi Status Cost

Tambahkan tipe:

```ts
export type PurchaseCostStatus =
  | 'FINAL'
  | 'ESTIMATED'
  | 'PENDING';

export type PurchaseCostEstimateSource =
  | 'LAST_PURCHASE_PRICE'
  | 'PRODUCT_PURCHASE_PRICE'
  | 'MANUAL'
  | 'UNKNOWN';

export type PurchaseAdditionalCostTreatment =
  | 'INVENTORY_COST'
  | 'OPERATING_EXPENSE'
  | 'IGNORE_FOR_MVP';
```

Makna status:

- `FINAL`: harga beli sudah benar dari invoice supplier.
- `ESTIMATED`: harga belum final, tetapi sistem punya angka estimasi yang boleh dipakai sementara.
- `PENDING`: harga belum final dan belum ada estimasi aman. Barang sebaiknya tidak boleh dijual.

Rekomendasi MVP: saat issue Purchase Receipt, jangan izinkan lot `PENDING` tanpa estimasi. Jika tidak ada harga final, pakai `ESTIMATED` dengan sumber yang jelas.

## Terminologi UI

Gunakan istilah user-facing yang mudah dipahami operator toko:

| Teknis | Label UI | Makna |
| --- | --- | --- |
| `FINAL` | Harga Final | Harga beli sudah sesuai invoice supplier. |
| `ESTIMATED` | Harga Sementara | Harga beli masih estimasi, tetapi cukup aman dipakai sementara. |
| `PENDING` | Belum Ada Harga | Harga belum diketahui dan barang tidak boleh dijual. |

Di kode tetap gunakan enum teknis agar konsisten dengan data model.

## Perubahan Data Model

### 1. `PurchaseDocument`

Tambahkan field:

```ts
cost_status?: PurchaseCostStatus;
delivery_note_number?: string;
delivery_note_date?: string;
supplier_invoice_number?: string;
supplier_invoice_date?: string;
additional_cost_treatment?: PurchaseAdditionalCostTreatment;
additional_cost_amount?: number;
supplier_discount_amount?: number;
supplier_tax_amount?: number;
cost_finalized_at?: string;
cost_finalized_by?: string;
cost_finalized_by_name?: string;
```

Catatan:

- `delivery_note_number` dipakai untuk nomor surat jalan supplier.
- `cost_status` di header adalah ringkasan. Jika ada satu item belum final, header ikut `ESTIMATED` atau `PENDING`.
- `supplier_invoice_number` dan `supplier_invoice_date` diisi saat rekonsiliasi harga final.
- `additional_cost_treatment` menentukan apakah biaya tambahan seperti ongkir masuk HPP atau dicatat sebagai biaya operasional.

### 2. `PurchaseDocumentItem`

Tambahkan field:

```ts
cost_status?: PurchaseCostStatus;
estimate_source?: PurchaseCostEstimateSource;
estimated_price?: number;
final_price?: number;
invoiced_quantity?: number;
quantity_variance?: number;
additional_cost_allocation?: number;
supplier_discount_allocation?: number;
supplier_tax_allocation?: number;
final_landed_cost_per_unit?: number;
cost_finalized_at?: string;
cost_variance_amount?: number;
```

Catatan:

- `price` tetap boleh dipakai untuk angka aktif di dokumen.
- Saat harga belum final, `price` berisi estimasi agar kalkulasi dokumen tetap jalan.
- `final_price` diisi saat invoice supplier datang.
- `invoiced_quantity` dipakai jika qty di invoice berbeda dari qty surat jalan.
- `additional_cost_allocation`, `supplier_discount_allocation`, dan `supplier_tax_allocation` dipakai jika biaya/diskon/pajak supplier dialokasikan ke HPP.
- `final_landed_cost_per_unit` adalah HPP final per unit setelah alokasi biaya tambahan.
- `cost_variance_amount = final_landed_cost_per_unit - estimated_price` jika landed cost dipakai, atau `final_price - estimated_price` jika tidak.

### 3. `InventoryLot`

Tambahkan field:

```ts
cost_status?: PurchaseCostStatus;
estimate_source?: PurchaseCostEstimateSource;
estimated_cost_per_unit?: number;
final_cost_per_unit?: number;
cost_finalized_at?: string;
cost_reconciliation_id?: string;
```

Catatan:

- `cost_per_unit` tetap menjadi cost aktif untuk FIFO.
- Saat status `ESTIMATED`, `cost_per_unit` berisi estimasi.
- Saat rekonsiliasi, `cost_per_unit` di-update ke harga final.
- Jika ada biaya tambahan yang masuk HPP, `cost_per_unit` di-update ke landed cost final.

### 4. Table Baru `purchaseCostReconciliations`

Tambahkan table audit rekonsiliasi harga. Ini bukan module baru, hanya catatan finalisasi harga untuk Purchase Receipt.

```ts
export interface PurchaseCostReconciliation {
  id: string;
  purchase_document_id: string;
  purchase_document_number: string;
  supplier_invoice_number?: string;
  supplier_invoice_date?: string;
  additional_cost_treatment: PurchaseAdditionalCostTreatment;
  additional_cost_amount: number;
  supplier_discount_amount: number;
  supplier_tax_amount: number;
  total_estimated_cost: number;
  total_final_cost: number;
  total_variance_amount: number;
  sold_cost_variance_amount: number;
  remaining_stock_variance_amount: number;
  notes?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}
```

Field penting:

- `sold_cost_variance_amount`: selisih HPP untuk barang yang sudah terjual.
- `remaining_stock_variance_amount`: selisih nilai persediaan untuk stok yang masih tersisa.
- Kedua angka ini perlu dipisah agar laporan profit dan nilai persediaan tidak tercampur.

### 5. Table Baru `purchaseCostReconciliationItems`

Tambahkan detail per item rekonsiliasi.

```ts
export interface PurchaseCostReconciliationItem {
  id: string;
  reconciliation_id: string;
  purchase_document_item_id: string;
  product_id: string;
  product_name: string;
  received_quantity: number;
  invoiced_quantity: number;
  quantity_variance: number;
  sold_quantity_at_reconciliation: number;
  remaining_quantity_at_reconciliation: number;
  estimated_price: number;
  final_price: number;
  additional_cost_allocation: number;
  supplier_discount_allocation: number;
  supplier_tax_allocation: number;
  final_landed_cost_per_unit: number;
  variance_per_unit: number;
  sold_cost_variance_amount: number;
  remaining_stock_variance_amount: number;
  created_at: string;
}
```

### 6. Table Baru `inventoryLotConsumptions`

Tambahkan table untuk melacak lot mana yang dipakai oleh transaksi penjualan.

```ts
export type InventoryLotConsumptionSourceType =
  | 'POS_TRANSACTION'
  | 'SALES_DELIVERY';

export interface InventoryLotConsumption {
  id: string;
  lot_id: string;
  product_id: string;
  product_name: string;
  source_type: InventoryLotConsumptionSourceType;
  source_id: string;
  source_line_id: string;
  quantity: number;
  cost_per_unit_at_consumption: number;
  cost_status_at_consumption: PurchaseCostStatus;
  created_at: string;
}
```

Kenapa table ini penting:

- Saat invoice supplier datang, sistem bisa tahu transaksi mana saja yang sudah memakai lot estimasi.
- Tanpa table ini, rekonsiliasi transaksi lama akan sulit dan rawan salah.
- Satu transaksi bisa mengambil stok dari beberapa lot sekaligus. Karena itu status HPP item bisa `ESTIMATED` walaupun sebagian quantity berasal dari lot `FINAL`.

### 7. `TransactionItem`

Tambahkan field:

```ts
hpp_status?: PurchaseCostStatus;
hpp_reconciled_at?: string;
hpp_variance_amount?: number;
profit_status?: 'FINAL' | 'ESTIMATED' | 'RECONCILED';
```

Catatan:

- Jika transaksi menjual lot estimasi, `hpp_status = 'ESTIMATED'`.
- Setelah harga final masuk dan transaksi dikoreksi, `profit_status = 'RECONCILED'`.

## Perubahan Dexie

Update `src/lib/db.ts`.

1. Tambah import type baru jika dibutuhkan.
2. Tambah property table:

```ts
inventoryLotConsumptions!: Table<InventoryLotConsumption>;
purchaseCostReconciliations!: Table<PurchaseCostReconciliation>;
purchaseCostReconciliationItems!: Table<PurchaseCostReconciliationItem>;
```

3. Tambah schema versi baru:

```ts
this.version(46).stores({
  purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, cost_status, sync_status, updated_at, created_at',
  purchaseDocumentItems: 'id, document_id, product_id, cost_status',
  inventoryLots: 'id, product_id, quantity_remaining, cost_status, received_at, source_type, source_id, source_line_id, created_at',
  inventoryLotConsumptions: 'id, lot_id, product_id, source_type, source_id, source_line_id, created_at',
  purchaseCostReconciliations: 'id, purchase_document_id, supplier_invoice_number, created_at',
  purchaseCostReconciliationItems: 'id, reconciliation_id, purchase_document_item_id, product_id',
  transactionItems: 'id, transaction_id, product_id, hpp_status, created_at'
}).upgrade(async (tx) => {
  const lots = await tx.table<InventoryLot, string>('inventoryLots').toArray();
  const migratedLots = lots
    .filter((lot) => !lot.cost_status)
    .map((lot) => ({
      ...lot,
      cost_status: 'FINAL' as const,
      final_cost_per_unit: lot.cost_per_unit,
    }));

  if (migratedLots.length > 0) {
    await tx.table<InventoryLot, string>('inventoryLots').bulkPut(migratedLots);
  }
});
```

Sesuaikan nomor version jika schema terbaru sudah melewati `46`.

## Fase 1 - Harga Pending di Purchase Receipt

Update file:

```txt
src/types/index.ts
src/configs/purchase-document/index.ts
src/configs/purchase-document/purchaseReceipt.config.ts
src/components/purchase-document/PurchaseDocumentForm.tsx
src/components/purchase-document/PurchaseDocumentLineItems.tsx
src/services/purchaseDocumentService.ts
src/utils/purchaseDocuments/validatePurchaseDocument.ts
src/i18n/messages.ts
```

Langkah:

1. Tambah field header `delivery_note_number` untuk Purchase Receipt.
2. Tambah field cost status di Purchase Receipt:
   - pilihan `Harga Final`
   - pilihan `Harga Sementara`
   - pilihan `Belum Ada Harga`
3. Jika user memilih `Harga Sementara`, setiap line item wajib punya `price > 0`.
4. Jika user memilih `Belum Ada Harga`, dokumen boleh disimpan sebagai draft, tetapi tidak boleh di-issue menjadi stok jual sampai ada estimasi.
5. Tambahkan helper untuk menentukan estimasi:

```txt
src/utils/purchaseDocuments/resolveEstimatedPurchaseCost.ts
```

Prioritas estimasi:

1. Harga dari Purchase Order sumber jika ada.
2. Harga beli terakhir produk dari purchase receipt/invoice yang final.
3. `Product.purchase_price`.
4. Input manual user.

6. Saat create/update Purchase Receipt, simpan:
   - `cost_status`
   - `estimate_source`
   - `estimated_price`
7. Saat issue Purchase Receipt, `addReceiptStock()` harus meneruskan metadata cost ke `addInventoryLot()`.
8. Purchase Receipt yang sudah `ISSUED` dan masih `Harga Sementara` tidak boleh diedit langsung. Perubahan harga final harus lewat action `Rekonsiliasi Harga`.

Contoh perubahan `addInventoryLot()`:

```ts
await addInventoryLot({
  productId: product.id,
  productName: product.name,
  sku: product.sku,
  sourceType: 'PURCHASE_RECEIPT',
  sourceId: document.id,
  sourceLineId: item.id,
  quantityReceived: quantityInStockUnit,
  costPerUnit: itemCostPerUnit,
  costStatus: item.cost_status ?? document.cost_status ?? 'FINAL',
  estimateSource: item.estimate_source,
  receivedAt: occurredAt,
});
```

## Fase 2 - Proteksi POS Saat Menjual Lot Estimasi

Update file:

```txt
src/utils/inventory/consumeFifoLots.ts
src/services/checkoutService.ts
src/view/Transaction.tsx
src/hooks/useTransaction.tsx
src/i18n/messages.ts
```

Langkah:

1. Perluas return `consumeFifoLots()` agar `consumedLots` membawa:
   - `lotId`
   - `quantityConsumed`
   - `costPerUnit`
   - `costStatus`
2. Tambahkan opsi agar `consumeFifoLots()` bisa mencatat consumption:

```ts
consumeFifoLots(productId, quantityNeeded, {
  sourceType: 'POS_TRANSACTION',
  sourceId: transaction.id,
  sourceLineId: transactionItem.id,
});
```

3. Di `checkoutService.ts`, tentukan status HPP item:

```ts
const hasEstimatedCost = fifoResult.consumedLots.some(
  (lot) => lot.costStatus !== 'FINAL',
);
```

4. Simpan ke `TransactionItem`:

```ts
hpp_status: hasEstimatedCost ? 'ESTIMATED' : 'FINAL',
profit_status: hasEstimatedCost ? 'ESTIMATED' : 'FINAL',
```

5. Proteksi checkout:
   - Jika ada lot `PENDING`, blokir transaksi.
   - Jika ada lot `ESTIMATED`, tampilkan warning.
   - Jika margin estimasi di bawah batas aman, minta approval admin/owner atau blokir.
6. Tangani mixed lot:
   - Satu item POS bisa mengambil sebagian qty dari lot `FINAL` dan sebagian dari lot `ESTIMATED`.
   - `TransactionItem.hpp_status` harus menjadi `ESTIMATED` jika ada satu saja consumed lot yang belum final.
   - Detail lot tetap disimpan di `inventoryLotConsumptions` agar rekonsiliasi bisa menghitung porsi yang terdampak.

Rekomendasi MVP:

- `PENDING`: tidak boleh dijual.
- `ESTIMATED`: boleh dijual jika produk punya harga jual aktif dan estimasi margin tidak negatif.
- Harga jual kosong atau 0: blokir.

## Fase 3 - Rekonsiliasi Harga Final

Tambahkan service pendukung untuk Purchase Receipt existing:

```txt
src/services/purchaseCostReconciliationService.ts
src/hooks/usePurchaseCostReconciliation.tsx
src/view/finance/purchases/PurchaseReceiptCostReconciliation.tsx
```

UI rekonsiliasi bisa dibuka dari action/detail Purchase Receipt. Route khusus boleh ditambahkan hanya sebagai child di area purchases, misalnya:

```txt
src/routes/finance/purchases/$documentType/$documentId/reconcile.lazy.tsx
```

Fungsi service yang disarankan:

```ts
export const listPendingPurchaseCosts = async () => {};
export const reconcilePurchaseReceiptCost = async (input: {
  purchaseDocumentId: string;
  supplierInvoiceNumber?: string;
  supplierInvoiceDate?: string;
  additionalCostTreatment: PurchaseAdditionalCostTreatment;
  additionalCostAmount?: number;
  supplierDiscountAmount?: number;
  supplierTaxAmount?: number;
  items: Array<{
    purchaseDocumentItemId: string;
    invoicedQuantity: number;
    finalPrice: number;
    additionalCostAllocation?: number;
    supplierDiscountAllocation?: number;
    supplierTaxAllocation?: number;
  }>;
}) => {};
```

Langkah rekonsiliasi:

1. Ambil Purchase Receipt dan item yang masih `ESTIMATED` atau `PENDING`.
2. User input nomor invoice supplier, tanggal invoice, harga final per item, dan qty invoice.
3. User tentukan perlakuan biaya tambahan:
   - masuk HPP persediaan,
   - jadi biaya operasional,
   - atau diabaikan untuk MVP.
4. Jika biaya tambahan masuk HPP, alokasikan ke item. Default alokasi disarankan berdasarkan nilai barang, bukan qty, agar lebih adil untuk item berbeda harga.
5. Jika invoice punya diskon supplier atau pajak, alokasikan sesuai aturan yang sama.
6. Validasi selisih qty:
   - Jika `invoiced_quantity` sama dengan qty diterima, lanjut normal.
   - Jika invoice lebih kecil dari surat jalan, tampilkan opsi koreksi: retur supplier, stok adjustment, atau catat variance pending.
   - Jika invoice lebih besar dari surat jalan, blokir rekonsiliasi sampai penerimaan fisik tambahan dicatat.
   - MVP disarankan hanya mengizinkan qty invoice sama dengan qty diterima, lalu qty variance ditunda ke fase berikutnya.
7. Buat record `purchaseCostReconciliations` dan `purchaseCostReconciliationItems` sebagai audit trail.
8. Update `purchaseDocumentItems`:
   - `final_price`
   - `invoiced_quantity`
   - `quantity_variance`
   - `additional_cost_allocation`
   - `supplier_discount_allocation`
   - `supplier_tax_allocation`
   - `final_landed_cost_per_unit`
   - `cost_status = 'FINAL'`
   - `cost_finalized_at`
   - `cost_variance_amount`
9. Update `purchaseDocuments`:
   - `supplier_invoice_number`
   - `supplier_invoice_date`
   - `additional_cost_treatment`
   - `additional_cost_amount`
   - `supplier_discount_amount`
   - `supplier_tax_amount`
   - `cost_status = 'FINAL'` jika semua item final.
   - `cost_finalized_at`
   - `cost_finalized_by`
10. Update `inventoryLots` berdasarkan `source_id` dan `source_line_id`:
   - `final_cost_per_unit`
   - `cost_per_unit`
   - `cost_status = 'FINAL'`
   - `cost_finalized_at`
11. Pisahkan dampak selisih:
   - `remaining_stock_variance_amount` untuk qty lot yang masih tersisa.
   - `sold_cost_variance_amount` untuk qty yang sudah dikonsumsi transaksi.
12. Cari `inventoryLotConsumptions` untuk lot tersebut.
13. Untuk consumption yang sudah masuk POS, hitung ulang HPP dan profit item transaksi berdasarkan porsi lot yang terpakai.
14. Update `transactionItems`:
   - `purchase_price`
   - `profit`
   - `hpp_status = 'FINAL'`
   - `profit_status = 'RECONCILED'`
   - `hpp_variance_amount`
   - `hpp_reconciled_at`
15. Rebuild atau adjust `profitLogs` dan `profitBalance`.
16. Tulis `activityLogs` dengan ringkasan jumlah item, total variance, dan user yang melakukan rekonsiliasi.

Rekomendasi teknis untuk profit:

- Untuk MVP, buat fungsi replay profit khusus POS setelah rekonsiliasi.
- Jangan hanya menambah log selisih tanpa memastikan `profitBalance` tetap konsisten.
- Jika sudah ada pola di `src/services/profitService.ts`, reuse pola recalculation.

Catatan akuntansi:

- Jika General Ledger belum aktif, MVP cukup koreksi laporan profit dan inventory lot.
- Jika General Ledger aktif, selisih HPP untuk barang yang sudah terjual perlu jurnal penyesuaian HPP.
- Selisih untuk stok tersisa perlu menyesuaikan nilai persediaan.
- Jika biaya tambahan dipilih sebagai biaya operasional, catat ke expense dan jangan menaikkan HPP inventory.

## Edge Case Wajib Ditutup

### 1. Stok Sudah Terjual vs Masih Tersisa

Saat harga final lebih tinggi atau lebih rendah dari estimasi, jangan koreksi sebagai satu angka global.

Pisahkan:

- Qty yang sudah terjual: koreksi HPP/profit transaksi.
- Qty yang masih ada di lot: koreksi nilai inventory lot.

Contoh:

```txt
Qty diterima: 10 pcs
Qty sudah terjual: 4 pcs
Qty tersisa: 6 pcs
Estimasi HPP: 10.000
Final HPP: 12.000
Selisih per pcs: 2.000

Selisih barang terjual: 4 x 2.000 = 8.000
Selisih stok tersisa: 6 x 2.000 = 12.000
```

### 2. Biaya Tambahan Pembelian

Invoice supplier bisa memiliki biaya tambahan:

- Ongkir.
- Biaya packing.
- Biaya admin.
- Pajak supplier.
- Diskon supplier.

Aturan MVP:

- Jika biaya dipilih `INVENTORY_COST`, alokasikan ke item dan naikkan `final_landed_cost_per_unit`.
- Jika biaya dipilih `OPERATING_EXPENSE`, jangan ubah HPP barang.
- Jika diskon supplier dialokasikan ke HPP, kurangi landed cost per item.
- Default alokasi biaya tambahan berdasarkan nilai barang final sebelum biaya tambahan.

### 3. Qty Invoice Berbeda Dari Surat Jalan

MVP paling aman: rekonsiliasi hanya boleh diposting jika qty invoice sama dengan qty yang diterima.

Fase lanjutan:

- Invoice lebih kecil dari surat jalan: buat purchase return atau stock adjustment untuk selisih.
- Invoice lebih besar dari surat jalan: minta penerimaan tambahan sebelum rekonsiliasi.
- Barang bonus: catat sebagai line terpisah dengan harga 0 dan status final jika memang bonus resmi.

### 4. Retur Pembelian Sebelum Harga Final

Jika barang harga sementara sudah diretur ke supplier sebelum invoice datang:

- `purchaseCostReconciliationItems` harus menyimpan qty yang sudah diretur.
- Qty retur tidak boleh ikut dihitung sebagai stok tersisa.
- Jika retur memakai HPP estimasi, retur juga perlu dikoreksi saat harga final datang.

MVP boleh membatasi:

- Purchase Receipt harga sementara tidak bisa diretur sampai harga final, atau
- Retur boleh dilakukan, tetapi rekonsiliasi wajib menghitung qty retur sebagai consumption non-sales.

### 5. Void Transaksi Setelah Rekonsiliasi

Jika transaksi POS sudah direkonsiliasi lalu di-void:

- Lot yang dikembalikan harus memakai HPP final, bukan estimasi lama.
- `TransactionItem.profit_status` tetap menjadi referensi audit bahwa transaksi pernah direkonsiliasi.
- Profit reversal harus memakai profit final.

### 6. Void Rekonsiliasi

Untuk MVP, rekonsiliasi yang sudah diposting sebaiknya tidak bisa di-void dari UI biasa.

Jika nanti perlu void:

- Buat reversal reconciliation, jangan menghapus record lama.
- Kembalikan `inventoryLots.cost_per_unit` ke estimasi sebelumnya hanya jika belum ada transaksi baru setelah rekonsiliasi.
- Jika sudah ada transaksi baru, wajib buat adjustment baru.

### 7. Mixed Lot

Satu item penjualan bisa mengambil beberapa lot:

```txt
2 pcs dari lot final
3 pcs dari lot estimasi
```

Maka:

- `TransactionItem.hpp_status = 'ESTIMATED'`.
- `inventoryLotConsumptions` menyimpan dua baris consumption.
- Rekonsiliasi hanya mengubah porsi 3 pcs dari lot estimasi.

## Fase 4 - Dashboard Harga Belum Final

Tambahkan halaman:

```txt
src/view/finance/purchases/PendingPurchaseCosts.tsx
src/routes/finance/purchases/pending-costs.lazy.tsx
```

Kolom yang perlu ditampilkan:

- Tanggal terima.
- Nomor Purchase Receipt.
- Nomor surat jalan.
- Nomor invoice supplier jika sudah mulai direkonsiliasi.
- Supplier.
- Produk.
- Qty diterima.
- Qty tersisa di lot.
- Qty sudah terjual.
- Qty sudah diretur.
- Harga estimasi.
- Harga final jika sebagian item sudah final.
- Selisih estimasi vs final.
- Sumber estimasi.
- Umur pending.
- Status risiko.

Filter:

- Supplier.
- Tanggal terima.
- Status cost.
- Produk.
- Hanya yang sudah terjual.

Action:

- Buka dokumen Purchase Receipt.
- Rekonsiliasi harga final.
- Lihat transaksi yang sudah memakai lot estimasi.
- Export daftar pending.

## Fase 5 - Approval dan Risk Rule

Tambahkan permission baru jika ingin approval lebih rapi:

```ts
PENDING_COST_SALE_APPROVE
PURCHASE_COST_RECONCILE
```

Update:

```txt
src/types/index.ts
src/auth/roleSeed.ts
src/auth/routePermissions.ts
src/auth/authService.ts
src/i18n/messages.ts
```

Rule yang disarankan:

- Kasir boleh menjual barang `ESTIMATED` jika harga jual aktif dan margin estimasi aman.
- Kasir tidak boleh menjual barang `PENDING`.
- Admin/Owner bisa override barang `ESTIMATED` dengan alasan.
- Owner saja yang boleh rekonsiliasi harga final.
- Margin estimasi negatif sebaiknya diblokir untuk semua role kecuali Owner.

Setting yang bisa ditambahkan belakangan:

```txt
minimum_estimated_margin_percent
block_pending_cost_sales
require_approval_for_estimated_cost_sales
```

MVP cukup hardcode rule dulu di service checkout, lalu pindahkan ke setting saat dibutuhkan.

## Fase 6 - Backup, Restore, dan Sync

Update `src/utils/backupRestore.ts`.

Wajib tambahkan:

```txt
inventoryLots
inventoryLotConsumptions
purchaseCostReconciliations
purchaseCostReconciliationItems
```

Langkah:

1. Tambahkan ke payload backup.
2. Tambahkan ke `expectedKeys`.
3. Tambahkan ke daftar table transaksi restore.
4. Clear sebelum import.
5. Bulk add saat import.
6. Naikkan `version` backup.

Jika sync Postgres dipakai, update juga:

```txt
src/services/postgresAdapter.ts
src/services/syncQueueService.ts
src/services/syncOrchestratorService.ts
```

Minimal sync-aware fields:

- `purchaseDocuments.cost_status`
- `purchaseDocumentItems.cost_status`
- `inventoryLots.cost_status`
- `inventoryLotConsumptions`
- `purchaseCostReconciliations`
- `purchaseCostReconciliationItems`
- `transactionItems.hpp_status`

## Fase 7 - Laporan

Update laporan yang menampilkan profit:

```txt
src/view/PosSalesReport.tsx
src/view/TransactionDetailReport.tsx
src/hooks/useReports.tsx
src/view/History.tsx
```

Tampilkan penanda:

- Profit final.
- Profit estimasi.
- Profit sudah direkonsiliasi.
- Total variance HPP dari rekonsiliasi.
- Filter transaksi yang profitnya masih estimasi.

Jangan gabungkan profit estimasi dan final tanpa penanda. Minimal tampilkan tag atau filter agar owner tahu angka laporan masih bisa berubah.

Jika General Ledger aktif, laporan perlu membedakan:

- Koreksi HPP untuk barang sudah terjual.
- Koreksi nilai persediaan untuk stok tersisa.
- Biaya tambahan yang dicatat sebagai expense operasional.

## Flow Akhir Yang Diharapkan

### Barang Datang Tanpa Harga Final

1. Admin buka Purchase Receipt.
2. Input supplier dan nomor surat jalan.
3. Input produk dan qty diterima.
4. Pilih status `Harga Sementara`.
5. Sistem mengisi harga estimasi dari harga terakhir atau master produk.
6. Admin issue Purchase Receipt.
7. Stok bertambah.
8. FIFO lot dibuat dengan `cost_status = 'ESTIMATED'`.

### Barang Langsung Terjual

1. Kasir pilih produk di POS.
2. Sistem mendeteksi stok FIFO yang dipakai masih estimasi.
3. Checkout menampilkan warning.
4. Jika rule aman, transaksi jalan.
5. Transaction item menyimpan `hpp_status = 'ESTIMATED'`.
6. Profit transaksi ditandai estimasi.

### Invoice Supplier Datang

1. Owner/Admin buka Rekonsiliasi HPP.
2. Pilih Purchase Receipt berdasarkan supplier atau nomor surat jalan.
3. Input nomor invoice supplier, tanggal invoice, qty invoice, dan harga final.
4. Input biaya tambahan, diskon supplier, dan pajak jika ada.
5. Pilih perlakuan biaya tambahan: masuk HPP atau biaya operasional.
6. Sistem validasi qty invoice vs qty surat jalan.
7. Sistem update lot FIFO ke harga final atau landed cost final.
8. Sistem pisahkan selisih untuk stok tersisa dan barang yang sudah terjual.
9. Sistem hitung ulang transaksi yang sudah memakai lot tersebut.
10. Profit berubah dari estimasi menjadi final/reconciled.
11. Dashboard pending bersih dari item tersebut.

## Acceptance Criteria MVP

- Purchase Receipt bisa disimpan dengan status `Harga Sementara`.
- Purchase Receipt menyimpan nomor surat jalan.
- Issue Purchase Receipt membuat inventory lot dengan status cost.
- POS tidak memakai HPP 0 untuk barang yang harga finalnya belum ada.
- POS memberi warning saat menjual barang dengan HPP estimasi.
- Transaction item menyimpan status HPP.
- Mixed lot final dan estimasi ditandai sebagai transaksi dengan HPP estimasi.
- Ada halaman daftar barang harga belum final.
- Admin bisa input harga final.
- Admin bisa input nomor invoice supplier.
- Rekonsiliasi MVP memblokir qty invoice yang berbeda dari qty diterima.
- Rekonsiliasi bisa memisahkan selisih stok tersisa dan stok yang sudah terjual.
- Rekonsiliasi menyimpan audit trail harga estimasi, harga final, user, waktu, dan variance.
- Rekonsiliasi mengubah lot dan transaksi yang sudah terjual.
- Backup/restore membawa `inventoryLots` dan consumption history.
- Backup/restore membawa audit rekonsiliasi.

## Urutan Implementasi Yang Disarankan

1. Tambah tipe dan migrasi Dexie.
2. Tambah field harga pending di Purchase Receipt existing.
3. Tambah table audit `purchaseCostReconciliations` dan `purchaseCostReconciliationItems`.
4. Update `addInventoryLot()` dan `addReceiptStock()`.
5. Update `consumeFifoLots()` agar membawa metadata cost dan mencatat consumption.
6. Update checkout POS untuk warning/blocking, mixed lot, dan status HPP transaksi.
7. Buat view pending cost sederhana di area Purchases.
8. Buat action/service rekonsiliasi harga final dari Purchase Receipt.
9. Tambah validasi biaya tambahan dan qty invoice untuk rekonsiliasi.
10. Update laporan profit agar membedakan estimasi vs final.
11. Update backup/restore.
12. Tambah permission dan approval rule jika MVP sudah stabil.

## Catatan Implementasi Penting

- Rekonsiliasi harus berjalan dalam Dexie transaction yang melibatkan:
  - `purchaseDocuments`
  - `purchaseDocumentItems`
  - `inventoryLots`
  - `inventoryLotConsumptions`
  - `purchaseCostReconciliations`
  - `purchaseCostReconciliationItems`
  - `transactionItems`
  - `transactions`
  - `profitLogs`
  - `profitBalance`
  - `activityLogs`
- Jangan menghapus history estimasi. Simpan `estimated_price`, `final_price`, dan variance.
- Jangan update semua `Product.purchase_price` otomatis dari estimasi. Update master product hanya setelah harga final jika memang diinginkan.
- Jangan hapus record rekonsiliasi saat ada koreksi. Buat reversal atau adjustment baru.
- Jika qty invoice berbeda dari surat jalan, jangan ubah stok diam-diam dari rekonsiliasi harga.
- Jika General Ledger aktif, pastikan adjustment HPP dan persediaan punya jurnal yang jelas.
- Jika ada Sales Document yang juga mengonsumsi FIFO, perlakuan yang sama perlu diterapkan ke `salesDocumentItems` pada fase lanjutan.
- Untuk fase awal, fokus ke POS transaction karena problem "langsung laku" paling sering terjadi di kasir.
