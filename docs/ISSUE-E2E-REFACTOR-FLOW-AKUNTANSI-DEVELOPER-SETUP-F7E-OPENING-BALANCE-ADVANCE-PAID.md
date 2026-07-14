# Sub-Issue: Fase 7E - Uang Muka Keluar

Parent issue:

- [Fase 7 - General Ledger dan Menu Saldo Awal Terpisah](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7-GL-OPENING-BALANCE-MODULES.md)
- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-14

## Ringkasan

Uang Muka Keluar adalah saldo awal uang muka yang sudah dibayarkan ke supplier,
karyawan, atau pihak lain sebelum cutoff. Secara akuntansi saldo ini adalah aset
karena manfaat/barang/jasa atau penyelesaian kasbon belum diterima/disettle.

Fondasi F7 sudah menyediakan route
`/finance/opening-balances/advance-paid`, batch `ADVANCE_PAID`, line source, dan
jurnal opening balance. Issue ini melanjutkan model domain, account mapping, dan
integrasi settlement generic; auto-link opsional ke kasbon karyawan atau
purchase/payroll bisa menjadi enhancement berikutnya.

## Tujuan

- User bisa input daftar uang muka keluar per pihak.
- Posting menghasilkan jurnal asset yang benar.
- Saldo uang muka keluar tampil di hub dan report/summary relevan.
- Settlement generic ke akun expense/hutang/akun lain bisa dicatat dan
  mengurangi saldo outstanding.
- Untuk pihak karyawan, ada keputusan jelas apakah memakai
  `employeeCashAdvances` atau source opening balance generic.

## Scope

- Tambahkan account mapping khusus `advance_paid` atau registry akun
  `Uang Muka Dibayar`.
- Tambahkan form detail:
  - supplier/karyawan/pihak;
  - contact selector supplier bila ada di master kontak, atau nama pihak manual
    untuk karyawan/other;
  - nomor referensi;
  - tanggal bayar;
  - currency dan rate;
  - nominal sisa uang muka;
  - notes.
- Tambahkan status source line: `OPEN`, `PARTIAL`, `PAID`, `VOIDED`.
- Tambahkan read model sederhana untuk daftar saldo uang muka keluar.
- Putuskan integrasi karyawan:
  - opsi A: tampil sebagai saldo awal kasbon di `employeeCashAdvances`;
  - opsi B: tetap generic opening advance paid dan hanya tampil di hub/report.
- Tambahkan E2E posting minimal dan journal trace.

## Non-Scope

- Tidak wajib membuat auto-link settlement penuh ke Purchase Invoice, payroll,
  atau kasbon di issue ini.
- Tidak otomatis memilih akun expense/hutang; user/service wajib memilih akun
  settlement.
- Tidak otomatis membuat transaksi kas keluar periode berjalan.
- Tidak membuat reset/reversal setelah settlement ada.

## Flow Target

1. User membuka `/finance/opening-balances/advance-paid`.
2. User memilih contact supplier atau menulis nama karyawan/pihak manual dan
   mengisi saldo uang muka.
3. Posting membuat batch `ADVANCE_PAID`, line detail, dan jurnal:

```txt
Dr Uang Muka Dibayar / Advance Paid
  Cr Ekuitas Saldo Awal / Opening Balance Equity
```

4. Hub Saldo Awal menampilkan total uang muka keluar.
5. General Ledger journal list menampilkan source event
   `ADVANCE_PAID_OPENING_BALANCE_POSTED`.

## Validasi

- Nama pihak wajib diisi lewat contact supplier atau input manual
  karyawan/other.
- Nominal harus lebih dari 0.
- Currency non-base wajib punya rate.
- Account Uang Muka Dibayar wajib aktif dan postable.
- Posting tidak boleh dobel untuk module + cutoff yang sama.

## Checklist

- [x] Tambahkan akun default/template untuk Uang Muka Dibayar bila belum ada.
- [x] Tambahkan mapping/registry akun `advance_paid`.
- [x] Tambahkan pola pihak supplier via contact selector dan employee/other via
  input manual.
- [x] Tambahkan contact selector/manual employee-other dan currency/rate di form.
- [x] Tambahkan persist draft lines.
- [x] Tambahkan status settlement line.
- [x] Tambahkan read service saldo uang muka keluar.
- [x] Tambahkan settlement generic dan report summary uang muka.
- [x] Tentukan integrasi kasbon karyawan.
- [x] Tambahkan view/list saldo uang muka keluar atau panel di hub.
- [x] Tambahkan i18n ID/EN.
- [x] Tambahkan E2E `OB-05` bagian uang muka keluar.

## Catatan Implementasi

- Akun default/template `1310 Uang Muka Dibayar` ditambahkan dan menjadi
  kandidat utama registry `ADVANCE_PAID`; fallback lama tetap ada untuk database
  lama.
- Akun default/template `2210 Uang Muka Diterima` ikut ditambahkan karena OB-05
  memvalidasi pasangan uang muka masuk/keluar dan mencegah fallback ke akun
  generic.
- Form detail tetap memakai `openingBalanceLines` generic dengan contact
  selector supplier untuk pihak yang ada di master kontak, plus input nama pihak
  manual untuk employee/other.
- Keputusan integrasi karyawan: fase ini memakai source opening balance generic
  dulu, bukan membuat row `employeeCashAdvances`. Alasannya, saldo awal tidak
  merepresentasikan kas keluar periode berjalan dan belum punya kontrak sync
  payroll/kasbon khusus. Settlement kasbon karyawan bisa dibuat di issue lanjutan
  dengan referensi ke `opening_balance_line_id`.
- Status settlement mengikuti pola existing piutang/hutang:
  `OPEN`, `PARTIAL`, `PAID`, `VOIDED` agar satu vocabulary dengan AR/AP.
- Read model `listOpeningAdvanceBalanceRows` mengembalikan saldo advance posted
  untuk `ADVANCE_RECEIVED` dan `ADVANCE_PAID`; detail page Saldo Awal juga
  menampilkan sisa dan status outstanding.
- Settlement lanjutan memakai `recordOpeningAdvanceSettlement`, membuat jurnal
  `ADVANCE_PAID_OPENING_BALANCE_SETTLED`, mengurangi `remaining_amount`, dan
  mengubah status menjadi `PARTIAL` atau `PAID`.
- Summary report tersedia lewat `getOpeningAdvanceBalanceReport`.
- Bundle opening balance sudah masuk PostgreSQL/Rust/realtime sync lewat
  `opening_balance_batches` dan `opening_balance_lines`.

## Acceptance Criteria

- User bisa post Uang Muka Keluar dari submodule Saldo Awal.
- Jurnal memakai akun asset Uang Muka Dibayar, bukan Piutang Lain-lain generic
  bila akun khusus tersedia.
- Hub menampilkan total posted.
- Journal trace memakai `ADVANCE_PAID_OPENING_BALANCE_POSTED`.
- Data source bisa disettle parsial/penuh dan status outstanding terbarui.
- Keputusan integrasi employee cash advance terdokumentasi dan tercermin di UI.

## Test Case

### OBAP-01 - Posting Uang Muka Keluar

Langkah:

1. Buka `/finance/opening-balances/advance-paid`.
2. Isi satu supplier/karyawan/pihak dan nominal.
3. Post.
4. Buka General Ledger journal list.

Expected:

- Batch `ADVANCE_PAID` berstatus `POSTED`.
- Jurnal Dr Uang Muka Dibayar Cr Opening Balance Equity terbentuk.
- Source event benar.
- Hub menampilkan total uang muka keluar.

### OBAP-02 - Skip Uang Muka Keluar

Langkah:

1. Buka submodule.
2. Klik Tandai Dilewati.

Expected:

- Batch `ADVANCE_PAID` berstatus `SKIPPED`.
- Readiness GL tidak tertahan oleh module ini.

## Referensi File

- `src/view/finance/opening-balances/OpeningBalancesManagement.tsx`
- `src/services/openingBalanceService.ts`
- `src/services/openingAdvanceBalanceService.ts`
- `src/constants/chartOfAccounts.ts`
- `src/services/employeeCashAdvanceService.ts`
- `src/services/generalLedgerService.ts`
- `tests/e2e/accounting-setup.spec.ts`
