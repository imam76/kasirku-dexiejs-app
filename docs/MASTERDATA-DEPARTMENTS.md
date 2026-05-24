# Master Data Departments - Langkah Pengerjaan Sesuai Struktur Project

Dokumen ini adalah panduan pengerjaan Master Data Departments untuk project Kasirku. Targetnya: department bisa menjadi dimensi internal/cost center untuk sales document, finance, dan report berikutnya, tanpa mengubah flow POS existing dan tanpa mencampurnya dengan contact, project, user login, atau warehouse.

## Ringkasan Keputusan

Fase awal dibuat kecil dan aman:
- Department adalah master data internal toko/usaha, misalnya `Retail`, `Grosir`, `Online`, `Operasional`, atau `Cabang A`.
- Department bukan contact/customer/supplier.
- Department bukan project. Project adalah pekerjaan atau kontrak spesifik yang bisa punya tanggal mulai/selesai dan status sendiri.
- Department tidak disambungkan ke `AuthUser` dulu. User internal toko tetap dikelola lewat auth/user management.
- Department dibuat flat list dulu. Jangan buat parent-child organisasi di fase awal.
- Hapus department sebaiknya berupa nonaktif/arsip (`is_active=false`), bukan hard delete, karena nanti bisa dipakai oleh dokumen sales/finance/report.
- Sales document atau finance transaction nanti boleh menyimpan `department_id`, tetapi tetap simpan snapshot nama/kode department agar histori dokumen tidak berubah saat master department diedit.

## Struktur File Yang Disarankan

Tambahkan file baru di bawah struktur project yang sudah ada.

```txt
src/routes/master-data/
  departments.lazy.tsx

src/view/master-data/departments/
  DepartmentManagement.tsx
  DepartmentFormModal.tsx
  DepartmentTable.tsx

src/hooks/
  useDepartments.tsx

src/services/
  departmentService.ts

src/lib/validations/
  department.ts

src/utils/
  departmentsCsv.ts
```

Update file existing:
- `src/types/index.ts`: tambah tipe `Department`.
- `src/lib/db.ts`: tambah table Dexie `departments`.
- `src/routes/master-data/index.tsx`: tambah kartu Department di landing Master Data.
- `src/routes/__root.tsx`: tambah menu sidebar Department di group Master Data.
- `src/auth/routePermissions.ts`: tambah permission route `/master-data/departments`.
- `src/i18n/messages.ts`: tambah label nav, form, table, empty state, filter, dan pesan sukses/error.
- `src/utils/backupRestore.ts`: export/import table `departments`.
- `src/routeTree.gen.ts`: jangan edit manual; biarkan generator/build TanStack Router yang update.

## Data Model

Tambahkan tipe di `src/types/index.ts`.

```ts
export interface Department {
  id: string;
  name: string;
  code?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

Catatan model:
- `name` wajib dan menjadi label utama di picker, table, dan report.
- `code` optional, dipakai untuk kode pendek seperti `RTL`, `GRO`, `OPS`, atau kode cabang.
- `description` optional untuk catatan internal.
- Jangan tambah `contact_id`, `project_id`, atau `warehouse_id` ke department pada fase ini.
- Jangan tambah `parent_department_id` dulu. Jika nanti butuh struktur organisasi bertingkat, kerjakan sebagai fase terpisah.
- Jangan buat department sebagai role permission. Role tetap memakai `OWNER`, `ADMIN`, `KASIR`, dan `GUDANG`.

## DB Schema Dexie

Saat dokumen ini dibuat, `src/lib/db.ts` masih memakai Dexie version setelah fitur terakhir yang sudah masuk. Gunakan versi berikutnya dari schema yang sedang ada.

Jika contact belum diimplementasikan dan DB masih di `version(12)`, department bisa memakai `version(13)`.

Jika contact sudah memakai `version(13)`, department harus memakai `version(14)`.

Tambahkan table property:

```ts
departments!: Table<Department>;
```

Tambahkan schema versi baru:

```ts
this.version(14).stores({
  departments: 'id, name, code, is_active, created_at'
});
```

Nomor `14` hanya contoh jika contact sudah memakai `13`. Sesuaikan dengan versi Dexie terbaru saat implementasi. Jangan menambahkan table baru ke `version(1)`.

## Permission

Untuk fase awal, jangan tambah permission baru dulu.

Rekomendasi route:

```ts
'/master-data/departments': 'SETTINGS_ACCESS'
```

Alasannya:
- Owner/Admin sudah punya `SETTINGS_ACCESS`.
- Department adalah konfigurasi struktur internal, bukan pekerjaan harian kasir.
- Gudang tidak perlu mengelola department untuk stok.
- Finance/sales document nanti bisa membaca department sebagai pilihan, tetapi CRUD master department tetap dibatasi ke Owner/Admin.

Jika nanti ada role yang khusus mengelola finance/reporting dan perlu mengelola department, baru pertimbangkan permission baru seperti `DEPARTMENT_MANAGE`. Jangan lakukan itu di fase awal.

## Service Layer

Buat `src/services/departmentService.ts`. Semua mutasi Dexie dan activity log department masuk ke service layer, bukan langsung di komponen.

Kontrak minimal:

```ts
export interface DepartmentUpsertInput {
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}

export const createDepartment = async (input: DepartmentUpsertInput) => {};
export const updateDepartment = async (id: string, input: DepartmentUpsertInput) => {};
export const archiveDepartment = async (id: string) => {};
export const restoreDepartment = async (id: string) => {};
```

Aturan service:
- Ambil current user dengan `getCurrentSessionUser()`.
- Guard mutasi memakai `requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS')`.
- Normalisasi string sebelum disimpan: `trim()` untuk `name`, `code`, dan `description`.
- Simpan `code` dalam uppercase jika ingin konsisten, misalnya `ops` menjadi `OPS`.
- `createDepartment` harus set `id`, `created_at`, `updated_at`, dan default `is_active=true`.
- `updateDepartment` hanya update field department dan `updated_at`.
- `archiveDepartment` set `is_active=false`, bukan `db.departments.delete(id)`.
- `restoreDepartment` set `is_active=true`.
- Tulis `activityLogs` untuk create/update/archive/restore seperti pola produk, finance, dan auth.

## Hook

Buat `src/hooks/useDepartments.tsx` sebagai orchestration React Query.

Tanggung jawab hook:
- Query `departments` dari Dexie, urutkan berdasarkan `name` atau `created_at`.
- State editing id dan filter UI.
- Mutation create/update/archive/restore memanggil `departmentService`.
- Invalidate query `['departments']` setelah sukses.
- Menyediakan helper `handleEdit`, `resetForm`, dan `submitForm`.

Jangan taruh logic write Dexie langsung di hook. Department akan menjadi data referensi lintas sales/finance/report, jadi mutasi sebaiknya tetap di service.

## Validasi Form

Buat `src/lib/validations/department.ts` mengikuti pola `src/lib/validations/stock.ts`.

Validasi minimal:
- `name` wajib diisi.
- `code` optional.
- `code` jika diisi sebaiknya pendek, misalnya maksimal 20 karakter.
- `description` optional.
- `is_active` boolean.

Untuk fase awal, jangan jadikan duplicate `code` sebagai blocker yang rumit. Jika ingin menjaga rapi, service boleh mengecek code aktif yang sama dan menolak dengan pesan sederhana.

## UI Master Data

Route baru:

```txt
/master-data/departments
```

File route:

```ts
// src/routes/master-data/departments.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'
import DepartmentManagement from '@/view/master-data/departments/DepartmentManagement'

export const Route = createLazyFileRoute('/master-data/departments')({
  component: DepartmentManagement,
})
```

`DepartmentManagement.tsx`:
- Header singkat + tombol tambah department.
- Search berdasarkan nama, kode, dan deskripsi.
- Filter aktif/nonaktif.
- Desktop: tabel dengan kolom nama, kode, deskripsi, status, aksi.
- Mobile: boleh tetap tabel responsive sederhana atau list compact.

`DepartmentFormModal.tsx`:
- Field: nama, kode, deskripsi, aktif.
- Pakai AntD form control atau `react-hook-form` sesuai pola yang dipilih.
- Tombol simpan dan batal.

`DepartmentTable.tsx`:
- Render data dan aksi edit/arsip/restore.
- Jika datanya sedikit, file ini boleh digabung dulu ke `DepartmentManagement.tsx`. Pisahkan hanya kalau komponen mulai panjang.

## Navigasi Master Data

Update `src/routes/master-data/index.tsx`:
- Tambah kartu Department.
- Label pakai `t('nav.departments')`.
- Deskripsi pakai `t('home.departmentsDesc')`.
- Icon bisa memakai `ApartmentOutlined` dari Ant Design atau `Building2` dari lucide sesuai import yang dipakai di file target.

Update `src/routes/__root.tsx`:
- Tambah child menu di group Master Data:

```ts
{ to: '/master-data/departments', label: t('nav.departments'), icon: Building2 }
```

Pastikan menu tetap difilter lewat `canAccessPath(currentUser?.role, child.to)`.

## Backup dan Restore

Update `src/utils/backupRestore.ts`:
- `backupDatabase()` export `departments`.
- `restoreDatabase()` memasukkan `departments` ke `expectedKeys`.
- Tambahkan `db.departments` ke daftar table transaction restore.
- Clear `db.departments` saat restore.
- Bulk add `data.departments` saat tersedia.
- Naikkan `version` payload backup jika diperlukan.

Contoh titik update:

```ts
departments: await db.departments.toArray(),
```

```ts
const expectedKeys = [
  'products',
  'transactions',
  'transactionItems',
  'stockPurchases',
  'profitLogs',
  'profitBalance',
  'promos',
  'contacts',
  'departments',
  'authUsers',
  'activityLogs',
];
```

Jika `contacts` belum ada saat departments dikerjakan, jangan tambahkan `contacts` hanya demi contoh ini. Ikuti table yang benar-benar sudah ada di repo.

## Integrasi Dengan Sales Document

Saat `docs/FINANCE-SALES.md` dikerjakan, department bisa dipakai sebagai dimensi opsional.

Tambahan field yang disarankan:

```ts
department_id?: string;
department_code?: string;
department_name?: string;
```

Aturan integrasi:
- Picker department hanya menampilkan department aktif.
- Saat department dipilih, isi snapshot `department_code` dan `department_name`.
- Jika department diedit setelah dokumen dibuat, dokumen lama tidak ikut berubah.
- Jika department diarsipkan, dokumen lama tetap menampilkan snapshot, tetapi department tidak muncul sebagai pilihan baru.
- Jangan wajibkan department untuk semua sales document di fase awal. Jadikan optional agar POS dan sales flow existing tidak terganggu.

## Integrasi Dengan Finance dan Report

Untuk finance/report fase berikutnya:
- `FinanceTransaction` bisa ditambah `department_id`, `department_code`, dan `department_name` jika benar-benar diperlukan.
- Filter report per department sebaiknya membaca snapshot dari transaksi/dokumen, bukan join dinamis yang bisa berubah saat master diedit.
- Jangan ubah `recalculateFinance()` hanya untuk department jika belum ada transaksi yang memakai department.
- Jangan membuat department menjadi kategori finance. Kategori finance tetap menjelaskan jenis transaksi, department hanya dimensi analisis.

## Urutan Implementasi

Kerjakan bertahap agar mudah dicek.

1. Tambah type `Department` di `src/types/index.ts`.
2. Tambah table `departments` dan schema Dexie versi baru di `src/lib/db.ts`.
3. Buat validasi `src/lib/validations/department.ts`.
4. Buat `src/services/departmentService.ts` untuk create/update/archive/restore + activity log.
5. Buat `src/hooks/useDepartments.tsx`.
6. Buat UI `src/view/master-data/departments/DepartmentManagement.tsx`.
7. Pisahkan `DepartmentFormModal.tsx` dan `DepartmentTable.tsx` jika file management mulai terlalu besar.
8. Tambah route `src/routes/master-data/departments.lazy.tsx`.
9. Tambah menu Department di `src/routes/master-data/index.tsx` dan `src/routes/__root.tsx`.
10. Tambah permission `/master-data/departments` di `src/auth/routePermissions.ts`.
11. Tambah i18n key di `src/i18n/messages.ts` untuk ID dan EN.
12. Update backup/restore agar `departments` ikut dibawa.
13. Jalankan lint/build agar `routeTree.gen.ts` ikut sinkron.
14. Setelah department stabil, update rencana sales document/finance/report untuk memakai `department_id` + snapshot department secara optional.

## Acceptance Criteria

- Route `/master-data/departments` tersedia dan muncul di group Master Data untuk role yang berhak.
- Department bisa dibuat, diedit, diarsipkan, dan dipulihkan.
- Department yang diarsipkan tidak muncul sebagai pilihan default untuk dokumen/transaksi baru.
- Data department tersimpan di Dexie table `departments`.
- Mutasi department melalui service layer dan menulis activity log.
- Backup/restore membawa data department.
- I18n tersedia untuk bahasa Indonesia dan Inggris.
- Tidak ada table `projects`, `warehouses`, atau struktur parent-child department yang dibuat dari pekerjaan ini.
- Department tidak mengganti kategori finance, role user, contact, atau warehouse.
- Existing POS `/transaction`, produk, unit, promo, finance, dan report tidak berubah perilakunya.

## Manual QA

- Buat department baru, refresh halaman, pastikan data tetap ada.
- Edit nama/kode/deskripsi, pastikan `updated_at` berubah.
- Arsipkan department, pastikan status berubah nonaktif dan tidak hilang dari database.
- Restore department, pastikan kembali aktif.
- Coba akses sebagai role tanpa `SETTINGS_ACCESS`, pastikan route/menu tidak tersedia.
- Backup database, restore ke data yang sama, pastikan departments tidak hilang.
- Jalankan `bun run lint` atau `bun run lint`.
- Jalankan `bun run build` atau `bun run build` jika butuh validasi route tree dan typecheck penuh.
