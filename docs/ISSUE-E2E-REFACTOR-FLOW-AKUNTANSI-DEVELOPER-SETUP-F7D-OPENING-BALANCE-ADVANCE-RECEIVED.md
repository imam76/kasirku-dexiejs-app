# Sub-Issue: Fase 7D - Uang Muka Masuk

Parent issue:

- [Fase 7 - General Ledger dan Menu Saldo Awal Terpisah](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7-GL-OPENING-BALANCE-MODULES.md)
- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-14

## Ringkasan

Uang Muka Masuk adalah saldo awal uang muka yang sudah diterima dari customer
atau pihak luar sebelum cutoff. Secara akuntansi saldo ini adalah kewajiban
karena barang/jasa belum diserahkan atau belum disettle ke invoice/revenue.

Fondasi F7 sudah menyediakan route
`/finance/opening-balances/advance-received`, batch `ADVANCE_RECEIVED`, line
source, dan jurnal opening balance. Issue ini melanjutkan model domain, account
mapping, dan tampilan saldo agar uang muka masuk bisa diaudit dan kelak
disettle.

## Tujuan

- User bisa input daftar uang muka masuk per pihak.
- Posting menghasilkan jurnal liability yang benar.
- Saldo uang muka masuk tampil di hub dan report/summary relevan.
- Settlement generic ke akun revenue/piutang/akun lain bisa dicatat tanpa
  mengubah source saldo awal.

## Scope

- Tambahkan account mapping khusus `advance_received` atau registry akun
  `Uang Muka Diterima`.
- Tambahkan form detail:
  - customer/pihak;
  - nomor referensi;
  - tanggal terima;
  - currency dan rate;
  - nominal sisa uang muka;
  - notes.
- Tambahkan status source line: `OPEN`, `PARTIAL`, `PAID`, `VOIDED`.
- Tambahkan read model sederhana untuk daftar saldo uang muka masuk.
- Tambahkan summary di hub Saldo Awal.
- Tambahkan settlement generic dan report summary uang muka masuk/keluar.
- Tambahkan E2E posting minimal dan journal trace.

## Non-Scope

- Tidak wajib membuat auto-link settlement penuh ke Sales Invoice di issue ini.
- Tidak otomatis memilih akun revenue; user/service wajib memilih akun
  settlement.
- Tidak membuat reset/reversal setelah settlement ada.
- Tidak mencampur uang muka masuk dengan penerimaan kas periode berjalan.

## Flow Target

1. User membuka `/finance/opening-balances/advance-received`.
2. User memilih/menulis pihak dan mengisi saldo uang muka.
3. Posting membuat batch `ADVANCE_RECEIVED`, line detail, dan jurnal:

```txt
Dr Ekuitas Saldo Awal / Opening Balance Equity
  Cr Uang Muka Diterima / Advance Received
```

4. Hub Saldo Awal menampilkan total uang muka masuk.
5. General Ledger journal list menampilkan source event
   `ADVANCE_RECEIVED_OPENING_BALANCE_POSTED`.

## Validasi

- Nama pihak atau contact wajib diisi.
- Nominal harus lebih dari 0.
- Currency non-base wajib punya rate.
- Account Uang Muka Diterima wajib aktif dan postable.
- Posting tidak boleh dobel untuk module + cutoff yang sama.

## Checklist

- [x] Tambahkan akun default/template untuk Uang Muka Diterima bila belum ada.
- [x] Tambahkan mapping/registry akun `advance_received`.
- [x] Tambahkan contact selector/manual party dan currency/rate di form.
- [x] Tambahkan persist draft lines.
- [x] Tambahkan status settlement line.
- [x] Tambahkan read service saldo uang muka masuk.
- [x] Tambahkan view/list saldo uang muka masuk atau panel di hub.
- [x] Tambahkan settlement generic dan report summary uang muka.
- [x] Tambahkan i18n ID/EN.
- [x] Tambahkan E2E `OB-05` bagian uang muka masuk.

## Catatan Implementasi

- Akun default/template `2210 Uang Muka Diterima` ditambahkan dan menjadi
  kandidat utama registry `ADVANCE_RECEIVED`; fallback lama tetap ada untuk
  database lama.
- Form detail memakai `openingBalanceLines` generic dengan contact selector
  customer untuk pihak yang ada di master kontak, plus input nama pihak manual.
- Status settlement mengikuti pola existing piutang/hutang:
  `OPEN`, `PARTIAL`, `PAID`, `VOIDED` agar satu vocabulary dengan AR/AP.
- Read model `listOpeningAdvanceBalanceRows` mengembalikan saldo advance posted
  untuk `ADVANCE_RECEIVED` dan `ADVANCE_PAID`; baris `ADVANCE_RECEIVED`
  ditandai `direction: IN`.
- Settlement lanjutan memakai `recordOpeningAdvanceSettlement`, membuat jurnal
  `ADVANCE_RECEIVED_OPENING_BALANCE_SETTLED`, mengurangi `remaining_amount`,
  dan mengubah status menjadi `PARTIAL` atau `PAID`.
- Summary report tersedia lewat `getOpeningAdvanceBalanceReport`.
- Bundle opening balance sudah masuk PostgreSQL/Rust/realtime sync lewat
  `opening_balance_batches` dan `opening_balance_lines`.
- E2E `OB-05` memvalidasi batch `ADVANCE_RECEIVED`, jurnal
  `ADVANCE_RECEIVED_OPENING_BALANCE_POSTED`, settlement
  `ADVANCE_RECEIVED_OPENING_BALANCE_SETTLED`, akun kredit `2210 Uang Muka
  Diterima`, dan row/report uang muka masuk.

## Acceptance Criteria

- User bisa post Uang Muka Masuk dari submodule Saldo Awal.
- Jurnal memakai akun liability Uang Muka Diterima, bukan Hutang Usaha generic
  bila akun khusus tersedia.
- Hub menampilkan total posted.
- Journal trace memakai `ADVANCE_RECEIVED_OPENING_BALANCE_POSTED`.
- Data source bisa disettle parsial/penuh dan status outstanding terbarui.

## Test Case

### OBAR-01 - Posting Uang Muka Masuk

Langkah:

1. Buka `/finance/opening-balances/advance-received`.
2. Isi satu customer/pihak dan nominal.
3. Post.
4. Buka General Ledger journal list.

Expected:

- Batch `ADVANCE_RECEIVED` berstatus `POSTED`.
- Jurnal Dr Opening Balance Equity Cr Uang Muka Diterima terbentuk.
- Source event benar.
- Hub menampilkan total uang muka masuk.

### OBAR-02 - Skip Uang Muka Masuk

Langkah:

1. Buka submodule.
2. Klik Tandai Dilewati.

Expected:

- Batch `ADVANCE_RECEIVED` berstatus `SKIPPED`.
- Readiness GL tidak tertahan oleh module ini.

## Referensi File

- `src/view/finance/opening-balances/OpeningBalancesManagement.tsx`
- `src/services/openingBalanceService.ts`
- `src/services/openingAdvanceBalanceService.ts`
- `src/constants/chartOfAccounts.ts`
- `src/services/chartOfAccountService.ts`
- `src/services/generalLedgerService.ts`
- `tests/e2e/accounting-setup.spec.ts`
