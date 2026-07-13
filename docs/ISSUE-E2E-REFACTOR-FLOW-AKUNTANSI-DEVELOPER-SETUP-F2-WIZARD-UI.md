# Sub-Issue: Fase 2 - Wizard UI di Developer Setup

Parent issue:

- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-13

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

- Refactor state `SetupKeyDrawer` agar punya step eksplisit.
- Pisahkan module selection ke component kecil.
- Tambahkan satu field/kartu pilihan **Jenis Bisnis**:
  - Ritel (SAK EMKM);
  - Koperasi (SAK ETAP);
  - Perdagangan Umum (SAK EMKM);
  - Jasa Umum (SAK EMKM);
  - preview disabled untuk Manufaktur, Konstruksi, Pemerintahan.
- Pastikan UI tidak menampilkan `accounting_profile`, `industry_extension`, atau
  `template_id` sebagai input manual.
- Tambahkan field tanggal:
  - `cutoff_date`;
  - `fiscal_period_start`;
  - `fiscal_period_end`;
  - `current_period_start`;
  - `current_period_end`.
- Tambahkan pilihan base currency:
  - default IDR;
  - non-IDR hanya jika policy Fase 0 mengizinkan sebelum transaksi pertama.
- Tambahkan validasi client-side:
  - fiscal end >= fiscal start;
  - current period berada dalam fiscal period;
  - current end >= current start;
  - cutoff <= current end;
  - base currency code uppercase 3 huruf.
- Review menampilkan:
  - module aktif;
  - jenis bisnis dan standard otomatis, misalnya `Koperasi (SAK ETAP)`;
  - cutoff;
  - periode fiskal;
  - periode berjalan;
  - base currency;
  - warning lock setelah transaksi/opening balance.
- Save menampilkan loading.
- Drawer tidak menutup bila local write/upload gagal.
- Error dari service ditampilkan di step terkait atau di review.

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
