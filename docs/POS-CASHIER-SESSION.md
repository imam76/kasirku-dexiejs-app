# POS Cashier Session - Buka/Tutup Kasir dan Rekonsiliasi Kas

Dokumen ini adalah langkah implementasi fitur sesi kasir untuk POS Kasirku. Targetnya: transaksi POS tidak lagi berdiri sendiri per tanggal saja, tetapi terikat ke sesi buka/tutup kasir sehingga saldo awal, uang tunai hasil transaksi, uang fisik saat tutup, dan status balance/non balance bisa diaudit.

## Audit Kondisi Project Saat Ini

Yang sudah ada:

- POS utama ada di route `/transaction` dengan UI di `src/view/Transaction.tsx`.
- Checkout final ada di `src/services/checkoutService.ts`.
- Transaksi tersimpan di `transactions` dan `transactionItems`.
- Pembayaran POS sudah punya metode `TUNAI` dan `NON_TUNAI`.
- Void transaksi sudah membalik stok, kas/finance, profit, dan jurnal lewat `src/services/transactionVoidService.ts`.
- Laporan POS saat ini ada di `/report/pos-sales-report` dan membaca `transactions` / `transactionItems`.
- Auth user internal sudah ada, dan `getCurrentSessionUser()` bisa dipakai sebagai snapshot kasir.

Yang belum ada:

- Belum ada table sesi kasir.
- Belum ada field `cashier_session_id` pada `Transaction`.
- Belum ada workflow `Buka Kasir`.
- Belum ada workflow `Tutup Kasir`.
- Belum ada gate POS yang mewajibkan sesi aktif sebelum checkout.
- Belum ada input uang fisik saat tutup sesi.
- Belum ada rekonsiliasi `expected_cash` vs `actual_cash`.
- Belum ada notifikasi khusus saat sesi non balance.
- Belum ada laporan sesi kasir.

## Prinsip Implementasi

- Jangan mengganti flow checkout POS yang sudah ada.
- Jangan mencampur fitur ini dengan Finance > Sales document.
- Mutasi Dexie, activity log, dan kalkulasi rekonsiliasi harus ada di service layer, bukan langsung di komponen.
- `src/store/transactionStore.ts` tetap hanya untuk state keranjang dan pembayaran UI.
- `checkoutService` tetap menjadi sumber kebenaran final checkout.
- Sesi kasir harus optional terhadap General Ledger. Rekonsiliasi sesi kasir adalah audit operasional, bukan jurnal akuntansi baru.
- Sesi kasir menghitung uang fisik tunai. Non-tunai tetap tampil sebagai ringkasan payment channel, tetapi tidak menambah `expected_cash`.
- Transaksi POS harus menyimpan snapshot kasir dan sesi supaya laporan lama tetap stabil walaupun user diedit.
- Void transaksi setelah sesi ditutup tidak boleh mengubah hasil tutup kasir lama secara diam-diam. Sesi tertutup harus menyimpan snapshot closing.
- Gunakan struktur project existing: `src/types`, `src/lib/db.ts`, `src/services`, `src/hooks`, `src/view`, `src/components`, `src/routes`, `src/i18n/messages.ts`.

## File Target

File baru:

- `src/services/cashierSessionService.ts`
- `src/hooks/useCashierSession.tsx`
- `src/components/pos/CashierSessionStatusBar.tsx`
- `src/components/pos/OpenCashierSessionModal.tsx`
- `src/components/pos/CloseCashierSessionModal.tsx`
- `src/view/CashierSessionReport.tsx`
- `src/routes/report/cashier-session-report.lazy.tsx`

File existing yang diubah:

- `src/types/index.ts`
- `src/lib/db.ts`
- `src/services/checkoutService.ts`
- `src/services/transactionVoidService.ts`
- `src/hooks/useTransaction.tsx`
- `src/view/Transaction.tsx`
- `src/view/PosSalesReport.tsx` jika perlu link/filter sesi
- `src/hooks/useReports.tsx`
- `src/routes/__root.tsx`
- `src/routes/report/index.tsx`
- `src/auth/routePermissions.ts`
- `src/auth/moduleAccess.ts`
- `src/utils/backupRestore.ts`
- `src/i18n/messages.ts`

Catatan folder:

- Folder `src/components/pos` boleh dibuat karena POS mulai punya beberapa komponen workflow yang spesifik.
- Jangan membuat folder root baru seperti `components/pos` di luar `src`.
- Jika ingin lebih konservatif, komponen modal boleh diletakkan langsung di `src/components`, tetapi nama file tetap POS-specific.

## Data Model

Tambahkan tipe di `src/types/index.ts`.

```ts
export type CashierSessionStatus = 'OPEN' | 'CLOSED';
export type CashierSessionBalanceStatus = 'BALANCED' | 'NON_BALANCED';

export interface CashierSession {
  id: string;
  session_number: string;
  status: CashierSessionStatus;

  cashier_user_id?: string;
  cashier_user_name?: string;

  opened_at: string;
  opening_cash_amount: number;
  opening_note?: string;

  closed_at?: string;
  closed_by_user_id?: string;
  closed_by_user_name?: string;
  closing_cash_amount?: number;
  closing_note?: string;

  expected_cash_amount?: number;
  cash_sales_amount?: number;
  non_cash_sales_amount?: number;
  total_sales_amount?: number;
  voided_sales_amount?: number;
  transaction_count?: number;
  voided_transaction_count?: number;
  cash_difference_amount?: number;
  balance_status?: CashierSessionBalanceStatus;

  created_at: string;
  updated_at: string;
}
```

Tambahkan field optional ke `Transaction`.

```ts
cashier_session_id?: string;
cashier_session_number?: string;
cashier_user_id?: string;
cashier_user_name?: string;
```

Makna field:

- `cashier_session_id`: relasi ke sesi kasir aktif saat checkout.
- `cashier_session_number`: snapshot nomor sesi untuk laporan dan export.
- `cashier_user_id` / `cashier_user_name`: snapshot user yang menjalankan checkout.

Jangan hanya mengandalkan `created_by` global karena POS butuh snapshot kasir yang eksplisit dan mudah difilter.

## DB Schema Dexie

Tambahkan table property di `src/lib/db.ts`.

```ts
cashierSessions!: Table<CashierSession>;
```

Tambahkan import type `CashierSession`.

Schema live saat dokumen ini dibuat sudah sampai `version(37)`. Saat implementasi, cek lagi `src/lib/db.ts`, lalu gunakan versi berikutnya dari schema live.

Contoh jika versi berikutnya adalah `version(38)`:

```ts
this.version(38).stores({
  cashierSessions: 'id, session_number, status, cashier_user_id, opened_at, closed_at, balance_status, created_at, updated_at',
  transactions: 'id, transaction_number, payment_method, cashier_session_id, cashier_user_id, created_at'
});
```

Catatan penting:

- Jangan menghapus index lama `transactions`.
- Saat mengubah schema `transactions`, ulangi semua index yang masih dibutuhkan: `id`, `transaction_number`, `payment_method`, `created_at`, plus index baru.
- `cashierSessions.status` wajib di-index karena query sesi aktif akan sering dipakai.
- Backup/restore wajib ikut menambahkan `cashierSessions`.

## Nomor Sesi

Buat format sederhana:

```txt
KS-YYYYMMDD-HHmmss
```

Contoh:

```txt
KS-20260608-091530
```

Aturan:

- Generate di service, bukan di komponen.
- Pakai timezone project lewat `dayjs.tz()` jika helper sudah tersedia.
- Nomor sesi harus disimpan sebagai snapshot dan tidak diubah setelah dibuat.

## Service

Buat `src/services/cashierSessionService.ts`.

Kontrak minimal:

```ts
export interface OpenCashierSessionInput {
  opening_cash_amount: number;
  opening_note?: string;
}

export interface CloseCashierSessionInput {
  session_id: string;
  closing_cash_amount: number;
  closing_note?: string;
}

export interface CashierSessionReconciliation {
  opening_cash_amount: number;
  cash_sales_amount: number;
  non_cash_sales_amount: number;
  total_sales_amount: number;
  voided_sales_amount: number;
  transaction_count: number;
  voided_transaction_count: number;
  expected_cash_amount: number;
  closing_cash_amount: number;
  cash_difference_amount: number;
  balance_status: CashierSessionBalanceStatus;
}
```

Function utama:

```ts
export const getOpenCashierSessionForCurrentUser = async () => {};
export const getAnyOpenCashierSession = async () => {};
export const openCashierSession = async (input: OpenCashierSessionInput) => {};
export const calculateCashierSessionReconciliation = async (sessionId: string, closingCashAmount?: number) => {};
export const closeCashierSession = async (input: CloseCashierSessionInput) => {};
export const listCashierSessions = async (filters?: CashierSessionReportFilters) => {};
```

## Aturan Buka Kasir

`openCashierSession()`:

1. Ambil current user dengan `getCurrentSessionUser()`.
2. Cek permission `CASHIER_ACCESS`.
3. Validasi `opening_cash_amount >= 0`.
4. Cek sesi aktif:
   - Fase awal: satu user hanya boleh punya satu sesi `OPEN`.
   - Jika ingin lebih ketat untuk satu device/toko, cek tidak ada sesi `OPEN` sama sekali.
5. Generate `id`, `session_number`, `opened_at`.
6. Simpan `CashierSession` dengan status `OPEN`.
7. Tulis `activityLogs` dengan action `CASHIER_SESSION_OPENED`.
8. Return sesi aktif.

Rekomendasi fase awal:

- Batasi satu sesi `OPEN` per user.
- Jika user lain punya sesi open, tampilkan warning di UI laporan, tetapi jangan blokir kecuali user meminta model satu mesin satu kasir.

## Integrasi Checkout

Ubah `checkoutService.checkout()`:

1. Ambil current user seperti sekarang.
2. Cari sesi kasir aktif untuk current user.
3. Jika tidak ada, throw error khusus:

```ts
throw new Error('Sesi kasir belum dibuka.');
```

4. Saat membuat `Transaction`, isi:

```ts
cashier_session_id: session.id,
cashier_session_number: session.session_number,
cashier_user_id: currentUser?.id,
cashier_user_name: currentUser?.name,
```

5. Jangan update summary sesi di setiap checkout. Summary dihitung saat report/tutup agar void dan perubahan status tetap terbaca.

Alasan tidak update summary per checkout:

- Menghindari double count saat retry.
- Void transaksi sudah mengubah status transaksi, sehingga rekonsiliasi bisa membaca data final.
- Sesi tertutup nanti menyimpan snapshot closing yang final.

## Gate di Halaman POS

Update `src/view/Transaction.tsx`.

Tambahkan status bar sesi kasir di atas area POS:

- Jika tidak ada sesi aktif:
  - tampilkan alert/info "Sesi kasir belum dibuka".
  - tombol utama `Buka Kasir`.
  - produk dan cart boleh terlihat, tetapi tombol bayar/checkout harus disabled atau diarahkan membuka modal buka kasir.
- Jika ada sesi aktif:
  - tampilkan nomor sesi, nama kasir, jam buka, saldo awal.
  - tombol `Tutup Kasir`.

Komponen:

- `CashierSessionStatusBar`
- `OpenCashierSessionModal`
- `CloseCashierSessionModal`

Jangan menaruh seluruh logika open/close di `Transaction.tsx`; gunakan hook dan service.

## Aturan Tutup Kasir

`closeCashierSession()`:

1. Ambil current user.
2. Cek permission `CASHIER_ACCESS`.
3. Ambil session by id.
4. Pastikan status masih `OPEN`.
5. Validasi `closing_cash_amount >= 0`.
6. Hitung rekonsiliasi dari transaksi aktif dalam sesi.
7. Simpan snapshot closing ke `cashierSessions`.
8. Set status menjadi `CLOSED`.
9. Jika `cash_difference_amount !== 0`, set `balance_status = 'NON_BALANCED'`.
10. Jika `cash_difference_amount === 0`, set `balance_status = 'BALANCED'`.
11. Tulis `activityLogs`:
    - `CASHIER_SESSION_CLOSED` jika balance.
    - `CASHIER_SESSION_CLOSED_NON_BALANCED` jika non balance.
12. Return session final.

## Rumus Rekonsiliasi

Ambil transaksi dengan:

```ts
transaction.cashier_session_id === session.id
```

Pisahkan transaksi:

- Transaksi aktif: `status !== 'VOIDED'`.
- Transaksi voided: `status === 'VOIDED'`.

Hitungan:

```txt
cash_sales_amount = sum(active transactions where payment_method === 'TUNAI', total_amount)
non_cash_sales_amount = sum(active transactions where payment_method === 'NON_TUNAI', total_amount)
total_sales_amount = cash_sales_amount + non_cash_sales_amount
voided_sales_amount = sum(voided transactions, total_amount)
transaction_count = count(active transactions)
voided_transaction_count = count(voided transactions)
expected_cash_amount = opening_cash_amount + cash_sales_amount
cash_difference_amount = closing_cash_amount - expected_cash_amount
balance_status = cash_difference_amount === 0 ? BALANCED : NON_BALANCED
```

Catatan:

- `payment_amount` untuk transaksi tunai bisa lebih besar dari total karena ada kembalian. Cash drawer yang harus bertambah adalah `total_amount`, bukan `payment_amount`.
- `change_amount` tidak perlu ditambahkan karena uang kembalian keluar kembali ke customer.
- Non-tunai tidak menambah uang fisik drawer.
- Void transaksi aktif sebelum tutup sesi tidak masuk cash sales.
- Void transaksi setelah sesi ditutup harus tampil sebagai kejadian setelah closing di laporan audit, tetapi tidak mengubah snapshot closing lama.

## Notifikasi Non Balance

Saat user klik tutup kasir:

- Jika `cash_difference_amount === 0`, tampilkan success.
- Jika `cash_difference_amount !== 0`, tampilkan modal/alert warning sebelum final close:
  - Expected cash.
  - Uang fisik input.
  - Selisih.
  - Status `NON_BALANCED`.
  - Input catatan wajib jika selisih tidak nol.

Aturan:

- Jangan blokir tutup kasir hanya karena non balance.
- Wajib minta catatan untuk non balance.
- Setelah berhasil tutup, tampilkan notification warning:

```txt
Sesi kasir ditutup dengan status NON BALANCED. Selisih: Rp ...
```

## Laporan Sesi Kasir

Buat route:

```txt
/report/cashier-session-report
```

Nama menu:

```txt
Laporan Sesi Kasir
```

Isi halaman:

- Filter tanggal buka/tutup.
- Filter status: semua, open, closed.
- Filter balance status: semua, balanced, non balanced.
- Filter kasir.
- Summary cards:
  - Total sesi.
  - Sesi open.
  - Sesi non balance.
  - Total expected cash.
  - Total actual cash.
  - Total selisih.
- Table sesi:
  - Nomor sesi.
  - Kasir.
  - Jam buka.
  - Jam tutup.
  - Saldo awal.
  - Penjualan tunai.
  - Penjualan non-tunai.
  - Expected cash.
  - Uang fisik.
  - Selisih.
  - Status.
- Detail/drawer sesi:
  - Ringkasan rekonsiliasi.
  - Daftar transaksi dalam sesi.
  - Daftar void dalam sesi.
  - Catatan buka/tutup.

Jangan mengganti `/report/pos-sales-report`. Laporan POS tetap untuk performa penjualan. Laporan sesi kasir khusus untuk audit kasir/drawer.

## Hook

Buat `src/hooks/useCashierSession.tsx`.

Isi minimal:

- Query sesi aktif current user.
- Mutation buka sesi.
- Mutation hitung preview tutup sesi.
- Mutation tutup sesi.
- Query list laporan sesi.
- Invalidation:
  - `['cashierSession', 'active']`
  - `['cashierSessions']`
  - `['posSalesReport']`
  - `['transactions-history']`

Hook hanya orchestration dan feedback ringan. Kalkulasi tetap di service.

## Permission dan Module Access

Fase awal cukup pakai permission existing:

- `/transaction`: `CASHIER_ACCESS`
- `/report/cashier-session-report`: `CASHIER_ACCESS`

Jika nanti ingin pisah akses:

```ts
| 'CASHIER_SESSION_MANAGE'
| 'CASHIER_SESSION_REPORT_VIEW'
```

Untuk fase awal jangan menambah permission baru jika belum dibutuhkan, karena role `KASIR`, `ADMIN`, dan `OWNER` sudah punya `CASHIER_ACCESS`.

Update file:

- `src/auth/routePermissions.ts`
- `src/auth/moduleAccess.ts`
- `src/routes/__root.tsx`
- `src/routes/report/index.tsx`

## Backup dan Restore

Update `src/utils/backupRestore.ts`.

Tambahkan:

- Export `cashierSessions`.
- Validasi expected key `cashierSessions`.
- Tambahkan table ke transaksi restore.
- Clear `cashierSessions`.
- Bulk add `cashierSessions`.

Urutan restore:

1. `cashierSessions` boleh di-restore sebelum atau sesudah `transactions`.
2. Jangan menghapus transaksi lama yang belum punya `cashier_session_id`.
3. Laporan sesi hanya menampilkan transaksi yang punya session id. Laporan POS lama tetap membaca semua transaksi aktif.

## Sync dan Tauri/PostgreSQL

Fase awal Dexie-only boleh dilakukan jika targetnya memperbaiki workflow lokal POS dulu.

Jika ingin mengikuti persistence layer Tauri/PostgreSQL:

- Tambahkan migration `src-tauri/migrations/00xx_cashier_sessions.sql`.
- Tambahkan model Rust `src-tauri/src/models/cashier_session.rs`.
- Tambahkan repository Rust `src-tauri/src/repositories/cashier_session_repository.rs`.
- Tambahkan command Rust jika sync queue akan mengirim sesi.
- Tambahkan domain sync di `src/services/syncQueueService.ts`.

Rekomendasi implementasi:

- Fase 1: Dexie-only, backup/restore, dan laporan lokal.
- Fase 2: sync queue/PostgreSQL setelah flow POS sesi stabil.

## i18n

Tambahkan key Indonesia dan Inggris di `src/i18n/messages.ts`.

Prefix rekomendasi:

```txt
cashierSession.*
report.cashierSession.*
```

Contoh key:

- `cashierSession.openTitle`
- `cashierSession.closeTitle`
- `cashierSession.openingCash`
- `cashierSession.closingCash`
- `cashierSession.expectedCash`
- `cashierSession.actualCash`
- `cashierSession.difference`
- `cashierSession.balanceStatus.balanced`
- `cashierSession.balanceStatus.nonBalanced`
- `cashierSession.nonBalancedWarning`
- `report.cashierSession.title`
- `report.cashierSession.subtitle`

## UI Flow

### Buka Kasir

1. User masuk `/transaction`.
2. Sistem cek sesi aktif.
3. Jika belum ada, tampilkan status bar dengan tombol `Buka Kasir`.
4. User isi saldo awal.
5. User submit.
6. Sesi aktif muncul, checkout bisa dipakai.

### Transaksi

1. User checkout seperti biasa.
2. Service mencari sesi aktif.
3. Transaksi disimpan dengan snapshot sesi dan kasir.
4. Laporan POS tetap berjalan seperti sebelumnya.

### Tutup Kasir

1. User klik `Tutup Kasir`.
2. Sistem tampilkan preview:
   - saldo awal,
   - tunai masuk,
   - non-tunai,
   - void,
   - expected cash.
3. User isi uang fisik.
4. Jika selisih nol, close langsung.
5. Jika selisih tidak nol, tampilkan warning dan wajib catatan.
6. Sesi ditutup dan status balance/non balance tersimpan.

## Edge Case

- User logout saat sesi masih open: jangan auto close. Saat login lagi, tampilkan sesi open.
- User mencoba checkout tanpa sesi: blokir dengan pesan jelas.
- User membuka sesi kedua saat masih ada sesi open miliknya: tolak.
- User void transaksi dari sesi closed: transaksi boleh void sesuai permission existing, tetapi snapshot closing session lama tidak berubah.
- Transaksi lama tanpa `cashier_session_id`: tetap muncul di Laporan POS, tetapi tidak masuk Laporan Sesi Kasir.
- Non-tunai: masuk summary sesi, tidak menambah expected cash.
- Closing non balance: boleh disimpan, wajib note.
- Restore backup lama tanpa `cashierSessions`: restore tetap harus toleran jika payload lama belum punya key ini.

## Acceptance Criteria

- User kasir bisa membuka sesi dengan saldo awal.
- POS menolak checkout jika sesi kasir belum dibuka.
- Checkout POS menyimpan `cashier_session_id`, `cashier_session_number`, `cashier_user_id`, dan `cashier_user_name`.
- User bisa menutup sesi dengan input uang fisik.
- Sistem menghitung expected cash dari saldo awal + penjualan tunai aktif.
- Sistem menampilkan status `BALANCED` jika selisih nol.
- Sistem menampilkan warning dan menyimpan status `NON_BALANCED` jika ada selisih.
- Non balance wajib memiliki catatan closing.
- Laporan sesi kasir menampilkan daftar sesi dan detail transaksi sesi.
- Laporan POS existing tetap berjalan dan tidak berubah menjadi laporan sesi.
- Void transaksi tetap membalik stok, finance, profit, dan jurnal seperti sebelumnya.
- Backup/restore menyertakan data sesi kasir.

## Urutan Implementasi

1. Tambah type `CashierSession` dan field session di `Transaction`.
2. Tambah Dexie table `cashierSessions` dan index baru transaksi.
3. Update backup/restore.
4. Buat `cashierSessionService`.
5. Buat `useCashierSession`.
6. Integrasikan session lookup ke `checkoutService`.
7. Tambah UI status bar dan modal buka/tutup di `/transaction`.
8. Tambah route dan halaman laporan sesi kasir.
9. Tambah menu report dan route permission.
10. Tambah i18n.
11. Jalankan build/lint.
12. Uji manual flow buka kasir, checkout tunai, checkout non-tunai, tutup balance, tutup non balance, dan laporan sesi.

## Test Manual Minimal

### CS-01 Buka Kasir

Langkah:

1. Login sebagai Kasir.
2. Buka `/transaction`.
3. Klik `Buka Kasir`.
4. Isi saldo awal Rp 100.000.
5. Simpan.

Expected:

- Sesi status `OPEN`.
- Nomor sesi tampil.
- Checkout bisa dipakai.

### CS-02 Blokir Checkout Tanpa Sesi

Langkah:

1. Pastikan tidak ada sesi open.
2. Tambah produk ke cart.
3. Coba bayar.

Expected:

- Checkout ditolak.
- Pesan menyebut sesi kasir belum dibuka.

### CS-03 Tutup Balance

Langkah:

1. Buka sesi saldo awal Rp 100.000.
2. Buat transaksi tunai Rp 25.000.
3. Tutup kasir dengan uang fisik Rp 125.000.

Expected:

- Expected cash Rp 125.000.
- Selisih Rp 0.
- Status `BALANCED`.

### CS-04 Tutup Non Balance

Langkah:

1. Buka sesi saldo awal Rp 100.000.
2. Buat transaksi tunai Rp 25.000.
3. Tutup kasir dengan uang fisik Rp 120.000.
4. Isi catatan selisih.

Expected:

- Expected cash Rp 125.000.
- Selisih -Rp 5.000.
- Status `NON_BALANCED`.
- Notification warning muncul.

### CS-05 Non Tunai Tidak Menambah Drawer

Langkah:

1. Buka sesi saldo awal Rp 100.000.
2. Buat transaksi non-tunai Rp 25.000.
3. Tutup kasir dengan uang fisik Rp 100.000.

Expected:

- Non-tunai tampil di summary Rp 25.000.
- Expected cash tetap Rp 100.000.
- Status `BALANCED`.

### CS-06 Void Sebelum Tutup

Langkah:

1. Buka sesi saldo awal Rp 100.000.
2. Buat transaksi tunai Rp 25.000.
3. Void transaksi tersebut.
4. Tutup kasir dengan uang fisik Rp 100.000.

Expected:

- Cash sales aktif Rp 0.
- Voided sales Rp 25.000.
- Expected cash Rp 100.000.
- Status `BALANCED`.

## Catatan Implementasi Lanjutan

- Jika nanti perlu multi device, tambahkan field `device_id` atau `terminal_id` ke `CashierSession`.
- Jika nanti perlu cash movement manual dalam sesi, buat table terpisah `cashierSessionCashMovements` untuk petty cash in/out, bukan menumpang ke transaksi POS.
- Jika nanti perlu approval selisih, tambahkan status review seperti `PENDING_REVIEW`, `APPROVED`, dan `REJECTED`.
- Jika nanti sesi kasir harus memposting jurnal selisih kas, buat fase akuntansi terpisah. Jangan memasukkan selisih sebagai income/expense otomatis di fase awal.
