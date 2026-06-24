# Accounting Core - Fase 1 Fondasi Operasional

Fase ini adalah implementasi pertama yang paling cocok untuk kondisi Frayukti saat ini. Tujuannya membuat fondasi Accounting Core yang tetap ringan: `Daftar Akun` sebagai modul Finance, account snapshot ke transaksi finance, default accounting profile, feature gate awal, dan jalur menuju general ledger tanpa memaksa double-entry sekarang.

## Scope

Masuk scope:

- Audit backup/restore finance sebagai data safety gate sebelum table accounting baru dipakai.
- CRUD Daftar Akun di Finance.
- Default COA sederhana untuk toko kecil, basis `SAK_EMKM + RETAIL`.
- Default `accountingProfileSetting` untuk toko retail awal.
- Table `enabledModules` untuk feature gate/module activation awal.
- Kode akun, nama akun, tipe akun, normal balance, parent optional, dan status aktif.
- Mapping category finance ke akun default.
- Snapshot akun optional di `financeTransactions`.
- Backup/restore table finance, COA, mapping, profile setting, dan enabled modules.
- Activity log untuk create/update/archive/restore akun dan update mapping.
- I18n label Indonesia dan English.
- Filter/group ringan di cash-flow berdasarkan account snapshot.

Tidak masuk scope:

- Template multi standar.
- Jurnal umum manual.
- Debit/kredit ledger.
- Buku besar.
- Neraca saldo.
- Laba rugi akuntansi penuh.
- Balance sheet.
- Closing period.
- Rekonsiliasi bank.
- Multi currency.
- Perubahan cara POS mencatat transaksi.
- Perubahan cara Sales Invoice payment mencatat cash-flow, selain penambahan snapshot akun.
- UI module activation yang kompleks.

## Struktur File

Tambahkan file baru:

```txt
src/components/chart-of-accounts/
  ChartOfAccountFormModal.tsx
  ChartOfAccountsTable.tsx
  FinanceAccountMappingPanel.tsx

src/constants/
  accounting.ts
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
  getFinanceAccountSnapshotForCategory.ts
  sortAccountsByCode.ts

src/view/finance/chart-of-accounts/
  ChartOfAccountsManagement.tsx

src/routes/finance/
  chart-of-accounts.lazy.tsx
```

Update file existing:

- `src/types/index.ts`: tambah type/interface COA, accounting profile setting, enabled module, dan optional account snapshot di `FinanceTransaction`.
- `src/lib/db.ts`: tambah table Dexie baru memakai versi berikutnya dari schema live.
- `src/routes/finance/index.tsx`: tambah card `Daftar Akun`.
- `src/routes/__root.tsx`: tambah sidebar child `/finance/chart-of-accounts` di group Finance.
- `src/auth/routePermissions.ts`: tambah route `/finance/chart-of-accounts`.
- `src/i18n/messages.ts`: tambah label menu, form, table, filter, dan feedback.
- `src/services/financeService.ts`: pakai mapping akun saat membuat finance transaction.
- `src/utils/backupRestore.ts`: audit finance table existing, lalu export/import `financeTransactions`, `financeBalance`, `chartOfAccounts`, `financeAccountMappings`, `accountingProfileSetting`, dan `enabledModules`.
- `src/routeTree.gen.ts`: jangan edit manual; biarkan generator/build TanStack Router yang update.

## Data Model

Tambahkan type di `src/types/index.ts`.

```ts
export type AccountingProfileCode =
  | 'SAK_EMKM'
  | 'SAK_EP'
  | 'PSAK_FULL'
  | 'PSAP'
  | 'SAK_ETAP_LEGACY';

export type IndustryExtensionCode =
  | 'NONE'
  | 'RETAIL'
  | 'MANUFACTURING'
  | 'CONSTRUCTION';

export type AccountingModuleCode =
  | 'CHART_OF_ACCOUNTS'
  | 'CASH_FLOW_ACCOUNT_FILTER'
  | 'ACCOUNT_TEMPLATES'
  | 'GENERAL_LEDGER'
  | 'MANUFACTURING'
  | 'CONSTRUCTION'
  | 'PSAP_REPORTING';

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

export interface AccountingProfileSetting {
  id: 'default';
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  template_id?: string;
  locked_after_transaction?: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnabledModule {
  id: string;
  code: AccountingModuleCode;
  is_enabled: boolean;
  source: 'SYSTEM' | 'PROFILE' | 'USER';
  requires_profile?: AccountingProfileCode;
  requires_extension?: IndustryExtensionCode;
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

- Snapshot akun menjaga histori tetap stabil jika nama/kode akun diedit.
- `account_id` tetap disimpan agar laporan bisa group by akun aktif.
- `is_postable=false` dipakai untuk akun header/group, misalnya `1000 Aset Lancar`.
- Transaksi hanya boleh memilih akun `is_postable=true` dan `is_active=true`.
- `is_system=true` dipakai untuk akun seed yang dipakai mapping default.
- `AccountingProfileSetting` fase awal cukup satu row `id='default'` dengan `SAK_EMKM + RETAIL`.
- `EnabledModule` adalah feature gate lokal. Jangan pakai gate untuk mengganti permission; permission tetap lewat auth/role.

## Default COA Awal

Buat `src/constants/chartOfAccounts.ts`.

Default akun awal yang cukup untuk Frayukti:

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

## Default Accounting Profile dan Module Gate

Buat default di `src/constants/accounting.ts`.

Default profile:

```txt
accountingProfileSetting/default
accounting_profile: SAK_EMKM
industry_extension: RETAIL
template_id: default-sak-emkm-retail
locked_after_transaction: false
```

Default enabled modules:

```txt
CHART_OF_ACCOUNTS        true
CASH_FLOW_ACCOUNT_FILTER false
ACCOUNT_TEMPLATES        false
GENERAL_LEDGER           false
MANUFACTURING            false
CONSTRUCTION             false
PSAP_REPORTING           false
```

Aturan gate:

- `CHART_OF_ACCOUNTS` boleh aktif sejak Fase 1.
- `CASH_FLOW_ACCOUNT_FILTER` aktif hanya setelah account snapshot dan UI filter siap.
- `ACCOUNT_TEMPLATES` aktif mulai Fase 2.
- `GENERAL_LEDGER` aktif mulai Fase 4 setelah journal foundation ada.
- `MANUFACTURING`, `CONSTRUCTION`, dan `PSAP_REPORTING` tidak aktif untuk retail default.
- Gate tidak mengganti permission. User tetap harus punya permission route/action yang sesuai.

## Dexie Migration

Schema live saat dokumen ini dibuat sudah sampai `version(18)`. Gunakan versi berikutnya yang tersedia saat implementasi.

Contoh jika masih `version(18)`:

```ts
this.version(19).stores({
  financeTransactions: 'id, type, category, account_id, created_at, reference_id',
  chartOfAccounts: 'id, code, name, type, parent_id, is_postable, is_system, is_active, created_at',
  financeAccountMappings: 'id, key, category, account_id, created_at',
  accountingProfileSetting: 'id, accounting_profile, industry_extension, updated_at',
  enabledModules: 'id, code, is_enabled, source, updated_at'
}).upgrade(async (tx) => {
  // Seed default accounts, mappings, profile setting, and module gates here.
});
```

Tambahkan table property:

```ts
chartOfAccounts!: Table<ChartOfAccount>;
financeAccountMappings!: Table<FinanceAccountMapping>;
accountingProfileSetting!: Table<AccountingProfileSetting>;
enabledModules!: Table<EnabledModule>;
```

Aturan migration:

- Jangan menambah table baru ke `version(1)`.
- Jangan mengubah schema lama secara retroaktif.
- Jika sudah ada migrasi baru setelah `version(18)`, pakai nomor berikutnya.
- Seed default akun hanya jika table `chartOfAccounts` masih kosong.
- Seed `accountingProfileSetting/default` jika belum ada.
- Seed `enabledModules` jika table masih kosong.
- Migration boleh mengisi snapshot akun untuk `financeTransactions` existing berdasarkan category, tetapi jangan mengubah `amount`, `type`, `category`, `reference_id`, atau `created_at`.
- Jika category existing belum punya mapping, biarkan `account_id` kosong dan tampilkan sebagai `Belum Dipetakan` di UI/report.

## Validation

Buat `src/lib/validations/chartOfAccount.ts` memakai Zod seperti pattern master data lain.

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

## Service Layer

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
export const getAccountingProfileSetting = async () => {};
export const isAccountingModuleEnabled = async (code: AccountingModuleCode) => {};
export const updateEnabledModule = async (code: AccountingModuleCode, isEnabled: boolean) => {};
```

Aturan service:

- Ambil user dengan `getCurrentSessionUser()`.
- Guard semua mutasi memakai `requireRolePermission(currentUser?.role, 'FINANCE_ACCESS')`.
- Normalisasi `code` dengan `trim().toUpperCase()`.
- Normalisasi `name` dan `description` dengan `trim()`.
- Cek duplicate `code` di akun aktif lain.
- Hitung `normal_balance` dari `type`, jangan percaya input form.
- Saat memilih parent, simpan snapshot `parent_code` dan `parent_name`.
- Default profile setting dibuat/diambil lewat service helper, bukan diulang di komponen.
- Mutasi enabled module harus lewat service dan activity log.
- Archive berarti `is_active=false`, bukan hard delete.
- Tolak archive jika akun masih dipakai mapping aktif.
- Jika akun sudah dipakai `financeTransactions`, archive tetap boleh selama mapping aktif sudah dipindah.
- Tulis `activityLogs` untuk create/update/archive/restore/mapping update.

Activity log action yang disarankan:

```txt
CHART_OF_ACCOUNT_CREATED
CHART_OF_ACCOUNT_UPDATED
CHART_OF_ACCOUNT_ARCHIVED
CHART_OF_ACCOUNT_RESTORED
FINANCE_ACCOUNT_MAPPING_UPDATED
ACCOUNTING_PROFILE_SETTING_UPDATED
ACCOUNTING_MODULE_ENABLED
ACCOUNTING_MODULE_DISABLED
```

## Hook

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

## UI Daftar Akun

Route:

```txt
/finance/chart-of-accounts
```

File route:

```ts
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

## Wiring Menu dan Permission

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

Untuk fase awal jangan tambah permission baru seperti `CHART_OF_ACCOUNTS_MANAGE`.

## Mapping Category Finance

Tambahkan mapping default dari `FINANCE_CATEGORIES` ke akun.

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

- Karena fase awal belum double-entry, mapping di `financeTransactions` mengikuti sudut pandang cash-flow.
- Untuk invoice payment, default ke kas/bank. Revenue Sales Invoice tetap dihitung dari `salesDocuments`/report sales document.
- Jika ingin lebih aman, simpan `cash_account_id` nanti di payment ledger Accounts Receivable.
- Jangan membuat jurnal debit/kredit hanya demi menyelesaikan dilema mapping invoice payment.

## Integrasi Finance Transaction

Update `addFinanceTransaction()` di `src/services/financeService.ts`:

- Perlakukan `financeTransactions` sebagai operational cash-flow layer, bukan accounting ledger.
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

## Backup dan Restore

Update `src/utils/backupRestore.ts`:

- Audit dulu table finance live yang sudah ada di `src/lib/db.ts`.
- Pastikan `financeTransactions` ikut export/import.
- Pastikan `financeBalance` ikut export/import.
- Export `chartOfAccounts`.
- Export `financeAccountMappings`.
- Export `accountingProfileSetting`.
- Export `enabledModules`.
- Tambahkan semua table finance/accounting di atas ke `expectedKeys`.
- Tambahkan semua table finance/accounting di atas ke daftar `tables`.
- Clear dan bulkAdd saat restore.
- Naikkan `version` payload backup.

Temuan audit saat dokumen ini diperbarui:

- `src/lib/db.ts` sudah punya `financeTransactions` dan `financeBalance`.
- `src/utils/backupRestore.ts` saat ini belum memasukkan `financeTransactions` dan `financeBalance` ke payload backup, `expectedKeys`, daftar transaction tables, clear, atau bulkAdd.
- Ini prioritas data safety karena cash-flow operasional bisa hilang saat user restore dari backup.

Saat menyentuh backup/restore, jangan diam-diam mengubah kontrak backup besar tanpa catatan, tetapi jangan lupa semua table finance/accounting wajib masuk backup sejak fase pertamanya.

## Report Ringan

Setelah snapshot akun masuk ke `financeTransactions`, tambahkan kemampuan ringan:

- Filter finance cash-flow by akun.
- Group summary by account type.
- Kolom akun di table cash-flow.
- Badge `Belum Dipetakan` untuk transaksi tanpa akun.
- Ringkasan mapping yang belum lengkap.

Jangan langsung membuat buku besar. Laporan awal cukup membantu user melihat transaksi finance menurut akun.

## Checklist Implementasi

1. Audit `src/utils/backupRestore.ts` terhadap table finance live di `src/lib/db.ts`.
2. Tambah type COA, mapping, `AccountingProfileSetting`, dan `EnabledModule` di `src/types/index.ts`.
3. Tambah `src/constants/accounting.ts`.
4. Tambah `src/constants/chartOfAccounts.ts`.
5. Tambah validation `src/lib/validations/chartOfAccount.ts`.
6. Tambah Dexie `version(19)` atau versi berikutnya di `src/lib/db.ts`.
7. Tambah table property `chartOfAccounts`, `financeAccountMappings`, `accountingProfileSetting`, dan `enabledModules`.
8. Seed default COA, mapping, profile setting, dan enabled modules jika table masih kosong.
9. Tambah `src/services/chartOfAccountService.ts`.
10. Tambah `src/hooks/useChartOfAccounts.tsx`.
11. Tambah util tree/sort/normal balance/account snapshot.
12. Tambah UI `src/view/finance/chart-of-accounts/ChartOfAccountsManagement.tsx`.
13. Tambah components table/form/mapping panel.
14. Tambah route `src/routes/finance/chart-of-accounts.lazy.tsx`.
15. Tambah Finance landing card di `src/routes/finance/index.tsx`.
16. Tambah sidebar child di `src/routes/__root.tsx`.
17. Tambah route permission `/finance/chart-of-accounts`.
18. Tambah i18n messages Indonesia dan English.
19. Update `financeService.ts` agar transaksi baru mendapat account snapshot dari mapping.
20. Update `recalculateFinance()` agar transaksi auto hasil replay juga mendapat account snapshot.
21. Update `backupRestore.ts` untuk finance table existing dan table accounting baru.
22. Tambah filter/kolom akun ringan di cash-flow jika scope UI memungkinkan.
23. Jalankan build agar TanStack route tree sinkron.

## Acceptance Criteria

- Menu `Keuangan > Daftar Akun` muncul untuk role dengan `FINANCE_ACCESS`.
- Kasir dan Gudang tidak melihat menu COA.
- User bisa tambah, edit, arsip, dan restore akun.
- Duplicate kode akun aktif ditolak.
- Akun archived tidak bisa dipilih untuk mapping baru.
- Mapping category finance bisa diubah dari UI.
- Transaksi finance baru menyimpan snapshot akun jika category punya mapping.
- Transaksi finance lama tetap tampil walaupun belum punya akun.
- Cash-flow tetap menghitung saldo seperti sebelumnya.
- `accountingProfileSetting/default` tersedia dengan `SAK_EMKM + RETAIL`.
- `enabledModules` tersedia dan extension lanjut default nonaktif.
- Backup membawa `financeTransactions`, `financeBalance`, COA, mapping, profile setting, dan enabled modules.
- Restore mengembalikan `financeTransactions`, `financeBalance`, COA, mapping, profile setting, dan enabled modules.
- POS checkout tetap berjalan seperti sebelumnya.
- Finance > Sales dan Sales Return tetap berjalan seperti sebelumnya.
- `src/routeTree.gen.ts` tidak diedit manual.

## Validasi Teknis

Minimal setelah implementasi:

```txt
bun run build
bun run lint
```

Prioritas test untuk COA:

- `getAccountNormalBalance`.
- `sortAccountsByCode`.
- `buildAccountTree`.
- validation duplicate/parent/type.
- mapping category finance ke account snapshot.
