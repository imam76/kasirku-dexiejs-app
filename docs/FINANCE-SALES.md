# Finance Sales Documents - Spesifikasi Sesuai Struktur Project Terbaru

Dokumen ini adalah hasil audit ulang dari draft reusable form Sales Quotation, Sales Order, Sales Delivery, dan Sales Invoice. Targetnya: fitur sales document bisa masuk ke project Frayukti tanpa merusak flow POS yang sudah ada di `/transaction`, finance cash flow, stok, profit, receipt, history, dan report.

## Audit Kondisi Project Saat Ini

Draft awal benar di ide besarnya: jangan membuat 4 form besar yang copy-paste. Namun beberapa asumsi lama sudah tidak valid karena master-data sekarang sudah lebih lengkap.

Yang tetap berlaku:
- Folder tidak boleh dibuat di root seperti `components/`, `configs/`, dan `utils/`. Project ini memakai `src/components`, `src/utils`, `src/services`, `src/hooks`, `src/routes`, dan `src/view`.
- Route memakai TanStack Router file-based di `src/routes`. Page UI utama diletakkan di `src/view`.
- Mutasi Dexie, stok, finance, profit, dan activity log harus ada di service layer, bukan langsung di form atau hook.
- Hook seperti `useFinance` dan `useTransaction` hanya untuk query, mutation orchestration, invalidation, dan feedback UI.
- Tipe utama project masih dikumpulkan di `src/types/index.ts`.
- Existing POS checkout sudah punya jalur sendiri: `src/services/checkoutService.ts` membuat `transactions`, `transactionItems`, finance income, profit log, dan pengurangan stok. Sales document tidak boleh mengganti flow ini secara diam-diam.

Yang perlu direvisi dari draft lama:
- Schema Dexie saat ini sudah sampai `version(16)` untuk `taxes`, bukan lagi `version(12)` untuk `promos`. Sales document harus memakai versi berikutnya, yaitu `version(17)` jika belum ada migrasi baru setelah dokumen ini.
- Customer sudah punya master table lewat `contacts`. Sales document boleh menyimpan `contact_id`, tetapi tetap wajib menyimpan snapshot customer agar histori dokumen tidak berubah saat contact diedit.
- Tax sudah punya master table lewat `taxes`. Sales document harus memakai snapshot tax, bukan hanya menyimpan `tax_id` atau angka `tax_amount`.
- Department dan project sudah punya master table. Sales document boleh memakai keduanya sebagai dimensi tracking/reporting opsional, dengan snapshot.
- Warehouse belum punya master table. Untuk fase awal, `warehouse_name` tetap cukup sebagai snapshot/string.
- Master data berada di `/master-data/*`, tetapi dokumen sales tetap berada di `/finance/sales` karena ini workflow transaksi/finance, bukan CRUD referensi master.

## Prinsip Implementasi

- Buat satu form reusable: `SalesDocumentForm`.
- Bedakan perilaku dokumen lewat config, bukan copy-paste form.
- Pisahkan rendering form, kalkulasi, validasi, dan side effect database.
- Jangan mengubah `Product.selling_price` ketika dokumen punya diskon/pajak.
- Jangan memakai table POS `transactions` untuk quotation/order/delivery/invoice kecuali nanti ada fitur eksplisit untuk convert invoice menjadi transaksi POS.
- Sales document punya table sendiri agar status dokumen, contact, due date, source document, dan payment status tidak tercampur dengan transaksi kasir.
- Pakai master `contacts`, `taxes`, `departments`, dan `projects` sebagai sumber pilihan. Tetap simpan snapshot di sales document.
- Posting finance hanya dilakukan ketika invoice benar-benar dibayar. Invoice unpaid tidak boleh menaikkan cash balance.
- Sales delivery mengurangi stok, tetapi tidak membuat finance income.
- Kalau invoice payment dibuat sebagai finance transaction, category-nya tidak boleh terhapus oleh `recalculateFinance()` tanpa direplay ulang.
- Jika invoice payment dicatat sebagai income finance, jangan sampai otomatis dihitung sebagai profit penuh. Profit invoice harus dihitung dari margin item, atau ditunda ke fase terpisah.

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
  createSalesDocumentSnapshots.ts
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
- `src/routes/__root.tsx`: tambah menu Sales Documents di group Finance sidebar.
- `src/auth/routePermissions.ts`: tambah permission untuk `/finance/sales`.
- `src/lib/db.ts`: tambah table Dexie baru memakai versi berikutnya dari schema live.
- `src/types/index.ts`: tambah tipe sales document dan snapshot field.
- `src/constants/finance.ts`: tambah kategori finance invoice payment jika invoice paid akan dicatat ke cash flow.
- `src/i18n/finance.ts` dan `src/i18n/messages.ts`: tambah label menu, status, field, dan category.
- `src/utils/backupRestore.ts`: export/import table sales document baru.
- `src/routeTree.gen.ts`: jangan edit manual; biarkan generator/build TanStack Router yang update.

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
  | 'VOIDED';

export type SalesInvoicePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface SalesDocument {
  id: string;
  document_number: string;
  type: SalesDocumentType;
  status: SalesDocumentStatus;

  contact_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  customer_company_name?: string;
  customer_tax_number?: string;

  department_id?: string;
  department_code?: string;
  department_name?: string;

  project_id?: string;
  project_code?: string;
  project_name?: string;

  document_date: string;
  expired_at?: string;
  due_date?: string;
  warehouse_name?: string;

  source_document_id?: string;
  source_document_number?: string;
  source_document_type?: SalesDocumentType;

  subtotal_amount?: number;
  discount_amount?: number;
  tax_id?: string;
  tax_name?: string;
  tax_code?: string;
  tax_rate?: number;
  tax_calculation_mode?: TaxCalculationMode;
  tax_amount?: number;
  total_amount?: number;

  payment_status?: SalesInvoicePaymentStatus;
  paid_amount?: number;
  paid_at?: string;
  finance_transaction_id?: string;

  notes?: string;
  issued_at?: string;
  voided_at?: string;
  void_reason?: string;
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
- `contact_id` hanya referensi ke master `contacts`. Field `customer_*` tetap menjadi snapshot utama untuk tampilan histori.
- Jangan sambungkan customer ke `AuthUser`, karena auth saat ini adalah user internal toko.
- `department_*` dan `project_*` adalah snapshot opsional untuk tracking/reporting.
- `tax_*` adalah snapshot dari master `taxes`. Jangan menyimpan hanya `tax_id`, karena dokumen lama harus tetap benar saat rate tax diedit.
- `warehouse_name` adalah snapshot/string dulu. Jangan membuat warehouse master di fase awal.
- `status` adalah lifecycle dokumen. Status bayar invoice dipisahkan ke `payment_status`.
- `price`, `discount_amount`, `tax_amount`, dan `total_amount` boleh kosong untuk Sales Delivery.
- `source_document_id` dipakai untuk alur convert, misalnya quotation -> order -> delivery -> invoice.
- Untuk delivery, gunakan `delivered_quantity`. Untuk quotation/order/invoice, gunakan `quantity`; `ordered_quantity` dipakai jika perlu membandingkan order vs delivery.
- `finance_transaction_id` membantu idempotency agar pembayaran invoice tidak menggandakan income.

## DB Schema Dexie

Tambahkan table property di `src/lib/db.ts`.

```ts
salesDocuments!: Table<SalesDocument>;
salesDocumentItems!: Table<SalesDocumentItem>;
```

Schema live sekarang sudah sampai `version(16)` untuk `taxes`. Tambahkan sales document memakai versi berikutnya.

```ts
this.version(17).stores({
  salesDocuments: 'id, document_number, type, status, contact_id, customer_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, created_at',
  salesDocumentItems: 'id, document_id, product_id'
});
```

Jika sebelum implementasi ada migrasi baru setelah `version(16)`, gunakan nomor berikutnya dari `src/lib/db.ts`. Jangan menambah table sales document ke `version(1)` dan jangan memakai ulang `version(13)` karena sudah dipakai `contacts`.

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
    allowContactPicker: boolean;
    allowDepartmentPicker: boolean;
    allowProjectPicker: boolean;
  };
}
```

Behavior per dokumen:
- Sales Quotation: `affectsStock=false`, `hasPricing=true`, `hasTax=true`, `hasDueDate=false`, field `expired_at` aktif.
- Sales Order: `affectsStock=false`, `hasPricing=true`, `hasTax=true`, field `warehouse_name` aktif.
- Sales Delivery: `affectsStock=true`, `hasPricing=false`, `hasTax=false`, `validateStock=true`, pakai `ordered_quantity` dan `delivered_quantity`.
- Sales Invoice: `affectsStock=false`, `hasPricing=true`, `hasTax=true`, `hasDueDate=true`, `hasPaymentStatus=true`.

Catatan config:
- Picker contact membaca master `contacts` aktif dengan tipe `CUSTOMER` atau `CUSTOMER_SUPPLIER`, tetapi form tetap boleh menyimpan customer manual jika belum ada contact.
- Picker tax membaca master `taxes` aktif. Default tax boleh diambil dari `is_default=true`.
- Picker department dan project opsional. Jika dipilih, simpan id dan snapshot nama/kode.

## Komponen Reusable

`SalesDocumentForm` menerima config, initial data, master data options, dan handler submit.

```tsx
<SalesDocumentForm
  type="SALES_ORDER"
  config={salesOrderConfig}
  initialData={initialData}
  contacts={contacts}
  taxes={taxes}
  departments={departments}
  projects={projects}
  onSubmit={handleSubmit}
/>
```

Pembagian tanggung jawab:
- `SalesDocumentForm.tsx`: komposisi form, state line items, submit.
- `DocumentHeader.tsx`: render `config.headerFields`, termasuk contact, department, project, warehouse, due date, dan expired date.
- `DocumentLineItems.tsx`: render `config.lineItemColumns`, product picker, qty/unit.
- `DocumentSummary.tsx`: render subtotal, diskon, tax, dan grand total jika `hasPricing=true`.
- `FieldRenderer.tsx`: render field generik berdasarkan config.

Gunakan helper existing:
- Format uang dari `src/utils/formatters.ts`.
- Harga/unit dari `src/utils/pricing.ts` dan `src/utils/productUnits.ts`.
- Snapshot unit dari `src/utils/salesUnits.ts` jika item perlu disimpan dengan metadata unit seperti POS.

## Helper Kalkulasi, Snapshot, dan Validasi

`src/utils/salesDocuments/calculateDocumentTotal.ts` harus pure:
- Input line item, tax snapshot, discount, dan config.
- Output `subtotal_amount`, `discount_amount`, `tax_amount`, `total_amount`, dan line subtotal.
- Tidak membaca atau menulis Dexie.
- Sales Delivery harus bisa dihitung tanpa harga dan total.
- Tax inclusive dan exclusive harus mengikuti `tax_calculation_mode` dari snapshot tax.

`src/utils/salesDocuments/createSalesDocumentSnapshots.ts` bertugas membuat snapshot dari master data:
- Contact -> `contact_id`, `customer_name`, `customer_phone`, `customer_email`, `customer_address`, `customer_company_name`, `customer_tax_number`.
- Tax -> `tax_id`, `tax_name`, `tax_code`, `tax_rate`, `tax_calculation_mode`.
- Department -> `department_id`, `department_code`, `department_name`.
- Project -> `project_id`, `project_code`, `project_name`.

`src/utils/salesDocuments/validateSalesDocument.ts` harus berbasis config:
- Cek required header fields.
- Cek customer: boleh dari contact aktif atau input manual, tetapi `customer_name` wajib untuk quotation/order/invoice.
- Cek minimal 1 line item.
- Cek qty valid.
- Untuk tax, pastikan snapshot lengkap jika tax dipilih.
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
- Service boleh membaca `contacts`, `taxes`, `departments`, dan `projects` untuk validasi/snapshot, tetapi tidak mengubah master data.
- Saat create/update, service membekukan snapshot master data yang dipilih.
- Delivery yang mengurangi stok harus update `db.products` dalam transaction yang sama.
- Invoice unpaid hanya update sales document, tidak menulis finance balance.
- Invoice paid boleh menulis `db.financeTransactions` dan `db.financeBalance`, tetapi harus idempotent agar tombol paid tidak menggandakan income.
- Idempotency invoice paid bisa memakai `finance_transaction_id` di sales document atau cek `financeTransactions` dengan `reference_id=document.id` dan category invoice payment.
- Activity log ditulis di service seperti pola `financeService`, `checkoutService`, dan service master data.
- Permission check untuk write finance tetap memakai `FINANCE_ACCESS`.

## Integrasi Finance

Current `recalculateFinance()` menghapus auto finance category dengan `reference_id` untuk kategori:
- `FINANCE_CATEGORIES.SALES`
- `FINANCE_CATEGORIES.AUTO_COGS`
- `FINANCE_CATEGORIES.STOCK_PURCHASE`

Karena itu, jangan mencatat pembayaran invoice memakai `FINANCE_CATEGORIES.SALES` dengan `reference_id` kecuali `recalculateFinance()` juga diubah untuk replay dari `salesDocuments`.

Pilihan fase awal yang aman:
1. Tambahkan category baru, misalnya `FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT = 'PEMBAYARAN_INVOICE_PENJUALAN'`.
2. Catat finance transaction invoice paid dengan category tersebut dan `reference_id` ke sales document.
3. Tambahkan label category di `src/i18n/finance.ts` dan `src/i18n/messages.ts`.
4. Pastikan category ini tidak ikut auto-delete di `recalculateFinance()`.
5. Masukkan category ini ke `NON_PROFIT_FINANCE_CATEGORIES` jika profit invoice akan dihitung dari margin item di service terpisah. Jika profit invoice belum dihitung, jangan buat profit log palsu sebesar total invoice.
6. Jangan memakai `addFinanceTransaction()` mentah jika behavior profit otomatisnya belum sesuai kebutuhan invoice.

Invoice `UNPAID` dan `PARTIAL` tidak boleh menaikkan `financeBalance` sebesar total invoice penuh. Untuk `PARTIAL`, hanya amount yang benar-benar dibayar yang boleh masuk cash flow.

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

Tambahkan menu di `src/routes/finance/index.tsx` dan `src/routes/__root.tsx` dengan permission `FINANCE_ACCESS`.

Tambahkan permission:

```ts
'/finance/sales': 'FINANCE_ACCESS'
```

di `src/auth/routePermissions.ts`.

## Urutan Implementasi

Kerjakan bertahap agar tidak mengganggu POS.

1. Tambah type sales document di `src/types/index.ts`, termasuk snapshot contact, tax, department, dan project.
2. Tambah Dexie table `salesDocuments` dan `salesDocumentItems` di `src/lib/db.ts` memakai `version(17)` atau versi berikutnya dari schema live.
3. Tambah finance category invoice payment di `src/constants/finance.ts`, label i18n, dan aturan profit category yang aman.
4. Tambah config di `src/configs/sales-document/`.
5. Buat helper kalkulasi, snapshot, validasi, nomor dokumen, dan mapper produk di `src/utils/salesDocuments/`.
6. Buat `salesDocumentService.ts` untuk CRUD draft/issued tanpa side effect stok/finance dulu.
7. Buat `useSalesDocuments.tsx` untuk query sales document dan master data option yang dibutuhkan form.
8. Buat reusable components di `src/components/sales-document/`.
9. Tambah page list/editor/detail di `src/view/finance/sales/`.
10. Tambah route, menu `/finance/sales`, permission, dan pastikan route tree digenerate oleh build/tooling.
11. Update backup/restore untuk `salesDocuments` dan `salesDocumentItems`.
12. Aktifkan side effect Sales Delivery untuk stok, termasuk void yang mengembalikan stok.
13. Aktifkan invoice payment ke finance dengan category khusus dan idempotency.
14. Tambah manual QA untuk quotation, order, delivery, invoice, partial/paid payment, void delivery, backup/restore, dan recalculate finance.

## Acceptance Criteria

- Tidak ada 4 form besar yang copy-paste.
- Semua file baru berada di struktur `src/...` sesuai pola project.
- Dexie sales document memakai versi berikutnya dari schema live, bukan memakai ulang `version(13)`.
- Sales document bisa memakai master Contact, Tax, Department, dan Project, tetapi tetap menyimpan snapshot histori.
- Sales Quotation dan Sales Order tidak mengurangi stok.
- Sales Delivery mengurangi stok dan bisa berjalan tanpa harga/grand total.
- Sales Invoice bisa punya subtotal, diskon, tax snapshot, grand total, due date, dan payment status.
- Invoice unpaid tidak menaikkan cash flow.
- Invoice partial hanya menaikkan cash flow sebesar pembayaran yang benar-benar diterima.
- Invoice paid tidak menggandakan finance income ketika disubmit ulang.
- Invoice payment tidak otomatis menjadi profit penuh sebesar total invoice.
- Route `/finance/sales` hanya bisa diakses role yang punya `FINANCE_ACCESS`.
- `recalculateFinance()` tidak menghapus pembayaran invoice tanpa menggantinya kembali.
- POS checkout existing di `/transaction` tetap berjalan seperti sebelumnya.
- Backup/restore membawa table sales document baru.
- Kode tetap mudah dibaca dan side effect bisnis ada di service layer.
