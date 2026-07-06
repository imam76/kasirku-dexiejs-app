# Issue: Tutup Buku Akhir Tahun dan Closing Period General Ledger

Tanggal catatan: 2026-07-06

## Ringkasan

Sistem sudah punya fondasi General Ledger: cutoff ledger, opening balance,
journal entries, journal lines, manual journal, trial balance, laporan laba
rugi/SHU, neraca, dan perubahan ekuitas. Namun proses tutup buku akhir tahun
belum terakomodir sebagai fitur produk yang aman.

Saat ini user masih bisa memakai jurnal manual untuk adjustment atau simulasi
closing, tetapi belum ada periode akuntansi, period lock, closing run, jurnal
penutup khusus, atau proteksi agar transaksi tahun yang sudah ditutup tidak
berubah. Akibatnya laporan akhir tahun yang sudah dipakai manajemen/RAT/audit
masih bisa berubah jika ada transaksi lama, void, reversal, atau jurnal manual
baru yang bertanggal periode tersebut.

## Status Saat Ini

Yang sudah tersedia:

- `journalEntries` dan `journalEntryLines` sebagai ledger double-entry.
- Posting otomatis untuk beberapa source transaksi operasional.
- `OPENING_BALANCE` untuk mulai ledger dari cutoff tertentu.
- `MANUAL_JOURNAL` untuk adjustment manual dengan permission `JOURNAL_MANAGE`.
- Laporan GL: journal list, buku besar, trial balance, income statement, dan
  balance sheet.
- Laporan koperasi: neraca, SHU, perubahan ekuitas, arus kas, dan rekonsiliasi.
- Akun `3100 - Saldo Laba` sudah tersedia di template COA umum.

Yang belum tersedia:

- Master periode akuntansi tahunan/bulanan.
- Status periode `OPEN`, `LOCKED`, dan `CLOSED`.
- Validasi posting terhadap periode locked/closed.
- Tombol/proses `Tutup Buku`.
- Jurnal penutup dengan source type khusus, misalnya `CLOSING_JOURNAL`.
- Auto-closing akun nominal pendapatan, kontra pendapatan, dan beban.
- Pemindahan laba rugi/SHU periode ke `Saldo Laba` atau akun SHU yang sesuai.
- Mekanisme buka ulang periode tertutup dengan audit trail dan reversal.
- Sync DB dan realtime untuk table baru `accountingPeriods`/`closingRuns` belum
  ada, sehingga closing belum aman untuk skenario multi-device.

## Masalah Bisnis

Tanpa fitur closing period, beberapa risiko muncul:

- Laporan akhir tahun bisa berubah setelah dilaporkan.
- User bisa posting transaksi mundur ke tahun yang sudah selesai.
- Void/reversal transaksi lama bisa mengubah saldo historis tanpa kontrol.
- Jurnal manual penutup bisa ikut terbaca sebagai mutasi normal laba rugi.
- Tidak ada jejak formal kapan periode ditutup dan oleh siapa.
- Koperasi tidak punya alur resmi untuk menetapkan SHU akhir tahun sebelum RAT
  atau pembagian/penahanan SHU.
- Jika satu device menutup buku tetapi device lain belum tersinkron, user lain
  masih bisa melihat periode terbuka dan berpotensi input transaksi lama.

## Tujuan

- Membuat periode akuntansi yang bisa dibuka, dikunci, dan ditutup.
- Menyediakan workflow tutup buku akhir tahun dari review sampai posting.
- Membuat jurnal penutup khusus yang tidak mengotori laporan operasional.
- Memindahkan laba/rugi atau SHU periode berjalan ke ekuitas/saldo laba.
- Melindungi transaksi periode tertutup dari perubahan langsung.
- Tetap menyediakan jalur adjustment pasca-closing yang auditable.

## Non-Goal Tahap Awal

- Tidak perlu menghitung pajak penghasilan badan otomatis.
- Tidak perlu membuat distribusi SHU lengkap ke jasa modal, jasa usaha, dana
  cadangan, dana pengurus, dan dana sosial di versi pertama.
- Tidak perlu backfill seluruh transaksi sebelum cutoff ledger.
- Tidak perlu multi fiscal calendar yang kompleks di versi pertama.

## Data Model Usulan

### AccountingPeriod

```ts
export type AccountingPeriodStatus = 'OPEN' | 'LOCKED' | 'CLOSED';
export type AccountingPeriodType = 'MONTHLY' | 'YEARLY';

export interface AccountingPeriod {
  id: string;
  name: string;
  period_type: AccountingPeriodType;
  start_date: string;
  end_date: string;
  status: AccountingPeriodStatus;
  locked_at?: string;
  closed_at?: string;
  closed_by?: string;
  closed_by_name?: string;
  closing_journal_entry_id?: string;
  reopened_at?: string;
  reopened_by?: string;
  reopened_by_name?: string;
  reopen_reason?: string;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

### ClosingRun

```ts
export type ClosingRunStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export interface ClosingRun {
  id: string;
  period_id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  status: ClosingRunStatus;
  retained_earning_account_id: string;
  retained_earning_account_code: string;
  retained_earning_account_name: string;
  net_income_amount: number;
  total_revenue_amount: number;
  total_contra_revenue_amount: number;
  total_expense_amount: number;
  closing_journal_entry_id?: string;
  posted_at?: string;
  reversed_at?: string;
  reversal_journal_entry_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

### Journal Source Type

Tambahkan source type:

```ts
export type JournalSourceType =
  | ExistingJournalSourceType
  | 'CLOSING_JOURNAL';
```

Tambahkan source event:

```ts
YEAR_END_CLOSING_POSTED
YEAR_END_CLOSING_REVERSED
```

## Aturan Periode

- `OPEN`: transaksi dan posting normal boleh berjalan.
- `LOCKED`: transaksi lama tidak boleh diubah oleh workflow operasional.
  Adjustment hanya boleh lewat jurnal adjustment di periode open atau role khusus.
- `CLOSED`: periode sudah final. Posting source document, void, edit, dan jurnal
  manual bertanggal periode ini harus ditolak.
- Reopen periode closed hanya boleh role owner/admin tertinggi, wajib isi alasan,
  dan harus membuat audit log.
- Jika closing journal sudah posted, reopen harus reversal closing journal dulu
  atau menandai closing run sebagai reversed.

## Workflow Tutup Buku Akhir Tahun

1. User memilih periode, contoh `2026-01-01` sampai `2026-12-31`.
2. Sistem menjalankan pre-check:
   - General Ledger aktif dan ready.
   - Opening balance sudah posted.
   - PostgreSQL tersedia, sync queue tidak punya item pending/failed yang
     mempengaruhi ledger/periode.
   - Data periode, journal, COA, dan setting ledger sudah refresh dari remote
     sebelum preview final.
   - Semua akun yang dipakai aktif dan postable.
   - Trial balance balance.
   - Tidak ada jurnal draft/unposted di periode tersebut.
   - Rekonsiliasi kas/bank, piutang, hutang, stok, pinjaman, dan simpanan sudah
     tidak punya warning kritikal.
3. Sistem menampilkan preview:
   - Trial balance akhir periode sebelum closing.
   - Laba rugi/SHU periode.
   - Neraca sebelum closing.
   - Daftar akun nominal yang akan ditutup.
   - Jurnal penutup yang akan diposting.
4. User mengunci periode (`LOCKED`) sebelum posting closing.
5. User posting closing run.
6. Sistem membuat `CLOSING_JOURNAL`.
7. Sistem mengubah status periode menjadi `CLOSED`.
8. Sistem enqueue sync untuk period, closing run, closing journal bundle, dan
   activity log.
9. Sistem menunggu sync sukses atau menampilkan status pending/failed yang jelas.
10. Device lain menerima realtime event dan refresh data terkait.
11. Sistem menampilkan neraca setelah closing dan saldo laba/ekuitas akhir.

## Rumus Closing Journal

Untuk setiap akun nominal:

- Akun `REVENUE` normal credit ditutup dengan debit sebesar saldo akhirnya.
- Akun `CONTRA_REVENUE` normal debit ditutup dengan credit sebesar saldo akhirnya.
- Akun `EXPENSE` normal debit ditutup dengan credit sebesar saldo akhirnya.
- Selisihnya masuk ke akun ekuitas:
  - Profit/SHU positif: credit `Saldo Laba` atau akun SHU ditahan.
  - Rugi/SHU negatif: debit `Saldo Laba` atau akun akumulasi rugi.

Contoh profit:

```txt
Dr Pendapatan
  Cr Retur/Diskon Penjualan
  Cr Beban
  Cr Saldo Laba
```

Contoh rugi:

```txt
Dr Pendapatan
Dr Saldo Laba
  Cr Retur/Diskon Penjualan
  Cr Beban
```

Catatan: implementasi harus membuat line per akun nominal agar audit trail jelas,
bukan hanya satu angka agregat laba rugi.

## Perlakuan Koperasi

Untuk koperasi, istilah laporan perlu memakai SHU:

- `Laba/Rugi Periode Berjalan` ditampilkan sebagai `SHU Periode`.
- Closing SHU default boleh masuk ke `Saldo Laba` untuk MVP.
- Tahap lanjutan perlu akun khusus:
  - SHU Belum Dibagi
  - Cadangan Koperasi
  - Dana Pengurus/Pengawas
  - Dana Sosial/Pendidikan
  - Jasa Modal
  - Jasa Usaha
- Pembagian SHU sebaiknya menjadi workflow terpisah setelah closing/RAT.

## Reporting

Report GL dan koperasi perlu bisa membedakan:

- Laporan sebelum closing.
- Laporan setelah closing.
- Laporan operasional yang mengecualikan `CLOSING_JOURNAL`.
- Neraca akhir tahun yang menyertakan closing journal.
- Laba rugi/SHU periode yang tidak menjadi nol hanya karena jurnal penutup.

Karena itu, filter report harus punya opsi:

```ts
includeClosingEntries?: boolean;
```

Default yang disarankan:

- Income statement/SHU: exclude closing entries.
- Trial balance setelah closing: include closing entries jika user memilih mode
  after closing.
- Balance sheet akhir tahun: include closing entries.
- Journal list: tampilkan semua, tetapi beri tag `Closing`.

## Sync DB dan Realtime

Bagian ini wajib masuk scope utama. Tutup buku adalah operasi lintas table dan
berdampak ke semua device, jadi tidak boleh selesai hanya di Dexie lokal tanpa
remote sync yang jelas.

Prinsip:

- Closing period harus dianggap server-authoritative untuk production.
- Tombol `Post Tutup Buku` hanya boleh aktif jika PostgreSQL tersedia, sync
  queue sehat, dan tidak ada pending/failed queue untuk ledger, COA, accounting
  settings, periode, atau transaksi source periode tersebut.
- Sebelum preview final/posting, client wajib refresh data remote terbaru:
  `generalLedgerSetting`, `chartOfAccounts`, `journalEntries`,
  `accountingPeriods`, dan `closingRuns`.
- Posting closing harus atomic di lokal: period update, closing run, closing
  journal, journal lines, dan activity log dibuat dalam satu transaksi Dexie.
- Sync queue harus menjaga urutan remote:
  1. `accountingPeriods` status `LOCKED`.
  2. `journalEntries` + `journalEntryLines` untuk `CLOSING_JOURNAL`.
  3. `closingRuns`.
  4. `accountingPeriods` status `CLOSED` dengan `closing_journal_entry_id`.
  5. `activityLogs`.
- Remote repository harus idempotent berdasarkan `period_id` dan
  `closing_journal_entry_id`, bukan hanya berdasarkan waktu submit.
- Harus ada unique constraint remote untuk mencegah dua device menutup periode
  yang sama secara bersamaan.
- Jika sync closing gagal, UI harus menampilkan status `pending/failed` dan
  menolak reopen/reclosing sampai status remote jelas.
- Realtime event dari PostgreSQL harus memicu refresh minimal untuk:
  `accounting_periods`, `closing_runs`, `journal_entries`, `journal_entry_lines`,
  dan `activity_logs`.
- Device lain yang sedang membuka form transaksi bertanggal periode closed harus
  mendapat state terbaru dan formnya ditolak saat submit.

Table realtime:

- Tambahkan `accounting_periods` dan `closing_runs` ke trigger
  `kasirku_notify_data_change`.
- Jika closing journal diposting, trigger existing `journal_entries` dan
  `journal_entry_lines` tetap harus mengirim event.
- Event realtime boleh hanya berisi table/id, tetapi handler frontend harus
  refresh bundle lengkap agar tidak membaca journal tanpa lines atau closing run
  tanpa period.

Conflict handling:

- Jika remote period sudah `CLOSED`, closing lokal kedua harus ditolak dan client
  refresh data remote.
- Jika remote period berubah dari `OPEN` ke `LOCKED/CLOSED` saat user sedang
  preview, posting harus dibatalkan dan preview dihitung ulang.
- Jika user offline, closing akhir tahun tidak boleh diposting. Mode offline
  boleh hanya menyimpan draft preview tanpa mengubah status periode.

## Adjustment Setelah Closing

Jika ada koreksi setelah periode closed:

- Jangan edit transaksi lama secara langsung.
- Buat adjustment journal di periode open berikutnya.
- Jika koreksi harus mempengaruhi laporan tahun lama, periode wajib di-reopen
  dengan alasan, reversal closing journal dibuat, adjustment diposting, lalu
  closing ulang.

## File yang Kemungkinan Diubah

- `src/types/index.ts`
- `src/lib/database/KasirkuDB.ts`
- `src/lib/database/migrations.ts`
- `src-tauri/migrations/*_accounting_periods.sql`
- `src-tauri/src/models/*`
- `src-tauri/src/repositories/*`
- `src-tauri/src/commands/*`
- `src/services/accountingPeriodService.ts`
- `src/services/accountingPeriodReadService.ts`
- `src/services/closingRunService.ts`
- `src/services/closingRunReadService.ts`
- `src/services/generalLedgerService.ts`
- `src/services/journalEntryReadService.ts`
- `src/services/syncQueueService.ts`
- `src/services/syncOrchestratorService.ts`
- `src/services/postgresAdapter.ts`
- `src/hooks/useSyncQueueWorker.ts`
- `src/utils/backupRestore.ts`
- `src-tauri/migrations/0034_realtime_notifications.sql`
- `src/view/finance/general-ledger/GeneralLedgerManagement.tsx`
- `src/view/SyncDatabaseManagement.tsx`
- `src/components/general-ledger/ManualJournalForm.tsx`
- `src/i18n/messages.ts`
- `src/auth/permissions.ts`
- `src/auth/routePermissions.ts`
- `tests/e2e/accounting-setup.spec.ts`

## Rencana Per Fase

### Fase 0 - Discovery dan Guard Manual

Tujuan:

- Mendokumentasikan status saat ini dan mencegah user menganggap jurnal manual
  sebagai closing resmi.

Checklist:

- Tambahkan warning di UI GL bahwa closing period belum tersedia.
- Pastikan manual journal bertanggal sebelum cutoff tetap ditolak.
- Tambahkan dokumentasi workaround manual dengan risiko report.

Acceptance criteria:

- User tahu bahwa fitur closing otomatis belum aktif.
- Tidak ada klaim bahwa laporan sudah audit-ready tanpa period lock.

### Fase 1 - Accounting Period Foundation

Tujuan:

- Menambahkan table dan service periode akuntansi.

Checklist:

- Tambahkan type `AccountingPeriod`.
- Tambahkan table Dexie dan migration Postgres.
- Tambahkan CRUD period.
- Tambahkan status `OPEN`, `LOCKED`, `CLOSED`.
- Tambahkan field sync metadata untuk period.
- Tambahkan permission untuk lock/close/reopen period.
- Tambahkan activity log.

Acceptance criteria:

- Periode tahunan bisa dibuat dari UI/service.
- Periode tidak boleh overlap.
- Periode bisa di-lock dan statusnya tersimpan/sync.

### Fase 2 - Sync DB dan Realtime Foundation

Tujuan:

- Memastikan periode dan closing run aman untuk multi-device sejak awal.

Checklist:

- Tambahkan remote DTO, adapter, repository, command, dan sync queue entity
  untuk `accountingPeriods`.
- Tambahkan remote DTO, adapter, repository, command, dan sync queue entity
  untuk `closingRuns`.
- Tambahkan read service:
  - `refreshAccountingPeriodsFromPostgres`
  - `mergeRemoteAccountingPeriodsIntoDexie`
  - `refreshClosingRunsFromPostgres`
  - `mergeRemoteClosingRunsIntoDexie`
- Tambahkan pending enqueue:
  - `enqueueAccountingPeriodSync`
  - `enqueueClosingRunSync`
  - `enqueuePendingAccountingPeriodsForSync`
  - `enqueuePendingClosingRunsForSync`
- Masukkan refresh/enqueue baru ke `syncOrchestratorService`.
- Tambahkan `accounting_periods` dan `closing_runs` ke trigger realtime
  PostgreSQL.
- Update realtime handler agar event table baru memicu refresh period/closing
  run dan journal bundle terkait.
- Tambahkan unique constraint remote untuk closing run per period.

Acceptance criteria:

- Period yang dibuat/dikunci dari device A muncul di device B setelah sync atau
  realtime refresh.
- Closing run yang diposting dari device A muncul di device B beserta jurnal dan
  journal lines-nya.
- Jika dua device mencoba close period yang sama, hanya satu yang sukses dan
  device lain mendapat conflict yang bisa dipahami.
- Halaman Sync DB menarik period dan closing run dari PostgreSQL.

### Fase 3 - Posting Guard

Tujuan:

- Menolak posting ke periode locked/closed.

Checklist:

- Tambahkan helper `assertAccountingPeriodOpen(entryDate)`.
- Panggil guard di semua posting GL source document.
- Panggil guard di manual journal.
- Void/reversal transaksi lama harus diarahkan ke policy adjustment.

Acceptance criteria:

- Posting transaksi bertanggal periode `LOCKED` ditolak.
- Posting transaksi bertanggal periode `CLOSED` ditolak.
- Error message jelas dan tidak membuat data parsial.

### Fase 4 - Closing Preview

Tujuan:

- Menampilkan simulasi jurnal penutup sebelum posting.

Checklist:

- Hitung saldo akun `REVENUE`, `CONTRA_REVENUE`, dan `EXPENSE`.
- Hitung net income/SHU.
- Validasi akun retained earning tersedia dan postable.
- Preview jurnal closing line-by-line.
- Tampilkan trial balance sebelum closing.

Acceptance criteria:

- Preview debit/kredit balance.
- Angka net income/SHU sama dengan laporan laba rugi/SHU periode.
- Tidak ada jurnal yang diposting saat preview.

### Fase 5 - Post Closing Run

Tujuan:

- Posting closing journal dan menutup periode.

Checklist:

- Tambahkan `ClosingRun`.
- Tambahkan source type `CLOSING_JOURNAL`.
- Posting journal penutup idempotent per period.
- Sebelum post, jalankan refresh remote dan pastikan tidak ada pending/failed
  sync queue yang relevan.
- Set period menjadi `CLOSED`.
- Simpan `closing_journal_entry_id`.
- Enqueue sync period, closing run, journal bundle, dan activity log.
- Realtime event harus membuat device lain refresh status periode dan jurnal.
- Activity log mencatat user, periode, dan nilai net income/SHU.

Acceptance criteria:

- Closing hanya bisa diposting sekali untuk period yang sama.
- Trial balance setelah closing tidak punya saldo akun nominal jika closing
  entries di-include.
- Balance sheet setelah closing memindahkan laba/SHU ke ekuitas.
- Jika PostgreSQL offline atau queue bermasalah, posting closing ditolak atau
  berhenti sebagai draft tanpa mengubah status period.

### Fase 6 - Report Awareness

Tujuan:

- Report bisa membedakan data operasional dan data setelah closing.

Checklist:

- Tambahkan filter `includeClosingEntries`.
- Income statement/SHU default exclude closing journal.
- Balance sheet akhir periode bisa include closing journal.
- Journal list memberi tag source closing.
- Export PDF/XLSX menyertakan status periode.

Acceptance criteria:

- Laporan SHU periode tetap menampilkan SHU walau periode sudah closed.
- Neraca setelah closing balance dan menampilkan saldo laba yang benar.
- User bisa melihat jurnal penutup di journal list.

### Fase 7 - Reopen dan Reclosing

Tujuan:

- Memberi jalur koreksi yang aman setelah closing.

Checklist:

- Reopen wajib alasan dan permission khusus.
- Reopen membuat reversal closing journal atau menandai closing run reversed.
- Setelah adjustment, user bisa closing ulang.
- Reopen/reclosing harus melewati sync health check yang sama seperti closing.
- Realtime event reopen/reclosing harus memperbarui device lain.
- Semua aksi masuk activity log.

Acceptance criteria:

- Periode closed tidak bisa diubah diam-diam.
- Reopen meninggalkan jejak audit lengkap.
- Reclosing menghasilkan closing journal baru yang balance.

## Test Plan

Minimal automated tests:

- Membuat period tahunan tanpa overlap.
- Lock period menolak posting transaksi dan manual journal.
- Closing preview menghasilkan jurnal balance.
- Closing journal menutup akun revenue/expense/contra revenue.
- Sync DB: period dan closing run masuk queue, tersinkron ke PostgreSQL, lalu
  bisa ditarik ulang lewat halaman Sync DB.
- Realtime: device B menerima perubahan period/closing dari device A dan
  menolak input transaksi lama setelah refresh.
- Conflict: dua device close period yang sama, hanya satu closing run posted.
- Income statement exclude closing journal secara default.
- Balance sheet include closing journal saat mode after closing.
- Reopen period membuat reversal closing journal.
- Koperasi: SHU periode tetap tampil setelah closing.

## Acceptance Criteria Final

- User bisa menutup buku akhir tahun dari UI.
- Periode tertutup tidak bisa menerima transaksi lama.
- Closing journal balance dan auditable.
- Akun nominal menjadi nol setelah closing jika closing entries di-include.
- Laba/SHU pindah ke ekuitas/saldo laba.
- Laporan laba rugi/SHU periode tetap informatif dan tidak menjadi nol.
- Semua proses lock, close, reopen, reversal, dan reclosing tercatat di activity
  log.
- Semua proses closing/reopen/reclosing tersinkron ke PostgreSQL dan diterima
  device lain lewat realtime refresh.
