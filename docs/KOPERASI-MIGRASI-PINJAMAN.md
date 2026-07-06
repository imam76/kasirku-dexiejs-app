# Migrasi Pinjaman Koperasi & Rekonsiliasi

Dokumen ini menjelaskan perilaku fitur **Migrasi Pinjaman** (menu Koperasi →
Migrasi Pinjaman) dan hubungannya dengan rekonsiliasi laporan koperasi. Ditulis
sebagai tindak lanjut dari `ISSUE-KOPERASI-MIGRASI-REKONSILIASI.md`.

## Apa itu pinjaman migrasi

Pinjaman migrasi adalah pinjaman yang **sudah berjalan** sebelum sistem dipakai,
lalu dibawa masuk pada saat cut-off. Tujuannya mencatat posisi historis:

- jadwal angsuran dibentuk seperti pinjaman biasa;
- angsuran yang sudah lunas historis ditandai lewat `paid_*` pada kartu angsuran;
- `outstanding_*` pinjaman diturunkan dari sisa kartu angsuran.

Yang membedakannya dari pencairan biasa: pinjaman migrasi **sengaja tidak**:

- menggerakkan kas / `financeBalance`;
- membuat `financeTransactions`;
- membuat jurnal pencairan (`finance_transaction_id` dan `journal_entry_id`
  dibiarkan kosong).

Karena itu piutangnya **tidak** masuk lewat jurnal pencairan, melainkan lewat
**saldo awal (opening balance) akun Piutang Pinjaman 1120**.

Pinjaman migrasi ditandai dengan flag `is_migration = true` dan bertanggal
sebelum cutoff buku besar (ditolak bila posting GL sudah aktif untuk tanggalnya).

## Alur atomic

Pencatatan migrasi dijalankan oleh satu service command,
`migrateCooperativeLoan` (lihat `src/services/cooperativeLoanService.ts`), yang
membungkus **create + approve + disburse-mode-migrasi** dalam satu transaksi
Dexie. Bila salah satu tahap gagal (validasi atau penyimpanan), tidak ada
pinjaman `SUBMITTED`/`APPROVED` parsial yang tertinggal. Queue sync hanya
dijalankan setelah transaksi lokal sukses. UI (`CooperativeLoanMigrationManagement`)
hanya memanggil satu mutation ini.

## Dua mode posisi per cut-off

Isi **salah satu** (tidak boleh dicampur):

1. **Lunas s/d angsuran ke-N** (`settled_through_installment_number`) — cocok
   untuk bunga flat. Angsuran 1..N ditandai lunas penuh.
2. **Sisa pokok langsung** (`migration_outstanding_principal_amount`, opsional
   `migration_outstanding_interest_amount`) — cocok untuk anuitas/menurun/bayar
   tidak berurutan.

### Validasi (service sebagai sumber kebenaran)

- `settled_through_installment_number <= jumlah angsuran`;
- `migration_outstanding_principal_amount <= principal_amount`;
- `migration_outstanding_interest_amount <= total_interest_amount`;
- minimal salah satu mode terisi, dan kedua mode tidak boleh dicampur;
- sisa bunga hanya boleh diisi pada mode sisa pokok.

Validasi UI hanya lapis pertama; validasi service tetap berlaku untuk caller
non-UI.

## Rekonsiliasi laporan koperasi (tab Ringkasan/Rekonsiliasi)

Karena pinjaman migrasi memakai jalur historis, cek rekonsiliasi dibuat
**migration-aware** agar tidak memunculkan warning palsu:

- **Pembayaran aktif vs paid amount angsuran** (`PAYMENT_INSTALLMENT`) —
  angsuran & pembayaran milik loan `is_migration` dikecualikan, sehingga
  `paid_*` historis migrasi tidak dihitung sebagai mismatch. Trade-off:
  pembayaran pasca-cutoff pada loan migrasi tidak terdeteksi cek agregat ini
  (belum ada field baseline paid historis terpisah).
- **Source KSP vs financeTransactions** (`FINANCE_TRANSACTION`) — pencairan loan
  `is_migration` tidak diharapkan punya `finance_transaction_id`, jadi tidak
  menjadi mismatch. Pembayaran/simpanan yang memang punya `finance_transaction_id`
  tetap direkonsiliasi.
- **Piutang buku besar (1120) vs sisa pokok pinjaman** (`LOAN_MIGRATION_OPENING`)
  — expected dihitung hanya dari loan berstatus `DISBURSED`/`PAID_OFF`. Loan
  `SUBMITTED`/`APPROVED`/`REJECTED`/`REVERSED` tidak ikut. Baris ini hanya muncul
  bila ada pinjaman migrasi.

### Warning 1120 bukan selalu bug

Bila pinjaman migrasi sudah ada tetapi **saldo awal akun 1120 belum diisi**,
warning `LOAN_MIGRATION_OPENING` adalah **valid** dan harus diselesaikan lewat
setup GL: isi baris Piutang Pinjaman (1120) di form Opening Balance sebesar total
sisa pokok pinjaman migrasi. Form opening balance menyediakan tombol bantu untuk
mengisi angka ini otomatis (`gl-opening-balance-fill-migration`).

## Referensi kode

- `src/services/cooperativeLoanService.ts` — `migrateCooperativeLoan`,
  `assertMigrationPositionWithinLoan`, `applyMigrationPaidState`.
- `src/services/cooperativeReportService.ts` — `buildPaymentInstallmentReconciliation`,
  `buildFinanceTransactionReconciliation`, `buildLoanReceivableLedgerReconciliation`.
- `src/lib/validations/cooperativeLoan.ts` — `cooperativeLoanDisbursementSchema`.
- `src/view/koperasi/loans/CooperativeLoanMigrationModal.tsx` — batas input UI.
- `tests/e2e/koperasi-loan-migration.spec.ts` — regresi LOAN-MIG-01..03.
