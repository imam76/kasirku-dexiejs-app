# Piutang Usaha dan Pembayaran Piutang - Spesifikasi Implementasi

Dokumen ini adalah panduan implementasi fitur daftar piutang usaha dan pembayaran piutang usaha untuk project Kasirku. Targetnya: piutang dari Sales Invoice bisa dipantau, dibayar sebagian atau penuh, dan tercatat ke cash flow dengan histori yang jelas, tanpa membuat Chart of Accounts penuh atau mengubah flow POS existing.

## Audit Kondisi Project Saat Ini

Yang sudah ada:
- Finance > Sales Document sudah memiliki table `salesDocuments` dan `salesDocumentItems`.
- `SalesDocument` sudah memiliki `type`, `status`, `due_date`, `payment_status`, `paid_amount`, `paid_at`, dan `finance_transaction_id`.
- Sales Invoice yang dibayar sudah menulis cash flow lewat category `FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT` dengan nilai `PEMBAYARAN_INVOICE_PENJUALAN`.
- Category `PEMBAYARAN_INVOICE_PENJUALAN` sudah masuk `NON_PROFIT_FINANCE_CATEGORIES`, sehingga pembayaran invoice tidak otomatis dianggap profit penuh.
- `salesDocumentService.ts` sudah memiliki `markSalesInvoicePaid(id, paymentInput)`.
- Backup/restore sudah membawa `salesDocuments` dan `salesDocumentItems`.
- Report margin Sales Document direncanakan terpisah dari POS report dan profit balance.

Yang belum ada:
- Belum ada table ledger pembayaran invoice per transaksi bayar.
- Belum ada daftar piutang usaha khusus yang menampilkan outstanding invoice dan aging.
- Belum ada histori pembayaran piutang per invoice.
- Belum ada mekanisme void/cancel pembayaran piutang yang menyimpan jejak audit.
- Belum ada daftar kas/bank atau Chart of Accounts.

Kesimpulan: fitur piutang bisa dibuat tanpa Chart of Accounts penuh, tetapi wajib memakai payment ledger agar partial payment, histori, audit, dan integrasi finance tidak menjadi technical debt.

## Prinsip Implementasi

- Sumber piutang adalah Sales Invoice, bukan POS `transactions`.
- Piutang hanya berasal dari `salesDocuments` dengan `type === 'SALES_INVOICE'`.
- Hanya invoice `ISSUED` yang dihitung sebagai piutang aktif.
- Invoice `VOIDED` tidak boleh dihitung sebagai piutang.
- Pembayaran piutang harus append-only lewat ledger pembayaran, bukan hanya overwrite `paid_amount`.
- `paid_amount` di `salesDocuments` boleh tetap disimpan sebagai aggregate/cache, tetapi nilainya harus berasal dari total ledger pembayaran aktif.
- Cash flow hanya bertambah sebesar uang yang benar-benar diterima.
- Pembayaran invoice tidak boleh otomatis menjadi profit penuh.
- Jangan membuat Chart of Accounts/double-entry di fase ini.
- Jangan mengubah total invoice historis saat pembayaran atau return dibuat.
- Service layer menjadi satu-satunya tempat mutasi piutang, pembayaran, finance balance, finance transaction, dan activity log.

## Batasan Scope Awal

Masuk scope:
- Daftar piutang usaha dari Sales Invoice.
- Summary outstanding piutang.
- Aging sederhana berdasarkan `due_date`.
- Payment ledger untuk pembayaran invoice.
- Modal/form pembayaran piutang dari daftar piutang dan detail invoice.
- Posting cash flow ke `financeTransactions` dan `financeBalance`.
- Backup/restore untuk payment ledger.
- Permission `FINANCE_ACCESS`.

Tidak masuk scope:
- Chart of Accounts penuh.
- Jurnal umum debit/kredit.
- Neraca dan buku besar.
- Multi kas/bank wajib.
- POS piutang.
- Profit balance dari Sales Invoice.
- Sales Return implementation.
- Rekonsiliasi bank.

Catatan: kalau nanti dibutuhkan multi kas/bank, tambahkan `cash_account_id` atau `payment_channel` di payment ledger. Jangan membuat Chart of Accounts penuh hanya untuk kebutuhan memilih rekening penerima pembayaran.

## Definisi Bisnis

Piutang usaha:

```ts
const invoiceTotal = Number(document.total_amount || 0);
const paidAmount = Number(document.paid_amount || 0);
const returnCreditAmount = 0; // future integration dengan Sales Return
const balanceDue = Math.max(0, invoiceTotal - paidAmount - returnCreditAmount);
```

Status piutang:
- `PAID`: `balanceDue <= 0`.
- `PARTIAL`: `paidAmount > 0` dan `balanceDue > 0`.
- `UNPAID`: `paidAmount <= 0` dan `balanceDue > 0`.

Aging:
- `CURRENT`: belum jatuh tempo.
- `OVERDUE_1_30`: lewat 1 sampai 30 hari.
- `OVERDUE_31_60`: lewat 31 sampai 60 hari.
- `OVERDUE_61_90`: lewat 61 sampai 90 hari.
- `OVERDUE_90_PLUS`: lewat lebih dari 90 hari.

Untuk fase awal, aging cukup dihitung di helper/report, tidak perlu disimpan ke table.

## Struktur File Yang Disarankan

Tambahkan file baru:

```txt
src/components/accounts-receivable/
  AccountsReceivableSummary.tsx
  AccountsReceivableTable.tsx
  ReceivablePaymentModal.tsx
  ReceivablePaymentHistory.tsx

src/hooks/
  useAccountsReceivable.tsx

src/services/
  accountsReceivableService.ts

src/utils/accountsReceivable/
  calculateReceivableBalance.ts
  buildReceivableRows.ts
  createInvoicePaymentSnapshot.ts
  validateInvoicePayment.ts

src/view/finance/receivables/
  AccountsReceivableManagement.tsx

src/routes/finance/
  receivables.lazy.tsx
```

Update file existing:
- `src/types/index.ts`: tambah type/interface payment ledger dan aging.
- `src/lib/db.ts`: tambah table Dexie baru memakai versi berikutnya dari schema live.
- `src/services/salesDocumentService.ts`: ganti atau delegasikan `markSalesInvoicePaid()` ke service baru agar logic pembayaran tidak dobel.
- `src/hooks/useSalesDocuments.tsx`: arahkan mutation payment ke service baru atau hook receivable.
- `src/view/finance/sales/SalesDocumentDetail.tsx`: pakai modal pembayaran baru dan tampilkan histori payment.
- `src/view/finance/FinanceManagement.tsx` atau route finance terkait: tambah entry/menu Piutang Usaha.
- `src/routes/__root.tsx`: tambah menu jika sidebar finance global membutuhkan link langsung.
- `src/auth/routePermissions.ts`: tambah permission `/finance/receivables`.
- `src/i18n/messages.ts`: tambah label piutang, aging, payment modal, dan payment history.
- `src/utils/backupRestore.ts`: export/import table payment ledger.
- `src/routeTree.gen.ts`: jangan edit manual; biarkan generator/build TanStack Router yang update.

## Data Model

Tambahkan type di `src/types/index.ts`.

```ts
export type SalesInvoicePaymentRecordStatus = 'ACTIVE' | 'VOIDED';

export type ReceivableAgingBucket =
  | 'CURRENT'
  | 'OVERDUE_1_30'
  | 'OVERDUE_31_60'
  | 'OVERDUE_61_90'
  | 'OVERDUE_90_PLUS';

export interface SalesInvoicePayment {
  id: string;
  sales_document_id: string;
  document_number: string;
  contact_id?: string;
  customer_name: string;
  amount: number;
  paid_at: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  finance_transaction_id?: string;
  reversal_finance_transaction_id?: string;
  notes?: string;
  status: SalesInvoicePaymentRecordStatus;
  voided_at?: string;
  void_reason?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountsReceivableRow {
  sales_document_id: string;
  document_number: string;
  contact_id?: string;
  customer_name: string;
  document_date: string;
  due_date?: string;
  total_amount: number;
  paid_amount: number;
  return_credit_amount: number;
  balance_due: number;
  payment_status: SalesInvoicePaymentStatus;
  aging_bucket: ReceivableAgingBucket;
  overdue_days: number;
}
```

Catatan naming:
- `SalesInvoicePaymentStatus` sudah dipakai untuk status bayar invoice (`UNPAID`, `PARTIAL`, `PAID`).
- Untuk status ledger pembayaran, gunakan `SalesInvoicePaymentRecordStatus` agar tidak bentrok.

## Schema Dexie

Schema live saat dokumen ini dibuat sudah memiliki `version(17)` untuk sales document. Gunakan versi berikutnya yang tersedia saat implementasi.

```ts
this.version(18).stores({
  salesInvoicePayments: 'id, sales_document_id, paid_at, status, finance_transaction_id, created_at'
});
```

Tambahkan table di class DB:

```ts
salesInvoicePayments!: Table<SalesInvoicePayment>;
```

Jika sudah ada migrasi baru setelah `version(17)`, gunakan nomor berikutnya. Jangan mengubah schema lama secara retroaktif.

## Migrasi Data Existing

Karena repo saat ini sudah punya `salesDocuments.paid_amount` dan `finance_transaction_id`, migrasi perlu menjaga pembayaran lama.

Saat menambah table `salesInvoicePayments`:
1. Cari Sales Invoice dengan `paid_amount > 0`.
2. Buat satu payment record awal per invoice.
3. Isi `amount` dari `paid_amount`.
4. Isi `paid_at` dari `paid_at` jika ada, fallback ke `updated_at`.
5. Isi `finance_transaction_id` dari document jika ada.
6. Isi `status = 'ACTIVE'`.

Contoh arah upgrade:

```ts
this.version(18).stores({
  salesInvoicePayments: 'id, sales_document_id, paid_at, status, finance_transaction_id, created_at'
}).upgrade(async (tx) => {
  const documents = await tx.table('salesDocuments')
    .where('type')
    .equals('SALES_INVOICE')
    .toArray();

  const payments = documents
    .filter((document) => Number(document.paid_amount || 0) > 0)
    .map((document) => ({
      id: crypto.randomUUID(),
      sales_document_id: document.id,
      document_number: document.document_number,
      contact_id: document.contact_id,
      customer_name: document.customer_name,
      amount: Number(document.paid_amount || 0),
      paid_at: document.paid_at || document.updated_at,
      finance_transaction_id: document.finance_transaction_id,
      status: 'ACTIVE',
      created_at: document.paid_at || document.updated_at,
      updated_at: document.updated_at,
    }));

  if (payments.length) {
    await tx.table('salesInvoicePayments').bulkAdd(payments);
  }
});
```

Sesuaikan contoh di atas dengan typing Dexie project saat implementasi. Jangan memakai migrasi yang menghapus data pembayaran lama.

## Service Layer

Buat `src/services/accountsReceivableService.ts`.

Service ini yang menulis Dexie dan menjalankan side effect:
- `recordSalesInvoicePayment(invoiceId, input)`
- `voidSalesInvoicePayment(paymentId, reason)`
- `recalculateSalesInvoicePaidAmount(invoiceId)`
- `getSalesInvoicePaymentSummary(invoiceId)`

Input pembayaran:

```ts
export interface RecordSalesInvoicePaymentInput {
  amount: number;
  paid_at?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  notes?: string;
}
```

Aturan `recordSalesInvoicePayment()`:
1. Cek permission `FINANCE_ACCESS`.
2. Ambil Sales Invoice dari `db.salesDocuments`.
3. Validasi invoice ada.
4. Validasi `type === 'SALES_INVOICE'`.
5. Validasi `status === 'ISSUED'`.
6. Hitung `balanceDue` dari total invoice dikurangi active payments dan future return credit.
7. Validasi `amount > 0`.
8. Validasi `amount <= balanceDue`.
9. Buat payment id baru.
10. Dalam satu `db.transaction`, lakukan:
    - insert `salesInvoicePayments`
    - insert `financeTransactions` category `SALES_INVOICE_PAYMENT`
    - update `financeBalance`
    - update aggregate `salesDocuments.paid_amount`
    - update `salesDocuments.payment_status`
    - update `salesDocuments.paid_at`
    - tulis activity log

Aturan finance transaction:
- `type = 'INCOME'`.
- `category = FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT`.
- `amount = input.amount`.
- `reference_id = payment.id`.
- Description menyertakan nomor invoice.

Gunakan `reference_id = payment.id`, bukan invoice id, karena satu invoice bisa punya banyak pembayaran.

Aturan aggregate invoice:
- `paid_amount = sum(active payments amount)`.
- `payment_status = 'PAID'` jika balance sudah 0.
- `payment_status = 'PARTIAL'` jika sudah ada pembayaran tetapi masih ada sisa.
- `payment_status = 'UNPAID'` jika belum ada pembayaran aktif.
- `paid_at` boleh diisi tanggal pembayaran terakhir aktif jika paid amount > 0.

## Void Pembayaran Piutang

Jangan hard delete payment record.

Aturan `voidSalesInvoicePayment(paymentId, reason)`:
1. Cek permission `FINANCE_ACCESS`.
2. Ambil payment record.
3. Validasi payment ada dan `status === 'ACTIVE'`.
4. Validasi alasan void wajib diisi.
5. Dalam satu `db.transaction`, lakukan:
   - update payment menjadi `VOIDED`
   - isi `voided_at` dan `void_reason`
   - buat finance transaction reversal
   - update `financeBalance` berkurang sebesar payment amount
   - recalculate aggregate invoice
   - tulis activity log

Reversal finance transaction:
- `type = 'EXPENSE'`.
- `category = FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT`.
- `amount = payment.amount`.
- `reference_id = payment.id`.
- Description: `Void pembayaran invoice {document_number}`.

Alasan memakai reversal:
- Histori cash flow tetap terbaca.
- Tidak menghapus transaksi finance lama.
- Audit lebih jelas dibanding delete/update diam-diam.
- Category ini sudah non-profit, jadi reversal tidak masuk biaya operasional profit.

## Helper Piutang

Buat `src/utils/accountsReceivable/calculateReceivableBalance.ts`.

Tanggung jawab helper:
- Menghitung total active payments.
- Menghitung future return credit.
- Menghitung `balance_due`.
- Menentukan `payment_status`.
- Menentukan `aging_bucket`.
- Menghitung `overdue_days`.

Contoh signature:

```ts
export interface CalculateReceivableBalanceInput {
  invoiceTotal: number;
  paidAmount: number;
  dueDate?: string;
  asOfDate?: string;
  returnCreditAmount?: number;
}

export const calculateReceivableBalance = (input: CalculateReceivableBalanceInput) => {
  // pure calculation only
};
```

Helper harus pure. Jangan baca Dexie di helper kalkulasi.

## Hook Query

Buat `src/hooks/useAccountsReceivable.tsx`.

Hook ini boleh memakai `useLiveQuery` untuk:
- `db.salesDocuments`
- `db.salesInvoicePayments`

Return hook:
- `receivableRows`
- `summary`
- `payments`
- `getInvoicePayments(invoiceId)`
- `recordPayment`
- `voidPayment`
- `isMutating`

Summary minimal:
- total invoice open.
- total outstanding.
- total overdue.
- total current.
- total paid in selected period jika filter tanggal pembayaran ada.

Filter awal:
- search customer/document number.
- payment status: semua, unpaid, partial, paid.
- aging bucket.
- due date range.
- invoice date range.

## UI dan Route

Route baru:

```txt
/finance/receivables
```

File route:

```txt
src/routes/finance/receivables.lazy.tsx
```

View:

```txt
src/view/finance/receivables/AccountsReceivableManagement.tsx
```

Menu:
- Tambahkan menu `Piutang Usaha` di area Finance.
- Jangan taruh sebagai Master Data karena ini bukan data referensi.
- Dari row piutang, user bisa buka detail Sales Invoice existing.

Kolom table daftar piutang:
- Invoice number.
- Customer.
- Invoice date.
- Due date.
- Aging/overdue days.
- Total invoice.
- Paid amount.
- Balance due.
- Payment status.
- Action: bayar, lihat invoice.

Summary cards:
- Total piutang.
- Belum jatuh tempo.
- Overdue.
- Invoice overdue count.

Payment modal:
- Invoice number.
- Customer.
- Total invoice.
- Sudah dibayar.
- Sisa piutang.
- Amount.
- Paid date.
- Payment method.
- Payment channel.
- Notes.
- Submit.

Payment history:
- Tanggal bayar.
- Amount.
- Method/channel.
- Notes.
- Finance transaction link/id.
- Status active/voided.
- Action void jika masih active.

## Integrasi Dengan Sales Invoice Detail

`src/view/finance/sales/SalesDocumentDetail.tsx` saat ini sudah punya input pembayaran sederhana. Setelah payment ledger dibuat:
- Ganti input sederhana itu dengan `ReceivablePaymentModal`.
- Tampilkan payment history di detail Sales Invoice.
- Hitung `balanceDue` dari helper piutang, bukan langsung `total_amount - paid_amount` di component.
- Jangan buat logic pembayaran baru di detail invoice.
- Detail invoice tetap tidak menampilkan HPP/gross profit/margin.

`markSalesInvoicePaid()` di `salesDocumentService.ts`:
- Opsi terbaik: deprecated dan delegasikan ke `recordSalesInvoicePayment()`.
- Jangan biarkan ada dua path berbeda untuk mencatat pembayaran invoice.

Contoh arah:

```ts
export const markSalesInvoicePaid = async (id: string, input: SalesInvoicePaymentInput) => {
  return recordSalesInvoicePayment(id, {
    amount: Number(input.paid_amount || 0),
    paid_at: input.paid_at,
  });
};
```

Catatan: contoh di atas hanya aman jika UI lama memang mengirim nilai pembayaran baru, bukan nilai kumulatif. Kalau UI lama masih mengirim `paid_amount` kumulatif, ubah UI dulu agar mengirim amount pembayaran baru sebesar nilai yang diterima saat itu.

## Integrasi Finance

Pembayaran piutang tetap memakai:

```ts
FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT
```

Aturan:
- Payment active membuat finance income.
- Void payment membuat reversal cash flow.
- Jangan memakai `FINANCE_CATEGORIES.SALES` untuk pembayaran invoice.
- Jangan memasukkan pembayaran invoice ke profit penuh.
- Jangan menambah category ini ke auto-delete `recalculateFinance()` kecuali `recalculateFinance()` juga direvisi untuk replay dari `salesInvoicePayments`.

Jika `recalculateFinance()` nanti ingin dibuat lebih lengkap:
1. Hapus/rebuild finance transaction otomatis dari `salesInvoicePayments`.
2. Replay active payments sebagai income.
3. Replay void/reversal payments sebagai expense/reversal.
4. Pastikan tidak double count dengan finance transaction manual yang sudah ada.

Untuk fase awal, cukup jaga agar category invoice payment tidak ikut auto-delete.

## Integrasi Sales Return

Sales Return belum masuk scope dokumen ini, tetapi desain piutang harus siap membaca credit note.

Saat `salesReturns` sudah stabil:
- Buat helper `getIssuedReturnCreditAmount(invoiceId)`.
- `balance_due = invoice.total_amount - activePayments - issuedReturnCreditAmount`.
- Saat record payment, validasi amount tidak melebihi net balance setelah return.
- Daftar piutang menampilkan kolom credit note jika dibutuhkan.
- Payment history tetap dipisah dari return history.

Jangan mengubah `SalesDocument.total_amount` asli ketika ada return/credit note.

## I18n

Tambahkan key di `src/i18n/messages.ts`.

Contoh key:

```txt
accountsReceivable.title
accountsReceivable.subtitle
accountsReceivable.totalOutstanding
accountsReceivable.current
accountsReceivable.overdue
accountsReceivable.invoiceCount
accountsReceivable.balanceDue
accountsReceivable.aging
accountsReceivable.recordPayment
accountsReceivable.paymentHistory
accountsReceivable.voidPayment
accountsReceivable.paymentAmount
accountsReceivable.paymentChannel
accountsReceivable.overdueDays
accountsReceivable.status.current
accountsReceivable.status.overdue1To30
accountsReceivable.status.overdue31To60
accountsReceivable.status.overdue61To90
accountsReceivable.status.overdue90Plus
accountsReceivable.message.paymentSuccess
accountsReceivable.message.voidSuccess
accountsReceivable.error.paymentTitle
accountsReceivable.error.voidTitle
```

Gunakan bahasa Indonesia dan Inggris seperti pola existing `messages.ts`.

## Permission

Gunakan `FINANCE_ACCESS` untuk:
- melihat daftar piutang.
- mencatat pembayaran.
- void pembayaran.

Tambahkan route permission:

```ts
'/finance/receivables': 'FINANCE_ACCESS'
```

Jika nanti fitur permission dibuat lebih granular, bisa dipisah:
- `RECEIVABLE_VIEW`
- `RECEIVABLE_PAYMENT_CREATE`
- `RECEIVABLE_PAYMENT_VOID`

Untuk fase awal, jangan tambah permission baru kalau project belum memerlukannya.

## Backup dan Restore

Update `src/utils/backupRestore.ts`:
- Export `salesInvoicePayments`.
- Validate key `salesInvoicePayments`.
- Clear table saat restore.
- Bulk add saat restore.

Pastikan restore tidak hanya membawa aggregate `paid_amount`, tetapi juga histori pembayaran.

## Report

Fase awal cukup daftar operasional piutang.

Report lanjutan yang bisa dibuat setelah ledger stabil:
- Aging report.
- Customer receivable statement.
- Payment collection report.
- Outstanding by customer/project/department.

Jangan campur ke POS Sales Report tanpa keputusan eksplisit, karena POS report membaca `transactions` dan `transactionItems`.

## Urutan Implementasi

Kerjakan bertahap agar tidak mengganggu Sales Document dan POS.

### Fase 1 - Helper dan Model

1. Tambah type `SalesInvoicePayment`, `SalesInvoicePaymentRecordStatus`, dan `ReceivableAgingBucket`.
2. Buat helper `calculateReceivableBalance()`.
3. Buat helper `buildReceivableRows()`.
4. Pastikan helper pure dan tidak membaca Dexie langsung.

Acceptance:
- Balance due bisa dihitung dari invoice total, paid amount, due date, dan return credit placeholder.
- Aging bucket benar untuk invoice belum jatuh tempo dan overdue.

### Fase 2 - Dexie dan Backup

1. Tambah table `salesInvoicePayments` di `src/lib/db.ts`.
2. Gunakan versi schema berikutnya dari schema live.
3. Tambah migration/backfill dari existing invoice yang sudah punya `paid_amount`.
4. Update backup/restore.

Acceptance:
- Data pembayaran lama tidak hilang.
- Backup/restore membawa ledger pembayaran.

### Fase 3 - Service Pembayaran

1. Buat `accountsReceivableService.ts`.
2. Implement `recordSalesInvoicePayment()`.
3. Implement `voidSalesInvoicePayment()`.
4. Implement recalculation aggregate invoice dari active payment ledger.
5. Tulis activity log untuk record dan void payment.
6. Pastikan finance transaction memakai `reference_id = payment.id`.

Acceptance:
- Partial payment menambah satu payment record baru.
- Invoice `paid_amount` menjadi total active payments.
- `payment_status` berubah sesuai sisa piutang.
- Cash flow hanya bertambah sebesar pembayaran yang diterima.
- Void payment tidak hard delete histori.

### Fase 4 - Hook dan Query

1. Buat `useAccountsReceivable.tsx`.
2. Query Sales Invoice dan payment ledger.
3. Return summary, rows, payment history, dan mutation.
4. Invalidate finance query dan sales document query setelah payment/void.

Acceptance:
- Daftar piutang berubah otomatis setelah pembayaran.
- Detail invoice dan daftar piutang membaca aggregate yang sama.

### Fase 5 - UI Daftar Piutang

1. Buat route `/finance/receivables`.
2. Buat `AccountsReceivableManagement.tsx`.
3. Tambah summary cards.
4. Tambah table piutang.
5. Tambah filter search/status/aging/tanggal.
6. Tambah action bayar dan lihat invoice.

Acceptance:
- User bisa melihat invoice unpaid dan partial.
- User bisa melihat sisa piutang dan overdue.
- User bisa membuka detail Sales Invoice dari row piutang.

### Fase 6 - Modal Pembayaran dan History

1. Buat `ReceivablePaymentModal`.
2. Buat `ReceivablePaymentHistory`.
3. Integrasikan modal di daftar piutang.
4. Integrasikan modal dan history di Sales Invoice detail.
5. Hapus input pembayaran sederhana yang langsung mengirim nilai kumulatif.

Acceptance:
- User mencatat pembayaran dari daftar piutang.
- User mencatat pembayaran dari detail invoice.
- Kedua entry point memakai service yang sama.
- Histori pembayaran terlihat di invoice.

### Fase 7 - Finance Safety

1. Pastikan category `SALES_INVOICE_PAYMENT` tidak dianggap profit penuh.
2. Pastikan `recalculateFinance()` tidak menghapus payment ledger finance transaction tanpa replay.
3. Pastikan payment void membuat reversal yang jelas.
4. Cek finance balance setelah payment dan void.

Acceptance:
- Finance balance naik saat payment.
- Finance balance turun saat void payment.
- Profit balance tidak naik sebesar total invoice.
- `recalculateFinance()` tidak merusak pembayaran invoice.

### Fase 8 - Sales Return Readiness

Kerjakan setelah Sales Return stabil.

1. Tambah helper return credit per invoice.
2. Masukkan return credit ke balance due.
3. Validasi payment tidak melebihi net balance setelah return.
4. Tambahkan kolom credit note jika dibutuhkan.

Acceptance:
- Invoice yang punya credit note tidak bisa overpaid.
- Piutang bersih membaca return/credit note.

### Fase 9 - QA

Manual QA minimal:
1. Buat Sales Invoice senilai 1.000.000.
2. Issue invoice.
3. Pastikan muncul di daftar piutang sebagai `UNPAID`.
4. Catat pembayaran 300.000.
5. Pastikan payment ledger bertambah satu row.
6. Pastikan invoice menjadi `PARTIAL`.
7. Pastikan balance due menjadi 700.000.
8. Pastikan finance balance naik 300.000.
9. Catat pembayaran 700.000.
10. Pastikan invoice menjadi `PAID`.
11. Pastikan balance due menjadi 0.
12. Coba bayar lagi dan pastikan ditolak.
13. Void pembayaran 700.000 dengan alasan.
14. Pastikan invoice kembali `PARTIAL`.
15. Pastikan balance due kembali 700.000.
16. Pastikan finance balance turun 700.000.
17. Backup data.
18. Restore data.
19. Pastikan payment history tetap ada.
20. Jalankan build.

## Acceptance Criteria Utama

- Ada halaman daftar piutang usaha.
- Piutang hanya berasal dari Sales Invoice `ISSUED`.
- Invoice `VOIDED` tidak dihitung sebagai piutang.
- Outstanding dihitung dari total invoice dikurangi active payments dan future return credit.
- Partial payment didukung.
- Histori pembayaran tersimpan per payment.
- Pembayaran tidak hanya overwrite `paid_amount`.
- Payment dan void payment menulis activity log.
- Cash flow bertambah hanya sebesar pembayaran yang diterima.
- Void payment tidak hard delete payment record.
- Pembayaran invoice tidak dihitung sebagai profit penuh.
- Tidak ada Chart of Accounts penuh di fase ini.
- Detail Sales Invoice dan daftar piutang memakai service pembayaran yang sama.
- Backup/restore membawa payment ledger.
- POS checkout existing tetap berjalan seperti sebelumnya.

## Catatan Keputusan

Daftar Akun/Chart of Accounts tidak dibuat pada fase ini karena project saat ini masih memakai model cash-flow category, bukan double-entry accounting. Keputusan ini bukan technical debt selama payment ledger dibuat dengan benar dan menyimpan reference yang cukup.

Field yang disiapkan untuk masa depan:
- `payment_channel` untuk nama rekening/metode non-tunai.
- `finance_transaction_id` untuk menghubungkan payment ke cash flow.
- `reversal_finance_transaction_id` untuk void payment.

Jika nanti ada Daftar Kas/Bank, cukup tambah field nullable seperti `cash_account_id`. Jika nanti app naik ke akuntansi penuh, payment ledger ini tetap bisa menjadi sumber posting jurnal tanpa membuang histori pembayaran.
