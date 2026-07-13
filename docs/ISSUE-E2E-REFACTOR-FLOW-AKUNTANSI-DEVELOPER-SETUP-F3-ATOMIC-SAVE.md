# Sub-Issue: Fase 3 - Apply Template dan Accounting Reference Atomic

Parent issue:

- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-13

## Ringkasan

Fase ini membuat service orchestrator untuk menyimpan setup akuntansi awal
secara aman. Save wizard harus mengubah module setup, COA/template,
accounting profile, cutoff, periode berjalan, base currency, setup snapshot,
activity log, dan sync queue tanpa meninggalkan data setengah jadi.

## Kenapa Perlu Sub-Issue

Ini fase paling berisiko secara behavior. Service existing sudah punya transaksi
dan side effect masing-masing. Orchestrator perlu memvalidasi lebih dulu,
menulis local data secara atomic sejauh memungkinkan, dan memastikan save ulang
idempotent.

## Scope

- Membuat `src/services/accountingInitialSetupService.ts`.
- Menyediakan command `saveInitialAccountingSetup(input)`.
- Membuat core/internal helper dari service existing jika dibutuhkan agar bisa
  dipanggil dalam satu orchestrator.
- Menjamin apply template dan periode berjalan idempotent.
- Menulis setup snapshot dan activity log.
- Enqueue semua entity yang berubah.

## Non-Scope

- Tidak otomatis mem-posting opening balance.
- Tidak mengubah transaksi historis sebelum cutoff.
- Tidak membuat flow reset template/base currency setelah transaksi ada.

## Kontrak Command

Command utama:

```ts
saveInitialAccountingSetup(input)
```

Tanggung jawab:

- validasi module selection dan input accounting setup;
- resolve `business_template_code` ke `accounting_profile`,
  `industry_extension`, dan `template_id` dari registry;
- simpan `app_setup_config`;
- apply template COA dengan mode aman;
- simpan accounting profile;
- simpan cutoff dan inventory policy;
- buat/update periode berjalan;
- set base currency;
- tulis setup snapshot/audit;
- tulis activity log;
- enqueue semua row yang berubah.

## Validasi Minimal

- Template bisnis wajib valid dan enabled.
- Template disabled/preview tidak boleh disimpan sebagai active setup.
- `accounting_profile`, `industry_extension`, dan `template_id` tidak boleh
  dipercaya dari payload client jika dikirim; service harus derive dari
  `business_template_code`.
- Cutoff dan periode memenuhi aturan tanggal.
- Periode berjalan tidak overlap dengan periode lain yang tidak kompatibel.
- Jika `opening_balance_journal_id` sudah ada, cutoff tidak boleh berubah.
- Jika sudah ada transaksi/jurnal posted, template dan base currency tidak boleh
  berubah.
- Hanya satu currency boleh `is_base = true`.

## Checklist

- Buat `accountingInitialSetupService.ts`.
- Tambahkan schema/type input command.
- Pastikan input command user-facing cukup memakai `business_template_code`
  untuk pilihan jenis bisnis.
- Tambahkan resolver registry jenis bisnis:
  - `Ritel (SAK EMKM)`;
  - `Koperasi (SAK ETAP)`;
  - `Perdagangan Umum (SAK EMKM)`;
  - `Jasa Umum (SAK EMKM)`;
  - preview disabled untuk Manufaktur, Konstruksi, Pemerintahan.
- Tambahkan helper guard transaksi existing:
  - dokumen sales/purchase/POS;
  - finance transaction;
  - journal entry;
  - payment;
  - payroll;
  - koperasi transaction;
  - opening balance posted.
- Reuse logic `applyChartOfAccountTemplate` dengan mode idempotent:
  - tidak menggandakan akun;
  - tidak menggandakan mapping;
  - tidak menimpa akun yang sudah locked tanpa policy jelas.
- Reuse logic `saveAccountingReferenceSetting`, tetapi pisahkan core write bila
  helper existing terlalu self-contained.
- Buat/update `accountingPeriods` untuk periode berjalan.
- Simpan `generalLedgerSetting.cutoff_date` dan `inventory_policy`.
- Set base currency sesuai input.
- Simpan setup snapshot.
- Tulis activity log:
  - `ACCOUNTING_INITIAL_SETUP_COMPLETED`;
  - `ACCOUNTING_INITIAL_SETUP_UPDATED`.
- Enqueue sync untuk:
  - `app_setup_config`;
  - setup snapshot;
  - chart of accounts;
  - finance account mappings;
  - accounting profile setting;
  - general ledger setting;
  - accounting periods;
  - currencies/currency rates bila berubah.
- Pastikan error validasi terjadi sebelum partial write.
- Tambahkan unit/service test untuk idempotency.

## Acceptance Criteria

- Jika template sudah pernah diterapkan, save ulang tidak menggandakan akun.
- Jika periode sama sudah ada, save ulang memakai periode existing.
- Jika ada overlap periode yang tidak valid, save ditolak.
- Jika cutoff/template/base currency sudah locked, save ditolak dengan pesan
  spesifik.
- Activity log menjelaskan template, cutoff, periode, dan base currency.
- Setup snapshot dan canonical tables konsisten setelah save.
- Setup snapshot menyimpan hasil mapping profile/template yang sesuai dengan
  `business_template_code`.
- Semua entity yang berubah masuk sync queue.

## Referensi Issue Induk

- Step save atomic: bagian `Step 5 - Review dan Save Atomic`.
- Template/COA impact: bagian `Accounting template dan COA`.
- Cutoff/period impact: bagian `Cutoff, periode, closing`.
- GL/opening balance impact: bagian `General Ledger dan opening balance`.
- Rencana fase: bagian `Fase 3 - Apply Template dan Accounting Reference Atomic`.

## Referensi File

- `src/services/accountingInitialSetupService.ts`
- `src/services/setupKeyService.ts`
- `src/services/chartOfAccountService.ts`
- `src/services/accountingReferenceSettingService.ts`
- `src/services/accountingPeriodService.ts`
- `src/services/currencyService.ts`
- `src/services/syncQueueService.ts`
- `src/services/generalLedgerService.ts`
- `src/constants/accounting.ts`
- `src/constants/chartOfAccounts.ts`
- `src/lib/database/KasirkuDB.ts`

## Related Issue

- [Input Saldo Awal Simpanan Koperasi](ISSUE-KOPERASI-SALDO-AWAL-SIMPANAN.md)
  karena template koperasi dan cutoff setup awal menjadi referensi saldo awal
  koperasi.

## Dependency

- Fase 0: keputusan product/technical lock.
- Fase 1: setup snapshot dan sync support.
- Fase 2: input dari wizard.

## Handoff Ke Fase Berikutnya

- Fase 5 memakai canonical setup hasil command ini sebagai sumber maintenance
  UI.
- Fase 6 menguji idempotency, sync, guard, offline, dan regression.
