# Issue: Implementasi Pendapatan yang Masih Harus Diterima

Tanggal catatan: 2026-07-08

Sumber kebutuhan: `docs/KEBUTUHAN-FITUR-PENDAPATAN-YANG-MASIH-HARUS-DITERIMA.md`

## Ringkasan

Project perlu fitur **Pendapatan yang Masih Harus Diterima** atau
**Accrued Income** untuk mencatat pendapatan yang sudah diakui tetapi kas/bank
belum diterima. Fitur ini mengisi gap antara transaksi penjualan/invoice yang
sudah ada dengan kebutuhan akrual non-sales-document, misalnya jasa, pendapatan
kontrak sederhana, pendapatan bunga, atau pendapatan lain yang belum ditagih
melalui Sales Invoice.

Scope issue ini bukan hanya form UI. Implementasi dianggap selesai hanya jika
data lokal Dexie, PostgreSQL/Tauri persistence, Sync DB, read refresh, dan
realtime lintas device sudah tersambung penuh.

## Status Saat Ini

Yang sudah tersedia di repo:

- `contacts`, `departments`, `projects`, `chartOfAccounts`, `financeTransactions`,
  `journalEntries`, `accountingPeriods`, dan `closingRuns` sudah punya jalur
  Dexie, PostgreSQL/Tauri, sync queue, read refresh, dan realtime.
- `syncOrchestratorService.ts` sudah punya pola upload pending local changes,
  process queue, lalu refresh semua data dari PostgreSQL.
- `useSyncQueueWorker.ts` sudah mendengar event Tauri `postgres-data-change`,
  menjalankan `runDatabaseRefreshNow()`, dan invalidate query berdasarkan nama
  table realtime.
- General Ledger sudah punya guard periode lewat `assertAccountingPeriodOpen()`.
  Transaksi operasional bertanggal periode `LOCKED` atau `CLOSED` harus ditolak.
- Schema Dexie saat dokumen ini dibuat sudah sampai `version(80)`. Saat
  implementasi, cek lagi `src/lib/database/migrations.ts`, lalu gunakan versi
  berikutnya. Jangan menambah table baru ke `version(1)`.
- Migration PostgreSQL saat dokumen ini dibuat sudah sampai
  `src-tauri/migrations/0049_tax_coa_integration.sql`. Saat implementasi, pakai
  nomor migration berikutnya yang tersedia.

Yang belum tersedia:

- Entity lokal/remote untuk accrued income.
- Service create/update/issue/void/receive payment untuk accrued income.
- Posting General Ledger khusus accrued income.
- Category finance transaction untuk penerimaan accrued income.
- Route, menu, list, editor, detail, dan action pembayaran accrued income.
- Sync queue, read refresh, dan realtime table/query key untuk accrued income.

## Masalah Bisnis

Tanpa fitur ini, user harus memakai jurnal manual atau transaksi pemasukan biasa
untuk pendapatan yang belum diterima. Dampaknya:

- Pendapatan dan kas bisa tercampur, padahal secara akrual kas belum masuk.
- Laporan laba rugi bisa tidak akurat jika pendapatan baru dicatat saat kas
  diterima.
- Jika user memakai finance income saat pengakuan dan saat penerimaan, laba bisa
  double count.
- Tidak ada daftar monitoring pendapatan akrual yang belum diterima.
- Multi-device rawan berbeda jika data baru hanya berhenti di Dexie lokal.

## Tujuan

- Menyediakan form dan daftar Pendapatan yang Masih Harus Diterima.
- Mengakui pendapatan akrual dengan jurnal:
  - Debit `Pendapatan yang Masih Harus Diterima` atau accrued income receivable.
  - Credit akun pendapatan sesuai baris detail.
- Mencatat penerimaan kas/bank terpisah saat pembayaran benar-benar diterima.
- Membuat monitoring unpaid/partial/paid untuk accrued income.
- Menjaga period lock dan closing period.
- Menyediakan sync DB dan realtime penuh lintas device.

## Non-Goal Tahap Awal

- Tidak membuat revenue recognition schedule/kontrak PSAK 72 yang kompleks.
- Tidak membuat recurring accrual otomatis.
- Tidak membuat multi-currency aktif. Field mata uang tetap terkunci IDR untuk
  MVP, tetapi schema boleh menyimpan snapshot currency base agar selaras dengan
  dokumen finance lain.
- Tidak membuat master Cost Code baru. Field `cost_code` boleh disimpan sebagai
  snapshot/string opsional sampai ada modul master cost code.
- Tidak membuat fitur template transaksi penuh. Tombol `Buka Template` boleh
  disembunyikan atau disabled sampai ada scope template terpisah.

## Keputusan Akuntansi

### Akun Detail

Field `Akun` pada detail transaksi harus merepresentasikan **akun pendapatan**,
bukan akun kas/bank. Contoh akun kas pada dokumen kebutuhan dianggap contoh UI
generic dan tidak boleh dipakai sebagai aturan accounting untuk fitur ini.

Validasi MVP:

- Baris detail hanya boleh memilih akun `REVENUE` yang aktif dan postable.
- Akun `CONTRA_REVENUE` ditunda sampai ada kebutuhan diskon/retur accrued income.
- Akun kas/bank hanya dipilih saat action `Terima Pembayaran`.

### Akun Akrual

Tambahkan seed COA jika belum ada:

```ts
createAccountSeed(
  'accrued-income-receivable',
  '1140',
  'Pendapatan yang Masih Harus Diterima',
  'ASSET',
)
```

Catatan:

- Pakai kode berikutnya yang tidak bentrok dengan seed live.
- Akun ini harus ikut sync `chartOfAccounts` seperti seed COA lain.
- Tambahkan mapping jika service membutuhkan lookup berbasis key.

### Jurnal Saat Issue

Saat dokumen di-issue:

```txt
Dr Pendapatan yang Masih Harus Diterima
  Cr Pendapatan baris 1
  Cr Pendapatan baris 2
```

Aturan:

- Tidak membuat `financeTransactions` saat issue karena belum ada cash movement.
- Journal source type baru: `ACCRUED_INCOME`.
- Source event baru:
  - `ACCRUED_INCOME_ISSUED`
  - `ACCRUED_INCOME_VOIDED`
  - `ACCRUED_INCOME_RECEIPT_RECORDED`
  - `ACCRUED_INCOME_RECEIPT_VOIDED`
- Gunakan helper General Ledger existing untuk idempotency source
  `source_type + source_id + source_event`.

### Jurnal Saat Pembayaran Diterima

Saat pembayaran diterima:

```txt
Dr Kas/Bank
  Cr Pendapatan yang Masih Harus Diterima
```

Aturan:

- Buat `financeTransactions` bertipe `INCOME` hanya saat kas/bank diterima.
- Tambahkan category baru, misalnya
  `FINANCE_CATEGORIES.ACCRUED_INCOME_RECEIPT =
  'PENERIMAAN_PENDAPATAN_AKRUAL'`.
- Category ini harus masuk `NON_PROFIT_FINANCE_CATEGORIES` agar penerimaan kas
  tidak menambah laba lagi. Jangan masukkan ke `NON_INCOME_REPORT_FINANCE_CATEGORIES`
  supaya tetap terlihat sebagai arus masuk pada laporan pemasukan berbasis kas.
- Jika pembayaran di-void, buat finance transaction reversal bertipe `EXPENSE`
  dengan category yang sama, mengikuti pola void payment AR.

## Data Model Usulan

### AccruedIncomeDocument

```ts
export type AccruedIncomeStatus = 'DRAFT' | 'ISSUED' | 'VOIDED';
export type AccruedIncomePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface AccruedIncomeDocument {
  id: string;
  document_number: string;
  status: AccruedIncomeStatus;
  payment_status: AccruedIncomePaymentStatus;
  contact_id?: string;
  contact_name: string;
  accrual_category?: string;
  document_date: string;
  due_date?: string;
  expected_payment_date?: string;
  paid_at?: string;
  description?: string;
  department_id?: string;
  department_name?: string;
  project_id?: string;
  project_name?: string;
  cost_code?: string;
  currency_code: 'IDR';
  currency_name?: string;
  currency_symbol?: string;
  base_currency_code: 'IDR';
  exchange_rate: 1;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  journal_entry_id?: string;
  voided_at?: string;
  void_reason?: string;
  reversal_journal_entry_id?: string;
  version?: number;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

### AccruedIncomeLine

```ts
export interface AccruedIncomeLine {
  id: string;
  document_id: string;
  line_number: number;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: 'REVENUE';
  description?: string;
  amount: number;
  department_id?: string;
  project_id?: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}
```

### AccruedIncomeReceipt

```ts
export type AccruedIncomeReceiptStatus = 'ACTIVE' | 'VOIDED';

export interface AccruedIncomeReceipt {
  id: string;
  document_id: string;
  document_number: string;
  receipt_number: string;
  status: AccruedIncomeReceiptStatus;
  amount: number;
  received_at: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id: string;
  cash_account_code?: string;
  cash_account_name: string;
  finance_transaction_id?: string;
  journal_entry_id?: string;
  notes?: string;
  voided_at?: string;
  void_reason?: string;
  reversal_finance_transaction_id?: string;
  reversal_journal_entry_id?: string;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

Catatan desain:

- Simpan receipt sebagai ledger append-only agar payment history tidak hilang.
- `paid_amount` dan `payment_status` di header adalah aggregate dari receipt
  `ACTIVE`.
- Jika ingin scope lebih kecil, UI MVP boleh hanya full payment, tetapi schema
  receipt harus tetap menyimpan `amount` agar tidak memblokir partial payment.

## Dexie

Tambahkan table di `src/lib/database/KasirkuDB.ts`:

- `accruedIncomeDocuments`
- `accruedIncomeLines`
- `accruedIncomeReceipts`

Tambahkan migration Dexie versi berikutnya:

```ts
this.version(NEXT_VERSION).stores({
  accruedIncomeDocuments:
    'id, document_number, status, payment_status, contact_id, document_date, due_date, expected_payment_date, paid_at, department_id, project_id, sync_status, updated_at, created_at',
  accruedIncomeLines:
    'id, document_id, account_id, account_code, created_at',
  accruedIncomeReceipts:
    'id, document_id, receipt_number, status, received_at, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
});
```

Tambahkan type sync status alias di `src/types/index.ts`.

## PostgreSQL dan Tauri

Buat migration PostgreSQL baru, misalnya
`src-tauri/migrations/0050_accrued_income.sql` jika nomor tersebut masih
tersedia saat implementasi.

Table remote:

- `accrued_income_documents`
- `accrued_income_lines`
- `accrued_income_receipts`

Minimal index:

- `accrued_income_documents(document_number)`
- `accrued_income_documents(status)`
- `accrued_income_documents(payment_status)`
- `accrued_income_documents(contact_id)`
- `accrued_income_documents(document_date)`
- `accrued_income_documents(updated_at)`
- `accrued_income_documents(deleted_at)`
- `accrued_income_lines(document_id)`
- `accrued_income_receipts(document_id)`
- `accrued_income_receipts(status)`
- `accrued_income_receipts(updated_at)`

Remote conflict rule:

- Header memakai `version` + `updated_at`, mengikuti pola accounting period,
  finance transaction, journal bundle, sales/purchase document.
- Lines mengikuti bundle header yang menang.
- Receipt harus idempotent per `id`. Jangan menghapus receipt remote hanya
  karena tidak ada pada payload lama; void harus lewat status `VOIDED`.

Tambahkan:

- Rust DTO di `src-tauri/src/models/accrued_income.rs`.
- Repository di `src-tauri/src/repositories/accrued_income_repository.rs`.
- Commands di `src-tauri/src/commands/accrued_income_commands.rs`.
- Registrasi module dan command di `src-tauri/src/lib.rs`.
- Adapter frontend di `src/services/postgresAdapter.ts`.

Command yang disarankan:

- `postgres_list_accrued_income_bundles`
- `postgres_get_accrued_income_bundle`
- `postgres_upsert_accrued_income_bundle`

Bundle DTO:

```ts
export interface RemoteAccruedIncomeBundleDto {
  document: RemoteAccruedIncomeDocumentDto;
  lines: RemoteAccruedIncomeLineDto[];
  receipts: RemoteAccruedIncomeReceiptDto[];
}
```

## Sync DB dan Realtime Wajib

Bagian ini wajib. Jangan menganggap fitur selesai jika hanya tersimpan di Dexie.

### Sync Queue

Update `src/services/syncQueueService.ts`:

- Tambahkan entity constant:
  - `ACCRUED_INCOME_ENTITY = 'accruedIncomeDocuments'`
- Mapper local ke `RemoteAccruedIncomeBundleDto`.
- Payload guard `isRemoteAccruedIncomeBundleDto`.
- Processor queue yang memanggil `accruedIncomePostgresAdapter.upsertBundle`.
- Metadata updater untuk header dan receipt sync status.
- Enqueue helper:
  - `enqueueAccruedIncomeBundleSync(document, lines, receipts, operation)`
- Pending scanner:
  - `enqueuePendingAccruedIncomeForSync()`
  - baca document/receipt dengan `sync_status` `pending` atau `failed`.

Update `src/services/syncOrchestratorService.ts`:

- Import `refreshAccruedIncomeFromPostgres`.
- Panggil `enqueuePendingAccruedIncomeForSync()` dalam
  `enqueueAllPendingLocalChangesForSync()`.
- Panggil `refreshAccruedIncomeFromPostgres()` dalam
  `refreshAllDataFromPostgres()`.

### Read Refresh

Buat `src/services/accruedIncomeReadService.ts`:

- `refreshAccruedIncomeFromPostgres()`
- `mergeRemoteAccruedIncomeBundlesIntoDexie()`
- Tidak menimpa local row yang masih `pending` atau `failed`.
- Recalculate aggregate header dari receipt active setelah merge.
- Preserve local draft yang belum tersync.

### Realtime Trigger

Tambahkan trigger realtime untuk table baru.

Jika memakai migration baru:

```sql
DROP TRIGGER IF EXISTS kasirku_notify_data_change ON accrued_income_documents;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON accrued_income_documents
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
```

Ulangi untuk:

- `accrued_income_lines`
- `accrued_income_receipts`

Jika perlu, update juga daftar table di
`src-tauri/migrations/0034_realtime_notifications.sql` hanya sebagai catatan
historis, tetapi migration baru harus memasang trigger agar database existing
langsung aktif setelah migrasi.

### Frontend Realtime Handler

Update `src/hooks/useSyncQueueWorker.ts`:

- Tambahkan table ke whitelist finance realtime:
  - `accrued_income_documents`
  - `accrued_income_lines`
  - `accrued_income_receipts`
- Tambahkan query keys:
  - `accruedIncome`
  - `accruedIncomeDocuments`
  - `accruedIncomeDetail`
  - `accruedIncomeReceipts`
  - `financeBalance`
  - `financeTransactions`
  - `journalEntries`
  - `trialBalance`
  - `incomeStatement`
  - `balanceSheet`

Acceptance realtime minimal:

- Device A issue accrued income.
- Device B menerima event realtime, refresh DB, dan list/detail accrued income
  berubah tanpa klik Sync DB manual.
- Device A record receipt.
- Device B melihat status payment berubah dan finance balance/journal report
  ikut refresh.

## Service dan Workflow

Buat service baru:

- `src/services/accruedIncomeService.ts`

Function minimal:

- `listAccruedIncomeDocuments(filters)`
- `getAccruedIncomeDetail(id)`
- `createAccruedIncomeDraft(input)`
- `updateAccruedIncomeDraft(id, input)`
- `issueAccruedIncome(id)`
- `voidAccruedIncome(id, reason)`
- `recordAccruedIncomeReceipt(id, input)`
- `voidAccruedIncomeReceipt(receiptId, reason)`

Aturan workflow:

- `DRAFT` boleh diedit dan dihapus/void tanpa jurnal.
- `ISSUED` tidak boleh edit field inti atau lines.
- `ISSUED` boleh record receipt selama outstanding > 0.
- Receipt tidak boleh melebihi outstanding.
- `VOIDED` read-only.
- Dokumen issued dengan receipt active tidak boleh di-void sebelum receipt
  di-void.
- Semua posting journal/receipt wajib memanggil `assertAccountingPeriodOpen()`.
- Semua write harus dalam Dexie transaction yang mencakup document, lines,
  receipts, financeTransactions, financeBalance, journalEntries,
  journalEntryLines, activityLogs.
- Setelah transaction sukses, enqueue sync untuk accrued income bundle, finance
  transaction, dan journal bundle.

## General Ledger

Update `src/types/index.ts`:

- Tambahkan `ACCRUED_INCOME` ke `JournalSourceType`.

Update `src/services/generalLedgerService.ts`:

- `postAccruedIncomeIssuedJournal(document, lines, actor)`
- `reverseAccruedIncomeIssuedJournal(document, reason, actor)`
- `postAccruedIncomeReceiptJournal(document, receipt, actor)`
- `reverseAccruedIncomeReceiptJournal(receipt, reason, actor)`

Pastikan:

- Journal balance sebelum disimpan.
- Idempotent by source.
- Source event konsisten.
- Reversal journal memakai tanggal reversal di periode open.
- Department/project dari header atau line ikut masuk `JournalEntryLine` jika
  tersedia.

## UI dan Route

Lokasi yang disarankan:

- Route list: `/finance/accrued-income`
- Route create: `/finance/accrued-income/new`
- Route detail: `/finance/accrued-income/$documentId`
- Route edit draft: `/finance/accrued-income/$documentId/edit`

Komponen:

- `src/view/finance/accrued-income/AccruedIncomeManagement.tsx`
- `src/view/finance/accrued-income/AccruedIncomeEditor.tsx`
- `src/view/finance/accrued-income/AccruedIncomeDetail.tsx`
- `src/view/finance/accrued-income/AccruedIncomeReceiptModal.tsx`

Form mengikuti kebutuhan:

- Header:
  - Akan Diterima Dari: select `contacts`, plus jalur tambah contact jika pola
    existing mudah direuse.
  - Kategori Akrual: select/string.
  - Tanggal: default hari ini.
  - No. Referensi: auto-generate `AI000001`, editable.
  - Deskripsi.
  - Departemen.
  - Proyek.
  - Kode Biaya: optional string/select sederhana.
  - Mata Uang: IDR disabled.
- Detail:
  - Akun pendapatan.
  - Total.
  - Deskripsi line optional saat expand row.
  - Tambah/hapus row.
- Pilihan lainnya:
  - Jatuh tempo.
  - Estimasi tanggal pembayaran.
- Ringkasan:
  - Total row.
  - Total.
  - Paid amount.
  - Outstanding.
- Actions:
  - Save draft.
  - Issue.
  - Terima Pembayaran.
  - Void document.
  - Void receipt.
  - Batal.

Tambahkan menu di:

- `src/routes/finance/index.tsx`
- `src/routes/__root.tsx`

Permission:

- MVP boleh pakai `FINANCE_ACCESS`, mengikuti cash flow, receivables, dan
  payables.
- Jika ingin permission khusus, tambahkan `ACCRUED_INCOME_MANAGE` ke
  `Permission`, `permissionCatalog`, `ROLE_PERMISSIONS`, route permission,
  role seed migration, dan setup module. Jangan menambah permission khusus tanpa
  menyelesaikan migrasi role permission.

## I18n

Tambahkan label minimal di file i18n yang relevan:

- `nav.finance.accruedIncome`
- `finance.accruedIncome.*`
- `finance.category.PENERIMAAN_PENDAPATAN_AKRUAL`
- Message success/error untuk create/update/issue/receipt/void.

## Laporan dan Integrasi

- List accrued income harus bisa filter:
  - status
  - payment status
  - contact
  - date range
  - due date range
  - department
  - project
- General Ledger reports otomatis terbaca dari `journalEntries`.
- Income Statement membaca revenue dari journal issue, bukan finance receipt.
- Cash flow/cash balance berubah hanya dari receipt finance transaction.
- Accounts Receivable existing tidak perlu digabung pada fase ini. Jika nanti
  butuh laporan piutang terpadu, buat issue terpisah.

## File Yang Perlu Diaudit Saat Implementasi

- `src/types/index.ts`
- `src/lib/database/KasirkuDB.ts`
- `src/lib/database/migrations.ts`
- `src/constants/chartOfAccounts.ts`
- `src/constants/finance.ts`
- `src/services/generalLedgerService.ts`
- `src/services/financeTransactionSyncService.ts`
- `src/services/journalEntrySyncService.ts`
- `src/services/syncQueueService.ts`
- `src/services/syncOrchestratorService.ts`
- `src/services/postgresAdapter.ts`
- `src/hooks/useSyncQueueWorker.ts`
- `src/routes/__root.tsx`
- `src/routes/finance/index.tsx`
- `src-tauri/src/lib.rs`
- `src-tauri/src/models`
- `src-tauri/src/repositories`
- `src-tauri/src/commands`
- `src-tauri/migrations`

## Rencana Implementasi

### Tahap 0: Audit dan keputusan final

- Cek versi Dexie dan migration PostgreSQL terbaru.
- Cek apakah akun `1140` atau id `accrued-income-receivable` sudah ada.
- Pastikan tidak ada modul cost code existing.
- Pastikan route/menu finance terbaru.

### Tahap 1: Data model dan persistence

- Tambah type TS, Dexie tables, seed COA, finance category.
- Tambah PostgreSQL migration, Rust DTO/repository/command, dan adapter.
- Tambah read refresh service.

### Tahap 2: Service domain dan General Ledger

- Implement CRUD draft, issue, void, receipt, void receipt.
- Implement journal posting dan reversal.
- Enqueue finance transaction dan journal bundle setelah write.
- Tulis activity log untuk setiap action penting.

### Tahap 3: Sync queue dan realtime

- Tambah queue entity, mapper, validator, processor, metadata updater, scanner.
- Tambah orchestrator enqueue/refresh.
- Tambah realtime trigger dan frontend table/query invalidation.
- Uji Sync DB manual dan realtime dua device.

### Tahap 4: UI

- Tambah route, menu, list, editor, detail, receipt modal.
- Reuse pola AntD + RHF/Zod jika sesuai pola form existing.
- Pastikan mobile tidak overlap dan table tetap usable.

### Tahap 5: Testing dan hardening

- Unit/domain test jika pattern test tersedia.
- E2E Playwright untuk create draft, issue, receipt, void receipt, dan realtime
  smoke jika environment mendukung.
- Jalankan validasi repo.

## Acceptance Criteria

- User bisa membuat draft accrued income dengan field sesuai kebutuhan.
- No. referensi default memakai prefiks `AI` dan unik.
- User bisa menambah lebih dari satu baris akun pendapatan.
- Issue membuat journal balanced, tidak membuat finance transaction.
- Issue ditolak jika tanggal berada pada periode `LOCKED` atau `CLOSED`.
- Receipt membuat finance transaction income, menaikkan `financeBalance`, dan
  membuat journal balanced Dr Kas/Bank Cr accrued income receivable.
- Receipt category tidak menambah profit/laba lagi.
- Partial receipt memperbarui payment status menjadi `PARTIAL`; full receipt
  menjadi `PAID`.
- Void receipt membuat reversal finance transaction dan reversal journal.
- Void document issued tanpa receipt active membuat reversal journal issue.
- Data document, lines, receipts, finance transaction, journal entry, dan activity
  log masuk sync queue.
- Klik Sync DB di Device A meng-upload data ke PostgreSQL.
- Device B setelah refresh manual melihat document, lines, receipts, payment
  status, finance transaction, dan journal.
- Realtime event dari PostgreSQL membuat Device B refresh tanpa klik manual.
- Local pending/failed data tidak tertimpa read refresh remote.
- Lint/build/test yang relevan lulus, atau jika gagal karena issue existing,
  catat file/rule yang tidak terkait.

## Test Plan

Minimal manual QA:

1. Buat contact test.
2. Buat accrued income draft dengan 2 line revenue.
3. Save draft, reload halaman, pastikan draft tetap ada.
4. Issue document.
5. Cek journal entry:
   - total debit = total credit.
   - debit ke accrued income receivable.
   - credit ke akun revenue line.
6. Cek finance balance tidak berubah setelah issue.
7. Record receipt full payment ke akun Kas/Bank.
8. Cek finance balance bertambah.
9. Cek journal receipt:
   - debit Kas/Bank.
   - credit accrued income receivable.
10. Void receipt, pastikan finance balance turun kembali dan reversal journal
    dibuat.
11. Void accrued income, pastikan issue journal direversal.
12. Buat periode accounting `LOCKED`, lalu coba issue tanggal dalam periode itu.
    Sistem harus menolak.
13. Jalankan Sync DB.
14. Di device/session lain, refresh/realtime harus menampilkan data yang sama.

Automated test yang disarankan:

- Service test untuk payment status calculation.
- Service test untuk period lock guard.
- E2E happy path create draft -> issue -> receipt.
- E2E void receipt/document.
- E2E sync/realtime smoke jika test environment PostgreSQL tersedia.

## Label Usulan

- `feature`
- `finance`
- `general-ledger`
- `sync-db`
- `realtime`
- `tauri-postgres`
