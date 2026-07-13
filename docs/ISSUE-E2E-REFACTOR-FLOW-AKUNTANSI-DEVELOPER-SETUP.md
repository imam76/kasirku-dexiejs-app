# Issue: E2E Refactor Flow Akuntansi Awal di Developer Setup

Tanggal catatan: 2026-07-13

## Ringkasan

Developer setup saat ini berhenti di pemilihan module/fitur. Setelah itu,
setup akuntansi tersebar di beberapa tempat:

- `SetupKeyDrawer` memilih module dan menyimpan `app_setup_config`.
- `AccountingDateSettingsCard` di `/settings` menyimpan cutoff dan periode
  rujukan.
- `ChartOfAccountsManagement` menerapkan template COA dan accounting profile.
- `OpeningBalanceForm` di `/finance/general-ledger/setup` mem-posting saldo awal.
- `CurrencyManagement` mengelola mata uang, tetapi base currency masih sangat
  IDR-centric di banyak helper dan UI.

Flow ini perlu dirapikan menjadi satu alur awal setelah developer memilih fitur:

1. pilih jenis bisnis yang otomatis menentukan profile/standard dan template
   akuntansi;
2. tentukan tanggal cutoff;
3. tentukan periode awal, periode akhir, dan periode berjalan;
4. pilih base mata uang;
5. simpan ke Dexie, upload ke PostgreSQL, dan refresh realtime seperti pola
   sync saat ini.

## Tujuan

- Developer bisa menyelesaikan setup akuntansi awal dari `Developer Setup`
  setelah memilih fitur.
- Template bisnis menjadi keputusan awal, bukan baru dicari di halaman COA.
- Cutoff, periode fiskal, periode berjalan, dan base currency menjadi state
  bersama yang konsisten antar device.
- Flow setup tetap offline-first: tulis ke Dexie lebih dulu, beri
  `sync_status: 'pending'`, enqueue ke `syncQueue`, lalu merge balik dari
  PostgreSQL.
- Realtime PostgreSQL tetap memakai `kasirku_data_changes` dan listener
  `postgres-data-change` yang sudah ada.
- Flow lama di `/settings`, `/finance/chart-of-accounts`, dan
  `/finance/general-ledger/setup` tetap bisa dipakai untuk maintenance, tetapi
  bukan satu-satunya cara menyiapkan accounting baseline.

## Non-Goal

- Tidak otomatis mem-posting opening balance tanpa review user.
- Tidak mengubah transaksi historis sebelum cutoff menjadi jurnal secara diam-diam.
- Tidak mengklaim compliance PSAK/PSAP penuh hanya karena template dipilih.
- Tidak memaksa semua bisnis memakai General Ledger. Jika module accounting tidak
  dipilih, wizard boleh menyimpan default minimum atau dilewati dengan warning.

## Kondisi Saat Ini

### Developer setup

File utama:

- `src/view/auth/SetupKeyDrawer.tsx`
- `src/services/setupKeyService.ts`
- `src/types/setup.ts`
- `src/constants/setupModules.ts`
- `src-tauri/migrations/0036_app_setup_config.sql`
- `src-tauri/src/repositories/app_setup_config_repository.rs`

Catatan:

- `SetupConfig` hanya berisi `enabledModules`, `configuredAt`,
  `configuredBy`, dan `moduleCatalogVersion`.
- Config disimpan ke localStorage dan PostgreSQL melalui
  `saveSetupConfigToRemote`.
- `app_setup_config` belum terlihat punya realtime trigger di migrasi existing,
  jadi perubahan setup module tidak otomatis ikut event realtime seperti tabel
  finance/accounting lain.

### Template akuntansi dan COA

File utama:

- `src/constants/accounting.ts`
- `src/constants/chartOfAccounts.ts`
- `src/services/chartOfAccountService.ts`
- `src/components/chart-of-accounts/FinanceAccountMappingPanel.tsx`

Yang sudah ada:

- `SAK_EMKM + RETAIL` dengan `SAK_EMKM_RETAIL_TEMPLATE`.
- `SAK_ETAP + COOPERATIVE` dengan `SAK_ETAP_KOPERASI_TEMPLATE`.
- Preview/nonaktif untuk manufacturing, construction, dan PSAP.
- `applyChartOfAccountTemplate` sudah menulis:
  - `chartOfAccounts`;
  - `financeAccountMappings`;
  - `accountingProfileSetting`;
  - `enabledModules`;
  - activity log;
  - sync queue untuk record yang berubah.

Gap:

- Belum ada pilihan bisnis level setup seperti `Ritel`, `Koperasi`,
  `Perdagangan Umum`, dan `Jasa Umum`.
- `IndustryExtensionCode` belum punya `GENERAL_TRADING` atau `GENERAL_SERVICE`.
- Template bisnis, accounting standard, dan template COA masih bisa terasa
  seperti field terpisah di UX, padahal user cukup memilih jenis bisnis.

### Cutoff dan periode

File utama:

- `src/components/AccountingDateSettingsCard.tsx`
- `src/services/accountingReferenceSettingService.ts`
- `src/services/accountingPeriodService.ts`
- `src/services/accountingPeriodReadService.ts`
- `src-tauri/migrations/0047_accounting_periods.sql`

Yang sudah ada:

- `generalLedgerSetting.cutoff_date`.
- `generalLedgerSetting.inventory_policy`.
- `accountingPeriods` dengan `MONTHLY` dan `YEARLY`.
- `saveAccountingReferenceSetting` membuat/memakai periode tahunan rujukan.
- Accounting period sudah masuk sync queue, Postgres adapter, read refresh, dan
  realtime trigger.

Gap:

- Belum ada konsep eksplisit `periode berjalan` yang disimpan sebagai state
  setup.
- Service periode saat ini mencegah overlap antar periode, sehingga model
  `YEARLY` + `MONTHLY` dalam rentang yang sama belum aman tanpa refactor.
- Cutoff dan period setup masih berada di Settings biasa, bukan wizard awal.

### Base currency

File utama:

- `src/constants/currencies.ts`
- `src/services/currencyService.ts`
- `src/services/currencyReadService.ts`
- `src/utils/documentCurrency.ts`
- `src/components/DocumentCurrencyFields.tsx`
- `src/view/master-data/currencies/*`
- `src-tauri/migrations/0011_currencies_and_document_fx.sql`

Yang sudah ada:

- Tabel `currencies` dan `currencyRates`.
- `Currency.is_base`.
- Remote adapter, read refresh, sync queue, dan realtime trigger untuk currencies.

Gap:

- `BASE_CURRENCY_CODE` masih hardcoded `IDR`.
- Banyak UI dan report masih hardcoded `Rp`.
- `refreshCurrencyRatesFromPostgres` mengambil kurs berdasarkan
  `BASE_CURRENCY_CODE`.
- Mengubah base currency dari wizard butuh refactor helper formatting dan
  document currency agar base currency benar-benar dinamis.

## Flow Baru Yang Diinginkan

### Step 0 - License

Tetap seperti sekarang:

- validasi license key;
- simpan fingerprint ke `configuredBy`;
- lanjut ke konfigurasi.

### Step 1 - Pilih Module dan Fitur

Tetap memakai `SETUP_MODULE_GROUPS`, tetapi hasilnya menjadi input untuk step
akuntansi:

- Jika user memilih `CHART_OF_ACCOUNTS`, `GENERAL_LEDGER`, `CASH_FLOW`,
  `SALES_*`, `PURCHASE_*`, `KOPERASI_*`, atau report finance, tampilkan step
  setup akuntansi.
- Jika tidak ada module yang membutuhkan accounting baseline, step akuntansi bisa
  tampil ringkas dengan default base currency saja.

### Step 2 - Pilih Jenis Bisnis

Tambahkan satu pilihan user-facing: **Jenis Bisnis**. Wizard tidak perlu
menampilkan field `accounting_profile`, accounting standard, industry extension,
atau template COA sebagai input terpisah. Nilai teknis tersebut otomatis
diturunkan dari pilihan bisnis.

| Pilihan UI | Standard yang ditampilkan | Accounting profile auto | Industry extension auto | Template COA auto | Status awal |
| --- | --- | --- | --- | --- | --- |
| Ritel | SAK EMKM | `SAK_EMKM` | `RETAIL` | `SAK_EMKM_RETAIL_TEMPLATE` | siap apply |
| Koperasi | SAK ETAP | `SAK_ETAP` | `COOPERATIVE` | `SAK_ETAP_KOPERASI_TEMPLATE` | siap apply |
| Perdagangan Umum | SAK EMKM | `SAK_EMKM` | `GENERAL_TRADING` atau `RETAIL` v1 | template baru/alias retail | perlu keputusan |
| Jasa Umum | SAK EMKM | `SAK_EMKM` | `GENERAL_SERVICE` atau `NONE` v1 | template baru tanpa inventory-heavy mapping | perlu keputusan |
| Manufaktur | PSAK penuh/SAK EP | `SAK_EP`/`PSAK_FULL` | `MANUFACTURING` | preview existing | disabled sampai domain siap |
| Konstruksi | PSAK penuh/SAK EP | `SAK_EP`/`PSAK_FULL` | `CONSTRUCTION` | preview existing | disabled sampai domain siap |
| Pemerintahan | PSAP | `PSAP` | `NONE` | preview existing | disabled sampai report PSAP siap |

Rekomendasi desain:

- Tambahkan type bisnis setup terpisah dari accounting standard:

```ts
export type AccountingBusinessTemplateCode =
  | 'RETAIL'
  | 'COOPERATIVE'
  | 'GENERAL_TRADING'
  | 'GENERAL_SERVICE'
  | 'MANUFACTURING_PREVIEW'
  | 'CONSTRUCTION_PREVIEW'
  | 'GOVERNMENT_PREVIEW';
```

- Mapping jenis bisnis menentukan `accounting_profile`, `industry_extension`,
  `template_id`, default module accounting, dan warning.
- Input wizard cukup menyimpan `business_template_code`; `accounting_profile`,
  `industry_extension`, dan `template_id` harus di-derive dari registry di
  service save agar tidak ada kombinasi invalid dari UI/client.
- Jangan memaksa label bisnis sama dengan `IndustryExtensionCode`; label bisnis
  adalah UX, sedangkan `IndustryExtensionCode` adalah technical accounting gate.

### Step 3 - Tanggal Cutoff dan Periode

Field wajib:

- `cutoff_date`: tanggal mulai ledger/akuntansi.
- `fiscal_period_start`: tanggal awal tahun buku/periode utama.
- `fiscal_period_end`: tanggal akhir tahun buku/periode utama.
- `current_period_start`: tanggal awal periode berjalan.
- `current_period_end`: tanggal akhir periode berjalan.

Validasi:

- `fiscal_period_end >= fiscal_period_start`.
- `current_period_start` dan `current_period_end` berada dalam rentang fiscal.
- `current_period_end >= current_period_start`.
- `cutoff_date <= current_period_end`.
- Jika sudah ada `opening_balance_journal_id`, cutoff tidak boleh diubah dari
  wizard.
- Jika sudah ada transaksi/jurnal posted setelah setup, perubahan template dan
  base currency harus dikunci atau butuh flow reset eksplisit.

Keputusan model periode yang perlu diambil:

- Opsi A: Simpan hanya satu row `accountingPeriods` untuk periode berjalan.
  `fiscal_period_start/end` disimpan di setup snapshot. Ini paling kecil.
- Opsi B: Refactor `accountingPeriods` agar mendukung parent-child
  `YEARLY` -> `MONTHLY`, lalu ubah aturan no-overlap agar overlap beda level
  valid. Ini paling lengkap tetapi lebih besar.

Rekomendasi v1:

- Pakai Opsi A dulu.
- `accountingPeriods` menyimpan periode berjalan yang benar-benar dipakai lock,
  closing, dan guard transaksi.
- Setup snapshot menyimpan `fiscal_period_start/end` sebagai konteks tahun buku.
- Issue lanjutan boleh membuat generator periode bulanan.

### Step 4 - Base Currency

Field wajib:

- `base_currency_code`
- `base_currency_name`
- `base_currency_symbol`
- `decimal_places`

Validasi:

- kode 3 huruf uppercase;
- hanya satu currency `is_base = true`;
- base currency tidak boleh diganti jika sudah ada dokumen, finance transaction,
  journal, payment, atau opening balance posted;
- jika base bukan `IDR`, integrasi BI rate tidak boleh diasumsikan selalu
  `currency/IDR`.

Rekomendasi v1:

- Wizard tetap default ke IDR.
- Pilihan base lain boleh tersedia hanya sebelum transaksi pertama.
- Refactor hardcoded `BASE_CURRENCY_CODE` menjadi read model:
  `getBaseCurrencySetting()` / `useBaseCurrency()`.
- Formatter laporan memakai symbol base currency, bukan string `Rp`.

### Step 5 - Review dan Save Atomic

Buat service orchestrator, misalnya:

```txt
src/services/accountingInitialSetupService.ts
```

Command utama:

```ts
saveInitialAccountingSetup(input)
```

Tanggung jawab:

- validasi module selection + accounting setup;
- simpan `app_setup_config`;
- apply template COA dengan mode yang aman;
- simpan accounting profile;
- simpan cutoff dan inventory policy;
- buat/update periode berjalan;
- set base currency;
- tulis setup snapshot/audit;
- tulis activity log;
- enqueue semua row yang berubah.

Service harus melakukan local write dalam transaksi Dexie sejauh memungkinkan.
Untuk step yang memakai helper existing yang sudah punya transaksi sendiri,
buat varian internal agar wizard tidak menulis setengah data bila validasi awal
gagal.

## Data Model Yang Disarankan

### 1. Tambahkan setup snapshot akuntansi

Tambahkan tabel singleton agar wizard punya state yang eksplisit, bisa di-sync,
dan bisa dipakai untuk resume/readonly summary.

```ts
export interface AccountingInitialSetupSetting {
  id: 'default';
  business_template_code: AccountingBusinessTemplateCode;
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  template_id: string;
  cutoff_date: string;
  fiscal_period_start: string;
  fiscal_period_end: string;
  current_period_start: string;
  current_period_end: string;
  current_period_id?: string;
  base_currency_code: string;
  inventory_policy: InventoryAccountingPolicy;
  setup_completed_at?: string;
  setup_completed_by?: string;
  setup_completed_by_name?: string;
  version: number;
  created_at: string;
  updated_at: string;
  sync_status?: SyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

Canonical table tetap:

- `accountingProfileSetting` untuk profile/template aktif.
- `generalLedgerSetting` untuk cutoff, inventory policy, readiness, opening
  balance.
- `accountingPeriods` untuk periode berjalan yang bisa di-lock/close.
- `currencies` dan `currencyRates` untuk base currency.
- `app_setup_config` untuk module app yang aktif.

Catatan UX/model: walaupun snapshot menyimpan `accounting_profile`,
`industry_extension`, dan `template_id` untuk audit/sync, wizard hanya
menampilkan satu field **Jenis Bisnis**. Field teknis tidak diedit langsung oleh
user.

### 2. Extend setup config remote

Minimal tambahkan realtime trigger untuk `app_setup_config`.

Opsional, jika ingin snapshot setup module tetap satu tempat:

```ts
export interface SetupConfig {
  enabledModules: string[];
  databaseUrl?: string;
  configuredAt: string;
  configuredBy: string;
  moduleCatalogVersion?: number;
  accountingSetupCompletedAt?: string;
}
```

Jangan simpan seluruh accounting setup hanya di localStorage, karena user minta
sync DB + realtime.

## Modul Terdampak

### Developer setup dan auth gate

- `src/view/auth/SetupKeyDrawer.tsx`
- `src/view/auth/HostDatabaseSetup.tsx`
- `src/auth/AuthGate.tsx`
- `src/services/setupKeyService.ts`
- `src/types/setup.ts`
- `src/constants/setupModules.ts`

Dampak:

- Stepper bertambah dari `License -> Konfigurasi` menjadi
  `License -> Module -> Akuntansi -> Review`.
- Save tidak cukup memanggil `saveSetupConfigToRemote`; harus memanggil
  `saveInitialAccountingSetup`.
- Remote setup config perlu refresh/realtime agar device lain tahu setup sudah
  berubah.

### Accounting template dan COA

- `src/constants/accounting.ts`
- `src/constants/chartOfAccounts.ts`
- `src/services/chartOfAccountService.ts`
- `src/hooks/useChartOfAccounts.tsx`
- `src/components/chart-of-accounts/FinanceAccountMappingPanel.tsx`
- `src/view/finance/chart-of-accounts/ChartOfAccountsManagement.tsx`

Dampak:

- Tambah registry template bisnis.
- Tambah template perdagangan umum dan jasa umum atau putuskan alias v1.
- `applyChartOfAccountTemplate` perlu bisa dipanggil dari setup wizard dengan
  mode idempotent.
- UI COA tetap bisa mengganti template, tetapi harus respect lock setelah ada
  transaksi/jurnal.

### Cutoff, periode, closing

- `src/components/AccountingDateSettingsCard.tsx`
- `src/services/accountingReferenceSettingService.ts`
- `src/services/accountingPeriodService.ts`
- `src/services/accountingPeriodReadService.ts`
- `src/view/finance/closing/ClosingManagement.tsx`
- `src/services/closingRunService.ts`
- `src/utils/accounting/getGeneralLedgerReadiness.ts`

Dampak:

- Settings card menjadi maintenance/editor, bukan flow awal utama.
- Periode berjalan harus jelas: disimpan di setup snapshot atau
  `accountingPeriods`.
- Closing dan period lock harus membaca periode yang dibuat dari setup.
- Readiness GL harus mengenali setup akuntansi awal sudah complete.

### General Ledger dan opening balance

- `src/services/generalLedgerService.ts`
- `src/components/general-ledger/OpeningBalanceForm.tsx`
- `src/components/general-ledger/ManualJournalForm.tsx`
- `src/view/finance/general-ledger/GeneralLedgerManagement.tsx`
- `src/routes/finance/general-ledger/setup.lazy.tsx`

Dampak:

- Opening balance memakai cutoff dari setup awal.
- Jika template koperasi dipilih, hint piutang pinjaman/simpanan awal tetap harus
  jalan sesuai issue koperasi terkait.
- Posting jurnal tetap idempotent berdasarkan source type/event.

### Currency dan formatter

- `src/constants/currencies.ts`
- `src/services/currencyService.ts`
- `src/services/currencyReadService.ts`
- `src/hooks/useCurrencies.tsx`
- `src/utils/documentCurrency.ts`
- `src/utils/formatters.ts`
- `src/components/DocumentCurrencyFields.tsx`
- `src/view/master-data/currencies/*`
- semua report/UI yang masih hardcoded `Rp`

Dampak:

- Base currency harus dinamis.
- `ensureBaseCurrency` tidak boleh selalu membuat IDR sebagai base jika setup
  memilih currency lain.
- `isBaseCurrency`, `snapshotFromDocumentInput`, dan rate lookup harus membaca
  base currency aktif.
- Report dan PDF harus menerima symbol/base currency dari setting.

### Sales, purchase, POS, inventory

- `src/services/salesDocumentService.ts`
- `src/services/purchaseDocumentService.ts`
- `src/components/sales-document/SalesDocumentForm.tsx`
- `src/components/purchase-document/PurchaseDocumentForm.tsx`
- `src/services/checkoutService.ts`
- `src/hooks/useStockManagement.tsx`
- `src/services/stockPurchaseService.ts`
- `src/utils/documentCurrency.ts`

Dampak:

- Dokumen baru harus memakai base currency dari setup.
- Existing snapshot currency pada dokumen lama tidak boleh diubah massal.
- Jika base currency non-IDR, display base amount dan exchange rate harus tetap
  benar.

### Koperasi

- `src/services/cooperativeSavingService.ts`
- `src/services/cooperativeLoanService.ts`
- `src/services/cooperativeReportService.ts`
- `src/services/cooperativeLedgerReportService.ts`
- `src/view/koperasi/*`
- `src/constants/chartOfAccounts.ts`

Dampak:

- Template `SAK_ETAP + COOPERATIVE` harus bisa dipilih langsung dari setup.
- Akun simpanan anggota, piutang pinjaman, pendapatan bunga/denda/admin, dan
  beban IPTW/jasa simpanan harus tersedia dari awal.
- Flow saldo awal koperasi harus mengikuti cutoff yang sama.

### Sync queue, read refresh, realtime

- `src/services/syncQueueService.ts`
- `src/services/syncOrchestratorService.ts`
- `src/hooks/useSyncQueueWorker.ts`
- `src/services/accountingSettingReadService.ts`
- `src/services/accountingPeriodReadService.ts`
- `src/services/currencyReadService.ts`
- `src/services/postgresAdapter.ts`
- `src/store/syncActivityStore.ts`

Dampak:

- Tambah entity queue jika ada `accountingInitialSetupSetting`.
- `refreshAllDataFromPostgres` harus refresh setup accounting dan setup config.
- `FINANCE_REALTIME_TABLES` perlu mencakup tabel setup baru.
- `DATABASE_SYNC_QUERY_KEYS` perlu mencakup query key setup/accounting wizard.
- Realtime event dari `app_setup_config` harus invalidate module access/setup
  config, bukan hanya finance query.

### Dexie, backup/restore, migrations

- `src/lib/database/KasirkuDB.ts`
- `src/lib/database/migrations.ts`
- `src/lib/database/seeds.ts`
- `src/lib/database/populate.ts`
- `src/utils/backupRestore.ts`
- `src-tauri/migrations/*`

Dampak:

- Tambah tabel Dexie `accountingInitialSetupSetting` jika rekomendasi dipakai.
- Backup/restore wajib membawa tabel setup baru.
- Migrations Postgres wajib membuat tabel, index, singleton constraint, dan
  realtime trigger.

### Tauri/Rust Postgres layer

- `src-tauri/src/models/accounting_setting.rs`
- `src-tauri/src/repositories/accounting_setting_repository.rs`
- `src-tauri/src/commands/accounting_setting_commands.rs`
- `src-tauri/src/models/app_setup_config.rs`
- `src-tauri/src/repositories/app_setup_config_repository.rs`
- `src-tauri/src/commands/app_setup_config_commands.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/db/pool.rs`

Dampak:

- Tambah DTO/repository/command untuk setup snapshot.
- Tambah migration compatibility check.
- Tambah realtime trigger untuk `app_setup_config` dan tabel setup baru.

## Rencana Implementasi Per Fase

### Sub-Issue Per Fase

Setiap fase dipecah menjadi issue terpisah agar dependency, review, dan QA bisa
dilacak tanpa membuat issue induk terlalu gemuk:

- [Fase 0 - Audit dan Freeze Decision](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F0-AUDIT-FREEZE-DECISION.md)
- [Fase 1 - Model Setup Akuntansi dan Sync](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F1-MODEL-SYNC.md)
- [Fase 2 - Wizard UI di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F2-WIZARD-UI.md)
- [Fase 3 - Apply Template dan Accounting Reference Atomic](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F3-ATOMIC-SAVE.md)
- [Fase 4 - Base Currency Dinamis](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F4-BASE-CURRENCY.md)
- [Fase 5 - Maintenance UI Setelah Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F5-MAINTENANCE-UI.md)
- [Fase 6 - E2E Test dan Regression](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F6-E2E-REGRESSION.md)

### Fase 0 - Audit dan Freeze Decision

Checklist:

- Tentukan apakah `Perdagangan Umum` memakai alias retail v1 atau template baru.
- Tentukan apakah `Jasa Umum` memakai `NONE` atau extension baru
  `GENERAL_SERVICE`.
- Tentukan Opsi A/Opsi B untuk periode berjalan.
- Tentukan apakah base currency non-IDR langsung production atau hanya pre-setup
  sebelum transaksi pertama.
- Catat semua UI hardcoded `Rp` yang harus diganti bertahap.

Acceptance criteria:

- Ada keputusan produk untuk mapping jenis bisnis ke profile/standard/template.
- Ada keputusan teknis untuk penyimpanan periode berjalan.
- Ada daftar hard lock: field apa saja yang tidak boleh berubah setelah transaksi
  pertama/opening balance.

### Fase 1 - Model Setup Akuntansi dan Sync

Checklist:

- Tambahkan type `AccountingBusinessTemplateCode`.
- Tambahkan tabel Dexie `accountingInitialSetupSetting` atau field setup yang
  setara.
- Tambahkan migration Postgres untuk tabel setup.
- Tambahkan Rust model/repository/command.
- Tambahkan TS adapter di `postgresAdapter.ts`.
- Tambahkan read service merge remote ke Dexie.
- Tambahkan sync queue mapper, validator, processor, metadata updater, enqueue
  helper, dan pending scanner.
- Tambahkan realtime trigger untuk tabel baru.
- Tambahkan realtime trigger untuk `app_setup_config`.
- Tambahkan refresh setup config/accounting setup ke `syncOrchestratorService`.

Acceptance criteria:

- Setup accounting yang dibuat di device A muncul di device B setelah sync atau
  realtime refresh.
- Pending/failed/synced metadata terlihat konsisten.
- Realtime event dari setup table memicu refresh dan query invalidation.

### Fase 2 - Wizard UI di Developer Setup

Checklist:

- Refactor `SetupKeyDrawer` menjadi step:
  - License
  - Module
  - Akuntansi
  - Review
- Tambahkan component internal:
  - `SetupModuleStep`
  - `AccountingBusinessTemplateStep`
  - `AccountingPeriodStep`
  - `AccountingBaseCurrencyStep`
  - `SetupReviewStep`
- Tampilkan step akuntansi hanya jika module terkait butuh accounting baseline.
- Review menampilkan:
  - module aktif;
  - jenis bisnis dan standard otomatis, misalnya `Koperasi (SAK ETAP)`;
  - cutoff;
  - periode fiskal;
  - periode berjalan;
  - base currency;
  - warning lock setelah transaksi.

Acceptance criteria:

- User bisa menyelesaikan setup awal tanpa masuk Settings/COA dulu.
- Error validasi muncul sebelum save.
- Save menampilkan loading dan tidak menutup drawer jika upload/local write gagal.

### Fase 3 - Apply Template dan Accounting Reference Atomic

Checklist:

- Buat `accountingInitialSetupService.ts`.
- Reuse logic `applyChartOfAccountTemplate`, tetapi pastikan idempotent dan bisa
  dipanggil dari wizard.
- Reuse logic `saveAccountingReferenceSetting`, tetapi pisahkan core write agar
  bisa masuk orchestrator.
- Buat/update `accountingPeriods` untuk periode berjalan.
- Simpan setup snapshot.
- Tulis activity log:
  - `ACCOUNTING_INITIAL_SETUP_COMPLETED`
  - `ACCOUNTING_INITIAL_SETUP_UPDATED`
- Enqueue semua record yang berubah.

Acceptance criteria:

- Jika template sudah pernah diterapkan, save ulang tidak menggandakan akun.
- Jika periode sama sudah ada, save ulang memakai periode existing.
- Jika ada overlap periode yang tidak valid, save ditolak.
- Activity log menjelaskan template, cutoff, periode, dan base currency.

### Fase 4 - Base Currency Dinamis

Checklist:

- Tambahkan helper `getBaseCurrency`/`getBaseCurrencyCode` async dan hook
  `useBaseCurrency`.
- Ubah `documentCurrency.ts` agar tidak bergantung langsung ke
  `BASE_CURRENCY_CODE`.
- Ubah `currencyReadService` agar refresh rate memakai base currency aktif.
- Ubah `DocumentCurrencyFields` agar label rate bukan selalu `currency/IDR`.
- Ubah formatter/report bertahap dari hardcoded `Rp` ke symbol base currency.
- Tambahkan guard: base currency tidak bisa diganti jika sudah ada dokumen,
  finance transaction, journal, payroll, atau koperasi transaction.

Acceptance criteria:

- Fresh setup dengan IDR tetap sama seperti sekarang.
- Fresh setup dengan base currency lain membuat dokumen baru memakai base
  currency tersebut.
- Existing document snapshot tidak berubah saat base currency setting berubah
  sebelum transaksi dikunci.
- UI tidak menampilkan `Rp` untuk base currency non-IDR pada halaman yang sudah
  masuk scope fase ini.

### Fase 5 - Maintenance UI Setelah Setup

Checklist:

- `AccountingDateSettingsCard` membaca setup snapshot dan menampilkan status
  setup awal.
- COA template panel menampilkan template aktif dari setup.
- Currency page menandai base currency dari setup.
- General Ledger setup membaca cutoff dari setup awal.
- Jika setup belum lengkap, halaman finance menampilkan CTA kembali ke Developer
  Setup atau Settings sesuai permission.

Acceptance criteria:

- Settings tidak menimpa setup awal tanpa validasi lock.
- COA tidak bisa ganti template setelah transaksi/jurnal ada, kecuali lewat flow
  reset/migration terpisah.
- GL setup tidak bisa post opening balance tanpa cutoff valid.

### Fase 6 - E2E Test dan Regression

Test yang perlu dibuat:

- Fresh setup retail:
  - pilih module finance/sales;
  - pilih Jenis Bisnis `Ritel (SAK EMKM)`;
  - isi cutoff, periode, base IDR;
  - simpan;
  - cek COA/mapping/profile/general ledger setting/period/currency tersimpan.
- Fresh setup koperasi:
  - pilih module koperasi + finance;
  - pilih Jenis Bisnis `Koperasi (SAK ETAP)`;
  - cek akun 1120, 2300, 2310, 2320, 2330 dan mapping koperasi tersedia.
- Sync/realtime:
  - device A save setup;
  - device B menerima refresh;
  - `app_setup_config`, setup accounting, COA, mapping, GL setting, periode, dan
    currency konsisten.
- Guard:
  - setelah opening balance posted, cutoff tidak bisa diubah;
  - setelah transaksi dibuat, base currency/template tidak bisa diubah;
  - periode berjalan di luar tahun buku ditolak.
- Offline:
  - save setup saat offline membuat row pending;
  - saat online, queue upload;
  - remote merge menandai synced.

## Acceptance Criteria Utama

- Developer setup punya step akuntansi setelah pilih fitur.
- Template bisnis minimal Ritel dan Koperasi siap apply; Perdagangan Umum dan
  Jasa Umum punya keputusan jelas antara template baru atau alias v1.
- Cutoff, periode awal, periode akhir, periode berjalan, dan base currency
  tersimpan di DB, bukan hanya localStorage.
- Semua data setup yang berubah punya jalur Dexie -> sync queue -> PostgreSQL ->
  realtime -> Dexie device lain.
- Realtime trigger mencakup `app_setup_config` dan semua tabel accounting setup.
- `refreshAllDataFromPostgres` membawa setup config/accounting setup.
- Tidak ada double account, double period, atau double setup snapshot saat save
  diulang.
- Flow lama tetap bisa dipakai untuk maintenance dengan guard yang sama.

## Risiko

- Refactor base currency menyentuh banyak UI karena banyak string `Rp` hardcoded.
- Period model bisa melebar jika langsung mendukung yearly + monthly overlap.
- Setup wizard bisa memanggil service existing yang masing-masing sudah punya
  transaksi sendiri; perlu orchestration agar validasi gagal di awal, bukan
  setelah sebagian data tertulis.
- Realtime setup config perlu perhatian khusus karena localStorage tidak otomatis
  reactive antar device.

## Kesimpulan

Refactor ini sebaiknya diposisikan sebagai **Accounting Initial Setup**:
developer memilih fitur, lalu langsung mengunci baseline akuntansi bisnis.
Canonical data tetap memakai tabel existing (`accountingProfileSetting`,
`generalLedgerSetting`, `accountingPeriods`, `currencies`, `enabledModules`,
`chartOfAccounts`, `financeAccountMappings`), tetapi perlu setup snapshot agar
wizard punya state yang lengkap, tersinkron, dan bisa diaudit.

Prioritas implementasi paling aman adalah: Ritel dan Koperasi dulu, periode
berjalan model sederhana dulu, base currency default IDR tetap aman, lalu
perluas Perdagangan Umum/Jasa Umum dan dynamic currency display setelah jalur
sync/realtime setup stabil.
