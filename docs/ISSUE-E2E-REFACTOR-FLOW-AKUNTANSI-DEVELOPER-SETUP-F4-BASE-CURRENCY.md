# Sub-Issue: Fase 4 - Base Currency Dinamis

Parent issue:

- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-13

## Ringkasan

Fase ini mengurangi asumsi bahwa base currency selalu IDR. Setup awal tetap
default ke IDR, tetapi helper, hook, dokumen, rate lookup, dan UI yang masuk
scope v1 harus membaca base currency aktif dari data setup/currency, bukan dari
konstanta hardcoded.

## Kenapa Perlu Sub-Issue

Currency menyentuh banyak domain: sales, purchase, POS, inventory, finance
reports, PDF, koperasi, dan master data currency. Fase ini perlu batas scope
jelas supaya implementasi v1 aman tanpa harus menyapu seluruh aplikasi dalam
satu PR raksasa.

## Scope V1

- Base currency read model.
- Hook `useBaseCurrency`.
- `documentCurrency.ts` tidak bergantung langsung ke `BASE_CURRENCY_CODE`.
- Currency rate refresh memakai base currency aktif.
- `DocumentCurrencyFields` menampilkan label rate sesuai base currency.
- Formatter/report yang masuk scope v1 memakai symbol base currency.
- Guard base currency setelah transaksi ada.

## Non-Scope

- Tidak wajib membersihkan semua hardcoded `Rp` di seluruh repo dalam fase ini.
- Tidak mengubah snapshot currency dokumen lama secara massal.
- Tidak mengubah aturan kurs eksternal secara penuh untuk semua provider.

## Checklist

- Tambahkan helper async:
  - `getBaseCurrency`;
  - `getBaseCurrencyCode`;
  - `getBaseCurrencySymbol`.
- Tambahkan hook:
  - `useBaseCurrency`.
- Pastikan fallback IDR tetap ada untuk fresh install dan data lama.
- Ubah `documentCurrency.ts`:
  - `isBaseCurrency` membaca base aktif;
  - default document currency memakai base aktif;
  - snapshot document menyimpan currency code/symbol/rate saat dokumen dibuat.
- Ubah `currencyReadService` agar refresh rate memakai base currency aktif.
- Ubah `DocumentCurrencyFields` agar label rate tidak selalu `currency/IDR`.
- Ubah formatter/report scope v1 dari hardcoded `Rp` ke symbol base currency.
- Tambahkan guard perubahan base currency jika sudah ada:
  - dokumen;
  - finance transaction;
  - journal;
  - payment;
  - payroll;
  - koperasi transaction;
  - opening balance posted.
- Pastikan `ensureBaseCurrency` tidak selalu menjadikan IDR sebagai base jika
  setup memilih currency lain sebelum transaksi pertama.
- Tambahkan test minimal untuk IDR dan non-IDR.

## Acceptance Criteria

- Fresh setup dengan IDR tetap sama seperti behavior sekarang.
- Fresh setup dengan base currency lain membuat dokumen baru memakai base
  currency tersebut.
- Existing document snapshot tidak berubah saat base currency setting berubah
  sebelum transaksi dikunci.
- UI yang masuk scope v1 tidak menampilkan `Rp` untuk base currency non-IDR.
- Label kurs memakai pasangan terhadap base currency aktif, bukan selalu
  `currency/IDR`.
- Base currency tidak bisa diganti setelah data operasional atau opening balance
  membuatnya locked.

## Referensi Issue Induk

- Base currency current gap: bagian `Base currency`.
- Step base currency: bagian `Step 4 - Base Currency`.
- Currency impact: bagian `Currency dan formatter`.
- Sales/purchase/POS impact: bagian `Sales, purchase, POS, inventory`.
- Rencana fase: bagian `Fase 4 - Base Currency Dinamis`.

## Referensi File

- `src/constants/currencies.ts`
- `src/services/currencyService.ts`
- `src/services/currencyReadService.ts`
- `src/hooks/useCurrencies.tsx`
- `src/utils/documentCurrency.ts`
- `src/utils/formatters.ts`
- `src/components/DocumentCurrencyFields.tsx`
- `src/view/master-data/currencies/*`
- `src/services/salesDocumentService.ts`
- `src/services/purchaseDocumentService.ts`
- `src/components/sales-document/SalesDocumentForm.tsx`
- `src/components/purchase-document/PurchaseDocumentForm.tsx`
- `src/services/checkoutService.ts`
- `src/hooks/useStockManagement.tsx`
- `src/services/stockPurchaseService.ts`

## Dependency

- Fase 0: policy non-IDR dan daftar hardcoded scope v1.
- Fase 1: setup snapshot/currency sync.
- Fase 3: save wizard bisa set base currency canonical.

## Handoff Ke Fase Berikutnya

- Fase 5 menampilkan base currency aktif pada maintenance UI.
- Fase 6 menambah regression untuk IDR dan non-IDR.
