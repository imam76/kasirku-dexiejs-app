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
