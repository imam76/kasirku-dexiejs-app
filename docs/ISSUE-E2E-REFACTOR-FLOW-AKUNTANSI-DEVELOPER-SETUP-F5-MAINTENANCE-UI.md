# Sub-Issue: Fase 5 - Maintenance UI Setelah Setup

Parent issue:

- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-13

## Ringkasan

Setelah setup awal pindah ke Developer Setup, halaman lama tidak boleh tetap
terasa seperti satu-satunya tempat setup. Settings, COA, Currency, dan General
Ledger setup harus membaca setup snapshot, menampilkan status aktif, dan
menghormati guard setelah transaksi/opening balance ada.

## Kenapa Perlu Sub-Issue

Fase ini menjaga backward compatibility. Flow lama tetap bisa dipakai untuk
maintenance, tetapi harus sinkron dengan setup awal dan tidak boleh menimpa
baseline akuntansi tanpa validasi lock.

## Scope

- Update Settings accounting date card.
- Update COA template panel/management.
- Update Currency management.
- Update General Ledger setup/opening balance entry point.
- Tambahkan CTA kembali ke Developer Setup atau Settings jika setup belum
  lengkap.
- Tambahkan readonly/disabled state ketika lock berlaku.

## Non-Scope

- Tidak membuat reset/migration flow untuk mengganti template/base currency
  setelah transaksi ada.
- Tidak mengubah posting opening balance selain memakai cutoff setup awal.
- Tidak membuat generator periode bulanan.

## Checklist

- [x] Tambahkan shared lock/status helper:
  - [x] `getAccountingSetupLockSignals`;
  - [x] `useAccountingSetupStatus`.
- [x] `AccountingDateSettingsCard`:
  - [x] baca setup snapshot;
  - [x] tampilkan status setup awal;
  - [x] tampilkan cutoff/fiscal/current period dari setup;
  - [x] cegah perubahan cutoff/policy/periode bila opening balance atau
    transaksi sudah ada.
- [x] COA template panel:
  - [x] tampilkan template aktif dari setup;
  - [x] beri lock jika transaksi/jurnal sudah ada;
  - [x] cegah apply template ulang yang menggandakan akun lewat UI dan service.
- [x] Currency page:
  - [x] tandai base currency dari setup/read model aktif;
  - [x] tampilkan state locked saat data operational sudah ada;
  - [x] tampilkan warning dampak perubahan sebelum transaksi pertama.
- [x] General Ledger setup:
  - [x] baca cutoff dari setup awal;
  - [x] opening balance memakai cutoff setup;
  - [x] tidak bisa post opening balance tanpa cutoff valid;
  - [x] service posting opening balance menolak cutoff/policy yang berbeda dari
    setup snapshot.
- [ ] Finance pages:
  - [ ] jika setup belum lengkap, tampilkan CTA kembali ke Developer Setup atau
    Settings sesuai permission.
- [ ] Auth/module access:
  - [ ] pastikan perubahan setup config dari realtime mengubah akses module secara
    konsisten.

## Catatan Implementasi 2026-07-14

- Lock signal untuk baseline akuntansi dipusatkan di
  `src/services/accountingSetupLockService.ts`; alias lama
  `getBaseCurrencyLockSignals` tetap tersedia untuk kompatibilitas fase 4.
- `useAccountingSetupStatus` menyediakan setup snapshot + lock signal untuk UI
  maintenance.
- Settings accounting date card sekarang memakai setup snapshot sebagai default,
  menampilkan baseline aktif, dan mengunci save ketika data operasional sudah
  ada.
- COA template/profile memakai setup snapshot sebagai template aktif dan
  menolak perubahan template/profile setelah lock, baik dari UI maupun service.
- Currency management menandai base currency dari read model aktif dan
  menampilkan warning locked/pre-transaction.
- General Ledger readiness dan opening balance memakai cutoff/policy dari setup
  snapshot bila tersedia.

## Validasi 2026-07-14

- `bun run build`
  - Warning existing: `beep.mp3` runtime URL.
  - Warning existing: chunk Vite lebih besar dari 500 kB.
- `bun run lint`
  - Warning existing: dependency hook di `SetupKeyDrawer.tsx`.
- `bun run test:unit`
- `git diff --check`

## Acceptance Criteria

- Settings tidak menimpa setup awal tanpa validasi lock.
- COA tidak bisa ganti template setelah transaksi/jurnal ada, kecuali lewat
  flow reset/migration terpisah.
- Currency page tidak bisa mengganti base currency setelah data operational
  membuatnya locked.
- GL setup tidak bisa post opening balance tanpa cutoff valid.
- Halaman maintenance menampilkan baseline setup yang sama dengan wizard.

## Referensi Issue Induk

- Tujuan flow lama tetap maintenance: bagian `Tujuan`.
- Maintenance impact: bagian `Cutoff, periode, closing`, `Accounting template
  dan COA`, `Currency dan formatter`, dan `General Ledger dan opening balance`.
- Rencana fase: bagian `Fase 5 - Maintenance UI Setelah Setup`.

## Referensi File

- `src/components/AccountingDateSettingsCard.tsx`
- `src/view/finance/chart-of-accounts/ChartOfAccountsManagement.tsx`
- `src/components/chart-of-accounts/FinanceAccountMappingPanel.tsx`
- `src/view/master-data/currencies/*`
- `src/components/general-ledger/OpeningBalanceForm.tsx`
- `src/components/general-ledger/ManualJournalForm.tsx`
- `src/view/finance/general-ledger/GeneralLedgerManagement.tsx`
- `src/routes/finance/general-ledger/setup.lazy.tsx`
- `src/utils/accounting/getGeneralLedgerReadiness.ts`
- `src/auth/AuthGate.tsx`

## Dependency

- Fase 1: setup snapshot/read service.
- Fase 3: canonical save setup.
- Fase 4: base currency read model.

## Handoff Ke Fase Berikutnya

- Fase 6 menguji maintenance UI guard setelah setup selesai, opening balance
  posted, dan transaksi dibuat.
