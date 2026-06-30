# Issue: Refactor Sync Queue Koperasi dan Lengkapi Flow `COOPERATIVE_*` untuk Realtime

Tanggal catatan: 2026-06-30

## Ringkasan

Beberapa flow koperasi sudah memakai `syncQueueService.ts`, tetapi belum semua
data koperasi yang berubah lokal punya entity queue yang lengkap. Akibatnya ada
data yang terlihat berubah di perangkat lokal, tetapi tidak ikut upload ke
PostgreSQL dan tidak memicu refresh realtime di perangkat lain.

Issue ini mencatat coverage yang sudah ada, gap flow `COOPERATIVE_*`, dan arah
refaktor supaya penambahan entity koperasi berikutnya tidak terus menambah
kompleksitas di satu file besar.

## Masalah

`src/services/syncQueueService.ts` sekarang memegang banyak tanggung jawab:

- constant entity queue
- mapper local ke remote DTO
- payload validator
- queue processor
- update metadata sync per tabel
- enqueue helper
- scanner pending local data

Untuk flow koperasi, file ini sudah mendukung entity utama, tetapi belum
mendukung semua flow yang sudah punya data lokal, remote adapter, atau realtime
notification.

## Coverage Koperasi Saat Ini

Entity koperasi yang sudah masuk `syncQueueService.ts`:

| Flow | Entity queue | Tabel Dexie | Status |
| --- | --- | --- | --- |
| Area koperasi | `COOPERATIVE_AREA_ENTITY` | `cooperativeAreas` | Sudah queue |
| Anggota koperasi | `COOPERATIVE_MEMBER_ENTITY` | `cooperativeMembers` | Sudah queue |
| Transaksi simpanan | `COOPERATIVE_SAVING_TRANSACTION_ENTITY` | `cooperativeSavingTransactions` | Sudah queue |
| Saldo simpanan anggota | `COOPERATIVE_MEMBER_SAVING_BALANCE_ENTITY` | `cooperativeMemberSavingBalances` | Sudah queue |
| Pinjaman | `COOPERATIVE_LOAN_ENTITY` | `cooperativeLoans` | Sudah queue |
| Angsuran pinjaman | `COOPERATIVE_LOAN_INSTALLMENT_ENTITY` | `cooperativeLoanInstallments` | Sudah queue |
| Pembayaran pinjaman | `COOPERATIVE_LOAN_PAYMENT_ENTITY` | `cooperativeLoanPayments` | Sudah queue |

Contoh action yang sudah tercover oleh queue di atas:

- `COOPERATIVE_AREA_CREATED`, `COOPERATIVE_AREA_UPDATED`, `COOPERATIVE_AREA_ARCHIVED`, `COOPERATIVE_AREA_RESTORED`
- `COOPERATIVE_MEMBER_CREATED`, `COOPERATIVE_MEMBER_UPDATED`, `COOPERATIVE_MEMBER_ARCHIVED`, `COOPERATIVE_MEMBER_RESTORED`
- `COOPERATIVE_SAVING_DEPOSIT_RECORDED`, `COOPERATIVE_SAVING_WITHDRAWAL_RECORDED`, `COOPERATIVE_SAVING_TRANSACTION_REVERSED`
- `COOPERATIVE_LOAN_SUBMITTED`, `COOPERATIVE_LOAN_APPROVED`, `COOPERATIVE_LOAN_REJECTED`, `COOPERATIVE_LOAN_DISBURSED`
- `COOPERATIVE_LOAN_PAYMENT_RECORDED`, `COOPERATIVE_LOAN_PAYMENT_REVERSED`

## Flow Yang Belum Lengkap

### 1. `COOPERATIVE_LOAN_COLLECTION_EVENT`

File terkait:

- `src/services/cooperativeLoanService.ts`
- `src/services/cooperativeCollectionEventService.ts`
- `src/services/postgresAdapter.ts`
- `src-tauri/migrations/0026_cooperative_payment_integrity.sql`
- `src-tauri/migrations/0034_realtime_notifications.sql`

Kondisi sekarang:

- `recordCooperativeLoanInstallmentCollectionLocally` membuat row
  `cooperativeLoanCollectionEvents` dengan `sync_status: 'pending'`.
- Flow lokal hanya enqueue update ke `cooperativeLoanInstallments`.
- Tidak ada entity queue untuk `cooperativeLoanCollectionEvents`.
- Tidak ada mapper local event ke remote DTO/input di `syncQueueService.ts`.
- Tidak ada payload guard, metadata updater, queue processor, enqueue helper,
  atau scanner pending event di `enqueuePendingCooperativeDataForSync`.
- Di sisi remote sudah ada:
  - `cooperativeCollectionEventPostgresAdapter.list`
  - `cooperativeCollectionEventPostgresAdapter.record`
  - `refreshCooperativeCollectionEventsFromPostgres`
  - trigger realtime untuk tabel `cooperative_loan_collection_events`

Dampak:

- Histori tindak lanjut penagihan yang dibuat lokal bisa tertahan di Dexie.
- Perangkat lain hanya menerima perubahan snapshot di installment, bukan event
  history penagihan yang lengkap.
- Realtime notification baru berguna kalau event sudah berhasil masuk
  PostgreSQL.

Catatan desain:

- Adapter remote saat ini memakai command `record` yang butuh `session_token`.
  Queue processor perlu keputusan:
  - memakai session token aktif dan menahan queue jika token tidak tersedia, atau
  - menambah command upsert/idempotent khusus queue yang menerima actor fields
    dari payload lokal.
- `event_id` harus dipakai sebagai idempotency key supaya retry tidak membuat
  event ganda.

### 2. `COOPERATIVE_FIELD_CASH_SESSION`

Keputusan:

- Dikeluarkan dari scope sync/realtime.
- Kas petugas tidak memakai konsep buka/tutup sesi sebagai operational data.
- Sumber data lintas perangkat untuk kas petugas adalah mutasi kas/finance
  transaction, bukan metadata session `OPEN`/`CLOSED`.

File legacy yang perlu diaudit/hapus terpisah:

- `src/services/cooperativeFieldCashService.ts`
- `src/lib/database/KasirkuDB.ts`
- `src/lib/database/migrations.ts`

Kondisi sekarang:

- `openCooperativeFieldCashSession` membuat row `cooperativeFieldCashSessions`.
- `closeCooperativeFieldCashSession` memperbarui row yang sama.
- Action activity log sudah ada:
  - `COOPERATIVE_FIELD_CASH_SESSION_OPENED`
  - `COOPERATIVE_FIELD_CASH_SESSION_CLOSED`

Dampak:

- Jangan menambah tabel PostgreSQL, adapter remote, realtime trigger, entity
  queue, atau refresh read service untuk `cooperativeFieldCashSessions`.
- Jika masih ada UI/service yang membuka atau menutup sesi kas petugas, flow itu
  perlu dihapus/deprecate agar user tidak mengira ada status sesi lintas
  perangkat.

Catatan desain:

- Laporan dan rekonsiliasi kas petugas harus berbasis `financeTransactions` dan
  `field_cash_account_id`.
- `cooperativeFieldCashSessions` tidak boleh menjadi alasan menambah coverage
  sync queue koperasi.

### 3. `COOPERATIVE_PAYMENT_APPROVAL_REQUEST`

File terkait:

- `src/services/cooperativeLoanService.ts`
- `src/services/postgresAdapter.ts`
- `src-tauri/migrations/0027_cooperative_payment_maker_checker.sql`
- `src-tauri/migrations/0034_realtime_notifications.sql`

Kondisi sekarang:

- Approval request dibuat dan diputuskan lewat command server:
  - `postgres_list_cooperative_payment_approval_requests`
  - `postgres_request_cooperative_payment_reversal`
  - `postgres_approve_cooperative_payment_request`
  - `postgres_reject_cooperative_payment_request`
- Tidak ada tabel Dexie untuk `cooperativePaymentApprovalRequests`.
- Tidak ada entity queue, dan ini wajar jika dianggap server-authoritative.
- Realtime trigger sudah mencakup `cooperative_payment_approval_requests`, tetapi
  frontend belum punya refresh Dexie untuk approval requests.

Dampak:

- Tab approval bergantung pada query langsung saat halaman aktif.
- Jika butuh badge/notifikasi realtime lintas halaman, perlu read cache atau
  query invalidation khusus, bukan sekadar queue upload.

Catatan desain:

- Jangan campur flow maker-checker server-authoritative dengan queue offline
  tanpa aturan bisnis yang jelas.
- Putuskan apakah perlu Dexie read cache atau cukup invalidate/refetch query
  saat event realtime masuk.

### 4. `COOPERATIVE_POSTING_ACCOUNTS` dan `COOPERATIVE_PAYMENT_POLICY`

File terkait:

- `src/services/postgresAdapter.ts`
- `src-tauri/migrations/0026_cooperative_payment_integrity.sql`
- `src-tauri/migrations/0034_realtime_notifications.sql`

Kondisi sekarang:

- Remote table sudah ada dan punya realtime trigger.
- Tidak ada tabel Dexie atau queue coverage.
- `cooperativePostingPostgresAdapter.registerAccounts` dipanggil sebagai
  dependency posting pembayaran server.

Dampak:

- Kalau UI nantinya menampilkan atau mengubah policy/posting account, data tidak
  punya jalur cache/refresh lokal.

Catatan desain:

- Tetapkan sebagai server config read-through, atau tambahkan read service
  khusus jika perlu ditampilkan realtime.

### 5. `CooperativeSettings`

File terkait:

- `src/types/index.ts`
- `src/lib/database/migrations.ts`

Kondisi sekarang:

- Ada tabel Dexie `cooperativeSettings`.
- Tidak ada sync metadata, remote schema, adapter, queue, atau realtime path.

Dampak:

- Default bunga/tenor lokal tidak otomatis sama antar perangkat jika field ini
  mulai dipakai sebagai konfigurasi operasional bersama.

## Rencana Refaktor

### Tahap 1: Pecah `syncQueueService.ts` menjadi registry per entity

Target struktur:

```txt
src/services/syncQueue/
  constants.ts
  queueRepository.ts
  entityRegistry.ts
  metadata.ts
  cooperative/
    area.ts
    member.ts
    savingTransaction.ts
    memberSavingBalance.ts
    loan.ts
    loanInstallment.ts
    loanPayment.ts
    loanCollectionEvent.ts
```

`src/services/syncQueueService.ts` tetap menjadi facade agar import lama tidak
rusak.

Acceptance criteria:

- Public export lama tetap tersedia.
- Menambah entity baru cukup menambah registry entry.
- Mapper, validator, processor, dan metadata updater tidak lagi menumpuk di file
  utama.

### Tahap 2: Tambahkan queue untuk `cooperativeLoanCollectionEvents`

Task:

- Tambah constant `COOPERATIVE_LOAN_COLLECTION_EVENT_ENTITY`.
- Tambah mapper local event ke remote input/DTO.
- Tambah payload validator.
- Tambah metadata updater untuk `cooperativeLoanCollectionEvents`.
- Tambah processor queue event penagihan.
- Tambah `enqueueCooperativeLoanCollectionEventSync`.
- Tambah wrapper di `cooperativeSyncService.ts`.
- Update `recordCooperativeLoanInstallmentCollectionLocally` supaya enqueue:
  - update `cooperativeLoanInstallments`
  - create `cooperativeLoanCollectionEvents`
- Update `enqueuePendingCooperativeDataForSync` supaya scan event pending/failed.
- Pastikan migration legacy event dengan `sync_status: 'pending'` ikut terangkat
  ke queue.

Acceptance criteria:

- Event penagihan lokal yang pending muncul di `syncQueue`.
- Saat queue berhasil, row event berubah menjadi `sync_status: 'synced'`.
- Event yang sama tidak dobel setelah retry.
- Perangkat lain mendapat histori event setelah refresh realtime.

### Tahap 3: Buang scope session kas petugas

Task:

- Jangan tambahkan entity queue `COOPERATIVE_FIELD_CASH_SESSION_ENTITY`.
- Jangan tambahkan remote migration `cooperative_field_cash_sessions`.
- Audit UI/service open/close session kas petugas yang masih tersisa.
- Hapus/deprecate flow session jika tidak dipakai oleh UI aktif.
- Pastikan laporan kas petugas tetap memakai `financeTransactions` dan
  `field_cash_account_id`.

Acceptance criteria:

- Tidak ada acceptance sync/realtime untuk open/close session kas petugas.
- Tidak ada pekerjaan baru untuk menyinkronkan `cooperativeFieldCashSessions`.
- Mutasi dropping/storting tetap sinkron lewat jalur finance transaction.

### Tahap 4: Rapikan realtime read refresh untuk flow server-authoritative

Task:

- Tentukan handling realtime untuk `cooperative_payment_approval_requests`:
  - invalidate/refetch query approval saat event realtime masuk, atau
  - tambah Dexie read cache dan refresh service.
- Tentukan handling untuk `cooperative_posting_accounts` dan
  `cooperative_payment_policy`.

Acceptance criteria:

- Perubahan approval request terlihat tanpa reload manual pada layar yang relevan.
- Tidak ada queue offline untuk flow yang harus tetap server-authoritative.

## Definition of Done

- Semua local write koperasi yang memberi `sync_status: 'pending'` punya jalur
  queue atau terdokumentasi sebagai local-only.
- Semua entity queue koperasi punya mapper, validator, processor, metadata
  updater, enqueue helper, dan pending scanner.
- Realtime Postgres tidak hanya memberi notifikasi, tetapi data target memang
  bisa di-upload dan di-refresh ke Dexie.
- Tidak ada duplikasi event akibat retry.
- Build dan test sync terkait lulus.

## Test Plan

- Unit/service test untuk `enqueuePendingCooperativeDataForSync` memasukkan
  `cooperativeLoanCollectionEvents` pending/failed.
- Test processor queue event penagihan:
  - success menandai event synced
  - network error menandai failed dan bisa retry
  - duplicate `event_id` tidak membuat row remote ganda
- Test flow lokal `recordCooperativeLoanInstallmentCollectionLocally` membuat
  queue item installment dan collection event.
- Test realtime smoke:
  - client A mencatat tindak lanjut penagihan
  - queue upload berhasil
  - client B menerima event realtime dan histori penagihan ter-refresh

## Label Saran

- `tech-debt`
- `sync`
- `koperasi`
- `realtime`
- `offline-first`
