# Sub-Issue: Fase 2 - Wizard UI di Developer Setup

Parent issue:

- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-13

Status implementasi: selesai untuk wizard UI Fase 2 pada 2026-07-13.

## Ringkasan

Fase ini memindahkan pengalaman setup akuntansi awal ke Developer Setup setelah
user memilih module/fitur. Wizard harus memandu user memilih **Jenis Bisnis**
sebagai satu field sederhana yang otomatis menentukan accounting profile,
standard, industry extension, dan template COA. Setelah itu user mengisi cutoff,
periode fiskal, periode berjalan, dan base currency sebelum review dan save.

## Kenapa Perlu Sub-Issue

UI wizard dapat dikembangkan paralel setelah kontrak Fase 1 tersedia, tetapi
risikonya berbeda dari model/sync: validasi form, step gating, state local,
loading/error, copy warning, dan integrasi `SetupKeyDrawer`.

## Scope

- Refactor `SetupKeyDrawer` menjadi multi-step.
- Menambah step akuntansi bersyarat.
- Menambah review sebelum save.
- Menampilkan error validasi sebelum save.
- Menjaga flow license dan module selection existing tetap berjalan.

## Non-Scope

- Belum membuat service atomic final jika Fase 3 belum selesai.
- Belum mengubah halaman Settings/COA/Currency maintenance.
- Belum mengganti semua hardcoded `Rp`.

## Step Wizard

Urutan v1:

1. License
2. Module
3. Akuntansi
4. Review

Step akuntansi dapat dipisah menjadi component kecil:

- `SetupModuleStep`
- `AccountingBusinessTemplateStep` dengan label UI **Jenis Bisnis**
- `AccountingPeriodStep`
- `AccountingBaseCurrencyStep`
- `SetupReviewStep`

## Trigger Step Akuntansi

Tampilkan step akuntansi jika module/fitur yang dipilih membutuhkan accounting
baseline, misalnya:

- `CHART_OF_ACCOUNTS`
- `GENERAL_LEDGER`
- `CASH_FLOW`
- `SALES_*`
- `PURCHASE_*`
- `KOPERASI_*`
- report finance

Jika tidak ada module yang membutuhkan baseline, tampilkan mode ringkas dengan
default base currency dan warning bahwa accounting setup bisa diselesaikan nanti
sesuai permission.

## Prinsip UX Jenis Bisnis

Jangan tampilkan profile, standard, industry extension, dan template COA sebagai
field terpisah. User cukup memilih satu kartu/dropdown **Jenis Bisnis**:

| Pilihan UI | Detail ringkas di UI | Nilai teknis otomatis |
| --- | --- | --- |
| Ritel | SAK EMKM | `SAK_EMKM` + `RETAIL` + `SAK_EMKM_RETAIL_TEMPLATE` |
| Koperasi | SAK ETAP | `SAK_ETAP` + `COOPERATIVE` + `SAK_ETAP_KOPERASI_TEMPLATE` |
| Perdagangan Umum | SAK EMKM | `SAK_EMKM` + keputusan Fase 0 |
| Jasa Umum | SAK EMKM | `SAK_EMKM` + keputusan Fase 0 |
| Manufaktur | Preview | disabled sampai domain siap |
| Konstruksi | Preview | disabled sampai domain siap |
| Pemerintahan | Preview | disabled sampai report PSAP siap |

Copy UI boleh menampilkan standard sebagai subtitle, misalnya `Koperasi - SAK
ETAP`, tetapi tidak meminta user memilih `SAK_ETAP` atau template COA secara
manual.

## Checklist

- [x] Refactor state `SetupKeyDrawer` agar punya step eksplisit.
- [x] Pisahkan module selection ke component kecil.
- [x] Tambahkan satu field/kartu pilihan **Jenis Bisnis**:
  - [x] Ritel (SAK EMKM);
  - [x] Koperasi (SAK ETAP);
  - [x] Perdagangan Umum (SAK EMKM);
  - [x] Jasa Umum (SAK EMKM);
  - [x] preview disabled untuk Manufaktur, Konstruksi, Pemerintahan.
- [x] Pastikan UI tidak menampilkan `accounting_profile`, `industry_extension`, atau
  `template_id` sebagai input manual.
- [x] Tambahkan field tanggal:
  - [x] `cutoff_date`;
  - [x] `fiscal_period_start`;
  - [x] `fiscal_period_end`;
  - [x] `current_period_start`;
  - [x] `current_period_end`.
- [x] Tambahkan pilihan base currency:
  - [x] default IDR;
  - [x] non-IDR hanya jika policy Fase 0 mengizinkan sebelum transaksi pertama.
- [x] Tambahkan validasi client-side:
  - [x] fiscal end >= fiscal start;
  - [x] current period berada dalam fiscal period;
  - [x] current end >= current start;
  - [x] cutoff <= current end;
  - [x] base currency code uppercase 3 huruf.
- [x] Review menampilkan:
  - [x] module aktif;
  - [x] jenis bisnis dan standard otomatis, misalnya `Koperasi (SAK ETAP)`;
  - [x] cutoff;
  - [x] periode fiskal;
  - [x] periode berjalan;
  - [x] base currency;
  - [x] warning lock setelah transaksi/opening balance.
- [x] Save menampilkan loading.
- [x] Drawer tidak menutup bila local write/upload gagal.
- [x] Error dari service ditampilkan di step terkait atau di review.

## Catatan Implementasi 2026-07-13

- `SetupKeyDrawer` sekarang memiliki step eksplisit: License, Module,
  Akuntansi, dan Review.
- Step module dipisah menjadi `SetupModuleStep`; step akuntansi dipecah menjadi
  `AccountingBusinessTemplateStep`, `AccountingPeriodStep`,
  `AccountingBaseCurrencyStep`, dan `SetupReviewStep`.
- Step akuntansi tampil penuh saat module terpilih membutuhkan baseline. Jika
  tidak, wizard memakai mode ringkas dengan default minimum dan warning.
- Save wizard sekarang mendelegasikan submit ke
  `saveInitialAccountingSetup(input)` dari Fase 3, sehingga UI tidak lagi
  menulis snapshot akuntansi sendiri.
- Atomic final save yang menerapkan COA, periode canonical, profile, base
  currency, snapshot, activity log, dan sync queue ditangani di Fase 3.
- Validasi teknis yang sudah dijalankan: `git diff --check` dan `bun run build`.

## Acceptance Criteria

- User bisa menyelesaikan setup awal tanpa masuk Settings/COA dulu.
- User hanya melihat step akuntansi saat module terpilih memang membutuhkan
  accounting baseline, atau melihat mode ringkas yang jelas.
- Error validasi muncul sebelum save.
- Save menampilkan loading dan tidak menutup drawer bila gagal.
- Review cukup jelas untuk mencegah user salah memilih jenis
  bisnis/cutoff/currency.
- User tidak perlu memahami atau memilih manual `SAK_ETAP`, `SAK_EMKM`,
  `industry_extension`, atau template COA.

## Referensi Issue Induk

- Flow baru: bagian `Flow Baru Yang Diinginkan`.
- Developer setup impact: bagian `Developer setup dan auth gate`.
- Rencana fase: bagian `Fase 2 - Wizard UI di Developer Setup`.

## Referensi File

- `src/view/auth/SetupKeyDrawer.tsx`
- `src/view/auth/HostDatabaseSetup.tsx`
- `src/auth/AuthGate.tsx`
- `src/services/setupKeyService.ts`
- `src/types/setup.ts`
- `src/constants/setupModules.ts`
- `src/constants/accounting.ts`
- `src/constants/currencies.ts`

## Dependency

- Fase 0: keputusan mapping template dan policy currency.
- Fase 1: type/read model setup accounting.
- Fase 3: service final untuk save production. Sebelum Fase 3 selesai, UI boleh
  memakai contract/mock submit yang sama.

## Handoff Ke Fase Berikutnya

- Fase 3 menghubungkan tombol save wizard ke
  `saveInitialAccountingSetup(input)`.
- Fase 5 membaca hasil setup yang dibuat wizard untuk maintenance UI.
