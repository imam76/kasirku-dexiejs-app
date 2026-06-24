# Master Data Contact - Langkah Pengerjaan Sesuai Struktur Project

Dokumen ini adalah panduan pengerjaan Master Data Contact untuk project Frayukti. Targetnya: contact bisa dipakai sebagai sumber data customer/supplier untuk fitur sales document berikutnya, tanpa mencampur data pelanggan dengan `AuthUser`, dan tanpa melebar dulu ke department, project, atau warehouse.

## Ringkasan Keputusan

Fase awal dibuat kecil dan aman:
- Contact adalah master data pihak eksternal: customer, supplier, customer + supplier, atau lainnya.
- Contact tidak disambungkan ke `AuthUser`, karena `AuthUser` adalah user internal toko.
- Sales document nanti boleh menyimpan `contact_id`, tetapi tetap wajib menyimpan snapshot nama/telepon/alamat agar dokumen lama tidak berubah ketika contact diedit.
- Department dan project tidak dikerjakan di dokumen ini. Keduanya adalah dimensi tracking/reporting terpisah.
- Warehouse juga tidak dikerjakan di sini. Untuk sales document fase awal, `warehouse_name` masih cukup sebagai snapshot string.
- Hapus contact sebaiknya berupa nonaktif/arsip (`is_active=false`), bukan hard delete, karena contact bisa dipakai oleh dokumen transaksi di masa depan.

## Struktur File Yang Disarankan

Tambahkan file baru di bawah struktur project yang sudah ada.

```txt
src/routes/master-data/
  contacts.lazy.tsx

src/view/master-data/contacts/
  ContactManagement.tsx
  ContactFormModal.tsx
  ContactTable.tsx

src/hooks/
  useContacts.tsx

src/services/
  contactService.ts

src/lib/validations/
  contact.ts

src/utils/
  contactsCsv.ts
```

Update file existing:
- `src/types/index.ts`: tambah tipe `Contact`.
- `src/lib/db.ts`: tambah table Dexie `contacts`.
- `src/routes/master-data/index.tsx`: tambah kartu Contact di landing Master Data.
- `src/routes/__root.tsx`: tambah menu sidebar Contact di group Master Data.
- `src/auth/routePermissions.ts`: tambah permission route `/master-data/contacts`.
- `src/i18n/messages.ts`: tambah label nav, form, table, empty state, filter, dan pesan sukses/error.
- `src/utils/backupRestore.ts`: export/import table `contacts`.
- `src/routeTree.gen.ts`: jangan edit manual; biarkan generator/build TanStack Router yang update.

## Data Model

Tambahkan tipe di `src/types/index.ts`.

```ts
export type ContactType =
  | 'CUSTOMER'
  | 'SUPPLIER'
  | 'CUSTOMER_SUPPLIER'
  | 'OTHER';

export interface Contact {
  id: string;
  name: string;
  contact_type: ContactType;
  phone?: string;
  email?: string;
  address?: string;
  company_name?: string;
  tax_number?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

Catatan model:
- Pakai `name` sebagai nama utama yang ditampilkan di picker, tabel, dan snapshot dokumen.
- `company_name` optional untuk contact berbentuk badan usaha.
- `tax_number` optional untuk kebutuhan invoice/NPWP nanti, tetapi jangan buat modul pajak dulu.
- Jangan tambah `department_id` atau `project_id` ke contact. Department/project bukan identitas contact.
- Jangan buat `customer` table terpisah pada fase ini. Contact dengan `contact_type='CUSTOMER'` sudah cukup.

## DB Schema Dexie

Saat dokumen ini dibuat, `src/lib/db.ts` sudah sampai `version(12)` untuk `promos`. Jika contact dikerjakan sebelum sales document, gunakan versi berikutnya.

```ts
contacts!: Table<Contact>;
```

```ts
this.version(13).stores({
  contacts: 'id, name, contact_type, phone, email, is_active, created_at'
});
```

Jika `salesDocuments` sudah lebih dulu memakai `version(13)`, maka contact harus memakai versi setelahnya. Jangan menambahkan table baru ke `version(1)`.

## Permission

Untuk fase awal, jangan tambah permission baru dulu.

Rekomendasi route:

```ts
'/master-data/contacts': 'SETTINGS_ACCESS'
```

Alasannya:
- Owner/Admin sudah punya `SETTINGS_ACCESS`.
- Kasir tidak perlu mengelola master contact.
- Gudang tidak perlu mengelola customer/supplier.
- Sales document nanti tetap bisa membaca snapshot contact dari halaman sales, tetapi CRUD master contact tetap dibatasi ke Owner/Admin.

Jika nanti ada role Finance khusus yang perlu mengelola contact, baru pertimbangkan permission baru seperti `CONTACT_MANAGE` atau ubah route rule menjadi kombinasi permission. Jangan lakukan itu di fase awal.

## Service Layer

Buat `src/services/contactService.ts`. Semua mutasi Dexie dan activity log contact masuk ke service layer, bukan langsung di komponen.

Kontrak minimal:

```ts
export interface ContactUpsertInput {
  name: string;
  contact_type: ContactType;
  phone?: string;
  email?: string;
  address?: string;
  company_name?: string;
  tax_number?: string;
  notes?: string;
  is_active?: boolean;
}

export const createContact = async (input: ContactUpsertInput) => {};
export const updateContact = async (id: string, input: ContactUpsertInput) => {};
export const archiveContact = async (id: string) => {};
export const restoreContact = async (id: string) => {};
```

Aturan service:
- Ambil current user dengan `getCurrentSessionUser()`.
- Guard mutasi memakai `requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS')`.
- Normalisasi string sebelum disimpan: `trim()` untuk nama, phone, email, address, company name, tax number, notes.
- `createContact` harus set `id`, `created_at`, `updated_at`, dan default `is_active=true`.
- `updateContact` hanya update field contact dan `updated_at`.
- `archiveContact` set `is_active=false`, bukan `db.contacts.delete(id)`.
- `restoreContact` set `is_active=true`.
- Tulis `activityLogs` untuk create/update/archive/restore seperti pola produk, finance, dan auth.

## Hook

Buat `src/hooks/useContacts.tsx` sebagai orchestration React Query.

Tanggung jawab hook:
- Query `contacts` dari Dexie, urutkan `created_at` terbaru atau `name`.
- State editing id dan filter UI.
- Mutation create/update/archive/restore memanggil `contactService`.
- Invalidate query `['contacts']` setelah sukses.
- Menyediakan helper `handleEdit`, `resetForm`, dan `submitForm`.

Jangan taruh logic write Dexie langsung di hook kecuali benar-benar kecil dan tidak punya side effect. Untuk contact, tetap pakai service karena akan dipakai ulang oleh sales document.

## Validasi Form

Buat `src/lib/validations/contact.ts` mengikuti pola `src/lib/validations/stock.ts`.

Validasi minimal:
- `name` wajib diisi.
- `contact_type` wajib dipilih.
- `email` optional, tetapi jika diisi harus format email valid.
- `phone` optional, tetapi trim dan tolak input yang hanya spasi.
- `tax_number` optional.
- `notes` optional.

Jangan tambah validasi unik phone/email sebagai blocker di fase awal. Jika butuh, tampilkan warning saja agar tidak menghambat toko yang punya data lama tidak rapi.

## UI Master Data

Route baru:

```txt
/master-data/contacts
```

File route:

```ts
// src/routes/master-data/contacts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'
import ContactManagement from '@/view/master-data/contacts/ContactManagement'

export const Route = createLazyFileRoute('/master-data/contacts')({
  component: ContactManagement,
})
```

`ContactManagement.tsx`:
- Header singkat + tombol tambah contact.
- Search berdasarkan nama, company, phone, email.
- Filter `contact_type`.
- Toggle/filter aktif/nonaktif.
- Desktop: tabel dengan kolom nama, tipe, phone, email, company, status, aksi.
- Mobile: boleh tetap tabel responsive sederhana atau list compact. Jangan bikin layout marketing/landing.

`ContactFormModal.tsx`:
- Field: nama, tipe contact, phone, email, company, address, tax number, notes, aktif.
- Pakai AntD form control atau `react-hook-form` sesuai pola yang dipilih.
- Tombol simpan dan batal.

`ContactTable.tsx`:
- Render data dan aksi edit/arsip/restore.
- Jika datanya sedikit, file ini boleh digabung dulu ke `ContactManagement.tsx`. Pisahkan hanya kalau komponen mulai panjang.

## Navigasi Master Data

Update `src/routes/master-data/index.tsx`:
- Tambah kartu Contact.
- Label pakai `t('nav.contacts')`.
- Deskripsi pakai `t('home.contactsDesc')`.
- Icon bisa memakai `ContactsOutlined` dari Ant Design atau icon lucide yang sudah dipakai di root nav.

Update `src/routes/__root.tsx`:
- Tambah child menu di group Master Data:

```ts
{ to: '/master-data/contacts', label: t('nav.contacts'), icon: Users }
```

Pastikan menu tetap difilter lewat `canAccessPath(currentUser?.role, child.to)`.

## Backup dan Restore

Update `src/utils/backupRestore.ts`:
- `backupDatabase()` export `contacts`.
- `restoreDatabase()` memasukkan `contacts` ke `expectedKeys`.
- Tambahkan `db.contacts` ke daftar table transaction restore.
- Clear `db.contacts` saat restore.
- Bulk add `data.contacts` saat tersedia.
- Naikkan `version` payload backup jika diperlukan.

Contoh titik update:

```ts
contacts: await db.contacts.toArray(),
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
  'authUsers',
  'activityLogs',
];
```

## Integrasi Dengan Sales Document

Saat `docs/FINANCE-SALES.md` dikerjakan, update model sales document agar bisa menyimpan referensi contact.

Tambahan field yang disarankan:

```ts
contact_id?: string;
customer_name: string;
customer_phone?: string;
customer_address?: string;
```

Aturan integrasi:
- Picker customer di Sales Document hanya menampilkan contact aktif dengan `contact_type` `CUSTOMER` atau `CUSTOMER_SUPPLIER`.
- Saat contact dipilih, isi snapshot `customer_name`, `customer_phone`, dan `customer_address`.
- Jika contact diedit setelah invoice dibuat, dokumen lama tidak ikut berubah.
- Jika contact diarsipkan, dokumen lama tetap menampilkan snapshot, tetapi contact tidak muncul sebagai pilihan baru.

## Urutan Implementasi

Kerjakan bertahap agar mudah dicek.

1. Tambah type `ContactType` dan `Contact` di `src/types/index.ts`.
2. Tambah table `contacts` dan schema Dexie versi baru di `src/lib/db.ts`.
3. Buat validasi `src/lib/validations/contact.ts`.
4. Buat `src/services/contactService.ts` untuk create/update/archive/restore + activity log.
5. Buat `src/hooks/useContacts.tsx`.
6. Buat UI `src/view/master-data/contacts/ContactManagement.tsx`.
7. Pisahkan `ContactFormModal.tsx` dan `ContactTable.tsx` jika file management mulai terlalu besar.
8. Tambah route `src/routes/master-data/contacts.lazy.tsx`.
9. Tambah menu Contact di `src/routes/master-data/index.tsx` dan `src/routes/__root.tsx`.
10. Tambah permission `/master-data/contacts` di `src/auth/routePermissions.ts`.
11. Tambah i18n key di `src/i18n/messages.ts` untuk ID dan EN.
12. Update backup/restore agar `contacts` ikut dibawa.
13. Jalankan lint/build agar `routeTree.gen.ts` ikut sinkron.
14. Setelah contact stabil, update rencana sales document untuk memakai `contact_id` + snapshot customer.

## Acceptance Criteria

- Route `/master-data/contacts` tersedia dan muncul di group Master Data untuk role yang berhak.
- Contact bisa dibuat, diedit, diarsipkan, dan dipulihkan.
- Contact yang diarsipkan tidak muncul sebagai pilihan default untuk dokumen baru.
- Data contact tersimpan di Dexie table `contacts`.
- Mutasi contact melalui service layer dan menulis activity log.
- Backup/restore membawa data contact.
- I18n tersedia untuk bahasa Indonesia dan Inggris.
- Tidak ada table `customers`, `departments`, `projects`, atau `warehouses` yang dibuat dari pekerjaan ini.
- Sales document tetap menyimpan snapshot customer walaupun nanti memakai `contact_id`.
- Existing POS `/transaction`, produk, unit, promo, finance, dan report tidak berubah perilakunya.

## Manual QA

- Buat contact customer baru, refresh halaman, pastikan data tetap ada.
- Edit phone/email/address, pastikan `updated_at` berubah.
- Arsipkan contact, pastikan status berubah nonaktif dan tidak hilang dari database.
- Restore contact, pastikan kembali aktif.
- Coba akses sebagai role tanpa `SETTINGS_ACCESS`, pastikan route/menu tidak tersedia.
- Backup database, restore ke data yang sama, pastikan contacts tidak hilang.
- Jalankan `bun run lint` atau `bun run lint`.
- Jalankan `bun run build` atau `bun run build` jika butuh validasi route tree dan typecheck penuh.
