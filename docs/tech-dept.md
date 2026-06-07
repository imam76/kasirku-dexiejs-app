# Tech Debt Persistence Roadmap

Dokumen ini adalah indeks tech debt dari audit persistence Tauri + PostgreSQL.
Detail penyelesaian dipisah per fase supaya blocker production, refactor arsitektur,
dan hardening operasional tidak tercampur dalam satu pekerjaan besar.

Status dokumen: planning only. Belum ada implementasi kode dari roadmap ini.

## Pembagian Fase

1. [P0 - Production Safety Persistence](./TECH-DEBT-PHASE-0-PRODUCTION-SAFETY.md)
   Menyelesaikan blocker sebelum production: startup Tauri tidak boleh gagal hanya
   karena PostgreSQL tidak tersedia, queue `processing` harus bisa recovery, dan
   refresh PostgreSQL tidak boleh terus full-fetch untuk bundle besar.

2. [P1 - Sync Architecture and Data Contracts](./TECH-DEBT-PHASE-1-SYNC-ARCHITECTURE.md)
   Merapikan debt arsitektur: `syncQueueService.ts` yang terlalu besar,
   conflict/domain guard, invariant stock, tombstone policy, dan peta coverage
   PostgreSQL untuk domain finance yang belum dipindah.

3. [P2 - Operational Hardening and Tests](./TECH-DEBT-PHASE-2-OPERATIONAL-HARDENING.md)
   Menyelesaikan hygiene operasional: `.env.example`, error command Rust yang
   masih berupa string mentah, dan test otomatis untuk sync, conflict, stuck queue,
   serta migration.

## Aturan Pelaksanaan

- Tetap Dexie-first untuk UI read source sampai roadmap persistence menyatakan
  fase read-path migration secara eksplisit.
- Jangan mengganti flow bisnis POS, Sales, Purchase, Finance, atau GL ketika
  sedang mengerjakan fase tech debt, kecuali file fase tersebut memang meminta.
- Kerjakan urut dari P0 ke P2. P1 boleh dipecah lagi per entity jika diff terlalu
  besar.
- Refactor P1 harus menjaga public API lama dulu, terutama export dari
  `src/services/syncQueueService.ts`, supaya import existing tidak pecah.
- Setiap fase yang menyentuh kode harus minimal melewati `bun run build`,
  `bun run lint`, dan check Rust yang relevan.

## Audit Ringkas Sumber

### P0 / Sebelum Production

- Tauri startup masih hard-depend ke PostgreSQL. Di `src-tauri/src/lib.rs` app
  langsung create pool dan run migration saat startup. Di
  `src-tauri/src/db/pool.rs`, `DATABASE_URL` masih dibaca dengan `expect`.
  Untuk app offline-first, PostgreSQL mati tidak boleh membuat Tauri gagal buka
  sebelum Dexie sempat dipakai.
- Queue bisa nyangkut di status `processing`. `src/services/syncQueueService.ts`
  memakai flag memory-only `isProcessingSyncQueue`, lalu item diubah ke
  `processing`. Crash atau reload saat proses bisa meninggalkan queue macet jika
  tidak ada recovery.
- Refresh PostgreSQL masih full-fetch dan N+1 untuk bundle besar. Sales document
  dan journal fetch header lalu item per dokumen. Worker juga refresh banyak
  domain berurutan.

### P1 / Debt Arsitektur

- `src/services/syncQueueService.ts` sudah terlalu gemuk: mapping DTO, validator
  payload, processor, retry, metadata, dan dispatch entity berada di satu file.
- Conflict resolution masih kasar untuk finance, journal, dan document.
  Beberapa tabel PostgreSQL masih memakai `TEXT` atau `DOUBLE PRECISION` tanpa
  constraint domain/status/balanced journal yang cukup kuat.
- `products.stock` masih ikut sync sebagai snapshot, sementara
  `stock_mutations` juga menjadi event ledger. Harus ada invariant yang jelas
  tentang sumber kebenaran stok.
- Tombstone belum konsisten. Master data banyak dimap menjadi inactive, tetapi
  product remote `deleted_at` dapat menghapus Dexie lokal.
- Coverage PostgreSQL belum lengkap untuk finance penuh: COA,
  `generalLedgerSetting`, payment ledger, sales return, promo, unit conversion,
  dan POS transaction masih perlu dipetakan.

### P2 / Operasional

- `src-tauri/.env.example` masih hard-code IP lokal developer.
- Error Rust command masih banyak memakai `error.to_string()` langsung ke
  frontend atau queue.
- Belum ada test otomatis untuk sync failure, conflict, stuck queue, dan
  migration. `package.json` saat ini juga belum punya test runner khusus.
