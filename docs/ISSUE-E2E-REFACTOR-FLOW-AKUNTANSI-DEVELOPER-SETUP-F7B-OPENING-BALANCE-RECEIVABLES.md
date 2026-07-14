# Sub-Issue: Fase 7B - Saldo Awal Piutang

Parent issue:

- [Fase 7 - General Ledger dan Menu Saldo Awal Terpisah](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7-GL-OPENING-BALANCE-MODULES.md)
- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-14

## Ringkasan

Saldo Awal Piutang dipakai untuk membawa invoice/customer outstanding per cutoff
tanpa membuat Sales Invoice palsu yang mengotori laporan operasional penjualan.
Fondasi F7 sudah menyediakan route
`/finance/opening-balances/receivables`, batch `RECEIVABLE`, line source, dan
jurnal opening balance. Issue ini melanjutkan integrasi agar saldo tersebut
muncul di Piutang Usaha dan bisa dibayar seperti piutang normal.

## Tujuan

- User bisa input daftar piutang awal per customer.
- Data piutang awal muncul di `/finance/receivables`.
- Payment flow Piutang Usaha bisa membayar sebagian/lunas saldo awal.
- Jurnal payment tetap:

```txt
Dr Kas/Bank
  Cr Piutang Usaha
```

- Row tetap berlabel `Saldo Awal` dan tidak masuk report sales operasional.

## Scope

- Perbaiki form Saldo Awal Piutang:
  - contact/customer selector;
  - nomor dokumen awal;
  - tanggal dokumen;
  - due date;
  - currency dan rate;
  - nominal outstanding;
  - notes.
- Tambahkan status outstanding per line: `OPEN`, `PARTIAL`, `PAID`, `VOIDED`
  atau field ekuivalen.
- Integrasikan line `RECEIVABLE` ke read model
  `listAccountsReceivableRows`.
- Integrasikan payment history dan balance calculation.
- Tambahkan payment source handling untuk opening receivable.
- Tambahkan label/badge `Saldo Awal`.
- Tambahkan E2E posting dan payment sebagian.

## Non-Scope

- Tidak membuat Sales Invoice dokumen palsu.
- Tidak menghitung saldo awal sebagai omzet periode berjalan.
- Tidak membuat reset/reversal setelah payment sudah terjadi.
- Tidak mengubah flow pembayaran invoice biasa kecuali menambah branch source
  opening receivable.

## Model Data Yang Perlu Diputuskan

Opsi v1 yang disarankan:

- Tetap gunakan `openingBalanceLines` sebagai source detail.
- Tambahkan field repayment/payment aggregate di line atau tabel payment link:
  - `paid_amount`;
  - `remaining_amount`;
  - `payment_status`;
  - `last_paid_at`.

Jika payment flow butuh audit lebih detail, buat tabel baru:

```ts
export interface OpeningReceivablePaymentLink {
  id: string;
  opening_balance_line_id: string;
  payment_id: string;
  amount: number;
  created_at: string;
}
```

## Flow Target

1. User membuka `/finance/opening-balances/receivables`.
2. User memilih customer dan mengisi invoice awal.
3. Posting membuat batch `RECEIVABLE`, line detail, dan jurnal:

```txt
Dr Piutang Usaha
  Cr Ekuitas Saldo Awal / Opening Balance Equity
```

4. User membuka `/finance/receivables`.
5. Row saldo awal muncul bersama invoice outstanding, dengan badge `Saldo Awal`.
6. User mencatat pembayaran sebagian atau penuh.
7. Balance saldo awal turun sesuai pembayaran.

## Validasi

- Customer wajib dipilih atau minimal nama pihak wajib diisi.
- Nomor dokumen wajib unik per cutoff dan customer.
- Nominal outstanding harus lebih dari 0.
- Due date tidak boleh sebelum document date kecuali user diberi warning yang
  jelas.
- Currency non-base wajib punya rate.
- Posting tidak boleh dilakukan dua kali untuk line yang sama.
- Payment tidak boleh melebihi outstanding.

## Checklist

- [x] Tambahkan contact selector di form Saldo Awal Piutang.
- [x] Tambahkan field currency/rate.
- [x] Tambahkan validasi nomor dokumen unik.
- [x] Tambahkan persist draft lines.
- [x] Tambahkan status outstanding line.
- [x] Integrasikan ke `accountsReceivableService`.
- [x] Integrasikan ke hook/view Piutang Usaha.
- [x] Tambahkan branch payment untuk opening receivable.
- [x] Tambahkan jurnal payment opening receivable.
- [x] Tambahkan badge `Saldo Awal` di table dan payment history.
- [x] Tambahkan i18n ID/EN.
- [x] Tambahkan E2E `OB-03`.

## Catatan Implementasi 2026-07-14

- Form detail saldo awal sekarang mendukung draft `RECEIVABLE`, selector
  customer, currency, kurs, dan validasi nomor dokumen unik per customer dalam
  batch.
- Line saldo awal piutang posted masuk ke read model Piutang Usaha sebagai row
  `OPENING_RECEIVABLE` dengan badge `Saldo Awal`, tanpa membuat Sales Invoice
  operasional.
- Payment saldo awal piutang memakai branch service sendiri, mengupdate
  `paid_amount`, `remaining_amount`, dan `settlement_status` di
  `openingBalanceLines`, lalu menjurnal Dr Kas/Bank Cr Piutang Usaha dengan
  source event `OPENING_RECEIVABLE_PAYMENT_POSTED`.
- Verifikasi: `bun run build` dan
  `bunx playwright test tests/e2e/accounting-setup.spec.ts --project=chromium`
  hijau.

## Acceptance Criteria

- Piutang awal yang posted muncul di `/finance/receivables`.
- Payment sebagian mengurangi outstanding dan status menjadi `PARTIAL`.
- Payment lunas mengubah status menjadi `PAID`.
- Jurnal payment balance dan mengarah ke akun Piutang Usaha yang benar.
- Row saldo awal tidak muncul sebagai Sales Invoice/report sales.
- Hub Saldo Awal menampilkan total piutang awal posted.

## Test Case

### OBR-01 - Posting Piutang Awal

Langkah:

1. Buka `/finance/opening-balances/receivables`.
2. Pilih customer.
3. Isi nomor dokumen, tanggal, due date, dan nominal.
4. Post.

Expected:

- Batch `RECEIVABLE` berstatus `POSTED`.
- Jurnal Dr Piutang Usaha Cr Opening Balance Equity terbentuk.
- Line berstatus outstanding/open.

### OBR-02 - Payment Sebagian

Langkah:

1. Buka `/finance/receivables`.
2. Pilih row saldo awal piutang.
3. Catat pembayaran sebagian.

Expected:

- Outstanding berkurang.
- Status menjadi `PARTIAL`.
- Payment history tampil.
- Jurnal Dr Kas/Bank Cr Piutang Usaha terbentuk.

### OBR-03 - Payment Lunas

Langkah:

1. Bayar sisa outstanding.

Expected:

- Status menjadi `PAID`.
- Outstanding 0.
- Row tidak lagi masuk filter outstanding aktif.

## Referensi File

- `src/view/finance/opening-balances/OpeningBalancesManagement.tsx`
- `src/services/openingBalanceService.ts`
- `src/services/accountsReceivableService.ts`
- `src/hooks/useAccountsReceivable.tsx`
- `src/view/finance/receivables/AccountsReceivableManagement.tsx`
- `src/components/accounts-receivable/ReceivablePaymentModal.tsx`
- `tests/e2e/accounting-setup.spec.ts`
