# Issue: Komitmen/Reservasi Anggaran (Budget Commitment Tracking)

Tanggal catatan: 2026-08-30

Sumber kebutuhan: diskusi user saat riset `docs/FINANCE-BUDGET.md`, dicatat
eksplisit di dokumen itu sebagai fitur yang **belum** termasuk MVP (lihat
bagian "Hal yang Sengaja Ditunda": *"Kalau kebutuhanmu memang butuh
commitment/reservation tracking (uang 'ter-alokasi' tapi belum keluar) — itu
fitur beda ... yang secara eksplisit belum termasuk di MVP ini"*).

Prasyarat: Modul Anggaran MVP (`docs/FINANCE-BUDGET.md`) harus sudah selesai
dan stabil dipakai sebelum issue ini dikerjakan — `budget_commitments`
mereferensikan `budgets.id` lewat foreign key aplikatif (bukan DB constraint
keras, mengikuti pola project ini).

## Ringkasan

MVP Anggaran (`docs/FINANCE-BUDGET.md`) hanya membandingkan **rencana**
(`planned_amount`) dengan **realisasi aktual** dari `financeTransactions`.
Tidak ada konsep "rencana pengeluaran yang sudah dialokasikan secara mental
tapi belum jadi transaksi nyata".

Kasus konkret yang memicu issue ini: user membuat anggaran `Operasional`
Rp 6.000.000 untuk satu bulan, lalu ingin mengalokasikan Rp 600.000 di
dalamnya untuk "konsumsi rapat" — tapi barangnya belum dibeli, belum jelas
harga final maupun jadi/tidaknya. Dengan MVP saat ini:

- Sisa anggaran tetap tampil utuh Rp 6.000.000 selama belum ada transaksi
  expense tercatat, padahal secara rencana user sudah "menahan" Rp 600.000
  untuk keperluan itu.
- Tidak ada tempat mencatat rencana ini di dalam sistem selain field
  `notes` bebas teks (tidak dihitung, sekadar pengingat).
- User berisiko membuat rencana pengeluaran lain yang totalnya melebihi
  sisa anggaran riil, tanpa sistem memberi peringatan apa pun, karena semua
  rencana yang belum jadi transaksi tidak terlihat oleh sistem.

Issue ini menambahkan **lapisan komitmen** di atas modul Anggaran yang sudah
ada: tetap planning/read layer, tetap tidak pernah menyentuh
`financeTransactions`/`financeBalance`/General Ledger, tapi menambah
"sisa yang benar-benar available" dengan memperhitungkan rencana yang belum
jadi transaksi.

## Status Saat Ini

Yang sudah tersedia (hasil implementasi `docs/FINANCE-BUDGET.md`):

- Table Dexie `budgets` (`src/lib/database/migrations/versions/v130.ts`),
  type `Budget` di `src/types/index.ts`.
- `budgetRealizationService.ts` menghitung `actual_amount` murni dari
  `financeTransactions` (category + type + rentang tanggal periode).
- Sync offline-first penuh (`0090_budgets.sql`, Rust
  model/repository/commands, `postgresAdapter.ts`, `syncQueueService.ts`,
  `realtimeSyncTableMap.ts`).
- Cek versi terbaru saat implementasi issue ini: Dexie saat dokumen ini
  ditulis sudah sampai `v130`, migration PostgreSQL sudah sampai
  `0090_budgets.sql`. Gunakan nomor berikutnya yang tersedia, jangan
  asumsikan `v131`/`0091` masih kosong.

Yang belum tersedia:

- Entity apa pun untuk mencatat rencana pengeluaran/pemasukan yang belum
  jadi transaksi (commitment/reservation).
- Perhitungan "sisa available" yang memperhitungkan rencana tersebut.
- UI untuk mencatat, melihat, dan menyelesaikan (resolve) rencana per
  anggaran.

## Masalah Bisnis

Tanpa fitur ini:

- User tidak bisa melihat sisa anggaran yang benar-benar bisa dipakai untuk
  hal baru, karena rencana yang sudah dipikirkan tapi belum dieksekusi tidak
  tercatat di mana pun secara terhitung.
- Risiko overspend baru terlihat setelah transaksi benar-benar tercatat,
  padahal secara perencanaan user sudah tahu totalnya akan melebihi sisa
  jauh sebelum itu terjadi.
- User terpaksa melacak rencana pengeluaran secara manual di luar aplikasi
  (catatan/spreadsheet terpisah), padahal aplikasi sudah punya modul
  Anggaran yang seharusnya jadi satu tempat untuk ini.

## Tujuan

- Entity baru `BudgetCommitment`, 1 baris = 1 rencana pengeluaran/pemasukan
  terhadap **satu** `Budget` tertentu (relasi many-to-one via `budget_id`).
- Status commitment: `PLANNED` (direncanakan, belum ada transaksi nyata),
  `REALIZED` (user menandai manual bahwa rencana ini sudah terwujud jadi
  transaksi nyata), `CANCELLED` (batal, tidak jadi dieksekusi).
- `BudgetRealization` diperluas dengan `committed_amount` (total commitment
  aktif berstatus `PLANNED`) dan `available_amount = planned_amount -
  actual_amount - committed_amount`, supaya user melihat sisa yang benar-benar
  bisa dipakai untuk rencana baru.
- Tambahan status "proyeksi" (`projected_status`, berbasis
  `actual + committed`) terpisah dari status realisasi aktual yang sudah ada
  (berbasis `actual` saja) — supaya "sudah direncanakan tapi belum
  dieksekusi" tidak disalahartikan sebagai "sudah benar-benar melebihi
  anggaran".
- Tetap tidak pernah menulis `financeTransactions`, tidak pernah mengubah
  `financeBalance`, tidak pernah memicu `recalculateFinance()` atau posting
  jurnal — prinsip yang sama persis dengan `budgets`.

## Non-Goal

- **Bukan** approval workflow atau dokumen Purchase Order formal. Tidak ada
  approver, tidak ada multi-level, tidak ada status "menunggu persetujuan".
  Siapa pun dengan `FINANCE_ACCESS` bisa membuat/menyelesaikan commitment
  sendiri, sama seperti mengelola `budgets`.
- **Bukan** auto-matching otomatis antara commitment dan transaksi nyata
  (mis. mencocokkan berdasarkan jumlah+kategori+tanggal). Menyelesaikan
  commitment (`REALIZED`/`CANCELLED`) selalu aksi manual user — mengingat
  nominal rencana vs nominal transaksi asli hampir pasti berbeda (harga
  belum final, seperti di kasus pemicu issue ini).
- Tidak ada notifikasi/reminder jatuh tempo commitment.
- Tidak ada lampiran/attachment bukti (quotation, invoice proforma, dst).
- Tidak ada commitment yang menyebar ke banyak `Budget` sekaligus — 1
  commitment selalu terikat ke 1 `Budget`.
- Tidak mengubah definisi `status` (Aman/Waspada/Melebihi) yang sudah ada di
  `docs/FINANCE-BUDGET.md` — itu tetap murni berbasis realisasi aktual.
  `projected_status` adalah field baru yang berdiri sendiri, bukan pengganti.

## Aturan Bisnis Kunci: Mencegah Double-Counting

Ini bagian paling gampang salah, jadi didokumentasikan eksplisit:

1. `committed_amount` pada `BudgetRealization` **hanya** menjumlahkan
   commitment dengan `status = 'PLANNED'`. Commitment `REALIZED` atau
   `CANCELLED` **tidak** dihitung lagi di `committed_amount` — dianggap
   sudah "selesai" (baik karena sudah jadi transaksi nyata, atau batal).
2. `actual_amount` tetap dihitung persis seperti MVP sekarang: murni dari
   `financeTransactions`, tidak peduli sama sekali terhadap ada/tidaknya
   commitment. Commitment tidak pernah mengubah cara `actual_amount`
   dihitung.
3. Konsekuensinya: begitu user benar-benar mencatat transaksi expense/income
   di Cash & Bank untuk rencana yang sebelumnya dibuat sebagai commitment,
   **user wajib** membuka commitment terkait dan mengubah statusnya jadi
   `REALIZED` (atau `CANCELLED` jika ternyata batal/diganti rencana lain).
   Kalau user lupa melakukan ini, `available_amount` akan under-count
   (dianggap masih "tertahan" padahal sudah keluar sebagai `actual_amount`)
   — ini adalah keterbatasan yang disengaja karena tidak ada auto-matching
   (lihat Non-Goal), bukan bug.
4. Field `resolved_at` diisi otomatis saat status berubah dari `PLANNED` ke
   `REALIZED`/`CANCELLED`, dan dikosongkan lagi kalau user membuka form dan
   mengubah status balik ke `PLANNED`.
5. Over-commitment (total `actual + committed` melebihi `planned_amount`)
   **tidak diblokir** — modul ini tetap murni planning/pembanding, bukan
   enforcement, konsisten dengan prinsip `budgets` yang tidak pernah
   menghalangi user mencatat transaksi apa pun. Ditampilkan sebagai
   `projected_status = 'OVER'` saja (visual warning).

## Data Model

Tambahkan di `src/types/index.ts`, dekat definisi `Budget`.

```ts
export type BudgetCommitmentStatus = 'PLANNED' | 'REALIZED' | 'CANCELLED';
export type BudgetCommitmentSyncStatus = EntitySyncStatus;

export interface BudgetCommitment {
  id: string;
  budget_id: string;                     // relasi ke Budget.id (app-level, bukan FK DB keras)
  description: string;                   // "Konsumsi rapat divisi", dst — wajib diisi
  amount: number;                        // >= 0, nominal rencana
  status: BudgetCommitmentStatus;        // default 'PLANNED'
  notes?: string;
  resolved_at?: string;                  // diisi saat status berubah dari PLANNED
  created_at: string;
  updated_at: string;
  sync_status?: BudgetCommitmentSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

Catatan model:

- `budget_id` divalidasi di service (harus merujuk `Budget` yang ada dan
  `is_active=true`) — bukan foreign key database, mengikuti pola relasi
  aplikatif lain di project ini (mis. `financeTransactions.category`
  terhadap `FINANCE_CATEGORIES`, bukan FK SQL).
- Commitment pada `Budget` yang belakangan diarsipkan (`is_active=false`)
  tetap tersimpan sebagai riwayat — hanya pembuatan commitment **baru**
  yang diblokir untuk budget non-aktif.
- `amount` tidak boleh negatif (sama seperti `planned_amount`).
- Tidak ada validasi unik — satu budget boleh punya banyak commitment.

## DB Schema Dexie

```ts
// src/lib/database/migrations/versions/v131.ts
// (nomor versi indikatif — cek versi terbaru saat implementasi, budgets
// sendiri sudah memakai v130)
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV131(db: KasirkuDB) {
  db.version(131).stores({
    budget_commitments: 'id, budget_id, status, created_at, updated_at, sync_status',
  });
}
```

Wiring wajib sama seperti `v130`: registrasi di `migrations.ts`, tambah
`budget_commitments!: Table<BudgetCommitment>;` di `KasirkuDB.ts`.

## Service Layer

Buat `src/services/budgetCommitmentService.ts`:

```ts
export interface BudgetCommitmentUpsertInput {
  budget_id: string;
  description: string;
  amount: number;
  status?: BudgetCommitmentStatus; // default 'PLANNED' saat create
  notes?: string;
}

export const createBudgetCommitment = async (input: BudgetCommitmentUpsertInput) => {};
export const updateBudgetCommitment = async (id: string, input: BudgetCommitmentUpsertInput) => {};
export const deleteBudgetCommitment = async (id: string) => {};
```

Aturan service (mengikuti pola `budgetService.ts`):

- Guard `requireUserPermission(currentUser, 'FINANCE_ACCESS')` — tidak ada
  permission baru.
- Validasi Zod di `src/lib/validations/budgetCommitment.ts` (`description`
  wajib, `amount >= 0`, `budget_id` wajib merujuk budget aktif yang ada).
- Beda dengan `budgets`: commitment **hard delete** (bukan arsip) —
  commitment adalah catatan rencana sementara, bukan dokumen resmi yang
  perlu jejak audit permanen seperti `budgets`. Kalau butuh audit trail,
  cukup andalkan `activityLogs` (`BUDGET_COMMITMENT_CREATED/UPDATED/DELETED`).
- Saat `updateBudgetCommitment` mengubah `status` dari `PLANNED` ke
  `REALIZED`/`CANCELLED`, set `resolved_at = now()`. Saat diubah balik ke
  `PLANNED`, kosongkan `resolved_at`.
- **Tidak pernah** memanggil `addFinanceTransaction`, `recalculateFinance`,
  atau service `budgets` untuk mengubah `planned_amount`.
- Setiap mutasi menulis `activityLogs` dan memanggil
  `enqueueBudgetCommitmentSync(record, operation)`.

Update `src/services/budgetRealizationService.ts`:

```ts
export interface BudgetRealization {
  budget: Budget;
  actual_amount: number;
  committed_amount: number;         // baru: sum amount, status = 'PLANNED'
  available_amount: number;         // baru: planned - actual - committed (boleh negatif)
  remaining_amount: number;         // tetap: planned - actual
  usage_percent: number;            // tetap: actual / planned * 100
  status: 'SAFE' | 'WARNING' | 'OVER';           // tetap, berbasis actual saja
  projected_usage_percent: number;  // baru: (actual + committed) / planned * 100
  projected_status: 'SAFE' | 'WARNING' | 'OVER'; // baru, berbasis actual + committed
}

export const getBudgetRealization = (
  budget: Budget,
  transactions: FinanceTransaction[],
  commitments: BudgetCommitment[],
): BudgetRealization => { /* ... */ };
```

`committed_amount` = jumlah `amount` semua `BudgetCommitment` dengan
`budget_id === budget.id && status === 'PLANNED'`. Tidak difilter per
rentang tanggal periode — commitment tidak punya tanggal transaksi sendiri
(nilainya "masih rencana", jadi selalu dianggap berlaku selama budget yang
menaunginya masih periode aktif).

## Hook

Update `src/hooks/useBudgets.tsx` (atau tambah `useBudgetCommitments.tsx`
terpisah jika lebih rapi):

- Query `budget_commitments` dari Dexie, filter per `budget_id` saat dipakai
  di detail satu budget.
- Mutation create/update/delete memanggil `budgetCommitmentService`.
- Invalidate `['budget_commitments']` dan `['budgets']` (supaya
  `budgetsWithRealization` re-render dengan `committed_amount` terbaru)
  setelah sukses. Tetap **tidak** invalidate `['financeBalance']`.

## UI Plan

Form Anggaran (`BudgetFormModal.tsx`) tidak diubah strukturnya. Komitmen
ditampilkan/dikelola dari **detail** satu budget, bukan dari form
tambah/edit budget itu sendiri — supaya form Anggaran tetap pendek sesuai
keputusan MVP (`docs/FINANCE-BUDGET.md`: "form Anggaran jauh lebih pendek
... tanpa Tabs sama sekali").

- Tambahkan aksi baru "Lihat Komitmen" per baris budget: di desktop lewat
  tombol/ikon di kolom aksi tabel, di mobile lewat item baru pada
  `MobileCrudBottomSheet` (di samping Edit/Arsipkan yang sudah ada).
- Aksi ini membuka `BudgetCommitmentDrawer` (drawer full-screen di
  mobile/tablet via `ResponsiveCrudEditor`-style container, modal lebar
  sedang di desktop) berisi:
  - Ringkasan angka: Rencana, Realisasi, Komitmen, Tersedia
    (`available_amount`), dengan progress bar bersegmen (bagian terisi solid
    untuk `actual`, bagian bertekstur/dashed untuk `committed`, sisa polos
    untuk `available`).
  - Daftar commitment milik budget itu (`MobileCrudList<BudgetCommitment>`
    di mobile, table sederhana di desktop — reuse primitive yang sama,
    di-scope ke satu `budget_id`).
  - Tombol/FAB "+ Tambah Komitmen" yang membuka form pendek (deskripsi,
    nominal, catatan) — `ResponsiveCrudEditor` lagi, form baru terpisah
    dari `BudgetFormModal`.
  - Setiap baris commitment punya aksi cepat "Tandai Direalisasikan" /
    "Batalkan" / "Edit" / "Hapus".
- Badge status proyeksi (`projected_status`) ditampilkan di baris budget
  utama (tabel desktop dan card mobile) sebagai indikator kecil terpisah
  dari badge status existing (Aman/Waspada/Melebihi) — misal label
  "Proyeksi: Waspada" hanya muncul kalau ada commitment aktif
  (`committed_amount > 0`), supaya budget tanpa commitment tampilannya
  tidak berubah sama sekali dari MVP sekarang.

## i18n

Tambahkan ke `src/i18n/budgetMessages.ts`:

- `budget.commitment.title`, `budget.commitment.add`,
  `budget.commitment.description`, `budget.commitment.amount`,
  `budget.commitment.status.planned/realized/cancelled`,
  `budget.commitment.markRealized`, `budget.commitment.cancel`,
  `budget.commitment.availableAmount`,
  `budget.projectedStatus.safe/warning/over`.

## Sync BE/DB Tauri

Mengikuti pola persis `budgets` (lihat `docs/FINANCE-BUDGET.md` bagian
"Sync BE/DB Tauri"), tanpa modifikasi arsitektur sync:

Frontend:

- `src/services/budgetCommitmentReadService.ts` —
  `refreshBudgetCommitmentsFromPostgres`,
  `mergeRemoteBudgetCommitmentsIntoDexie`.
- `src/services/postgresAdapter.ts` — `RemoteBudgetCommitmentDto` +
  `budgetCommitmentPostgresAdapter`.
- `src/services/syncQueueService.ts` —
  `BUDGET_COMMITMENT_ENTITY = 'budget_commitments'`,
  `mapBudgetCommitmentToRemoteDto`, `enqueueBudgetCommitmentSync`,
  `processBudgetCommitmentQueueItem`, branch dispatch di
  `processSyncQueueItem`.
- `src/services/realtimeSyncTableMap.ts` — `budget_commitments: {
  refreshFns: [refreshBudgetCommitmentsFromPostgres], queryKeys:
  ['budget_commitments'] }`.
- `src/utils/backupRestore.ts` — tambah `budget_commitments` ke export,
  `expectedKeys`, transaction restore, dan bulk add.

Backend (`src-tauri/`):

- `migrations/0091_budget_commitments.sql` (nomor indikatif, sesuaikan
  dengan migration terakhir saat implementasi) — `CREATE TABLE IF NOT
  EXISTS budget_commitments (...)` + index `budget_id`/`updated_at` +
  trigger `kasirku_notify_data_change` (copy pola `0090_budgets.sql`).
  **Hard delete** di sini berarti DB delete beneran (bukan soft delete
  `is_active=false` seperti `budgets`), konsisten dengan keputusan service
  layer di atas.
- `src/models/budget_commitment.rs`, `src/repositories/
  budget_commitment_repository.rs` (`list`, `get`, `upsert`, `delete` —
  delete di sini benar-benar `DELETE FROM budget_commitments`, bukan update
  flag), `src/commands/budget_commitment_commands.rs`, registrasi di
  `lib.rs`.

## Urutan Implementasi

1. Pastikan `docs/FINANCE-BUDGET.md` (MVP Anggaran) sudah selesai dan
   dipakai — cek `budgets` table, service, UI sudah berjalan.
2. Tipe `BudgetCommitment`, `BudgetCommitmentStatus` di `src/types/index.ts`.
3. Migration Dexie berikutnya (indikatif `v131`) + wiring.
4. Validasi `src/lib/validations/budgetCommitment.ts`.
5. `budgetCommitmentService.ts` (create/update/delete + activity log +
   enqueue sync) — uji CRUD lokal Dexie dulu tanpa sync remote.
6. Update `budgetRealizationService.ts` (`committed_amount`,
   `available_amount`, `projected_usage_percent`, `projected_status`).
7. Update `useBudgets.tsx` / tambah `useBudgetCommitments.tsx`.
8. UI: `BudgetCommitmentDrawer.tsx` + form tambah/edit commitment + badge
   proyeksi di `BudgetTable.tsx`/card mobile.
9. i18n tambahan di `budgetMessages.ts`.
10. Backup/restore `backupRestore.ts`.
11. Sync remote: migration PostgreSQL, Rust model/repository/commands,
    `postgresAdapter.ts`, `budgetCommitmentReadService.ts`,
    `syncQueueService.ts`, `realtimeSyncTableMap.ts`.
12. Jalankan `bun run lint`, `bun run build`, `cargo check` di `src-tauri`.

## Acceptance Criteria

- User bisa membuat commitment (deskripsi + nominal) terhadap satu budget
  aktif, status default `PLANNED`.
- `committed_amount` dan `available_amount` pada budget terkait langsung
  ter-update setelah commitment dibuat/diubah/dihapus, tanpa menyentuh
  `actual_amount`, `financeBalance`, atau `financeTransactions`.
- Menandai commitment `REALIZED` atau `CANCELLED` mengeluarkan nominalnya
  dari `committed_amount` (tidak dihitung dobel lagi).
- Badge "Proyeksi" hanya muncul saat `committed_amount > 0`; budget tanpa
  commitment aktif tampil identik dengan sebelum issue ini dikerjakan.
- Menghapus commitment adalah hard delete (tidak muncul lagi di mana pun,
  tidak seperti arsip `budgets`).
- Sync offline-first: commitment dibuat offline tersimpan lokal, terkirim
  otomatis saat online, tampil di device lain via realtime.
- Backup/restore membawa data `budget_commitments`.

## Manual QA

1. Buat budget `Operasional` bulan berjalan, `planned_amount` Rp 6.000.000.
2. Buat commitment "Konsumsi rapat" Rp 600.000, status `PLANNED`. Pastikan
   `available_amount` menjadi Rp 5.400.000, `actual_amount` tetap 0, dan
   sisa lama (`remaining_amount`, berbasis actual saja) tetap
   Rp 6.000.000 utuh.
3. Catat transaksi expense nyata Rp 550.000 kategori sama di Cash & Bank
   (harga akhirnya beda dari rencana). Pastikan `actual_amount` naik jadi
   Rp 550.000, tapi `committed_amount` **belum** berubah (commitment masih
   `PLANNED`) — `available_amount` sekarang Rp 4.850.000 (masih
   double-count sampai user resolve, sesuai desain di atas).
4. Buka commitment tsb, tandai `REALIZED`. Pastikan `committed_amount`
   turun jadi 0, `available_amount` menjadi Rp 5.450.000
   (`6.000.000 - 550.000 - 0`), `resolved_at` terisi.
5. Buat commitment baru, lalu batalkan (`CANCELLED`) tanpa pernah ada
   transaksi nyata. Pastikan `committed_amount` tidak menghitungnya, dan
   tidak ada perubahan apa pun di `financeTransactions`/`financeBalance`.
6. Buat total commitment `PLANNED` yang melebihi sisa `planned_amount`,
   pastikan `projected_status` menjadi `OVER` tapi sistem tidak memblokir
   pembuatan commitment maupun transaksi apa pun.
7. Arsipkan budget yang punya commitment aktif, pastikan commitment lama
   tetap terlihat sebagai riwayat di drawer detail, tapi tombol "+ Tambah
   Komitmen" untuk budget itu disembunyikan/disabled.
8. Uji offline: buat/edit/hapus commitment dalam mode offline Tauri,
   nyalakan kembali, pastikan `sync_status` `pending` → `synced` dan data
   konsisten di Postgres.
9. Backup database, restore ke data yang sama, pastikan `budget_commitments`
   tidak hilang.
10. Jalankan `bun run lint` dan `bun run build`.

## Hal yang Sengaja Ditunda

- Approval workflow / dokumen Purchase Order formal.
- Auto-matching otomatis commitment ke transaksi nyata di `financeTransactions`.
- Notifikasi/reminder jatuh tempo commitment.
- Lampiran/attachment bukti (quotation, invoice proforma, dst).
- Commitment yang menyebar ke banyak `Budget` sekaligus.
- Riwayat revisi nominal commitment (audit trail terpisah selain
  `activityLogs` biasa).
- Import/export massal commitment.
