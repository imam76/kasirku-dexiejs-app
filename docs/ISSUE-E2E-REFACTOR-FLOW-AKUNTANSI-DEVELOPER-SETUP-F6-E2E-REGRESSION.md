# Sub-Issue: Fase 6 - E2E Test dan Regression

Parent issue:

- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-13

## Ringkasan

Fase ini memastikan Accounting Initial Setup aman dari sisi user journey,
idempotency, sync/realtime, offline queue, guard, dan regression flow lama.
Fitur ini menyentuh bootstrap aplikasi, accounting, currency, sync, dan
koperasi, jadi E2E harus menjadi gate sebelum issue induk dianggap selesai.

## Kenapa Perlu Sub-Issue

Test scope-nya lintas domain dan tidak boleh tercecer di fase implementasi.
Sub-issue ini menjadi daftar bukti bahwa refactor setup awal tidak merusak flow
lama dan bisa berjalan multi-device/offline-first.

## Scope

- E2E fresh setup retail.
- E2E fresh setup koperasi.
- E2E sync/realtime setup.
- E2E guard setelah opening balance/transaksi.
- E2E offline save dan upload queue.
- Regression flow lama Settings/COA/GL/Currency.

## Non-Scope

- Tidak membuat test compliance PSAK/PSAP penuh.
- Tidak membuat test generator periode bulanan jika belum ada di fase v1.
- Tidak menguji semua halaman yang punya hardcoded currency di luar scope Fase
  4 v1.

## Test Case

### AIS-SETUP-01 - Fresh setup retail

Langkah:

1. Jalankan app dengan database fresh.
2. Validasi license.
3. Pilih module finance/sales.
4. Pilih Jenis Bisnis `Ritel (SAK EMKM)`.
5. Isi cutoff, periode fiskal, periode berjalan, dan base IDR.
6. Simpan.
7. Buka COA, mapping, setting GL, periode, dan currency.

Expected:

- Setup selesai tanpa masuk Settings/COA dulu.
- `app_setup_config` berisi module aktif.
- COA retail dan mapping finance tersedia.
- Accounting profile `SAK_EMKM`, extension `RETAIL`, dan template COA retail
  tersimpan sebagai hasil mapping otomatis.
- `generalLedgerSetting.cutoff_date` tersimpan.
- Periode berjalan dibuat.
- IDR menjadi base currency.
- Setup snapshot tersimpan dan berstatus sync sesuai kondisi jaringan.

### AIS-SETUP-02 - Fresh setup koperasi

Langkah:

1. Jalankan database fresh.
2. Pilih module koperasi + finance.
3. Pilih Jenis Bisnis `Koperasi (SAK ETAP)`.
4. Isi cutoff, periode, dan base IDR.
5. Simpan.
6. Buka COA atau mapping koperasi.

Expected:

- Template `SAK_ETAP + COOPERATIVE` aktif.
- Akun `1120`, `2300`, `2310`, `2320`, `2330` tersedia.
- Mapping koperasi untuk piutang pinjaman, simpanan anggota, pendapatan
  bunga/denda/admin, dan beban terkait tersedia sesuai template v1.

### AIS-SETUP-03 - Sync/realtime multi-device

Langkah:

1. Device A menyimpan setup awal.
2. Device B sedang login pada database yang sama.
3. Tunggu sync/realtime refresh.

Expected:

- Device B menerima update `app_setup_config`.
- Device B menerima setup snapshot.
- COA, mapping, GL setting, periode, dan currency konsisten.
- Query invalidation berjalan dari event realtime setup.

### AIS-SETUP-04 - Guard setelah opening balance posted

Langkah:

1. Selesaikan setup awal.
2. Post opening balance.
3. Coba ubah cutoff dari wizard/Settings.

Expected:

- Perubahan cutoff ditolak.
- Pesan error menyebut opening balance sudah posted.
- Data cutoff lama tidak berubah.

### AIS-SETUP-05 - Guard setelah transaksi dibuat

Langkah:

1. Selesaikan setup awal.
2. Buat transaksi operasional, misalnya dokumen sales atau finance transaction.
3. Coba ubah Jenis Bisnis dan base currency.

Expected:

- Template bisnis tidak bisa diganti.
- Base currency tidak bisa diganti.
- Existing document snapshot tetap sama.

### AIS-SETUP-06 - Validasi periode

Langkah:

1. Isi current period di luar rentang fiscal period.
2. Coba save.

Expected:

- Save ditolak sebelum local write.
- Tidak ada setup snapshot parsial.
- Error menunjuk field periode.

### AIS-SETUP-07 - Offline save dan upload queue

Langkah:

1. Jalankan setup saat remote offline/tidak tersedia.
2. Simpan setup.
3. Pastikan data local tersimpan pending.
4. Pulihkan koneksi remote.
5. Jalankan sync queue.

Expected:

- Row local berstatus pending saat offline.
- Queue upload saat online.
- Remote merge menandai row synced.
- Tidak ada duplicate account/period setelah retry.

### AIS-SETUP-08 - Maintenance UI regression

Langkah:

1. Selesaikan setup dari Developer Setup.
2. Buka Settings, COA, Currency, dan GL setup.
3. Verifikasi semua membaca setup yang sama.

Expected:

- Settings menampilkan cutoff/periode dari setup.
- COA menampilkan template aktif.
- Currency menandai base currency.
- GL setup memakai cutoff setup.
- Halaman maintenance tidak menimpa baseline tanpa validasi.

## Checklist

- [x] Tambahkan/ubah `tests/e2e/accounting-setup.spec.ts`.
- [x] Siapkan helper seed/fresh database untuk setup flow.
- [ ] Siapkan helper fake/offline remote jika test harness mendukung.
- [x] Tambahkan assertion Dexie untuk setup snapshot dan canonical tables.
- [x] Tambahkan assertion UI untuk lock/warning.
- [x] Tambahkan regression untuk save ulang setup agar idempotent.
- [x] Dokumentasikan test manual jika multi-device realtime belum mudah
  diotomasi.

## Catatan Implementasi 2026-07-14

- `tests/e2e/helpers/accounting.ts` menambah fixture save setup awal,
  pembacaan state Dexie untuk snapshot/canonical tables/sync queue, helper lock
  signal transaksi finance, dan helper cutoff legacy sebelum post opening
  balance.
- Regression lama `ACC-01 sampai ACC-07` tetap dipertahankan dan disesuaikan:
  mapping KSP default dibuktikan dari Dexie karena UI mapping sekarang mengikuti
  profile/template aktif, dan post opening balance legacy memastikan cutoff
  tersedia lebih dulu.
- `AIS-SETUP-01` dan `AIS-SETUP-08` otomatis: retail setup menyimpan
  `app_setup_config`, setup snapshot, profile, GL setting, period, base
  currency, COA/mapping, sync queue inti, serta maintenance UI Settings/COA/
  Currency/GL membaca baseline yang sama.
- `AIS-SETUP-02` otomatis: setup koperasi menerapkan `SAK_ETAP +
  COOPERATIVE`, akun koperasi, dan mapping koperasi v1.
- `AIS-SETUP-04` otomatis: setelah opening balance posted, perubahan cutoff
  ditolak dan cutoff lama tetap tersimpan.
- `AIS-SETUP-05` otomatis: save ulang idempotent, transaksi finance membuat
  baseline locked, perubahan jenis bisnis/base currency ditolak, dan UI
  Settings/COA/Currency menampilkan state locked.
- `AIS-SETUP-06` otomatis: current period di luar fiscal period ditolak tanpa
  setup snapshot parsial.
- `AIS-SETUP-03` masih manual karena butuh dua device/session yang tersambung
  backend realtime yang sama.
- `AIS-SETUP-07` masih manual untuk tahap upload queue `pending -> synced`
  karena test harness saat ini belum menyediakan fake remote/sync adapter.

## Validasi 2026-07-14

- `bun run test:e2e:chromium tests/e2e/accounting-setup.spec.ts`
  - 6 passed.
- `bun run test:unit`
  - 2 passed.
- `bun run lint`
  - 0 errors.
  - Warning existing: dependency hook di `SetupKeyDrawer.tsx`.
- `bun run build`
  - Pass.
  - Warning existing: `beep.mp3` runtime URL dan chunk Vite lebih besar dari
    500 kB.
- `git diff --check`
  - Pass.

## Acceptance Criteria

- [x] Semua test E2E otomatis scope v1 yang tersedia di harness lokal pass.
- [x] Ada test atau catatan manual untuk realtime multi-device.
- [x] Ada test untuk guard cutoff/template/base currency.
- [ ] Ada test untuk offline pending -> synced.
- [x] Save ulang tidak menggandakan COA, mapping, period, atau setup snapshot.

## Referensi Issue Induk

- Test list: bagian `Fase 6 - E2E Test dan Regression`.
- Acceptance utama: bagian `Acceptance Criteria Utama`.
- Risiko: bagian `Risiko`.

## Referensi File

- `tests/e2e/accounting-setup.spec.ts`
- `src/view/auth/SetupKeyDrawer.tsx`
- `src/services/accountingInitialSetupService.ts`
- `src/services/syncOrchestratorService.ts`
- `src/services/syncQueueService.ts`
- `src/services/chartOfAccountService.ts`
- `src/services/accountingPeriodService.ts`
- `src/services/currencyService.ts`
- `src/components/AccountingDateSettingsCard.tsx`
- `src/components/general-ledger/OpeningBalanceForm.tsx`

## Dependency

- Fase 1 sampai Fase 5 selesai minimal untuk happy path v1.

## Handoff

- Jika ada regression gagal, buka issue kecil berdasarkan domain:
  - setup wizard;
  - sync/realtime;
  - template/COA;
  - period/cutoff;
  - base currency;
  - maintenance UI.
