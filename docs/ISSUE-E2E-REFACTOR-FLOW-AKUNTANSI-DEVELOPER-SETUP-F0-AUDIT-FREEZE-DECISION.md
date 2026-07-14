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

## Catatan Keputusan Implementasi Fase 0

Status keputusan: **frozen per 2026-07-13** untuk input Fase 1 sampai Fase
4. Jika ada perubahan arah produk setelah ini, buat catatan keputusan baru agar
fase model, wizard, atomic save, dan currency tidak berjalan dengan asumsi
berbeda.

### 1. Mapping Jenis Bisnis

Wizard hanya menyimpan input user-facing `business_template_code`. Nilai teknis
`accounting_profile`, `industry_extension`, `template_id`, default module, dan
warning selalu di-derive dari registry di service save.

| `business_template_code` | Label UI | Status wizard v1 | Standard tampil | Profile auto | Extension auto | Template COA auto | Keputusan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RETAIL` | Ritel (SAK EMKM) | enabled, siap apply | SAK EMKM | `SAK_EMKM` | `RETAIL` | `default-sak-emkm-retail` | Mapping existing tetap canonical untuk retail/POS/stok. |
| `COOPERATIVE` | Koperasi (SAK ETAP) | enabled, siap apply | SAK ETAP | `SAK_ETAP` | `COOPERATIVE` | `default-sak-etap-koperasi` | Mapping existing koperasi menjadi pilihan utama saat module koperasi dipilih. |
| `GENERAL_TRADING` | Perdagangan Umum (SAK EMKM) | enabled v1 sebagai alias teknis retail | SAK EMKM | `SAK_EMKM` | `RETAIL` | `default-sak-emkm-retail` | Tidak menambah `IndustryExtensionCode` baru di v1. Snapshot tetap menyimpan `GENERAL_TRADING` agar UX/report audit tahu pilihan user, tetapi canonical accounting memakai retail template. |
| `GENERAL_SERVICE` | Jasa Umum (SAK EMKM) | enabled setelah template service tersedia di Fase 3 | SAK EMKM | `SAK_EMKM` | `NONE` | `default-sak-emkm-general-service` | Tambah template baru tanpa akun/mapping inventory-heavy. Default `inventory_policy` untuk wizard: `CASH_FLOW_ONLY`. |
| `MANUFACTURING_PREVIEW` | Manufaktur | disabled/preview | SAK EP | `SAK_EP` | `MANUFACTURING` | `preview-manufacturing-extension` | Boleh tampil sebagai preview roadmap, tetapi save service wajib menolak sebagai setup aktif. |
| `CONSTRUCTION_PREVIEW` | Konstruksi | disabled/preview | SAK EP | `SAK_EP` | `CONSTRUCTION` | `preview-construction-extension` | Boleh tampil sebagai preview roadmap, tetapi save service wajib menolak sebagai setup aktif. |
| `GOVERNMENT_PREVIEW` | Pemerintahan (PSAP) | disabled/preview | PSAP | `PSAP` | `NONE` | `preview-psap-profile` | Boleh tampil sebagai preview roadmap, tetapi save service wajib menolak sebagai setup aktif sampai report/mode PSAP siap. |

Implikasi Fase 1:

- Tambahkan type `AccountingBusinessTemplateCode` terpisah dari
  `IndustryExtensionCode`.
- Jangan tambahkan `GENERAL_TRADING` ke `IndustryExtensionCode` pada v1.
- Jangan tambahkan `GENERAL_SERVICE` ke `IndustryExtensionCode` pada v1; gunakan
  `NONE` dan template service baru.
- Registry bisnis harus menjadi satu-satunya sumber kombinasi valid.

Implikasi Fase 2:

- UI menampilkan pilihan **Jenis Bisnis** saja.
- Standard/profile/extension/template tampil hanya sebagai ringkasan read-only
  di review step.
- Opsi preview disabled tidak boleh bisa dipilih lewat keyboard, URL state, atau
  payload manual.

### 2. Keputusan UX Wizard

- Field teknis berikut tidak boleh menjadi input langsung user:
  `accounting_profile`, `industry_extension`, `template_id`, dan accounting
  standard.
- Review step boleh menampilkan nilai teknis sebagai hasil turunan, misalnya
  `Koperasi (SAK ETAP)`, tetapi bukan sebagai select terpisah.
- Save service harus re-derive mapping dari `business_template_code`. Jangan
  percaya payload UI bila membawa profile/template yang tidak cocok.
- Jika module yang dipilih tidak membutuhkan accounting baseline, wizard boleh
  menyimpan default minimum: `business_template_code: RETAIL`,
  `base_currency_code: IDR`, tanpa apply COA/GL kecuali user mengaktifkan module
  accounting.

### 3. Keputusan Model Periode V1

Gunakan **Opsi A**.

- `accountingPeriods` hanya menyimpan satu row periode berjalan yang aktif untuk
  guard transaksi, lock, dan closing.
- `fiscal_period_start` dan `fiscal_period_end` disimpan di setup snapshot,
  bukan sebagai row `YEARLY` yang overlap dengan periode berjalan.
- `current_period_start` dan `current_period_end` disimpan di setup snapshot dan
  juga direferensikan ke row `accountingPeriods` lewat `current_period_id`.
- Wizard v1 membuat/memakai ulang satu row periode berjalan:
  - `period_type: MONTHLY` untuk periode berjalan normal;
  - `period_type: YEARLY` hanya jika periode berjalan sama persis dengan rentang
    fiscal;
  - tidak membuat parent-child `YEARLY -> MONTHLY`.
- Validasi overlap existing `accountingPeriodService` tetap dipakai. Jika ada
  periode lain yang overlap dan bukan exact same period, save wizard ditolak.
- `saveAccountingReferenceSetting` existing tetap untuk maintenance Settings.
  Fase 3 perlu core write/orchestrator baru agar wizard tidak membuat periode
  tahunan rujukan yang overlap dengan current period.

Validasi tanggal yang dibekukan:

- `fiscal_period_end >= fiscal_period_start`.
- `current_period_start >= fiscal_period_start`.
- `current_period_end <= fiscal_period_end`.
- `current_period_end >= current_period_start`.
- `cutoff_date <= current_period_end`.
- Jika `opening_balance_journal_id` sudah ada, wizard tidak boleh mengubah
  cutoff.

### 4. Keputusan Base Currency

- Default base currency tetap `IDR` agar fresh install dan data lama aman.
- Non-IDR boleh dipilih hanya sebelum sinyal operasional pertama.
- Setelah sinyal operasional pertama muncul, base currency locked dan perubahan
  harus lewat flow reset/migration eksplisit di luar issue ini.
- Integrasi kurs tidak boleh lagi mengasumsikan pasangan selalu
  `currency/IDR`. Label, fetch, dan penyimpanan rate harus memakai base currency
  aktif.
- Historical migration/default `IDR` tetap boleh ada sebagai fallback data lama,
  tetapi helper runtime tidak boleh bergantung permanen ke konstanta
  `BASE_CURRENCY_CODE`.

### 5. Hard Lock Setelah Data Operasional

Field yang locked setelah opening balance atau sinyal operasional pertama:

- `business_template_code`
- `accounting_profile`
- `industry_extension`
- `template_id`
- `cutoff_date`
- `inventory_policy`
- `base_currency_code`
- `fiscal_period_start`
- `fiscal_period_end`
- `current_period_start` dan `current_period_end` jika periode sudah `LOCKED`
  atau `CLOSED`

Sinyal operasional pertama untuk lock template/base currency:

- `generalLedgerSetting.opening_balance_journal_id` terisi.
- Ada `journalEntries` dengan status `POSTED` atau `REVERSED`.
- Ada `financeTransactions` aktif.
- Ada `transactions` POS dengan status `COMPLETED`.
- Ada `salesDocuments` atau `purchaseDocuments` berstatus `ISSUED` atau
  `CONVERTED`, termasuk payment aktif.
- Ada `salesReturns` berstatus `ISSUED`.
- Ada `stockOpnames` atau `productionOrders` berstatus `POSTED`.
- Ada `payrollRuns` berstatus `PAID`, `employeeCashAdvances` aktif/paid, atau
  repayment `POSTED`.
- Ada transaksi koperasi yang sudah `POSTED`, pinjaman `DISBURSED`/`PAID_OFF`,
  atau pembayaran pinjaman `POSTED`.
- Ada `cashBankReconciliations` non-voided atau sesi kasir/lapangan yang sudah
  `CLOSED`.

Catatan guard:

- Master data murni seperti contact/product/project/tax tidak mengunci base
  currency atau template.
- Setelah periode berjalan `LOCKED`/`CLOSED`, wizard tidak boleh mengubah periode
  tersebut. Perubahan periode berikutnya harus lewat maintenance/closing flow.
- COA maintenance tetap boleh menambah akun baru setelah lock, tetapi tidak boleh
  mengganti template/profile aktif secara massal tanpa flow migration.

### 6. Audit Hardcoded Currency

Perintah audit 2026-07-13:

- `rg -l "\bRp\b|Rupiah" src --glob '!**/*.svg' | wc -l` -> 114 file.
- `rg -o "\bRp\b|Rupiah" src --glob '!**/*.svg' | wc -l` -> 381 occurrence.
- `rg -l "BASE_CURRENCY_CODE" src --glob '!**/*.svg' | wc -l` -> 11 file.
- `rg -l "\bIDR\b" src src-tauri --glob '!**/*.svg' | wc -l` -> 9 file runtime/migration.

Hardcoded runtime yang masuk prioritas Fase 4 v1:

- `src/constants/currencies.ts`
- `src/services/currencyService.ts`
- `src/services/currencyReadService.ts`
- `src/utils/documentCurrency.ts`
- `src/components/DocumentCurrencyFields.tsx`
- `src/components/sales-document/SalesDocumentForm.tsx`
- `src/components/purchase-document/PurchaseDocumentForm.tsx`
- `src/utils/accountsReceivable/createInvoicePaymentSnapshot.ts`
- `src/utils/accountsPayable/createPayablePaymentSnapshot.ts`
- `src/view/master-data/currencies/CurrencyTable.tsx`
- `src/view/CashFlowReport.tsx`

UI/report yang masuk scope Fase 4 v1 karena dekat dengan setup accounting dan
dokumen multicurrency:

- Sales/purchase document form, summary, detail, receivable/payable table, dan
  payment modal.
- Currency management, rate label, dan BI rate display.
- General ledger, finance management, cash flow report, profit/loss report,
  income/expense report, purchase report, aging report, dan document PDF/print
  yang memakai snapshot dokumen.
- POS/cart/transaction/history hanya untuk dokumen baru yang membaca base
  currency aktif; data historis tetap memakai snapshot lama.

Backlog lanjutan di luar Fase 4 v1:

- Seluruh laporan koperasi, billing, simpanan, pinjaman, field cash, dan E2E
  expectation yang masih eksplisit `Rp`.
- Payroll UI/report/PDF dan slip wording `Rupiah`.
- Production, stock opname, project budget, promo, printer receipt, dan helper
  validasi error yang belum disentuh langsung oleh setup wizard.
- Test fixture lama yang memang mengasumsikan IDR dapat tetap sampai test
  non-IDR khusus ditambahkan di Fase 6.

### 7. Handoff Scope Fase 1 Sampai Fase 4

Fase 1 wajib memakai keputusan ini untuk:

- type `AccountingBusinessTemplateCode`;
- registry mapping bisnis frozen;
- setup snapshot dengan fiscal/current period dan base currency;
- sync/realtime untuk setup snapshot dan `app_setup_config`.

Fase 2 wajib memakai keputusan ini untuk:

- wizard input tunggal **Jenis Bisnis**;
- preview option disabled;
- review read-only untuk nilai teknis turunan;
- warning lock sebelum save.

Fase 3 wajib memakai keputusan ini untuk:

- service `saveInitialAccountingSetup(input)`;
- apply template idempotent;
- template service baru `default-sak-emkm-general-service`;
- periode berjalan Opsi A;
- guard lock sebelum local write;
- activity log yang mencatat business template, cutoff, periode, dan base
  currency.

Fase 4 wajib memakai keputusan ini untuk:

- read model/hook base currency aktif;
- refactor runtime dari `BASE_CURRENCY_CODE`;
- label rate bukan `currency/IDR`;
- hardcoded `Rp` scope v1;
- guard perubahan base currency setelah sinyal operasional.

## Checklist

- [x] Tentukan mapping jenis bisnis:
  - `RETAIL` tampil sebagai `Ritel (SAK EMKM)` -> `SAK_EMKM` + `RETAIL` +
    `default-sak-emkm-retail`.
  - `COOPERATIVE` tampil sebagai `Koperasi (SAK ETAP)` -> `SAK_ETAP` +
    `COOPERATIVE` +
    `default-sak-etap-koperasi`.
  - `GENERAL_TRADING` tampil sebagai `Perdagangan Umum (SAK EMKM)` ->
    alias retail v1 (`SAK_EMKM` + `RETAIL` + `default-sak-emkm-retail`).
  - `GENERAL_SERVICE` tampil sebagai `Jasa Umum (SAK EMKM)` -> extension baru
    tidak ditambah di v1; gunakan `NONE` + template baru
    `default-sak-emkm-general-service`.
- [x] Putuskan bahwa UI wizard tidak menampilkan field profile, standard, industry
  extension, atau template COA terpisah.
- [x] Tentukan status preview/disabled untuk manufacturing, construction, dan
  government.
- [x] Putuskan model periode v1:
  - Opsi A, `accountingPeriods` hanya untuk periode berjalan;
  - `fiscal_period_start/end` disimpan di setup snapshot.
- [x] Tentukan mode base currency:
  - IDR default tetap aman;
  - non-IDR boleh dipilih hanya sebelum sinyal operasional pertama.
- [x] Catat hard lock setelah transaksi/opening balance:
  - template bisnis;
  - accounting profile;
  - industry extension;
  - cutoff date;
  - base currency;
  - current period jika sudah locked/closed.
- [x] Audit string hardcoded:
  - `Rp`;
  - `IDR`;
  - `BASE_CURRENCY_CODE`;
  - label kurs `currency/IDR`.
- [x] Buat daftar halaman/report yang masuk scope Fase 4 v1 dan yang masuk backlog
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
