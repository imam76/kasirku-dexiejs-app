# Master Data Projects - Langkah Pengerjaan Sesuai Struktur Project

Dokumen ini adalah panduan pengerjaan Master Data Projects untuk project Kasirku. Targetnya: project bisa menjadi dimensi pekerjaan/kontrak/campaign untuk sales document, finance, dan report berikutnya, tanpa mengubah flow POS existing dan tanpa mencampurnya dengan contact, department, user login, atau warehouse.

## Ringkasan Keputusan

Fase awal dibuat kecil dan aman:
- Project adalah master data pekerjaan atau konteks transaksi, misalnya `Pengadaan Toko A`, `Event Ramadan`, `Kontrak Grosir Mei`, atau `Renovasi Cabang`.
- Project bukan department. Department adalah unit internal/cost center, sedangkan project adalah pekerjaan/kegiatan spesifik.
- Project bukan contact/customer/supplier. Project boleh terkait contact, tetapi contact tetap master data terpisah.
- Project tidak disambungkan ke `AuthUser` dulu. User internal toko tetap dikelola lewat auth/user management.
- Project dibuat flat list dulu. Jangan buat subproject, milestone, task, atau project budgeting detail di fase awal.
- Hapus project sebaiknya berupa nonaktif/arsip (`is_active=false`), bukan hard delete, karena nanti bisa dipakai oleh dokumen sales/finance/report.
- Sales document atau finance transaction nanti boleh menyimpan `project_id`, tetapi tetap simpan snapshot nama/kode project agar histori dokumen tidak berubah saat master project diedit.

## Struktur File Yang Disarankan

Tambahkan file baru di bawah struktur project yang sudah ada.

```txt
src/routes/master-data/
  projects.lazy.tsx

src/view/master-data/projects/
  ProjectManagement.tsx
  ProjectFormModal.tsx
  ProjectTable.tsx

src/hooks/
  useProjects.tsx

src/services/
  projectService.ts

src/lib/validations/
  project.ts

src/utils/
  projectsCsv.ts
```

Update file existing:
- `src/types/index.ts`: tambah tipe `Project`.
- `src/lib/db.ts`: tambah table Dexie `projects`.
- `src/routes/master-data/index.tsx`: tambah kartu Project di landing Master Data.
- `src/routes/__root.tsx`: tambah menu sidebar Project di group Master Data.
- `src/auth/routePermissions.ts`: tambah permission route `/master-data/projects`.
- `src/i18n/messages.ts`: tambah label nav, form, table, empty state, filter, dan pesan sukses/error.
- `src/utils/backupRestore.ts`: export/import table `projects`.
- `src/routeTree.gen.ts`: jangan edit manual; biarkan generator/build TanStack Router yang update.

## Data Model

Tambahkan tipe di `src/types/index.ts`.

```ts
export type ProjectStatus =
  | 'PLANNED'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Project {
  id: string;
  name: string;
  code?: string;
  status: ProjectStatus;
  contact_id?: string;
  contact_name?: string;
  department_id?: string;
  department_code?: string;
  department_name?: string;
  start_date?: string;
  end_date?: string;
  budget_amount?: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

Catatan model:
- `name` wajib dan menjadi label utama di picker, table, dan report.
- `code` optional, dipakai untuk kode pendek seperti `PRJ-001`, `EVT-RMD`, atau kode kontrak.
- `status` menjelaskan lifecycle project. `is_active` menjelaskan apakah project masih bisa dipilih di dokumen baru.
- `contact_id` dan `contact_name` optional. Isi hanya jika Master Data Contacts sudah ada atau sedang dikerjakan.
- `department_id`, `department_code`, dan `department_name` optional. Isi hanya jika Master Data Departments sudah ada atau sedang dikerjakan.
- `budget_amount` optional sebagai nilai target/estimasi project, bukan saldo finance dan bukan invoice total.
- Jangan tambah detail milestone, task, item biaya, atau termin pembayaran di fase awal.

## DB Schema Dexie

Gunakan versi Dexie berikutnya dari schema yang sedang ada di `src/lib/db.ts`.

Jika contact dan department belum diimplementasikan dan DB masih di `version(12)`, project bisa memakai `version(13)`.

Jika contact memakai `version(13)` dan department memakai `version(14)`, project harus memakai `version(15)`.

Tambahkan table property:

```ts
projects!: Table<Project>;
```

Tambahkan schema versi baru:

```ts
this.version(15).stores({
  projects: 'id, name, code, status, contact_id, department_id, is_active, start_date, end_date, created_at'
});
```

Nomor `15` hanya contoh jika contact dan department sudah memakai versi sebelumnya. Sesuaikan dengan versi Dexie terbaru saat implementasi. Jangan menambahkan table baru ke `version(1)`.

## Permission

Untuk fase awal, jangan tambah permission baru dulu.

Rekomendasi route:

```ts
'/master-data/projects': 'SETTINGS_ACCESS'
```

Alasannya:
- Owner/Admin sudah punya `SETTINGS_ACCESS`.
- Project adalah konfigurasi dimensi bisnis, bukan pekerjaan harian kasir.
- Gudang tidak perlu mengelola project untuk stok.
- Finance/sales document nanti bisa membaca project sebagai pilihan, tetapi CRUD master project tetap dibatasi ke Owner/Admin.

Jika nanti role Finance perlu mengelola project, baru pertimbangkan permission baru seperti `PROJECT_MANAGE`. Jangan lakukan itu di fase awal.

## Service Layer

Buat `src/services/projectService.ts`. Semua mutasi Dexie dan activity log project masuk ke service layer, bukan langsung di komponen.

Kontrak minimal:

```ts
export interface ProjectUpsertInput {
  name: string;
  code?: string;
  status: ProjectStatus;
  contact_id?: string;
  contact_name?: string;
  department_id?: string;
  department_code?: string;
  department_name?: string;
  start_date?: string;
  end_date?: string;
  budget_amount?: number;
  description?: string;
  is_active?: boolean;
}

export const createProject = async (input: ProjectUpsertInput) => {};
export const updateProject = async (id: string, input: ProjectUpsertInput) => {};
export const archiveProject = async (id: string) => {};
export const restoreProject = async (id: string) => {};
```

Aturan service:
- Ambil current user dengan `getCurrentSessionUser()`.
- Guard mutasi memakai `requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS')`.
- Normalisasi string sebelum disimpan: `trim()` untuk `name`, `code`, snapshot contact/department, dan `description`.
- Simpan `code` dalam uppercase jika ingin konsisten, misalnya `prj-001` menjadi `PRJ-001`.
- `status` default saat create adalah `ACTIVE` atau `PLANNED`; pilih satu dan jaga konsisten di form.
- Validasi `end_date` tidak boleh lebih awal dari `start_date` jika keduanya diisi.
- `budget_amount` boleh kosong, tetapi jika diisi tidak boleh negatif.
- `createProject` harus set `id`, `created_at`, `updated_at`, dan default `is_active=true`.
- `updateProject` hanya update field project dan `updated_at`.
- `archiveProject` set `is_active=false`, bukan `db.projects.delete(id)`.
- `restoreProject` set `is_active=true`.
- Tulis `activityLogs` untuk create/update/archive/restore seperti pola produk, finance, dan auth.

## Hook

Buat `src/hooks/useProjects.tsx` sebagai orchestration React Query.

Tanggung jawab hook:
- Query `projects` dari Dexie, urutkan berdasarkan `created_at` terbaru atau `name`.
- Query `contacts` dan `departments` hanya jika table master tersebut sudah ada di implementasi.
- State editing id dan filter UI.
- Mutation create/update/archive/restore memanggil `projectService`.
- Invalidate query `['projects']` setelah sukses.
- Menyediakan helper `handleEdit`, `resetForm`, dan `submitForm`.

Jangan taruh logic write Dexie langsung di hook. Project akan menjadi data referensi lintas sales/finance/report, jadi mutasi sebaiknya tetap di service.

## Validasi Form

Buat `src/lib/validations/project.ts` mengikuti pola `src/lib/validations/stock.ts`.

Validasi minimal:
- `name` wajib diisi.
- `code` optional.
- `code` jika diisi sebaiknya pendek, misalnya maksimal 30 karakter.
- `status` wajib dipilih.
- `contact_id` optional.
- `department_id` optional.
- `start_date` optional.
- `end_date` optional, tetapi tidak boleh lebih awal dari `start_date`.
- `budget_amount` optional, tetapi tidak boleh negatif.
- `description` optional.
- `is_active` boolean.

Untuk fase awal, jangan jadikan duplicate `code` sebagai blocker yang rumit. Jika ingin menjaga rapi, service boleh mengecek code aktif yang sama dan menolak dengan pesan sederhana.

## UI Master Data

Route baru:

```txt
/master-data/projects
```

File route:

```ts
// src/routes/master-data/projects.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'
import ProjectManagement from '@/view/master-data/projects/ProjectManagement'

export const Route = createLazyFileRoute('/master-data/projects')({
  component: ProjectManagement,
})
```

`ProjectManagement.tsx`:
- Header singkat + tombol tambah project.
- Search berdasarkan nama, kode, contact, department, dan deskripsi.
- Filter status.
- Filter aktif/nonaktif.
- Desktop: tabel dengan kolom nama, kode, status, contact, department, periode, budget, status aktif, aksi.
- Mobile: boleh tetap tabel responsive sederhana atau list compact.

`ProjectFormModal.tsx`:
- Field: nama, kode, status, contact, department, tanggal mulai, tanggal selesai, budget, deskripsi, aktif.
- Contact dan department picker hanya dipasang jika master terkait sudah ada.
- Jika Contacts/Departments belum ada, field contact/department boleh ditunda dulu atau dibuat read-only snapshot manual sesuai kebutuhan.
- Pakai AntD form control atau `react-hook-form` sesuai pola yang dipilih.
- Tombol simpan dan batal.

`ProjectTable.tsx`:
- Render data dan aksi edit/arsip/restore.
- Jika datanya sedikit, file ini boleh digabung dulu ke `ProjectManagement.tsx`. Pisahkan hanya kalau komponen mulai panjang.

## Navigasi Master Data

Update `src/routes/master-data/index.tsx`:
- Tambah kartu Project.
- Label pakai `t('nav.projects')`.
- Deskripsi pakai `t('home.projectsDesc')`.
- Icon bisa memakai `ProjectOutlined` dari Ant Design jika tersedia, atau `BriefcaseBusiness` / `FolderKanban` dari lucide sesuai import yang dipakai di file target.

Update `src/routes/__root.tsx`:
- Tambah child menu di group Master Data:

```ts
{ to: '/master-data/projects', label: t('nav.projects'), icon: FolderKanban }
```

Pastikan menu tetap difilter lewat `canAccessPath(currentUser?.role, child.to)`.

## Backup dan Restore

Update `src/utils/backupRestore.ts`:
- `backupDatabase()` export `projects`.
- `restoreDatabase()` memasukkan `projects` ke `expectedKeys`.
- Tambahkan `db.projects` ke daftar table transaction restore.
- Clear `db.projects` saat restore.
- Bulk add `data.projects` saat tersedia.
- Naikkan `version` payload backup jika diperlukan.

Contoh titik update:

```ts
projects: await db.projects.toArray(),
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
  'projects',
  'authUsers',
  'activityLogs',
];
```

Jika `contacts` atau `departments` belum ada saat projects dikerjakan, jangan tambahkan table tersebut hanya demi contoh ini. Ikuti table yang benar-benar sudah ada di repo.

## Integrasi Dengan Sales Document

Saat `docs/FINANCE-SALES.md` dikerjakan, project bisa dipakai sebagai dimensi opsional.

Tambahan field yang disarankan:

```ts
project_id?: string;
project_code?: string;
project_name?: string;
```

Aturan integrasi:
- Picker project hanya menampilkan project aktif.
- Saat project dipilih, isi snapshot `project_code` dan `project_name`.
- Jika project punya contact/department snapshot, sales document boleh memakai itu sebagai default, tetapi user tetap boleh mengganti contact/department di dokumen.
- Jika project diedit setelah dokumen dibuat, dokumen lama tidak ikut berubah.
- Jika project diarsipkan, dokumen lama tetap menampilkan snapshot, tetapi project tidak muncul sebagai pilihan baru.
- Jangan wajibkan project untuk semua sales document di fase awal. Jadikan optional agar POS dan sales flow existing tidak terganggu.

## Integrasi Dengan Finance dan Report

Untuk finance/report fase berikutnya:
- `FinanceTransaction` bisa ditambah `project_id`, `project_code`, dan `project_name` jika benar-benar diperlukan.
- Filter report per project sebaiknya membaca snapshot dari transaksi/dokumen, bukan join dinamis yang bisa berubah saat master diedit.
- Jangan ubah `recalculateFinance()` hanya untuk project jika belum ada transaksi yang memakai project.
- Jangan membuat project menjadi kategori finance. Kategori finance tetap menjelaskan jenis transaksi, project hanya dimensi analisis.
- `budget_amount` tidak boleh menaikkan atau menurunkan `financeBalance`. Budget hanya angka referensi sampai ada fitur budgeting resmi.

## Urutan Implementasi

Kerjakan bertahap agar mudah dicek.

1. Tambah type `ProjectStatus` dan `Project` di `src/types/index.ts`.
2. Tambah table `projects` dan schema Dexie versi baru di `src/lib/db.ts`.
3. Buat validasi `src/lib/validations/project.ts`.
4. Buat `src/services/projectService.ts` untuk create/update/archive/restore + activity log.
5. Buat `src/hooks/useProjects.tsx`.
6. Buat UI `src/view/master-data/projects/ProjectManagement.tsx`.
7. Pisahkan `ProjectFormModal.tsx` dan `ProjectTable.tsx` jika file management mulai terlalu besar.
8. Tambah route `src/routes/master-data/projects.lazy.tsx`.
9. Tambah menu Project di `src/routes/master-data/index.tsx` dan `src/routes/__root.tsx`.
10. Tambah permission `/master-data/projects` di `src/auth/routePermissions.ts`.
11. Tambah i18n key di `src/i18n/messages.ts` untuk ID dan EN.
12. Update backup/restore agar `projects` ikut dibawa.
13. Jalankan lint/build agar `routeTree.gen.ts` ikut sinkron.
14. Setelah project stabil, update rencana sales document/finance/report untuk memakai `project_id` + snapshot project secara optional.

## Acceptance Criteria

- Route `/master-data/projects` tersedia dan muncul di group Master Data untuk role yang berhak.
- Project bisa dibuat, diedit, diarsipkan, dan dipulihkan.
- Project yang diarsipkan tidak muncul sebagai pilihan default untuk dokumen/transaksi baru.
- Data project tersimpan di Dexie table `projects`.
- Mutasi project melalui service layer dan menulis activity log.
- Backup/restore membawa data project.
- I18n tersedia untuk bahasa Indonesia dan Inggris.
- Tidak ada table task, milestone, subproject, budgeting detail, atau warehouse yang dibuat dari pekerjaan ini.
- Project tidak mengganti kategori finance, role user, contact, department, atau warehouse.
- Existing POS `/transaction`, produk, unit, promo, finance, dan report tidak berubah perilakunya.

## Manual QA

- Buat project baru, refresh halaman, pastikan data tetap ada.
- Edit nama/kode/status/periode/budget, pastikan `updated_at` berubah.
- Coba isi `end_date` lebih awal dari `start_date`, pastikan form menolak.
- Arsipkan project, pastikan status berubah nonaktif dan tidak hilang dari database.
- Restore project, pastikan kembali aktif.
- Coba akses sebagai role tanpa `SETTINGS_ACCESS`, pastikan route/menu tidak tersedia.
- Backup database, restore ke data yang sama, pastikan projects tidak hilang.
- Jalankan `bun run lint` atau `bun run lint`.
- Jalankan `bun run build` atau `bun run build` jika butuh validasi route tree dan typecheck penuh.
