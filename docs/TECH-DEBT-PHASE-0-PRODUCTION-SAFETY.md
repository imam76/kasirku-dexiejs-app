# Tech Debt P0 - Production Safety Persistence

Fase ini menyelesaikan blocker sebelum production untuk persistence Tauri +
PostgreSQL. Target utamanya: app tetap bisa dibuka sebagai offline-first app,
queue tidak macet permanen, dan refresh remote tidak menjadi beban besar saat
data dokumen mulai banyak.

## Masalah Yang Diselesaikan

1. Tauri startup masih hard-depend ke PostgreSQL.
   `src-tauri/src/lib.rs` membuat pool dan menjalankan migration di `.setup()`.
   `src-tauri/src/db/pool.rs` masih memakai `expect` saat `DATABASE_URL` tidak
   ada. Jika env atau database bermasalah, app bisa gagal start sebelum Dexie
   digunakan.

2. Queue dapat tertinggal di status `processing`.
   `src/services/syncQueueService.ts` memakai flag memory-only
   `isProcessingSyncQueue`, lalu item diubah dari `pending` ke `processing`.
   Crash, reload, atau proses mati setelah status berubah dapat meninggalkan
   item yang tidak pernah diproses lagi.

3. Refresh PostgreSQL masih full-fetch dan N+1 untuk bundle besar.
   `src-tauri/src/repositories/sales_document_repository.rs` dan
   `src-tauri/src/repositories/journal_entry_repository.rs` mengambil semua
   header lalu mengambil item/lines per dokumen. `src/hooks/useSyncQueueWorker.ts`
   juga menjalankan refresh semua domain secara berurutan.

## Target Selesai

- Tauri tetap start walau `DATABASE_URL` kosong, PostgreSQL mati, atau migration
  gagal.
- Status PostgreSQL bisa dibaca lewat health command tanpa menjatuhkan app.
- Queue `processing` yang stale bisa kembali ke `pending` atau `failed` secara
  deterministik.
- Worker tidak melakukan full refresh besar tanpa batas.
- Dexie tetap menjadi UI read source.

## Tidak Masuk Scope

- Memindahkan UI read source dari Dexie ke PostgreSQL.
- Mengubah business logic sales, purchase, finance, POS, atau journal.
- Menyelesaikan seluruh refactor `syncQueueService.ts`; itu masuk P1.
- Menambah seluruh coverage PostgreSQL domain finance; itu masuk P1 backlog.

## Langkah Penyelesaian

### 1. Jadikan PostgreSQL optional saat startup

File utama:

- `src-tauri/src/db/pool.rs`
- `src-tauri/src/db/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/commands/postgres_health.rs`
- Semua `src-tauri/src/commands/*_commands.rs` yang menerima pool sebagai state.

Langkah:

1. Ganti `env::var("DATABASE_URL").expect(...)` di `pool.rs` menjadi error yang
   bisa dikembalikan, misalnya `DatabaseUrlMissing`.
2. Tambah state wrapper, misalnya `PostgresState`, yang dapat menyimpan:

```txt
pool: Option<PgPool>
status: available | unconfigured | unreachable | migration_failed
message: optional string aman untuk UI
```

3. Di `lib.rs`, jangan `?` langsung dari `create_pg_pool()` atau migration.
   Buat app tetap lanjut start, lalu simpan status unavailable di state.
4. Jalankan migration hanya jika pool berhasil dibuat. Jika migration gagal,
   simpan status `migration_failed` dan jangan register pool sebagai available.
5. Update command PostgreSQL agar membaca `PostgresState` dan mengembalikan error
   terstruktur saat pool unavailable, bukan panic atau abort.
6. Update `postgres_health_check` supaya bisa membedakan:
   `available`, `unconfigured`, `unreachable`, dan `migration_failed`.
7. Update frontend adapter PostgreSQL agar error unavailable diperlakukan sebagai
   kondisi offline/retryable. Data lokal Dexie tidak boleh dihapus atau dianggap
   sync berhasil.

Acceptance criteria:

- App Tauri bisa dibuka tanpa `src-tauri/.env`.
- App Tauri bisa dibuka saat PostgreSQL container mati.
- `postgres_health_check` tetap callable dan mengembalikan status unavailable.
- Sync queue tetap menyimpan item lokal untuk retry berikutnya.

### 2. Tambahkan recovery untuk queue `processing`

File utama:

- `src/services/syncQueueService.ts`
- `src/hooks/useSyncQueueWorker.ts`
- `src/types/index.ts` jika status/error metadata perlu diperjelas.

Langkah:

1. Tambahkan constant eksplisit:

```txt
SYNC_QUEUE_BATCH_SIZE
SYNC_QUEUE_MAX_ATTEMPTS
SYNC_QUEUE_PROCESSING_TIMEOUT_MS
```

2. Tambahkan helper `recoverStaleProcessingSyncQueueItems()`.
3. Cari item `syncQueue` dengan `status === 'processing'` dan `updated_at` lebih
   lama dari timeout.
4. Jika `attempts < SYNC_QUEUE_MAX_ATTEMPTS`, ubah kembali ke `pending` dengan
   `error_message` seperti `Recovered stale processing queue item`.
5. Jika `attempts >= SYNC_QUEUE_MAX_ATTEMPTS`, ubah ke `failed` dengan pesan
   eksplisit agar UI retry manual masih bisa dipakai.
6. Panggil recovery di awal `processPendingSyncQueue()` sebelum mengambil item
   pending.
7. Panggil juga saat `useSyncQueueWorker()` mount, sebelum enqueue/refresh domain.
8. Pastikan recursive call di akhir `processPendingSyncQueue()` tetap berhenti
   saat tidak ada `pending`.

Acceptance criteria:

- Item `processing` stale tidak tertinggal selamanya setelah reload.
- Item gagal tetap bisa dipulihkan lewat `retryFailedSyncQueueItems()`.
- Queue item yang masih baru diproses tidak diambil ulang oleh worker lain.

### 3. Batasi refresh PostgreSQL yang besar

File utama:

- `src/hooks/useSyncQueueWorker.ts`
- `src-tauri/src/repositories/sales_document_repository.rs`
- `src-tauri/src/repositories/journal_entry_repository.rs`
- `src-tauri/src/commands/sales_document_commands.rs`
- `src-tauri/src/commands/journal_entry_commands.rs`
- `src/services/salesDocumentReadService.ts`
- `src/services/journalEntryReadService.ts`
- `src/services/*ReadService.ts` untuk domain lain yang punya full refresh.

Langkah minimal P0:

1. Tambah parameter read remote yang aman:

```txt
updated_after?: string
limit?: number
```

2. Gunakan sync metadata lokal sebagai `updated_after` jika tersedia.
3. Untuk sales document dan journal entry, hindari N+1:
   ambil header dalam satu query, lalu ambil item/lines untuk daftar id header
   dalam satu query batch.
4. Batasi jumlah bundle per refresh. Jika hasil sama dengan `limit`, worker boleh
   lanjut halaman berikutnya secara terkontrol.
5. Jangan refresh semua domain jika health PostgreSQL unavailable.
6. Urutan worker tetap:

```txt
recover stale processing
enqueue local pending
process pending queue
refresh remote changed data
```

7. Catat `last_synced_at` per domain setelah refresh berhasil, bukan saat refresh
   gagal.

Acceptance criteria:

- Worker tidak mengambil semua sales document dan journal entry di setiap start.
- Sales/journal bundle list tidak menjalankan query item/lines per header.
- Refresh domain skip dengan aman saat PostgreSQL unavailable.

## Validasi

Minimal command:

```bash
bun run build
bun run lint
cd src-tauri && cargo check
```

Manual QA:

- Jalankan app dengan PostgreSQL hidup.
- Jalankan app dengan PostgreSQL mati.
- Jalankan app tanpa `src-tauri/.env`.
- Buat local perubahan saat offline, pastikan queue tetap ada.
- Simulasikan item `processing` stale di Dexie, reload app, pastikan status
  berubah ke `pending` atau `failed`.
- Buat beberapa sales/journal bundle, pastikan refresh incremental tetap mengisi
  Dexie tanpa duplikasi.

## Urutan Commit Disarankan

1. Startup optional PostgreSQL dan health status.
2. Queue processing recovery.
3. Incremental refresh dan batch query sales/journal.
4. Validasi build, lint, dan Rust check.
