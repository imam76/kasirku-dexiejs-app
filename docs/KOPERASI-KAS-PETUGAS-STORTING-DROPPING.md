# Koperasi - Kas Petugas, Storting, dan Dropping

Dokumen ini adalah langkah implementasi konsep kas petugas lapangan untuk flow koperasi yang sudah ada. Tujuannya: setiap karyawan/petugas yang memegang uang tunai punya akun kas sendiri, setiap uang masuk/keluar tercatat ke finance, dan laporan lapangan bisa menampilkan rekap per karyawan berisi storting, dropping, setoran ke finance, dan saldo kas seharusnya.

## Ringkasan Keputusan

- Gunakan akun COA bertipe `ASSET` untuk setiap kas petugas, misalnya `Kas Petugas - Asep`.
- Jangan membuat engine kas baru di luar finance. Mutasi uang tetap lewat `financeTransactions` dan jurnal tetap lewat `generalLedgerService.ts`.
- Tambahkan `Sesi Kas Petugas` sebagai kontrol operasional, mirip sesi kasir POS, tetapi sumber mutasinya adalah transaksi koperasi dan transfer kas/bank.
- Storting dan dropping adalah klasifikasi laporan lapangan, bukan kategori akuntansi baru yang wajib memecah ledger.
- Pencairan pinjaman tunai dari petugas harus ditolak jika saldo akun kas petugas tidak cukup.
- Jika saldo petugas kurang, finance harus melakukan dropping kas ke petugas lebih dulu lewat transfer internal.

## Kondisi Repo Saat Ini

Yang sudah tersedia dan harus dipakai:

- `employees` sebagai master karyawan/petugas.
- `cooperativeMembers.officer_id/officer_name` untuk relasi anggota ke petugas.
- `cooperativeSavingTransactions` sudah menyimpan `cash_account_id`.
- `cooperativeLoans` sudah menyimpan akun kas saat pencairan pinjaman.
- `cooperativeLoanPayments` sudah menyimpan akun kas saat pembayaran angsuran.
- `financeTransactions` sudah menjadi cash-flow operational layer.
- `cashBankTransferService.ts` sudah mencatat transfer internal sebagai dua `financeTransactions`.
- `generalLedgerService.ts` sudah membuat jurnal untuk transfer kas/bank, simpanan, pencairan pinjaman, dan pembayaran angsuran.
- `CooperativeBillingManagement` sudah menjadi flow penagihan dan pembayaran angsuran.

Yang belum ada:

- Akun kas petugas yang terhubung ke karyawan.
- Sesi kas petugas lapangan.
- Aturan saldo cukup untuk kas petugas.
- Transfer dropping/setor yang spesifik ke petugas.
- Rekap lapangan per karyawan.

## Terminologi Operasional

| Istilah lapangan | Makna sistem | Efek ke Kas Petugas |
|---|---|---:|
| Kas Awal Petugas | Uang fisik yang dipegang petugas saat sesi dibuka | snapshot |
| Dropping dari finance | Tambahan kas dari kas kantor/bank ke kas petugas | masuk |
| Storting angsuran | Pembayaran angsuran tunai dari anggota | masuk |
| Storting simpanan | Setoran simpanan tunai dari anggota | masuk |
| Dropping pinjaman | Pencairan pinjaman tunai ke anggota | keluar |
| Penarikan simpanan | Simpanan anggota dibayar tunai oleh petugas | keluar |
| Setor ke finance | Uang fisik petugas diserahkan kembali ke kantor | keluar |
| Saldo akhir sistem | Saldo yang seharusnya masih di tangan petugas | hasil hitung |

Rumus laporan:

```txt
Saldo akhir sistem
= saldo awal
+ dropping dari finance
+ storting angsuran
+ storting simpanan
- dropping pinjaman
- penarikan simpanan
- setor ke finance
```

## Flow Utama

### 1. Setup Kas Petugas

1. Admin membuka master karyawan.
2. Admin memilih atau membuat akun kas untuk karyawan tersebut.
3. Akun yang disarankan:
   - parent: `1000 - Kas dan Bank`
   - type: `ASSET`
   - postable: `true`
   - active: `true`
   - contoh kode: `1011.001`
   - contoh nama: `Kas Petugas - Asep`
4. Satu karyawan aktif sebaiknya hanya punya satu akun kas petugas aktif.

### 2. Buka Sesi Kas Petugas

1. Manager atau petugas membuka sesi untuk karyawan.
2. Sistem mengambil saldo akun kas petugas dari `financeTransactions`.
3. User input uang fisik yang dipegang sebagai `opening_cash_amount`.
4. Jika uang fisik berbeda dari saldo sistem, wajib isi catatan.
5. Buka sesi tidak membuat finance transaction dan tidak membuat jurnal.

Rekomendasi operasional:

- Default ketat: setiap akhir sesi petugas setor semua uang ke finance, sehingga sesi berikutnya mulai dari 0 atau dari dropping baru.
- Jika bisnis mengizinkan saldo dibawa besok, sesi boleh ditutup dengan saldo akhir tidak nol, tetapi laporan harus menampilkan carry-over dengan jelas.

### 3. Kas Petugas Kurang Saat Pencairan Pinjaman

Flow yang harus terjadi:

1. Pinjaman dibuat dan disetujui sampai status `APPROVED`.
2. Petugas mencoba mencairkan pinjaman tunai.
3. Service menghitung saldo akun `Kas Petugas`.
4. Jika saldo kurang, pencairan ditolak dengan pesan:

```txt
Saldo Kas Petugas Asep tidak cukup. Butuh tambahan Rp X dari finance sebelum pencairan.
```

5. Manager/finance mencatat dropping:

```txt
Kas Kantor/Bank -> Kas Petugas Asep
```

6. Setelah dropping posted, saldo kas petugas bertambah.
7. Petugas mencairkan pinjaman menggunakan akun kas petugas.

Catatan penting:

- Approval pinjaman tidak mengubah kas dan tidak membuat jurnal.
- Request dropping tidak mengubah kas dan tidak membuat jurnal.
- Kas berubah hanya saat finance menyetujui dan mencatat transfer internal.

### 4. Storting dari Penagihan

1. Petugas membuka halaman `/koperasi/penagihan`.
2. Daftar tagihan bisa difilter berdasarkan petugas anggota (`officer_id`).
3. Saat anggota membayar tunai, payment modal default ke `Kas Petugas` dari petugas tersebut.
4. Pembayaran angsuran mencatat `financeTransactions` tipe `INCOME`, kategori `KSP_PEMBAYARAN_ANGSURAN`, akun kas = `Kas Petugas`.
5. Jurnal GL tetap memakai logic existing pembayaran angsuran.

### 5. Setoran Simpanan dan Penarikan Simpanan

1. Setoran simpanan tunai dari anggota masuk ke `Kas Petugas`.
2. Penarikan simpanan tunai keluar dari `Kas Petugas`.
3. Penarikan harus divalidasi saldo akun kas petugas cukup.
4. Jurnal GL tetap memakai logic existing simpanan.

### 6. Setor Petugas ke Finance

1. Petugas menyerahkan uang fisik ke finance.
2. Finance mencatat transfer:

```txt
Kas Petugas Asep -> Kas Kantor/Bank
```

3. Ini bukan pendapatan baru dan bukan biaya.
4. Transfer muncul sebagai `CASH_BANK_TRANSFER`.
5. Jika GL aktif, jurnalnya debit kas tujuan dan kredit kas sumber.

### 7. Tutup Sesi Kas Petugas

1. Sistem menghitung semua mutasi finance yang terkait sesi.
2. User input uang fisik yang tersisa.
3. Sistem menghitung selisih:

```txt
selisih = uang fisik akhir - saldo akhir sistem
```

4. Jika selisih tidak nol, wajib isi catatan.
5. Tutup sesi tidak otomatis membuat jurnal selisih kas.
6. Selisih harus diselesaikan lewat koreksi transaksi, reversal, transfer tambahan, atau jurnal manual sesuai keputusan manajemen.

## Data Model

### Tambahan Field pada Employee

File: `src/types/index.ts`

Tambahkan field optional di `Employee`:

```ts
field_cash_account_id?: string;
field_cash_account_code?: string;
field_cash_account_name?: string;
```

Makna:

- Ini akun kas default milik petugas.
- Snapshot code/name membantu UI tetap jelas.
- Transaksi tetap menyimpan snapshot akun kas masing-masing seperti pola existing.

### Entity Baru: CooperativeFieldCashSession

File: `src/types/index.ts`

```ts
export type CooperativeFieldCashSessionStatus = 'OPEN' | 'CLOSED';
export type CooperativeFieldCashSessionBalanceStatus = 'BALANCED' | 'NON_BALANCED';

export interface CooperativeFieldCashSession {
  id: string;
  session_number: string;
  status: CooperativeFieldCashSessionStatus;

  employee_id: string;
  employee_name: string;
  employee_position?: string;

  cash_account_id: string;
  cash_account_code: string;
  cash_account_name: string;

  opened_at: string;
  opening_cash_amount: number;
  expected_opening_cash_amount: number;
  opening_difference_amount: number;
  opening_note?: string;

  closed_at?: string;
  closing_cash_amount?: number;
  expected_closing_cash_amount?: number;
  closing_difference_amount?: number;
  closing_note?: string;
  balance_status?: CooperativeFieldCashSessionBalanceStatus;

  dropping_from_finance_amount?: number;
  storting_loan_payment_amount?: number;
  storting_saving_deposit_amount?: number;
  loan_disbursement_amount?: number;
  saving_withdrawal_amount?: number;
  deposit_to_finance_amount?: number;

  created_at: string;
  updated_at: string;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
}
```

### Tambahan Field pada FinanceTransaction

File: `src/types/index.ts`

```ts
export type CooperativeFieldCashMovementKind =
  | 'DROPPING_FROM_FINANCE'
  | 'STORTING_LOAN_PAYMENT'
  | 'STORTING_SAVING_DEPOSIT'
  | 'LOAN_DISBURSEMENT'
  | 'SAVING_WITHDRAWAL'
  | 'DEPOSIT_TO_FINANCE';

// FinanceTransaction
field_cash_session_id?: string;
field_cash_session_number?: string;
field_employee_id?: string;
field_employee_name?: string;
field_cash_movement_kind?: CooperativeFieldCashMovementKind;
```

Catatan:

- Field ini hanya atribut laporan lapangan.
- Sumber saldo tetap dari `type`, `category`, `amount`, dan `cash_account_id`.
- Untuk transfer internal, isi field ini pada sisi transaksi yang memakai akun kas petugas.

## Dexie dan Persistence

File target:

- `src/lib/database/KasirkuDB.ts`
- `src/lib/database/migrations.ts`
- `src/utils/backupRestore.ts`

Langkah:

1. Tambahkan table:

```ts
cooperativeFieldCashSessions!: Table<CooperativeFieldCashSession>;
```

2. Tambahkan migration Dexie versi berikutnya setelah versi terakhir.
3. Index yang disarankan:

```txt
cooperativeFieldCashSessions:
id, session_number, status, employee_id, cash_account_id, opened_at, closed_at, balance_status, created_at, updated_at

financeTransactions:
id, type, category, account_id, cash_account_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id

employees:
id, name, email, phone, login_role_id, field_cash_account_id, is_active, updated_at, created_at
```

4. Tambahkan `cooperativeFieldCashSessions` ke backup/restore.
5. Jika persistence Postgres/Tauri wajib untuk production, tambah fase sinkronisasi:
   - SQL migration table `cooperative_field_cash_sessions`.
   - Kolom field cash pada `finance_transactions`.
   - Kolom field cash account pada `employees`.
   - Update adapter Postgres, Rust model/repository/commands, dan sync queue payload.

## Service yang Perlu Dibuat

### cooperativeFieldCashService.ts

File baru: `src/services/cooperativeFieldCashService.ts`

Kontrak utama:

```ts
export interface OpenCooperativeFieldCashSessionInput {
  employee_id: string;
  opening_cash_amount: number;
  opening_note?: string;
}

export interface CloseCooperativeFieldCashSessionInput {
  session_id: string;
  closing_cash_amount: number;
  closing_note?: string;
}

export interface RecordFieldCashTransferInput {
  employee_id: string;
  cash_account_id: string;
  finance_cash_account_id: string;
  amount: number;
  transfer_date?: string;
  notes?: string;
}

export const openCooperativeFieldCashSession = async (input) => {};
export const closeCooperativeFieldCashSession = async (input) => {};
export const getOpenFieldCashSessionForEmployee = async (employeeId: string) => {};
export const getOpenFieldCashSessionForCashAccount = async (cashAccountId: string) => {};
export const getCashAccountBalance = async (cashAccountId: string, untilDate?: string) => {};
export const assertSufficientCashAccountBalance = async (cashAccountId: string, amount: number) => {};
export const recordDroppingFromFinanceToPetugas = async (input) => {};
export const recordDepositFromPetugasToFinance = async (input) => {};
export const buildFieldCashSessionReconciliation = async (sessionId: string) => {};
```

Aturan service:

- Guard permission di service, bukan hanya UI.
- Untuk buka/tutup sesi gunakan permission baru `COOPERATIVE_FIELD_CASH_MANAGE`.
- Untuk lihat rekap gunakan `COOPERATIVE_FIELD_CASH_VIEW` atau `COOPERATIVE_REPORT_VIEW`.
- Semua mutasi tulis `writeActivityLog`.
- Semua mutasi yang menyentuh finance masuk Dexie transaction yang mencakup store terkait.

### Helper Saldo Akun Kas

Saldo kas petugas dihitung dari `financeTransactions` per `cash_account_id`.

```txt
INCOME dan OPENING_BALANCE = tambah
EXPENSE = kurang
deleted_at diabaikan
```

Reversal/void tidak perlu perlakuan khusus jika reversal sudah dicatat sebagai transaksi lawan.

## Update Service Existing

### cashBankTransferService.ts

Tambahkan kemampuan:

- Deteksi apakah `from_cash_account_id` atau `to_cash_account_id` adalah akun kas petugas.
- Jika akun petugas terlibat, cari sesi `OPEN`.
- Isi field field-cash pada sisi transaksi petugas:
  - `to petugas`: `DROPPING_FROM_FINANCE`
  - `from petugas`: `DEPOSIT_TO_FINANCE`
- Jika transfer keluar dari kas petugas, validasi saldo cukup.
- Untuk flow khusus UI koperasi, lebih aman buat wrapper di `cooperativeFieldCashService.ts` agar label dan validasi tidak tercampur dengan transfer kas/bank umum.

### cooperativeLoanService.ts

Update `disburseCooperativeLoan`:

- Jika `payment_method === 'TUNAI'` dan akun kas adalah kas petugas:
  - wajib ada sesi kas petugas `OPEN`;
  - validasi saldo cukup minimal sebesar `net_disbursement_amount`;
  - isi field-cash pada `financeTransaction` dengan `LOAN_DISBURSEMENT`.
- Jika saldo kurang, throw error yang memberi nominal kekurangan.
- Approval pinjaman tetap tidak membuat finance transaction.

### cooperativeLoanService.ts - Pembayaran Angsuran

Update `recordCooperativeLoanPayment`:

- Jika akun kas adalah kas petugas:
  - wajib ada sesi `OPEN`;
  - isi field-cash pada `financeTransaction` dengan `STORTING_LOAN_PAYMENT`.
- Pembayaran non-tunai ke bank tetap boleh tanpa sesi kas petugas.

### cooperativeSavingService.ts

Update `recordCooperativeSaving`:

- Untuk `DEPOSIT` tunai ke akun kas petugas:
  - wajib ada sesi `OPEN`;
  - isi field-cash dengan `STORTING_SAVING_DEPOSIT`.
- Untuk `WITHDRAWAL` tunai dari akun kas petugas:
  - wajib ada sesi `OPEN`;
  - validasi saldo cukup;
  - isi field-cash dengan `SAVING_WITHDRAWAL`.

## UI dan Route

### Menu Baru

Tambahkan menu koperasi:

```txt
/koperasi/kas-petugas
```

Label:

```txt
Kas Petugas
```

Fungsi:

- Lihat sesi aktif per karyawan.
- Buka sesi.
- Dropping dari finance.
- Setor ke finance.
- Tutup sesi.
- Lihat rekap per karyawan.

### Permission dan Module

Tambahkan permission:

```ts
'COOPERATIVE_FIELD_CASH_VIEW'
'COOPERATIVE_FIELD_CASH_MANAGE'
```

Update file:

- `src/types/index.ts`
- `src/auth/permissions.ts`
- `src/auth/permissionCatalog.ts`
- `src/auth/routePermissions.ts`
- `src/constants/setupModules.ts`

Setup module baru:

```txt
KOPERASI_KAS_PETUGAS
```

Module ini sebaiknya aktif jika koperasi pinjaman/penagihan aktif.

### Master Karyawan

File target:

- `src/view/master-data/employees/EmployeeFormModal.tsx`
- `src/view/master-data/employees/EmployeeTable.tsx`
- `src/services/employeeService.ts`

Tambahkan field:

- Pilih akun kas petugas.
- Tombol/aksi opsional "Buat Akun Kas Petugas".

Validasi:

- Akun harus `ASSET`, aktif, postable.
- Satu akun kas petugas tidak boleh dipakai oleh dua karyawan aktif.

### Penagihan

File target:

- `src/hooks/useCooperativeBilling.tsx`
- `src/view/koperasi/billing/CooperativeBillingManagement.tsx`
- `src/view/koperasi/installments/CooperativeLoanPaymentFormModal.tsx`

Tambahan:

- Filter petugas/karyawan.
- Default `cash_account_id` ke kas petugas jika user sedang bekerja sebagai petugas.
- Tampilkan badge sesi aktif: `Kas Petugas Asep - saldo Rp X`.
- Jika tidak ada sesi aktif, tombol bayar tunai ke kas petugas disabled atau menampilkan pesan buka sesi dulu.

### Pinjaman

File target:

- `src/view/koperasi/loans/CooperativeLoanDisbursementModal.tsx`
- `src/view/koperasi/loans/CooperativeLoanManagement.tsx`

Tambahan:

- Tampilkan saldo kas petugas saat akun kas petugas dipilih.
- Jika saldo kurang, tampilkan action "Minta Dropping Finance".
- Jangan izinkan pencairan tunai jika saldo tidak cukup.

### Simpanan

File target:

- `src/view/koperasi/savings/CooperativeSavingFormModal.tsx`
- `src/view/koperasi/savings/CooperativeSavingManagement.tsx`

Tambahan:

- Tampilkan saldo kas petugas saat akun kas petugas dipilih.
- Untuk penarikan, blokir jika saldo petugas kurang.

## Laporan Rekap Per Karyawan

File baru yang disarankan:

- `src/services/cooperativeFieldCashReportService.ts`
- `src/hooks/useCooperativeFieldCashReport.tsx`
- `src/view/koperasi/field-cash/CooperativeFieldCashManagement.tsx`
- `src/view/koperasi/field-cash/CooperativeFieldCashSessionTable.tsx`
- `src/view/koperasi/field-cash/CooperativeFieldCashReportTable.tsx`

Kolom rekap:

| Kolom | Sumber |
|---|---|
| Petugas | `cooperativeFieldCashSessions.employee_name` |
| Sesi | `session_number` |
| Saldo awal | `opening_cash_amount` |
| Dropping finance | sum `field_cash_movement_kind = DROPPING_FROM_FINANCE` |
| Storting angsuran | sum `STORTING_LOAN_PAYMENT` |
| Storting simpanan | sum `STORTING_SAVING_DEPOSIT` |
| Total storting | angsuran + simpanan |
| Dropping pinjaman | sum `LOAN_DISBURSEMENT` |
| Penarikan simpanan | sum `SAVING_WITHDRAWAL` |
| Setor ke finance | sum `DEPOSIT_TO_FINANCE` |
| Saldo akhir sistem | rumus saldo |
| Uang fisik akhir | `closing_cash_amount` |
| Selisih | `closing_difference_amount` |
| Status | `BALANCED/NON_BALANCED` |

Tambahan target penagihan:

- Target bisa dihitung dari angsuran due/overdue anggota yang `officer_id` sama dengan petugas.
- Realisasi menggunakan `STORTING_LOAN_PAYMENT`.
- Persentase:

```txt
realisasi_storting_angsuran / target_tagihan * 100
```

## Akuntansi dan Finance

### Prinsip

- Buka/tutup sesi adalah audit operasional, bukan jurnal.
- Dropping request adalah workflow approval, bukan jurnal.
- Jurnal dibuat hanya saat kas benar-benar berpindah atau transaksi anggota posted.
- Semua jurnal tetap dibuat di `generalLedgerService.ts`.

### Mapping Jurnal

| Kejadian | Finance transaction | Jurnal debit | Jurnal kredit |
|---|---|---|---|
| Buka sesi kas petugas | tidak ada | tidak ada | tidak ada |
| Request dropping | tidak ada | tidak ada | tidak ada |
| Dropping finance ke petugas | `CASH_BANK_TRANSFER`, OUT kas finance, IN kas petugas | Kas Petugas | Kas Finance/Bank |
| Setor petugas ke finance | `CASH_BANK_TRANSFER`, OUT kas petugas, IN kas finance | Kas Finance/Bank | Kas Petugas |
| Pencairan pinjaman tunai dari petugas | `EXPENSE`, `KSP_PENCAIRAN_PINJAMAN`, cash account = Kas Petugas | Piutang Pinjaman Anggota | Kas Petugas |
| Pencairan pinjaman dengan admin/potongan wajib | sama seperti pencairan | Piutang Pinjaman Anggota | Kas Petugas, Pendapatan Admin, Simpanan Wajib |
| Pembayaran angsuran tunai | `INCOME`, `KSP_PEMBAYARAN_ANGSURAN`, cash account = Kas Petugas | Kas Petugas | Piutang Pinjaman Anggota, Pendapatan Bunga, Pendapatan Denda |
| Setoran simpanan | `INCOME`, `KSP_SETORAN_SIMPANAN`, cash account = Kas Petugas | Kas Petugas | Simpanan Anggota |
| Penarikan simpanan | `EXPENSE`, `KSP_PENARIKAN_SIMPANAN`, cash account = Kas Petugas | Simpanan Anggota | Kas Petugas |
| Tutup sesi balance | tidak ada | tidak ada | tidak ada |
| Tutup sesi selisih | tidak otomatis | diselesaikan manual sesuai kebijakan | diselesaikan manual sesuai kebijakan |

Catatan:

- `CASH_BANK_TRANSFER` sudah punya jurnal Dr akun tujuan, Cr akun sumber.
- Simpanan, pencairan pinjaman, dan pembayaran angsuran sudah punya helper jurnal existing.
- Selisih kas jangan otomatis menjadi beban/pendapatan. Untuk produksi, sediakan approval adjustment terpisah jika bisnis memang membutuhkan.

## Acceptance Criteria

1. Admin bisa menghubungkan karyawan dengan akun `Kas Petugas`.
2. Satu karyawan hanya bisa punya satu sesi kas petugas `OPEN`.
3. Dropping finance ke petugas menambah saldo kas petugas dan membuat jurnal transfer jika GL aktif.
4. Setor petugas ke finance mengurangi saldo kas petugas dan membuat jurnal transfer jika GL aktif.
5. Pencairan pinjaman tunai dari kas petugas ditolak jika saldo tidak cukup.
6. Pembayaran angsuran tunai masuk ke kas petugas dan muncul sebagai storting.
7. Setoran simpanan tunai masuk ke kas petugas dan muncul sebagai storting.
8. Penarikan simpanan tunai mengurangi kas petugas dan ditolak jika saldo tidak cukup.
9. Rekap per karyawan menampilkan saldo awal, dropping, storting, pengeluaran, setor finance, saldo akhir, uang fisik, dan selisih.
10. Semua mutasi penting menulis activity log.
11. Jurnal GL tetap balance dan tetap idempotent berdasarkan source existing.
12. Backup/restore membawa data sesi kas petugas.

## Urutan Implementasi yang Disarankan

### Fase 1 - Fondasi Data dan Helper

1. Tambah type `CooperativeFieldCashSession` dan field tambahan di `Employee`/`FinanceTransaction`.
2. Tambah Dexie table dan migration.
3. Tambah backup/restore.
4. Buat helper saldo akun kas per `cash_account_id`.
5. Buat service buka/tutup sesi dan rekonsiliasi.

### Fase 2 - Master Karyawan dan Akun Kas Petugas

1. Tambah field akun kas petugas di form karyawan.
2. Validasi akun asset postable.
3. Cegah akun yang sama dipakai lebih dari satu karyawan aktif.
4. Tambah helper untuk membuat akun `Kas Petugas - Nama`.

### Fase 3 - Dropping dan Setor Finance

1. Buat UI Kas Petugas.
2. Implement wrapper dropping finance ke petugas.
3. Implement wrapper setor petugas ke finance.
4. Tag `financeTransactions` dengan session dan movement kind.
5. Pastikan jurnal transfer tetap dibuat oleh `postCashBankTransferJournal`.

### Fase 4 - Integrasi Flow Koperasi Existing

1. Update pencairan pinjaman agar cek saldo kas petugas.
2. Update pembayaran angsuran agar tercatat sebagai storting.
3. Update setoran/penarikan simpanan agar tercatat ke sesi kas petugas.
4. Tambah filter petugas di Penagihan.
5. Default akun kas berdasarkan petugas/sesi aktif.

### Fase 5 - Rekap Lapangan

1. Buat service laporan per sesi dan per periode.
2. Buat tabel rekap per karyawan.
3. Tambah export CSV/XLSX/PDF jika mengikuti pola laporan existing.
4. Tambah target vs realisasi storting berdasarkan officer anggota.

### Fase 6 - Sync Production

Kerjakan hanya jika data wajib tersinkron ke Postgres/Tauri.

1. Tambah SQL migration.
2. Update Rust model/repository/commands.
3. Update Postgres adapter.
4. Update sync queue payload.
5. Tambah read merge dari remote ke Dexie.

### Fase 7 - Test dan QA

Tambah e2e/manual test:

1. Finance dropping Rp1.000.000 ke Kas Petugas Asep.
2. Asep mencairkan pinjaman Rp700.000.
3. Asep menerima angsuran Rp500.000.
4. Asep menerima setoran simpanan Rp100.000.
5. Asep membayar penarikan simpanan Rp50.000.
6. Asep setor ke finance Rp850.000.
7. Tutup sesi dengan uang fisik sesuai.
8. Rekap harus balance.
9. GL harus punya jurnal:
   - transfer finance ke petugas,
   - pencairan pinjaman,
   - pembayaran angsuran,
   - simpanan,
   - transfer petugas ke finance.

## Catatan Risiko

- Jangan memakai `financeBalance` global untuk validasi saldo kas petugas; saldo harus dihitung per `cash_account_id`.
- Jangan menganggap `created_by` sama dengan petugas lapangan. Petugas harus berasal dari `employees` atau sesi kas petugas.
- Jangan mencatat pencairan pinjaman jika saldo kas petugas minus.
- Jangan membuat jurnal saat approval pinjaman atau request dropping.
- Jangan auto-post selisih kas saat tutup sesi tanpa approval dan mapping akun khusus.
