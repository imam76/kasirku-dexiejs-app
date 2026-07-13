# Sub-Issue: Fase 0 - Audit dan Freeze Decision Accounting Initial Setup

Parent issue:

- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-13

## Ringkasan

Fase ini mengunci keputusan produk dan teknis sebelum implementasi dimulai.
Tanpa fase ini, fase model, wizard, atomic save, dan currency bisa berjalan
dengan asumsi berbeda tentang template bisnis, periode berjalan, dan aturan
lock setelah transaksi dibuat.

## Kenapa Perlu Sub-Issue

- Keputusan `Perdagangan Umum` dan `Jasa Umum` mempengaruhi registry template,
  COA, mapping akun, dan copy UI.
- Keputusan UX perlu memastikan user hanya memilih **Jenis Bisnis**, sementara
  profile/standard/template menjadi turunan otomatis.
- Keputusan model periode menentukan apakah fase awal memakai Opsi A sederhana
  atau langsung refactor parent-child periode.
- Keputusan base currency menentukan apakah non-IDR langsung production-ready
  atau hanya boleh dipilih sebelum transaksi pertama.
- Daftar hardcoded `Rp` perlu jadi backlog eksplisit agar Fase 4 tidak melebar
  tanpa batas.

## Scope

- Audit keputusan bisnis template.
- Audit model periode berjalan.
- Audit guard untuk template, cutoff, periode, dan base currency.
- Inventarisasi hardcoded currency display.
- Menulis hasil keputusan sebagai catatan implementasi yang menjadi input fase
  berikutnya.

## Non-Scope

- Belum membuat tabel baru.
- Belum mengubah wizard UI.
- Belum mengganti formatter currency.
- Belum mengubah logic apply template.

## Checklist

- Tentukan mapping jenis bisnis:
  - `RETAIL` tampil sebagai `Ritel (SAK EMKM)` -> `SAK_EMKM` + `RETAIL` +
    `SAK_EMKM_RETAIL_TEMPLATE`.
  - `COOPERATIVE` tampil sebagai `Koperasi (SAK ETAP)` -> `SAK_ETAP` +
    `COOPERATIVE` +
    `SAK_ETAP_KOPERASI_TEMPLATE`.
  - `GENERAL_TRADING` tampil sebagai `Perdagangan Umum (SAK EMKM)` ->
    template baru atau alias retail v1.
  - `GENERAL_SERVICE` tampil sebagai `Jasa Umum (SAK EMKM)` -> extension baru
    atau `NONE` v1.
- Putuskan bahwa UI wizard tidak menampilkan field profile, standard, industry
  extension, atau template COA terpisah.
- Tentukan status preview/disabled untuk manufacturing, construction, dan
  government.
- Putuskan model periode v1:
  - rekomendasi: Opsi A, `accountingPeriods` hanya untuk periode berjalan;
  - `fiscal_period_start/end` disimpan di setup snapshot.
- Tentukan mode base currency:
  - rekomendasi: IDR default tetap aman;
  - non-IDR boleh dipilih hanya sebelum transaksi pertama.
- Catat hard lock setelah transaksi/opening balance:
  - template bisnis;
  - accounting profile;
  - industry extension;
  - cutoff date;
  - base currency;
  - current period jika sudah locked/closed.
- Audit string hardcoded:
  - `Rp`;
  - `IDR`;
  - `BASE_CURRENCY_CODE`;
  - label kurs `currency/IDR`.
- Buat daftar halaman/report yang masuk scope Fase 4 v1 dan yang masuk backlog
  lanjutan.

## Acceptance Criteria

- Ada keputusan produk untuk mapping semua jenis bisnis yang tampil di wizard.
- Ada keputusan UX bahwa pilihan user-facing hanya **Jenis Bisnis**; field
  teknis selalu otomatis dari mapping.
- Ada keputusan teknis untuk penyimpanan periode berjalan.
- Ada daftar field yang locked setelah transaksi pertama atau opening balance.
- Ada daftar area hardcoded currency yang diprioritaskan untuk Fase 4.
- Issue Fase 1 sampai Fase 4 bisa memakai keputusan ini tanpa menunggu diskusi
  ulang.

## Referensi Issue Induk

- Ringkasan flow baru: `docs/ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md`
- Step jenis bisnis: bagian `Step 2 - Pilih Jenis Bisnis`.
- Step periode: bagian `Step 3 - Tanggal Cutoff dan Periode`.
- Step base currency: bagian `Step 4 - Base Currency`.
- Rencana fase: bagian `Fase 0 - Audit dan Freeze Decision`.

## Referensi File

- `src/constants/accounting.ts`
- `src/constants/chartOfAccounts.ts`
- `src/constants/currencies.ts`
- `src/utils/documentCurrency.ts`
- `src/utils/formatters.ts`
- `src/components/DocumentCurrencyFields.tsx`
- `src/services/accountingPeriodService.ts`
- `src/services/accountingReferenceSettingService.ts`

## Dependency

- Tidak ada dependency implementasi.

## Output Yang Diharapkan

- Catatan keputusan di issue ini atau di parent issue.
- Checklist scope Fase 1 sampai Fase 4 yang sudah tidak ambigu.
