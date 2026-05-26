# Chart of Accounts (COA) - Tahapan Implementasi

Dokumen ini adalah panduan implementasi Chart of Accounts untuk project Kasirku. Targetnya: daftar akun akuntansi masuk sebagai modul Finance, bisa dipakai untuk memberi konteks akun pada transaksi finance yang sudah ada, dan tetap membuka jalan ke jurnal umum nanti tanpa memaksa full double-entry di fase awal.

## Keputusan Utama

- COA masuk ke menu `Keuangan`, bukan `Master Data` dan bukan `Settings`.
- Label menu yang disarankan: `Daftar Akun`.
- Route yang disarankan: `/finance/chart-of-accounts`.
- Permission fase awal cukup memakai `FINANCE_ACCESS`.
- Fase awal tidak mengganti cash-flow engine yang sekarang masih category-based.
- Fase awal tidak membuat jurnal umum, buku besar, neraca, atau double-entry posting.
- COA dipakai dulu sebagai katalog akun dan mapping category finance.
- `financeTransactions` tetap menjadi sumber cash-flow yang sudah ada.
- POS `/transaction` dan Finance > Sales `/finance/sales` tidak boleh berubah perilaku karena COA.

## Audit Kondisi Project Saat Ini

Yang sudah ada:
- Finance sudah menjadi parent route di `src/routes/finance/index.tsx`.
- Child Finance yang sudah ada: `/finance/cash-flow` dan `/finance/sales`.
- Sidebar Finance group sudah ada di `src/routes/__root.tsx`.
- Route permission Finance memakai `FINANCE_ACCESS` di `src/auth/routePermissions.ts`.
- `FinanceTransaction` saat ini menyimpan `type`, `category`, `amount`, `description`, `created_at`, dan `reference_id`.
- `src/constants/finance.ts` sudah menjadi pusat category cash flow seperti `PENJUALAN`, `PEMBELIAN_STOK`, `PEMBAYARAN_INVOICE_PENJUALAN`, dan `REFUND_PENJUALAN`.
- `src/services/financeService.ts` masih menghitung saldo dari category dan type transaksi.
- Schema Dexie live sudah sampai `version(18)` untuk `salesReturns` dan `salesReturnItems`.
- Pattern mutasi data penting di repo ini: service layer + permission guard + activity log.

Yang belum ada:
- Table `chartOfAccounts`.
- Mapping category finance ke akun akuntansi.
- Snapshot akun di `financeTransactions`.
- UI Daftar Akun.
- Report yang bisa difilter/group by akun.
- Jurnal debit/kredit.

Kesimpulan: implementasi COA sebaiknya dimulai dari master akun dan mapping ringan. Jangan langsung mengubah semua arus kas menjadi jurnal double-entry.

## Batasan Scope Awal

Masuk scope:
- CRUD Daftar Akun di Finance.
- Default COA sederhana untuk toko kecil.
- Kode akun, nama akun, tipe akun, normal balance, parent optional, dan status aktif.
- Mapping category finance ke akun default.
- Optional snapshot akun di `financeTransactions`.
- Backup/restore table COA dan mapping.
- Activity log untuk create/update/archive/restore akun.
- I18n label Indonesia dan English.

Tidak masuk scope:
- Jurnal umum manual.
- Debit/kredit ledger.
- Buku besar.
- Neraca.
- Laba rugi akuntansi penuh.
- Closing period.
- Rekonsiliasi bank.
- Multi currency.
- Perubahan cara POS mencatat transaksi.
- Perubahan cara Sales Invoice payment mencatat cash-flow, selain penambahan snapshot akun.

## Struktur File Yang Disarankan

Tambahkan file baru:

```txt
src/components/chart-of-accounts/
  ChartOfAccountFormModal.tsx
  ChartOfAccountsTable.tsx
  FinanceAccountMappingPanel.tsx

src/constants/
  chartOfAccounts.ts

src/hooks/
  useChartOfAccounts.tsx

src/lib/validations/
  chartOfAccount.ts

src/services/
  chartOfAccountService.ts

src/utils/chartOfAccounts/
  buildAccountTree.ts
  getAccountNormalBalance.ts
  sortAccountsByCode.ts

src/view/finance/chart-of-accounts/
  ChartOfAccountsManagement.tsx

src/routes/finance/
  chart-of-accounts.lazy.tsx
```

Update file existing:
- `src/types/index.ts`: tambah type/interface COA dan optional account snapshot di `FinanceTransaction`.
- `src/lib/db.ts`: tambah table Dexie baru memakai versi berikutnya dari schema live.
- `src/routes/finance/index.tsx`: tambah card `Daftar Akun`.
- `src/routes/__root.tsx`: tambah sidebar child `/finance/chart-of-accounts` di group Finance.
- `src/auth/routePermissions.ts`: tambah route `/finance/chart-of-accounts`.
- `src/i18n/messages.ts`: tambah label menu, form, table, filter, dan feedback.
- `src/services/financeService.ts`: pakai mapping akun saat membuat finance transaction.
- `src/utils/backupRestore.ts`: export/import `chartOfAccounts` dan `financeAccountMappings`.
- `src/routeTree.gen.ts`: jangan edit manual; biarkan generator/build TanStack Router yang update.

## Fase 1 - Data Model dan Schema

Tambahkan type di `src/types/index.ts`.

```ts
export type AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'CONTRA_REVENUE'
  | 'EXPENSE';

export type AccountNormalBalance = 'DEBIT' | 'CREDIT';

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normal_balance: AccountNormalBalance;
  parent_id?: string;
  parent_code?: string;
  parent_name?: string;
  is_postable: boolean;
  is_system: boolean;
  is_active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface FinanceAccountMapping {
  id: string;
  key: string;
  category?: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}
```

Tambahkan snapshot optional di `FinanceTransaction`:

```ts
export interface FinanceTransaction {
  id: string;
  type: FinanceTransactionType;
  category: string;
  amount: number;
  description: string;
  created_at: string;
  reference_id?: string;
  account_id?: string;
  account_code?: string;
  account_name?: string;
  account_type?: AccountType;
}
```

Catatan:
- Snapshot akun di transaksi menjaga histori tetap stabil jika nama/kode akun diedit.
- `account_id` tetap disimpan agar laporan bisa group by akun aktif.
- `is_postable=false` dipakai untuk akun header/group, misalnya `1000 Aset Lancar`.
- Transaksi hanya boleh memilih akun `is_postable=true` dan `is_active=true`.
- `is_system=true` dipakai untuk akun seed yang dipakai mapping default.

## Fase 2 - Default COA

Buat `src/constants/chartOfAccounts.ts`.

Default akun awal yang cukup untuk Kasirku:

```txt
1000 Kas dan Bank                 ASSET
1010 Kas Tunai                    ASSET
1020 Bank / Non Tunai             ASSET
1100 Piutang Usaha                ASSET
1200 Persediaan Barang            ASSET
2000 Hutang Usaha                 LIABILITY
3000 Modal Pemilik                EQUITY
4000 Penjualan POS                REVENUE
4010 Pendapatan Sales Invoice     REVENUE
4020 Retur Penjualan              CONTRA_REVENUE
5000 HPP                          EXPENSE
5100 Pembelian Stok               EXPENSE
6100 Beban Operasional            EXPENSE
6900 Beban Lainnya                EXPENSE
```

Aturan default:
- Gunakan id stabil seperti `cash`, `bank`, `accounts-receivable`, `sales-pos`, bukan random id untuk akun seed.
- User boleh edit nama akun seed jika perlu.
- Hati-hati mengizinkan edit kode akun seed yang sudah dipakai transaksi. Jika diizinkan, transaksi lama tetap aman karena punya snapshot.
- Jangan seed akun terlalu banyak. Fase awal lebih baik kecil dan mudah dipahami.

Normal balance:

```txt
ASSET           DEBIT
EXPENSE         DEBIT
CONTRA_REVENUE  DEBIT
LIABILITY       CREDIT
EQUITY          CREDIT
REVENUE         CREDIT
```

## Fase 3 - Dexie Migration

Schema live saat dokumen ini dibuat sudah sampai `version(18)`. Gunakan versi berikutnya yang tersedia saat implementasi.

Contoh jika masih `version(18)`:

```ts
this.version(19).stores({
  financeTransactions: 'id, type, category, account_id, created_at, reference_id',
  chartOfAccounts: 'id, code, name, type, parent_id, is_postable, is_system, is_active, created_at',
  financeAccountMappings: 'id, key, category, account_id, created_at'
}).upgrade(async (tx) => {
  // Seed default accounts and mappings here.
});
```

Tambahkan table property:

```ts
chartOfAccounts!: Table<ChartOfAccount>;
financeAccountMappings!: Table<FinanceAccountMapping>;
```

Aturan migration:
- Jangan menambah table baru ke `version(1)`.
- Jangan mengubah schema lama secara retroaktif.
- Jika sudah ada migrasi baru setelah `version(18)`, pakai nomor berikutnya.
- Seed default akun hanya jika table `chartOfAccounts` masih kosong.
- Migration boleh mengisi snapshot akun untuk `financeTransactions` existing berdasarkan category, tetapi jangan mengubah `amount`, `type`, `category`, `reference_id`, atau `created_at`.
- Jika category existing belum punya mapping, biarkan `account_id` kosong dan tampilkan sebagai `Belum Dipetakan` di UI/report.

## Fase 4 - Validation

Buat `src/lib/validations/chartOfAccount.ts` memakai Zod seperti pattern `projectSchema`.

Validasi minimal:
- `code` wajib, trim, maksimal 30 karakter.
- `code` hanya boleh huruf, angka, titik, dash, atau underscore.
- `name` wajib, trim, maksimal 120 karakter.
- `type` wajib dari enum `AccountType`.
- `normal_balance` harus sesuai `type`.
- `parent_id` optional.
- Parent tidak boleh dirinya sendiri.
- Parent account harus aktif.
- Jika memakai parent, sebaiknya parent punya `type` yang sama.
- `is_postable` boolean.
- `is_active` boolean.
- `description` optional.

Pesan validasi pakai Bahasa Indonesia di schema, mengikuti validasi master data yang sudah ada.

## Fase 5 - Service Layer

Buat `src/services/chartOfAccountService.ts`.

Kontrak minimal:

```ts
export interface ChartOfAccountUpsertInput {
  code: string;
  name: string;
  type: AccountType;
  parent_id?: string;
  is_postable?: boolean;
  is_active?: boolean;
  description?: string;
}

export const createChartOfAccount = async (input: ChartOfAccountUpsertInput) => {};
export const updateChartOfAccount = async (id: string, input: ChartOfAccountUpsertInput) => {};
export const archiveChartOfAccount = async (id: string) => {};
export const restoreChartOfAccount = async (id: string) => {};
export const updateFinanceAccountMapping = async (key: string, accountId: string) => {};
```

Aturan service:
- Ambil user dengan `getCurrentSessionUser()`.
- Guard semua mutasi memakai `requireRolePermission(currentUser?.role, 'FINANCE_ACCESS')`.
- Normalisasi `code` dengan `trim().toUpperCase()`.
- Normalisasi `name` dan `description` dengan `trim()`.
- Cek duplicate `code` di akun aktif lain.
- Hitung `normal_balance` dari `type`, jangan percaya input form.
- Saat memilih parent, simpan snapshot `parent_code` dan `parent_name`.
- Archive berarti `is_active=false`, bukan hard delete.
- Tolak archive jika akun masih dipakai mapping aktif.
- Jika akun sudah dipakai `financeTransactions`, archive tetap boleh selama mapping aktif sudah dipindah. Transaksi lama aman karena menyimpan snapshot akun.
- Tulis `activityLogs` untuk create/update/archive/restore/mapping update.

Activity log action yang disarankan:

```txt
CHART_OF_ACCOUNT_CREATED
CHART_OF_ACCOUNT_UPDATED
CHART_OF_ACCOUNT_ARCHIVED
CHART_OF_ACCOUNT_RESTORED
FINANCE_ACCOUNT_MAPPING_UPDATED
```

## Fase 6 - Hook

Buat `src/hooks/useChartOfAccounts.tsx`.

Tanggung jawab hook:
- Query `chartOfAccounts` dengan `useLiveQuery`.
- Query `financeAccountMappings` dengan `useLiveQuery`.
- Filter search, type, active/inactive.
- Build tree/list display dari util `buildAccountTree`.
- Mutation memanggil service, bukan menulis Dexie langsung.
- Invalidate query React Query jika nanti ada query key terkait finance report.
- Menyediakan state modal edit dan mapping panel.

Jangan taruh business rule archive, duplicate code, atau permission di hook.

## Fase 7 - UI Daftar Akun

Route:

```txt
/finance/chart-of-accounts
```

File route:

```ts
// src/routes/finance/chart-of-accounts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router';
import ChartOfAccountsManagement from '@/view/finance/chart-of-accounts/ChartOfAccountsManagement';

export const Route = createLazyFileRoute('/finance/chart-of-accounts')({
  component: ChartOfAccountsManagement,
});
```

UI minimal:
- Header `Daftar Akun`.
- Button tambah akun.
- Search by kode/nama.
- Filter tipe akun.
- Filter aktif/arsip.
- Table kolom: Kode, Nama, Tipe, Normal Balance, Parent, Status, Aksi.
- Aksi: edit, arsip, restore.
- Badge untuk `System` dan `Header`.
- Mapping panel untuk category finance ke akun.

Pola UI:
- Gunakan AntD untuk form/table/modal seperti master data existing.
- Gunakan icon button untuk aksi table.
- Jangan buat route ini di `src/routes/master-data`.
- Jangan letakkan UI utama langsung di file route; route hanya import view.

## Fase 8 - Wiring Menu dan Permission

Update `src/routes/__root.tsx`:
- Import icon yang sesuai, misalnya `ListTree` atau `BookOpen`.
- Tambah child di finance group:

```ts
{ to: '/finance/chart-of-accounts', label: t('nav.finance.chartOfAccounts'), icon: ListTree }
```

Update `src/routes/finance/index.tsx`:
- Tambah card `Daftar Akun`.
- Deskripsi contoh: `Kelola daftar akun dan mapping kategori finance`.

Update `src/auth/routePermissions.ts`:

```ts
'/finance/chart-of-accounts': 'FINANCE_ACCESS',
```

Untuk fase awal jangan tambah permission baru seperti `CHART_OF_ACCOUNTS_MANAGE`. Role saat ini sudah sederhana: Owner/Admin punya `FINANCE_ACCESS`, Kasir/Gudang tidak.

## Fase 9 - Mapping Category Finance

Tambahkan mapping default dari `FINANCE_CATEGORIES` ke akun.

Contoh arah mapping:

```txt
PENJUALAN                         -> 4000 Penjualan POS
PEMBAYARAN_INVOICE_PENJUALAN      -> 1010/1020 Kas/Bank
REFUND_PENJUALAN                  -> 4020 Retur Penjualan
PEMBELIAN_STOK                    -> 5100 Pembelian Stok
HPP_OTOMATIS                      -> 5000 HPP
OPERASIONAL                       -> 6100 Beban Operasional
LAINNYA                           -> 6900 Beban Lainnya
SALDO_AWAL                        -> 1000 Kas dan Bank
TAMBAHAN_MODAL                    -> 3000 Modal Pemilik
PINJAMAN                          -> 2000 Hutang Usaha
```

Catatan penting:
- Karena fase awal belum double-entry, mapping di `financeTransactions` sebaiknya mengikuti sudut pandang cash-flow. Untuk invoice payment, default ke kas/bank. Revenue Sales Invoice tetap dihitung dari `salesDocuments`/report sales document, bukan dipaksa dari transaksi pembayaran.
- Jika ingin aman, simpan mapping category default ke akun utama, dan tambahkan `payment_channel` atau `cash_account_id` nanti di payment ledger untuk kas/bank.
- Jangan membuat jurnal debit/kredit hanya demi menyelesaikan dilema mapping ini.

## Fase 10 - Integrasi Finance Transaction

Update `addFinanceTransaction()` di `src/services/financeService.ts`:
- Cari mapping account berdasarkan `category`.
- Jika mapping ditemukan, snapshot `account_id`, `account_code`, `account_name`, dan `account_type`.
- Jika tidak ada mapping, transaksi tetap boleh dibuat pada fase awal.
- Jangan mengubah perhitungan `financeBalance`.
- Jangan mengubah perhitungan `profitBalance`.

Update `recalculateFinance()`:
- Saat membuat ulang transaksi otomatis POS dan stock purchase, isi snapshot akun dari mapping.
- Jangan hapus transaksi category baru tanpa replay yang jelas.
- Tetap hati-hati dengan `SALES_INVOICE_PAYMENT` dan `SALES_REFUND`, karena dua category ini dibuat oleh module lain.

Aturan teknis:
- Buat helper kecil seperti `getFinanceAccountSnapshotForCategory(category)`.
- Helper boleh berada di `chartOfAccountService.ts` atau `src/utils/chartOfAccounts`.
- Hindari circular import antara finance service dan module sales/return.

## Fase 11 - Backup dan Restore

Update `src/utils/backupRestore.ts`:
- Export `chartOfAccounts`.
- Export `financeAccountMappings`.
- Tambah keduanya ke `expectedKeys`.
- Tambah keduanya ke daftar `tables`.
- Clear dan bulkAdd saat restore.
- Naikkan `version` payload backup.

Saat menyentuh backup/restore, audit dulu apakah table finance lain memang sudah ikut backup di versi live. Jangan diam-diam mengubah kontrak backup besar tanpa catatan, tetapi jangan lupa COA dan mapping wajib masuk backup sejak awal.

## Fase 12 - Report Ringan

Setelah snapshot akun masuk ke `financeTransactions`, tambahkan kemampuan ringan:
- Filter finance cash-flow by akun.
- Group summary by account type.
- Kolom akun di table cash-flow.
- Badge `Belum Dipetakan` untuk transaksi tanpa akun.

Jangan langsung membuat buku besar. Laporan awal cukup membantu user melihat transaksi finance menurut akun.

## Fase 13 - Integrasi Piutang, Sales Return, dan Future AP

Integrasi bertahap:
- Accounts Receivable: invoice payment bisa menyimpan `cash_account_id` atau `account_id` di payment ledger.
- Sales Return refund: mapping `SALES_REFUND` ke akun retur/refund.
- Stock purchase: mapping `STOCK_PURCHASE` ke akun pembelian stok atau persediaan sesuai fase accounting yang dipilih.
- Accounts Payable nanti bisa memakai `2000 Hutang Usaha`.

Jangan refactor modul Sales Return dan Accounts Receivable bersamaan dengan CRUD COA jika tidak diminta. Cukup siapkan field/mapping yang tidak memaksa flow mereka berubah.

## Fase 14 - Jalan ke Full Accounting Nanti

Jika produk benar-benar butuh full accounting, buat fase terpisah:
- `journalEntries`
- `journalEntryLines`
- posting debit/kredit dari source document
- buku besar
- neraca saldo
- laporan laba rugi
- balance sheet
- closing period

Saat fase itu datang, `chartOfAccounts` dari dokumen ini tetap bisa dipakai. `financeTransactions` bisa tetap menjadi cash-flow view, sedangkan jurnal menjadi accounting ledger.

## Checklist Implementasi

1. Tambah type COA dan mapping di `src/types/index.ts`.
2. Tambah `src/constants/chartOfAccounts.ts`.
3. Tambah validation `src/lib/validations/chartOfAccount.ts`.
4. Tambah Dexie `version(19)` atau versi berikutnya di `src/lib/db.ts`.
5. Tambah table property `chartOfAccounts` dan `financeAccountMappings`.
6. Seed default COA dan mapping jika table masih kosong.
7. Tambah `src/services/chartOfAccountService.ts`.
8. Tambah `src/hooks/useChartOfAccounts.tsx`.
9. Tambah util tree/sort/normal balance.
10. Tambah UI `src/view/finance/chart-of-accounts/ChartOfAccountsManagement.tsx`.
11. Tambah components table/form/mapping panel.
12. Tambah route `src/routes/finance/chart-of-accounts.lazy.tsx`.
13. Tambah Finance landing card di `src/routes/finance/index.tsx`.
14. Tambah sidebar child di `src/routes/__root.tsx`.
15. Tambah route permission `/finance/chart-of-accounts`.
16. Tambah i18n messages Indonesia dan English.
17. Update `financeService.ts` agar transaksi baru mendapat account snapshot dari mapping.
18. Update `recalculateFinance()` agar transaksi auto hasil replay juga mendapat account snapshot.
19. Update `backupRestore.ts`.
20. Jalankan build agar TanStack route tree sinkron.

## Acceptance Criteria

- Menu `Keuangan > Daftar Akun` muncul untuk role dengan `FINANCE_ACCESS`.
- Kasir dan Gudang tidak melihat menu COA.
- User bisa tambah, edit, arsip, dan restore akun.
- Duplicate kode akun aktif ditolak.
- Akun archived tidak bisa dipilih untuk mapping baru.
- Mapping category finance bisa diubah dari UI.
- Transaksi finance baru menyimpan snapshot akun jika category punya mapping.
- Transaksi finance lama tetap tampil walaupun belum punya akun.
- Backup membawa COA dan mapping.
- Restore mengembalikan COA dan mapping.
- POS checkout tetap berjalan seperti sebelumnya.
- Finance > Sales dan Sales Return tetap berjalan seperti sebelumnya.
- `src/routeTree.gen.ts` tidak diedit manual.

## Validasi Teknis

Minimal setelah implementasi:

```txt
bun run build
bun run lint
```

Jika menambah test runner atau sudah ada runner lokal yang aktif:

```txt
bun test
```

Prioritas test untuk COA:
- `getAccountNormalBalance`.
- `sortAccountsByCode`.
- `buildAccountTree`.
- validation duplicate/parent/type.
- mapping category finance ke account snapshot.

Saat dokumen ini dibuat, `package.json` hanya menyediakan `dev`, `build`, `lint`, `preview`, dan `tauri`. Jangan klaim unit test lulus jika test runner belum tersedia.
