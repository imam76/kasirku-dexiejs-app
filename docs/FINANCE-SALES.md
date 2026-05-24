# Finance Sales Documents - Spesifikasi Sesuai Struktur Project

Dokumen ini adalah hasil audit ulang dari draft reusable form Sales Quotation, Sales Order, Sales Delivery, dan Sales Invoice. Targetnya: fitur sales document bisa masuk ke project Kasirku tanpa merusak flow POS yang sudah ada di `/transaction`, finance cash flow, stok, profit, receipt, history, dan report.

## Audit Draft Lama

Draft awal benar di ide besarnya: jangan membuat 4 form besar yang copy-paste. Namun struktur folder dan titik integrasinya belum sesuai project ini.

Yang perlu dikoreksi:
- Folder tidak boleh dibuat di root seperti `components/`, `configs/`, dan `utils/`. Project ini memakai `src/components`, `src/utils`, `src/services`, `src/hooks`, `src/routes`, dan `src/view`.
- Route memakai TanStack Router file-based di `src/routes`. Page UI utama diletakkan di `src/view`.
- Mutasi Dexie, stok, finance, profit, dan activity log harus ada di service layer, bukan langsung di form atau hook.
- Hook seperti `useFinance` dan `useTransaction` hanya untuk query, mutation orchestration, invalidation, dan feedback UI.
- Tipe utama project masih dikumpulkan di `src/types/index.ts`.
- Schema Dexie ada di `src/lib/db.ts`; versi terakhir saat dokumen ini diaudit adalah `version(12)` untuk `promos`, jadi sales document harus memakai versi berikutnya.
- Existing POS checkout sudah punya jalur sendiri: `src/services/checkoutService.ts` membuat `transactions`, `transactionItems`, finance income, profit log, dan pengurangan stok. Sales document tidak boleh mengganti flow ini secara diam-diam.
- Customer dan warehouse belum punya master table. Untuk fase awal, simpan sebagai snapshot field di dokumen, bukan membuat modul customer/warehouse besar.

## Prinsip Implementasi

- Buat satu form reusable: `SalesDocumentForm`.
- Bedakan perilaku dokumen lewat config, bukan copy-paste form.
- Pisahkan rendering form, kalkulasi, validasi, dan side effect database.
- Jangan mengubah `Product.selling_price` ketika dokumen punya diskon/pajak.
- Jangan memakai table POS `transactions` untuk quotation/order/delivery/invoice kecuali nanti ada fitur eksplisit untuk convert invoice menjadi transaksi POS.
- Sales document punya table sendiri agar status dokumen, customer, due date, dan source document tidak tercampur dengan transaksi kasir.
- Posting finance hanya dilakukan ketika invoice benar-benar dibayar. Invoice unpaid tidak boleh menaikkan cash balance.
- Sales delivery mengurangi stok, tetapi tidak membuat finance income.
- Kalau invoice payment dibuat sebagai finance transaction, pastikan category-nya tidak terhapus oleh `recalculateFinance()` tanpa direplay ulang.

## Struktur File Yang Disarankan

Tambahkan folder dan file di bawah `src`, bukan di root project.

```txt
src/components/sales-document/
  SalesDocumentForm.tsx
  DocumentHeader.tsx
  DocumentLineItems.tsx
  DocumentSummary.tsx
  FieldRenderer.tsx

src/configs/sales-document/
  salesQuotation.config.ts
  salesOrder.config.ts
  salesDelivery.config.ts
  salesInvoice.config.ts
  index.ts

src/hooks/
  useSalesDocuments.tsx

src/services/
  salesDocumentService.ts

src/utils/salesDocuments/
  calculateDocumentTotal.ts
  validateSalesDocument.ts
  createSalesDocumentNumber.ts
  mapProductToSalesDocumentItem.ts

src/view/finance/sales/
  SalesDocumentsManagement.tsx
  SalesDocumentEditor.tsx
  SalesDocumentDetail.tsx

src/routes/finance/sales/
  index.tsx
  $documentType/
    new.lazy.tsx
    $documentId.lazy.tsx
```

Update file existing:
- `src/routes/finance/index.tsx`: tambah menu Sales Documents.
- `src/auth/routePermissions.ts`: tambah permission untuk `/finance/sales`.
- `src/lib/db.ts`: tambah table Dexie baru.
- `src/types/index.ts`: tambah tipe sales document.
- `src/constants/finance.ts`: tambah kategori finance invoice payment jika invoice paid akan dicatat ke cash flow.
- `src/i18n/finance.ts` dan `src/i18n/messages.ts`: tambah label menu, status, field, dan category.
- `src/utils/backupRestore.ts`: export/import table sales document baru.

## Data Model

Tambahkan tipe awal di `src/types/index.ts`.

```ts
export type SalesDocumentType =
  | 'SALES_QUOTATION'
  | 'SALES_ORDER'
  | 'SALES_DELIVERY'
  | 'SALES_INVOICE';

export type SalesDocumentStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'CONVERTED'
  | 'VOIDED'
  | 'PAID'
  | 'PARTIAL'
  | 'UNPAID';

export type SalesInvoicePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface SalesDocument {
  id: string;
  document_number: string;
  type: SalesDocumentType;
  status: SalesDocumentStatus;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  document_date: string;
  expired_at?: string;
  due_date?: string;
  warehouse_name?: string;
  source_document_id?: string;
  source_document_number?: string;
  subtotal_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
  payment_status?: SalesInvoicePaymentStatus;
  paid_amount?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SalesDocumentItem {
  id: string;
  document_id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  unit: ProductUnit;
  quantity: number;
  ordered_quantity?: number;
  delivered_quantity?: number;
  price?: number;
  discount_amount?: number;
  tax_amount?: number;
  subtotal?: number;
  purchase_price?: number;
  created_at: string;
}
```

Catatan model:
- `customer_*` adalah snapshot. Jangan sambungkan ke `AuthUser`, karena auth saat ini adalah user internal toko.
- `warehouse_name` adalah snapshot/string dulu. Jangan membuat warehouse master di fase awal.
- `price`, `discount_amount`, `tax_amount`, dan `total_amount` boleh kosong untuk Sales Delivery.
- `source_document_id` dipakai untuk alur convert, misalnya quotation -> order -> delivery -> invoice.
- Untuk delivery, gunakan `delivered_quantity`. Untuk quotation/order/invoice, gunakan `quantity`; `ordered_quantity` dipakai jika perlu membandingkan order vs delivery.

## DB Schema Dexie

Tambahkan table property di `src/lib/db.ts`.

```ts
salesDocuments!: Table<SalesDocument>;
salesDocumentItems!: Table<SalesDocumentItem>;
```

Tambahkan schema versi baru setelah `version(12)`.

```ts
this.version(13).stores({
  salesDocuments: 'id, document_number, type, status, customer_name, document_date, due_date, payment_status, source_document_id, created_at',
  salesDocumentItems: 'id, document_id, product_id'
});
```

Jangan menambah table sales document ke `version(1)`. Ikuti pola migrasi Dexie yang sudah ada.

## Config Form

Config disimpan di `src/configs/sales-document/`.

Kontrak minimal:

```ts
export interface SalesDocumentConfig {
  type: SalesDocumentType;
  title: string;
  numberPrefix: string;
  headerFields: SalesDocumentFieldConfig[];
  lineItemColumns: SalesDocumentLineColumnConfig[];
  summaryFields: SalesDocumentSummaryFieldConfig[];
  requiredFields: string[];
  behavior: {
    affectsStock: boolean;
    hasPricing: boolean;
    hasTax: boolean;
    hasDueDate: boolean;
    hasPaymentStatus: boolean;
    validateStock: boolean;
  };
}
```

Behavior per dokumen:
- Sales Quotation: `affectsStock=false`, `hasPricing=true`, `hasTax=true`, `hasDueDate=false`, field `expired_at` aktif.
- Sales Order: `affectsStock=false`, `hasPricing=true`, `hasTax=true`, field `warehouse_name` aktif.
- Sales Delivery: `affectsStock=true`, `hasPricing=false`, `hasTax=false`, `validateStock=true`, pakai `ordered_quantity` dan `delivered_quantity`.
- Sales Invoice: `affectsStock=false`, `hasPricing=true`, `hasTax=true`, `hasDueDate=true`, `hasPaymentStatus=true`.

## Komponen Reusable

`SalesDocumentForm` menerima config, initial data, dan handler submit.

```tsx
<SalesDocumentForm
  type="SALES_ORDER"
  config={salesOrderConfig}
  initialData={initialData}
  onSubmit={handleSubmit}
/>
```

Pembagian tanggung jawab:
- `SalesDocumentForm.tsx`: komposisi form, state line items, submit.
- `DocumentHeader.tsx`: render `config.headerFields`.
- `DocumentLineItems.tsx`: render `config.lineItemColumns`, product picker, qty/unit.
- `DocumentSummary.tsx`: render subtotal, diskon, pajak, grand total jika `hasPricing=true`.
- `FieldRenderer.tsx`: render field generik berdasarkan config.

Gunakan helper existing:
- Format uang dari `src/utils/formatters.ts`.
- Harga/unit dari `src/utils/pricing.ts` dan `src/utils/productUnits.ts`.
- Snapshot unit dari `src/utils/salesUnits.ts` jika nanti item perlu disimpan dengan metadata unit seperti POS.

## Helper Kalkulasi dan Validasi

`src/utils/salesDocuments/calculateDocumentTotal.ts` harus pure:
- Input line item dan config.
- Output `subtotal_amount`, `discount_amount`, `tax_amount`, `total_amount`, dan line subtotal.
- Tidak membaca atau menulis Dexie.
- Sales Delivery harus bisa dihitung tanpa harga dan total.

`src/utils/salesDocuments/validateSalesDocument.ts` harus berbasis config:
- Cek required header fields.
- Cek minimal 1 line item.
- Cek qty valid.
- Untuk Sales Delivery, cek `delivered_quantity <= ordered_quantity` jika dokumen berasal dari order.
- Untuk Sales Delivery, cek stok memakai konversi unit sebelum submit.
- Untuk Sales Invoice, cek `due_date` dan `payment_status`.

## Service Layer

Buat `src/services/salesDocumentService.ts`.

Service ini yang menulis Dexie dan menjalankan side effect:
- `createSalesDocument(input)`
- `updateSalesDocument(id, input)`
- `issueSalesDocument(id)`
- `convertSalesDocument(sourceId, targetType)`
- `voidSalesDocument(id, reason)`
- `markSalesInvoicePaid(id, paymentInput)`

Aturan service:
- Semua write ke `salesDocuments` dan `salesDocumentItems` dilakukan dalam `db.transaction`.
- Delivery yang mengurangi stok harus update `db.products` dalam transaction yang sama.
- Invoice unpaid hanya update sales document, tidak menulis finance balance.
- Invoice paid boleh menulis `db.financeTransactions` dan `db.financeBalance`, tetapi harus idempotent agar tombol paid tidak menggandakan income.
- Activity log ditulis di service seperti pola `financeService` dan `checkoutService`.
- Permission check untuk write finance tetap memakai `FINANCE_ACCESS`.

## Integrasi Finance

Current `recalculateFinance()` menghapus auto finance category dengan `reference_id` untuk kategori:
- `FINANCE_CATEGORIES.SALES`
- `FINANCE_CATEGORIES.AUTO_COGS`
- `FINANCE_CATEGORIES.STOCK_PURCHASE`

Karena itu, jangan mencatat pembayaran invoice memakai `FINANCE_CATEGORIES.SALES` dengan `reference_id` kecuali `recalculateFinance()` juga diubah untuk replay dari `salesDocuments`.

Pilihan fase awal yang aman:
1. Tambahkan category baru, misalnya `FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT = 'PEMBAYARAN_INVOICE_PENJUALAN'`.
2. Catat finance transaction invoice paid dengan category tersebut.
3. Tambahkan label category di i18n finance.
4. Pastikan category ini tidak ikut auto-delete di `recalculateFinance()`.
5. Jika profit dari invoice akan dihitung, lakukan sekali di service dan jangan dihitung ulang sebagai finance operational income.

Invoice `UNPAID` dan `PARTIAL` tidak boleh menaikkan `financeBalance` sebesar total invoice penuh.

## Integrasi Stok

Sales Delivery:
- Validasi stok sebelum submit.
- Kurangi `Product.stock` memakai helper konversi dari `src/utils/pricing.ts`.
- Simpan document dan item delivery dalam transaction yang sama dengan pengurangan stok.
- Jika delivery di-void, stok harus dikembalikan seperti pola void transaksi POS.

Sales Quotation dan Sales Order:
- Tidak mengurangi stok.
- Boleh menampilkan warning stok kurang, tetapi jangan mengubah product.

Sales Invoice:
- Tidak mengurangi stok di fase awal, karena pengeluaran barang sudah menjadi tanggung jawab Sales Delivery atau POS checkout.

## Route dan Navigasi

Tambahkan route:

```txt
/finance/sales
/finance/sales/$documentType/new
/finance/sales/$documentType/$documentId
```

File route:

```txt
src/routes/finance/sales/index.tsx
src/routes/finance/sales/$documentType/new.lazy.tsx
src/routes/finance/sales/$documentType/$documentId.lazy.tsx
```

Tambahkan menu di `src/routes/finance/index.tsx` dengan permission `FINANCE_ACCESS`.

Tambahkan permission:

```ts
'/finance/sales': 'FINANCE_ACCESS'
```

di `src/auth/routePermissions.ts`.

## Urutan Implementasi

Kerjakan bertahap agar tidak mengganggu POS.

1. Tambah type sales document di `src/types/index.ts`.
2. Tambah Dexie table `salesDocuments` dan `salesDocumentItems` di `src/lib/db.ts`.
3. Tambah config di `src/configs/sales-document/`.
4. Buat helper kalkulasi dan validasi di `src/utils/salesDocuments/`.
5. Buat reusable components di `src/components/sales-document/`.
6. Buat `salesDocumentService.ts` untuk CRUD draft tanpa side effect stok/finance dulu.
7. Buat `useSalesDocuments.tsx`.
8. Tambah page list/editor/detail di `src/view/finance/sales/`.
9. Tambah route dan menu `/finance/sales`.
10. Aktifkan side effect Sales Delivery untuk stok.
11. Aktifkan invoice payment ke finance dengan category khusus.
12. Update backup/restore.
13. Tambah manual QA untuk quotation, order, delivery, invoice, dan recalculate finance.

## Acceptance Criteria

- Tidak ada 4 form besar yang copy-paste.
- Semua file baru berada di struktur `src/...` sesuai pola project.
- Sales Quotation dan Sales Order tidak mengurangi stok.
- Sales Delivery mengurangi stok dan bisa berjalan tanpa harga/grand total.
- Sales Invoice bisa punya subtotal, diskon, pajak, grand total, due date, dan payment status.
- Invoice unpaid tidak menaikkan cash flow.
- Invoice paid tidak menggandakan finance income ketika disubmit ulang.
- Route `/finance/sales` hanya bisa diakses role yang punya `FINANCE_ACCESS`.
- `recalculateFinance()` tidak menghapus pembayaran invoice tanpa menggantinya kembali.
- POS checkout existing di `/transaction` tetap berjalan seperti sebelumnya.
- Backup/restore membawa table sales document baru.
- Kode tetap mudah dibaca dan side effect bisnis ada di service layer.
