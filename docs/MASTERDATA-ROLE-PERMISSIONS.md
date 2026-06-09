# Master Data Role dan Permission Dinamis

Dokumen ini berisi langkah implementasi menu **Manajemen Role** di Master Data.

Tujuan utamanya:

- Admin bisa membuat role dinamis seperti `Penagihan`, `Supervisor Kasir`, atau `Gudang`.
- Developer tetap menentukan daftar fitur/permission yang tersedia lewat permission catalog.
- Owner punya semua akses, tetapi tetap hanya untuk fitur/module yang aktif dari setup awal developer.
- Karyawan tidak perlu diinput dobel sebagai user dan karyawan. Profil orang tetap di `employees`, akun login dibuat/ditautkan dari form karyawan.

## Prinsip Akses

Gunakan model akses dua lapis:

```ts
bolehAkses = moduleAktifDariSetup && permissionRoleMengizinkan
```

Aturan khusus:

- `OWNER` boleh semua permission yang module-nya aktif.
- `OWNER` tidak boleh melihat fitur yang module-nya tidak aktif dari setup awal.
- Role selain Owner hanya boleh permission yang dicentang admin.
- Permission catalog tidak dibuat bebas oleh admin. Catalog tetap didefinisikan developer.
- Guard harus tetap ada di service/action, bukan hanya di UI.

## Kondisi Saat Ini

File penting yang sudah ada:

- `src/types/index.ts`: `UserRole`, `Permission`, `AuthUser`, `Employee`.
- `src/auth/permissions.ts`: role dan permission masih hardcode.
- `src/auth/routePermissions.ts`: mapping route ke permission masih berbasis role hardcode.
- `src/auth/moduleAccess.ts`: route sudah dibatasi setup module.
- `src/constants/setupModules.ts`: daftar module yang bisa aktif dari setup developer.
- `src/services/setupKeyService.ts`: membaca setup config dari localStorage.
- `src/view/auth/UserManagement.tsx`: kelola user saat ini.
- `src/view/master-data/employees/*`: master data karyawan dan relasi ke user.
- `src/lib/db.ts`: schema Dexie.
- `src-tauri/migrations/0006_auth_activity.sql`: schema Postgres `auth_users` dan `activity_logs`.

## Target Struktur Data

### Permission Catalog

Permission catalog adalah constant TypeScript dari developer.

Contoh file baru:

```text
src/auth/permissionCatalog.ts
```

Contoh bentuk data:

```ts
export interface PermissionCatalogItem {
  code: Permission;
  label: string;
  description?: string;
  group: string;
  moduleCodes: string[];
  isSensitive?: boolean;
}
```

Contoh permission:

```ts
{
  code: 'COOPERATIVE_BILLING_ACCESS',
  label: 'Akses Penagihan Koperasi',
  group: 'Koperasi',
  moduleCodes: ['KOPERASI_ANGSURAN'],
}
```

Catatan:

- `moduleCodes` dipakai untuk membatasi permission berdasarkan setup developer.
- Jika salah satu `moduleCodes` aktif, permission boleh dipakai.
- Permission tanpa module spesifik bisa memakai module umum, misalnya `SETTINGS` atau module parent yang relevan.

### Tabel Dexie

Tambahkan tabel:

```ts
roles!: Table<Role>;
rolePermissions!: Table<RolePermission>;
```

Tipe yang disarankan:

```ts
export interface Role {
  id: string;
  name: string;
  code?: string;
  description?: string;
  is_system: boolean;
  is_owner: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_code: Permission;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

Ubah `AuthUser` bertahap:

```ts
export interface AuthUser {
  id: string;
  name: string;
  role: UserRole; // legacy sementara
  role_id?: string;
  role_name?: string;
  employee_id?: string;
  pin_hash: string;
  pin_salt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

Catatan migrasi:

- Jangan langsung hapus `role`.
- Pakai `role` sebagai fallback sampai semua guard sudah membaca `role_id`.
- Setelah stabil, `role` bisa diganti menjadi `legacy_role` atau dihapus pada migrasi besar berikutnya.

### Tabel Postgres

Tambahkan migration baru:

```sql
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_roles_code ON roles (code);
CREATE INDEX IF NOT EXISTS idx_roles_is_active ON roles (is_active);
CREATE INDEX IF NOT EXISTS idx_roles_updated_at ON roles (updated_at);

CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL REFERENCES roles(id),
    permission_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    UNIQUE(role_id, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_code ON role_permissions (permission_code);
CREATE INDEX IF NOT EXISTS idx_role_permissions_updated_at ON role_permissions (updated_at);

ALTER TABLE auth_users
    ADD COLUMN IF NOT EXISTS role_id TEXT,
    ADD COLUMN IF NOT EXISTS role_name TEXT,
    ADD COLUMN IF NOT EXISTS employee_id TEXT;
```

## Langkah Implementasi

### Langkah 1 - Tambah Permission Granular

File:

- `src/types/index.ts`
- `src/auth/permissionCatalog.ts`

Tambahkan permission yang lebih detail. Hindari satu permission besar seperti `FINANCE_ACCESS` untuk semua fitur.

Contoh permission koperasi:

```ts
export type Permission =
  | 'COOPERATIVE_MEMBER_VIEW'
  | 'COOPERATIVE_MEMBER_MANAGE'
  | 'COOPERATIVE_SAVING_VIEW'
  | 'COOPERATIVE_SAVING_MANAGE'
  | 'COOPERATIVE_LOAN_VIEW'
  | 'COOPERATIVE_LOAN_MANAGE'
  | 'COOPERATIVE_INSTALLMENT_VIEW'
  | 'COOPERATIVE_PAYMENT_CREATE'
  | 'COOPERATIVE_BILLING_ACCESS'
  | 'COOPERATIVE_REPORT_VIEW'
  // permission lama tetap ada saat transisi
  | 'FINANCE_ACCESS';
```

Untuk role `Penagihan`, permission awal yang disarankan:

```ts
[
  'COOPERATIVE_MEMBER_VIEW',
  'COOPERATIVE_INSTALLMENT_VIEW',
  'COOPERATIVE_PAYMENT_CREATE',
  'COOPERATIVE_BILLING_ACCESS',
]
```

### Langkah 2 - Buat Helper Module Aktif untuk Permission

File:

- `src/auth/permissionCatalog.ts`
- `src/auth/moduleAccess.ts`

Tambahkan helper:

```ts
export const isPermissionEnabledBySetup = (permission: Permission) => {
  const catalogItem = PERMISSION_CATALOG.find((item) => item.code === permission);
  if (!catalogItem) return false;

  const config = getSetupConfig();
  if (!config) return true;

  return catalogItem.moduleCodes.some((moduleCode) => {
    return config.enabledModules.includes(moduleCode);
  });
};
```

Catatan:

- Jika belum ada setup config, tetap `true` untuk kompatibilitas data lama.
- Permission yang module-nya nonaktif tidak boleh muncul di UI manajemen role.

### Langkah 3 - Tambah Schema Dexie

File:

- `src/lib/db.ts`
- `src/types/index.ts`

Tambahkan version Dexie baru, misalnya setelah version terakhir:

```ts
this.version(43).stores({
  roles: 'id, name, code, is_system, is_owner, is_active, sync_status, updated_at, created_at',
  rolePermissions: 'id, role_id, permission_code, sync_status, updated_at, created_at',
  authUsers: 'id, name, role, role_id, employee_id, is_active, sync_status, created_at'
}).upgrade(async (tx) => {
  // Seed role system dari role hardcode lama.
});
```

Seed role system:

- Owner
- Admin
- Kasir
- Gudang

Mapping awal bisa memakai `ROLE_PERMISSIONS` lama supaya akses existing user tidak berubah.

### Langkah 4 - Seed Role Lama ke Role Baru

Buat helper:

```text
src/auth/roleSeed.ts
```

Isi tugas helper:

- Buat role system `OWNER`, `ADMIN`, `KASIR`, `GUDANG` jika belum ada.
- Buat `rolePermissions` dari matrix lama.
- Update `authUsers.role_id` dan `authUsers.role_name` berdasarkan field `role` lama.

Aturan:

- `OWNER` punya `is_owner: true`.
- Role system tidak bisa dihapus.
- Role system boleh dibatasi edit namanya, tapi permission Admin/Kasir/Gudang boleh dipertimbangkan editable jika kebutuhan bisnis mengarah ke sana.

### Langkah 5 - Ubah Permission Resolver

File:

- `src/auth/permissions.ts`
- `src/auth/authService.ts`
- `src/auth/AuthProvider.tsx`
- `src/auth/routePermissions.ts`

Target helper baru:

```ts
export const hasUserPermission = async (
  user: AuthUser | null | undefined,
  permission: Permission,
) => {
  if (!user) return false;
  if (!isPermissionEnabledBySetup(permission)) return false;

  const role = user.role_id ? await db.roles.get(user.role_id) : undefined;
  if (role?.is_owner || user.role === 'OWNER') return true;

  if (user.role_id) {
    const rolePermission = await db.rolePermissions
      .where('[role_id+permission_code]')
      .equals([user.role_id, permission])
      .first();

    return Boolean(rolePermission);
  }

  return hasPermission(user.role, permission);
};
```

Karena `hasUserPermission` async, siapkan dua versi:

- `hasUserPermission`: async untuk service/action.
- `usePermissionSet`: hook/context untuk UI, preload permission current user agar `can(permission)` tetap sync di React.

### Langkah 6 - Update Auth Context

File:

- `src/auth/AuthContext.ts`
- `src/auth/AuthProvider.tsx`
- `src/auth/useAuth.ts`

Tambahkan state:

```ts
permissionSet: Set<Permission>;
isPermissionLoading: boolean;
```

Ubah `can(permission)`:

```ts
const can = useCallback((permission: Permission) => {
  if (!currentUser) return false;
  if (!isPermissionEnabledBySetup(permission)) return false;
  if (currentUser.role === 'OWNER' || currentRole?.is_owner) return true;
  return permissionSet.has(permission);
}, [currentUser, currentRole, permissionSet]);
```

Catatan:

- UI butuh permission sync agar render menu/tombol tidak harus async.
- Service tetap harus cek ulang dengan resolver async.

### Langkah 7 - Buat Role Service

File baru:

```text
src/services/roleService.ts
```

API minimal:

```ts
export const createRole(input): Promise<Role>
export const updateRole(input): Promise<Role>
export const setRoleActive(roleId, isActive): Promise<Role>
export const updateRolePermissions(roleId, permissions): Promise<void>
export const getRoleWithPermissions(roleId): Promise<RoleWithPermissions>
```

Guard:

- Semua mutasi role butuh `USER_MANAGE`.
- Role `is_owner` tidak boleh dibuat dari UI admin biasa.
- Role system tidak boleh dihapus.
- Role yang sedang dipakai user aktif tidak boleh dinonaktifkan kecuali ada kebijakan pengganti.
- Permission yang disimpan harus ada di `PERMISSION_CATALOG`.
- Permission yang module-nya nonaktif dari setup tidak boleh disimpan.

Activity log:

- `ROLE_CREATED`
- `ROLE_UPDATED`
- `ROLE_PERMISSION_UPDATED`
- `ROLE_ENABLED`
- `ROLE_DISABLED`

### Langkah 8 - Buat Menu Master Data

File:

- `src/routes/master-data/index.tsx`
- `src/routes/master-data/roles.lazy.tsx`
- `src/auth/routePermissions.ts`
- `src/auth/moduleAccess.ts`

Route:

```text
/master-data/roles
```

Permission route:

```ts
'/master-data/roles': 'USER_MANAGE'
```

Module access:

- Jika belum ada module khusus, buat module setup baru `ROLE_PERMISSION`.
- Tambahkan ke `SETUP_MODULE_GROUPS` group `master-data`.
- Jika tidak ingin module baru, gunakan module `SETTINGS`, tetapi lebih rapi punya module `ROLE_PERMISSION`.

### Langkah 9 - Buat UI Manajemen Role

File baru:

```text
src/view/master-data/roles/RoleManagement.tsx
src/view/master-data/roles/RoleTable.tsx
src/view/master-data/roles/RoleFormModal.tsx
src/view/master-data/roles/RolePermissionMatrix.tsx
```

UI yang disarankan:

- Tabel role: nama, deskripsi, tipe system/custom, status, jumlah permission, aksi.
- Modal tambah/edit role.
- Permission matrix dikelompokkan berdasarkan `group` dari catalog.
- Checkbox permission hanya menampilkan permission yang module-nya aktif.
- Permission sensitif diberi label/tag, misalnya `Sensitive`.
- Tombol simpan permission terpisah atau satu modal dengan role detail.

Validasi UI:

- Nama role wajib.
- Nama role unik untuk role aktif.
- Role Owner system tidak bisa diubah permission-nya dari UI.
- Jika permission tidak tersedia karena setup module nonaktif, tampilkan sebagai hidden atau disabled dengan alasan singkat.

### Langkah 10 - Update User Management

File:

- `src/view/auth/UserManagement.tsx`
- `src/auth/authService.ts`

Ubah form user:

- Dari select `role: UserRole`
- Menjadi select `role_id`

Fallback sementara:

- Saat user lama belum punya `role_id`, tampilkan role lama.
- Saat disimpan, isi `role_id` dan `role_name`.

Pastikan:

- Owner terakhir tetap tidak bisa didemote/dinonaktifkan.
- Jika role dinonaktifkan, user dengan role itu tidak bisa login atau harus diminta pilih role pengganti.

### Langkah 11 - Integrasi dengan Karyawan agar Tidak Dobel Input

File:

- `src/view/master-data/employees/EmployeeFormModal.tsx`
- `src/services/employeeService.ts`
- `src/hooks/useEmployees.tsx`
- `src/auth/authService.ts`

Tambahkan flow di form karyawan:

- Toggle `Beri akses login`.
- Jika ON, tampilkan:
  - Role
  - PIN
  - Konfirmasi PIN
- Saat create karyawan:
  - Buat `employees`.
  - Buat `authUsers` otomatis dengan `employee_id`.
  - Set `employees.user_id` ke user yang baru dibuat.
- Saat edit karyawan:
  - Bisa tautkan user lama.
  - Bisa buat akses login jika belum ada.
  - Nama user bisa ikut nama karyawan, atau admin diberi toggle `Samakan nama login dengan nama karyawan`.

Aturan relasi:

- Satu karyawan aktif hanya boleh punya satu user aktif.
- Satu user aktif hanya boleh tertaut ke satu karyawan aktif.
- Karyawan tanpa akses aplikasi tetap boleh ada tanpa `user_id`.

### Langkah 12 - Update Route Guard Granular

File:

- `src/auth/routePermissions.ts`
- `src/auth/moduleAccess.ts`

Ubah route koperasi dari `FINANCE_ACCESS` menjadi permission granular.

Contoh:

```ts
'/koperasi/anggota': 'COOPERATIVE_MEMBER_VIEW',
'/koperasi/simpanan': 'COOPERATIVE_SAVING_VIEW',
'/koperasi/pinjaman': 'COOPERATIVE_LOAN_VIEW',
'/koperasi/angsuran': 'COOPERATIVE_INSTALLMENT_VIEW',
'/koperasi/penagihan': 'COOPERATIVE_BILLING_ACCESS',
'/koperasi/laporan': 'COOPERATIVE_REPORT_VIEW',
```

Untuk route parent `/koperasi`, gunakan array permission:

```ts
'/koperasi': [
  'COOPERATIVE_MEMBER_VIEW',
  'COOPERATIVE_SAVING_VIEW',
  'COOPERATIVE_LOAN_VIEW',
  'COOPERATIVE_INSTALLMENT_VIEW',
  'COOPERATIVE_BILLING_ACCESS',
  'COOPERATIVE_REPORT_VIEW',
]
```

### Langkah 13 - Update Guard Service

Cari semua service yang masih memakai:

```ts
requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
```

Ubah menjadi permission granular sesuai aksi.

Contoh:

- `createCooperativeLoan`: `COOPERATIVE_LOAN_MANAGE`
- `approveCooperativeLoan`: `COOPERATIVE_LOAN_MANAGE`
- `recordCooperativeLoanPayment`: `COOPERATIVE_PAYMENT_CREATE`
- `createCooperativeSavingTransaction`: `COOPERATIVE_SAVING_MANAGE`
- read-only report koperasi: `COOPERATIVE_REPORT_VIEW`

Catatan:

- Route guard hanya mengatur halaman.
- Service guard tetap wajib karena fungsi bisa dipanggil dari UI lain atau test.

### Langkah 14 - Batasi Data Berdasarkan Area Karyawan

File yang sudah relevan:

- `src/hooks/useCooperativeAreaScope.ts`
- `src/services/employeeService.ts`
- `src/hooks/useEmployees.tsx`

Target:

- Role menentukan fitur.
- Area karyawan menentukan data.

Contoh untuk role `Penagihan`:

- Punya akses `/koperasi/penagihan`.
- Hanya melihat tagihan anggota pada area yang ditugaskan ke employee login.

Jika perlu, tambahkan helper:

```ts
getCurrentEmployeeScope(userId): Promise<{
  employeeId?: string;
  areaIds: string[];
  canSeeAllAreas: boolean;
}>
```

Permission tambahan jika dibutuhkan:

```ts
'COOPERATIVE_AREA_ALL'
```

### Langkah 15 - Tambah Sync Queue dan Postgres Adapter

File:

- `src/services/syncQueueService.ts`
- `src/services/postgresAdapter.ts`
- `src-tauri/src/models/auth.rs`
- `src-tauri/src/repositories/auth_repository.rs`
- `src-tauri/src/commands/auth_commands.rs`

Tambahkan entity sync:

- `roles`
- `rolePermissions`

Buat DTO Rust:

```rust
RoleDto
RolePermissionDto
```

Tambahkan command:

- `postgres_list_roles`
- `postgres_upsert_role`
- `postgres_list_role_permissions`
- `postgres_upsert_role_permission`

Catatan:

- Role dan role permission termasuk master data akses, jadi harus ikut sync jika app multi-device.
- Conflict resolution bisa memakai `updated_at` seperti `auth_users`.

### Langkah 16 - Migration Data Existing

Urutan migrasi data:

1. Buat role system dari role lama.
2. Buat role permission dari `ROLE_PERMISSIONS` lama.
3. Isi `authUsers.role_id` berdasarkan `authUsers.role`.
4. Isi `authUsers.role_name`.
5. Jika ada `employees.user_id`, isi balik `authUsers.employee_id`.
6. Jangan hapus field lama sampai minimal satu release stabil.

Checklist data lama:

- Owner existing tetap bisa login.
- Admin/Kasir/Gudang existing tetap punya akses sama seperti sebelum refactor.
- Activity log lama tetap terbaca walaupun `role` masih string lama.

### Langkah 17 - Testing

Minimal test manual:

- Owner bisa membuka Manajemen Role jika module setup terkait aktif.
- Owner tidak melihat fitur yang module-nya nonaktif dari setup.
- Admin dengan `USER_MANAGE` bisa membuat role custom.
- Role `Penagihan` hanya bisa membuka menu penagihan dan aksi bayar yang diizinkan.
- Role `Penagihan` tidak bisa membuka finance umum jika tidak punya permission finance.
- Permission yang module-nya nonaktif tidak muncul di matrix role.
- User lama tanpa `role_id` tetap bisa login dengan fallback role lama.
- Karyawan dengan toggle akses login otomatis punya user tertaut.
- Satu user tidak bisa tertaut ke dua karyawan aktif.
- Service tetap menolak action jika permission tidak ada walaupun tombol dipanggil manual.

Minimal test teknis:

- `npm run lint`
- `npm run build`
- Test Dexie migration dari database lama.
- Test sync role dan role permission jika Postgres aktif.

## Rollout Bertahap yang Disarankan

### Fase 1 - Aman Tanpa UI Baru

- Tambah permission catalog.
- Tambah helper `isPermissionEnabledBySetup`.
- Tambah permission granular koperasi.
- Ubah route `/koperasi/penagihan` ke permission granular.

### Fase 2 - Data Role Dinamis

- Tambah tabel `roles` dan `rolePermissions`.
- Seed role lama.
- Ubah auth resolver agar membaca `role_id` dengan fallback role lama.

### Fase 3 - UI Manajemen Role

- Tambah menu Master Data Role.
- Buat tabel role dan permission matrix.
- Tambah audit log untuk perubahan role.

### Fase 4 - Karyawan sebagai Pusat Input

- Tambah toggle akses login di form karyawan.
- Buat user otomatis dari karyawan.
- Update User Management menjadi pengelolaan akun, bukan input identitas orang utama.

### Fase 5 - Sync dan Cleanup

- Tambah sync Postgres untuk role.
- Update DTO Rust dan repository.
- Setelah stabil, rencanakan cleanup field legacy `authUsers.role`.

## Catatan Keputusan

- Role dinamis disimpan di DB.
- Permission tetap dari developer.
- Owner bypass role permission, tetapi tidak bypass setup module.
- `employees` adalah profil orang.
- `auth_users` adalah akun login.
- Master Data Role berada di `/master-data/roles`.
- Role `Penagihan` sebaiknya memakai permission koperasi granular, bukan `FINANCE_ACCESS`.
