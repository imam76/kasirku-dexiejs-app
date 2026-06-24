# Sales Return - Spesifikasi Bisnis dan Akuntansi

Dokumen ini adalah panduan implementasi Sales Return untuk project Frayukti. Targetnya: retur penjualan bisa dicatat dengan benar tanpa mengubah makna `void`, tanpa merusak flow POS existing, dan tetap mengikuti struktur project saat ini.

## Audit Kondisi Project Saat Ini

Yang sudah ada:
- POS checkout disimpan lewat `src/services/checkoutService.ts` ke table `transactions` dan `transactionItems`.
- Void POS ada di `src/services/transactionVoidService.ts`; efeknya membatalkan transaksi penuh, mengembalikan stok, membalik finance, dan membalik profit.
- Finance > Sales Document sudah punya `salesDocuments` dan `salesDocumentItems` untuk quotation, order, delivery, dan invoice.
- Sales Delivery yang `ISSUED` mengurangi stok; void delivery mengembalikan stok.
- Sales Invoice payment menulis cash flow lewat category `PEMBAYARAN_INVOICE_PENJUALAN`.
- Backup/restore sudah membawa `salesDocuments` dan `salesDocumentItems`.

Yang belum ada:
- Belum ada table `salesReturns` atau `salesReturnItems`.
- Belum ada flow retur parsial per item.
- Belum ada refund/credit note yang terhubung ke invoice, delivery, atau transaksi POS asal.
- Belum ada laporan net sales yang memisahkan gross sales, return, dan net sales.

Kesimpulan: Sales Return harus dibuat sebagai flow baru. Jangan menjadikan retur sebagai `void`, karena void berarti pembatalan transaksi/dokumen, sedangkan return adalah kejadian bisnis baru setelah penjualan/delivery sudah sah.

## Prinsip Bisnis

- Transaksi/dokumen asal tetap tersimpan sebagai histori asli.
- Return dibuat sebagai dokumen baru yang mereferensikan sumbernya.
- Return boleh parsial: tidak harus seluruh transaksi/invoice.
- Quantity retur tidak boleh melebihi quantity sumber dikurangi retur lain yang sudah `ISSUED`.
- Stok hanya kembali jika kondisi barang memang layak stok.
- Refund kas/bank dan pengembalian stok adalah dua efek berbeda.
- Credit note mengurangi kewajiban bayar customer, tetapi tidak otomatis mengeluarkan kas.
- Return tidak boleh tampil sebagai expense operasional biasa di laporan profit.

## Batasan Scope Awal

Fase awal fokus ke Sales Return untuk:
- `SALES_DELIVERY` yang sudah `ISSUED`, untuk kasus barang sudah diterima lalu dikembalikan.
- `SALES_INVOICE` yang sudah `ISSUED`, baik unpaid, partial paid, maupun paid.
- POS transaction dari History bisa masuk fase berikutnya setelah flow Sales Document stabil.

Alasan: struktur Finance > Sales sudah punya customer, source document, invoice payment, dan delivery stock effect. POS return perlu perlakuan receipt/history tambahan, jadi lebih aman dibuat setelah core Sales Return stabil.

## Keputusan Arsitektur

Gunakan table dan service baru:
- `salesReturns`
- `salesReturnItems`
- `salesReturnService.ts`

Jangan menambah `SALES_RETURN` ke `SalesDocumentType` pada fase awal. Walaupun Sales Return adalah dokumen bisnis, efeknya berbeda dari quotation/order/delivery/invoice:
- arah stok bisa masuk, bukan keluar;
- finance bisa refund cash, credit note, atau tidak ada cash movement;
- profit harus dikoreksi sebagai kontra sales, bukan income/expense biasa;
- validasinya perlu membaca return terdahulu untuk mencegah over-return.

Dengan table terpisah, `salesDocumentService.ts` tetap fokus pada lifecycle sales document yang sudah ada. Sales Return tetap berada di area Finance > Sales lewat route dan view, bukan dicampur ke master data.

## Struktur File Yang Disarankan

Tambahkan file di bawah struktur existing:

```txt
src/components/sales-return/
  SalesReturnForm.tsx
  SalesReturnLineItems.tsx
  SalesReturnSummary.tsx

src/hooks/
  useSalesReturns.tsx

src/services/
  salesReturnService.ts

src/utils/salesReturns/
  calculateSalesReturnTotal.ts
  createSalesReturnNumber.ts
  createSalesReturnSnapshots.ts
  mapSalesReturnSourceItem.ts
  validateSalesReturn.ts

src/view/finance/sales/returns/
  SalesReturnsManagement.tsx
  SalesReturnEditor.tsx
  SalesReturnDetail.tsx

src/routes/finance/sales/returns/
  index.tsx
  new.lazy.tsx
  $returnId.lazy.tsx
```

Update file existing:
- `src/types/index.ts`
- `src/lib/db.ts`
- `src/constants/finance.ts`
- `src/auth/permissions.ts`
- `src/auth/routePermissions.ts`
- `src/routes/__root.tsx`
- `src/routes/finance/index.tsx` jika ingin menu return terlihat dari landing Finance
- `src/view/finance/sales/SalesDocumentDetail.tsx` untuk tombol "Buat Retur"
- `src/hooks/useReports.tsx`
- `src/services/financeService.ts`
- `src/services/profitService.ts`
- `src/utils/backupRestore.ts`
- `src/i18n/messages.ts`

Jangan edit `src/routeTree.gen.ts` manual. Biarkan generator/build TanStack Router yang memperbarui route tree.

## Data Model

Tambahkan tipe di `src/types/index.ts`.

```ts
export type SalesReturnSourceType =
  | 'SALES_DELIVERY'
  | 'SALES_INVOICE'
  | 'POS_TRANSACTION';

export type SalesReturnStatus = 'DRAFT' | 'ISSUED' | 'VOIDED';

export type SalesReturnResolution =
  | 'NO_FINANCE'
  | 'REFUND'
  | 'CREDIT_NOTE';

export type SalesReturnItemCondition =
  | 'SELLABLE'
  | 'DAMAGED'
  | 'DISCARDED';

export interface SalesReturn {
  id: string;
  return_number: string;
  status: SalesReturnStatus;
  source_type: SalesReturnSourceType;
  source_id: string;
  source_number: string;
  source_document_type?: SalesDocumentType;
  contact_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  document_date: string;
  resolution: SalesReturnResolution;
  reason?: string;
  subtotal_amount: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount: number;
  refund_amount?: number;
  credit_amount?: number;
  finance_transaction_id?: string;
  issued_at?: string;
  voided_at?: string;
  void_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface SalesReturnItem {
  id: string;
  return_id: string;
  source_item_id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  unit: ProductUnit;
  quantity: number;
  source_quantity: number;
  price: number;
  discount_amount?: number;
  tax_amount?: number;
  subtotal: number;
  total_amount: number;
  purchase_price?: number;
  profit_reversal?: number;
  condition: SalesReturnItemCondition;
  restock_quantity?: number;
  created_at: string;
}
```

Catatan:
- Semua angka return disimpan positif. Jangan simpan total negatif di table return.
- Efek kontra sales dihitung dari `SalesReturn.total_amount`.
- `profit_reversal` disimpan agar profit report dan recalculation tidak bergantung ke harga produk terbaru.
- `source_document_type` dipakai ketika source berasal dari `salesDocuments`; untuk POS transaction boleh kosong.

## Dexie Schema

`src/lib/db.ts` saat ini sudah memakai `version(17)` untuk sales document. Gunakan versi berikutnya yang tersedia saat implementasi.

Contoh jika belum ada migrasi baru:

```ts
salesReturns!: Table<SalesReturn>;
salesReturnItems!: Table<SalesReturnItem>;

this.version(18).stores({
  salesReturns: 'id, return_number, status, source_type, source_id, source_document_type, contact_id, customer_name, document_date, resolution, created_at',
  salesReturnItems: 'id, return_id, source_item_id, product_id'
});
```

Jangan menambahkan table baru ke `version(1)` dan jangan memakai ulang versi schema yang sudah ada.

## Service Layer

Buat `src/services/salesReturnService.ts`.

Service ini menjadi satu-satunya tempat untuk:
- create/update draft return;
- issue return;
- void return;
- validasi over-return;
- restorasi stok;
- refund/credit note effect;
- koreksi profit;
- activity log.

Hook dan component tidak boleh menulis langsung ke Dexie untuk efek bisnis return.

API service yang disarankan:

```ts
export const createSalesReturn = async (input: SalesReturnUpsertInput) => {};
export const updateSalesReturn = async (id: string, input: SalesReturnUpsertInput) => {};
export const issueSalesReturn = async (id: string) => {};
export const voidSalesReturn = async (id: string, reason: string) => {};
export const getReturnableSource = async (sourceType: SalesReturnSourceType, sourceId: string) => {};
export const getIssuedReturnSummaryForSource = async (sourceType: SalesReturnSourceType, sourceId: string) => {};
```

Semua mutation yang menyentuh return, stok, finance, profit, dan activity log harus berada dalam `db.transaction`.

## Validasi Return

`src/utils/salesReturns/validateSalesReturn.ts` harus pure. Jangan akses Dexie dari util ini.

Validasi minimal:
- source wajib ada.
- status source harus boleh diretur:
  - `SALES_DELIVERY`: hanya `ISSUED`.
  - `SALES_INVOICE`: hanya `ISSUED`.
  - `POS_TRANSACTION`: hanya transaksi aktif, bukan `VOIDED`.
- item return wajib ada.
- quantity return > 0.
- quantity return <= remaining returnable quantity.
- item dengan `condition='SELLABLE'` boleh restock.
- item dengan `condition='DAMAGED'` atau `DISCARDED` tidak boleh otomatis menambah stok sellable.
- `resolution='REFUND'` wajib punya `refund_amount > 0`.
- `resolution='CREDIT_NOTE'` wajib punya `credit_amount > 0`.
- `resolution='NO_FINANCE'` hanya cocok untuk delivery-only correction atau kebijakan khusus.

Remaining returnable quantity dihitung di service dengan membaca:
- source item quantity;
- semua `salesReturnItems` dari return yang statusnya `ISSUED`;
- return yang `VOIDED` tidak dihitung.

## Kalkulasi

Buat kalkulasi di `src/utils/salesReturns/calculateSalesReturnTotal.ts`.

Aturan:
- Untuk return dari Sales Invoice, nilai return memakai snapshot line invoice: price, discount, tax, purchase price.
- Untuk return dari Sales Delivery tanpa pricing, total boleh 0 dan `resolution` default `NO_FINANCE`.
- Untuk return dari POS, nilai return memakai `transactionItems.subtotal`, `transactionItems.discount_amount`, dan `transactionItems.profit`.
- Jangan membaca `Product.selling_price` untuk menentukan nilai return.
- Jangan menghitung ulang margin dari harga produk terbaru.
- Pajak dikoreksi dari snapshot tax line jika sudah tersedia; jika belum ada line-level tax, gunakan proporsi dari nilai item yang tersimpan.

## Efek Stok

Saat return `ISSUED`:
- Jika item condition `SELLABLE`, stok produk bertambah.
- Konversi unit harus memakai pola yang sudah ada, yaitu `konversiSatuanProduk(...)` ke `product.purchase_unit`.
- Jika item condition `DAMAGED` atau `DISCARDED`, stok sellable tidak bertambah.
- Jangan mengubah `stockPurchases`, karena return bukan pembelian stok.

Saat return di-void:
- Balikkan efek stok dari return tersebut.
- Jika sebelumnya item `SELLABLE` menambah stok, void return harus mengurangi stok kembali.
- Jika stok tidak cukup untuk dikurangi saat void return, service harus menolak dengan error yang jelas.

## Efek Finance

Tambahkan kategori di `src/constants/finance.ts`:

```ts
SALES_REFUND: 'REFUND_PENJUALAN'
```

Aturan:
- `REFUND` membuat `FinanceTransaction` bertipe `EXPENSE`, category `SALES_REFUND`, amount sebesar refund, dan `reference_id` ke `salesReturns.id`.
- `CREDIT_NOTE` tidak membuat cash movement langsung.
- `NO_FINANCE` tidak membuat cash movement.
- Jangan memakai `addFinanceTransaction()` mentah, karena return punya aturan profit sendiri.
- Masukkan `SALES_REFUND` ke `NON_PROFIT_FINANCE_CATEGORIES` agar refund tidak dianggap expense operasional yang mengurangi profit dua kali.

Update `src/services/financeService.ts`:
- Pastikan `recalculateFinance()` tidak menghapus `SALES_REFUND` tanpa replay.
- Jika category `SALES_REFUND` diperlakukan sebagai row manual yang tetap disimpan, jangan masukkan ke `autoCategories`.
- Cash balance dihitung dari semua finance transactions seperti sekarang, sehingga refund mengurangi cash flow.

Update Expense Report:
- Refund penjualan jangan dicampur sebagai expense operasional biasa.
- Jika tetap ditampilkan, beri section/label terpisah sebagai kontra penjualan atau refund penjualan.

## Efek Profit

Return mengoreksi profit dari item yang diretur. Jangan hanya mengurangi cash.

Untuk source POS:
- Gunakan `TransactionItem.profit` sebagai dasar proporsional.
- Jika item source quantity 10 dan return quantity 2, `profit_reversal = source_item.profit * 2 / 10`.
- Saat return `ISSUED`, kurangi `profitBalance` dan tulis `ProfitLog` category `SALES_RETURN`.
- Saat return di-void, balikkan profit reversal.

Untuk source Sales Invoice:
- Saat dokumen ini dibuat, profit Sales Invoice belum menjadi sumber utama `profitBalance`; margin Sales Invoice seharusnya dihitung di laporan Sales/Sales Document, bukan di detail dokumen SQ/SO/SD/SI.
- Karena itu fase awal jangan langsung memasukkan Sales Invoice return ke `profitBalance` kalau profit invoice belum diposting ke sana.
- Update report margin Sales Document agar invoice return mengurangi revenue dan gross profit.
- Jika nanti Sales Invoice profit diposting ke `profitBalance`, perluas `recalculateProfit()` agar membaca `salesReturns` dan `salesReturnItems`.

Untuk source Sales Delivery:
- Delivery tidak punya revenue/profit, jadi return delivery hanya mengoreksi stok.

Update `src/services/profitService.ts`:
- Tambahkan replay return POS jika POS return sudah aktif.
- Jangan menghitung `FINANCE_CATEGORIES.SALES_REFUND` sebagai operational expense.

## Invoice dan Credit Note

Jangan mengubah `SalesDocument.total_amount` asli saat return dibuat. Invoice lama harus tetap menunjukkan nilai historisnya.

Untuk invoice balance:
- Buat helper untuk menghitung issued return summary per invoice.
- Balance due tampilan = `invoice.total_amount - invoice.paid_amount - issuedReturnCreditAmount`.
- Jika invoice sudah paid dan dibuat return refund, cash refund dicatat lewat finance transaction.
- Jika invoice unpaid/partial dan dibuat credit note, tidak ada cash keluar; nilai tagihan bersih berkurang.

Tempat integrasi:
- `src/view/finance/sales/SalesDocumentDetail.tsx`: tampilkan ringkasan return/credit/refund.
- `src/services/salesDocumentService.ts`: saat record payment, validasi pembayaran tidak melebihi net invoice setelah issued return.
- `src/hooks/useSalesDocuments.tsx`: invalidasi query return jika payment/return mengubah balance tampilan.

## UI dan Route

Route baru:

```txt
/finance/sales/returns
/finance/sales/returns/new
/finance/sales/returns/$returnId
```

Entry point:
- Tombol "Buat Retur" di `SalesDocumentDetail` untuk `SALES_DELIVERY` dan `SALES_INVOICE` status `ISSUED`.
- Menu/tab "Retur" di area Finance > Sales.

Komponen:
- `SalesReturnsManagement.tsx`: list return, filter status, search source number/customer.
- `SalesReturnEditor.tsx`: pilih source, pilih item, isi quantity, condition, resolution.
- `SalesReturnDetail.tsx`: tampilkan source, item, effect stok, effect finance, activity status, dan tombol issue/void.
- `SalesReturnForm.tsx`: form reusable, tidak menulis Dexie langsung.

Jangan membuat route di root seperti `/sales-return` kecuali ada keputusan IA baru. Untuk kondisi project sekarang, return adalah bagian dari Finance > Sales.

## Hook

Buat `src/hooks/useSalesReturns.tsx`.

Hook bertugas:
- membaca list return;
- membaca source options jika dibutuhkan UI;
- memanggil mutation dari `salesReturnService`;
- invalidasi query terkait;
- menampilkan success/error message.

Hook tidak boleh:
- mengubah stok;
- membuat finance transaction;
- menulis profit log;
- menghitung over-return dengan akses Dexie langsung dari component.

Query invalidation minimal:
- `salesReturns`
- `salesDocuments`
- `transactions-history` jika POS return aktif
- `products`
- `financeBalance`
- `financeTransactions`
- `profitBalance`
- `profitLogs`
- `salesReport`
- `transactionDetailReport`

## Permission dan Activity Log

Tambahkan permission baru:

```ts
| 'SALES_RETURN_MANAGE'
```

Role awal:
- `OWNER`: boleh manage sales return.
- `ADMIN`: boleh manage sales return.
- `KASIR`: belum boleh manage return fase awal.
- `GUDANG`: belum boleh manage return fase awal, kecuali nanti dibuat flow penerimaan barang return khusus gudang.

Update:
- `src/auth/permissions.ts`
- `src/auth/routePermissions.ts`

Activity log ditulis di service:
- `SALES_RETURN_CREATED`
- `SALES_RETURN_UPDATED`
- `SALES_RETURN_ISSUED`
- `SALES_RETURN_VOIDED`

Log harus menyebut nomor return, source number, user, dan alasan.

## Backup dan Restore

Update `src/utils/backupRestore.ts`:
- export `salesReturns`;
- export `salesReturnItems`;
- tambahkan ke `expectedKeys`;
- tambahkan table ke daftar transaction restore;
- clear table saat restore;
- bulkAdd data saat payload tersedia;
- naikkan `version` payload backup jika diperlukan.

Acceptance:
- Backup lalu restore tidak menghilangkan return.
- Setelah restore, invoice/source masih bisa menampilkan ringkasan return.
- Restore tidak meninggalkan auth session aktif dari data lama.

## Report

Jangan menyembunyikan penjualan asli saat ada return. Laporan yang sehat harus bisa menjawab:
- gross sales;
- sales return;
- net sales;
- gross profit sebelum return;
- profit reversal;
- net gross profit.

Update bertahap:
1. Tambah helper query return summary, misalnya `src/utils/salesReturns/aggregateSalesReturns.ts`.
2. Update `useReports.tsx` untuk report yang memang sudah siap.
3. Sales report POS jangan langsung dicampur dengan Sales Invoice return tanpa label yang jelas.
4. Transaction detail report POS boleh menampilkan return sebagai baris/section kontra jika POS return sudah aktif.
5. Sales Document report sebaiknya terpisah dari POS report sampai kebijakan laporan gabungan disepakati.

## Fase Implementasi

### Fase 1 - Data Model dan Read Model

1. Tambah tipe Sales Return di `src/types/index.ts`.
2. Tambah table Dexie di `src/lib/db.ts` memakai versi berikutnya.
3. Tambah helper:
   - `createSalesReturnNumber.ts`
   - `createSalesReturnSnapshots.ts`
   - `mapSalesReturnSourceItem.ts`
   - `validateSalesReturn.ts`
   - `calculateSalesReturnTotal.ts`
4. Tambah backup/restore table baru.

Acceptance:
- App masih build.
- Backup/restore membawa table return.
- Helper pure tidak akses Dexie.

### Fase 2 - Service dan Hook

1. Buat `salesReturnService.ts`.
2. Implement create/update draft tanpa side effect stok/finance.
3. Implement issue return untuk source `SALES_DELIVERY`.
4. Implement issue return untuk source `SALES_INVOICE` dengan `NO_FINANCE` dan `CREDIT_NOTE`.
5. Implement `REFUND` dengan finance transaction category `SALES_REFUND`.
6. Implement void return.
7. Buat `useSalesReturns.tsx`.

Acceptance:
- Over-return ditolak.
- Return delivery sellable menambah stok.
- Void return membalik efek return.
- Refund mengurangi finance balance.
- Credit note tidak mengubah cash balance.

### Fase 3 - UI Finance > Sales Returns

1. Tambah route `/finance/sales/returns`.
2. Buat management, editor, detail.
3. Tambah tombol "Buat Retur" di detail Sales Delivery/Sales Invoice.
4. Tambah i18n di `src/i18n/messages.ts`.
5. Tambah guard permission.

Acceptance:
- Owner/Admin bisa membuat return dari Sales Document detail.
- Role tanpa permission tidak melihat aksi return.
- Draft return bisa diedit.
- Issued return menjadi read-only kecuali aksi void.

### Fase 4 - Accounting dan Report

1. Update Finance Report agar refund penjualan tidak menjadi expense operasional biasa.
2. Update Sales Document detail agar balance invoice membaca return summary.
3. Update Sales Document margin/report agar return mengurangi net sales/profit display.
4. Jika POS return sudah aktif, update POS Sales Report dan Transaction Detail Report.
5. Perluas `recalculateProfit()` hanya setelah policy profit Sales Invoice final.

Acceptance:
- Laporan bisa membedakan gross sales, sales return, dan net sales.
- Profit tidak double minus.
- Refund tidak muncul sebagai biaya operasional biasa.

### Fase 5 - POS Return

Kerjakan setelah Sales Document return stabil.

1. Tambah entry point dari `src/view/History.tsx`.
2. Source type `POS_TRANSACTION` memakai `transactions` dan `transactionItems`.
3. Return POS harus mengurangi net sales dan profit POS.
4. Receipt reprint transaksi asli tetap historis; return punya bukti/nomor return sendiri.
5. Jangan mengubah `Transaction.total_amount` asli.

Acceptance:
- Transaksi POS lama tetap audit-safe.
- Return parsial POS tidak memakai void.
- Sales report menunjukkan gross sales, return, dan net sales.

## Manual QA

Wajib cek:
- Buat Sales Delivery, issue, stok berkurang.
- Buat return delivery condition `SELLABLE`, issue, stok bertambah.
- Void return delivery, stok kembali berkurang.
- Buat Sales Invoice unpaid, issue return `CREDIT_NOTE`, balance due turun tanpa cash movement.
- Buat Sales Invoice paid, issue return `REFUND`, finance balance turun.
- Coba return quantity melebihi source, harus ditolak.
- Coba return source yang voided, harus ditolak.
- Backup database, restore, return tetap ada.
- Owner/Admin bisa akses, Kasir/Gudang tidak bisa manage.
- Expense report tidak menganggap refund sebagai biaya operasional biasa.
- Report menampilkan sales return terpisah dari gross sales.

## Larangan Implementasi

- Jangan memakai hard delete untuk return.
- Jangan mengubah total transaksi/invoice asli.
- Jangan memakai `void` sebagai pengganti return.
- Jangan menulis Dexie langsung dari component.
- Jangan mencampur return ke `stockPurchases`.
- Jangan memakai harga produk terbaru untuk menghitung nilai return.
- Jangan membuat route baru di luar struktur Finance > Sales tanpa keputusan IA baru.
- Jangan edit `routeTree.gen.ts` manual.
- Jangan membuat kategori refund sebagai operational expense yang otomatis mengurangi profit.

## Ringkasan Keputusan

Sales Return di Frayukti harus menjadi dokumen kontra penjualan yang append-only, punya nomor sendiri, dan mereferensikan transaksi/dokumen asal. Stok, cash flow, dan profit dikoreksi lewat service layer dengan aturan eksplisit. Void tetap dipertahankan sebagai pembatalan, bukan retur.
