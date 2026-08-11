# Issue: Realtime Sync Memicu Full Refresh Semua Entity, Traffic DB Padat & LAN Lemot

Tanggal catatan: 2026-08-08

## Ringkasan

User melaporkan aplikasi terasa LEMOT saat dipakai di jaringan LAN. Dari
pengamatan traffic database (bukan traffic transaksi bisnis), traffic ke
PostgreSQL sudah padat walau baru host yang jalan (localhost), belum ada
client lain yang connect.

Hasil investigasi: penyebabnya adalah desain realtime sync yang melakukan
**full refresh ke seluruh entity (~50 read service, full table scan)**
setiap kali **satu baris saja** berubah di **salah satu dari 75 tabel**
yang di-wire ke trigger notify. Ini bukan masalah Dexie/IndexedDB, tapi
amplifikasi traffic di layer sync.

## Gejala yang Dilaporkan

- Host tunggal (belum ada client LAN lain), traffic query ke PostgreSQL
  sudah terlihat padat.
- Aplikasi terasa lemot saat dipakai di LAN dengan beberapa client.

## Temuan Awal

### 1. Semua tabel penting punya trigger notify tanpa granularitas konsumen

File terkait:

- `src-tauri/migrations/0034_realtime_notifications.sql` (loop generate
  trigger untuk 49 tabel dasar)
- Migration lanjutan yang menambah tabel lain ke trigger yang sama:
  `0037`, `0039`, `0040`, `0045`, `0052`, `0053`, `0056`, `0061`, `0067`,
  dan beberapa lain.

Kondisi sekarang:

- Fungsi `kasirku_notify_data_change()` terpasang sebagai trigger
  `AFTER INSERT OR UPDATE OR DELETE` di **75 tabel berbeda** (dihitung
  ulang langsung dari seluruh file migration).
- Tiap perubahan baris memanggil `PG_NOTIFY('kasirku_data_changes', ...)`
  dengan payload `{ table, operation, id, updated_at, emitted_at }` —
  payload sudah tahu tabel mana yang berubah.

Dampak: payload notify sebenarnya sudah cukup granular untuk tahu "apa
yang berubah", tapi granularitas ini **tidak dipakai** di sisi consumer
(lihat temuan #2).

### 2. Consumer notify selalu memicu refresh SEMUA entity, bukan yang berubah saja

File terkait:

- `src/hooks/useSyncQueueWorker.ts:247-306`
- `src/services/syncOrchestratorService.ts:116-183`

Kondisi sekarang:

- `useSyncQueueWorker` listen event Tauri `postgres-data-change`
  (`useSyncQueueWorker.ts:292-295`), menumpuk payload ke
  `pendingRealtimeChanges`, lalu debounce 750ms
  (`REALTIME_SYNC_DEBOUNCE_MS`) sebelum memanggil `runRealtimeSync()`.
- `runRealtimeSync()` (`useSyncQueueWorker.ts:247-271`) memanggil
  `runDatabaseRefreshNow()` **tanpa melihat isi `pendingRealtimeChanges`
  sama sekali** untuk menentukan apa yang perlu di-refresh — payload
  tabel hanya dipakai belakangan untuk invalidasi React Query cache
  (`invalidateServerAuthoritativeQueries`), bukan untuk membatasi refresh
  dari PostgreSQL.
- `runDatabaseRefreshNow()` → `refreshAllDataFromPostgres()`
  (`syncOrchestratorService.ts:116-174`) memanggil **~50
  `refreshXFromPostgres()` secara sequential** — chart of accounts,
  products, contacts, sales documents, journal entries, stock opnames,
  payroll, dst — semuanya, setiap kali dipanggil.

Dampak:

- 1 baris berubah di 1 tabel kecil (misal `taxes`) → memicu ~50 kali
  panggilan Tauri command + query PostgreSQL untuk seluruh entity lain
  yang tidak berhubungan sama sekali.
- Host sendiri jadi sumber loop: host menulis transaksi → trigger notify
  → host menerima notify-nya sendiri → host full-refresh 50 entity. Ini
  terjadi walau belum ada client LAN lain — cocok dengan gejala yang
  dilaporkan.
- Kalau ada N client di LAN, tiap client menerima notify yang sama dan
  masing-masing menjalankan full refresh sendiri-sendiri secara
  independen → traffic naik ~N kali lipat untuk setiap satu perubahan
  data di mana pun.

### 3. Mayoritas `refreshXFromPostgres()` melakukan full table scan, bukan delta fetch

File terkait (contoh):

- `src-tauri/src/repositories/chart_of_account_repository.rs:4-31`
  (`list_chart_of_accounts` — `SELECT ...` tanpa filter, tanpa limit)
- `src/services/chartOfAccountReadService.ts`

Kondisi sekarang:

- Repository Rust untuk mayoritas entity (chart of accounts, products,
  contacts, warehouses, roles, taxes, currencies, departments, dll) tidak
  punya parameter `updated_after`/cursor sama sekali di query list-nya.
- Read service pemanggilnya juga tidak menyimpan atau mengirim cursor
  apa pun — selalu tarik seluruh tabel.

Dampak: bahkan kalau Bagian 1 (scoped refresh) sudah dibenahi, refresh
untuk satu entity yang benar-benar berubah tetap melakukan full table
scan setiap kali dipanggil.

### 4. Pola delta fetch SUDAH ADA dan sudah jalan — tapi baru dipakai di 7 entity, dan 1 entity punya bug tidak memakainya

File terkait:

- `src/services/salesDocumentReadService.ts:362-392` (referensi pola yang
  benar)
- `src/services/journalEntryReadService.ts:148-163, 260-...`
- `src/services/stockOpnameReadService.ts`, `productionReadService.ts`,
  `openingBalanceReadService.ts`, `payrollReadService.ts`
- Rust: `src-tauri/src/repositories/fixed_asset_repository.rs:48-63`,
  `opening_balance_repository.rs:173`, `production_order_repository.rs:85`
- `src/services/postgresAdapter.ts` (adapter yang sudah punya opsi
  `updatedAfter`: `payrollRunPostgresAdapter`,
  `employeeCashAdvancePostgresAdapter`, `fixedAssetPostgresAdapter`,
  `fixedAssetDepreciationRunPostgresAdapter`, `stockOpnamePostgresAdapter`,
  `productionOrderPostgresAdapter`, `salesDocumentPostgresAdapter`,
  `journalEntryPostgresAdapter`, `openingBalancePostgresAdapter`)

Kondisi sekarang — pola yang sudah terbukti jalan (lihat
`salesDocumentReadService.ts:362-392`):

1. `getLatestLocalRemoteUpdatedAt()` baca Dexie lokal, ambil `MAX` dari
   `remote_updated_at` (fallback `updated_at` kalau `sync_status ===
   'synced'`) sebagai cursor awal.
2. Loop: panggil adapter `.list({ updatedAfter, limit })`, merge hasil ke
   Dexie, lalu update `updatedAfter` dari `getLatestRemoteBundleUpdatedAt`
   hasil batch tsb. Berhenti kalau batch lebih kecil dari limit atau
   cursor tidak maju lagi.
3. Query Rust-nya: `WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1)
   ORDER BY updated_at, id LIMIT $2` — hanya scan baris yang berubah
   sejak cursor.

Tapi:

- Pola ini **baru dipakai di 7 entity** (sales documents, journal
  entries, stock opnames, production orders, opening balances, payroll
  runs, employee cash advances) dari ~50 entity yang di-refresh.
- **Bug ditemukan**: `fixedAssetReadService.ts:123,128` memanggil
  `fixedAssetPostgresAdapter.list()` dan
  `fixedAssetDepreciationRunPostgresAdapter.list()` **tanpa argumen sama
  sekali**, padahal backend (Rust command + repository) sudah mendukung
  `updated_after`/`limit` secara penuh. Jadi fixed assets selalu full
  table scan walau kapabilitas delta-nya sudah ada dan tidak dipakai
  — perbaikan ini nyaris tanpa risiko (quick win).
- Helper `getLatestLocalRemoteUpdatedAt` / `getLatestRemoteBundleUpdatedAt`
  di-duplikasi terpisah di tiap read service (bukan shared util) — bukan
  bug, tapi peluang cleanup saat rollout ke entity lain.

### 5. Grouping tabel untuk invalidasi cache saat ini juga tidak lengkap

File terkait: `src/hooks/useSyncQueueWorker.ts:21-160`

Kondisi sekarang: ada 6 grup tabel (`CASHIER`, `COOPERATIVE`, `EMPLOYEE`,
`SETUP`, `FINANCE`, `PAYROLL`) yang dipetakan ke query key React Query,
mencakup 39 dari 75 tabel yang di-wire ke trigger notify. Sisanya (36
tabel, termasuk `products`, `contacts`, `sales_documents`,
`purchase_documents`, `stock_mutations`, `stock_opnames`, `roles`,
`taxes`, `currencies`, `warehouses`, `departments`, `projects`,
`activity_logs`, `auth_users`, tabel restaurant POS, dll) **tidak masuk
grup mana pun** — perubahan di tabel-tabel ini tetap memicu full refresh
lewat `runDatabaseRefreshNow()`, tapi tidak menginvalidasi query key
React Query yang relevan secara eksplisit.

Dampak: mapping "tabel → apa yang perlu di-refresh/invalidate" yang perlu
dibangun di Bagian 1 bukan sekadar memperluas 6 grup yang ada, tapi harus
dibangun lengkap untuk 75 tabel.

## Dugaan Akar Masalah

Dua gap independen yang saling memperkuat:

1. **Tidak ada scoping**: sistem tahu tabel apa yang berubah (dari
   payload notify) tapi tidak memakai informasi itu untuk membatasi
   refresh — semua refresh selalu "refresh semuanya".
2. **Tidak ada delta fetch di sebagian besar entity**: refresh yang
   dipicu (baik nanti sudah di-scope atau belum) masih full table scan
   untuk ~43 dari 50 entity (7 entity sudah delta, fixed assets ada
   kapabilitasnya tapi tidak dipakai).

Kombinasi keduanya membuat *1 perubahan baris* di sistem = *puluhan full
table scan* — dan ini terjadi di setiap PC yang connect ke PostgreSQL
yang sama, termasuk host itu sendiri.

## File Yang Perlu Diaudit Saat Fix

- `src/hooks/useSyncQueueWorker.ts`
- `src/services/syncOrchestratorService.ts`
- `src/services/postgresAdapter.ts`
- Seluruh `src/services/*ReadService.ts` (~50 file, lihat import list di
  `syncOrchestratorService.ts:1-77`)
- `src-tauri/src/repositories/*.rs` (38 file)
- `src-tauri/src/commands/*_commands.rs` (list command per entity)
- `src-tauri/migrations/0034_realtime_notifications.sql` dan migration
  lanjutan yang menambah tabel ke trigger `kasirku_notify_data_change`

## Rencana Implementasi

Dua bagian ini independen secara teknis (bisa dikerjakan terpisah/oleh
PR terpisah) tapi saling melengkapi: Bagian 1 mengurangi **jumlah**
refresh yang jalan per perubahan data, Bagian 2 mengurangi **biaya**
tiap refresh yang tetap jalan.

### Bagian 1 — Scoped Realtime Refresh

Tujuan: 1 perubahan di 1 tabel hanya memicu refresh entity yang relevan,
bukan seluruh ~50 entity.

Langkah:

1. Bangun 1 mapping terpusat `REALTIME_TABLE_TO_ENTITY` yang memetakan
   **seluruh 75 nama tabel** (bukan cuma yang sudah ada di 6 grup
   sekarang) ke:
   - fungsi `refreshXFromPostgres()` yang perlu dipanggil, dan
   - query key React Query yang perlu di-invalidate (reuse struktur
     grup yang sudah ada di `useSyncQueueWorker.ts` sebagai starting
     point, lengkapi 36 tabel yang belum masuk grup mana pun — lihat
     Temuan #5).
   - Tandai eksplisit tabel anak (`*_items`, `*_lines`) ke entity
     bundle induknya (misal `sales_document_items` → refresh
     `salesDocuments`, bukan entity terpisah), supaya mapping tetap
     selaras dengan struktur bundle yang sudah dipakai read service.
2. Ganti `runRealtimeSync()` di `useSyncQueueWorker.ts` supaya memakai
   `pendingRealtimeChanges` (bukan diabaikan): kumpulkan set unik nama
   tabel dari batch, resolve ke set fungsi refresh + query key lewat
   mapping, jalankan hanya fungsi-fungsi itu (bisa paralel dengan
   `Promise.all`, bukan sequential seperti `refreshAllDataFromPostgres`).
3. Sediakan fallback aman: kalau ada nama tabel di payload yang **tidak
   ada di mapping** (migration baru lupa didaftarkan), log warning dan
   fallback ke `refreshAllDataFromPostgres()` untuk batch itu saja —
   supaya kesalahan mapping gagal aman (stale data dicegah), bukan diam
   -diam melewatkan refresh.
4. Pertahankan `runDatabaseSyncNow()` (dipanggil saat tombol Sync DB
   manual, reconnect, dan startup) tetap full refresh semua entity apa
   adanya — scoping ini hanya untuk jalur realtime otomatis, bukan
   sync manual/recovery.
5. Tambah test/verifikasi manual: trigger perubahan di 1 tabel yang
   representatif dari tiap grup (mis. `taxes`, `products`,
   `sales_documents`, `journal_entries`) dan pastikan hanya
   `refreshXFromPostgres()` yang relevan yang terpanggil (bisa dicek
   lewat console.info log yang sudah ada di `refreshAllDataFromPostgres`
   atau tambah log serupa di jalur scoped).

File yang disentuh: `src/hooks/useSyncQueueWorker.ts`,
`src/services/syncOrchestratorService.ts` (kemungkinan perlu diexport
per-entity refresh map dari sini juga), dan penambahan 1 file baru
untuk mapping (misal `src/services/realtimeSyncTableMap.ts`).

Risiko / hal yang perlu diperhatikan:

- Mapping harus 100% lengkap terhadap daftar trigger di migration, atau
  ada proses/reminder supaya migration baru yang menambah tabel ke
  trigger notify **wajib** menambah entrinya juga di mapping ini
  (idealnya ada test yang membandingkan daftar tabel di migration vs
  daftar key di mapping, biar tidak diam-diam out of sync lagi seperti
  Temuan #5).
- Burst notify dari 1 transaksi majemuk (misal 1 penjualan yang menyentuh
  `sales_documents`, `sales_document_items`, `stock_mutations`,
  `finance_transactions`, `journal_entries`, `journal_entry_lines`)
  tetap harus di-debounce jadi 1 batch (mekanisme debounce 750ms yang
  ada sekarang dipertahankan), lalu di dalam batch itu di-dedupe per
  entity target sebelum dieksekusi.

### Bagian 2 — Delta Fetch (Incremental Refresh)

Tujuan: refresh entity yang benar-benar berubah tidak lagi full table
scan, memakai pola yang sudah terbukti jalan di 7 entity yang sudah ada.

Langkah:

1. **Quick win (low risk, kerjakan duluan)**: perbaiki
   `fixedAssetReadService.ts:123,128` supaya memakai pola
   `getLatestLocalRemoteUpdatedAt` + loop `updatedAfter`/`limit` seperti
   `salesDocumentReadService.ts`, karena backend (repository + command +
   adapter) sudah mendukung penuh — tidak perlu sentuh Rust maupun
   migration sama sekali untuk langkah ini.
2. Definisikan template implementasi delta fetch per entity (dari pola
   `salesDocumentReadService.ts` + `fixed_asset_repository.rs`):
   - Rust repository: ubah query `list_x` menerima
     `updated_after: Option<String>, limit: Option<i64>`, tambahkan
     `WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1) ORDER BY
     updated_at, id LIMIT $2`.
   - Tauri command: tambah parameter `updated_after`/`limit`, teruskan
     ke repository.
   - `postgresAdapter.ts`: ubah `list()` adapter entity terkait supaya
     menerima `{ updatedAfter?, limit? }`.
   - Read service: tambah `getLatestLocalRemoteUpdatedAt` +
     `getLatestRemoteBundleUpdatedAt` + loop pagination, ganti
     pemanggilan `list()` polos jadi loop tsb.
   - (Opsional, sekalian cleanup) ekstrak helper cursor jadi 1 shared
     util generic (`src/services/shared/remoteRefreshCursor.ts` misalnya)
     dipakai semua entity termasuk yang lama, supaya tidak terus
     terduplikasi per file seperti sekarang.
3. Rollout bertahap berdasar prioritas (tabel besar / paling sering
   berubah duluan, karena itu yang paling besar penghematannya):
   - Prioritas tinggi: `products`, `contacts`, `chart_of_accounts`,
     `cooperative_members`, `cooperative_saving_transactions`,
     `cooperative_loans`, `cooperative_loan_installments`,
     `inventory_lots`, `stock_mutations`.
   - Prioritas menengah: `employees` + tabel turunannya, `purchase_documents`,
     `finance_account_mappings`, tabel restaurant POS.
   - Prioritas rendah / boleh tetap full fetch: tabel master data kecil
     dan jarang berubah (`roles`, `taxes`, `payment_methods`,
     `warehouses`, `departments`, `currencies`, singleton settings) —
     full scan di tabel-tabel ini murah, tidak sepadan effort delta
     fetch-nya.
4. Delete/tombstone handling: pastikan tiap entity yang di-delta-kan
   tetap menerima baris `deleted_at` (soft-delete) lewat query yang sama
   (kolom `deleted_at` sudah ada di kebanyakan DTO, lihat
   `fixed_asset_repository.rs` `ASSET_SELECT`) — delta fetch tanpa
   tombstone akan membuat baris yang dihapus di server tidak pernah
   terhapus di client lain.

File yang disentuh (per entity yang di-migrasikan): 1 file repository
Rust, 1 file command Rust, `postgresAdapter.ts`, 1 file read service.
Untuk 43 entity yang belum delta, ini pekerjaan berulang dengan pola
yang sama — cocok dikerjakan bertahap per PR per grup entity, bukan 1 PR
raksasa.

Risiko / hal yang perlu diperhatikan:

- Perlu index Postgres `(updated_at)` atau `(updated_at, id)` di tabel
  yang di-delta-kan supaya query cursor tetap cepat saat tabel besar.
- Clock skew antara beberapa baris yang di-update dalam transaksi yang
  sama pada timestamp identik — pola `ORDER BY updated_at, id` di
  implementasi yang sudah ada sudah menangani ini sebagai tie-breaker,
  ikuti pola yang sama.
- `getLatestLocalRemoteUpdatedAt` di pola yang ada melakukan
  `db.<table>.toArray()` penuh di Dexie lokal untuk cari MAX — cukup
  murah untuk data lokal, tapi kalau salah satu tabel yang dimigrasikan
  sangat besar di local, pertimbangkan simpan cursor terpisah (misal di
  tabel sync metadata) alih-alih scan seluruh tabel lokal tiap refresh.

## Urutan Pengerjaan yang Direkomendasikan

1. Bagian 2, langkah 1 (fix bug `fixedAssetReadService`) — quick win,
   risiko nyaris nol, bisa jalan duluan sambil bagian lain disiapkan.
2. Bagian 1 (scoped refresh) — dampak terbesar terhadap traffic karena
   langsung memotong faktor "~50x" untuk setiap perubahan, scope
   berubahnya terbatas ke 2-3 file frontend, tidak menyentuh Rust/DB.
3. Bagian 2, langkah 2-4 (rollout delta fetch bertahap) — dikerjakan
   setelah Bagian 1 stabil, karena tiap entity yang sudah di-scope di
   Bagian 1 otomatis langsung dapat manfaat begitu entity itu
   dimigrasikan ke delta fetch.

## Acceptance Criteria

- Perubahan 1 baris di 1 tabel tidak lagi memicu pemanggilan
  `refreshXFromPostgres()` untuk entity yang tidak berhubungan.
- Traffic query PostgreSQL yang teramati di host tunggal (tanpa client
  lain) turun signifikan dibanding baseline saat ini untuk skenario
  "1 transaksi kasir biasa".
- Tabel yang sudah dimigrasikan ke delta fetch tidak lagi melakukan
  `SELECT` tanpa filter `updated_at` saat refresh rutin (full fetch
  hanya terjadi saat local Dexie kosong/pertama kali install atau saat
  user memicu sync manual, sesuai kebutuhan).
- `fixedAssetReadService` memakai `updatedAfter`/pagination, bukan
  `list()` tanpa argumen.
- Tidak ada tabel di daftar trigger notify (`kasirku_notify_data_change`)
  yang luput dari mapping scoped refresh — perubahan padanya tetap
  memicu refresh entity yang benar (via mapping eksplisit, bukan
  fallback full refresh terus-menerus).
- Data tetap konsisten lintas PC (tidak ada regresi dari perilaku full
  refresh yang ada sekarang) — termasuk baris yang di-soft-delete tetap
  ter-propagate ke client lain.

## Status

**2026-08-08 — Quick win (Bagian 2 langkah 1) dan Bagian 1 (scoped realtime
refresh) sudah dikerjakan.** Bagian 2 langkah 2-4 (rollout delta fetch
sistematis ke entity lain: products, contacts, cooperative_*, chart of
accounts, dll) **BELUM dikerjakan** — itu akan jadi pekerjaan terpisah.

Ringkasan perubahan:

1. **Quick win — `src/services/fixedAssetReadService.ts`**: `refreshFixedAssetsFromPostgres`
   dan `refreshFixedAssetRunsFromPostgres` sekarang memakai pola
   `getLatestLocal*UpdatedAt()` + loop pagination `updatedAfter`/`limit`
   (mengikuti pola `salesDocumentReadService.ts:362-392`), plus guard
   concurrency (`isRefreshing...`) yang sudah dipakai entity delta-fetch
   lain. Tidak ada perubahan Rust/migration — backend sudah mendukung
   `updated_after`/`limit` sejak awal, hanya tidak dipakai sisi frontend.

2. **Bagian 1 — Scoped Realtime Refresh**:
   - File baru `src/services/realtimeSyncTableMap.ts` berisi
     `REALTIME_TABLE_TO_ENTITY`, mapping **seluruh 74 tabel** yang di-wire
     ke trigger `kasirku_notify_data_change` (lihat catatan jumlah di
     bawah) ke refresh function yang relevan + query key React Query yang
     relevan, plus helper `resolveRealtimeRefreshPlan()` yang men-dedupe
     refresh function & query key untuk satu batch perubahan. Tabel anak
     (`*_items`, `*_lines`, dst) dipetakan ke refresh function bundle
     induknya, bukan entity terpisah. 5 grup existing (CASHIER, COOPERATIVE,
     SETUP, FINANCE, PAYROLL) dipindah ke file ini (di-reuse, bukan
     didefinisikan ulang) dan dilengkapi untuk seluruh tabel yang
     sebelumnya tidak masuk grup mana pun.
   - `runRealtimeSync()` di `src/hooks/useSyncQueueWorker.ts` sekarang
     memakai isi `pendingRealtimeChanges` untuk resolve set unik tabel yang
     berubah, lalu menjalankan HANYA `refreshXFromPostgres()` yang relevan
     secara paralel (`Promise.all`) dan invalidate hanya query key yang
     relevan — bukan `refreshAllDataFromPostgres()` untuk setiap notify.
   - Fail-safe: kalau ada nama tabel di payload yang tidak dikenali oleh
     `REALTIME_TABLE_TO_ENTITY` (mis. migration baru lupa didaftarkan),
     `console.warn` lalu fallback ke `refreshAllDataFromPostgres()` untuk
     batch itu saja.
   - `runDatabaseSyncNow()` / `runDatabaseRefreshNow()` (tombol Sync DB
     manual, reconnect, startup) **tidak diubah** — tetap full refresh
     semua entity seperti sebelumnya.

3. **Koreksi jumlah tabel**: investigasi awal menyebut 75 tabel. Saat
   membangun mapping, tabel di seluruh migration (`0034`, `0038`-`0041`,
   `0046`-`0048`, `0052`-`0054`, `0056`, `0061`, `0067`) dihitung ulang
   secara terprogram (regex atas `ARRAY[...]` dan `CREATE TRIGGER ... ON`)
   dan hasilnya **74 tabel unik**, bukan 75 — kemungkinan hitungan awal
   ikut menghitung literal `public` dari string format dinamis
   (`'...ON public.%I...'`) sebagai satu "tabel". Mapping baru sudah
   diverifikasi cocok 1:1 (tidak ada yang hilang, tidak ada duplikat/typo)
   terhadap 74 tabel hasil hitung ulang ini.

4. **Gap yang ditemukan saat membangun mapping (di luar scope prompt ini,
   dicatat apa adanya, bukan diperbaiki)**: 11 dari 74 tabel ternyata belum
   punya jalur pull (`refreshXFromPostgres`) ke Dexie sama sekali —
   `server_auth_sessions`, `cooperative_payment_approval_requests` (hanya
   fetch on-demand via React Query, tidak lewat Dexie),
   `cooperative_payment_policy`, `cooperative_posting_accounts`,
   `stock_mutations`, `inventory_lots`, `inventory_lot_consumptions`,
   `product_recipes`, `product_recipe_items`, `purchase_cost_reconciliations`,
   `purchase_cost_reconciliation_items` — plus 4 tabel restaurant POS
   (`restaurant_sessions`, `restaurant_tables`, `restaurant_orders`,
   `restaurant_kitchen_tickets`) yang murni Dexie-local (belum ada sinkron
   Postgres sama sekali). Tabel-tabel ini tetap punya entri eksplisit di
   `REALTIME_TABLE_TO_ENTITY` (refresh function kosong, bukan "tidak
   termapping") supaya tidak memicu fallback full-refresh yang percuma
   (toh full refresh juga tidak menyentuh tabel ini). Ini bukan regresi —
   perilaku sebelumnya juga tidak pernah menyinkronkan tabel-tabel ini.

**Belum diuji terhadap PostgreSQL nyata / LAN multi-PC** — verifikasi
sejauh ini terbatas pada `bun run build` (`tsc -b`, pass) dan `bun run
lint` (pass; ada 1 error + 2 warning pre-existing di file lain yang tidak
disentuh perubahan ini, dikonfirmasi lewat `git stash`). Belum ada
percobaan trigger perubahan data sungguhan di PostgreSQL untuk
mengonfirmasi hanya `refreshXFromPostgres()` yang relevan yang terpanggil
(langkah 5 di rencana Bagian 1) — perlu dicoba manual di environment
dengan PostgreSQL live.

File yang diubah/ditambah:
- `src/services/fixedAssetReadService.ts` (diubah)
- `src/services/realtimeSyncTableMap.ts` (baru)
- `src/hooks/useSyncQueueWorker.ts` (diubah)

---

**2026-08-08 — Bagian 2, slice 1 (shared cursor util + delta fetch
`chart_of_accounts`, `contacts`, `products`) sudah dikerjakan.** Ini
adalah rollout pertama dari "Bagian 2 langkah 2-4" ke entity nyata (di
luar quick win fixed assets yang sudah dicatat di atas). 3 entity ini
dipilih sebagai pilot dari daftar prioritas tinggi di rencana Bagian 2.

Ringkasan perubahan:

1. **Shared cursor util (baru) — `src/services/shared/remoteRefreshCursor.ts`**:
   versi generic dari pola yang sebelumnya terduplikasi di
   `salesDocumentReadService.ts` dan `fixedAssetReadService.ts`:
   `toTimestamp()`, `getLaterUpdatedAt()`, dan dua fungsi generic berbasis
   selector `getLatestLocalRemoteUpdatedAt<T>()` /
   `getLatestRemoteUpdatedAt<T>()`. Dipakai oleh 3 read service pilot di
   bawah. 8 entity yang sudah delta fetch sebelumnya (sales documents,
   journal entries, stock opnames, production orders, opening balances,
   payroll runs, employee cash advances, fixed assets) **tidak** diubah
   untuk pindah ke util ini — tetap pakai duplikat masing-masing seperti
   sebelumnya (di luar scope slice ini).

2. **Rust — repository + command** (`chart_of_account_repository.rs`,
   `contact_repository.rs`, `product_repository.rs` dan 3 file command
   pasangannya): `list_chart_of_accounts` / `list_contacts` /
   `list_products` sekarang menerima `updated_after: Option<String>,
   limit: Option<i64>` dan memakai query cursor
   `WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1::TIMESTAMPTZ)
   ORDER BY updated_at, id LIMIT $2` (pola sama persis dengan
   `fixed_asset_repository.rs`), limit di-clamp 1-1000.
   - **Bug tombstone diperbaiki**: query lama punya `WHERE deleted_at IS
     NULL` di ketiga entity ini, jadi baris yang di-soft-delete di server
     tidak pernah terkirim ke client mana pun (bahkan di full fetch lama).
     Query baru tidak lagi memfilter `deleted_at`, jadi baris terhapus
     ikut terkirim lewat cursor seperti baris lain. Sisi client sudah
     siap menerimanya: `productReadService.ts` sudah `db.products.delete()`
     saat `deleted_at` ada; `chartOfAccountReadService.ts` dan
     `contactReadService.ts` cuma set `is_active: false` (soft-flag,
     bukan hard delete) — perilaku ini **tidak diubah**, sesuai instruksi.
   - `ORDER BY` diubah ke `updated_at, id` (sebelumnya `code ASC` untuk
     chart_of_accounts, `name ASC` untuk contacts, `created_at DESC`
     untuk products) supaya cursor pagination tidak melewati/mengulang
     baris.
   - `get_x_by_id` / `upsert_x` / `delete_x` (single-row) **tidak
     diubah** — di luar scope slice ini, bug tombstone hanya ada di jalur
     list.

3. **`src/services/postgresAdapter.ts`**: `chartOfAccountPostgresAdapter.list()`,
   `contactPostgresAdapter.list()`, `productPostgresAdapter.list()` diubah
   dari tanpa argumen menjadi `(options: PostgresListOptions = {})`,
   meneruskan `{ updatedAfter, limit }` ke `invoke()` — mengikuti pola
   `salesDocumentPostgresAdapter.list()`, bukan pola positional-args lama
   (`fixedAssetPostgresAdapter`).

4. **Read service** (`chartOfAccountReadService.ts`, `contactReadService.ts`,
   `productReadService.ts`): `refreshChartOfAccountsFromPostgres()`,
   `refreshContactsFromPostgres()`, `refreshProductsFromPostgres()`
   (signature publik tidak berubah, tetap tanpa argumen) sekarang memakai
   shared cursor util + loop pagination `updatedAfter`/`limit` (limit 500
   per halaman), persis pola `salesDocumentReadService.ts:362-392`,
   termasuk guard concurrency (`isRefreshing...`) dan penanganan
   `isPostgresUnavailableError` yang sudah ada di entity delta-fetch lain.
   Duplikat lokal `toTimestamp()` di ketiga file ini dihapus, diganti
   import dari shared util.

5. **Migration baru — `src-tauri/migrations/0073_delta_fetch_pilot_indexes.sql`**:
   index `(updated_at, id)` untuk `chart_of_accounts`, `contacts`,
   `products`, supaya query cursor tetap cepat saat tabel besar. Index
   saja, tidak mengubah skema/data.

Verifikasi yang sudah dilakukan:
- `cargo check` di `src-tauri/`: **pass**, tanpa error.
- `bun run build` (`tsc -b` + vite build): **pass**, tanpa error type.
- `bun run lint` (`eslint .`): **pass** dalam arti tidak ada regresi baru
  — 1 error (`JoinExistingHostModal.tsx`) + 2 warning
  (`CashFlowReport.tsx`, `StockCard.tsx`) yang muncul sudah
  dikonfirmasi pre-existing di file yang **tidak disentuh** perubahan ini
  (dicek lewat `git status` terhadap file-file yang diubah slice ini).

**Belum diuji terhadap PostgreSQL nyata.** Migration index baru belum
benar-benar dijalankan ke database live, dan perilaku delta fetch +
tombstone (update 1 baris → hanya baris itu yang ke-refresh; soft-delete
1 baris → baris itu hilang/ter-flag `is_active: false` di Dexie client
lain) belum dicoba end-to-end. Perlu diverifikasi manual di environment
dengan PostgreSQL live sebelum dianggap selesai secara operasional.

Sisa pekerjaan Bagian 2 yang **belum dikerjakan** (di luar scope slice
ini, butuh prompt/investigasi terpisah):

- **Cooperative bundle** (`cooperative_members`, `cooperative_loans`,
  `cooperative_saving_transactions`, `cooperative_loan_installments`):
  keempatnya dipetakan ke satu fungsi
  `refreshCooperativeDataFromPostgres` — perlu investigasi dulu apakah
  bisa displit per-tabel jadi delta fetch independen, atau harus tetap 1
  cursor bersama karena ada dependensi urutan/relasi antar tabel.
- **`inventory_lots` dan `stock_mutations`**: prioritas tinggi di rencana
  awal, tapi ternyata **belum ada jalur pull sama sekali** (bukan "belum
  delta fetch" — tidak ada adapter/DTO/read-service dari Postgres ke
  Dexie untuk keduanya). Ini pekerjaan bikin fitur baru dari nol, bukan
  migrasi pola existing.
- **`employees` + tabel turunannya** (prioritas menengah di rencana),
  **`purchase_documents`** (prioritas menengah), **`finance_account_mappings`**
  (prioritas menengah), **tabel restaurant POS** (prioritas menengah).
- Entity prioritas rendah yang **boleh tetap full fetch** sesuai rencana
  awal (tidak perlu dimigrasikan): `roles`, `taxes`, `payment_methods`,
  `warehouses`, `departments`, `currencies`, singleton settings — tabel
  master data kecil dan jarang berubah, full scan di sini murah.

File yang diubah/ditambah pada slice ini:
- `src/services/shared/remoteRefreshCursor.ts` (baru)
- `src-tauri/src/repositories/chart_of_account_repository.rs` (diubah)
- `src-tauri/src/repositories/contact_repository.rs` (diubah)
- `src-tauri/src/repositories/product_repository.rs` (diubah)
- `src-tauri/src/commands/chart_of_account_commands.rs` (diubah)
- `src-tauri/src/commands/contact_commands.rs` (diubah)
- `src-tauri/src/commands/product_commands.rs` (diubah)
- `src/services/postgresAdapter.ts` (diubah)
- `src/services/chartOfAccountReadService.ts` (diubah)
- `src/services/contactReadService.ts` (diubah)
- `src/services/productReadService.ts` (diubah)
- `src-tauri/migrations/0073_delta_fetch_pilot_indexes.sql` (baru)

---

**2026-08-08 — Bagian 2, slice 2 (cooperative bundle) sudah dikerjakan** di commit
`f937ea5` (bukan dalam sesi yang menulis dokumen ini, tapi ditemukan sudah selesai
saat sesi berikutnya mengaudit sisa pekerjaan) — `cooperative_members`,
`cooperative_saving_transactions`, `cooperative_member_saving_balances`,
`cooperative_loans`, `cooperative_loan_installments`, `cooperative_loan_payments`
masing-masing dipecah jadi delta fetch independen (`refreshCooperativeXFromPostgres`
per tabel di `cooperativeReadService.ts`), `cooperative_loans`/`cooperative_loan_installments`
dipindah dari hard-delete ke soft-delete (`deleted_at`, migration
`0074_cooperative_bundle_delta_fetch.sql`) supaya kompatibel dengan cursor
pagination. Dicatat di sini karena bagian "Sisa pekerjaan" sebelumnya sempat
salah menyebut ini "belum dikerjakan, butuh investigasi terpisah" — itu sudah
tidak akurat.

---

**2026-08-08 — Bagian 2, slice 3 (rollout delta fetch prioritas menengah + 2 pull-path baru)
sudah dikerjakan**, sebagai tindak lanjut diskusi "sisa-sisa pekerjaan" di atas.
Restaurant POS (`restaurant_sessions/tables/orders/kitchen_tickets`) **sengaja
di-skip** atas keputusan user — bukan optimasi delta fetch, itu proyek fitur baru
(bangun sync dua arah dari nol, tabelnya sampai sekarang nol kode Rust/TS yang
menyentuhnya) dan tidak berkontribusi ke traffic padat saat ini (trigger-nya
tidak pernah fired karena tidak ada yang menulis ke tabel itu).

Ringkasan perubahan:

1. **Delta fetch conversion (pola sudah ada, kontainable)** — 3 entity, ngikutin
   pola persis `salesDocumentReadService.ts`/slice 1:
   - `finance_account_mappings` (`accounting_setting_repository.rs`,
     `accountingSettingReadService.ts`) — tabel master kecil, tapi tetap
     dikonversi untuk konsistensi.
   - `employees` bundle (`employees` + `employee_areas` + `employee_collection_schedules`,
     `employee_repository.rs`, `employeeReadService.ts`) — sekalian perbaiki bug
     tombstone yang sama seperti slice 1: query `list_employees` lama punya
     `WHERE deleted_at IS NULL` sehingga karyawan yang di-soft-delete di server
     tidak pernah terkirim ke client lain; filter itu dibuang dari jalur list
     (jalur `get`/`upsert` single-row tidak disentuh, sesuai pola slice 1).
   - `purchase_documents` bundle (+ `purchase_document_items`,
     `purchase_document_repository.rs`, `purchaseDocumentReadService.ts`) —
     `ORDER BY` diubah dari `created_at DESC` ke `updated_at, id` supaya cursor
     pagination valid; purchase_documents tidak punya kolom `deleted_at` (dibatalkan
     lewat status/`voided_at`, bukan hard delete) jadi tidak ada isu tombstone di sini.

2. **`stock_mutations` — pull-path baru (read-only cache)**: repository/command
   Rust sudah lama ada tapi tidak pernah dipanggil dari frontend (dead code).
   Ditambahkan: parameter `created_after`/`limit` di `list_stock_mutations`
   (cursor di `created_at`, bukan `updated_at` — tabelnya append-only, baris tidak
   pernah di-UPDATE setelah insert), tabel Dexie baru `stockMutations` (migration
   `v114`, murni cache baca — alur penulisan mutasi yang sudah ada di
   checkoutService/productionService/dll **tidak diubah**, tetap push langsung ke
   queue tanpa nulis lokal dulu), read service baru
   `src/services/stockMutationReadService.ts` (merge id-keyed sederhana, tidak
   perlu guard konflik karena baris immutable).

3. **`inventory_lots` + `inventory_lot_consumptions` — dibangun dari nol (bukan
   pull-path saja)**: audit ulang nemuin tabel Postgres-nya ada (migration 0018)
   dan sudah di-wire ke trigger notify sejak awal, tapi **nol kode Rust/TS**
   pernah menyentuhnya sama sekali — beda dari `stock_mutations` yang setidaknya
   punya write-path. `addInventoryLot()`/`consumeFifoLots()` (dipakai checkout,
   produksi, pembelian, retur, stock opname, void) 100% lokal Dexie.

   Desain yang dipakai (lihat komentar di `inventory_lot_repository.rs` untuk detail):
   - `quantity_remaining` tidak pernah diset lewat upsert biasa (baik arah push
     maupun pull) — field itu HANYA pernah bergerak lewat
     `upsert_inventory_lot_consumption`, yang secara atomik melakukan
     `quantity_remaining = quantity_remaining - $delta` di server (pola identik
     `stock_mutation_repository::upsert_stock_mutation_in_tx` untuk
     `products.stock`). Ini supaya dua device yang konsumsi lot yang sama nyaris
     bersamaan tidak saling menimpa hasil decrement satu sama lain. Tidak
     di-clamp ke nol — sistem ini offline-first, lot yang minus karena dua
     device sama-sama konsumsi sebelum saling tahu adalah trade-off yang
     diterima, bukan bug yang dijaga di sini.
   - Konsekuensinya: field `quantity_remaining` pada baris yang SUDAH ada secara
     lokal **tidak pernah ditimpa oleh pull dari device lain** (hanya field
     identitas/biaya yang ikut ter-update: `cost_status`, `final_cost_per_unit`,
     dll) — nilainya hanya diisi sekali saat device itu pertama kali menerima
     lot tsb. Ini konsisten (simetris) dengan sisi push, tapi artinya **belum
     ada rekonsiliasi otomatis lintas-device untuk quantity_remaining pada lot
     yang sudah pernah dilihat device tsb** — device itu harus menghitungnya
     sendiri dari total `inventory_lot_consumptions` yang sudah di-pull kalau
     mau tahu sisa stok gabungan semua device. **Ini gap yang disadari, bukan
     diselesaikan** — dicatat sebagai sisa pekerjaan di bawah.
   - `cooperative_loans`-style hard-delete tidak relevan di sini karena baik
     lot maupun consumption tidak pernah di-hard-delete di alur manapun yang ada.
   - Push: sync-queue entity baru `inventoryLots`/`inventoryLotConsumptions` di
     `syncQueueService.ts` (mapper, type guard, processor, mark-synced,
     enqueue helper, pending scanner). **Enqueue TIDAK dipanggil langsung di
     dalam `addInventoryLot()`/`consumeFifoLots()`** — kedua fungsi itu dipanggil
     di dalam `db.transaction()` milik pemanggilnya yang tidak menyertakan
     `db.syncQueue` (persis seperti `stockMutations`, yang enqueue-nya juga
     sengaja di luar transaksi). Sebagai gantinya baris ditandai
     `sync_status: 'pending'` di dalam transaksi (aman, `db.inventoryLots`/
     `db.inventoryLotConsumptions` sudah termasuk scope transaksi pemanggil),
     lalu scanner `enqueuePendingInventoryLotsForSync`/
     `enqueuePendingInventoryLotConsumptionsForSync` (dipanggil dari
     `enqueueAllPendingLocalChangesForSync`, jalan saat startup/reconnect/tombol
     Sync DB manual) yang mengambil alih push-nya belakangan. **Konsekuensi**:
     lot/consumption baru tidak langsung ter-push detik itu juga seperti entity
     lain (yang enqueue tepat setelah transaksinya selesai) — baru ter-push saat
     salah satu dari 3 trigger itu jalan. Alternatif "enqueue tepat setelah
     transaksi" butuh mengubah return value + lokasi enqueue di 6 file alur
     transaksi (checkoutService, productionService, purchaseDocumentService,
     stockOpnameService, transactionVoidService, salesReturnService,
     salesDocumentService) — sengaja tidak dikerjakan di slice ini karena
     risikonya (breaking alur transaksi uang) tidak sepadan dengan percepatan
     beberapa detik.
   - Cost finalization (`purchaseCostReconciliationService.ts`) sekarang juga
     menandai `sync_status: 'pending'` supaya ikut ter-enqueue oleh scanner.
   - Pull: read service baru `src/services/inventoryLotReadService.ts`,
     `inventory_lots` cursor di `updated_at` (kolom TEXT bukan TIMESTAMPTZ di
     skema aslinya — dibandingkan sebagai teks langsung, aman karena app selalu
     menulis `.toISOString()` yang fixed-width), `inventory_lot_consumptions`
     cursor di `created_at` (append-only, sama seperti `stock_mutations`).
   - Dexie: `InventoryLot`/`InventoryLotConsumption` dapat field sync
     (`sync_status`, `sync_error`, `last_synced_at`, `remote_updated_at` khusus
     lot) di `src/types/index.ts`, migration `v115` menambah index `sync_status`
     + backfill SEMUA baris lokal yang sudah ada jadi `pending` (sama seperti
     precedent `chartOfAccounts` v70) — artinya start pertama setelah upgrade ini
     akan memicu burst push untuk seluruh histori lot/consumption yang selama ini
     cuma ada di Dexie satu device. Belum ada throttling untuk burst ini di luar
     mekanisme sync-queue worker yang sudah ada.

4. **Migration index baru**: `src-tauri/migrations/0075_delta_fetch_rollout_indexes.sql`
   — index `(updated_at, id)` untuk `employees`, `employee_areas`,
   `employee_collection_schedules`, `purchase_documents`,
   `finance_account_mappings`, `inventory_lots`; index `(created_at, id)` untuk
   `stock_mutations`, `inventory_lot_consumptions`.

5. **`realtimeSyncTableMap.ts`**: `stock_mutations`, `inventory_lots`,
   `inventory_lot_consumptions` diubah dari `refreshFns: noRefresh` jadi
   memanggil refresh function masing-masing (sebelumnya notify di tabel ini
   tidak memicu apa pun sama sekali). `inventory_lots`/`inventory_lot_consumptions`
   juga meng-invalidate query key `['stockCard']`.

Verifikasi yang sudah dilakukan:
- `cargo check` di `src-tauri/`: **pass**, tanpa error.
- `bun run build` (`tsc -b` + vite build): **pass**, tanpa error type.
- `bun run lint`: **pass** — 1 error + 2 warning yang muncul dikonfirmasi
  pre-existing di file yang tidak disentuh (persis temuan yang sama dengan
  slice 1, file-nya juga sama).

**Belum diuji terhadap PostgreSQL nyata / LAN multi-PC**, sama seperti slice-slice
sebelumnya. Yang paling penting untuk diverifikasi manual sebelum dianggap selesai
secara operasional:
- Perilaku atomic-decrement `upsert_inventory_lot_consumption` di bawah konkurensi
  sungguhan (dua device konsumsi lot yang sama nyaris bersamaan) — baru diverifikasi
  lewat pembacaan kode, belum dicoba nyata.
- Burst push dari migration `v115` backfill saat pertama kali device existing
  upgrade ke versi ini.
- Delay push inventory_lots/inventory_lot_consumptions sampai ke salah satu
  trigger (startup/reconnect/manual sync) — perlu dikonfirmasi apakah delay ini
  cukup cepat dalam pemakaian nyata atau perlu dipercepat di iterasi berikutnya.

Sisa pekerjaan yang **disadari tapi belum dikerjakan** (di luar scope slice ini):
- **Rekonsiliasi `quantity_remaining` lintas-device** untuk lot yang sudah pernah
  dilihat suatu device (lihat penjelasan desain di atas) — butuh keputusan
  produk/desain terpisah, bukan sekadar tambahan kode.
- **Push langsung setelah transaksi** untuk inventory_lots/inventory_lot_consumptions
  (saat ini baru ter-push lewat scanner periodik) — butuh menyentuh 6 file alur
  transaksi, sengaja ditunda.
- **Restaurant POS** — di-skip atas keputusan user, statusnya sama seperti
  sebelumnya (nol integrasi Postgres).
- Entity prioritas rendah yang tetap boleh full fetch (tidak berubah dari
  rencana awal): `roles`, `taxes`, `payment_methods`, `warehouses`,
  `departments`, `currencies`, singleton settings.

File yang diubah/ditambah pada slice ini:
- `src-tauri/src/repositories/accounting_setting_repository.rs`,
  `employee_repository.rs`, `purchase_document_repository.rs`,
  `stock_mutation_repository.rs` (diubah)
- `src-tauri/src/repositories/inventory_lot_repository.rs` (baru)
- `src-tauri/src/models/inventory_lot.rs` (baru)
- `src-tauri/src/commands/accounting_setting_commands.rs`,
  `employee_commands.rs`, `purchase_document_commands.rs`,
  `stock_mutation_commands.rs` (diubah)
- `src-tauri/src/commands/inventory_lot_commands.rs` (baru)
- `src-tauri/src/models/mod.rs`, `repositories/mod.rs`, `commands/mod.rs`,
  `lib.rs` (diubah — registrasi modul/command baru)
- `src-tauri/migrations/0075_delta_fetch_rollout_indexes.sql` (baru)
- `src/services/postgresAdapter.ts`, `syncQueueService.ts`,
  `syncOrchestratorService.ts`, `accountingSettingReadService.ts`,
  `employeeReadService.ts`, `purchaseDocumentReadService.ts`,
  `realtimeSyncTableMap.ts` (diubah)
- `src/services/stockMutationReadService.ts`,
  `src/services/inventoryLotReadService.ts` (baru)
- `src/utils/inventory/addInventoryLot.ts`, `consumeFifoLots.ts`,
  `src/services/purchaseCostReconciliationService.ts` (diubah — tandai `pending`)
- `src/types/index.ts` (diubah — sync fields untuk `InventoryLot`/`InventoryLotConsumption`)
- `src/lib/database/KasirkuDB.ts`, `migrations.ts` (diubah)
- `src/lib/database/migrations/versions/v114.ts`,
  `src/lib/database/migrations/versions/v115.ts` (baru)

---

**2026-08-11 — Audit ulang status delta fetch** (bukan implementasi baru,
verifikasi terhadap kode saat ini, dipicu pertanyaan user soal akurasi klaim
"sudah tertarget tapi belum delta-fetch semua"). Dilakukan dengan grep
langsung (`getLatestLocalRemoteUpdatedAt` / `remoteRefreshCursor` /
`.list(`) terhadap seluruh 32 file `src/services/*ReadService.ts`, untuk
cek apakah catatan slice 1-3 di atas masih akurat 3 hari kemudian.

Hasil:

1. **16 dari 32 read service (≈27 dari 74 tabel) sudah delta fetch** (cursor
   `updatedAfter`/`getLatestLocalRemoteUpdatedAt`): `salesDocumentReadService`,
   `journalEntryReadService`, `stockOpnameReadService`, `productionReadService`,
   `openingBalanceReadService`, `payrollReadService` (termasuk
   `employee_cash_advances`), `fixedAssetReadService`, `chartOfAccountReadService`,
   `contactReadService`, `productReadService`, `cooperativeReadService` (6 tabel),
   `accountingSettingReadService`, `employeeReadService` (3 tabel),
   `purchaseDocumentReadService`, `stockMutationReadService`,
   `inventoryLotReadService` (2 tabel). Cocok dengan slice 1-3 di atas — tidak
   ada regresi/drift dari yang didokumentasikan.

2. **~15 read service lain masih literal `xxxPostgresAdapter.list()` tanpa
   argumen** — full table scan tiap kali refresh terpanggil:
   `accountingPeriodReadService`, `cashBankReconciliationReadService`,
   `cashierSessionReadService`, `closingRunReadService`,
   `cooperativeAreaReadService`, `currencyReadService` (+ `currency_rates`),
   `departmentReadService`, `financeTransactionReadService`,
   `fiscalYearReadService` (+ `fiscal_year_closing_runs`), `hrReadService`
   (bundle 4 tabel: `hr_positions`, `employment_contracts`,
   `salary_components`, `employee_salary_components`), `paymentMethodReadService`,
   `projectReadService`, `taxReadService`, `warehouseReadService`.

3. **Gap yang belum tercatat eksplisit di rencana awal**: dari 15 read
   service full-scan di atas, hanya `taxReadService`, `paymentMethodReadService`,
   `warehouseReadService`, `departmentReadService`, `currencyReadService` yang
   memang masuk daftar "prioritas rendah, boleh tetap full fetch" di rencana
   Bagian 2 (tabel master kecil, jarang berubah). Sisanya —
   `financeTransactionReadService`, `cashierSessionReadService`,
   `cashBankReconciliationReadService`, `accountingPeriodReadService`,
   `closingRunReadService`, `cooperativeAreaReadService`, `fiscalYearReadService`,
   `hrReadService` — **tidak pernah dinilai/diprioritaskan secara sadar**,
   bukan keputusan "aman dibiarkan full scan". `financeTransactionReadService`
   dan `cashierSessionReadService` khususnya patut dicurigai sebagai tabel
   yang sering berubah (transaksi finance/kasir harian) — kandidat kuat untuk
   rollout delta-fetch berikutnya, belum tentu semurah tabel master data untuk
   dibiarkan full scan.

4. **12 tabel tanpa jalur pull sama sekali** — tidak berubah dari catatan
   slice 3 di atas (`server_auth_sessions`,
   `cooperative_payment_approval_requests/policy/posting_accounts`,
   `product_recipes`+items, `purchase_cost_reconciliations`+items, 4 tabel
   restaurant POS).

Kesimpulan: dokumentasi slice 1-3 di atas masih akurat, tidak ada drift.
Tambahan dari audit ini adalah kuantifikasi eksplisit ("16/32 read service,
≈27/74 tabel sudah delta fetch") dan identifikasi bahwa sebagian tabel
full-scan **bukan** keputusan sadar "boleh full scan" — masih perlu dinilai,
khususnya `financeTransactionReadService`/`cashierSessionReadService`
sebagai kandidat prioritas rollout berikutnya.

**Tidak ada perubahan kode di audit ini — murni verifikasi status,
tidak menyentuh file manapun di luar dokumen ini.**

---

**2026-08-11 — Bagian 2, slice 4 (`finance_transactions` + `cashier_sessions` ke delta
fetch) sudah dikerjakan.** Tindak lanjut langsung dari audit di atas: dua tabel ini
diduga paling sering berubah (transaksi finance/kasir harian) dari daftar 8 read
service yang "belum pernah dinilai secara sadar", jadi dipilih sebagai kandidat
prioritas berikutnya alih-alih tabel master data yang jarang berubah.

Ringkasan perubahan (pola persis slice 1-3, pakai shared cursor util yang sudah ada,
tidak ada perubahan desain baru):

1. **Rust — repository + command** (`finance_transaction_repository.rs`,
   `cashier_session_repository.rs` dan command pasangannya): `list_finance_transactions`
   / `list_cashier_sessions` sekarang menerima `updated_after: Option<String>,
   limit: Option<i64>` dan memakai query cursor
   `WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1::TIMESTAMPTZ) ORDER BY
   updated_at, id LIMIT $2` (limit di-clamp 1-1000), sama seperti
   `fixed_asset_repository.rs`/`chart_of_account_repository.rs`.
   - `ORDER BY` diubah dari `created_at DESC, updated_at DESC` (finance_transactions)
     dan `opened_at DESC, created_at DESC` (cashier_sessions) ke `updated_at, id`
     supaya cursor pagination valid.
   - **Tidak ada bug tombstone yang diperbaiki di slice ini** (beda dari slice 1/3):
     `finance_transactions` sudah punya kolom `deleted_at` dan query lama-nya
     **sudah tidak** memfilter `WHERE deleted_at IS NULL` — baris ter-soft-delete
     sudah terkirim sejak sebelum slice ini, jadi tidak ada regresi maupun
     perbaikan di sisi tombstone untuk tabel ini. `cashier_sessions` tidak punya
     kolom `deleted_at` sama sekali (sesi kasir tidak pernah di-soft-delete di
     alur manapun yang ada) — tidak relevan.
   - `get_x_by_id` / `upsert_x` (single-row) **tidak diubah**, sesuai pola slice
     sebelumnya.

2. **`src/services/postgresAdapter.ts`**: `financeTransactionPostgresAdapter.list()`
   dan `cashierSessionPostgresAdapter.list()` diubah dari tanpa argumen menjadi
   `(options: PostgresListOptions = {})`, meneruskan `{ updatedAfter, limit }` ke
   `invoke()`.

3. **Read service** (`financeTransactionReadService.ts`, `cashierSessionReadService.ts`):
   `refreshFinanceTransactionsFromPostgres()` dan `refreshCashierSessionsFromPostgres()`
   (signature publik tidak berubah) sekarang memakai shared cursor util
   (`remoteRefreshCursor.ts`) + loop pagination `updatedAfter`/`limit` (limit 500 per
   halaman), termasuk guard concurrency dan penanganan `isPostgresUnavailableError`
   yang sudah ada di entity delta-fetch lain. Duplikat lokal `toTimestamp()` di kedua
   file dihapus, diganti import dari shared util. Logika bisnis lain di
   `financeTransactionReadService.ts` (rekalkulasi `financeBalance` dari seluruh
   `db.financeTransactions.toArray()` setiap kali ada baris berubah, penghapusan
   lokal saat `deleted_at` ada) **tidak diubah** — tetap jalan per halaman seperti
   sebelumnya, hasil akhirnya konvergen sama setelah seluruh halaman selesai.

4. **`realtimeSyncTableMap.ts`**: **tidak perlu diubah** — `finance_transactions` dan
   `cashier_sessions` sudah dipetakan dengan benar ke
   `refreshFinanceTransactionsFromPostgres`/`refreshCashierSessionsFromPostgres`
   sejak Bagian 1, jadi begitu kedua fungsi ini jadi delta fetch, jalur realtime
   otomatis langsung dapat manfaatnya tanpa perubahan tambahan.

5. **Migration baru — `src-tauri/migrations/0078_finance_transaction_cashier_session_delta_fetch_indexes.sql`**:
   index `(updated_at, id)` untuk `finance_transactions` dan `cashier_sessions`.
   Index saja, tidak mengubah skema/data. (Catatan: nomor lanjut dari `0077`, dua
   migration `0076`/`0077` — perbaikan tipe kolom uang fixed asset & marketplace —
   ternyata sudah ada di repo sebelum slice ini tapi belum sempat tercatat di
   dokumen ini; tidak relevan dengan isu sync, disebut di sini sekadar supaya
   penomoran tidak terlihat meloncat.)

Verifikasi yang sudah dilakukan:
- `cargo check` di `src-tauri/`: **pass**, tanpa error.
- `bun run build` (`tsc -b` + vite build): **pass**, tanpa error type.
- `bun run lint`: **pass** dalam arti tidak ada regresi baru — 1 error
  (`JoinExistingHostModal.tsx`) + 2 warning (`CashFlowReport.tsx`, `StockCard.tsx`)
  yang sama persis dengan yang sudah dikonfirmasi pre-existing di slice-slice
  sebelumnya, di file yang tidak disentuh perubahan ini.

**Belum diuji terhadap PostgreSQL nyata**, sama seperti semua slice sebelumnya —
migration index baru belum dijalankan ke database live, dan perilaku delta fetch
(update 1 sesi kasir/1 transaksi finance → hanya baris itu yang ke-refresh) belum
dicoba end-to-end.

Sisa 6 read service dari daftar "belum pernah dinilai secara sadar" di audit
2026-08-11 (`cashBankReconciliationReadService`, `accountingPeriodReadService`,
`closingRunReadService`, `cooperativeAreaReadService`, `fiscalYearReadService`,
`hrReadService`) **masih belum dikerjakan** — kandidat untuk slice berikutnya, di
luar scope slice ini.

File yang diubah/ditambah pada slice ini:
- `src-tauri/src/repositories/finance_transaction_repository.rs`,
  `cashier_session_repository.rs` (diubah)
- `src-tauri/src/commands/finance_transaction_commands.rs`,
  `cashier_session_commands.rs` (diubah)
- `src-tauri/migrations/0078_finance_transaction_cashier_session_delta_fetch_indexes.sql`
  (baru)
- `src/services/postgresAdapter.ts`, `financeTransactionReadService.ts`,
  `cashierSessionReadService.ts` (diubah)

---

**2026-08-11 — Bagian 2, slice 5 (6 read service sisa dari audit 2026-08-11) sudah
dikerjakan.** Tindak lanjut langsung dari slice 4: 6 read service yang tersisa dari
daftar "belum pernah dinilai secara sadar" (`cashBankReconciliationReadService`,
`accountingPeriodReadService`, `closingRunReadService`, `cooperativeAreaReadService`,
`fiscalYearReadService` — 2 tabel, `hrReadService` — bundle 4 tabel) semuanya
dikonversi ke delta fetch dalam satu slice sekaligus (bukan satu-satu) karena
semuanya kecil/menengah dan polanya identik — tidak ada alasan kuat untuk
memisahkannya jadi beberapa PR. Dengan ini seluruh 32 read service (~35/74 tabel
yang pernah diaudit eksplisit) sudah delta fetch, kecuali tabel master data kecil
yang memang sengaja dibiarkan full fetch (`roles`, `taxes`, `payment_methods`,
`warehouses`, `departments`, `currencies`, singleton settings) dan 12 tabel tanpa
jalur pull sama sekali (lihat catatan slice 3).

Ringkasan perubahan (pola persis slice 1-4, pakai shared cursor util yang sudah ada):

1. **Rust — repository + command**, 9 tabel di 7 file repository
   (`cash_bank_reconciliation_repository.rs`, `accounting_period_repository.rs`,
   `closing_run_repository.rs`, `accounting_fiscal_year_repository.rs`,
   `fiscal_year_closing_run_repository.rs`, `cooperative_repository.rs` — fungsi
   `list_cooperative_areas`, `hr_repository.rs` — 4 fungsi
   `list_hr_positions`/`list_employment_contracts`/`list_salary_components`/
   `list_employee_salary_components`) dan command pasangannya masing-masing:
   semua `list_x` sekarang menerima `updated_after: Option<String>, limit:
   Option<i64>` dan memakai query cursor `WHERE ($1::TIMESTAMPTZ IS NULL OR
   updated_at > $1::TIMESTAMPTZ) ORDER BY updated_at, id LIMIT $2` (limit
   di-clamp 1-1000), pola sama persis slice-slice sebelumnya. `ORDER BY` semua
   diubah dari kolom bisnis (`statement_date DESC`, `start_date DESC`, `name`,
   dst) ke `updated_at, id` supaya cursor pagination valid.
   - **Bug tombstone diperbaiki** di 5 dari 9 tabel: `list_cooperative_areas`
     (di `cooperative_repository.rs`) dan seluruh 4 tabel HR
     (`hr_positions`, `employment_contracts`, `salary_components`,
     `employee_salary_components`, di `hr_repository.rs`) sebelumnya punya
     `WHERE deleted_at IS NULL`, filter itu dibuang dari jalur list. Untuk
     `cooperative_areas` ini nyata (client sudah siap menerima `deleted_at`
     lewat soft-flag `is_active: false`, lihat `cooperativeAreaReadService.ts`
     yang tidak diubah perilakunya). Untuk 4 tabel HR, diverifikasi lewat grep
     bahwa **tidak ada kode Rust manapun yang pernah menulis `deleted_at`**
     untuk tabel-tabel ini (tidak ada command delete sama sekali) — jadi
     perbaikan filter ini murni pencegahan drift ke depan, bukan memperbaiki
     bug yang sedang aktif merugikan data sekarang.
   - 4 tabel lain (`cash_bank_reconciliations`, `accounting_periods`,
     `closing_runs`, `accounting_fiscal_years`, `fiscal_year_closing_runs` —
     5 sebenarnya) **tidak** punya bug tombstone — query list lama-nya sudah
     tidak memfilter `deleted_at`, read service sisi client juga sudah siap
     menghapus baris lokal saat `deleted_at` terisi (lihat
     `mergeRemote*IntoDexie` di masing-masing read service, tidak diubah).
   - `get_x_by_id` / `upsert_x` (single-row) **tidak diubah** di semua 9
     tabel, sesuai pola slice sebelumnya.

2. **`src/services/postgresAdapter.ts`**: 9 adapter (`cashBankReconciliationPostgresAdapter`,
   `accountingPeriodPostgresAdapter`, `closingRunPostgresAdapter`,
   `accountingFiscalYearPostgresAdapter`, `fiscalYearClosingRunPostgresAdapter`,
   `cooperativeAreaPostgresAdapter`, `hrPositionPostgresAdapter`,
   `employmentContractPostgresAdapter`, `salaryComponentPostgresAdapter`,
   `employeeSalaryComponentPostgresAdapter` — 10 sebenarnya) `.list()` diubah
   dari tanpa argumen menjadi `(options: PostgresListOptions = {})`, meneruskan
   `{ updatedAfter, limit }` ke `invoke()`.

3. **Read service** — 6 file:
   - `cashBankReconciliationReadService.ts`, `accountingPeriodReadService.ts`,
     `closingRunReadService.ts`, `cooperativeAreaReadService.ts`: pola identik
     slice 1-4 — shared cursor util (`remoteRefreshCursor.ts`) + loop pagination
     `updatedAfter`/`limit` (limit 500/halaman), duplikat lokal `toTimestamp()`
     dihapus diganti import dari shared util. Logika `shouldApplyRemote*`
     (version/timestamp conflict check) dan `mergeRemote*IntoDexie` (termasuk
     push side `pushLocalCooperativeAreasToPostgres` di cooperativeArea)
     **tidak diubah** — hanya cara remote data diambil yang berubah.
   - `fiscalYearReadService.ts`: dua fungsi refresh (`accounting_fiscal_years`
     dan `fiscal_year_closing_runs`) masing-masing dapat loop pagination
     independen dengan cursor terpisah (bukan cursor bersama), karena kedua
     tabel ini secara desain independen (fiscal year vs closing run-nya
     punya siklus update berbeda).
   - `hrReadService.ts`: berbeda dari yang lain — sebelumnya sudah punya 1
     fungsi orkestrasi (`refreshHrDataFromPostgres`) yang menjalankan 4
     `Promise.all` list lalu 1 kali `mergeRemoteHrDataIntoDexie` gabungan.
     Alih-alih membongkar struktur itu, ditambahkan helper generic baru
     `fetchAllRemoteWithCursor()` yang membungkus loop cursor pagination per
     collection (dipanggil 4x secara paralel via `Promise.all`, masing-masing
     mengumpulkan seluruh halaman jadi 1 array sebelum dikembalikan) —
     `mergeRemoteHrDataIntoDexie()` dan `HrReadSummary`/`mergeCollection()`
     **tidak diubah sama sekali**, tetap menerima array lengkap seperti
     sebelumnya. Trade-off: beda dari pola "merge per halaman" di file lain,
     tapi lebih aman (tidak menyentuh fungsi merge yang sudah teruji) untuk
     bundle 4-tabel yang strukturnya sudah agak berbeda dari pola tunggal.

4. **Migration baru — `src-tauri/migrations/0079_accounting_hr_cooperative_delta_fetch_indexes.sql`**:
   index `(updated_at, id)` untuk kesepuluh tabel di atas. Index saja, tidak
   mengubah skema/data.

Verifikasi yang sudah dilakukan:
- `cargo check` di `src-tauri/`: **pass**, tanpa error, dijalankan 2x (setelah
  seluruh perubahan Rust, dan sekali lagi setelah menambah file migration
  index — migration SQL tidak dikompilasi cargo, jadi run kedua hanya
  memastikan tidak ada state stale).
- `bun run build` (`tsc -b` + vite build): **pass**, tanpa error type.
- `bun run lint`: **pass** — error/warning yang muncul (`JoinExistingHostModal.tsx`,
  `CashFlowReport.tsx`, `StockCard.tsx`) sama persis dengan yang sudah
  dikonfirmasi pre-existing di slice-slice sebelumnya, di file yang tidak
  disentuh perubahan ini.

**Belum diuji terhadap PostgreSQL nyata**, sama seperti semua slice sebelumnya —
migration index baru belum dijalankan ke database live, dan perilaku delta fetch
(update 1 baris di salah satu dari 10 tabel ini → hanya baris itu yang ke-refresh)
belum dicoba end-to-end.

Dengan slice 5 ini, seluruh read service yang teridentifikasi eksplisit di audit
2026-08-11 sudah selesai dikonversi. Sisa pekerjaan Bagian 2 yang **disadari tapi
sengaja tidak dikerjakan** (bukan terlewat):
- Entity prioritas rendah yang tetap boleh full fetch (tidak berubah dari rencana
  awal): `roles`, `taxes`, `payment_methods`, `warehouses`, `departments`,
  `currencies`, singleton settings — tabel master kecil, jarang berubah.
- 12 tabel tanpa jalur pull sama sekali (lihat catatan slice 3): `server_auth_sessions`,
  `cooperative_payment_approval_requests/policy/posting_accounts`,
  `product_recipes`+items, `purchase_cost_reconciliations`+items, 4 tabel
  restaurant POS — membangun sync untuk ini adalah proyek fitur baru, bukan
  optimasi delta fetch.
- **Rekonsiliasi `quantity_remaining` lintas-device** untuk `inventory_lots` (lihat
  slice 3) dan **push langsung setelah transaksi** untuk inventory_lots/
  inventory_lot_consumptions — keduanya butuh keputusan desain terpisah.
- Ekstrak duplikat cursor helper di 8 entity yang delta fetch-nya dibangun
  sebelum `remoteRefreshCursor.ts` ada (sales documents, journal entries, stock
  opnames, production orders, opening balances, payroll runs, employee cash
  advances, fixed assets) — cleanup opsional, tidak mengubah perilaku.
- Verifikasi end-to-end terhadap PostgreSQL nyata / LAN multi-PC untuk seluruh
  rollout Bagian 2 (semua slice) — belum pernah dilakukan sama sekali, ini yang
  paling penting sebelum seluruh Bagian 2 dianggap selesai secara operasional.

File yang diubah/ditambah pada slice ini:
- `src-tauri/src/repositories/cash_bank_reconciliation_repository.rs`,
  `accounting_period_repository.rs`, `closing_run_repository.rs`,
  `accounting_fiscal_year_repository.rs`, `fiscal_year_closing_run_repository.rs`,
  `cooperative_repository.rs`, `hr_repository.rs` (diubah)
- `src-tauri/src/commands/cash_bank_reconciliation_commands.rs`,
  `accounting_period_commands.rs`, `closing_run_commands.rs`,
  `accounting_fiscal_year_commands.rs`, `fiscal_year_closing_run_commands.rs`,
  `cooperative_commands.rs`, `hr_commands.rs` (diubah)
- `src-tauri/migrations/0079_accounting_hr_cooperative_delta_fetch_indexes.sql`
  (baru)
- `src/services/postgresAdapter.ts`, `cashBankReconciliationReadService.ts`,
  `accountingPeriodReadService.ts`, `closingRunReadService.ts`,
  `cooperativeAreaReadService.ts`, `fiscalYearReadService.ts`,
  `hrReadService.ts` (diubah)

---

**2026-08-11 — Cleanup: extract duplikat cursor helper di 8 entity delta-fetch lama**
sudah dikerjakan. Ini item cleanup opsional yang sudah dicatat sejak slice 5 ("Ekstrak
duplikat cursor helper di 8 entity yang delta fetch-nya dibangun sebelum
`remoteRefreshCursor.ts` ada") — dipilih user sebagai arah lanjutan dibanding opsi lain
(bangun pull-path baru untuk 12 tabel, desain reconciliation `quantity_remaining`, atau
verifikasi live Postgres/LAN — yang terakhir tidak bisa dijalankan di sandbox ini karena
tidak ada instance Postgres/Tauri live yang tersedia).

Ringkasan perubahan — murni refactor, **tidak mengubah perilaku sama sekali**:

- 7 file (`salesDocumentReadService.ts`, `journalEntryReadService.ts`,
  `stockOpnameReadService.ts`, `productionReadService.ts`,
  `openingBalanceReadService.ts`, `payrollReadService.ts` — payroll runs + employee
  cash advances sekaligus, `fixedAssetReadService.ts`) masing-masing punya duplikat
  lokal `toTimestamp()`/`getLaterUpdatedAt()`/reduce manual untuk cari cursor
  `updated_at` terbaru (baik dari data lokal Dexie maupun dari batch remote yang baru
  di-fetch). Semua duplikat ini dihapus, diganti import `getLatestLocalRemoteUpdatedAt`,
  `getLatestRemoteUpdatedAt`, `toTimestamp` dari `src/services/shared/remoteRefreshCursor.ts`
  (util yang sama yang sudah dipakai 25 entity lain sejak slice 1) — pola persis
  `chartOfAccountReadService.ts` yang sudah lebih dulu memakainya.
- Fungsi wrapper async per-entity yang membaca Dexie lokal (mis.
  `getLatestLocalSalesDocumentUpdatedAt`, `getLatestLocalJournalEntryUpdatedAt`,
  `getLatestLocalStockOpnameUpdatedAt`, `getLatestLocalProductionOrderUpdatedAt`,
  `getLatestLocalOpeningBalanceBatchUpdatedAt`) dipertahankan/ditambahkan namanya
  supaya tidak bentrok dengan nama fungsi generic yang diimport (2 file — payroll,
  fixed assets — sudah punya nama unik dari awal jadi tidak perlu rename).
  `fixedAssetReadService.ts` hanya mengimport `getLatestLocalRemoteUpdatedAt`/
  `getLatestRemoteUpdatedAt` (tidak `toTimestamp`, karena file ini tidak memakainya
  di luar `getLaterUpdatedAt` yang sudah dihapus — mengimport tapi tidak dipakai akan
  kena lint unused-import).
- Tidak ada perubahan Rust/migration — cleanup ini murni sisi TypeScript.

Verifikasi yang sudah dilakukan:
- `bun run build` (`tsc -b` + vite build): **pass**, tanpa error type.
- `bun run lint`: **pass** — error/warning yang muncul (`JoinExistingHostModal.tsx`,
  `CashFlowReport.tsx`, `StockCard.tsx`) sama persis dengan yang sudah dikonfirmasi
  pre-existing di slice-slice sebelumnya, di file yang tidak disentuh perubahan ini.
- Grep manual memastikan tidak ada sisa definisi lokal `getLaterUpdatedAt` di
  ketujuh file setelah refactor.
- `cargo check` **tidak dijalankan** — tidak relevan, tidak ada file Rust yang disentuh
  slice ini.

Dengan ini, seluruh 32 read service (baik yang dibangun sebelum maupun sesudah
`remoteRefreshCursor.ts` ada) sekarang memakai 1 implementasi cursor helper yang sama,
tidak ada lagi duplikasi. Sisa pekerjaan Bagian 2 yang **disadari tapi belum
dikerjakan** tidak berubah dari catatan slice 5 (12 tabel tanpa jalur pull, reconciliation
`quantity_remaining`, push langsung setelah transaksi, dan yang paling penting: verifikasi
end-to-end terhadap PostgreSQL nyata/LAN multi-PC — masih belum pernah dilakukan sama
sekali).

File yang diubah pada slice ini:
- `src/services/salesDocumentReadService.ts`, `journalEntryReadService.ts`,
  `stockOpnameReadService.ts`, `productionReadService.ts`,
  `openingBalanceReadService.ts`, `payrollReadService.ts`,
  `fixedAssetReadService.ts` (diubah)

---

**2026-08-11 — Audit menyeluruh 8 dari 12 tabel tanpa jalur pull** (murni riset,
tidak ada perubahan kode). User memilih arah "bangun pull-path 12 tabel baru" sebagai
kelanjutan setelah cleanup cursor helper di atas. 4 dari 12 tabel adalah restaurant POS
yang sudah di-skip permanen atas keputusan user sebelumnya (lihat slice 3) — audit ini
menyisir 8 sisanya secara mendalam (skema Postgres, kode Rust, pemakaian frontend,
skema Dexie, mapping `realtimeSyncTableMap.ts`) sebelum menulis kode apa pun.

**Temuan utama: ke-8 tabel ini BUKAN 8 kandidat delta-fetch yang seragam seperti
slice 1-5 di atas.** Berbeda dari rollout sebelumnya (pola "ganti `.list()` jadi
cursor pagination" yang bisa direplikasi langsung), audit menemukan tiap tabel
punya alasan desain sendiri kenapa belum ada pull-path:

1. **`server_auth_sessions`** — **rekomendasi: SKIP PERMANEN, ini boundary keamanan
   bukan gap.** Tidak ada `updated_at`/`deleted_at` di skema, dan yang lebih penting:
   tidak ada command `list` yang mengekspos tabel ini ke frontend sama sekali (beda
   dari 7 tabel lain yang minimal listable) — `token` adalah bearer credential sesi
   user/device lain, replikasi ke semua client via Dexie = risiko session hijacking.
   Rust hanya expose `authenticate`/`revoke` (`auth_commands.rs:11-34`).

2. **`cooperative_payment_approval_requests`** — **sudah tepat sebagai on-demand
   React Query, bukan Dexie**, dan ini keputusan desain yang benar (bukan kelalaian):
   fitur maker-checker approval butuh state paling terbaru + `session_token` live
   untuk permission-check server-side, snapshot Dexie offline tidak cocok (`useCooperativeInstallments.tsx:125-129`
   → `listCooperativePaymentApprovalRequests`, `cooperativeLoanService.ts:3395-3403`).
   Satu-satunya gap nyata: `list_payment_approval_requests` (`cooperative_payment_repository.rs:2594-2608`)
   tidak punya `updated_after`/`limit` — full-fetch tanpa batas, bisa membesar tanpa
   batas seiring histori approval bertambah. Perbaikan pagination ini valid dikerjakan,
   tapi terpisah dari "bangun pull-path Dexie".

3. **`cooperative_payment_policy`** — singleton 2 kolom (`max_backdate_days`,
   `max_future_minutes`), tidak ada command frontend, nol referensi di UI. Prioritas
   sangat rendah, tidak berkontribusi ke traffic/performance.

4. **`cooperative_posting_accounts`** — **push-only sudah tepat by design.** Client
   derive data akun dari `chartOfAccounts` lokal (sudah delta-fetch) lalu push
   role-mapping ke server (`ensureServerPostingAccounts()`, `cooperativeLoanService.ts:2438-2480`).
   Tidak ada command list yang diekspos, dan tidak perlu — source of truth (chart of
   accounts) sudah sync duluan.

5-6. **`product_recipes` / `product_recipe_items`** — **fitur BOM/resep belum pernah
   dibangun sama sekali**, bukan gap pull-path. Skema Postgres + Dexie + TS types
   sudah di-scaffold (Dexie sejak migration v56) tapi **nol kode Rust** (repo/command/model)
   dan **nol UI/usage frontend** — dead schema di kedua sisi. Butuh keputusan produk
   dulu (masih diinginkan atau tidak) sebelum bicara pull-path.

7-8. **`purchase_cost_reconciliations` / `purchase_cost_reconciliation_items`** —
   kondisi terbalik dari kasus 5-6: **Dexie aktif dipakai** sebagai audit-log lokal
   saat finalisasi HPP pembelian (`purchaseCostReconciliationService.ts`), tapi
   **Postgres-nya write-orphaned total** (nol kode Rust, tidak pernah di-enqueue ke
   syncQueue, tabel Postgres tidak pernah ke-INSERT oleh app manapun sejak awal).
   Append-only, `created_at TEXT` saja (tanpa `updated_at`) — kalau visibilitas
   lintas-device untuk histori rekonsiliasi ini memang diinginkan, ini justru salah
   satu yang paling gampang dari 8 tabel untuk dibangun (pola cursor `created_at`
   sama seperti `stock_mutations`/`inventory_lot_consumptions`, tidak ada isu
   tombstone/conflict karena immutable). Kalau tidak, skema Postgres-nya kandidat
   cleanup (dead table).

**Kesimpulan**: dari 8 tabel, **6 di antaranya (`server_auth_sessions`,
`cooperative_payment_approval_requests`, `cooperative_payment_policy`,
`cooperative_posting_accounts`, dan secara tidak langsung 5-6/7-8 karena butuh
keputusan produk dulu) tidak punya jalan lurus untuk "sekadar ditambah pull-path"**
seperti pola delta-fetch rollout Bagian 2 sebelumnya. Item aksi konkret yang tersisa
dari audit ini, semuanya butuh keputusan terpisah dari user, bukan pekerjaan yang bisa
langsung dieksekusi dengan pola replikasi seperti slice 1-5:
- Tambah `updated_after`/`limit` ke `list_payment_approval_requests` (kecil, aman,
  murni pagination hygiene — TIDAK mengubah on-demand-nya jadi Dexie pull).
- Keputusan produk: fitur resep produksi (`product_recipes`) masih diinginkan atau
  schema mati dibersihkan?
- Keputusan produk: histori rekonsiliasi HPP pembelian perlu lintas-device (bangun
  push+pull dari nol) atau cukup lokal-only (schema Postgres dibersihkan)?

**Tidak ada perubahan kode di audit ini** — murni riset, tidak menyentuh file
manapun di luar dokumen ini.

---

**2026-08-11 — Item aksi #1 dari audit di atas dikerjakan: pagination untuk
`list_payment_approval_requests`.** Dari 3 item aksi yang diidentifikasi audit,
user memilih yang paling kecil/aman lebih dulu — 2 item lain (nasib
`product_recipes` dan `purchase_cost_reconciliations`) adalah keputusan produk,
belum diputuskan, di luar scope slice ini.

Ringkasan perubahan (murni menambah `LIMIT`, bukan konversi ke cursor pagination —
lihat rasionalisasi di bawah):

1. **Rust — `cooperative_payment_repository.rs::list_payment_approval_requests`**:
   tanda tangan fungsi ditambah parameter `limit: Option<i64>`. Query ditambah
   `LIMIT $1` di akhir (setelah `ORDER BY requested_at DESC, created_at DESC` yang
   sudah ada), `.bind(limit.unwrap_or(500).clamp(1, 1000))` — pola clamp yang sama
   persis dengan seluruh repository delta-fetch lain (mis.
   `chart_of_account_repository.rs:34`), untuk konsistensi angka default/batas atas
   walau di sini tidak dipakai sebagai page size loop.
2. **`cooperative_commands.rs::postgres_list_cooperative_payment_approval_requests`**:
   diteruskan parameter `limit: Option<i64>` baru ke repository.
3. **`postgresAdapter.ts::cooperativePostingPostgresAdapter.listApprovalRequests`**:
   tanda tangan ditambah `limit?: number` opsional, diteruskan ke `invoke()`.
   **`cooperativeLoanService.ts::listCooperativePaymentApprovalRequests` (satu-satunya
   pemanggil, dipakai `useCooperativeInstallments.tsx:127` sebagai `queryFn`) TIDAK
   diubah** — tetap memanggil tanpa argumen `limit`, sehingga default Rust (500)
   yang berlaku otomatis.

**Kenapa `LIMIT` saja, bukan `updated_after`/cursor pagination penuh seperti
slice 1-5**: dicek dulu bagaimana data ini dipakai di UI
(`CooperativeInstallmentManagement.tsx:509-523`) — hasilnya dirender di 1 tabel
AntD dengan client-side pagination (`pageSize: 8`) yang menampilkan SELURUH histori
(PENDING/APPROVED/REJECTED, bukan cuma yang pending) sebagai riwayat approval yang
bisa di-scroll. Ini bukan cursor sync ke Dexie (tidak ada local cache untuk
diselisihkan), tapi fetch-ulang penuh tiap kali komponen mount — jadi
`updated_after` tidak relevan di sini (tidak ada "sejak kapan" yang bermakna untuk
di-diff). Risiko sebenarnya yang diangkat audit murni "SELECT tanpa LIMIT pada
tabel yang terus bertambah seiring waktu (reversal request, dst) akan makin berat
tiap kali di-fetch" — `LIMIT 500` (terurut dari yang paling baru) membatasi payload
tanpa mengubah arsitektur on-demand yang sudah tepat, dan tidak memotong visibilitas
praktis (500 baris riwayat approval jauh di atas kebutuhan browsing harian/mingguan).

Verifikasi yang sudah dilakukan:
- `cargo check` di `src-tauri/`: **pass**, tanpa error.
- `bun run build` (`tsc -b` + vite build): **pass**, tanpa error type.
- `bun run lint`: **pass** — 1 error (`JoinExistingHostModal.tsx`) + 2 warning
  (`CashFlowReport.tsx`, `StockCard.tsx`) sama persis dengan yang sudah dikonfirmasi
  pre-existing di slice-slice sebelumnya, di file yang tidak disentuh perubahan ini.

**Belum diuji terhadap PostgreSQL nyata** — perilaku `LIMIT` di query belum dicoba
terhadap dataset approval request sungguhan, sama seperti caveat semua slice
sebelumnya.

Sisa item dari audit 8-tabel yang **masih menunggu keputusan produk user** (di luar
scope slice ini):
- Nasib `product_recipes`/`product_recipe_items` — bangun fitur resep dari nol, atau
  bersihkan schema mati?
- Nasib `purchase_cost_reconciliations`/`items` — bangun push+pull dari nol supaya
  lintas-device, atau terima lokal-only dan bersihkan schema Postgres mati?

File yang diubah pada slice ini:
- `src-tauri/src/repositories/cooperative_payment_repository.rs` (diubah)
- `src-tauri/src/commands/cooperative_commands.rs` (diubah)
- `src/services/postgresAdapter.ts` (diubah)
