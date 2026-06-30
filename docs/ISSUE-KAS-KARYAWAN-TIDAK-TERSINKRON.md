# Issue: Akun Kas Petugas/Karyawan Tidak Tersinkron ke PC Lain

Tanggal catatan: 2026-06-30

## Ringkasan

Ada indikasi akun kas petugas/karyawan yang dibuat dari master karyawan hanya
tersimpan di Dexie lokal PC pembuat, tetapi tidak masuk ke PostgreSQL atau tidak
terbawa saat PC lain melakukan refresh. Dampaknya PC B tidak melihat kas baru
yang dibuat di PC A.

Gejala yang dilaporkan:

- Di PC A, akun kas karyawan berhasil dibuat.
- Di PC B, setelah sync/refresh database, akun kas baru tidak muncul.
- Dugaan awal: data masih berhenti di Dexie lokal.

## Temuan Awal

### 1. Tombol `Buat Akun` hanya membuat `chartOfAccounts` lokal

File terkait:

- `src/view/master-data/employees/EmployeeManagement.tsx`
- `src/view/master-data/employees/EmployeeFormModal.tsx`
- `src/services/employeeService.ts`

Flow UI:

- `EmployeeFormModal` memanggil `onCreateFieldCashAccount`.
- `EmployeeManagement` meneruskan ke `createFieldCashAccountForEmployee`.
- `createFieldCashAccountForEmployee` membuat row `ChartOfAccount` baru di
  Dexie table `chartOfAccounts`.

Kondisi sekarang:

- Fungsi tersebut hanya melakukan:
  - `db.chartOfAccounts.add(account)`
  - `writeActivityLog(...)`
- Tidak ada enqueue sync queue untuk `chartOfAccounts`.
- Tidak ada adapter PostgreSQL untuk `chartOfAccounts` yang terlihat di
  `src/services/postgresAdapter.ts`.
- Tidak ada refresh read service dari PostgreSQL untuk `chartOfAccounts`.

Dampak:

- Akun kas petugas yang baru dibuat bisa valid di PC A.
- PC B tidak punya row `chartOfAccounts` dengan ID akun tersebut.
- Jika employee tersinkron tetapi akun COA tidak ikut tersinkron, PC B bisa
  memiliki employee yang menunjuk `field_cash_account_id` yang tidak ada di
  Dexie `chartOfAccounts`.

### 2. Data employee sudah punya direct upload, tetapi tidak retryable

File terkait:

- `src/services/employeeService.ts`
- `src/services/postgresAdapter.ts`
- `src/services/employeeReadService.ts`

Kondisi sekarang:

- `createEmployee`, `updateEmployee`, `archiveEmployee`, dan `restoreEmployee`
  mencoba upload langsung ke PostgreSQL memakai:
  - `employeePostgresAdapter.upsert`
  - `employeeAreaPostgresAdapter.upsert`
  - `employeeCollectionSchedulePostgresAdapter.upsert`
- Upload tersebut dibungkus `try/catch`.
- Jika upload gagal, error hanya masuk `console.error`, lalu flow tetap sukses
  karena data sudah tersimpan lokal.

Dampak:

- UI bisa menampilkan pesan berhasil, padahal PostgreSQL belum menerima data.
- Tidak ada status `pending`/`failed` untuk employee.
- Tidak ada mekanisme retry otomatis melalui tombol Sync DB.

### 3. `syncQueueService.ts` belum mendukung employee

File terkait:

- `src/services/syncQueueService.ts`
- `src/services/syncOrchestratorService.ts`

Kondisi sekarang:

- `syncQueueService.ts` belum memiliki entity queue untuk:
  - `employees`
  - `employeeAreas`
  - `employeeCollectionSchedules`
- Belum ada mapper local ke remote DTO untuk employee di sync queue.
- Belum ada payload validator employee.
- Belum ada processor queue employee.
- Belum ada helper enqueue employee.
- `enqueueAllPendingLocalChangesForSync` belum memanggil scanner pending
  employee.

Dampak:

- Local change employee tidak punya jalur retry berbasis sync queue.
- Jika direct upload gagal sekali, data bisa tertahan lokal tanpa masuk antrean.

### 4. PC B refresh employee, tetapi tidak membangun akun kas lokal

File terkait:

- `src/services/employeeReadService.ts`

Kondisi sekarang:

- `refreshEmployeesFromPostgres` sudah menarik employee dari PostgreSQL.
- `mapRemoteEmployeeToLocal` menyimpan:
  - `field_cash_account_id`
  - `field_cash_account_code`
  - `field_cash_account_name`
- Namun merge remote employee tidak memastikan row `chartOfAccounts` untuk
  akun kas tersebut tersedia di Dexie PC B.

Dampak:

- Snapshot kode/nama akun bisa terlihat pada employee.
- Tetapi fitur yang butuh lookup `db.chartOfAccounts.get(field_cash_account_id)`
  tetap bisa gagal karena akun kasnya tidak ada di tabel akun lokal.

## Dugaan Akar Masalah

Ada dua gap yang saling terkait:

1. Akun kas petugas adalah row `chartOfAccounts`, tetapi tabel ini belum punya
   jalur sync PostgreSQL lintas perangkat.
2. Employee sync masih direct upload non-retryable, bukan bagian dari
   `syncQueueService.ts`.

Karena itu kasus yang mungkin terjadi:

- PC A membuat akun kas petugas.
- Akun masuk Dexie PC A saja.
- Employee di PC A menyimpan referensi `field_cash_account_id`.
- Upload employee bisa gagal diam-diam, atau berhasil tetapi hanya membawa
  snapshot ID/kode/nama akun.
- PC B refresh dari PostgreSQL tidak mendapatkan row `chartOfAccounts` baru.

## File Yang Perlu Diaudit Saat Fix

- `src/services/employeeService.ts`
- `src/services/employeeReadService.ts`
- `src/services/syncQueueService.ts`
- `src/services/syncOrchestratorService.ts`
- `src/services/postgresAdapter.ts`
- `src-tauri/src/repositories/employee_repository.rs`
- `src-tauri/src/models/employee.rs`
- `src-tauri/migrations/0030_employees.sql`
- `src/lib/database/migrations.ts`
- `src/types/index.ts`

## Opsi Fix

### Opsi A: Fix lengkap, sync `chartOfAccounts` sebagai master data

Tambahkan jalur sync untuk `chartOfAccounts`:

- PostgreSQL table/migration untuk chart of accounts jika belum ada.
- Tauri model, repository, command, dan adapter frontend.
- Read service untuk refresh akun dari PostgreSQL ke Dexie.
- Entity queue di `syncQueueService.ts`.
- Scanner pending local account di orchestrator.
- Update `createFieldCashAccountForEmployee` supaya akun kas baru masuk queue.

Kelebihan:

- Sumber kebenaran akun kas menjadi jelas.
- Tidak hanya kas petugas yang tersync, semua akun baru di Chart of Accounts
  juga bisa konsisten lintas perangkat.

Risiko:

- Scope lebih besar karena chart of accounts dipakai banyak modul finance.
- Perlu aturan conflict untuk kode akun yang sama dibuat dari dua PC.

### Opsi B: Fix minimal untuk kas petugas dari snapshot employee

Saat merge remote employee, jika ada `field_cash_account_id` dan akun tersebut
belum ada di Dexie PC lokal, buat row `chartOfAccounts` lokal dari snapshot:

- `id`: `field_cash_account_id`
- `code`: `field_cash_account_code`
- `name`: `field_cash_account_name`
- `type`: `ASSET`
- `normal_balance`: `DEBIT`
- `parent_id`: `cash-and-bank` atau parent kas/bank lokal yang tersedia
- `is_postable`: `true`
- `is_system`: `false`
- `is_active`: mengikuti employee/account snapshot

Kelebihan:

- Lebih cepat menutup gejala PC B tidak punya akun kas.
- Tidak perlu langsung membangun sync penuh chart of accounts.

Risiko:

- Ini hanya rekonstruksi dari snapshot employee, bukan sync akun yang utuh.
- Perubahan akun di menu Chart of Accounts tetap belum menjadi master lintas PC.
- Bisa menyembunyikan masalah arsitektur sync COA.

### Opsi C: Kombinasi bertahap

Tahap pendek:

- Tambahkan employee ke sync queue agar create/update employee retryable.
- Saat refresh employee, buat fallback akun kas lokal dari snapshot jika missing.

Tahap berikutnya:

- Tambahkan sync penuh untuk `chartOfAccounts`.
- Migrasikan fallback agar tidak menjadi sumber kebenaran permanen.

## Rekomendasi

Gunakan Opsi C.

Alasannya:

- Masalah user yang terlihat sekarang bisa ditutup lebih cepat.
- Employee tidak lagi gagal diam-diam karena masuk queue.
- Jalan menuju sync penuh `chartOfAccounts` tetap terbuka dan lebih rapi.

## Acceptance Criteria

- Membuat akun kas petugas di PC A tidak hanya tersimpan di Dexie lokal.
- Setelah PC A menjalankan sync dan PC B menjalankan refresh/sync, PC B melihat:
  - employee/karyawan terkait,
  - `field_cash_account_id`,
  - akun kas di daftar akun kas/bank lokal.
- Jika PostgreSQL sedang offline, perubahan employee/kas tidak hilang dan bisa
  retry lewat Sync DB.
- Tidak ada lagi flow employee yang hanya `console.error` saat upload gagal.
- Transfer/droping/storting yang membutuhkan lookup akun kas tidak gagal di PC B
  karena missing `chartOfAccounts`.

## Catatan Data Repair

Untuk data yang sudah terlanjur dibuat sebelum fix:

- Perlu scanner/backfill untuk employee lokal yang punya `field_cash_account_id`
  tetapi belum pernah masuk queue.
- Perlu repair di PC B untuk employee remote yang menunjuk akun kas missing.
- Jika akun kas hanya ada di Dexie PC A dan belum pernah masuk PostgreSQL,
  perlu sync/manual repair dari PC A sebagai sumber data awal.

## Status

Belum difix. Dokumen ini hanya mencatat issue, bukti awal, dan arah
implementasi berikutnya.
