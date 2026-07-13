# Input Saldo Awal Pinjaman Koperasi & Rekonsiliasi

Dokumen ini menjelaskan perilaku fitur **Input Saldo Awal Pinjaman** (menu Koperasi →
Input Saldo Awal Pinjaman) dan hubungannya dengan rekonsiliasi laporan koperasi. Ditulis
sebagai tindak lanjut dari `ISSUE-KOPERASI-MIGRASI-REKONSILIASI.md`.

## Apa itu input saldo awal pinjaman

Pinjaman migrasi adalah pinjaman yang **sudah berjalan** sebelum sistem dipakai,
lalu dibawa masuk pada saat cut-off. Tujuannya mencatat posisi historis:

- jadwal angsuran dibentuk seperti pinjaman biasa;
- angsuran yang sudah lunas historis ditandai lewat `paid_*` pada kartu angsuran;
- `outstanding_*` pinjaman diturunkan dari sisa kartu angsuran.

Yang membedakannya dari pencairan biasa: pinjaman migrasi **sengaja tidak**:

- menggerakkan kas / `financeBalance`;
- membuat `financeTransactions`;
- membuat jurnal pencairan.

Karena itu piutangnya **tidak** masuk lewat jurnal pencairan, melainkan lewat
**jurnal saldo awal (opening balance) akun Piutang Pinjaman 1120**. Jika GL
sudah memiliki cutoff, service membentuk jurnal `OPENING_BALANCE` otomatis dan
menyimpan `journal_entry_id` pada loan migrasi. Jika GL belum siap, loan tetap
tersimpan sebagai subledger dan perlu dibackfill setelah setup GL selesai.

Pinjaman migrasi ditandai dengan flag `is_migration = true` dan bertanggal
sebelum cutoff buku besar (ditolak bila cutoff GL sudah ada dan tanggal migrasi
tidak lebih tua dari cutoff).

## Alur atomic

Pencatatan migrasi dijalankan oleh satu service command,
`migrateCooperativeLoan` (lihat `src/services/cooperativeLoanService.ts`), yang
membungkus **create + approve + disburse-mode-migrasi** dalam satu transaksi
Dexie. Bila salah satu tahap gagal (validasi atau penyimpanan), tidak ada
pinjaman `SUBMITTED`/`APPROVED` parsial yang tertinggal. Queue sync hanya
dijalankan setelah transaksi lokal sukses. UI (`CooperativeLoanMigrationManagement`)
hanya memanggil satu mutation ini.

## Mode posisi per cut-off

Isi **salah satu** (tidak boleh dicampur):

1. **Lunas s/d angsuran ke-N** (`settled_through_installment_number`) — cocok
   untuk bunga flat. Angsuran 1..N ditandai lunas penuh.
2. **Sisa pokok langsung** (`migration_outstanding_principal_amount`, opsional
   `migration_outstanding_interest_amount`) — cocok untuk anuitas/menurun/bayar
   tidak berurutan.
3. **Sisa total tagihan** (`migration_outstanding_total_amount`) — sistem
   menghitung total yang sudah dibayar dari `total_payable_amount -
   migration_outstanding_total_amount`, lalu mengalokasikannya ke kartu angsuran
   berurutan memakai aturan alokasi pembayaran biasa. Mode ini dapat menandai
   angsuran awal lunas penuh dan angsuran berikutnya parsial tanpa perlu input
   sisa pokok/sisa jasa manual.

### Validasi (service sebagai sumber kebenaran)

- `settled_through_installment_number <= jumlah angsuran`;
- `migration_outstanding_principal_amount <= principal_amount`;
- `migration_outstanding_interest_amount <= total_interest_amount`;
- `migration_outstanding_total_amount <= total_payable_amount`;
- minimal salah satu mode terisi, dan mode posisi tidak boleh dicampur;
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

Bila pinjaman migrasi sudah ada tetapi **saldo awal akun 1120 belum terbentuk**,
warning `LOAN_MIGRATION_OPENING` adalah **valid**. Ini biasanya terjadi pada data
lama yang dibuat sebelum GL cutoff siap. Selesaikan lewat backfill jurnal saldo
awal atau setup GL yang memuat Piutang Pinjaman (1120) sebesar total sisa pokok
pinjaman migrasi.

## Laporan Perkembangan Resort/Karyawan

Laporan perkembangan resort memperlakukan pinjaman migrasi sebagai **saldo awal
berjalan**, bukan sebagai drop/pencairan baru. Artinya:

- kolom `DROP`, `20%`, dan `PINJAMAN BARU` tidak diisi dari loan
  `is_migration`;
- `SALDO LALU` memakai sisa tagihan migrasi yang masih berjalan, yaitu
  `outstanding_principal_amount + outstanding_interest_amount +
  outstanding_penalty_amount`, lalu tetap dikoreksi oleh pembayaran
  pasca-migrasi yang sudah tercatat;
- pembayaran pasca-migrasi tetap masuk ke kolom `ANGSURAN`.

Dengan contoh pokok Rp1.200.000, bunga flat 1% x 12 bulan, dan lunas historis
sampai angsuran ke-4, laporan bulan berjalan menampilkan `SALDO LALU`
Rp896.000 dan `DROP` kosong, bukan drop Rp1.200.000.

## Referensi kode

- `src/services/cooperativeLoanService.ts` — `migrateCooperativeLoan`,
  `assertMigrationPositionWithinLoan`, `applyMigrationPaidState`.
- `src/services/cooperativeReportService.ts` — `buildPaymentInstallmentReconciliation`,
  `buildFinanceTransactionReconciliation`, `buildLoanReceivableLedgerReconciliation`.
- `src/services/cooperativeResortDevelopmentReportService.ts` — perlakuan
  saldo awal pinjaman migrasi di laporan perkembangan resort/karyawan.
- `src/lib/validations/cooperativeLoan.ts` — `cooperativeLoanDisbursementSchema`.
- `src/view/koperasi/loans/CooperativeLoanMigrationModal.tsx` — batas input UI.
- `tests/e2e/koperasi-loan-migration.spec.ts` — regresi LOAN-MIG-01..04.
