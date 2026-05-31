# Finance Purchase Documents - Langkah Implementasi Sesuai Struktur Project

Dokumen ini adalah panduan implementasi module Purchase Documents di area Finance. Targetnya: membuat alur dokumen pembelian yang rapi, reuse pola Sales Document yang sudah ada, tidak duplicate code besar, dan tidak mengganti struktur folder project yang sekarang sudah solid.

## Tujuan

- Membuat module Finance > Purchases untuk dokumen pembelian dari request sampai invoice.
- Memakai ulang pola Sales Document: config-driven form, service layer, hook orchestration, Dexie table sendiri, route file-based, dan view di `src/view`.
- Menghindari copy-paste besar dari Sales Document.
- Menghindari refactor folder besar seperti `src/modules`, `src/features`, `src/shared`, `src/components/document`, atau `src/utils/document`.
- Menjaga POS, stock purchase lama, sales document, accounts receivable, dan general ledger tetap berjalan seperti sekarang.

## Audit Kondisi Project Saat Ini

Project saat ini sudah punya fondasi yang bisa dijadikan acuan:

- Sales Document aktif di `/finance/sales`.
- File route memakai TanStack Router di `src/routes`.
- Screen utama diletakkan di `src/view`.
- Komponen reusable per domain ada di `src/components/sales-document`.
- Config Sales Document ada di `src/configs/sales-document`.
- Service mutasi ada di `src/services/salesDocumentService.ts`.
- Hook orchestration ada di `src/hooks/useSalesDocuments.tsx`.
- Util domain ada di `src/utils/salesDocuments`.
- Dexie schema saat audit ini sudah sampai `version(22)`, jadi Purchase Document harus memakai `version(23)` atau versi berikutnya jika ada migrasi baru.
- Backup/restore sudah membawa banyak table operasional, termasuk sales document, sales return, AR payment, COA, dan journal.
- Existing pembelian stok sederhana masih memakai `stockPurchases` dan `recordStockPurchase()` dari `src/services/stockPurchaseService.ts`.

## Prinsip Batasan

- Jangan memindahkan folder Sales Document yang sudah ada.
- Jangan membuat folder arsitektur baru untuk shared component/util.
- Jangan membuat Purchase Document menumpang langsung ke table `salesDocuments`.
- Jangan memakai `transactions` POS untuk dokumen pembelian.
- Jangan memakai `recordStockPurchase()` untuk unpaid purchase invoice karena service itu langsung mengurangi kas dan menulis finance expense.
- Jangan mengubah perilaku stock purchase lama di master produk/report pembelian pada fase awal.
- Jangan memasukkan semua ide Accounts Payable, supplier payment, dan inventory accounting sekaligus jika belum dibutuhkan oleh fase implementasi.

Folder module baru boleh dibuat hanya jika mengikuti pola existing dan tetap berada di parent yang sudah ada:

```txt
src/components/purchase-document/
src/configs/purchase-document/
src/routes/finance/purchases/
src/view/finance/purchases/
src/utils/purchaseDocuments/
```

Yang tidak boleh dibuat pada fase ini:

```txt
src/modules/
src/features/
src/shared/
src/components/document/
src/utils/document/
```

Jika butuh util generic lintas sales/purchase, tambahkan file netral langsung di folder existing seperti `src/utils/documentTotals.ts`, bukan folder baru.

## Nama Module dan Route

Gunakan nama user-facing:

- Finance menu: `Purchases`
- Route utama: `/finance/purchases`
- Route tipe dokumen: `/finance/purchases/$documentType`
- Route buat baru: `/finance/purchases/$documentType/new`
- Route detail: `/finance/purchases/$documentType/$documentId`
- Route edit draft: `/finance/purchases/$documentType/$documentId/edit`

Slug tipe dokumen disarankan:

```txt
pr  -> PURCHASE_REQUEST
rfq -> REQUEST_FOR_QUOTATION
po  -> PURCHASE_ORDER
gr  -> PURCHASE_RECEIPT
pi  -> PURCHASE_INVOICE
```

Catatan: `pr` dipakai untuk Purchase Request. Purchase Receipt memakai `gr` sebagai shorthand Goods Receipt agar tidak rancu.

## Scope Fase Awal

Fase awal cukup mendukung:

1. `Purchase Request`
   - Draft, issue, convert, void.
   - Dipakai untuk permintaan pembelian internal.
   - Supplier boleh kosong.
   - Tidak mengubah stok.
   - Tidak mengubah kas/finance.

2. `Request for Quotation`
   - Draft, issue, convert, void.
   - Dipakai untuk quotation request ke supplier.
   - Untuk fase awal, satu dokumen RFQ boleh berisi satu supplier atau supplier kosong dulu.
   - Tidak menyimpan komparasi harga multi supplier.
   - Tidak mengubah stok.
   - Tidak mengubah kas/finance.

3. `Purchase Order`
   - Draft, issue, convert, void.
   - Tidak mengubah stok.
   - Tidak mengubah kas/finance.

4. `Purchase Receipt`
   - Draft, issue, convert, void.
   - Saat issue menambah stok produk.
   - Saat void mengembalikan stok ke kondisi sebelum receipt.
   - Tidak otomatis mengurangi kas.

5. `Purchase Invoice`
   - Draft, issue, void.
   - Menyimpan total tagihan supplier.
   - Payment boleh ditunda ke fase Accounts Payable agar tidak membuat aggregate payment yang nanti harus dimigrasi ulang.

Yang ditunda:

- Supplier payment ledger.
- Accounts Payable aging.
- Debit note / purchase return.
- Inventory accounting penuh.
- Retur pembelian.
- Multi warehouse.
- Approval workflow.
- Supplier quotation comparison / quotation response multi supplier.

## Reuse Tanpa Duplicate Code

### 1. Kalkulasi Total

`src/utils/salesDocuments/calculateDocumentTotal.ts` sekarang sudah menghitung subtotal, diskon, pajak, dan total secara cukup generic, tetapi tipenya masih Sales Document.

Langkah bersih:

1. Tambah file netral:

```txt
src/utils/documentTotals.ts
```

2. Pindahkan logic pure calculation ke file tersebut.
3. Buat tipe minimal generic seperti:

```ts
export interface DocumentLineItemLike {
  quantity: number;
  price?: number;
  discount_type?: PromoType;
  discount_value?: number;
  discount_amount?: number;
  tax_id?: string;
  tax_name?: string;
  tax_code?: string;
  tax_rate?: number;
  tax_calculation_mode?: TaxCalculationMode;
  tax_base_amount?: number;
  tax_amount?: number;
  subtotal?: number;
  total_amount?: number;
}
```

4. `src/utils/salesDocuments/calculateDocumentTotal.ts` tetap ada sebagai wrapper compatibility untuk Sales Document.
5. Purchase Document memakai util netral yang sama, bukan copy-paste perhitungan.

Jangan membuat folder `src/utils/document`.

### 2. Nomor Dokumen

`createSalesDocumentNumber()` bisa dijadikan wrapper di atas helper netral.

Langkah:

1. Tambah file:

```txt
src/utils/documentNumbers.ts
```

2. Isinya helper generic seperti `createDocumentNumber(prefix, date, tableReader)`.
3. `createSalesDocumentNumber()` tetap ada dan memanggil helper generic.
4. Buat `createPurchaseDocumentNumber()` di `src/utils/purchaseDocuments`.

Dengan cara ini, import lama Sales Document tidak pecah dan Purchase Document tidak perlu copy logic numbering.

### 3. Snapshot Contact, Tax, Department, Project

Sales Document sekarang memakai snapshot customer, tax, department, dan project.

Purchase Document tetap harus snapshot supplier, tax, department, dan project.

Langkah bersih:

1. Jangan copy utuh `createSalesDocumentSnapshots.ts`.
2. Jika helper snapshot contact/tax/department/project sama, ekstrak logic kecil ke file netral di `src/utils`, misalnya:

```txt
src/utils/documentSnapshots.ts
```

3. Sales wrapper tetap mengembalikan field `customer_name`, `customer_phone`, dan seterusnya.
4. Purchase wrapper mengembalikan field `supplier_name`, `supplier_phone`, dan seterusnya.

Jika field hasilnya berbeda, wrapper domain tetap dipisah:

```txt
src/utils/salesDocuments/createSalesDocumentSnapshots.ts
src/utils/purchaseDocuments/createPurchaseDocumentSnapshots.ts
```

Yang dihindari adalah copy logic pembacaan contact/tax/department/project yang sama persis.

### 4. Product Unit dan Harga

Gunakan helper yang sudah ada:

- `src/utils/pricing.ts`
- `src/utils/productUnits.ts`
- `src/utils/salesUnits.ts` jika cocok untuk pemilihan unit document.

Purchase item sebaiknya mengambil harga default dari `product.purchase_price`, bukan `selling_price`.

Jika butuh mapper baru:

```txt
src/utils/purchaseDocuments/mapProductToPurchaseDocumentItem.ts
```

Mapper ini boleh baru karena default harga dan arah dokumennya beda dari Sales Document.

### 5. Komponen Form

Jangan langsung copy semua file `src/components/sales-document`.

Urutan yang aman:

1. Buat `PurchaseDocumentForm.tsx` sebagai wrapper domain purchase.
2. Lihat komponen Sales Document mana yang benar-benar identik.
3. Jika ada komponen identik lintas sales/purchase, ekstrak ke file netral langsung di `src/components`, bukan folder baru.

Contoh file netral yang boleh dibuat:

```txt
src/components/DocumentFieldRenderer.tsx
src/components/DocumentLineItems.tsx
src/components/DocumentSummary.tsx
```

Lalu Sales Document tetap punya wrapper:

```txt
src/components/sales-document/FieldRenderer.tsx
src/components/sales-document/DocumentLineItems.tsx
src/components/sales-document/DocumentSummary.tsx
```

Purchase Document punya wrapper:

```txt
src/components/purchase-document/PurchaseDocumentForm.tsx
```

Aturan penting:

- Wrapper domain boleh tipis.
- Komponen generic boleh dipakai dua domain.
- Jangan biarkan Purchase Document import langsung dari `src/components/sales-document`, karena nama domainnya akan membingungkan.
- Jangan ekstrak semua komponen sebelum ada kebutuhan nyata dari Purchase Document.

## Struktur File Yang Disarankan

Tambahkan file di parent folder existing:

```txt
src/components/purchase-document/
  PurchaseDocumentForm.tsx

src/configs/purchase-document/
  purchaseRequest.config.ts
  requestForQuotation.config.ts
  purchaseOrder.config.ts
  purchaseReceipt.config.ts
  purchaseInvoice.config.ts
  index.ts

src/hooks/
  usePurchaseDocuments.tsx

src/services/
  purchaseDocumentService.ts

src/utils/purchaseDocuments/
  calculatePurchaseDocumentStockImpact.ts
  createPurchaseDocumentNumber.ts
  createPurchaseDocumentSnapshots.ts
  mapProductToPurchaseDocumentItem.ts
  validatePurchaseDocument.ts
  i18n.ts

src/view/finance/purchases/
  PurchaseDocumentsManagement.tsx
  PurchaseDocumentEditor.tsx
  PurchaseDocumentDetail.tsx

src/routes/finance/purchases/
  index.tsx
  $documentType/
    index.tsx
    new.lazy.tsx
    $documentId.lazy.tsx
    $documentId_.edit.lazy.tsx
```

Update file existing:

- `src/types/index.ts`
- `src/lib/db.ts`
- `src/utils/backupRestore.ts`
- `src/routes/finance/index.tsx`
- `src/routes/__root.tsx`
- `src/auth/routePermissions.ts`
- `src/i18n/messages.ts`
- `src/services/generalLedgerService.ts` jika GL posting sudah masuk fase ini
- `src/constants/finance.ts` jika payment/cash-out sudah masuk fase ini

Jangan edit manual:

- `src/routeTree.gen.ts`

Biarkan build/router plugin yang regenerate.

## Data Model Awal

Tambahkan tipe di `src/types/index.ts`.

```ts
export type PurchaseDocumentType =
  | 'PURCHASE_REQUEST'
  | 'REQUEST_FOR_QUOTATION'
  | 'PURCHASE_ORDER'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_INVOICE';

export type PurchaseDocumentStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'CONVERTED'
  | 'VOIDED';

export type PurchaseInvoicePaymentStatus =
  | 'UNPAID'
  | 'PARTIAL'
  | 'PAID';
```

Field dokumen utama:

```ts
export interface PurchaseDocument {
  id: string;
  document_number: string;
  type: PurchaseDocumentType;
  status: PurchaseDocumentStatus;
  contact_id?: string;
  supplier_name?: string;
  supplier_phone?: string;
  supplier_email?: string;
  supplier_address?: string;
  supplier_company_name?: string;
  supplier_tax_number?: string;
  department_id?: string;
  department_code?: string;
  department_name?: string;
  project_id?: string;
  project_code?: string;
  project_name?: string;
  document_date: string;
  required_date?: string;
  quotation_due_date?: string;
  due_date?: string;
  warehouse_name?: string;
  source_document_id?: string;
  source_document_number?: string;
  source_document_type?: PurchaseDocumentType;
  subtotal_amount?: number;
  discount_amount?: number;
  tax_id?: string;
  tax_name?: string;
  tax_code?: string;
  tax_rate?: number;
  tax_calculation_mode?: TaxCalculationMode;
  tax_amount?: number;
  total_amount?: number;
  payment_status?: PurchaseInvoicePaymentStatus;
  paid_amount?: number;
  paid_at?: string;
  payment_method?: PaymentMethod;
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  finance_transaction_id?: string;
  notes?: string;
  issued_at?: string;
  voided_at?: string;
  void_reason?: string;
  created_at: string;
  updated_at: string;
}
```

Field item:

```ts
export interface PurchaseDocumentItem {
  id: string;
  document_id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  unit: ProductUnit;
  quantity: number;
  ordered_quantity?: number;
  received_quantity?: number;
  price?: number;
  discount_type?: PromoType;
  discount_value?: number;
  discount_amount?: number;
  tax_id?: string;
  tax_name?: string;
  tax_code?: string;
  tax_rate?: number;
  tax_calculation_mode?: TaxCalculationMode;
  tax_base_amount?: number;
  tax_amount?: number;
  subtotal?: number;
  total_amount?: number;
  created_at: string;
}
```

Catatan:

- `price` pada Purchase Document adalah harga beli per unit dokumen.
- `received_quantity` dipakai di Purchase Receipt.
- `supplier_name` optional karena Purchase Request dan RFQ draft bisa dibuat sebelum supplier dipilih.
- `required_date` dipakai untuk Purchase Request.
- `quotation_due_date` dipakai untuk Request for Quotation.
- Jangan pakai field `customer_*` di purchase.
- Jangan pakai `purchase_price` sebagai nama harga line purchase, karena di product field itu berarti harga modal snapshot. Untuk line purchase, `price` sudah cukup konsisten dengan Sales Document.

## Dexie Schema

Di `src/lib/db.ts`:

1. Import tipe baru.
2. Tambahkan table:

```ts
purchaseDocuments!: Table<PurchaseDocument>;
purchaseDocumentItems!: Table<PurchaseDocumentItem>;
```

3. Tambahkan version baru. Saat dokumen ini dibuat, schema terakhir adalah `version(22)`, jadi pakai:

```ts
this.version(23).stores({
  purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, created_at',
  purchaseDocumentItems: 'id, document_id, product_id'
});
```

Jika sudah ada migrasi baru setelah `version(22)`, gunakan nomor berikutnya.

## Config Document

Ikuti pola `src/configs/sales-document/index.ts`.

```ts
export interface PurchaseDocumentConfig {
  type: PurchaseDocumentType;
  title: string;
  titleKey: TranslationKey;
  numberPrefix: string;
  theme: PurchaseDocumentThemeConfig;
  headerFields: PurchaseDocumentFieldConfig[];
  lineItemColumns: PurchaseDocumentLineColumnConfig[];
  summaryFields: PurchaseDocumentSummaryFieldConfig[];
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

Behavior awal:

```txt
PURCHASE_REQUEST
  affectsStock: false
  hasPricing: false
  hasTax: false
  hasDueDate: false
  hasPaymentStatus: false
  validateStock: false

REQUEST_FOR_QUOTATION
  affectsStock: false
  hasPricing: false
  hasTax: false
  hasDueDate: false
  hasPaymentStatus: false
  validateStock: false

PURCHASE_ORDER
  affectsStock: false
  hasPricing: true
  hasTax: true
  hasDueDate: false
  hasPaymentStatus: false
  validateStock: false

PURCHASE_RECEIPT
  affectsStock: true
  hasPricing: true
  hasTax: true
  hasDueDate: false
  hasPaymentStatus: false
  validateStock: false

PURCHASE_INVOICE
  affectsStock: false
  hasPricing: true
  hasTax: true
  hasDueDate: true
  hasPaymentStatus: true
  validateStock: false
```

`validateStock` untuk purchase default `false`, karena purchase menambah stok, bukan menjual stok.

Catatan:

- Purchase Request dan Request for Quotation tidak wajib pricing pada fase awal. Harga final mulai wajib saat Purchase Order atau Purchase Invoice.
- Jika nanti RFQ perlu menyimpan harga penawaran dari banyak supplier, buat dokumen/ledger terpisah seperti supplier quotation response, bukan menambah array kompleks ke header RFQ.

Validasi supplier per tipe:

- `PURCHASE_REQUEST`: supplier optional.
- `REQUEST_FOR_QUOTATION`: supplier optional saat draft. Jika dipakai sebagai RFQ single-supplier, supplier wajib sebelum issue.
- `PURCHASE_ORDER`, `PURCHASE_RECEIPT`, dan `PURCHASE_INVOICE`: supplier wajib sebelum issue.

## Service Layer

Buat `src/services/purchaseDocumentService.ts`.

Minimal function:

```ts
createPurchaseDocument(input)
updatePurchaseDocument(id, input)
issuePurchaseDocument(id)
convertPurchaseDocument(sourceId, targetType)
voidPurchaseDocument(id, reason)
```

Aturan service:

- Semua write ke Dexie dilakukan dalam `db.transaction`.
- Role check memakai pattern existing: `getCurrentSessionUser()` dan `requireRolePermission()`.
- Activity log tetap ditulis dari service.
- Form dan hook tidak boleh langsung mengubah stok, finance, atau journal.
- `updatePurchaseDocument()` hanya untuk draft.
- Issued document tidak diedit bebas; gunakan action eksplisit seperti convert, payment, atau void.

Side effect per tipe:

```txt
PURCHASE_REQUEST issued
  - update status saja
  - tidak mengubah stok
  - tidak mengubah finance

REQUEST_FOR_QUOTATION issued
  - update status saja
  - tidak mengubah stok
  - tidak mengubah finance

PURCHASE_ORDER issued
  - update status saja
  - tidak mengubah stok
  - tidak mengubah finance

PURCHASE_RECEIPT issued
  - update status
  - tambah stok product berdasarkan received_quantity atau quantity
  - konversi unit ke product.purchase_unit
  - tidak mengurangi kas

PURCHASE_INVOICE issued
  - update status
  - jika fase AP belum dibuat, simpan payment_status UNPAID saja
  - tidak mengurangi kas sampai payment action ada
```

Void behavior:

```txt
PURCHASE_REQUEST void
  - status VOIDED

REQUEST_FOR_QUOTATION void
  - status VOIDED

PURCHASE_ORDER void
  - status VOIDED

PURCHASE_RECEIPT void
  - status VOIDED
  - kurangi kembali stok yang pernah ditambahkan receipt

PURCHASE_INVOICE void
  - status VOIDED jika belum paid
  - jika nanti sudah ada payment ledger, payment harus divoid dulu atau dibuat reversal eksplisit
```

Conversion path fase awal:

```txt
PURCHASE_REQUEST -> REQUEST_FOR_QUOTATION
PURCHASE_REQUEST -> PURCHASE_ORDER
REQUEST_FOR_QUOTATION -> PURCHASE_ORDER
PURCHASE_ORDER -> PURCHASE_RECEIPT
PURCHASE_RECEIPT -> PURCHASE_INVOICE
```

Jangan izinkan convert balik ke dokumen sebelumnya. Koreksi dokumen yang sudah issued dilakukan lewat void dan buat dokumen baru dari source yang benar.

## Hubungan Dengan Stock Purchase Lama

`stockPurchases` saat ini adalah flow pembelian stok sederhana yang langsung:

- menambah histori pembelian stok,
- mengurangi finance balance,
- membuat finance transaction expense,
- memposting journal stock purchase.

Purchase Document tidak boleh langsung mengganti behavior itu.

Aturan:

- Biarkan stock purchase lama tetap jalan untuk input stok cepat dari master produk/import.
- Purchase Receipt jangan otomatis memanggil `recordStockPurchase()` jika invoice belum dibayar.
- Jika ada mode direct cash purchase di masa depan, boleh pakai `recordStockPurchase()` setelah dipastikan behavior-nya memang harus langsung cash-out.
- Jika purchase receipt perlu histori stok tanpa cash-out, buat helper baru yang fokus stock movement atau perluas model secara eksplisit di fase terpisah.

## Hook Layer

Buat `src/hooks/usePurchaseDocuments.tsx`.

Ikuti pola `useSalesDocuments.tsx`:

- `useLiveQuery` untuk `purchaseDocuments`.
- `useLiveQuery` untuk `products`.
- `useLiveQuery` untuk `contacts`.
- `useLiveQuery` untuk `taxes`.
- `useLiveQuery` untuk `departments`.
- `useLiveQuery` untuk `projects`.
- Filter contacts untuk supplier:

```ts
['SUPPLIER', 'CUSTOMER_SUPPLIER'].includes(contact.contact_type)
```

Mutation yang disediakan:

```txt
createDocument
updateDocument
issueDocument
convertDocument
voidDocument
```

Jika payment belum masuk fase ini, jangan expose `payInvoice` dulu.

Invalidation minimal:

```txt
purchaseDocuments
financeBalance
financeTransactions
journalEntries
trialBalance
incomeStatement
balanceSheet
purchaseReport
```

Sesuaikan dengan side effect yang benar-benar sudah diimplementasikan.

## UI dan Routes

Ikuti pola Finance > Sales:

- Landing tile di `/finance/purchases`.
- Per-type list di `/finance/purchases/$documentType`.
- Editor untuk new/edit draft.
- Detail untuk issued/converted/voided document dan action buttons.

File route:

```txt
src/routes/finance/purchases/index.tsx
src/routes/finance/purchases/$documentType/index.tsx
src/routes/finance/purchases/$documentType/new.lazy.tsx
src/routes/finance/purchases/$documentType/$documentId.lazy.tsx
src/routes/finance/purchases/$documentType/$documentId_.edit.lazy.tsx
```

File view:

```txt
src/view/finance/purchases/PurchaseDocumentsManagement.tsx
src/view/finance/purchases/PurchaseDocumentEditor.tsx
src/view/finance/purchases/PurchaseDocumentDetail.tsx
```

Jangan membuat landing page marketing. Halaman pertama harus langsung usable seperti Finance > Sales.

## Navigation dan Permission

Update `src/routes/finance/index.tsx`:

- Tambah tile Purchases.
- Gunakan `canAccessPath()` seperti item Finance lain.

Update `src/routes/__root.tsx`:

- Tambah child nav `/finance/purchases`.

Update `src/auth/routePermissions.ts`:

```ts
'/finance/purchases': 'FINANCE_ACCESS'
```

Catatan permission:

- Fase awal gunakan `FINANCE_ACCESS` agar konsisten dengan area Finance.
- Jika nanti gudang boleh receive barang tanpa akses finance penuh, buat permission baru di fase terpisah.

## I18n

Tambahkan key di `src/i18n/messages.ts`.

Prefix yang disarankan:

```txt
purchaseDocuments.title
purchaseDocuments.subtitle
purchaseDocuments.type.purchaseRequest
purchaseDocuments.type.requestForQuotation
purchaseDocuments.type.purchaseOrder
purchaseDocuments.type.purchaseReceipt
purchaseDocuments.type.purchaseInvoice
purchaseDocuments.status.draft
purchaseDocuments.status.issued
purchaseDocuments.status.converted
purchaseDocuments.status.voided
purchaseDocuments.paymentStatus.unpaid
purchaseDocuments.paymentStatus.partial
purchaseDocuments.paymentStatus.paid
purchaseDocuments.field.supplier
purchaseDocuments.field.supplierName
purchaseDocuments.field.documentDate
purchaseDocuments.field.requiredDate
purchaseDocuments.field.quotationDueDate
purchaseDocuments.field.dueDate
purchaseDocuments.field.tax
purchaseDocuments.field.department
purchaseDocuments.field.project
purchaseDocuments.field.product
purchaseDocuments.field.quantity
purchaseDocuments.field.receivedQuantity
purchaseDocuments.field.unit
purchaseDocuments.field.price
purchaseDocuments.field.discount
purchaseDocuments.message.createSuccess
purchaseDocuments.message.updateSuccess
purchaseDocuments.message.issueSuccess
purchaseDocuments.message.convertSuccess
purchaseDocuments.message.voidSuccess
```

Jangan reuse key `salesDocuments.*` untuk teks purchase.

## Backup dan Restore

Update `src/utils/backupRestore.ts`:

- Export:

```txt
purchaseDocuments
purchaseDocumentItems
```

- Tambah ke `expectedKeys`.
- Tambah table ke list transaction restore.
- Clear table saat restore.
- Bulk add payload saat restore.
- Naikkan backup `version` jika diperlukan.

Jangan lupa urutan clear/import menyesuaikan dependency item ke header document.

## General Ledger dan Finance

Fase awal boleh tanpa payment/GL penuh.

Jika GL masuk fase ini, aturan minimal:

```txt
Purchase Receipt issued
  - belum tentu cash-out
  - jangan langsung Dr Persediaan Cr Kas jika invoice belum dibayar

Purchase Invoice issued
  - kandidat: Dr Persediaan/Expense, Cr Hutang Usaha
  - hanya jika AP design sudah diputuskan

Purchase Invoice paid
  - Dr Hutang Usaha, Cr Kas/Bank
  - butuh payment ledger agar tidak mengulang kesalahan aggregate payment
```

Karena repo sudah punya `accounts-payable` seed di COA, AP bisa masuk fase berikutnya tanpa memaksa Purchase Document fase awal terlalu besar.

## Urutan Implementasi Disarankan

### Phase 1 - Shared Extraction Minimal

1. Tambah `src/utils/documentTotals.ts`.
2. Pindahkan pure calculation dari Sales Document ke util netral.
3. Update `src/utils/salesDocuments/calculateDocumentTotal.ts` menjadi wrapper.
4. Tambah `src/utils/documentNumbers.ts` jika numbering akan dipakai dua domain.
5. Pastikan Sales Document masih build dan behavior tidak berubah.

### Phase 2 - Data Model dan Storage

1. Tambah tipe Purchase Document di `src/types/index.ts`.
2. Tambah table Dexie di `src/lib/db.ts` memakai version berikutnya.
3. Tambah backup/restore table baru.
4. Jangan isi dummy seed purchase document.

### Phase 3 - Config dan Util Purchase

1. Buat `src/configs/purchase-document`.
2. Buat config Purchase Request, RFQ, PO, Purchase Receipt, dan Purchase Invoice.
3. Buat helper path slug.
4. Buat util snapshot supplier/tax/department/project.
5. Buat mapper product ke purchase item. Untuk dokumen yang punya pricing, default price ambil dari `product.purchase_price`.
6. Buat validasi purchase document.

### Phase 4 - Service

1. Buat `purchaseDocumentService.ts`.
2. Implement draft create/update.
3. Implement issue per tipe.
4. Implement convert.
5. Implement void.
6. Tulis activity log.
7. Pastikan stok hanya berubah pada Purchase Receipt issue/void.

### Phase 5 - Hook

1. Buat `usePurchaseDocuments.tsx`.
2. Ambil master data yang sama dengan sales.
3. Filter contact supplier.
4. Tambah mutation create/update/issue/convert/void.
5. Invalidate query yang relevan saja.

### Phase 6 - UI

1. Buat route `/finance/purchases`.
2. Buat landing tile PR, RFQ, PO, GR, PI.
3. Buat per-type list.
4. Buat editor.
5. Buat detail.
6. Reuse komponen generic yang sudah diekstrak.
7. Jika ada copy component besar dari sales, hentikan dan ekstrak bagian yang sama dulu.

### Phase 7 - Navigation, Permission, I18n

1. Tambah nav Finance > Purchases.
2. Tambah tile Finance index.
3. Tambah route permission.
4. Tambah i18n id/en.
5. Pastikan label supplier tidak memakai customer wording.

### Phase 8 - Verification

Jalankan:

```bash
npm run build
```

Jika build terlalu berat atau ada error unrelated, minimal jalankan targeted TypeScript/lint sesuai file yang disentuh dan catat error yang pre-existing.

Skenario manual:

- Buat Purchase Request draft.
- Issue Purchase Request.
- Convert Purchase Request ke Request for Quotation.
- Issue Request for Quotation.
- Convert Request for Quotation ke Purchase Order.
- Issue Purchase Order.
- Convert Purchase Order ke Purchase Receipt.
- Issue Purchase Receipt dan pastikan stok bertambah.
- Void Purchase Receipt dan pastikan stok kembali.
- Convert Purchase Receipt ke Purchase Invoice.
- Pastikan Purchase Invoice unpaid tidak mengurangi cash balance.
- Backup dan restore membawa purchase document.
- Sales Document tetap bisa create/edit/issue seperti sebelumnya.

## Anti Duplicate Checklist

Sebelum commit implementation, cek:

- Tidak ada copy utuh `calculateDocumentTotal`.
- Tidak ada copy utuh `createSalesDocumentNumber`.
- Purchase tidak import dari `src/components/sales-document`.
- Sales tidak import dari `src/components/purchase-document`.
- Shared helper lintas domain berada di file netral dalam parent folder existing.
- Service purchase tidak memanggil service sales.
- Service sales tidak diubah untuk purchase kecuali memakai helper generic.
- Tidak ada table purchase dicampur ke `salesDocuments`.
- Tidak ada route purchase masuk ke `/finance/sales`.
- Tidak ada key i18n purchase yang memakai `salesDocuments.*`.
- Tidak ada side effect stok di form/hook.
- Tidak ada side effect finance di form/hook.

## Acceptance Criteria

Module dianggap siap fase awal jika:

- `/finance/purchases` muncul di Finance menu dan sidebar sesuai permission.
- Purchase Request, RFQ, PO, Purchase Receipt, dan Purchase Invoice punya list, editor, dan detail.
- Purchase Request dan RFQ issued tidak mengubah stok atau cash balance.
- Draft hanya bisa diedit saat status `DRAFT`.
- Issue Purchase Receipt menambah stok sesuai unit conversion.
- Void Purchase Receipt mengembalikan stok.
- Purchase Invoice unpaid tidak mengurangi kas.
- Data purchase ikut backup/restore.
- Build berhasil.
- Sales Document existing tidak berubah perilakunya.
- Tidak ada folder arsitektur baru di luar pola project saat ini.
