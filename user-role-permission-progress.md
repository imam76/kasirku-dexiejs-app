# Progress Implementasi User, Role, dan Permission

Dokumen ini mencatat progres bertahap supaya programmer berikutnya bisa lanjut tanpa menebak konteks.

## Tahap 1 - Fondasi Auth Lokal

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Menambahkan tipe auth dasar di `src/types/index.ts`: `UserRole`, `Permission`, `AuthUser`, `AuthSession`, dan `ActivityLog`.
- Menambahkan tabel Dexie versi 11 di `src/lib/db.ts`: `authUsers`, `authSessions`, dan `activityLogs`.
- Membuat permission matrix awal di `src/auth/permissions.ts` sesuai panduan.
- Membuat service auth lokal di `src/auth/authService.ts` untuk hash PIN, verifikasi PIN, setup owner pertama, login, logout, session aktif, activity log, dan guard permission berbasis role.
- Membuat `AuthProvider` di `src/auth/AuthProvider.tsx`.
- Memisahkan `AuthContext` dan `useAuth` ke file kecil sendiri agar sesuai aturan Fast Refresh ESLint.
- Membuat komponen UI guard `src/auth/RequirePermission.tsx`.
- Memasang `AuthProvider` di `src/main.tsx` tanpa mengubah urutan provider theme, i18n, query, atau router.

Catatan:

- Belum ada PIN default yang di-hardcode. Owner pertama harus dibuat lewat tahap setup screen berikutnya.
- `ensureDefaultOwner()` belum membuat user otomatis; fungsinya menjaga session tidak aktif jika belum ada Owner aktif.
- Permission `STOCK_PURCHASE_ACCESS` ditambahkan agar rekomendasi akses belanja stok di panduan punya permission eksplisit.

Tahap berikutnya yang disarankan:

1. Buat setup Owner dan login PIN sederhana.
2. Pasang guard auth di root/layout supaya app masuk setup/login saat belum ada session.
3. Filter menu dan route berdasarkan permission.

## Tahap 2 - Setup Owner dan Login PIN

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Membuat screen setup Owner pertama di `src/view/auth/SetupOwner.tsx`.
- Membuat screen login PIN di `src/view/auth/Login.tsx`.
- Membuat `src/auth/AuthGate.tsx` untuk menahan layout utama sampai ada Owner aktif dan session login.
- Memasang `AuthGate` di `src/routes/__root.tsx` tanpa membuat route baru dan tanpa mengedit `routeTree.gen.ts`.

Catatan:

- Setup Owner otomatis login setelah user Owner pertama berhasil dibuat.
- Login fase awal masih berbasis PIN saja dan menampilkan daftar user aktif sebagai referensi. Pemilihan user eksplisit bisa ditambahkan saat fitur kelola user masuk.
- Guard ini baru mengunci akses app secara umum. Filter menu dan guard permission per route/action belum dikerjakan di tahap ini.

Tahap berikutnya yang disarankan:

1. Filter menu utama berdasarkan permission.
2. Tambahkan route-level guard untuk halaman sensitif.
3. Mulai dari guard void transaksi karena action itu sudah ada dan sensitif.

## Tahap 3 - Filter Menu dan Guard Halaman

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Membuat helper akses route di `src/auth/routePermissions.ts` agar mapping permission route tidak diduplikasi di root, home, dan report index.
- Memfilter menu sidebar di `src/routes/__root.tsx` berdasarkan permission user login.
- Menambahkan guard halaman di root layout. Jika URL sensitif dibuka langsung tanpa permission, halaman menampilkan status 403 dan tidak merender route target.
- Menyembunyikan tombol cepat pengaturan di top bar jika user tidak punya `SETTINGS_ACCESS`.
- Memfilter kartu menu dashboard di `src/routes/index.tsx` berdasarkan permission.
- Memfilter kartu laporan di `src/routes/report/index.tsx` berdasarkan permission.

Mapping awal:

- `/transaction`, `/history`, sales report, dan detail report memakai `CASHIER_ACCESS`.
- `/stock` dan `/units` memakai `STOCK_ACCESS`.
- `/shopping-note` dan purchase report memakai `STOCK_PURCHASE_ACCESS`.
- `/finance` dan expense report memakai `FINANCE_ACCESS`.
- `/profit` memakai `PROFIT_VIEW`.
- `/settings` memakai `SETTINGS_ACCESS`.

Catatan:

- Guard ini baru mencegah akses halaman dan menu. Action sensitif tetap harus diberi guard sendiri di tahap berikutnya.
- `/report` boleh dibuka jika user punya salah satu akses laporan yang relevan, lalu isi kartu laporan tetap difilter lagi.

Tahap berikutnya yang disarankan:

1. Guard void transaksi di UI dan service.
2. Tulis activity log saat void transaksi berhasil.
3. Setelah itu lanjut hide profit/HPP/margin untuk role tanpa `PROFIT_VIEW`.

## Tahap 4 - Guard Void Transaksi dan Activity Log

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Menyembunyikan tombol void/batalkan transaksi di `src/view/History.tsx` jika user tidak punya `TRANSACTION_VOID`.
- Menambahkan guard `requirePermission('TRANSACTION_VOID')` sebelum modal void dibuka.
- Menambahkan guard service di `src/services/transactionVoidService.ts` agar void tetap ditolak walau dipanggil dari luar UI.
- Menulis activity log `TRANSACTION_VOID` setelah void transaksi berhasil.

Catatan:

- Guard UI hanya untuk pengalaman user. Sumber keamanan aksi tetap ada di service.
- Activity log menyimpan user, role, id transaksi, nomor transaksi, dan alasan void.

Tahap berikutnya yang disarankan:

1. Hide profit/HPP/margin untuk role tanpa `PROFIT_VIEW` di History, report, dan export.
2. Setelah aman, lanjut fitur edit harga transaksi dengan audit snapshot.

## Tahap 5 - Hide Profit, HPP, dan Margin

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Menyembunyikan ringkasan profit transaksi dan detail HPP/profit item di `src/view/History.tsx` jika user tidak punya `PROFIT_VIEW`.
- Menyembunyikan statistik total profit di `src/view/SalesReport.tsx` untuk user tanpa `PROFIT_VIEW`.
- Menyembunyikan kolom profit dan margin produk teratas di `src/view/sales-report/TopProductsTable.tsx`.
- Mengamankan export CSV sales report agar kolom HPP/profit dan ringkasan profit tidak ikut ter-export tanpa `PROFIT_VIEW`.
- Menyembunyikan kolom HPP, total cost, margin item, margin transaksi, dan ringkasan margin di `src/view/TransactionDetailReport.tsx`.
- Mengamankan export CSV dan PDF detail transaksi agar HPP/cost/profit/margin tidak ikut keluar tanpa `PROFIT_VIEW`.

Catatan:

- Route `/profit` sudah diguard di tahap 3 dengan `PROFIT_VIEW`.
- Perubahan ini fokus ke History dan report/export sesuai panduan. Area stok masih belum disentuh di tahap ini.

Tahap berikutnya yang disarankan:

1. Implement edit harga saat transaksi dengan permission `TRANSACTION_EDIT_PRICE`.
2. Simpan snapshot audit harga final/original di cart dan transaction item.
3. Tambahkan activity log saat harga item diubah manual.

## Tahap 6 - Edit Harga Saat Transaksi

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Menambahkan field audit harga di `src/types/index.ts` untuk `CartItem` dan `TransactionItem`.
- Menambahkan helper `getCartItemPrice` dan `getCartItemOriginalPrice` di `src/utils/pricing.ts` supaya total, UI, dan checkout memakai sumber hitung yang sama.
- Menambahkan action `updateCustomPrice` di `src/store/transactionStore.ts`.
- Menampilkan input harga manual di `src/components/CartItem.tsx` hanya untuk user dengan `TRANSACTION_EDIT_PRICE`.
- Mengalirkan `updateCustomPrice` ke cart desktop dan mobile.
- Mengubah total cart di `src/hooks/useTransaction.tsx` agar memakai harga custom jika ada.
- Mengubah checkout snapshot di `src/services/checkoutService.ts` agar menyimpan harga final, harga original, flag edit harga, user editor, dan waktu edit.
- Menambahkan guard service: checkout dengan harga custom akan ditolak jika user tidak punya `TRANSACTION_EDIT_PRICE`.
- Menulis activity log `TRANSACTION_EDIT_PRICE` untuk setiap item yang harganya diedit saat checkout berhasil.

Catatan:

- Activity log edit harga ditulis saat checkout berhasil supaya log tidak spam setiap digit input harga berubah.
- Jika harga manual di-reset, field audit cart dibersihkan sebelum checkout.
- Jika satuan item berubah, harga manual juga di-reset karena harga manual disimpan per satuan.

Tahap berikutnya yang disarankan:

1. Buat user management minimal untuk Owner (`USER_MANAGE`).
2. Tambahkan halaman activity log agar audit yang sudah ditulis bisa dilihat.

## Tahap 7 - User Management Minimal Owner

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Menambahkan API mutasi user di `src/auth/authService.ts`: tambah user, edit nama/role, reset PIN, dan aktif/nonaktif user.
- Semua mutasi user diguard dengan permission `USER_MANAGE` di service, bukan hanya di UI.
- Menambahkan validasi service untuk nama user, PIN minimal 4 digit angka, dan PIN tidak boleh sama dengan user lain.
- Menjaga minimal harus ada satu Owner aktif; Owner terakhir tidak bisa didemote atau dinonaktifkan.
- User yang sedang login tidak bisa menonaktifkan dirinya sendiri.
- Saat user dinonaktifkan, session milik user tersebut ikut dihapus.
- Menulis activity log untuk tambah user, edit user, reset PIN, aktifkan user, dan nonaktifkan user.
- Menambahkan komponen `src/view/auth/UserManagement.tsx`.
- Menampilkan user management di halaman `src/routes/settings.lazy.tsx` hanya jika user punya `USER_MANAGE`.

Catatan:

- Implementasi sengaja ditempatkan di Settings, bukan membuat route baru `/users`, supaya tidak perlu menyentuh generated route tree.
- Admin tetap bisa membuka Settings sesuai matrix awal, tapi tidak melihat section kelola user.
- Belum ada halaman activity log untuk membaca log yang sudah ditulis.

Tahap berikutnya yang disarankan:

1. Buat halaman/section activity log untuk Owner/Admin.
2. Lanjut update backup/restore agar auth user dan activity log ikut aman sesuai panduan.

## Tahap 8 - Activity Log Viewer

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Menambahkan permission `ACTIVITY_LOG_VIEW` di `src/types/index.ts`.
- Menambahkan `ACTIVITY_LOG_VIEW` ke role Owner dan Admin di `src/auth/permissions.ts`.
- Menambahkan API `getActivityLogs()` di `src/auth/authService.ts`.
- Baca activity log diguard di service dengan `ACTIVITY_LOG_VIEW`, bukan hanya disembunyikan dari UI.
- Menambahkan komponen `src/view/auth/ActivityLogViewer.tsx`.
- Menampilkan activity log di halaman `src/routes/settings.lazy.tsx` hanya untuk user yang punya `ACTIVITY_LOG_VIEW`.
- Activity log menampilkan waktu, user, role, action, entity, entity id, dan keterangan.

Catatan:

- Implementasi dibuat sebagai section Settings dulu, bukan route baru `/activity-log`, agar tidak menyentuh generated route tree dan tetap kecil.
- Limit awal tampilan log adalah 200 record terbaru.
- Activity log sudah bisa membaca log dari tahap auth, login/logout, void, edit harga, dan user management.

Tahap berikutnya yang disarankan:

1. Update backup/restore agar `authUsers` dan `activityLogs` ikut backup, session tidak wajib ikut backup.
2. Setelah restore, pastikan session logout dan minimal ada satu Owner aktif.

## Tahap 9 - Backup Restore Auth Data

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Backup database di `src/utils/backupRestore.ts` sekarang menyertakan `authUsers` dan `activityLogs`.
- `authSessions` tidak ikut dibackup sesuai panduan.
- Version backup dinaikkan ke `2`.
- Restore membersihkan semua session auth setelah proses restore.
- Restore dengan payload `authUsers` akan ditolak jika tidak ada Owner aktif.
- Restore legacy yang belum punya `authUsers` tidak menghapus user auth yang sedang ada, supaya user tidak kehilangan akses.
- Restore menulis activity log `BACKUP_RESTORE` jika user saat restore masih valid setelah data dipulihkan.
- Menambahkan helper `clearAuthSessionState()` di `src/auth/authService.ts` untuk membersihkan session Dexie dan session id lokal.

Catatan:

- Setelah restore berhasil, halaman Settings masih melakukan reload seperti sebelumnya, sehingga user akan kembali ke login/setup sesuai kondisi auth terbaru.
- Backup lama tetap bisa direstore untuk data transaksi/stok/finance, dengan auth lokal saat ini tetap dipertahankan jika file tidak membawa tabel auth.

Tahap berikutnya yang disarankan:

1. Scan action sensitif lain yang sudah ada namun belum masuk activity log: tambah/edit/hapus produk, import CSV produk, finance/profit recalculation, tarik saldo profit.
2. Tambahkan guard/action log bertahap tanpa mengubah behavior utama.

## Tahap 10 - Activity Log Action Stok, Finance, dan Profit

Status: selesai

Tanggal: 2026-05-21

Perubahan:

- Menambahkan guard `STOCK_ACCESS` di mutasi stok pada `src/hooks/useStockManagement.tsx`.
- Menulis activity log untuk tambah produk (`PRODUCT_CREATED`).
- Menulis activity log untuk edit produk (`PRODUCT_UPDATED`).
- Menulis activity log untuk hapus produk (`PRODUCT_DELETED`).
- Menulis activity log ringkas untuk import CSV produk (`PRODUCT_CSV_IMPORTED`) berisi jumlah baris, produk baru, dan produk diperbarui.
- Menambahkan guard `FINANCE_ACCESS` di `src/services/financeService.ts`.
- Menulis activity log untuk transaksi finance manual (`FINANCE_TRANSACTION_CREATED`).
- Menulis activity log untuk recalculate finance (`FINANCE_RECALCULATED`).
- Menambahkan guard `PROFIT_VIEW` di `src/services/profitService.ts`.
- Menulis activity log untuk tarik saldo profit (`PROFIT_WITHDRAWN`).
- Menulis activity log untuk recalculate profit (`PROFIT_RECALCULATED`).

Catatan:

- Perubahan tidak mengubah behavior utama stok/finance/profit; hanya menambah guard dan audit trail di jalur mutasi yang sudah ada.
- Guard finance/profit ditempatkan di service agar tetap aman jika service dipanggil dari luar UI.
- Guard stok masih berada di hook karena mutasi produk saat ini memang masih berada di `useStockManagement`; jika nanti dipindah ke service, guard/log ini perlu ikut dipindahkan.

Tahap berikutnya yang disarankan:

1. Review sisa action sensitif yang belum dicatat, terutama backup export, restore, unit management, dan printer/settings jika dianggap perlu.
2. Pertimbangkan memindahkan mutasi produk dari hook ke service pada tahap terpisah jika ingin guard action lebih rapi, tapi jangan dicampur dengan tahap audit ini.
