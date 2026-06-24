# Master Data Taxes - Langkah Pengerjaan Sesuai Struktur Project

Dokumen ini adalah panduan pengerjaan Master Data Taxes untuk project Frayukti. Targetnya: tax/pajak bisa menjadi master rule untuk Sales Quotation, Sales Order, dan Sales Invoice berikutnya, tanpa mengubah flow POS existing, tanpa mengubah `Product.selling_price`, dan tanpa membuat asumsi tarif pajak resmi yang hard-coded.

## Ringkasan Keputusan

Fase awal dibuat kecil dan aman:
- Tax adalah master aturan pajak persentase, misalnya PPN, pajak layanan, atau tax custom toko.
- Tax tidak otomatis mengubah harga master produk.
- Tax tidak otomatis menulis `financeTransactions` atau `financeBalance`.
- Tax dipakai oleh sales document untuk menghitung `tax_amount` dan `total_amount`.
- Sales document nanti wajib menyimpan snapshot tax agar dokumen lama tidak berubah ketika master tax diedit.
- Fase awal cukup dukung tax persentase. Jangan buat fixed tax, withholding, e-faktur, pelaporan pajak, multi-jurisdiction, atau tax filing.
- Jangan seed tarif pajak resmi secara hard-coded. Jika butuh default seperti PPN, user/admin yang mengisi rate di Master Data.
- Hapus tax sebaiknya berupa nonaktif/arsip (`is_active=false`), bukan hard delete, karena tax bisa dipakai oleh dokumen lama.

## Struktur File Yang Disarankan

Tambahkan file baru di bawah struktur project yang sudah ada.

```txt
src/routes/master-data/
  taxes.lazy.tsx

src/view/master-data/taxes/
  TaxManagement.tsx
  TaxFormModal.tsx
  TaxTable.tsx

src/hooks/
  useTaxes.tsx

src/services/
  taxService.ts

src/lib/validations/
  tax.ts

src/utils/
  taxesCsv.ts
  taxes.ts
```

Update file existing:
- `src/types/index.ts`: tambah tipe `Tax`.
- `src/lib/db.ts`: tambah table Dexie `taxes`.
- `src/routes/master-data/index.tsx`: tambah kartu Tax di landing Master Data.
- `src/routes/__root.tsx`: tambah menu sidebar Tax di group Master Data.
- `src/auth/routePermissions.ts`: tambah permission route `/master-data/taxes`.
- `src/i18n/messages.ts`: tambah label nav, form, table, empty state, filter, dan pesan sukses/error.
- `src/utils/backupRestore.ts`: export/import table `taxes`.
- `src/routeTree.gen.ts`: jangan edit manual; biarkan generator/build TanStack Router yang update.

## Data Model

Tambahkan tipe di `src/types/index.ts`.

```ts
export type TaxRateType = 'PERCENTAGE';
export type TaxCalculationMode = 'EXCLUSIVE' | 'INCLUSIVE';

export interface Tax {
  id: string;
  name: string;
  code?: string;
  rate: number;
  rate_type: TaxRateType;
  calculation_mode: TaxCalculationMode;
  description?: string;
  effective_from?: string;
  effective_to?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

Catatan model:
- `name` wajib dan menjadi label utama di picker, table, dan snapshot dokumen.
- `code` optional, misalnya `PPN`, `VAT`, atau `SERVICE_TAX`.
- `rate` disimpan sebagai persen, misalnya `11` berarti 11%.
- `rate_type` untuk fase awal selalu `PERCENTAGE`; tetap dibuat eksplisit agar tidak rancu dengan fixed amount.
- `calculation_mode='EXCLUSIVE'` berarti pajak ditambahkan di atas subtotal.
- `calculation_mode='INCLUSIVE'` berarti harga sudah termasuk pajak dan sistem perlu memecah nilai pajak dari subtotal.
- `effective_from` dan `effective_to` optional. Fase awal boleh hanya sebagai metadata/filter, tidak perlu otomatis memilih tax berdasarkan tanggal jika belum dibutuhkan.
- `is_default` optional behavior untuk default pilihan di sales document. Pastikan hanya satu tax aktif yang menjadi default.
- Jangan tambah field legal/reporting pajak detail dulu.

## Snapshot Di Sales Document

Saat sales document memakai tax, simpan snapshot di document/item agar histori aman.

Tambahan field yang disarankan di sales document:

```ts
tax_id?: string;
tax_name?: string;
tax_code?: string;
tax_rate?: number;
tax_calculation_mode?: TaxCalculationMode;
tax_amount?: number;
```

Aturan snapshot:
- Sales document boleh menyimpan `tax_id`, tetapi perhitungan dan tampilan histori harus memakai snapshot.
- Jika master tax diedit setelah invoice dibuat, dokumen lama tidak ikut berubah.
- Jika master tax diarsipkan, dokumen lama tetap menampilkan snapshot, tetapi tax tidak muncul sebagai pilihan baru.
- Jangan menyimpan hanya `tax_id` tanpa snapshot rate/nama/kode.

## DB Schema Dexie

Gunakan versi Dexie berikutnya dari schema yang sedang ada di `src/lib/db.ts`.

Jika contact/department/project belum diimplementasikan dan DB masih di `version(12)`, taxes bisa memakai `version(13)`.

Jika contact, department, dan project sudah memakai `version(13)`, `version(14)`, dan `version(15)`, taxes harus memakai `version(16)`.

Tambahkan table property:

```ts
taxes!: Table<Tax>;
```

Tambahkan schema versi baru:

```ts
this.version(16).stores({
  taxes: 'id, name, code, rate_type, calculation_mode, is_default, is_active, effective_from, effective_to, created_at'
});
```

Nomor `16` hanya contoh jika contact/department/project sudah memakai versi sebelumnya. Sesuaikan dengan versi Dexie terbaru saat implementasi. Jangan menambahkan table baru ke `version(1)`.

## Permission

Untuk fase awal, jangan tambah permission baru dulu.

Rekomendasi route:

```ts
'/master-data/taxes': 'SETTINGS_ACCESS'
```

Alasannya:
- Owner/Admin sudah punya `SETTINGS_ACCESS`.
- Tax adalah konfigurasi bisnis, bukan pekerjaan harian kasir.
- Gudang tidak perlu mengelola tax.
- Finance/sales document nanti bisa membaca tax sebagai pilihan, tetapi CRUD master tax tetap dibatasi ke Owner/Admin.

Jika nanti role Finance perlu mengelola tax, baru pertimbangkan permission baru seperti `TAX_MANAGE`. Jangan lakukan itu di fase awal.

## Service Layer

Buat `src/services/taxService.ts`. Semua mutasi Dexie dan activity log tax masuk ke service layer, bukan langsung di komponen.

Kontrak minimal:

```ts
export interface TaxUpsertInput {
  name: string;
  code?: string;
  rate: number;
  rate_type?: TaxRateType;
  calculation_mode: TaxCalculationMode;
  description?: string;
  effective_from?: string;
  effective_to?: string;
  is_default?: boolean;
  is_active?: boolean;
}

export const createTax = async (input: TaxUpsertInput) => {};
export const updateTax = async (id: string, input: TaxUpsertInput) => {};
export const archiveTax = async (id: string) => {};
export const restoreTax = async (id: string) => {};
export const setDefaultTax = async (id: string) => {};
```

Aturan service:
- Ambil current user dengan `getCurrentSessionUser()`.
- Guard mutasi memakai `requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS')`.
- Normalisasi string sebelum disimpan: `trim()` untuk `name`, `code`, dan `description`.
- Simpan `code` dalam uppercase jika ingin konsisten, misalnya `ppn` menjadi `PPN`.
- `rate_type` default `PERCENTAGE`.
- `rate` wajib angka finite dan tidak boleh negatif.
- Untuk fase awal, `rate` sebaiknya dibatasi `0 <= rate <= 100`.
- Validasi `effective_to` tidak boleh lebih awal dari `effective_from` jika keduanya diisi.
- Jika `is_default=true`, update tax lain agar `is_default=false` dalam transaction yang sama.
- `createTax` harus set `id`, `created_at`, `updated_at`, dan default `is_active=true`.
- `updateTax` hanya update field tax dan `updated_at`.
- `archiveTax` set `is_active=false`, bukan `db.taxes.delete(id)`.
- Jika tax yang diarsipkan adalah default, kosongkan default atau pilih default lain secara eksplisit lewat UI.
- `restoreTax` set `is_active=true`.
- Tulis `activityLogs` untuk create/update/archive/restore/default seperti pola produk, finance, dan auth.

## Helper Kalkulasi

Buat `src/utils/taxes.ts` untuk helper pure calculation. Jangan membaca/menulis Dexie di helper ini.

Kontrak minimal:

```ts
export interface CalculateTaxInput {
  amount: number;
  rate: number;
  calculationMode: TaxCalculationMode;
}

export const calculateTaxAmount = (input: CalculateTaxInput) => {};
export const createTaxSnapshot = (tax: Tax) => {};
```

Aturan kalkulasi:
- `EXCLUSIVE`: `tax_amount = amount * rate / 100`.
- `INCLUSIVE`: `tax_amount = amount - amount / (1 + rate / 100)`.
- Round hasil mengikuti pola uang project. Jika belum ada helper khusus, gunakan pembulatan konsisten di util sales document, bukan di UI.
- Output harus angka non-negatif dan finite.
- Jangan mengubah subtotal/harga produk di helper ini kecuali fungsi memang menerima dan mengembalikan total.

## Hook

Buat `src/hooks/useTaxes.tsx` sebagai orchestration React Query.

Tanggung jawab hook:
- Query `taxes` dari Dexie, urutkan default/aktif dulu lalu `name`.
- State editing id dan filter UI.
- Mutation create/update/archive/restore/default memanggil `taxService`.
- Invalidate query `['taxes']` setelah sukses.
- Menyediakan helper `handleEdit`, `resetForm`, dan `submitForm`.

Jangan taruh logic write Dexie langsung di hook. Tax akan menjadi data referensi lintas sales/finance/report, jadi mutasi sebaiknya tetap di service.

## Validasi Form

Buat `src/lib/validations/tax.ts` mengikuti pola `src/lib/validations/stock.ts`.

Validasi minimal:
- `name` wajib diisi.
- `code` optional.
- `code` jika diisi sebaiknya pendek, misalnya maksimal 30 karakter.
- `rate` wajib, angka, tidak negatif, dan untuk fase awal maksimal 100.
- `rate_type` default `PERCENTAGE`.
- `calculation_mode` wajib dipilih.
- `effective_from` optional.
- `effective_to` optional, tetapi tidak boleh lebih awal dari `effective_from`.
- `description` optional.
- `is_default` boolean.
- `is_active` boolean.

Jangan validasi tarif pajak berdasarkan aturan resmi negara di kode fase awal. Tarif adalah input user/admin.

## UI Master Data

Route baru:

```txt
/master-data/taxes
```

File route:

```ts
// src/routes/master-data/taxes.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'
import TaxManagement from '@/view/master-data/taxes/TaxManagement'

export const Route = createLazyFileRoute('/master-data/taxes')({
  component: TaxManagement,
})
```

`TaxManagement.tsx`:
- Header singkat + tombol tambah tax.
- Search berdasarkan nama, kode, dan deskripsi.
- Filter aktif/nonaktif.
- Filter calculation mode jika diperlukan.
- Desktop: tabel dengan kolom nama, kode, rate, mode, default, periode efektif, status, aksi.
- Mobile: boleh tetap tabel responsive sederhana atau list compact.

`TaxFormModal.tsx`:
- Field: nama, kode, rate persen, calculation mode, periode efektif, deskripsi, default, aktif.
- Pakai AntD form control atau `react-hook-form` sesuai pola yang dipilih.
- Tombol simpan dan batal.

`TaxTable.tsx`:
- Render data dan aksi edit/arsip/restore/set default.
- Jika datanya sedikit, file ini boleh digabung dulu ke `TaxManagement.tsx`. Pisahkan hanya kalau komponen mulai panjang.

## Navigasi Master Data

Update `src/routes/master-data/index.tsx`:
- Tambah kartu Tax.
- Label pakai `t('nav.taxes')`.
- Deskripsi pakai `t('home.taxesDesc')`.
- Icon bisa memakai `PercentageOutlined` dari Ant Design atau `Percent` dari lucide sesuai import yang dipakai di file target.

Update `src/routes/__root.tsx`:
- Tambah child menu di group Master Data:

```ts
{ to: '/master-data/taxes', label: t('nav.taxes'), icon: Percent }
```

Pastikan menu tetap difilter lewat `canAccessPath(currentUser?.role, child.to)`.

## Backup dan Restore

Update `src/utils/backupRestore.ts`:
- `backupDatabase()` export `taxes`.
- `restoreDatabase()` memasukkan `taxes` ke `expectedKeys`.
- Tambahkan `db.taxes` ke daftar table transaction restore.
- Clear `db.taxes` saat restore.
- Bulk add `data.taxes` saat tersedia.
- Naikkan `version` payload backup jika diperlukan.

Contoh titik update:

```ts
taxes: await db.taxes.toArray(),
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
  'taxes',
  'authUsers',
  'activityLogs',
];
```

Jika `contacts`, `departments`, atau `projects` belum ada saat taxes dikerjakan, jangan tambahkan table tersebut hanya demi contoh ini. Ikuti table yang benar-benar sudah ada di repo.

## Integrasi Dengan Sales Document

Saat `docs/FINANCE-SALES.md` dikerjakan, tax dipakai oleh document summary dan/atau line item.

Tambahan field yang disarankan:

```ts
tax_id?: string;
tax_name?: string;
tax_code?: string;
tax_rate?: number;
tax_calculation_mode?: TaxCalculationMode;
tax_amount?: number;
```

Aturan integrasi:
- Picker tax hanya menampilkan tax aktif.
- Jika ada default active tax, sales document boleh auto-select tax itu.
- Saat tax dipilih, isi snapshot `tax_name`, `tax_code`, `tax_rate`, dan `tax_calculation_mode`.
- `calculateDocumentTotal.ts` harus menghitung tax dari snapshot, bukan membaca master tax saat submit.
- Sales Delivery tetap boleh tanpa harga/tax karena `hasPricing=false` dan `hasTax=false`.
- Quotation, Order, dan Invoice boleh memakai tax sesuai config `hasTax=true`.
- Jangan mengubah `Product.selling_price` ketika document memakai tax.
- Invoice unpaid tidak menulis finance walaupun punya tax amount.
- Invoice paid menulis finance berdasarkan total final invoice, bukan berdasarkan master tax.

## Integrasi Dengan Finance dan Report

Untuk finance/report fase berikutnya:
- Tax amount di report harus dibaca dari snapshot sales document atau transaction, bukan dari master tax terbaru.
- Jangan membuat tax sebagai `FINANCE_CATEGORIES`. Kategori finance tetap menjelaskan jenis transaksi.
- Master tax tidak boleh menaikkan/menurunkan `financeBalance`.
- Jika nanti perlu tax payable/reporting, buat dokumen fase baru. Jangan gabungkan dengan Master Data Taxes fase awal.

## Urutan Implementasi

Kerjakan bertahap agar mudah dicek.

1. Tambah type `TaxRateType`, `TaxCalculationMode`, dan `Tax` di `src/types/index.ts`.
2. Tambah table `taxes` dan schema Dexie versi baru di `src/lib/db.ts`.
3. Buat validasi `src/lib/validations/tax.ts`.
4. Buat helper pure `src/utils/taxes.ts` untuk kalkulasi dan snapshot.
5. Buat `src/services/taxService.ts` untuk create/update/archive/restore/set default + activity log.
6. Buat `src/hooks/useTaxes.tsx`.
7. Buat UI `src/view/master-data/taxes/TaxManagement.tsx`.
8. Pisahkan `TaxFormModal.tsx` dan `TaxTable.tsx` jika file management mulai terlalu besar.
9. Tambah route `src/routes/master-data/taxes.lazy.tsx`.
10. Tambah menu Tax di `src/routes/master-data/index.tsx` dan `src/routes/__root.tsx`.
11. Tambah permission `/master-data/taxes` di `src/auth/routePermissions.ts`.
12. Tambah i18n key di `src/i18n/messages.ts` untuk ID dan EN.
13. Update backup/restore agar `taxes` ikut dibawa.
14. Jalankan lint/build agar `routeTree.gen.ts` ikut sinkron.
15. Setelah tax stabil, update rencana sales document untuk memakai `tax_id` + snapshot tax secara optional.

## Acceptance Criteria

- Route `/master-data/taxes` tersedia dan muncul di group Master Data untuk role yang berhak.
- Tax bisa dibuat, diedit, diarsipkan, dipulihkan, dan diset sebagai default.
- Hanya satu tax aktif yang menjadi default.
- Tax yang diarsipkan tidak muncul sebagai pilihan default untuk dokumen baru.
- Data tax tersimpan di Dexie table `taxes`.
- Mutasi tax melalui service layer dan menulis activity log.
- Backup/restore membawa data tax.
- I18n tersedia untuk bahasa Indonesia dan Inggris.
- Tidak ada fitur e-faktur, tax filing, withholding, fixed tax, atau multi-jurisdiction yang dibuat dari pekerjaan ini.
- Master tax tidak mengubah harga produk, kategori finance, finance balance, atau POS checkout existing.
- Existing POS `/transaction`, produk, unit, promo, finance, dan report tidak berubah perilakunya.

## Manual QA

- Buat tax baru, refresh halaman, pastikan data tetap ada.
- Edit nama/kode/rate/mode, pastikan `updated_at` berubah.
- Set tax sebagai default, pastikan default tax lain otomatis tidak default.
- Coba isi rate negatif atau lebih dari 100, pastikan form menolak.
- Coba isi `effective_to` lebih awal dari `effective_from`, pastikan form menolak.
- Arsipkan tax, pastikan status berubah nonaktif dan tidak hilang dari database.
- Restore tax, pastikan kembali aktif.
- Coba akses sebagai role tanpa `SETTINGS_ACCESS`, pastikan route/menu tidak tersedia.
- Backup database, restore ke data yang sama, pastikan taxes tidak hilang.
- Jalankan `bun run lint` atau `bun run lint`.
- Jalankan `bun run build` atau `bun run build` jika butuh validasi route tree dan typecheck penuh.
