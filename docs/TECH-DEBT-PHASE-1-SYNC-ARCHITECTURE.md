# Tech Debt P1 - Sync Architecture and Data Contracts

Fase ini merapikan debt arsitektur setelah blocker P0 selesai. Fokusnya adalah
menjaga sync tetap mudah ditambah per entity, memperkuat kontrak konflik/data,
dan membuat peta coverage PostgreSQL yang tidak membingungkan Dexie-first flow.

## Masalah Yang Diselesaikan

1. `src/services/syncQueueService.ts` terlalu besar.
   File ini menampung mapping DTO, validator payload, processor, retry,
   metadata update, enqueue, dan dispatch entity. Ini membuat perubahan entity
   baru berisiko menyentuh satu file besar.

2. Conflict resolution dan domain guard masih kasar.
   Beberapa domain memakai `version + updated_at`, tetapi PostgreSQL masih banyak
   menerima status sebagai `TEXT`, nominal sebagai `DOUBLE PRECISION`, dan belum
   punya guard kuat untuk status transition atau balanced journal.

3. Sumber kebenaran stock belum tegas.
   `products.stock` ikut sync sebagai snapshot, sementara `stock_mutations` juga
   menjadi event ledger.

4. Tombstone belum konsisten.
   Beberapa master data dipertahankan sebagai inactive, sedangkan product remote
   `deleted_at` dapat menghapus row lokal Dexie.

5. Coverage PostgreSQL finance belum lengkap.
   COA, `generalLedgerSetting`, payment ledger, sales return, promo, unit
   conversion, dan POS transaction belum punya peta migrasi yang setara dengan
   entity yang sudah di-sync.

## Target Selesai

- `syncQueueService.ts` menjadi facade tipis yang menjaga public export lama.
- Logic sync per entity bisa ditambah tanpa membuat file utama makin besar.
- Conflict dan error dari PostgreSQL punya hasil yang bisa dibedakan oleh queue:
  retryable, conflict, validation, atau fatal.
- Stock punya invariant eksplisit antara ledger dan snapshot.
- Tombstone policy konsisten untuk data yang pernah direferensikan transaksi.
- Ada backlog coverage PostgreSQL finance yang diprioritaskan.

## Tidak Masuk Scope

- Menghapus Dexie.
- Mengubah UI read source menjadi PostgreSQL.
- Membuat server-side reporting penuh.
- Mengubah aturan bisnis stok, journal, sales, atau purchase di luar guard yang
  didokumentasikan.

## Langkah Penyelesaian

### 1. Pecah `syncQueueService.ts` tanpa mengubah behavior

File utama:

- `src/services/syncQueueService.ts`
- Folder baru yang disarankan: `src/services/syncQueue/`

Struktur yang disarankan:

```txt
src/services/syncQueue/
  constants.ts
  types.ts
  errors.ts
  queueRepository.ts
  entityRegistry.ts
  metadata.ts
  mappers/
  validators/
  processors/
```

Langkah:

1. Pindahkan constant entity dan batch config ke `constants.ts`.
2. Pindahkan type helper dan error helper ke `types.ts` atau `errors.ts`.
3. Pindahkan operasi Dexie queue umum ke `queueRepository.ts`:
   create, update status, mark synced, mark failed, retry failed, recover stale.
4. Pindahkan metadata update entity ke `metadata.ts`.
5. Pindahkan mapper local-to-remote ke `mappers/<entity>.ts`.
6. Pindahkan payload guard ke `validators/<entity>.ts`.
7. Pindahkan processor per entity ke `processors/<entity>.ts`.
8. Buat `entityRegistry.ts` yang memetakan:

```txt
entity key
operation support
mapper
validator
processor
metadata updater
refresh hook optional
```

9. Biarkan `src/services/syncQueueService.ts` mengekspor fungsi lama:
   `processPendingSyncQueue`, `retryFailedSyncQueueItems`, dan enqueue helpers.
10. Setelah semua import existing aman, kecilkan file facade secara bertahap.

Acceptance criteria:

- Public import existing tidak berubah.
- Menambah entity sync baru cukup menambah registry entry dan file entity.
- Build/lint lulus tanpa perubahan behavior sync.

### 2. Perkuat conflict dan domain guard

File utama:

- `src-tauri/migrations/*.sql`
- `src-tauri/src/repositories/*_repository.rs`
- `src-tauri/src/commands/*_commands.rs`
- `src/services/postgresAdapter.ts`
- Service domain frontend yang mengirim payload ke adapter.

Langkah:

1. Definisikan format error command terstruktur:

```txt
code: UNAVAILABLE | VALIDATION_ERROR | CONFLICT | NOT_FOUND | MIGRATION_ERROR | UNKNOWN
message: string aman untuk UI
retryable: boolean
details?: object
```

2. Untuk upsert entity yang punya `version` atau `updated_at`, pastikan conflict
   menghasilkan `CONFLICT`, bukan sekadar string error.
3. Tambahkan guard status transition di repository atau service boundary:

```txt
DRAFT -> POSTED
DRAFT -> VOID
POSTED -> REVERSED
POSTED tidak boleh kembali ke DRAFT
VOID tidak boleh diedit sebagai dokumen aktif
```

4. Tambahkan validasi journal sebelum upsert:

```txt
total_debit == total_credit
line debit/credit tidak negatif
satu line tidak boleh debit dan credit sekaligus
posted journal tidak boleh berubah tanpa reversal
```

5. Tambahkan SQL constraint yang aman setelah audit data existing. Jangan tambah
   constraint yang dapat mematahkan data lama tanpa migration/backfill.
6. Tambahkan partial unique index idempotency untuk source event yang harus unik,
   misalnya journal dari source yang sama:

```txt
source_type + source_id + source_event ketika deleted_at IS NULL
```

7. Hindari memperluas scope ke semua tabel sekaligus. Prioritas awal:
   journal, finance transaction, sales document, purchase document.

Acceptance criteria:

- Queue bisa membedakan conflict dengan error jaringan.
- Conflict tidak otomatis menimpa data remote yang lebih baru.
- Journal tidak bisa tersimpan unbalanced dari command PostgreSQL.
- Status document/journal tidak bisa mundur ke status yang tidak valid.

### 3. Tetapkan invariant stock

File utama:

- `src/services/productReadService.ts`
- `src/services/postgresAdapter.ts`
- `src-tauri/src/repositories/product_repository.rs`
- `src-tauri/src/repositories/stock_mutation_repository.rs`
- `docs/POSTGRES-TAURI-PERSISTENCE-LAYER.md`

Keputusan yang disarankan:

- `stock_mutations` adalah event ledger untuk perubahan stok.
- `products.stock` adalah materialized snapshot/cache untuk tampilan cepat.
- Remote product sync tidak boleh menghapus/mengalahkan local stock jika masih
  ada mutation pending atau failed.
- Rekonsiliasi stok harus menghitung ulang snapshot dari mutation ledger.

Langkah:

1. Dokumentasikan invariant ini di persistence layer doc.
2. Tambah helper reconciliation, misalnya
   `recalculateProductStockFromMutations(productId)`.
3. Saat merge remote product, pisahkan field master data dari field stock.
4. Jika ada pending/failed stock mutation lokal untuk product yang sama, jangan
   overwrite stock snapshot dari remote.
5. Tambah metadata audit ketika reconciliation mengubah snapshot stock.

Acceptance criteria:

- Tidak ada dua sumber kebenaran stok yang saling menimpa tanpa aturan.
- Stock snapshot bisa direkonsiliasi ulang dari mutation ledger.
- Product master update tidak menghapus efek mutation lokal yang belum sync.

### 4. Samakan tombstone policy

File utama:

- `src/services/productReadService.ts`
- Read service master data lain.
- Type local yang belum punya `deleted_at` atau `is_active`.
- Migration Dexie jika perlu menambah field tombstone lokal.

Policy yang disarankan:

- Data yang pernah direferensikan transaksi tidak dihapus hard-delete dari Dexie.
- Remote `deleted_at` dimap ke tombstone lokal atau `is_active=false`.
- Hard-delete hanya boleh untuk data draft/temp yang tidak pernah dipakai
  transaksi historis.

Langkah:

1. Audit semua read service yang menangani `deleted_at`.
2. Buat helper umum, misalnya `shouldApplyRemoteTombstone`.
3. Untuk product, ganti behavior delete lokal menjadi mark inactive/tombstone.
4. Pastikan UI list default menyembunyikan inactive/tombstone, tetapi detail
   transaksi historis tetap bisa menampilkan snapshot nama/kode.
5. Update backup/restore jika ada field tombstone baru.

Acceptance criteria:

- Product historis tidak hilang dari Dexie hanya karena remote deleted.
- Policy tombstone seragam antara contacts, warehouses, products, dan master data
  lain yang dipakai transaksi.

### 5. Buat peta coverage PostgreSQL finance

File utama:

- `docs/POSTGRES-TAURI-PERSISTENCE-LAYER.md`
- `src/lib/db.ts`
- Service finance/sales/purchase/POS terkait.

Backlog awal:

```txt
COA / chartOfAccounts
financeAccountMappings
accountingProfileSetting
enabledModules
generalLedgerSetting
salesInvoicePayments
purchaseInvoicePayments
salesReturns
salesReturnItems
promos
unit conversions
POS transaction header/items
```

Langkah:

1. Tambahkan tabel backlog dengan kolom:

```txt
Domain
Dexie table
PostgreSQL migration
Rust model/repository/command
Frontend adapter
Sync queue
Read refresh
Status
Catatan risiko
```

2. Tandai status jelas:

```txt
not_started
planned
partial
done
blocked
```

3. Jangan klaim finance coverage selesai jika domain payment ledger dan return
   belum dipetakan.
4. Prioritaskan domain berdampak ke saldo dan audit trail sebelum promo/unit.

Acceptance criteria:

- Roadmap persistence tidak lagi menyiratkan coverage lebih luas dari kondisi
  live repo.
- Setiap domain finance punya status dan next step yang eksplisit.

## Validasi

Minimal command:

```bash
bun run build
bun run lint
cd src-tauri && cargo check
```

Manual QA:

- Queue tetap bisa sync entity yang sudah ada.
- Retry failed queue masih bekerja.
- Conflict menghasilkan status yang dapat dibedakan di UI/log.
- Product historis tetap muncul di dokumen lama setelah remote tombstone.
- Stock mutation pending tidak tertimpa product remote refresh.

## Urutan Commit Disarankan

1. Extract facade `syncQueueService.ts` tanpa perubahan behavior.
2. Tambah error/contract terstruktur dan conflict classification.
3. Guard journal/document/finance domain yang paling kritis.
4. Stock invariant dan reconciliation.
5. Tombstone policy.
6. Coverage matrix PostgreSQL finance.
