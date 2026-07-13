# Issue: Input Saldo Awal Simpanan Koperasi

Tanggal catatan: 2026-07-13

## Ringkasan

Fitur **Input Saldo Awal Pinjaman** sudah menangani pinjaman berjalan saat
cut-off sebagai data historis: pinjaman migrasi masuk ke operasional, tetapi
tidak membuat mutasi kas, `financeTransactions`, atau jurnal pencairan. Untuk
simpanan anggota perlu pola yang sama agar saldo simpanan sebelum sistem dipakai
bisa dibawa masuk tanpa dianggap sebagai setoran harian baru.

Saldo awal simpanan harus mencatat posisi awal per anggota dan jenis simpanan
(`POKOK`, `WAJIB`, `SUKARELA`) pada tanggal cut-off. Secara operasional saldo
ini harus ikut membentuk `cooperativeMemberSavingBalances`, tetapi secara kas
dan laporan harian tidak boleh masuk sebagai storting/setoran biasa.

## Tujuan

- Operator bisa menginput saldo awal simpanan anggota per cut-off.
- Saldo awal simpanan menambah saldo anggota dan muncul di kartu/mutasi simpanan.
- Saldo awal simpanan tidak mengubah `financeBalance`.
- Saldo awal simpanan tidak membuat `financeTransactions`.
- Saldo awal simpanan tidak membuat jurnal setoran simpanan.
- Kewajiban simpanan di buku besar tetap diselesaikan lewat Opening Balance GL
  pada akun simpanan anggota, mirip piutang pinjaman migrasi yang diselesaikan
  lewat akun 1120.
- Rekonsiliasi koperasi tidak memunculkan warning palsu karena saldo awal
  simpanan tidak punya transaksi kas.

## Prinsip Desain

### 1. Jangan pakai flow setoran biasa

Flow existing `recordCooperativeSaving` selalu:

- validasi setoran/penarikan biasa;
- mencari akun kas/bank;
- mengubah `financeBalance`;
- membuat `financeTransactions`;
- membuat jurnal simpanan jika GL sudah aktif.

Untuk saldo awal simpanan, perilaku ini tidak sesuai. Saldo awal adalah posisi
historis sebelum sistem dipakai, bukan kas masuk hari ini.

### 2. Buat tipe transaksi historis khusus

Rekomendasi teknis:

```ts
export type CooperativeSavingTransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'REVERSAL'
  | 'OPENING_BALANCE';
```

`OPENING_BALANCE` disimpan di `cooperativeSavingTransactions.transaction_type`.
Kolom database saat ini berupa text/string, jadi perubahan utama ada di type
TypeScript, validasi, mapping label, service, report, dan rekonsiliasi.

Alasan memakai `OPENING_BALANCE` dan bukan `DEPOSIT`:

- laporan tabungan masuk saat ini memfilter `transaction_type === 'DEPOSIT'`;
- laporan storting/kas petugas memakai setoran simpanan sebagai aktivitas kas;
- jika saldo awal disimpan sebagai `DEPOSIT`, banyak laporan harus diberi guard
  tambahan agar tidak menghitung saldo awal sebagai kas masuk.

### 3. GL tetap lewat Opening Balance, bukan jurnal simpanan

Saldo awal simpanan koperasi adalah kewajiban kepada anggota. Di GL, nilainya
harus masuk lewat jurnal opening balance:

| Jenis simpanan | Akun default | Sisi |
| --- | --- | --- |
| Pokok | `2310` Simpanan Pokok | Kredit |
| Wajib | `2320` Simpanan Wajib | Kredit |
| Sukarela | `2330` Simpanan Sukarela | Kredit |

Jika akun detail belum tersedia, fallback ke `2300` Simpanan Anggota mengikuti
candidate existing di `generalLedgerService.ts`.

## File Terkait

- `src/types/index.ts`
- `src/lib/validations/cooperativeSaving.ts`
- `src/services/cooperativeSavingService.ts`
- `src/services/cooperativeReportService.ts`
- `src/services/cooperativeSavingMovementReportService.ts`
- `src/services/cooperativeVoluntarySavingReportService.ts`
- `src/services/cooperativeDailyStortingReportService.ts`
- `src/services/cooperativeFieldCashReportService.ts`
- `src/services/generalLedgerService.ts`
- `src/services/cooperativeSyncService.ts`
- `src/services/syncQueueService.ts`
- `src/services/postgresAdapter.ts`
- `src/view/koperasi/savings/CooperativeSavingManagement.tsx`
- `src/view/koperasi/savings/CooperativeSavingTable.tsx`
- `src/view/koperasi/savings/CooperativeSavingDetailDrawer.tsx`
- `src/view/koperasi/savings/savingOptions.ts`
- `src/routes/koperasi/simpanan.lazy.tsx`
- `src/routes/koperasi/index.tsx`
- `src/i18n/cooperativeMessages.ts`
- `tests/e2e/koperasi-savings.spec.ts`

## Akar Masalah Saat Ini

### 1. Belum ada tipe saldo awal simpanan

`CooperativeSavingTransactionType` saat ini hanya:

- `DEPOSIT`
- `WITHDRAWAL`
- `REVERSAL`

Akibatnya tidak ada cara aman untuk membedakan setoran kas biasa dengan saldo
historis cut-off.

### 2. Rekonsiliasi saldo simpanan bergantung ke transaksi

`buildSavingBalanceReconciliation` menghitung expected balance dari agregat
`cooperativeSavingTransactions`. Jadi saldo awal tidak cukup hanya mengubah
`cooperativeMemberSavingBalances`; tetap perlu row transaksi historis agar
expected dan actual balance cocok.

### 3. Rekonsiliasi finance akan menganggap semua transaksi simpanan punya kas

`buildFinanceTransactionReconciliation` saat ini memasukkan semua
`savingTransactions` sebagai expected finance transaction. Untuk
`OPENING_BALANCE`, `finance_transaction_id` memang harus kosong. Cek ini perlu
opening-balance-aware agar tidak menghasilkan false warning.

### 4. Laporan kas/storting tidak boleh menghitung saldo awal

Laporan seperti tabungan masuk, storting harian, kas petugas, dan target harian
harus tetap hanya menghitung aktivitas operasional setelah cut-off. Saldo awal
simpanan boleh tampil di mutasi/saldo anggota, tetapi bukan di laporan kas
masuk/keluar harian.

### 5. Potongan simpanan wajib dari saldo awal pinjaman belum punya saldo simpanan historis

Input saldo awal/migrasi pinjaman skema `TOTAL_PERCENT` sudah menyimpan
`mandatory_saving_rate` dan `mandatory_saving_amount` pada record pinjaman.
Namun karena pinjaman migrasi sengaja tidak menggerakkan kas, service tidak
menjalankan flow potongan normal `recordMandatorySavingDeduction`.

Dampaknya:

- angka simpanan wajib ada di pinjaman, tetapi saldo `WAJIB` anggota belum
  otomatis terbentuk;
- saat pinjaman migrasi dilunasi, sistem tetap mencoba mengembalikan
  `mandatory_saving_amount`;
- jika saldo awal simpanan wajib belum diinput, pelunasan bisa gagal karena
  saldo simpanan wajib anggota tidak cukup.

Solusi harus masuk ke fitur saldo awal simpanan, bukan ke flow pencairan
pinjaman migrasi, supaya tetap tidak membuat kas, finance transaction, atau
jurnal operasional.

Catatan: skema pinjaman `MONTHLY_RATE` saat ini tidak menyimpan
`mandatory_saving_amount`. Jika data historis tetap memiliki potongan simpanan
wajib, input saldo awal `WAJIB` harus tetap bisa diisi manual tanpa bergantung
ke angka potongan yang tersimpan pada pinjaman.

## Rencana Per Fase

### Fase 0 - Baseline dan Repro

Tujuan:

- Mengunci perilaku existing sebelum implementasi.

Checklist:

- Buat data anggota aktif.
- Catat setoran simpanan biasa dan pastikan masih membuat finance transaction,
  jurnal, dan saldo.
- Dokumentasikan warning rekonsiliasi yang akan muncul bila balance diubah tanpa
  transaksi historis.
- Pastikan laporan tabungan masuk saat ini hanya membaca `DEPOSIT`.

Acceptance criteria:

- Test baseline membuktikan setoran biasa tetap berjalan seperti sekarang.
- Ada skenario yang menjelaskan kenapa saldo awal tidak boleh memakai flow
  `recordCooperativeSaving` existing.

### Fase 1 - Model dan Validasi Saldo Awal

Tujuan:

- Menambah representasi data untuk saldo awal simpanan.

Checklist:

- Tambahkan `OPENING_BALANCE` ke `CooperativeSavingTransactionType`.
- Tambahkan label i18n:
  - `cooperative.savings.transactionType.openingBalance`
  - label Indonesia: `Saldo Awal`
  - label Inggris: `Opening Balance`
- Update mapping warna/tag transaksi simpanan, misalnya biru atau default.
- Tambahkan schema input baru, misalnya
  `cooperativeSavingOpeningBalanceSchema`, berisi:
  - `member_id`
  - `saving_type`
  - `amount`
  - `transaction_date`
  - `notes`
- Validasi service:
  - anggota wajib ada dan aktif;
  - nominal harus lebih dari 0;
  - tanggal saldo awal harus sebelum atau sama dengan cut-off GL jika GL sudah
    disiapkan;
  - satu anggota hanya boleh punya satu saldo awal per `saving_type` yang masih
    posted.

Acceptance criteria:

- TypeScript mengenali `OPENING_BALANCE` sebagai tipe transaksi simpanan valid.
- Input saldo awal negatif atau nol ditolak.
- Duplikasi saldo awal untuk anggota dan jenis simpanan yang sama ditolak.

### Fase 2 - Service Atomic Input Saldo Awal

Tujuan:

- Menulis saldo awal dan balance secara atomic, konsisten dengan pola
  `migrateCooperativeLoan`.

Checklist:

- Tambahkan service command, misalnya `recordCooperativeSavingOpeningBalance`.
- Jalankan dalam satu transaksi Dexie:
  - ambil anggota aktif;
  - buat row `cooperativeSavingTransactions` dengan:
    - `transaction_type: 'OPENING_BALANCE'`
    - `status: 'POSTED'`
    - `finance_transaction_id: undefined`
    - `journal_entry_id: undefined`
    - `cash_account_id: undefined`
    - `payment_method: undefined`
  - update `cooperativeMemberSavingBalances` dengan delta positif;
  - tulis activity log, misalnya `COOPERATIVE_SAVING_OPENING_BALANCE_RECORDED`.
- Jangan panggil:
  - `updateFinanceBalance`
  - `getCashOrBankAccountForPayment`
  - `postCooperativeSavingTransactionJournal`
  - `enqueueFinanceTransactionsSync`
- Queue sync setelah transaksi lokal sukses:
  - `enqueueCooperativeSavingTransactionsSync(..., 'create')`
  - `enqueueCooperativeMemberSavingBalancesSync(..., 'update')`
- Tambahkan helper untuk kebutuhan migrasi pinjaman:
  - cari pinjaman `is_migration` yang memiliki `mandatory_saving_amount > 0`;
  - hitung nilai simpanan wajib historis yang belum punya
    `OPENING_BALANCE`/saldo `WAJIB` memadai;
  - gunakan hasilnya sebagai saran/prefill input saldo awal `WAJIB`, bukan
    sebagai setoran kas otomatis.

Acceptance criteria:

- Jika proses gagal, tidak ada transaksi saldo awal atau balance parsial yang
  tertinggal.
- Jika proses sukses, saldo anggota naik sesuai nominal.
- `financeBalance` tidak berubah.
- Tidak ada row baru di `financeTransactions`.
- `journal_entry_id` kosong.

### Fase 3 - UI Input Saldo Awal Simpanan

Tujuan:

- Menyediakan flow UI yang jelas dan tidak tercampur dengan setoran biasa.

Checklist:

- Tambahkan tombol/halaman khusus, mengikuti gaya menu migrasi pinjaman:
  - opsi A: tombol `Input Saldo Awal` di halaman `Simpanan Anggota`;
  - opsi B: route terpisah `/koperasi/migrasi-simpanan`.
- Form field minimal:
  - anggota;
  - jenis simpanan;
  - nominal saldo awal;
  - tanggal saldo awal/cut-off;
  - catatan.
- Untuk anggota yang punya pinjaman migrasi dengan potongan simpanan wajib:
  - tampilkan saran nominal `WAJIB` dari total `mandatory_saving_amount`;
  - beri indikator bila saldo awal `WAJIB` belum cukup untuk pengembalian saat
    pelunasan pinjaman;
  - tetap izinkan user menyesuaikan nominal jika data historis berbeda.
- Tampilkan alert bahwa saldo awal:
  - tidak mengubah kas;
  - tidak membuat finance transaction;
  - kewajiban GL harus diisi lewat Opening Balance.
- Di tabel mutasi, tampilkan tag `Saldo Awal`.
- Di detail drawer, sembunyikan atau tampilkan strip untuk finance transaction
  dan jurnal karena memang tidak ada.
- Pertimbangkan permission:
  - minimal `COOPERATIVE_SAVING_MANAGE`;
  - jika dibuat route terpisah, tambahkan permission yang lebih spesifik pada
    fase lanjutan bila dibutuhkan.

Acceptance criteria:

- User bisa input saldo awal simpanan dari UI tanpa memilih akun kas.
- User tidak bisa salah mengira saldo awal sebagai setoran tunai.
- Mutasi dan saldo anggota langsung ter-update setelah submit.

### Fase 4 - Report dan Rekonsiliasi

Tujuan:

- Saldo awal simpanan masuk ke saldo anggota, tetapi tidak masuk laporan kas
  operasional.

Checklist:

- Update helper delta simpanan:
  - `OPENING_BALANCE` menambah saldo seperti deposit.
  - `WITHDRAWAL` tetap mengurangi saldo, kecuali withdrawal source `INTEREST`.
  - `REVERSAL` tetap mengacu ke transaksi original.
- Update `buildSavingBalanceReconciliation` agar expected balance menghitung
  `OPENING_BALANCE`.
- Update `buildFinanceTransactionReconciliation`:
  - kecualikan `savingTransactions` dengan `transaction_type === 'OPENING_BALANCE'`
    dari expected finance transaction.
  - transaksi `DEPOSIT`, `WITHDRAWAL`, dan `REVERSAL` tetap direkonsiliasi
    seperti sekarang.
- Update `buildJournalEntryReconciliation` bila perlu agar journal kosong pada
  saldo awal tidak dianggap missing.
- Tambahkan rekonsiliasi GL kewajiban simpanan:
  - expected = total saldo simpanan per jenis dari `cooperativeMemberSavingBalances`;
  - actual = saldo kredit akun `2310`, `2320`, `2330` atau fallback `2300` dari
    jurnal opening balance dan transaksi simpanan pasca-cut-off;
  - row hanya muncul bila ada transaksi `OPENING_BALANCE` simpanan atau GL sudah
    ready.
- Laporan yang harus exclude saldo awal dari aktivitas kas:
  - laporan tabungan masuk/keluar;
  - laporan storting harian;
  - laporan kas petugas;
  - laporan target harian;
  - cash flow koperasi yang berbasis finance transaction.
- Laporan yang boleh menghitung saldo awal sebagai baseline saldo:
  - saldo simpanan anggota;
  - laporan simpanan sukarela per as-of date;
  - buku besar koperasi bila menampilkan mutasi historis anggota.

Acceptance criteria:

- Saldo awal simpanan tidak muncul sebagai tabungan masuk bulan berjalan.
- Saldo awal simpanan tidak muncul sebagai storting kas petugas.
- Rekonsiliasi `SAVING_BALANCE` tetap OK.
- Rekonsiliasi finance transaction tetap OK meski saldo awal tidak punya
  `finance_transaction_id`.
- Jika Opening Balance GL akun simpanan belum diisi, rekonsiliasi kewajiban
  simpanan memberi warning yang valid, bukan false positive.

### Fase 5 - Edit/Hapus/Reversal Saldo Awal

Tujuan:

- Memberi koreksi yang aman untuk data migrasi.

Checklist:

- Pilih salah satu pola:
  - **hapus saldo awal** seperti delete migrasi pinjaman, hanya untuk
    `OPENING_BALANCE` yang belum punya dampak operasional setelahnya; atau
  - **reversal saldo awal** dengan row `REVERSAL` yang mengacu ke transaksi
    `OPENING_BALANCE`.
- Rekomendasi awal: gunakan reversal agar audit trail simpanan tetap utuh.
- Validasi:
  - alasan koreksi wajib diisi;
  - saldo akhir tidak boleh negatif;
  - transaksi yang sudah reversed tidak bisa dikoreksi lagi.
- Activity log:
  - `COOPERATIVE_SAVING_OPENING_BALANCE_REVERSED`

Acceptance criteria:

- Koreksi saldo awal mengurangi saldo anggota secara benar.
- Tidak membuat finance transaction dan tidak membuat jurnal operasional.
- Audit trail menampilkan transaksi original dan reversal.

### Fase 6 - Sync dan Remote

Tujuan:

- Menjamin saldo awal simpanan aman di Dexie dan Postgres/Tauri sync.

Checklist:

- Update `RemoteCooperativeSavingTransactionDto` agar menerima
  `transaction_type: 'OPENING_BALANCE'`.
- Pastikan Rust DTO tetap aman karena `transaction_type` berupa `String`.
- Pastikan upsert remote tidak memiliki check constraint yang menolak
  `OPENING_BALANCE`.
- Pastikan sync queue payload validation tidak membatasi transaction type ke
  `DEPOSIT/WITHDRAWAL/REVERSAL` saja.
- Pastikan merge remote ke Dexie tidak mengubah saldo awal menjadi setoran biasa.

Acceptance criteria:

- Saldo awal simpanan tersinkron ke remote.
- Device lain menerima transaksi `OPENING_BALANCE` dan balance yang sama.
- Tidak ada queue item stuck karena payload dianggap invalid.

## Test Case

### SAV-OPEN-01 - Input saldo awal pokok

Langkah:

1. Buat anggota aktif.
2. Input saldo awal `POKOK` Rp500.000 pada tanggal cut-off.
3. Buka tab saldo simpanan.

Expected:

- Saldo `POKOK` anggota = Rp500.000.
- Mutasi menampilkan tipe `Saldo Awal`.
- `financeTransactions` tidak bertambah.
- `financeBalance` tidak berubah.

### SAV-OPEN-02 - Input saldo awal wajib dan setoran pasca-cut-off

Langkah:

1. Input saldo awal `WAJIB` Rp300.000.
2. Catat setoran wajib biasa Rp50.000.

Expected:

- Saldo `WAJIB` = Rp350.000.
- Saldo awal tidak punya `finance_transaction_id`.
- Setoran biasa punya `finance_transaction_id`.
- Laporan tabungan masuk hanya menghitung Rp50.000.

### SAV-OPEN-03 - Saldo awal sukarela dan jasa simpanan

Langkah:

1. Input saldo awal `SUKARELA` Rp1.000.000.
2. Buka laporan simpanan sukarela per tanggal setelah cut-off.

Expected:

- Saldo sukarela muncul sebagai baseline.
- Perhitungan jasa simpanan memakai saldo historis sesuai aturan existing.
- Pengambilan jasa tetap tidak mengurangi saldo pokok simpanan.

### SAV-OPEN-04 - Rekonsiliasi tanpa finance transaction

Langkah:

1. Input saldo awal simpanan.
2. Buka laporan koperasi tab rekonsiliasi.

Expected:

- `SAVING_BALANCE` OK.
- `FINANCE_TRANSACTION` tidak warning karena saldo awal tidak punya finance
  transaction.
- Jika akun simpanan opening balance GL belum diisi, muncul warning khusus
  kewajiban simpanan, bukan warning finance transaction.

### SAV-OPEN-05 - Duplikasi saldo awal ditolak

Langkah:

1. Input saldo awal `POKOK` untuk anggota A.
2. Input lagi saldo awal `POKOK` untuk anggota A.

Expected:

- Input kedua ditolak dengan pesan spesifik.
- Saldo tetap sesuai input pertama.

### SAV-OPEN-06 - Saldo awal wajib dari potongan pinjaman migrasi

Langkah:

1. Input pinjaman migrasi skema `TOTAL_PERCENT` dengan
   `mandatory_saving_amount` Rp200.000.
2. Buka input saldo awal simpanan untuk anggota yang sama.
3. Catat saldo awal `WAJIB` Rp200.000 memakai `OPENING_BALANCE`.
4. Lunasi pinjaman migrasi setelah cut-off.

Expected:

- Saldo `WAJIB` anggota tersedia sebelum pelunasan.
- Pelunasan bisa membuat pengembalian simpanan wajib tanpa error saldo tidak
  cukup.
- Saldo awal `WAJIB` tidak muncul sebagai tabungan masuk/storting/drop kas.
- Pengembalian simpanan wajib saat pelunasan tetap menjadi transaksi
  operasional pasca-cut-off.

### SAV-OPEN-07 - Reversal saldo awal

Langkah:

1. Input saldo awal `SUKARELA` Rp750.000.
2. Reversal saldo awal dengan alasan koreksi.

Expected:

- Saldo sukarela kembali turun Rp750.000.
- Ada row reversal yang mengacu ke transaksi saldo awal.
- Tidak ada finance transaction atau jurnal operasional baru.

## Catatan Akuntansi

Sama seperti saldo awal pinjaman, input saldo awal simpanan tidak otomatis
menyelesaikan GL. Operator tetap harus memastikan Opening Balance GL berisi
kewajiban simpanan anggota pada akun yang benar.

Contoh:

| Akun | Debit | Kredit |
| --- | ---: | ---: |
| Kas/Bank/Modal penyeimbang sesuai setup awal | sesuai neraca | - |
| Simpanan Pokok `2310` | - | total saldo awal pokok |
| Simpanan Wajib `2320` | - | total saldo awal wajib |
| Simpanan Sukarela `2330` | - | total saldo awal sukarela |

Form opening balance GL boleh ditambahkan tombol bantu pada fase lanjutan:

- isi otomatis `2310` dari total saldo awal `POKOK`;
- isi otomatis `2320` dari total saldo awal `WAJIB`;
- isi otomatis `2330` dari total saldo awal `SUKARELA`.

## Definisi Selesai

- Ada service atomic untuk input saldo awal simpanan.
- Ada UI untuk input saldo awal simpanan.
- Saldo awal simpanan tersimpan sebagai `OPENING_BALANCE`.
- Saldo anggota, mutasi, sync, dan activity log konsisten.
- Tidak ada mutasi kas, finance transaction, atau jurnal operasional untuk saldo
  awal.
- Rekonsiliasi koperasi membedakan saldo awal simpanan dari setoran biasa.
- E2E mencakup input, duplikasi, laporan, rekonsiliasi, dan reversal/koreksi.
- Sync db + realtime
