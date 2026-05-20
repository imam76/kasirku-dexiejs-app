# Panduan Implementasi User & Hak Akses

Dokumen ini adalah panduan step-by-step untuk junior developer yang akan menambahkan fitur user, role, dan permission di Kasirku.

Target fitur:

- Role: `Owner`, `Admin`, `Kasir`, `Gudang`
- Permission:
  - Boleh refund / void transaksi
  - Boleh edit harga saat transaksi
  - Boleh lihat profit
  - Boleh hapus transaksi

Catatan bisnis penting: di project ini, "hapus transaksi" sebaiknya tetap dimaknai sebagai `void` atau pembatalan transaksi, bukan hard delete. Transaksi yang dibatalkan harus tetap ada sebagai audit trail.

## Gambaran Kondisi Saat Ini

Project saat ini belum punya auth, user, role, permission, atau session.

Titik penting yang sudah ada:

- Database Dexie: `src/lib/db.ts`
- Tipe utama: `src/types/index.ts`
- Layout dan menu utama: `src/routes/__root.tsx`
- Halaman dashboard: `src/routes/index.tsx`
- Halaman kasir: `src/view/Transaction.tsx`
- State cart/transaksi: `src/store/transactionStore.ts`
- Checkout transaksi: `src/services/checkoutService.ts`
- Riwayat dan void transaksi: `src/view/History.tsx`, `src/hooks/useHistory.tsx`, `src/services/transactionVoidService.ts`
- Laporan profit/sales/detail: `src/view/ProfitManagement.tsx`, `src/view/SalesReport.tsx`, `src/view/TransactionDetailReport.tsx`, `src/hooks/useReports.tsx`
- Backup/restore: `src/utils/backupRestore.ts`

## Permission Matrix Awal

Gunakan matrix ini sebagai versi pertama. Jangan buat terlalu fleksibel dulu.

| Permission | Owner | Admin | Kasir | Gudang |
| --- | --- | --- | --- | --- |
| Refund / void transaksi | Ya | Ya | Tidak | Tidak |
| Edit harga saat transaksi | Ya | Ya | Tidak | Tidak |
| Lihat profit | Ya | Ya | Tidak | Tidak |
| Hapus transaksi | Ya | Ya | Tidak | Tidak |

Rekomendasi tambahan:

| Area | Owner | Admin | Kasir | Gudang |
| --- | --- | --- | --- | --- |
| Akses kasir | Ya | Ya | Ya | Tidak |
| Akses stok | Ya | Ya | Tidak | Ya |
| Akses belanja stok | Ya | Ya | Tidak | Ya |
| Akses finance | Ya | Ya | Tidak | Tidak |
| Akses settings | Ya | Ya | Tidak | Tidak |
| Kelola user | Ya | Tidak | Tidak | Tidak |

## Prinsip Implementasi

1. Mulai dari sistem lokal/offline-first.
2. Simpan user dan session di Dexie.
3. Gunakan permission matrix berbasis constant TypeScript dulu.
4. Jangan buat tabel role-permission dulu kecuali benar-benar dibutuhkan.
5. Permission harus dicek di dua tempat:
   - UI: menu, tombol, kolom sensitif
   - Action/service: sebelum mutasi data dilakukan
6. Jangan hanya menyembunyikan tombol. Action tetap harus punya guard.
7. Semua action sensitif harus masuk activity log.

## Struktur File Yang Disarankan

Buat folder baru:

```text
src/auth/
  permissions.ts
  authService.ts
  AuthProvider.tsx
  RequirePermission.tsx
```

Penjelasan:

- `permissions.ts`: role, permission, dan matrix akses.
- `authService.ts`: operasi Dexie untuk user, session, PIN, activity log.
- `AuthProvider.tsx`: context untuk current user, login, logout, dan helper permission.
- `RequirePermission.tsx`: komponen kecil untuk guard UI.

## Step 1 - Tambah Tipe Auth

Edit `src/types/index.ts`.

Tambahkan tipe:

```ts
export type UserRole = 'OWNER' | 'ADMIN' | 'KASIR' | 'GUDANG';

export type Permission =
  | 'TRANSACTION_VOID'
  | 'TRANSACTION_DELETE'
  | 'TRANSACTION_EDIT_PRICE'
  | 'PROFIT_VIEW'
  | 'CASHIER_ACCESS'
  | 'STOCK_ACCESS'
  | 'FINANCE_ACCESS'
  | 'SETTINGS_ACCESS'
  | 'USER_MANAGE';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  pin_hash: string;
  pin_salt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthSession {
  id: string;
  user_id: string;
  created_at: string;
  last_active_at: string;
}

export interface ActivityLog {
  id: string;
  user_id?: string;
  user_name?: string;
  role?: UserRole;
  action: string;
  entity: string;
  entity_id?: string;
  description: string;
  created_at: string;
}
```

Catatan:

- Gunakan PIN lokal, bukan password kompleks.
- Jangan simpan PIN mentah.
- Gunakan Web Crypto untuk hash PIN.

## Step 2 - Tambah Tabel Dexie

Edit `src/lib/db.ts`.

Tambahkan import tipe:

```ts
AuthUser,
AuthSession,
ActivityLog,
```

Tambahkan table di class:

```ts
authUsers!: Table<AuthUser>;
authSessions!: Table<AuthSession>;
activityLogs!: Table<ActivityLog>;
```

Tambahkan version baru:

```ts
this.version(11).stores({
  authUsers: 'id, role, is_active, created_at',
  authSessions: 'id, user_id, last_active_at',
  activityLogs: 'id, user_id, action, entity, created_at',
});
```

Jangan ubah version lama kecuali memang perlu. Tambahkan version baru saja.

## Step 3 - Buat Permission Matrix

Buat `src/auth/permissions.ts`.

Isi awal:

```ts
import type { Permission, UserRole } from '@/types';

export const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  KASIR: 'Kasir',
  GUDANG: 'Gudang',
};

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  OWNER: [
    'TRANSACTION_VOID',
    'TRANSACTION_DELETE',
    'TRANSACTION_EDIT_PRICE',
    'PROFIT_VIEW',
    'CASHIER_ACCESS',
    'STOCK_ACCESS',
    'FINANCE_ACCESS',
    'SETTINGS_ACCESS',
    'USER_MANAGE',
  ],
  ADMIN: [
    'TRANSACTION_VOID',
    'TRANSACTION_DELETE',
    'TRANSACTION_EDIT_PRICE',
    'PROFIT_VIEW',
    'CASHIER_ACCESS',
    'STOCK_ACCESS',
    'FINANCE_ACCESS',
    'SETTINGS_ACCESS',
  ],
  KASIR: [
    'CASHIER_ACCESS',
  ],
  GUDANG: [
    'STOCK_ACCESS',
  ],
};

export const hasPermission = (role: UserRole | undefined, permission: Permission) => {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};
```

## Step 4 - Buat Auth Service

Buat `src/auth/authService.ts`.

Minimal tanggung jawab file ini:

- Membuat default Owner saat app pertama kali setup.
- Hash PIN.
- Login dengan PIN.
- Logout.
- Membaca session aktif.
- Menulis activity log.

Fungsi yang disarankan:

```ts
createPinHash(pin: string): Promise<{ hash: string; salt: string }>
verifyPin(pin: string, hash: string, salt: string): Promise<boolean>
ensureDefaultOwner(): Promise<void>
loginWithPin(pin: string): Promise<AuthUser>
logout(): Promise<void>
getCurrentSessionUser(): Promise<AuthUser | null>
writeActivityLog(input): Promise<void>
```

Untuk fase awal, boleh pakai satu Owner default yang dibuat saat user pertama kali membuka halaman setup.

Jangan hardcode PIN default seperti `123456` tanpa user menggantinya.

## Step 5 - Buat Auth Provider

Buat `src/auth/AuthProvider.tsx`.

Provider harus menyediakan:

```ts
currentUser
isLoading
login
logout
can(permission)
requirePermission(permission)
```

`can(permission)` dipakai untuk UI.

`requirePermission(permission)` dipakai sebelum action sensitif. Jika tidak boleh, throw error atau tampilkan message.

Contoh pemakaian:

```ts
const { can, requirePermission } = useAuth();

if (can('PROFIT_VIEW')) {
  // tampilkan kolom profit
}

requirePermission('TRANSACTION_VOID');
await voidTransaction(...);
```

## Step 6 - Pasang Provider Di Root App

Edit `src/main.tsx`.

Struktur akhir kira-kira:

```tsx
<QueryProvider>
  <I18nProvider>
    <ThemeProvider defaultMode="light">
      <AuthProvider>
        <RouterProvider router={router} scrollRestoration={true} />
      </AuthProvider>
    </ThemeProvider>
  </I18nProvider>
</QueryProvider>
```

Pastikan provider tidak memecah theme, i18n, atau router.

## Step 7 - Buat Login / Lock Screen

Buat screen sederhana, misalnya:

```text
src/view/auth/Login.tsx
```

Fitur minimal:

- Pilih user aktif atau input PIN.
- Login via PIN.
- Jika belum ada user, arahkan ke setup Owner.

Buat juga setup Owner:

```text
src/view/auth/SetupOwner.tsx
```

Fitur minimal:

- Nama Owner.
- PIN.
- Konfirmasi PIN.
- Simpan user Owner aktif.

## Step 8 - Guard Route Dan Menu

Edit `src/routes/__root.tsx`.

Filter menu berdasarkan permission.

Contoh mapping:

```ts
{ to: '/transaction', permission: 'CASHIER_ACCESS' }
{ to: '/stock', permission: 'STOCK_ACCESS' }
{ to: '/finance', permission: 'FINANCE_ACCESS' }
{ to: '/profit', permission: 'PROFIT_VIEW' }
{ to: '/settings', permission: 'SETTINGS_ACCESS' }
```

Kalau menu group report punya child yang tidak boleh diakses, child harus disembunyikan.

Jangan hanya filter menu. Halaman juga harus punya guard jika dibuka langsung lewat URL.

## Step 9 - Guard Refund / Void Transaksi

File yang disentuh:

- `src/view/History.tsx`
- `src/hooks/useHistory.tsx`
- `src/services/transactionVoidService.ts`

UI:

- Tombol void hanya tampil jika user punya `TRANSACTION_VOID`.

Action:

- Sebelum memanggil void, panggil `requirePermission('TRANSACTION_VOID')`.
- Setelah berhasil, tulis activity log.

Contoh activity log:

```text
Owner membatalkan transaksi TRX-xxx. Alasan: salah input.
```

## Step 10 - Guard Hapus Transaksi

Untuk fase awal, jangan buat hard delete.

Mapping:

- `TRANSACTION_DELETE` = boleh melakukan void/cancel transaksi.
- Jika nanti benar-benar perlu hard delete, wajib ada konfirmasi terpisah dan activity log yang jelas.

Rekomendasi wording UI:

- Gunakan "Batalkan Transaksi"
- Hindari "Hapus Permanen"

## Step 11 - Implement Edit Harga Saat Transaksi

File yang disentuh:

- `src/types/index.ts`
- `src/store/transactionStore.ts`
- `src/components/CartItem.tsx`
- `src/services/checkoutService.ts`
- `src/utils/pricing.ts` jika perlu helper tambahan

Tambahkan field di `CartItem`:

```ts
custom_price?: number;
original_price?: number;
price_edited_by?: string;
price_edited_at?: string;
```

Saat user punya `TRANSACTION_EDIT_PRICE`:

- Tampilkan input harga di `CartItem`.
- Simpan custom price ke cart state.
- Total cart pakai custom price jika ada.
- Checkout snapshot menyimpan harga final.

Tambahkan field opsional di `TransactionItem`:

```ts
original_price?: number;
is_price_edited?: boolean;
price_edited_by?: string;
```

Ini penting supaya laporan dan audit bisa tahu harga diubah manual.

Activity log:

```text
Admin mengubah harga item Kopi dari Rp 10.000 menjadi Rp 9.000 di transaksi berjalan.
```

## Step 12 - Hide Profit Untuk Role Yang Tidak Boleh

File yang perlu dicek:

- `src/view/History.tsx`
- `src/view/ProfitManagement.tsx`
- `src/view/SalesReport.tsx`
- `src/view/TransactionDetailReport.tsx`
- `src/hooks/useReports.tsx`
- `src/view/sales-report/DesktopSalesTable.tsx`
- `src/view/sales-report/MobileSalesList.tsx`
- Export CSV/PDF di report terkait

Yang harus disembunyikan jika tidak punya `PROFIT_VIEW`:

- Menu `/profit`
- Halaman profit
- Kolom profit di History
- HPP
- Margin
- Total profit
- Export profit/HPP/margin

Jangan hanya sembunyikan teks di UI utama. Export CSV/PDF juga harus aman.

## Step 13 - Buat User Management

Tambahkan menu di Settings atau halaman baru:

```text
/users
```

Hanya `Owner` yang boleh akses `USER_MANAGE`.

Fitur minimal:

- Tambah user
- Edit role
- Reset PIN
- Nonaktifkan user

Jangan hapus user fisik jika user sudah punya activity log. Gunakan `is_active = false`.

## Step 14 - Activity Log

Buat halaman:

```text
/activity-log
```

Hanya Owner/Admin yang boleh lihat.

Log minimal:

- Login
- Logout
- Void transaksi
- Edit harga
- Tambah/edit/hapus produk
- Import CSV produk
- Backup database
- Restore database
- Tarik saldo profit
- Recalculate finance/profit

Activity log tidak perlu terlalu kompleks. Yang penting bisa menjawab:

- Siapa?
- Melakukan apa?
- Ke data apa?
- Kapan?
- Keterangan apa?

## Step 15 - Backup / Restore

Edit `src/utils/backupRestore.ts`.

Backup harus menyertakan tabel auth:

- `authUsers`
- `activityLogs`

Session tidak wajib ikut backup.

Restore harus hati-hati:

- Setelah restore, logout semua session.
- Jika restore membawa user lama, pastikan minimal ada satu Owner aktif.
- Tulis activity log restore jika masih ada current user.

## Checklist Validasi Manual

Role Owner:

- Bisa buka semua menu.
- Bisa void transaksi.
- Bisa lihat profit.
- Bisa edit harga.
- Bisa kelola user.

Role Admin:

- Bisa void transaksi.
- Bisa lihat profit.
- Bisa edit harga.
- Tidak bisa kelola user jika mengikuti matrix awal.

Role Kasir:

- Bisa buka kasir.
- Tidak bisa lihat profit.
- Tidak bisa void transaksi.
- Tidak bisa edit harga.
- Tidak bisa buka stok/finance/settings jika tidak diberi akses.

Role Gudang:

- Bisa buka stok.
- Bisa tambah/edit stok sesuai permission yang nanti disepakati.
- Tidak bisa buka kasir jika mengikuti matrix awal.
- Tidak bisa lihat profit.
- Tidak bisa void transaksi.

Report/export:

- User tanpa `PROFIT_VIEW` tidak boleh melihat profit/HPP/margin di layar.
- User tanpa `PROFIT_VIEW` tidak boleh mendapat profit/HPP/margin dari CSV/PDF.

Security local:

- PIN tidak tersimpan mentah.
- Session bisa logout.
- User inactive tidak bisa login.
- Jika tidak ada Owner aktif, app minta setup Owner.

## Urutan PR / Commit Yang Disarankan

1. Tambah tipe, Dexie table, permission matrix.
2. Tambah auth service dan provider.
3. Tambah setup Owner dan login PIN.
4. Filter menu dan guard route.
5. Guard void transaksi.
6. Hide profit di UI dan export.
7. Tambah edit harga dengan audit snapshot.
8. Tambah user management.
9. Tambah activity log page.
10. Update backup/restore.

Jangan gabungkan semua dalam satu perubahan besar. Lebih aman dibuat bertahap supaya mudah review dan rollback.

## Risiko Yang Harus Diperhatikan

- Kalau hanya filter menu tanpa guard action, user masih bisa menjalankan action dari kode/URL.
- Kalau profit hanya disembunyikan di halaman `/profit`, profit masih bocor lewat History dan export report.
- Kalau edit harga tidak disimpan sebagai snapshot, audit transaksi jadi tidak jelas.
- Kalau hard delete transaksi dipakai, laporan dan audit bisa rusak.
- Kalau backup/restore tidak ikut auth data, user bisa kehilangan akses setelah restore.

## Definisi Selesai

Fitur dianggap selesai jika:

- Semua role bisa login.
- Menu mengikuti permission.
- Route sensitif tidak bisa dibuka manual oleh role yang tidak berhak.
- Void transaksi hanya bisa dilakukan role yang berhak.
- Edit harga hanya bisa dilakukan role yang berhak.
- Profit/HPP/margin tidak bocor ke role yang tidak berhak, termasuk export.
- Activity log mencatat action sensitif.
- Backup/restore tetap aman.
- Typecheck dan build berhasil.
