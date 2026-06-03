# Tech Debt P2 - Operational Hardening and Tests

Fase ini menyelesaikan hygiene operasional setelah safety dan arsitektur sync
lebih stabil. Fokusnya: konfigurasi developer aman, error dari Rust bisa
diobservasi dengan jelas, dan test otomatis mulai melindungi jalur persistence
yang paling rawan.

## Masalah Yang Diselesaikan

1. `src-tauri/.env.example` masih hard-code IP lokal developer.
   Ini mudah bocor ke setup developer lain dan membuat onboarding salah arah.

2. Error command Rust masih banyak memakai `error.to_string()`.
   Frontend dan queue sulit membedakan error retryable, conflict, validation,
   migration, dan error tidak dikenal.

3. Test otomatis belum tersedia untuk persistence sync.
   `package.json` saat ini menyediakan `dev`, `build`, `lint`, `preview`, dan
   `tauri`, tetapi belum punya test runner khusus.

## Target Selesai

- `.env.example` menjadi template aman dan tidak mengandung IP personal.
- Error Rust command memakai format terstruktur yang konsisten.
- Frontend adapter dan queue dapat membaca error code/retryable flag.
- Ada automated test minimal untuk queue recovery, conflict classification,
  read merge/tombstone, dan migration/repository kritis.

## Tidak Masuk Scope

- Menyelesaikan seluruh domain PostgreSQL yang belum ada.
- Mengganti semua error handling aplikasi di luar command PostgreSQL.
- Membuat end-to-end test suite penuh.
- Mengubah UX besar untuk sync status.

## Langkah Penyelesaian

### 1. Rapikan `.env.example`

File utama:

- `src-tauri/.env.example`
- `docs/POSTGRES-TAURI-PERSISTENCE-LAYER.md`

Langkah:

1. Ganti IP lokal personal menjadi template yang aman.
2. Gunakan contoh default lokal:

```env
DATABASE_URL=postgresql://appuser:apppassword@localhost:5432/appdb
```

3. Tambahkan komentar singkat jika target database berada di host LAN/mobile:

```env
# For LAN testing, replace localhost with your database host IP.
```

4. Pastikan `src-tauri/.env` tetap tidak dicommit.
5. Sinkronkan contoh env di persistence doc jika masih menunjuk nilai lama.

Acceptance criteria:

- `.env.example` tidak mengandung IP personal.
- Developer baru dapat copy `.env.example` ke `.env` dan menjalankan setup lokal.

### 2. Standarkan error command Rust

File utama:

- `src-tauri/src/db/error.rs`
- `src-tauri/src/commands/*_commands.rs`
- `src-tauri/src/repositories/*_repository.rs`
- `src/services/postgresAdapter.ts`
- `src/services/syncQueueService.ts` atau hasil refactor P1.

Format yang disarankan:

```txt
code: string
message: string
retryable: boolean
details?: object
```

Kode awal:

```txt
UNAVAILABLE
MIGRATION_ERROR
VALIDATION_ERROR
CONFLICT
NOT_FOUND
DATABASE_ERROR
UNKNOWN
```

Langkah:

1. Buat type Rust serializable, misalnya `CommandErrorDto`.
2. Buat mapper dari error internal:

```txt
sqlx::Error::RowNotFound -> NOT_FOUND, retryable false
pool/acquire/connect error -> UNAVAILABLE, retryable true
constraint violation -> VALIDATION_ERROR atau CONFLICT
unknown sqlx error -> DATABASE_ERROR
```

3. Ganti `.map_err(|error| error.to_string())` di command PostgreSQL secara
   bertahap dari domain paling kritis:

```txt
postgres_health
journal_entry
finance_transaction
sales_document
purchase_document
product / stock_mutation
master data
auth/activity log
```

4. Update `postgresAdapter.ts` agar error dari invoke dinormalisasi menjadi
   object yang sama di frontend.
5. Update queue failure handling:

```txt
retryable true -> boleh retry otomatis sesuai max attempts/backoff
CONFLICT -> jangan retry otomatis tanpa resolusi
VALIDATION_ERROR -> failed dan tampilkan pesan domain
UNAVAILABLE -> pending/failed retryable sesuai policy P0
```

Acceptance criteria:

- Tidak ada command PostgreSQL kritis yang hanya mengembalikan string mentah.
- Queue log dapat membedakan unavailable, conflict, validation, dan unknown.
- Pesan UI tetap aman dan tidak mengekspos connection string atau SQL mentah.

### 3. Tambahkan test runner frontend jika mulai membuat unit test TS

File utama:

- `package.json`
- `src/services/**/__tests__/*.test.ts`
- Config test jika dibutuhkan.

Langkah:

1. Tambahkan Vitest hanya jika fase ini benar-benar mulai menulis automated test.
2. Tambahkan script:

```json
{
  "test": "vitest run"
}
```

3. Buat test kecil untuk helper yang tidak membutuhkan Tauri runtime:

```txt
queue stale processing recovery
retryable error classification
remote tombstone merge decision
stock overwrite guard
conflict response normalization
```

4. Untuk helper yang masih terikat Dexie, gunakan fake/in-memory boundary atau
   pisahkan pure helper lebih dulu. Jangan membuat test rapuh yang tergantung
   browser IndexedDB jika belum ada setup.

Acceptance criteria:

- `bun run test` tersedia jika Vitest ditambahkan.
- Test helper persistence berjalan tanpa Tauri runtime.
- Build dan lint tetap lulus.

### 4. Tambahkan test Rust untuk migration/repository kritis

File utama:

- `src-tauri/src/repositories/*_repository.rs`
- `src-tauri/tests/` atau module test Rust yang sesuai.
- `src-tauri/migrations/*.sql`

Langkah:

1. Prioritaskan repository yang punya bundle dan journal:

```txt
journal_entry_repository
sales_document_repository
purchase_document_repository
finance_transaction_repository
stock_mutation_repository
```

2. Test minimal:

```txt
migration dapat dijalankan pada database kosong
upsert bundle menyimpan header + lines/items
upsert ulang tidak menggandakan lines/items
conflict/version guard bekerja
journal unbalanced ditolak
deleted_at/tombstone tidak menghapus histori yang masih diperlukan
```

3. Jika butuh database Postgres live untuk integration test, dokumentasikan
   requirement env khusus test, misalnya:

```env
DATABASE_URL_TEST=postgresql://appuser:apppassword@localhost:5432/appdb_test
```

4. Jangan jalankan integration test yang membutuhkan database live sebagai syarat
   default `bun run build`. Pisahkan command Rust test agar developer tahu
   dependency-nya.

Acceptance criteria:

- Migration test bisa membuktikan schema baru tidak rusak pada database kosong.
- Repository test melindungi bundle write dan conflict guard.
- Test yang butuh database live terdokumentasi jelas.

### 5. Tambahkan manual QA matrix persistence

File utama:

- `docs/POSTGRES-TAURI-PERSISTENCE-LAYER.md`
- Dokumen fase ini jika QA matrix belum ingin dimasukkan ke parent persistence.

Matrix minimal:

```txt
Scenario
PostgreSQL status
Network status
Local pending queue
Expected queue status
Expected Dexie data
Expected UI behavior
Command/test
```

Skenario wajib:

- App start tanpa `.env`.
- App start dengan PostgreSQL mati.
- Queue pending saat offline, lalu online.
- Queue `processing` stale setelah reload.
- Conflict remote lebih baru.
- Journal unbalanced.
- Product remote tombstone dengan transaksi historis.
- Sales/journal incremental refresh.
- Migration dari database kosong.

Acceptance criteria:

- QA persistence tidak bergantung pada ingatan developer.
- Setiap release internal dapat mengecek scenario blocker dengan urutan yang
  sama.

## Validasi

Minimal command setelah fase menyentuh kode:

```bash
bun run build
bun run lint
cd src-tauri && cargo check
```

Jika test runner ditambahkan:

```bash
bun run test
cd src-tauri && cargo test
```

Manual QA:

- Copy `src-tauri/.env.example` ke `src-tauri/.env`, lalu jalankan setup lokal.
- Uji error unavailable dan pastikan queue tidak menganggapnya sukses.
- Uji conflict dan pastikan tidak retry otomatis tanpa resolusi.
- Uji migration pada database kosong khusus test.

## Urutan Commit Disarankan

1. Sanitize `.env.example` dan update doc env.
2. Error DTO Rust + adapter normalization.
3. Queue error classification.
4. Vitest/helper tests jika dependency disetujui.
5. Rust integration tests untuk migration/repository.
6. Manual QA matrix persistence.
