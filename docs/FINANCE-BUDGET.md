# Anggaran (Budget) - Modul Keuangan

Dokumen ini adalah hasil riset dan rencana implementasi fitur Anggaran (Budget)
untuk modul Keuangan di Frayukti/Kasirku. Targetnya: MVP anggaran yang
sederhana, aman terhadap cash-flow dan General Ledger yang sudah berjalan,
memakai ulang arsitektur CRUD desktop/tablet/mobile yang sudah matang di
Master Data Produk, dan punya jalur integrasi bertahap ke Chart of Accounts
serta General Ledger tanpa mengganggu flow yang sudah ada.

## Ringkasan Keputusan

- Anggaran masuk ke menu Keuangan sebagai submodule baru: label `Anggaran`,
  route `/finance/budget`.
- Anggaran adalah **lapisan perencanaan dan pembanding (planning/read
  layer)**, bukan lapisan transaksi. Tidak pernah menulis
  `financeTransactions`, tidak pernah mengubah `financeBalance`, dan tidak
  pernah memicu `recalculateFinance()`.
- Fase MVP membandingkan anggaran terhadap realisasi dari `financeTransactions`
  (category-based, cash-flow layer existing), bukan dari `journalEntryLines`/
  General Ledger. Ini konsisten dengan prinsip "`financeTransactions` tetap
  operational cash-flow layer" dari `docs/CHART-OF-ACCOUNTS.md` dan
  menghindari ketergantungan pada GL yang postingnya belum menutupi semua
  sumber transaksi.
- Fitur ini adalah "fitur budgeting resmi" yang gap-nya sudah dicatat sejak
  `docs/MASTERDATA-PROJECTS.md` (baris 329: "Budget hanya angka referensi
  sampai ada fitur budgeting resmi"). `Project.budget_amount` tetap sebagai
  angka referensi project dan **tidak** digabung/dimigrasi ke table `budgets`
  baru pada fase awal.
- Arsitektur CRUD (list, filter, form, FAB, drawer, action sheet) memakai
  ulang primitive yang sudah dipakai Master Data Produk (`MobileCrudList`,
  `ResponsiveCrudEditor`, `ResponsiveCrudCollection`, dst. dari
  `src/components/mobile-crud/`), bukan membuat pola baru.
- Permission fase awal cukup `FINANCE_ACCESS`, mengikuti seluruh sibling route
  `/finance/*` lainnya (kecuali `/finance/closing` yang memakai
  `ACCOUNTING_PERIOD_MANAGE`).
- Satu baris `budgets` = satu kategori/akun + satu periode + satu nominal
  rencana. Tidak dibuat sebagai dokumen header+lines pada fase awal.

## Riset Singkat: Bentuk MVP yang Wajar

Pola umum fitur budgeting sederhana pada software finance SME, dan yang
paling cocok untuk kondisi Frayukti saat ini:

1. User menentukan target/batas pengeluaran (atau target pendapatan) per
   kategori per periode (bulanan atau tahunan).
2. Sistem menghitung realisasi otomatis dari transaksi yang sudah ada — user
   tidak input realisasi secara manual.
3. Tampilan progress (rencana vs realisasi vs sisa/lebih) dengan status
   visual: Aman / Waspada / Melebihi.
4. Tidak ada workflow approval, tidak ada distribusi budget ke banyak level
   organisasi, tidak ada forecasting/rolling budget di fase awal.

Prinsip ini dipilih karena selaras dengan pola yang sudah berjalan di
project ini:

- `Project.budget_amount` sudah eksplisit "hanya angka referensi" (tidak
  mengubah saldo) — Anggaran meneruskan prinsip yang sama, hanya menambahkan
  pembanding realisasi otomatis.
- `docs/CASH-BANK.md` dan `docs/CHART-OF-ACCOUNTS.md` konsisten menahan diri
  dari membangun ledger/engine baru di fase awal setiap modul; MVP Anggaran
  mengikuti pola yang sama: perkuat lapisan baca (read/compare), bukan
  membuat mesin akuntansi baru.
- `docs/CHART-OF-ACCOUNTS-PHASE-5-INDUSTRY-GOVERNMENT.md` menyebut "Struktur
  akun anggaran dan realisasi" dan "Laporan Realisasi Anggaran" sebagai
  kebutuhan PSAP/pemerintahan — itu konsep yang lebih berat (anggaran vs
  realisasi berbasis akun akrual pemerintahan). Anggaran retail/SME yang
  dibahas di dokumen ini adalah fitur general-purpose yang lebih ringan dan
  tidak perlu menunggu Fase 5.

## Batas Modul (Fase MVP)

Masuk Anggaran fase MVP:

- CRUD Anggaran per kategori finance (expense, opsional income) per periode
  (bulanan/tahunan).
- Realisasi otomatis dihitung dari `financeTransactions` (bukan input
  manual).
- Ringkasan progress per anggaran: nominal rencana, realisasi, sisa/lebih,
  persentase, status (Aman/Waspada/Melebihi).
- Filter/list anggaran per periode aktif.
- Arsip anggaran (soft-delete via `is_active=false`), bukan hard delete.
- Sync offline-first Dexie <-> Postgres via Tauri, mengikuti pola
  `projects`/`lotteries`.

Tidak masuk fase MVP (lihat "Hal yang Sengaja Ditunda"):

- Posting jurnal otomatis dari anggaran.
- Approval workflow / multi-level budget.
- Alokasi anggaran per department/project/warehouse.
- Rolling forecast, budget revision history dengan audit trail terpisah.
- Import/export anggaran massal.
- Push notification saat anggaran mendekati/melewati batas.
- Anggaran berbasis Chart of Accounts/General Ledger (masuk Fase 2/3, lihat
  "Integrasi Ledger").

## Referensi Arsitektur: Master Data Produk

`docs/ISSUE-MOBILE-CRUD-LIST-STANDARD.md` menetapkan Master Data Produk
sebagai implementasi pertama dari primitive CRUD mobile yang generic dan
sudah terbukti stabil (`src/components/mobile-crud/`). Anggaran **wajib**
memakai ulang primitive yang sama, bukan membangun list/drawer/FAB sendiri.

Mapping berkas:

| Produk (referensi) | Anggaran (baru) | Catatan |
| --- | --- | --- |
| `src/view/master-data/products/StockManagement.tsx` | `src/view/finance/budget/BudgetManagement.tsx` | Page container, header, FAB/tombol tambah, filter |
| `src/components/StockTable.tsx` | `src/view/finance/budget/BudgetTable.tsx` | Adapter `ResponsiveCrudCollection<Budget>`: tabel desktop vs `MobileCrudList<Budget>` |
| `src/view/master-data/products/StockProductModal.tsx` | `src/view/finance/budget/BudgetFormModal.tsx` | Form tunggal dibungkus `ResponsiveCrudEditor` |
| `src/hooks/useStockManagement.tsx` | `src/hooks/useBudgets.tsx` | Query Dexie, mutation, filter state, `handleEdit`, `resetForm` |
| `src/services/productCreateService.ts` / `productUpdateService.ts` / `productReadService.ts` | `src/services/budgetCreateService.ts` / `budgetUpdateService.ts` / `budgetReadService.ts` | Pola split create/update/read tetap dipertahankan |
| `src/i18n/stockMessages.ts` | `src/i18n/budgetMessages.ts` | Modul i18n terpisah, di-spread ke `messages.ts` |

Primitive yang dipakai ulang tanpa modifikasi:

- `MobileCrudList<Budget>` — card list mobile+tablet, progressive disclosure,
  action bottom sheet.
- `ResponsiveCrudEditor` — drawer full-screen (mobile/tablet) vs modal
  (desktop) untuk form tambah/edit.
- `ResponsiveCrudCollection<Budget>` — switcher desktop table vs mobile card
  list berdasarkan `useIsMobile()`.
- `MobileCrudFloatingActions` — FAB tambah anggaran di mobile/tablet.
- `MobileCrudFilterSheet` — bottom drawer untuk filter periode/kategori/status
  lengkap.
- `MobileCrudBottomSheet` — detail/action drawer per record.
- `MobileCrudPageHeader` — header mobile dengan breadcrumb + action slot;
  tambahkan route Anggaran ke `EMBEDDED_MOBILE_HEADER_PATHS` di
  `src/routes/__root.tsx`, seperti `/master-data/products`.

Perbedaan yang disengaja dari Produk: Anggaran tidak butuh barcode scanner,
tab multi-unit, atau tab harga grosir — form Anggaran jauh lebih pendek
(5-7 field), jadi `ResponsiveCrudEditor` cukup dipakai tanpa `Tabs` sama
sekali (single-column form, bukan seperti `StockProductModal`).

## Data Model

Tambahkan di `src/types/index.ts`, dekat definisi `FinanceTransaction`/
`FinanceAccountMapping`.

```ts
export type BudgetPeriodType = 'MONTHLY' | 'YEARLY';
export type BudgetTransactionType = 'EXPENSE' | 'INCOME';
export type BudgetSyncStatus = EntitySyncStatus;

export interface Budget {
  id: string;
  name: string;                        // label bebas, misalnya "Operasional September 2026"
  budget_type: BudgetTransactionType;   // default 'EXPENSE'
  category: string;                    // salah satu value FINANCE_CATEGORIES yang expense/income-eligible
  period_type: BudgetPeriodType;
  period_key: string;                  // 'YYYY-MM' untuk MONTHLY, 'YYYY' untuk YEARLY
  planned_amount: number;              // >= 0
  warning_threshold_percent: number;   // default 80, dipakai untuk status "Waspada"
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: BudgetSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

Catatan model:

- `category` divalidasi terhadap kategori yang lolos
  `isExpenseReportFinanceTransaction`/`isIncomeReportFinanceTransaction`
  (helper sudah ada di `src/constants/finance.ts`) sesuai `budget_type` yang
  dipilih — mencegah user membuat anggaran untuk kategori sistem seperti
  `PENJUALAN`/`HPP_OTOMATIS`/`TRANSFER_KAS_BANK` yang tidak relevan sebagai
  target manual.
- `planned_amount` tidak boleh negatif (sama seperti validasi `budget_amount`
  di Project).
- Kombinasi `category + period_type + period_key` sebaiknya unik untuk
  anggaran aktif — service menolak duplikat aktif dengan pesan jelas (bukan
  DB constraint keras).
- `account_id`/`account_code`/`account_name`, `department_id`, `project_id`
  **sengaja tidak ditambahkan di fase MVP**. Field ini masuk Fase 2/3 sebagai
  kolom tambahan (Dexie version baru) — lihat "Integrasi Ledger".
- Realisasi (`actual_amount`) **tidak disimpan** di table `budgets`. Selalu
  dihitung on-the-fly dari `financeTransactions` supaya tidak ada dua sumber
  kebenaran yang bisa berbeda.

## DB Schema Dexie

Versi Dexie saat ini `129` (`src/lib/database/migrations/versions/v129.ts`).
Table baru masuk versi berikutnya — cek versi terbaru saat implementasi
karena bisa saja sudah maju dari `130`.

```ts
// src/lib/database/migrations/versions/v130.ts
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV130(db: KasirkuDB) {
  db.version(130).stores({
    budgets: 'id, budget_type, category, period_type, period_key, is_active, created_at, updated_at, sync_status',
  });
}
```

Wiring wajib:

1. Import dan panggil `registerMigrationV130(this)` di
   `src/lib/database/migrations.ts`, setelah `registerMigrationV129(this)`.
2. Tambah `Budget` ke import type dan `budgets!: Table<Budget>;` di
   `src/lib/database/KasirkuDB.ts`.
3. Jangan menambah index ke `version(1)` atau versi lama — selalu versi baru
   mengikuti pola existing.

## Service Layer

Buat `src/services/budgetService.ts` (atau split
`budgetCreateService.ts`/`budgetUpdateService.ts` mengikuti pola Produk jika
filenya mulai panjang).

```ts
export interface BudgetUpsertInput {
  name: string;
  budget_type: BudgetTransactionType;
  category: string;
  period_type: BudgetPeriodType;
  period_key: string;
  planned_amount: number;
  warning_threshold_percent?: number;
  notes?: string;
}

export const createBudget = async (input: BudgetUpsertInput) => {};
export const updateBudget = async (id: string, input: BudgetUpsertInput) => {};
export const archiveBudget = async (id: string) => {};
export const restoreBudget = async (id: string) => {};
```

Aturan service (mengikuti pola `projectService.ts`/`productCreateService.ts`):

- Ambil user aktif via `getCurrentSessionUser()`, guard dengan
  `requireUserPermission(currentUser, 'FINANCE_ACCESS')`.
- Validasi via Zod di `src/lib/validations/budget.ts` (nama wajib,
  `planned_amount >= 0`, `category` wajib salah satu kategori valid sesuai
  `budget_type`, `period_key` sesuai format `period_type`).
- Tolak duplikat aktif `category + period_type + period_key` dengan pesan
  jelas.
- `createBudget` set `id`, `created_at`, `updated_at`, `is_active=true`,
  `sync_status='pending'`.
- `updateBudget` hanya update field budget + `updated_at`, tidak menyentuh
  `financeTransactions`/`financeBalance`.
- `archiveBudget` set `is_active=false` (bukan delete), `restoreBudget`
  kebalikannya.
- Setiap mutasi menulis `activityLogs` (`BUDGET_CREATED`/`BUDGET_UPDATED`/
  `BUDGET_ARCHIVED`/`BUDGET_RESTORED`) dan memanggil
  `enqueueBudgetSync(record, operation)`.
- **Tidak pernah** memanggil `addFinanceTransaction`, `recalculateFinance`,
  atau `postBalancedJournalEntry` dari service ini.

Buat `src/services/budgetRealizationService.ts` (read-only, tidak menyentuh
sync):

```ts
export interface BudgetRealization {
  budget: Budget;
  actual_amount: number;
  remaining_amount: number;
  usage_percent: number;
  status: 'SAFE' | 'WARNING' | 'OVER';
}

export const getBudgetRealization = (
  budget: Budget,
  transactions: FinanceTransaction[],
): BudgetRealization => { /* filter by category + period range, sum amount */ };
```

Perhitungan periode: `period_key` MONTHLY (`'2026-09'`) dikonversi ke
rentang tanggal awal-akhir bulan, YEARLY (`'2026'`) ke rentang satu tahun
kalender. Filter transaksi: `type === (budget_type === 'EXPENSE' ? 'EXPENSE'
: 'INCOME')`, `category === budget.category`, `created_at` dalam rentang
periode, dan **kecualikan** kategori yang sudah ditandai
`NON_EXPENSE_REPORT_FINANCE_CATEGORIES`/`NON_INCOME_REPORT_FINANCE_CATEGORIES`
supaya konsisten dengan definisi expense/income yang sudah dipakai laporan
lain.

## Hook

Buat `src/hooks/useBudgets.tsx`, orkestrasi React Query mengikuti
`useProjects.tsx`/`useStockManagement.tsx`:

- Query `budgets` dari Dexie (urut `period_key` terbaru lalu `name`).
- Query `financeTransactions` (reuse query key `['financeTransactions']`
  yang sudah dipakai `useFinance`) untuk dihitung realisasinya lewat
  `getBudgetRealization`.
- State filter: periode aktif (`period_type` + `period_key`), `budget_type`,
  status (Aman/Waspada/Melebihi).
- Mutation create/update/archive/restore memanggil `budgetService`.
- Invalidate `['budgets']` setelah sukses; **tidak** invalidate
  `['financeBalance']` karena budget tidak pernah mengubahnya.
- Expose `budgetsWithRealization: BudgetRealization[]` sebagai data
  siap-render untuk `BudgetTable`/`MobileCrudList`.

## Permission

Route: `'/finance/budget': 'FINANCE_ACCESS'` di
`src/auth/routePermissions.ts`, konsisten dengan seluruh sibling
`/finance/*` (Cash Flow, Payables, Receivables, Chart of Accounts, Opening
Balances, General Ledger). Mutasi di service memakai guard yang sama,
`requireUserPermission(currentUser, 'FINANCE_ACCESS')`.

Fase awal tidak perlu permission baru (`BUDGET_MANAGE`). Kalau nanti
Anggaran perlu dipisah antara "boleh lihat" vs "boleh atur" (misalnya staff
finance vs owner), baru pertimbangkan permission granular baru — jangan di
fase MVP.

## UI Plan — Desktop, Tablet, Mobile

Breakpoint yang sudah ada dan wajib dipakai ulang (jangan buat breakpoint
baru):

- `useIsMobile()` (`src/hooks/useIsMobile.ts`): true jika viewport
  `≤ 1279.98px` ATAU coarse pointer ATAU mobile user-agent ATAU iPad desktop
  mode. Ini mencakup **tablet + ponsel** dalam satu bucket "mobile mode".
- `useMediaQuery('(max-width: 767.98px)')` (dipakai `__root.tsx` sebagai
  `isPhoneViewport`): membedakan **ponsel** dari **tablet** di dalam bucket
  mobile. Tablet = `isMobile && !isPhoneViewport`.

### Desktop (`!isMobile`, umumnya ≥ 1280px)

- Layout: `Sider` persist di kiri (sudah ditangani `__root.tsx`), tidak perlu
  perubahan navigasi global.
- Header halaman `BudgetManagement.tsx`: judul + filter periode (Select
  bulan/tahun) + tombol "Tambah Anggaran" di kanan atas (bukan FAB).
- Konten utama: table (kolom: nama, kategori, tipe, periode, rencana,
  realisasi, sisa, progress bar, status, aksi) via jalur desktop dari
  `ResponsiveCrudCollection`.
- Tambah/edit anggaran: `Modal` lebar `~640px` (form Anggaran pendek, tidak
  perlu selebar form Produk `760px`).
- Klik baris langsung membuka form edit — form pendek tidak butuh
  detail-sheet perantara seperti Produk.

### Tablet (`isMobile && !isPhoneViewport`, kira-kira 768px–1279px)

- Navigasi: drawer kiri (hamburger di top bar), **tanpa** bottom navigation
  bar (`MobileBottomNavigation` hanya tampil di `isPhoneViewport`).
- Konten: tetap memakai jalur mobile `ResponsiveCrudCollection` →
  `MobileCrudList<Budget>`, tapi card list boleh dirender 2 kolom pada lebar
  tablet (grid responsive, bukan single column ala ponsel) supaya tidak
  banyak scroll vertikal — ini penyesuaian tampilan card, bukan primitive
  baru.
- FAB tambah anggaran tetap muncul (`MobileCrudFloatingActions`), karena
  tablet termasuk bucket `isMobile`, sama seperti perilaku Produk sekarang di
  tablet.
- Form tambah/edit: `ResponsiveCrudEditor` tetap masuk mode mobile (`Drawer`
  full-screen), sesuai definisi `useIsMobile()` — konsisten dengan Produk
  yang tidak membedakan tablet vs ponsel untuk drawer form.

### Mobile / ponsel (`isPhoneViewport`, ≤ 767.98px)

- `MobileCrudPageHeader` tetap (breadcrumb + action slot), tambahkan
  `/finance/budget` ke `EMBEDDED_MOBILE_HEADER_PATHS` di `__root.tsx`.
- `MobileBottomNavigation` tetap tampil tanpa item baru — Anggaran diakses
  lewat menu Keuangan, bukan item bottom-nav utama, sama seperti Chart of
  Accounts/General Ledger yang juga tidak masuk bottom-nav.
- List: `MobileCrudList<Budget>` single column card. Card menampilkan: nama
  anggaran, kategori (label i18n), periode, progress bar (rencana vs
  realisasi), badge status warna (hijau Aman/kuning Waspada/merah Melebihi).
- FAB bulat di kanan-bawah (`MobileCrudFloatingActions`) untuk tambah
  anggaran, mengikuti pola Produk persis (`data-tour` baru misalnya
  `budget-add`).
- Tap card langsung membuka action bottom sheet (`MobileCrudBottomSheet`):
  Edit, Arsipkan. Karena form pendek dan tidak ada aksi domain tambahan
  (tidak seperti Produk yang punya "Kelola Saldo Awal"/"Verifikasi"),
  Anggaran tidak perlu detail-sheet perantara terpisah.
- Filter periode + kategori + status: `MobileCrudFilterSheet` (bottom
  drawer) dengan tombol Reset/Terapkan, search tetap terlihat di atas.
- Arsip anggaran: confirmation modal terpisah setelah action drawer ditutup
  (pola delete Produk), bukan swipe.

### Progress/status visual (semua breakpoint)

Status dihitung dari `usage_percent = actual_amount / planned_amount * 100`:

- `< warning_threshold_percent` → **Aman** (hijau).
- `>= warning_threshold_percent` dan `< 100` → **Waspada** (kuning).
- `>= 100` → **Melebihi** (merah).

Progress bar antd `Progress` dengan warna mengikuti status; tidak perlu
animasi/notifikasi push di MVP.

## i18n

Buat `src/i18n/budgetMessages.ts` mengikuti pola `stockMessages.ts`
(`export const budgetMessages = { id: {...}, en: {...} }`), key
dotted-namespace `budget.*` (contoh: `budget.title`, `budget.add`,
`budget.category`, `budget.period`, `budget.status.safe/warning/over`,
`budget.mobile.selectAria`). Spread ke `messages.ts` di kedua locale.

Tambahan:

- `nav.finance.budget` di `src/i18n/navigationMessages.ts`.
- `finance.index.budgetDesc` inline di `messages.ts` (dipakai kartu menu
  Finance hub).

## Navigasi

- `src/routes/finance/budget.lazy.tsx` (lazy route, component
  `BudgetManagement`).
- Tambah entri ke `menuItems` di `src/routes/finance/index.tsx`:

  ```ts
  {
    to: '/finance/budget',
    label: t('nav.finance.budget'),
    icon: PieChartOutlined, // atau FundOutlined, sesuaikan icon set finance lain
    color: 'text-amber-600',
    desc: t('finance.index.budgetDesc'),
  }
  ```

- Tidak perlu menambah item ke `MobileBottomNavigation` maupun sidebar
  Finance group `__root.tsx` secara struktural — sudah otomatis muncul lewat
  Finance hub seperti Chart of Accounts/General Ledger/Closing.

## Backup dan Restore

Update `src/utils/backupRestore.ts` (wajib — ini "kontrak data safety" untuk
semua table finance baru per `docs/CHART-OF-ACCOUNTS.md`):

- Tambah `budgets: await db.budgets.toArray()` di block export.
- Tambah `'budgets'` ke `expectedKeys`.
- Tambah `db.budgets` ke daftar table transaction restore + clear.
- Bulk add `data.budgets` saat tersedia.

## Sync BE/DB Tauri

Pola sync yang dipakai (offline-first, last-write-wins by `updated_at`, soft
delete, realtime push via Postgres NOTIFY) sudah matang dan dipakai identik
oleh `projects`/`lotteries`/`chartOfAccounts`. Anggaran mengikuti pola yang
sama persis, tanpa modifikasi arsitektur sync.

### Alur end-to-end

```text
Dexie write (create/update/archive)
  -> budgetService.ts (validasi + permission + activity log)
  -> db.budgets.add/put (local-first, sync_status='pending')
  -> enqueueBudgetSync(record, operation) -> db.syncQueue.add(...)
  -> processPendingSyncQueue() (worker jalan otomatis)
       -> processBudgetQueueItem(queueItem)
            -> budgetPostgresAdapter.upsert/delete
                 -> invoke('postgres_upsert_budget' | 'postgres_delete_budget')
                      -> Tauri command -> budget_repository::upsert_budget/delete_budget
                           -> Postgres: INSERT ... ON CONFLICT (id) DO UPDATE
                              WHERE EXCLUDED.updated_at >= budgets.updated_at
                           -> trigger kasirku_notify_data_change -> PG_NOTIFY
       -> sukses: sync_status='synced'; gagal: sync_status='failed' + sync_error

Postgres NOTIFY (device lain / realtime)
  -> src-tauri postgres_realtime.rs (generic listener, tidak perlu diubah)
  -> event ke frontend -> realtimeSyncTableMap['budgets'] -> refreshBudgetsFromPostgres()
       -> budgetReadService.ts: pull cursor updated_at,id -> mergeRemoteBudgetsIntoDexie
            (skip jika local sync_status pending/failed; LWW by remote_updated_at)
       -> invalidate query key ['budgets']
```

### Checklist berkas (mengikuti template `projects`/`lotteries` persis)

Frontend:

- `src/types/index.ts` — `Budget`, `BudgetPeriodType`, `BudgetTransactionType`,
  alias sync status.
- `src/lib/database/migrations/versions/v130.ts` + registrasi di
  `migrations.ts`.
- `src/lib/database/KasirkuDB.ts` — `budgets!: Table<Budget>`.
- `src/lib/validations/budget.ts` — skema Zod.
- `src/services/budgetService.ts` (atau split create/update) +
  `budgetRealizationService.ts` (read-only, tanpa sync).
- `src/services/budgetReadService.ts` — `refreshBudgetsFromPostgres`,
  `mergeRemoteBudgetsIntoDexie`, `shouldApplyRemoteBudget` (copy pola
  `lotteryReadService.ts`/`projectReadService.ts`).
- `src/services/postgresAdapter.ts` — `RemoteBudgetDto` +
  `budgetPostgresAdapter` (`list`, `get`, `upsert`, `delete`).
- `src/services/syncQueueService.ts` — `BUDGET_ENTITY = 'budgets'`,
  `mapBudgetToRemoteDto`, `enqueueBudgetSync`, `enqueuePendingBudgetsForSync`,
  `processBudgetQueueItem`, tambahkan dispatch branch di
  `processSyncQueueItem` dan branch metadata sukses/gagal.
- `src/services/realtimeSyncTableMap.ts` — `budgets: { refreshFns:
  [refreshBudgetsFromPostgres], queryKeys: ['budgets'] }`.
- `src/utils/backupRestore.ts` — lihat bagian Backup dan Restore.
- `src/hooks/useBudgets.tsx`.

Backend (`src-tauri/`):

- `migrations/0090_budgets.sql` — `CREATE TABLE IF NOT EXISTS budgets (...)`
  + index `updated_at`/`is_active` + trigger `kasirku_notify_data_change`
  (copy persis pola `0089_lotteries.sql`). Sesuaikan nomor migrasi dengan
  file terakhir saat implementasi (`0089` adalah yang terbaru saat riset ini
  dibuat).
- `src/models/budget.rs` — `BudgetDto` (`sqlx::FromRow`, field snake_case
  sama seperti Dexie tanpa field sync lokal) + entri di `models/mod.rs`.
- `src/repositories/budget_repository.rs` — `list_budgets` (cursor
  `updated_at, id`), `get_budget`, `upsert_budget` (`ON CONFLICT DO UPDATE
  WHERE EXCLUDED.updated_at >= budgets.updated_at`, fallback
  `get_budget_including_deleted`), `delete_budget` (soft delete
  `is_active=false, deleted_at=NOW()`) + entri di `repositories/mod.rs`.
- `src/commands/budget_commands.rs` — `postgres_list_budgets`,
  `postgres_get_budget`, `postgres_upsert_budget`, `postgres_delete_budget`
  + entri di `commands/mod.rs`.
- `src/lib.rs` — daftarkan keempat command baru di
  `invoke_handler![tauri::generate_handler![...]]`, berdekatan dengan
  command finance/project lain.

Tidak ada perubahan diperlukan di `postgres_realtime.rs` — listener sudah
generic per-table lewat payload `PG_NOTIFY`.

## Integrasi Ledger (Bertahap)

Prinsip yang tidak boleh dilanggar di semua fase: Anggaran tidak pernah
membuat `financeTransactions`, tidak pernah mengubah
`financeBalance`/`recalculateFinance()`, dan tidak pernah memicu posting
jurnal (`postBalancedJournalEntry`) secara otomatis.

### Fase 1 — MVP, berbasis Cash-Flow Category (dokumen ini)

- Realisasi dihitung dari `financeTransactions` (`category` + `type` +
  rentang tanggal periode).
- Tidak butuh `chartOfAccounts`, `journalEntries`, atau `AccountingPeriod`
  sama sekali — aman dipakai bahkan sebelum GL/COA toko diaktifkan.
- Cocok untuk toko yang belum mengaktifkan `enabledModules.GENERAL_LEDGER`.

### Fase 2 — Opsional berbasis Akun (Chart of Accounts)

- Tambahkan kolom opsional pada `budgets` (Dexie version baru): `account_id?`,
  `account_code?`, `account_name?` — snapshot seperti pola `cash_account_*`
  di `financeTransactions` (lihat `docs/CASH-BANK.md`).
- Picker akun hanya menampilkan `ChartOfAccount` dengan `type IN
  ('EXPENSE','REVENUE')`, `is_postable=true`, `is_active=true` — pola yang
  sama seperti validasi akun kas/bank di Cash & Bank Fase 2.
- Saat `account_id` diisi, realisasi fase ini masih tetap dihitung dari
  `financeTransactions.account_id` (snapshot akun yang sudah ada di
  transaksi cash-flow), **bukan** dari `journalEntryLines` — supaya tetap
  tidak bergantung pada cakupan posting GL yang belum lengkap.
- Anggaran tanpa `account_id` (dari Fase 1) tetap berjalan seperti biasa;
  field ini murni aditif.

### Fase 3 — Terhubung ke General Ledger dan Periode Akuntansi

- Hanya dikerjakan setelah `enabledModules.GENERAL_LEDGER` stabil dan
  cakupan posting jurnal sudah luas (lihat
  `docs/CHART-OF-ACCOUNTS-PHASE-4-GENERAL-LEDGER.md`).
- Realisasi opsional dialihkan ke jumlah debit/kredit `journalEntryLines`
  per `account_id` dalam rentang `AccountingPeriod` terkait (reuse
  `getAccountingPeriodForDate`/`isAccountingPeriodPostable` dari
  `generalLedgerService.ts`), sehingga anggaran otomatis menghormati periode
  yang sudah `LOCKED`/`CLOSED`.
- `JournalEntryLine` sudah punya `department_id`/`project_id` — Anggaran
  fase ini bisa menambahkan dimensi opsional yang sama supaya "Anggaran per
  Departemen/Project" mungkin dilakukan tanpa mengubah struktur GL yang
  sudah ada.
- Tambahkan `BudgetVsActualReport` di `ledgerReportService.ts`, sejajar
  dengan `TrialBalanceReport`/`IncomeStatementReport`/`BalanceSheetReport`
  yang sudah ada.
- Ini juga titik pertemuan dengan kebutuhan "Laporan Realisasi Anggaran"
  PSAP di `docs/CHART-OF-ACCOUNTS-PHASE-5-INDUSTRY-GOVERNMENT.md` — Fase 3
  Anggaran retail ini bisa jadi fondasi, bukan diulang dari nol saat Fase 5
  dikerjakan.

### Hubungan dengan `Project.budget_amount`

- `Project.budget_amount` tetap seperti sekarang: angka referensi manual per
  project, tidak tersambung ke table `budgets` baru.
- Tidak direkomendasikan menggabungkan keduanya di fase MVP — beda konsep
  (`Project.budget_amount` = anggaran satu project spesifik yang di-input
  manual sekali, `budgets` = target berulang per kategori/periode yang
  dibandingkan otomatis terhadap realisasi).
- Kalau nanti dibutuhkan "anggaran per project", itu masuk Fase 3 lewat
  `project_id` opsional, bukan memodifikasi `Project.budget_amount`.

## Urutan Implementasi

1. Tipe `Budget`, `BudgetPeriodType`, `BudgetTransactionType` di
   `src/types/index.ts`.
2. Migration Dexie `v130` (table `budgets`) + wiring
   `migrations.ts`/`KasirkuDB.ts`.
3. Validasi `src/lib/validations/budget.ts`.
4. `budgetService.ts` (create/update/archive/restore + activity log +
   enqueue sync) — dulu tanpa sync remote aktif, uji CRUD lokal Dexie dulu.
5. `budgetRealizationService.ts` (hitung realisasi dari `financeTransactions`,
   murni fungsi baca).
6. `useBudgets.tsx`.
7. UI: `BudgetManagement.tsx`, `BudgetTable.tsx` (adapter
   `ResponsiveCrudCollection`), `BudgetFormModal.tsx` (dibungkus
   `ResponsiveCrudEditor`) — reuse penuh primitive `mobile-crud`.
8. Route `src/routes/finance/budget.lazy.tsx` + entri di
   `src/routes/finance/index.tsx` + permission `routePermissions.ts`.
9. i18n `budgetMessages.ts` + `nav.finance.budget` + `finance.index.budgetDesc`.
10. Backup/restore `backupRestore.ts`.
11. Sync remote: Postgres migration `0090_budgets.sql`, Rust
    model/repository/commands, registrasi `lib.rs`, `postgresAdapter.ts`,
    `budgetReadService.ts`, `syncQueueService.ts` (`BUDGET_ENTITY`,
    enqueue/process), `realtimeSyncTableMap.ts`.
12. Jalankan `bun run lint` dan `bun run build` (memastikan
    `routeTree.gen.ts` ikut sinkron) serta `cargo check` di `src-tauri`.
13. Fase 2 (opsional akun COA) dan Fase 3 (GL/periode) dikerjakan terpisah
    setelah MVP stabil dan dipakai.

## Acceptance Criteria (MVP)

- Route `/finance/budget` tersedia untuk role dengan `FINANCE_ACCESS`,
  muncul di Finance hub.
- Anggaran bisa dibuat, diedit, diarsipkan, dipulihkan; tersimpan di Dexie
  table `budgets`.
- Duplikat aktif `category + period_type + period_key` ditolak dengan pesan
  jelas.
- Realisasi dan status (Aman/Waspada/Melebihi) dihitung otomatis dari
  `financeTransactions`, tidak ada input realisasi manual.
- `financeBalance` dan hasil `recalculateFinance()` tidak berubah oleh
  operasi apa pun di modul Anggaran.
- Mobile: card list `MobileCrudList<Budget>`, FAB tambah, filter bottom
  drawer, action bottom sheet, form full-screen drawer — tidak ada tabel
  horizontal di ponsel.
- Tablet: drawer navigasi (bukan bottom nav), FAB tetap muncul, card list
  boleh grid 2 kolom.
- Desktop: tabel dengan kolom lengkap + modal form + tombol tambah di header
  (bukan FAB).
- Backup/restore membawa data `budgets`.
- Sync offline-first: data dibuat offline tetap tersimpan lokal
  (`sync_status='pending'`), otomatis terkirim saat online, dan tampil di
  device lain via realtime.
- I18n tersedia untuk Bahasa Indonesia dan Inggris.

## Manual QA

1. Buat anggaran kategori `OPERASIONAL` bulan berjalan, catat pengeluaran
   manual dengan kategori sama, pastikan realisasi & progress bar
   ter-update.
2. Ubah `planned_amount` lebih kecil dari realisasi berjalan, pastikan
   status berubah menjadi Melebihi.
3. Arsipkan anggaran, pastikan tidak muncul di list aktif tapi datanya tidak
   hilang dari Dexie.
4. Coba buat anggaran duplikat kategori+periode yang sama, pastikan
   ditolak.
5. Uji di viewport 320×568 (ponsel), tablet (~800px), dan desktop (~1440px)
   — pastikan tidak ada scroll horizontal di ponsel/tablet dan FAB/drawer
   berfungsi sesuai matriks.
6. Matikan koneksi (mode offline Tauri), buat/edit anggaran, nyalakan
   kembali, pastikan `sync_status` berubah `pending` → `synced` dan data
   konsisten di Postgres.
7. Buka dari dua device (atau dua sesi Tauri) yang tersambung ke Postgres
   yang sama, buat anggaran di satu device, pastikan realtime memunculkan
   data di device lain tanpa refresh manual.
8. Backup database, restore ke data yang sama, pastikan `budgets` tidak
   hilang.
9. Akses sebagai role tanpa `FINANCE_ACCESS`, pastikan route/menu Anggaran
   tidak muncul.
10. Jalankan `bun run lint` dan `bun run build`.

## Hal yang Sengaja Ditunda

- Posting jurnal otomatis dari anggaran ke General Ledger.
- Anggaran berbasis Chart of Accounts/General Ledger (Fase 2/3 di atas).
- Alokasi anggaran per department/project/warehouse.
- Approval workflow, multi-level budget, dan revision history terpisah.
- Rolling forecast / budget berbasis rata-rata historis otomatis.
- Import/export massal anggaran.
- Push notification saat mendekati/melewati batas anggaran (fase MVP hanya
  visual di dalam app).
- Penggabungan `Project.budget_amount` ke table `budgets`.
- Laporan Realisasi Anggaran gaya PSAP/pemerintahan
  (`docs/CHART-OF-ACCOUNTS-PHASE-5-INDUSTRY-GOVERNMENT.md`) — Anggaran
  retail di dokumen ini adalah fondasi yang bisa dipakai ulang, bukan
  pengganti kebutuhan itu.
