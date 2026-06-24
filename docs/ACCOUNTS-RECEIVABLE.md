# Piutang Usaha dan Payment Ledger Sales Invoice - Spesifikasi Implementasi

Dokumen ini adalah panduan implementasi fitur Piutang Usaha untuk kondisi Frayukti saat ini. Targetnya: Sales Invoice `ISSUED` bisa dipantau sebagai piutang, pembayaran invoice dicatat sebagai histori append-only, cash-flow tetap akurat, dan General Ledger memakai payment ledger sebagai source posting ketika module ledger sudah ready.

Kondisi project sudah berubah dari rencana awal: Chart of Accounts, account mapping, General Ledger, Sales Return credit note, dan pemilihan akun kas/bank payment invoice sudah tersedia. Karena itu scope piutang bukan lagi "tanpa COA", melainkan membuat payment ledger yang menjadi source of truth pembayaran invoice dan menyambungkan UI piutang ke fondasi finance/accounting yang sudah ada.

## Audit Kondisi Project Saat Ini

Yang sudah ada:

- Finance > Sales Document sudah memiliki table `salesDocuments` dan `salesDocumentItems`.
- `SalesDocument` sudah memiliki `type`, `status`, `due_date`, `payment_status`, `paid_amount`, `paid_at`, `payment_method`, `cash_account_id`, `cash_account_code`, `cash_account_name`, dan `finance_transaction_id`.
- `salesDocumentService.ts` masih memiliki `markSalesInvoicePaid(id, paymentInput)`.
- Payment invoice saat ini sudah menulis cash-flow lewat `FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT` / `PEMBAYARAN_INVOICE_PENJUALAN`.
- Category `PEMBAYARAN_INVOICE_PENJUALAN` sudah masuk `NON_PROFIT_FINANCE_CATEGORIES`, sehingga pembayaran invoice tidak otomatis dianggap profit penuh.
- Chart of Accounts sudah ada di `/finance/chart-of-accounts`.
- Default COA, `financeAccountMappings`, `accountingProfileSetting`, `enabledModules`, `generalLedgerSetting`, `journalEntries`, dan `journalEntryLines` sudah ada.
- General Ledger sudah punya posting Sales Invoice issue/payment, tetapi payment posting masih bersumber dari aggregate invoice, bukan payment ledger per pembayaran.
- Payment invoice sudah bisa memilih `TUNAI` / `NON_TUNAI` dan akun kas/bank dari COA.
- Sales Return sudah ada dan `salesDocumentService.ts` memakai `getIssuedReturnSummaryForSource()` untuk mengurangi payment status invoice dengan issued credit note.
- Backup/restore sudah membawa table finance, sales document, sales return, COA, module gate, GL setting, journal entry, dan journal line.
- POS tetap terpisah dari Finance > Sales dan tidak boleh menjadi sumber piutang usaha.

Yang belum ada:

- Belum ada table `salesInvoicePayments` sebagai ledger pembayaran invoice per transaksi bayar.
- Belum ada daftar Piutang Usaha khusus yang menampilkan outstanding invoice dan aging.
- Belum ada histori pembayaran piutang per invoice.
- Belum ada void/cancel pembayaran piutang yang menjaga payment record dan membuat reversal cash-flow.
- `markSalesInvoicePaid()` masih mengubah aggregate invoice dan finance transaction existing, sehingga belum cocok untuk partial payment append-only.
- `financeTransactions.reference_id` untuk invoice payment lama masih bisa merujuk invoice id, padahal payment ledger butuh `reference_id = payment.id`.
- General Ledger payment belum punya source id per payment record.

Kesimpulan: fitur piutang harus dimulai dari payment ledger. `salesDocuments.paid_amount` tetap boleh dipakai sebagai cache aggregate, tetapi source of truth pembayaran harus pindah ke `salesInvoicePayments`.

## Prinsip Implementasi

- Sumber piutang adalah Sales Invoice, bukan POS `transactions`.
- Piutang hanya berasal dari `salesDocuments` dengan `type === 'SALES_INVOICE'`.
- Hanya invoice `ISSUED` yang dihitung sebagai piutang aktif.
- Invoice `VOIDED` tidak boleh dihitung sebagai piutang.
- Pembayaran piutang harus append-only lewat `salesInvoicePayments`.
- `salesDocuments.paid_amount`, `paid_at`, `payment_status`, dan akun pembayaran adalah aggregate/cache dari active payment ledger.
- Cash-flow hanya bertambah sebesar uang yang benar-benar diterima pada payment record.
- Void payment tidak hard delete payment dan tidak menghapus finance transaction lama; buat reversal transaction.
- Pembayaran invoice tidak boleh otomatis menjadi profit penuh.
- Sales Return credit note mengurangi piutang bersih, tetapi tidak mengubah `SalesDocument.total_amount` asli.
- COA dipakai untuk snapshot akun kas/bank payment, tetapi payment ledger tetap operational AR layer.
- General Ledger posting hanya berjalan kalau `GENERAL_LEDGER` ready dan aktif; payment ledger harus tetap valid walaupun GL belum aktif.
- Service layer menjadi satu-satunya tempat mutasi piutang, payment ledger, finance balance, finance transaction, journal posting, dan activity log.

## Batasan Scope Awal

Masuk scope production v1:

- Daftar Piutang Usaha dari Sales Invoice `ISSUED`.
- Summary outstanding piutang.
- Aging sederhana berdasarkan `due_date`.
- Payment ledger `salesInvoicePayments`.
- Modal/form pembayaran piutang dari daftar piutang dan detail Sales Invoice.
- Payment history per invoice.
- Void payment dengan reversal cash-flow.
- Posting cash-flow ke `financeTransactions` dan `financeBalance`.
- Snapshot akun kas/bank dari COA untuk payment.
- Posting General Ledger dari payment record jika GL ready dan aktif.
- Backup/restore untuk payment ledger.
- Permission awal tetap `FINANCE_ACCESS`.

Tidak masuk scope v1:

- POS piutang.
- Profit balance dari Sales Invoice.
- Bank reconciliation.
- Full AR statement per customer.
- Period lock AR jika accounting period belum diaktifkan di production.
- Multi-currency.
- Write-off piutang.
- Overpayment/customer deposit.

Catatan accounting:

- COA dan GL sudah ada, jadi jangan lagi menulis dokumen seolah project belum punya Daftar Akun.
- Payment ledger bukan pengganti General Ledger. Payment ledger adalah source document untuk cash-flow dan journal posting.
- Jika GL belum ready/aktif, payment tetap dicatat ke cash-flow dan payment ledger; journal posting cukup skip seperti service GL existing.

## Definisi Bisnis

Piutang usaha:

```ts
const invoiceTotal = Number(document.total_amount || 0);
const activePaymentAmount = sum(activePayments.map((payment) => payment.amount));
const returnCreditAmount = issuedReturnSummary.credit_amount;
const balanceDue = Math.max(0, invoiceTotal - activePaymentAmount - returnCreditAmount);
```

Status piutang:

- `PAID`: `balanceDue <= 0`.
- `PARTIAL`: `activePaymentAmount > 0` dan `balanceDue > 0`.
- `UNPAID`: `activePaymentAmount <= 0` dan `balanceDue > 0`.

Aging:

- `CURRENT`: belum jatuh tempo.
- `OVERDUE_1_30`: lewat 1 sampai 30 hari.
- `OVERDUE_31_60`: lewat 31 sampai 60 hari.
- `OVERDUE_61_90`: lewat 61 sampai 90 hari.
- `OVERDUE_90_PLUS`: lewat lebih dari 90 hari.

Untuk fase awal, aging dihitung di helper/report dan tidak perlu disimpan ke table.

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

- `src/types/index.ts`: tambah type/interface payment ledger, aging, dan row piutang.
- `src/lib/db.ts`: tambah table Dexie `salesInvoicePayments` memakai versi berikutnya dari schema live.
- `src/services/salesDocumentService.ts`: deprecated `markSalesInvoicePaid()` dan delegasikan ke service AR.
- `src/hooks/useSalesDocuments.tsx`: arahkan mutation payment ke service AR atau hapus setelah detail invoice memakai modal AR.
- `src/view/finance/sales/SalesDocumentDetail.tsx`: pakai `ReceivablePaymentModal` dan `ReceivablePaymentHistory`.
- `src/view/finance/FinanceManagement.tsx` atau `src/routes/finance/index.tsx`: tambah entry Piutang Usaha.
- `src/routes/__root.tsx`: tambah link Finance > Piutang Usaha.
- `src/auth/routePermissions.ts`: tambah permission `/finance/receivables`.
- `src/i18n/messages.ts`: tambah label piutang, aging, payment modal, dan payment history.
- `src/utils/backupRestore.ts`: export/import table payment ledger.
- `src/services/generalLedgerService.ts`: posting payment journal sebaiknya menerima payment record, bukan aggregate invoice.
- `src/routeTree.gen.ts`: jangan edit manual; biarkan build/router generator yang update.

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
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  finance_transaction_id?: string;
  journal_entry_id?: string;
  reversal_finance_transaction_id?: string;
  reversal_journal_entry_id?: string;
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

- `SalesInvoicePaymentStatus` tetap untuk status bayar invoice (`UNPAID`, `PARTIAL`, `PAID`).
- `SalesInvoicePaymentRecordStatus` untuk status record payment (`ACTIVE`, `VOIDED`).
- `cash_account_*` adalah snapshot COA saat payment dibuat. Jangan bergantung ke nama akun live untuk histori.

## Schema Dexie

Schema live saat dokumen ini diupdate sudah sampai `version(21)` untuk `generalLedgerSetting`. Gunakan versi berikutnya:

```ts
this.version(22).stores({
  salesInvoicePayments: 'id, sales_document_id, paid_at, status, finance_transaction_id, created_at'
});
```

Tambahkan table di class DB:

```ts
salesInvoicePayments!: Table<SalesInvoicePayment>;
```

Jangan mengubah schema lama secara retroaktif.

## Migrasi Data Existing

Karena repo saat ini sudah punya `salesDocuments.paid_amount`, `paid_at`, `payment_method`, `cash_account_id`, dan `finance_transaction_id`, migrasi perlu menjaga pembayaran lama sebagai satu initial payment record per invoice.

Saat menambah table `salesInvoicePayments`:

1. Cari Sales Invoice dengan `paid_amount > 0`.
2. Buat satu payment record awal per invoice.
3. Isi `amount` dari `paid_amount`.
4. Isi `paid_at` dari `paid_at` jika ada, fallback ke `updated_at`.
5. Isi `payment_method`, `cash_account_id`, `cash_account_code`, dan `cash_account_name` dari document jika ada.
6. Isi `finance_transaction_id` dari document jika ada.
7. Isi `status = 'ACTIVE'`.
8. Jangan membuat finance transaction baru untuk migrated record yang sudah punya `finance_transaction_id`.
9. Untuk invoice lama yang paid tapi tidak punya finance transaction, jangan auto-post diam-diam; tampilkan sebagai migrated payment tanpa finance link atau buat utility repair eksplisit.

Contoh arah upgrade:

```ts
this.version(22).stores({
  salesInvoicePayments: 'id, sales_document_id, paid_at, status, finance_transaction_id, created_at'
}).upgrade(async (tx) => {
  const documents = await tx.table<SalesDocument, string>('salesDocuments')
    .where('type')
    .equals('SALES_INVOICE')
    .toArray();

  const payments = documents
    .filter((document) => Number(document.paid_amount || 0) > 0)
    .map((document) => {
      const paidAt = document.paid_at || document.updated_at;

      return {
        id: crypto.randomUUID(),
        sales_document_id: document.id,
        document_number: document.document_number,
        contact_id: document.contact_id,
        customer_name: document.customer_name,
        amount: Number(document.paid_amount || 0),
        paid_at: paidAt,
        payment_method: document.payment_method,
        cash_account_id: document.cash_account_id,
        cash_account_code: document.cash_account_code,
        cash_account_name: document.cash_account_name,
        finance_transaction_id: document.finance_transaction_id,
        status: 'ACTIVE' as const,
        notes: 'Migrasi dari aggregate pembayaran invoice lama.',
        created_at: paidAt,
        updated_at: document.updated_at,
      };
    });

  if (payments.length) {
    await tx.table('salesInvoicePayments').bulkAdd(payments);
  }
});
```

## Service Layer

Buat `src/services/accountsReceivableService.ts`.

Service ini yang menulis Dexie dan menjalankan side effect:

- `recordSalesInvoicePayment(invoiceId, input)`
- `voidSalesInvoicePayment(paymentId, reason)`
- `recalculateSalesInvoicePaidAmount(invoiceId)`
- `getSalesInvoicePaymentSummary(invoiceId)`
- `listAccountsReceivableRows(filters?)`

Input pembayaran:

```ts
export interface RecordSalesInvoicePaymentInput {
  amount: number;
  paid_at?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
  notes?: string;
}
```

Aturan `recordSalesInvoicePayment()`:

1. Cek permission `FINANCE_ACCESS`.
2. Ambil Sales Invoice dari `db.salesDocuments`.
3. Validasi invoice ada.
4. Validasi `type === 'SALES_INVOICE'`.
5. Validasi `status === 'ISSUED'`.
6. Ambil active payments invoice dari `db.salesInvoicePayments`.
7. Ambil issued return summary dari `getIssuedReturnSummaryForSource('SALES_INVOICE', invoiceId)`.
8. Hitung `balanceDue`.
9. Validasi `amount > 0`.
10. Validasi `amount <= balanceDue`.
11. Resolve akun pembayaran:
    - `TUNAI` default ke akun Kas Tunai.
    - `NON_TUNAI` default ke akun Bank / Non Tunai.
    - Jika `cash_account_id` dipilih, akun harus `type=ASSET`, active, dan postable.
12. Buat payment id baru.
13. Dalam satu `db.transaction`, lakukan:
    - insert `salesInvoicePayments`;
    - insert `financeTransactions` category `SALES_INVOICE_PAYMENT`;
    - update `financeBalance`;
    - update aggregate `salesDocuments.paid_amount`;
    - update `salesDocuments.payment_status`;
    - update `salesDocuments.paid_at`;
    - update snapshot `payment_method` dan `cash_account_*` invoice dari payment terakhir;
    - post GL payment journal jika GL ready dan aktif;
    - tulis activity log.

Aturan finance transaction:

- `type = 'INCOME'`.
- `category = FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT`.
- `amount = input.amount`.
- `reference_id = payment.id`.
- `account_id`, `account_code`, `account_name`, dan `account_type` memakai snapshot akun kas/bank payment.
- Description menyertakan nomor invoice.

Gunakan `reference_id = payment.id`, bukan invoice id, karena satu invoice bisa punya banyak pembayaran.

Aturan aggregate invoice:

- `paid_amount = sum(active payments amount)`.
- `payment_status = 'PAID'` jika balance sudah 0.
- `payment_status = 'PARTIAL'` jika sudah ada pembayaran tetapi masih ada sisa.
- `payment_status = 'UNPAID'` jika belum ada pembayaran aktif.
- `paid_at` diisi tanggal pembayaran active terakhir jika paid amount > 0.

## Void Pembayaran Piutang

Jangan hard delete payment record.

Aturan `voidSalesInvoicePayment(paymentId, reason)`:

1. Cek permission `FINANCE_ACCESS`.
2. Ambil payment record.
3. Validasi payment ada dan `status === 'ACTIVE'`.
4. Validasi alasan void wajib diisi.
5. Dalam satu `db.transaction`, lakukan:
   - update payment menjadi `VOIDED`;
   - isi `voided_at` dan `void_reason`;
   - buat finance transaction reversal;
   - update `financeBalance` berkurang sebesar payment amount;
   - reverse GL payment journal jika GL ready dan source journal ada;
   - recalculate aggregate invoice;
   - tulis activity log.

Reversal finance transaction:

- `type = 'EXPENSE'`.
- `category = FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT`.
- `amount = payment.amount`.
- `reference_id = payment.id`.
- Account snapshot sama dengan payment original.
- Description: `Void pembayaran invoice {document_number}`.

Alasan memakai reversal:

- Histori cash-flow tetap terbaca.
- Tidak menghapus transaksi finance lama.
- Audit lebih jelas dibanding delete/update diam-diam.
- Category ini sudah non-profit, jadi reversal tidak masuk biaya operasional profit.

## Helper Piutang

Buat `src/utils/accountsReceivable/calculateReceivableBalance.ts`.

Tanggung jawab helper:

- Menghitung total active payments.
- Menghitung return credit.
- Menghitung `balance_due`.
- Menentukan `payment_status`.
- Menentukan `aging_bucket`.
- Menghitung `overdue_days`.

Contoh signature:

```ts
export interface CalculateReceivableBalanceInput {
  invoiceTotal: number;
  activePaymentAmount: number;
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
- Credit note.
- Balance due.
- Payment status.
- Action: bayar, lihat invoice.

Summary:

- Total piutang.
- Belum jatuh tempo.
- Overdue.
- Invoice overdue count.

Payment modal:

- Invoice number.
- Customer.
- Total invoice.
- Sudah dibayar.
- Credit note.
- Sisa piutang.
- Amount.
- Paid date.
- Payment method.
- Cash/bank account.
- Payment channel.
- Notes.
- Submit.

Payment history:

- Tanggal bayar.
- Amount.
- Method/channel.
- Cash/bank account snapshot.
- Notes.
- Finance transaction id.
- Journal entry id jika ada.
- Status active/voided.
- Action void jika masih active.

## Integrasi Dengan Sales Invoice Detail

`src/view/finance/sales/SalesDocumentDetail.tsx` saat ini sudah punya input pembayaran sederhana dengan `payment_method` dan `cash_account_id`. Setelah payment ledger dibuat:

- Ganti input sederhana itu dengan `ReceivablePaymentModal`.
- Tampilkan `ReceivablePaymentHistory` di detail Sales Invoice.
- Hitung `balanceDue` dari helper piutang, bukan langsung `total_amount - paid_amount` di component.
- Jangan buat logic pembayaran baru di detail invoice.
- Detail invoice tetap tidak menampilkan HPP/gross profit/margin.

`markSalesInvoicePaid()` di `salesDocumentService.ts`:

- Deprecate dan delegasikan ke `recordSalesInvoicePayment()`.
- Jangan biarkan ada dua path berbeda untuk mencatat pembayaran invoice.
- Ubah UI lama supaya input yang dikirim adalah amount pembayaran baru, bukan nilai kumulatif `paid_amount`.

Contoh arah:

```ts
export const markSalesInvoicePaid = async (id: string, input: SalesInvoicePaymentInput) => {
  return recordSalesInvoicePayment(id, {
    amount: Number(input.amount || input.paid_amount || 0),
    paid_at: input.paid_at,
    payment_method: input.payment_method,
    cash_account_id: input.cash_account_id,
    notes: input.notes,
  });
};
```

Catatan: contoh di atas hanya aman setelah UI lama berhenti mengirim nilai kumulatif. Jika belum, jangan langsung delegate karena bisa membuat payment duplicate.

## Integrasi Finance

Pembayaran piutang tetap memakai:

```ts
FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT
```

Aturan:

- Payment active membuat finance income.
- Void payment membuat reversal cash-flow.
- Jangan memakai `FINANCE_CATEGORIES.SALES` untuk pembayaran invoice.
- Jangan memasukkan pembayaran invoice ke profit penuh.
- Finance transaction payment memakai `reference_id = payment.id`.
- Finance transaction lama hasil migrasi boleh tetap ada, tetapi payment baru wajib memakai payment id.
- Jangan menambah category ini ke auto-delete `recalculateFinance()` kecuali `recalculateFinance()` juga direvisi untuk replay dari `salesInvoicePayments`.

Jika `recalculateFinance()` nanti ingin dibuat lebih lengkap:

1. Hapus/rebuild finance transaction otomatis dari `salesInvoicePayments`.
2. Replay active payments sebagai income.
3. Replay void/reversal payments sebagai expense/reversal.
4. Pastikan tidak double count dengan finance transaction manual yang sudah ada.

Untuk fase awal, cukup jaga agar category invoice payment tidak ikut auto-delete.

## Integrasi General Ledger

GL sudah ada, jadi payment ledger harus siap menjadi source posting jurnal.

Aturan:

- Jika GL belum ready atau module `GENERAL_LEDGER` belum aktif, payment ledger tetap dibuat dan journal posting skip.
- Jika GL ready dan aktif, payment active membuat journal:

```txt
Dr Kas/Bank sesuai payment
  Cr Piutang Usaha
```

- Void payment membuat reversal journal, bukan hard delete journal.
- `source_type` tetap `SALES_INVOICE_PAYMENT`.
- `source_id` sebaiknya `payment.id`, bukan invoice id.
- `source_number` bisa memakai `document_number`.
- `source_event` bisa memakai:
  - `SALES_INVOICE_PAYMENT_POSTED`
  - `SALES_INVOICE_PAYMENT_VOIDED`

Catatan migrasi:

- Existing journal payment yang source id-nya invoice id tidak perlu diubah massal tanpa utility khusus.
- Payment baru setelah AR ledger harus konsisten memakai payment id agar partial payment idempotent.

## Integrasi Sales Return

Sales Return sudah ada dan invoice payment status sudah membaca issued return summary. AR harus langsung memakai integrasi ini, bukan placeholder nol.

Aturan:

- Pakai `getIssuedReturnSummaryForSource('SALES_INVOICE', invoiceId)` untuk menghitung credit note.
- `balance_due = invoice.total_amount - activePayments - issuedReturnCreditAmount`.
- Saat record payment, validasi amount tidak melebihi net balance setelah return.
- Daftar piutang menampilkan kolom credit note.
- Payment history tetap dipisah dari return history.
- Jangan mengubah `SalesDocument.total_amount` asli ketika ada return/credit note.

## I18n

Tambahkan key di `src/i18n/messages.ts`.

Contoh key:

```txt
nav.finance.receivables
finance.index.receivablesDesc
accountsReceivable.title
accountsReceivable.subtitle
accountsReceivable.totalOutstanding
accountsReceivable.current
accountsReceivable.overdue
accountsReceivable.invoiceCount
accountsReceivable.balanceDue
accountsReceivable.creditNote
accountsReceivable.aging
accountsReceivable.recordPayment
accountsReceivable.paymentHistory
accountsReceivable.voidPayment
accountsReceivable.paymentAmount
accountsReceivable.paymentChannel
accountsReceivable.cashAccount
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

Kerjakan bertahap agar tidak mengganggu Sales Document, POS, Sales Return, dan GL readiness yang sudah ada.

### Fase 0 - Stabilkan Kontrak Payment Existing

1. Audit `markSalesInvoicePaid()` dan `SalesDocumentDetail.tsx`.
2. Pastikan UI lama tidak lagi mengirim nilai kumulatif sebagai payment baru.
3. Catat behavior existing untuk invoice paid/partial dan cash account.

Acceptance:

- Behavior existing terdokumentasi sebelum diganti.
- Tidak ada dua interpretasi input pembayaran: aggregate vs payment amount.

### Fase 1 - Helper dan Model

1. Tambah type `SalesInvoicePayment`, `SalesInvoicePaymentRecordStatus`, dan `ReceivableAgingBucket`.
2. Tambah `AccountsReceivableRow`.
3. Buat helper `calculateReceivableBalance()`.
4. Buat helper `buildReceivableRows()`.
5. Pastikan helper pure dan tidak membaca Dexie langsung.

Acceptance:

- Balance due bisa dihitung dari invoice total, active payment amount, due date, dan return credit.
- Aging bucket benar untuk invoice belum jatuh tempo dan overdue.
- Credit note dari Sales Return masuk ke helper, bukan placeholder.

### Fase 2 - Dexie dan Backup

1. Tambah table `salesInvoicePayments` di `src/lib/db.ts`.
2. Gunakan `version(22)` jika schema live masih `version(21)`.
3. Tambah migration/backfill dari existing invoice yang sudah punya `paid_amount`.
4. Preserve snapshot `payment_method` dan `cash_account_*`.
5. Update backup/restore.

Acceptance:

- Data pembayaran lama tidak hilang.
- Backup/restore membawa ledger pembayaran.
- Existing invoice yang sudah paid memiliki minimal satu payment record hasil migrasi.

### Fase 3 - Service Pembayaran

1. Buat `accountsReceivableService.ts`.
2. Implement `recordSalesInvoicePayment()`.
3. Implement `voidSalesInvoicePayment()`.
4. Implement recalculation aggregate invoice dari active payment ledger.
5. Tulis activity log untuk record dan void payment.
6. Pastikan finance transaction memakai `reference_id = payment.id`.
7. Pastikan snapshot akun kas/bank tersimpan di payment dan finance transaction.

Acceptance:

- Partial payment menambah satu payment record baru.
- Invoice `paid_amount` menjadi total active payments.
- `payment_status` berubah sesuai sisa piutang setelah credit note.
- Cash-flow hanya bertambah sebesar pembayaran yang diterima.
- Void payment tidak hard delete histori.

### Fase 4 - Integrasi GL Payment

1. Ubah posting payment journal agar source id memakai `payment.id`.
2. Payment active membuat `Dr Kas/Bank, Cr Piutang Usaha` jika GL ready/aktif.
3. Void payment membuat reversal journal jika source journal ada.
4. Pastikan GL skip aman jika belum ready.

Acceptance:

- Partial payment tidak membuat journal duplicate untuk invoice yang sama.
- Journal payment bisa ditrace ke payment record.
- Void payment membuat reversal, bukan delete.

### Fase 5 - Hook dan Query

1. Buat `useAccountsReceivable.tsx`.
2. Query Sales Invoice, payment ledger, dan return credit summary.
3. Return summary, rows, payment history, dan mutation.
4. Invalidate finance, sales document, receivable, dan ledger query setelah payment/void.

Acceptance:

- Daftar piutang berubah otomatis setelah pembayaran.
- Detail invoice dan daftar piutang membaca aggregate yang sama.

### Fase 6 - UI Daftar Piutang

1. Buat route `/finance/receivables`.
2. Buat `AccountsReceivableManagement.tsx`.
3. Tambah summary.
4. Tambah table piutang.
5. Tambah filter search/status/aging/tanggal.
6. Tambah action bayar dan lihat invoice.
7. Tambah menu Finance > Piutang Usaha.

Acceptance:

- User bisa melihat invoice unpaid dan partial.
- User bisa melihat sisa piutang, credit note, dan overdue.
- User bisa membuka detail Sales Invoice dari row piutang.

### Fase 7 - Modal Pembayaran dan History

1. Buat `ReceivablePaymentModal`.
2. Buat `ReceivablePaymentHistory`.
3. Integrasikan modal di daftar piutang.
4. Integrasikan modal dan history di Sales Invoice detail.
5. Hapus input pembayaran sederhana yang langsung menulis aggregate.

Acceptance:

- User mencatat pembayaran dari daftar piutang.
- User mencatat pembayaran dari detail invoice.
- Kedua entry point memakai service yang sama.
- Histori pembayaran terlihat di invoice.
- Void payment tersedia dari payment history.

### Fase 8 - Finance Safety

1. Pastikan category `SALES_INVOICE_PAYMENT` tidak dianggap profit penuh.
2. Pastikan `recalculateFinance()` tidak menghapus payment ledger finance transaction tanpa replay.
3. Pastikan payment void membuat reversal yang jelas.
4. Cek finance balance setelah payment dan void.

Acceptance:

- Finance balance naik saat payment.
- Finance balance turun saat void payment.
- Profit balance tidak naik sebesar total invoice.
- `recalculateFinance()` tidak merusak pembayaran invoice.

### Fase 9 - QA dan Verifikasi
Verifikasi teknis:

```bash
bun run lint
bun run build
git diff --check
```

## Acceptance Criteria Utama

- Ada halaman daftar Piutang Usaha.
- Piutang hanya berasal dari Sales Invoice `ISSUED`.
- Invoice `VOIDED` tidak dihitung sebagai piutang.
- Outstanding dihitung dari total invoice dikurangi active payments dan issued return credit.
- Partial payment didukung.
- Histori pembayaran tersimpan per payment.
- Pembayaran tidak hanya overwrite `paid_amount`.
- Payment dan void payment menulis activity log.
- Cash-flow bertambah hanya sebesar pembayaran yang diterima.
- Void payment tidak hard delete payment record.
- Pembayaran invoice tidak dihitung sebagai profit penuh.
- Snapshot akun kas/bank payment tersimpan.
- General Ledger payment memakai payment id sebagai source jika GL ready/aktif.
- Detail Sales Invoice dan daftar piutang memakai service pembayaran yang sama.
- Backup/restore membawa payment ledger.
- POS checkout existing tetap berjalan seperti sebelumnya.

## Catatan Keputusan

COA dan General Ledger sekarang sudah menjadi bagian project, tetapi AR tetap membutuhkan payment ledger sendiri. Payment ledger menyimpan histori bisnis pembayaran invoice; GL menyimpan jurnal akuntansi. Keduanya tidak saling menggantikan.

Field yang dipakai sekarang:

- `payment_method` untuk tunai/non-tunai.
- `cash_account_id`, `cash_account_code`, `cash_account_name` untuk snapshot akun kas/bank.
- `payment_channel` untuk catatan channel tambahan, misalnya QRIS BCA atau transfer Mandiri.
- `finance_transaction_id` untuk menghubungkan payment ke cash-flow.
- `journal_entry_id` untuk menghubungkan payment ke GL jika aktif.
- `reversal_finance_transaction_id` dan `reversal_journal_entry_id` untuk void payment.

Jika nanti ada daftar Kas/Bank khusus, payment ledger ini tetap bisa dipakai dengan menambah referensi nullable tanpa membuang histori pembayaran.
