# Issue: Rekonsiliasi Koperasi Belum Aman untuk Pinjaman Migrasi

Tanggal catatan: 2026-07-06

## Ringkasan

Laporan Koperasi tab Ringkasan/Rekonsiliasi bisa menampilkan warning yang tidak
selalu berarti data rusak, terutama setelah memakai fitur Migrasi Pinjaman.
Pinjaman migrasi memang mencatat posisi historis angsuran melalui field
`paid_*` dan outstanding pinjaman, tetapi sengaja tidak membuat mutasi kas,
`financeTransactions`, atau jurnal pencairan seperti pinjaman baru.

Akibatnya beberapa cek rekonsiliasi sekarang membandingkan data historis migrasi
dengan transaksi operasional pasca-cutoff, sehingga muncul false warning.
Selain itu flow migrasi di UI masih menjalankan create, approve, dan disburse
sebagai tiga operasi terpisah, sehingga berisiko meninggalkan data parsial bila
salah satu langkah gagal.

## Gejala

Contoh warning yang terlihat:

| Cek | Expected | Actual | Indikasi |
| --- | ---: | ---: | --- |
| Pembayaran aktif vs paid amount angsuran | Rp 0 | Rp 2.916.666,65 | Kemungkinan false-positive dari `paid_*` historis migrasi |
| Source KSP vs financeTransactions | Rp 5.000.000 | Rp 0 | Kemungkinan false-positive dari pinjaman migrasi tanpa transaksi kas |
| Piutang buku besar (1120) vs sisa pokok pinjaman | Rp 2.500.000 | Rp 0 | Bisa valid bila opening balance 1120 belum diisi, tetapi cek perlu filter loan yang benar |

## File Terkait

- `src/services/cooperativeReportService.ts`
- `src/services/cooperativeLoanService.ts`
- `src/view/koperasi/loans/CooperativeLoanMigrationManagement.tsx`
- `src/view/koperasi/loans/CooperativeLoanMigrationModal.tsx`
- `src/view/koperasi/reports/CooperativeReportManagement.tsx`
- `src/lib/validations/cooperativeLoan.ts`
- `tests/e2e/koperasi-loan-migration.spec.ts`
- `tests/e2e/helpers/koperasiMigration.ts`

## Akar Masalah

### 1. Payment vs installment belum migration-aware

`buildPaymentInstallmentReconciliation` menghitung:

- expected dari `cooperativeLoanPayments` aktif.
- actual dari semua `paid_principal_amount`, `paid_interest_amount`, dan
  `paid_penalty_amount` di semua angsuran.

Untuk pinjaman migrasi, `paid_*` bisa berisi saldo historis tanpa
`CooperativeLoanPayment`. Ini memang desain migrasi, bukan mismatch operasional.
Remote migration `0045_cooperative_migration_reconciliation_bypass.sql` juga
sudah memberi guard serupa untuk melewati pinjaman migrasi.

### 2. Source KSP vs financeTransactions menghitung pencairan migrasi

`buildFinanceTransactionReconciliation` memasukkan semua loan berstatus
`DISBURSED` atau `PAID_OFF` sebagai expected finance transaction. Pinjaman
migrasi memiliki status tersebut, tetapi `finance_transaction_id` sengaja
kosong karena tidak menggerakkan kas.

### 3. Rekonsiliasi 1120 menghitung semua loan

`buildLoanReceivableLedgerReconciliation` menjumlahkan
`outstanding_principal_amount` dari semua loan. Padahal akun piutang 1120 hanya
relevan untuk loan yang sudah menjadi piutang, yaitu pinjaman `DISBURSED` dan
`PAID_OFF`. Loan `SUBMITTED`, `APPROVED`, atau data parsial dari migrasi gagal
tidak seharusnya ikut expected 1120.

### 4. Flow migrasi tidak atomic

UI migrasi menjalankan:

1. `createLoan`
2. `approveLoan`
3. `disburseLoan`

Ketiganya berjalan sebagai mutation terpisah. Jika langkah ketiga gagal, data
aplikasi/approval bisa tertinggal dan ikut mempengaruhi laporan.

### 5. Validasi migrasi masih kurang defensif

Mode migrasi berdasarkan sisa pokok belum terlihat membatasi:

- `outstanding_principal_amount <= principal_amount`
- `outstanding_interest_amount <= total_interest_amount`
- nilai sisa historis konsisten dengan jadwal yang dibentuk

Validasi UI membantu, tetapi service tetap perlu menjadi sumber kebenaran.

## Rencana Per Fase

### Fase 0 - Repro dan Baseline

Tujuan:

- Mengunci skenario yang menghasilkan warning supaya perbaikan bisa diverifikasi.

Checklist:

- Tambahkan fixture/e2e untuk pinjaman migrasi dengan angsuran historis lunas
  sebagian.
- Buka laporan koperasi dan simpan baseline nilai rekonsiliasi sebelum fix.
- Pastikan test membedakan:
  - warning palsu karena saldo historis migrasi;
  - warning valid karena opening balance 1120 belum ada.

Acceptance criteria:

- Ada test yang gagal di kondisi lama untuk false warning migrasi.
- Expected angka rekonsiliasi terdokumentasi di assertion, bukan hanya screenshot.

### Fase 1 - Fix Rekonsiliasi False-Positive Migrasi

Tujuan:

- Menghilangkan warning palsu tanpa menyembunyikan mismatch operasional non-migrasi.

Checklist:

- Di `buildPaymentInstallmentReconciliation`:
  - buat lookup `loanById`;
  - kecualikan angsuran milik loan `is_migration` dari perbandingan payment vs
    paid amount historis;
  - kecualikan payment untuk installment migrasi dari agregat ini jika tidak ada
    baseline historis yang bisa dipisahkan.
- Di `buildFinanceTransactionReconciliation`:
  - jangan memasukkan loan `is_migration` sebagai expected finance transaction
    pencairan;
  - tetap rekonsiliasi payment/saving transaction yang memang punya
    `finance_transaction_id`.
- Pastikan mismatch count tidak lagi menghitung paid historis migrasi sebagai
  warning.

Acceptance criteria:

- Pinjaman migrasi dengan `paid_*` historis tidak membuat
  `PAYMENT_INSTALLMENT` warning.
- Pencairan pinjaman migrasi tanpa finance transaction tidak membuat
  `FINANCE_TRANSACTION` warning.
- Pinjaman non-migrasi tetap warning bila finance transaction atau payment
  benar-benar hilang.

Catatan desain:

- Fix jangka pendek boleh mengecualikan pinjaman migrasi dari cek
  payment-vs-installment karena tidak ada field baseline paid historis.
- Jika butuh audit lebih granular untuk pembayaran pasca-cutoff pada pinjaman
  migrasi, tambahkan fase lanjutan untuk menyimpan baseline historis terpisah.

### Fase 2 - Perbaiki Cek Piutang 1120

Tujuan:

- Membuat cek 1120 hanya membandingkan piutang pinjaman yang sudah valid secara
  akuntansi.

Checklist:

- Di `buildLoanReceivableLedgerReconciliation`, hitung expected hanya dari loan:
  - `status === 'DISBURSED'`
  - `status === 'PAID_OFF'`
- Abaikan loan `SUBMITTED`, `APPROVED`, `REJECTED`, dan `REVERSED`.
- Pertahankan behavior warning bila saldo 1120 opening balance tidak mencakup
  sisa pokok pinjaman migrasi.

Acceptance criteria:

- Loan draft/approved yang belum dicairkan tidak mempengaruhi expected 1120.
- Pinjaman migrasi yang sudah dicairkan tetap wajib cocok dengan saldo GL 1120.
- Bila opening balance 1120 kosong, warning tetap muncul sebagai masalah setup
  GL yang valid.

### Fase 3 - Atomic Flow Migrasi Pinjaman

Tujuan:

- Mencegah data parsial saat proses migrasi gagal di tengah jalan.

Checklist:

- Tambahkan service-level command, misalnya `migrateCooperativeLoan`, yang
  menjalankan create, approve, dan disburse migrasi dalam satu transaksi Dexie.
- Pindahkan orkestrasi bisnis dari
  `CooperativeLoanMigrationManagement.tsx` ke service.
- Queue sync dilakukan setelah transaksi lokal sukses.
- Activity log tetap mencatat event migrasi yang jelas.
- Pastikan kegagalan di tahap validasi/disburse tidak meninggalkan loan
  `SUBMITTED` atau `APPROVED`.

Acceptance criteria:

- UI migrasi hanya memanggil satu mutation service.
- Jika migrasi gagal, tidak ada loan parsial baru yang tersimpan.
- Jika migrasi sukses, loan, installments, sync metadata, dan activity log
  konsisten.

### Fase 4 - Hardening Validasi Migrasi

Tujuan:

- Menolak input migrasi yang tidak mungkin secara bisnis sebelum mencemari data.

Checklist:

- Validasi service:
  - `settled_through_installment_number <= installment_count`;
  - `migration_outstanding_principal_amount <= loan.principal_amount`;
  - `migration_outstanding_interest_amount <= loan.total_interest_amount`;
  - minimal salah satu mode posisi migrasi terisi;
  - mode posisi tidak boleh mencampur field yang tidak relevan.
- Validasi UI:
  - tambahkan max untuk outstanding principal dan outstanding interest;
  - tampilkan pesan validasi yang spesifik.
- Pastikan validasi tetap berlaku untuk caller non-UI.

Acceptance criteria:

- Input sisa pokok lebih besar dari pokok pinjaman ditolak.
- Input sisa bunga lebih besar dari total bunga ditolak.
- Input settled installment melebihi tenor/installment count ditolak di service.

### Fase 5 - UI Polish Rekonsiliasi

Tujuan:

- Membuat ringkasan warning lebih mudah dibaca.

Checklist:

- Rapikan statistik rekonsiliasi agar tampil sebagai `8 Warning`, bukan
  `8Warning`.
- Pertimbangkan render status sebagai tag kecil di samping angka.
- Jangan mengubah behavior data di fase ini.

Acceptance criteria:

- Tampilan ringkasan rekonsiliasi punya spasi/status yang jelas.
- Tidak ada perubahan nilai rekonsiliasi akibat UI polish.

### Fase 6 - Regression Test dan Dokumentasi

Tujuan:

- Mencegah bug rekonsiliasi migrasi muncul lagi.

Checklist:

- Tambahkan/ubah e2e di `tests/e2e/koperasi-loan-migration.spec.ts`.
- Tambahkan helper fixture di `tests/e2e/helpers/koperasiMigration.ts` bila
  perlu.
- Test minimal:
  - migrasi pinjaman tidak membuat false warning payment-vs-installment;
  - migrasi pinjaman tidak membuat false warning finance transaction;
  - 1120 warning tetap muncul bila opening balance tidak disiapkan;
  - migration command atomic saat input invalid.
- Update README atau docs singkat bila behavior migrasi dan opening balance 1120
  perlu dijelaskan ke user.

Acceptance criteria:

- Test baru gagal di implementasi lama dan lulus setelah fix.
- Laporan koperasi tetap OK untuk skenario non-migrasi yang sudah existing.

## Prioritas

1. Fase 1 dan Fase 2: paling langsung mengatasi warning rekonsiliasi yang
   terlihat.
2. Fase 3: penting untuk mencegah data parsial baru.
3. Fase 4: memperkuat boundary service agar data migrasi tidak invalid.
4. Fase 5 dan Fase 6: polish dan perlindungan regresi.

## Risiko dan Catatan

- Mengecualikan seluruh loan migrasi dari payment-vs-installment berarti
  mismatch pembayaran pasca-cutoff pada loan migrasi tidak terdeteksi oleh cek
  agregat tersebut. Ini trade-off sementara karena saat ini `paid_*` historis
  dan `paid_*` operasional bercampur di field yang sama.
- Jika audit pasca-cutoff untuk loan migrasi wajib, perlu field baseline baru,
  misalnya `migration_paid_principal_amount`,
  `migration_paid_interest_amount`, dan `migration_paid_penalty_amount`, atau
  mekanisme snapshot rekonsiliasi terpisah.
- Warning 1120 bukan selalu bug. Bila pinjaman migrasi sudah ada dan opening
  balance akun 1120 belum diisi, warning tersebut valid dan harus diselesaikan
  lewat setup GL.
