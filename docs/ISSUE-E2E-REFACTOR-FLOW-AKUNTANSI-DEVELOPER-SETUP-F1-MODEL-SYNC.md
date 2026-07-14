# Sub-Issue: Fase 1 - Model Setup Akuntansi dan Sync

Parent issue:

- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-13

Status implementasi: selesai untuk fondasi model/sync Fase 1 pada 2026-07-13.

## Ringkasan

Fase ini membuat fondasi data untuk Accounting Initial Setup. Hasil setup tidak
boleh hanya hidup di localStorage atau UI state; setup harus punya snapshot
tersinkron yang bisa dibaca device lain lewat Dexie, sync queue, PostgreSQL,
dan realtime refresh.

## Kenapa Perlu Sub-Issue

Fase ini menyentuh banyak boundary infrastruktur: type domain, Dexie schema,
Postgres migration, Rust repository/command, adapter TypeScript, sync queue,
read refresh, backup/restore, dan realtime trigger. Ini layak berdiri sendiri
agar Fase 2 dan Fase 3 punya kontrak data yang stabil.

## Scope

- Menambah type bisnis setup.
- Menambah setup snapshot akuntansi.
- Membuat jalur Dexie -> sync queue -> PostgreSQL -> realtime -> Dexie.
- Menambah refresh setup accounting dan setup config ke orchestrator sync.
- Menambah realtime trigger untuk setup accounting dan `app_setup_config`.

## Non-Scope

- Belum membangun wizard UI lengkap.
- Belum mengubah atomic save template/period.
- Belum refactor currency formatter lintas aplikasi.

## Data Model Rekomendasi

Gunakan singleton table:

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

Canonical data tetap berada di tabel masing-masing:

- `accountingProfileSetting`
- `generalLedgerSetting`
- `accountingPeriods`
- `currencies`
- `app_setup_config`
- `chartOfAccounts`
- `financeAccountMappings`

Catatan UX/model:

- Wizard hanya menampilkan satu pilihan **Jenis Bisnis**.
- `business_template_code` adalah input user-facing.
- `accounting_profile`, `industry_extension`, dan `template_id` tetap disimpan
  di snapshot untuk audit/sync, tetapi nilainya harus di-derive dari registry
  template bisnis, bukan diedit manual oleh user.

## Checklist

- [x] Tambahkan type `AccountingBusinessTemplateCode`.
- [x] Tambahkan registry/mapping awal template bisnis sebagai kontrak turunan:
  - [x] label UI;
  - [x] standard display, misalnya `SAK ETAP`;
  - [x] `accounting_profile`;
  - [x] `industry_extension`;
  - [x] `template_id`;
  - [x] status enabled/preview/disabled;
  - [x] warning.
- [x] Tambahkan tabel Dexie `accountingInitialSetupSetting` atau field setup yang
  setara.
- [x] Tambahkan migration Dexie.
- [x] Tambahkan backup/restore support untuk tabel setup baru.
- [x] Tambahkan migration PostgreSQL:
  - [x] table setup singleton;
  - [x] index;
  - [x] sync metadata columns;
  - [x] realtime trigger ke `kasirku_data_changes`.
- [x] Tambahkan realtime trigger untuk `app_setup_config`.
- [x] Tambahkan Rust model/repository/command untuk setup snapshot.
- [x] Tambahkan registration command di `src-tauri/src/lib.rs`.
- [x] Tambahkan remote DTO dan adapter di `postgresAdapter.ts`.
- [x] Tambahkan read service:
  - [x] refresh setup accounting dari Postgres;
  - [x] merge remote setup accounting ke Dexie.
- [x] Tambahkan sync queue support:
  - [x] entity name;
  - [x] mapper;
  - [x] validator payload;
  - [x] processor;
  - [x] metadata updater;
  - [x] enqueue helper;
  - [x] pending scanner.
- [x] Tambahkan refresh setup config/accounting setup ke `syncOrchestratorService`.
- [x] Tambahkan query key/invalidation yang dipakai realtime setup.

## Catatan Implementasi 2026-07-13

- Business template registry Fase 1 dibuat di `src/constants/accounting.ts`.
- Setup snapshot disimpan sebagai singleton `accountingInitialSetupSetting` di
  Dexie dan `accounting_initial_setup_setting` di PostgreSQL.
- Jalur sync mencakup mapper, validator, processor queue, metadata updater,
  enqueue helper, pending scanner, remote refresh, dan realtime invalidation.
- Validasi teknis yang sudah dijalankan: `git diff --check`, `bun run build`,
  `cargo check`, dan `rustfmt --check` scoped untuk file Rust yang disentuh.
- Acceptance multi-device tetap perlu dibuktikan pada Fase 6/E2E karena belum
  dijalankan manual pada dua device.

## Acceptance Criteria

- Setup accounting yang dibuat di device A muncul di device B setelah sync atau
  realtime refresh.
- Row setup memiliki metadata `pending`, `synced`, dan `failed` yang konsisten.
- Realtime event dari setup table memicu refresh dan query invalidation.
- Realtime event dari `app_setup_config` memicu refresh module access/setup
  config.
- Backup/restore membawa setup snapshot.
- Tidak ada setup accounting lengkap yang hanya tersimpan di localStorage.

## Referensi Issue Induk

- Data model: bagian `Data Model Yang Disarankan`.
- Sync impact: bagian `Sync queue, read refresh, realtime`.
- Dexie/migration impact: bagian `Dexie, backup/restore, migrations`.
- Tauri impact: bagian `Tauri/Rust Postgres layer`.
- Rencana fase: bagian `Fase 1 - Model Setup Akuntansi dan Sync`.

## Referensi File

- `src/types/setup.ts`
- `src/constants/accounting.ts`
- `src/lib/database/KasirkuDB.ts`
- `src/lib/database/migrations.ts`
- `src/utils/backupRestore.ts`
- `src/services/postgresAdapter.ts`
- `src/services/syncQueueService.ts`
- `src/services/syncOrchestratorService.ts`
- `src/hooks/useSyncQueueWorker.ts`
- `src/store/syncActivityStore.ts`
- `src-tauri/migrations/*`
- `src-tauri/src/models/accounting_setting.rs`
- `src-tauri/src/repositories/accounting_setting_repository.rs`
- `src-tauri/src/commands/accounting_setting_commands.rs`
- `src-tauri/src/models/app_setup_config.rs`
- `src-tauri/src/repositories/app_setup_config_repository.rs`
- `src-tauri/src/commands/app_setup_config_commands.rs`
- `src-tauri/src/lib.rs`

## Dependency

- Fase 0 harus menentukan mapping template dan model periode v1.

## Handoff Ke Fase Berikutnya

- Fase 2 memakai type dan read model untuk render wizard.
- Fase 3 memakai setup snapshot dan enqueue helper untuk atomic save.
- Fase 6 memakai jalur sync/realtime ini untuk test multi-device.
