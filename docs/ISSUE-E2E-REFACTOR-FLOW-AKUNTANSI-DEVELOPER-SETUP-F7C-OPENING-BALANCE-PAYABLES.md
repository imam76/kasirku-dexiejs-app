# Sub-Issue: Fase 7C - Saldo Awal Hutang

Parent issue:

- [Fase 7 - General Ledger dan Menu Saldo Awal Terpisah](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7-GL-OPENING-BALANCE-MODULES.md)
- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-14

## Ringkasan

Saldo Awal Hutang dipakai untuk membawa bill/supplier outstanding per cutoff
tanpa membuat Purchase Invoice palsu yang mengotori laporan operasional
pembelian. Fondasi F7 sudah menyediakan route
`/finance/opening-balances/payables`, batch `PAYABLE`, line source, dan jurnal
opening balance. Issue ini melanjutkan integrasi agar saldo tersebut muncul di
Hutang Usaha dan bisa dibayar.

## Tujuan

- User bisa input daftar hutang awal per supplier.
- Data hutang awal muncul di `/finance/payables`.
- Payment flow Hutang Usaha bisa membayar sebagian/lunas saldo awal.
- Jurnal payment tetap:

```txt
Dr Hutang Usaha
  Cr Kas/Bank
```

- Row tetap berlabel `Saldo Awal` dan tidak masuk report purchase operasional.

## Scope

- Perbaiki form Saldo Awal Hutang:
  - supplier/contact selector;
  - nomor bill awal;
  - tanggal dokumen;
  - due date;
  - currency dan rate;
  - nominal outstanding;
  - notes.
- Tambahkan status outstanding per line: `OPEN`, `PARTIAL`, `PAID`, `VOIDED`
  atau field ekuivalen.
- Integrasikan line `PAYABLE` ke read model `listAccountsPayableRows`.
- Integrasikan payment history dan balance calculation.
- Tambahkan payment source handling untuk opening payable.
- Tambahkan label/badge `Saldo Awal`.
- Tambahkan E2E posting dan payment sebagian.

## Non-Scope

- Tidak membuat Purchase Invoice dokumen palsu.
- Tidak menghitung saldo awal sebagai pembelian periode berjalan.
- Tidak membuat reset/reversal setelah payment sudah terjadi.
- Tidak mengubah flow pembayaran purchase invoice biasa kecuali menambah branch
  source opening payable.

## Model Data Yang Perlu Diputuskan

Opsi v1 yang disarankan:

- Tetap gunakan `openingBalanceLines` sebagai source detail.
- Tambahkan field payment aggregate:
  - `paid_amount`;
  - `remaining_amount`;
  - `payment_status`;
  - `last_paid_at`.

Jika payment flow butuh audit lebih detail, buat tabel link:

```ts
export interface OpeningPayablePaymentLink {
  id: string;
  opening_balance_line_id: string;
  payment_id: string;
  amount: number;
  created_at: string;
}
```

## Flow Target

1. User membuka `/finance/opening-balances/payables`.
2. User memilih supplier dan mengisi bill awal.
3. Posting membuat batch `PAYABLE`, line detail, dan jurnal:

```txt
Dr Ekuitas Saldo Awal / Opening Balance Equity
  Cr Hutang Usaha
```

4. User membuka `/finance/payables`.
5. Row saldo awal muncul bersama bill outstanding, dengan badge `Saldo Awal`.
6. User mencatat pembayaran sebagian atau penuh.
7. Balance saldo awal turun sesuai pembayaran.

## Validasi

- Supplier wajib dipilih atau minimal nama pihak wajib diisi.
- Nomor dokumen wajib unik per cutoff dan supplier.
- Nominal outstanding harus lebih dari 0.
- Due date tidak boleh sebelum document date kecuali user diberi warning.
- Currency non-base wajib punya rate.
- Payment tidak boleh melebihi outstanding.

## Checklist

- [x] Tambahkan supplier selector di form Saldo Awal Hutang.
- [x] Tambahkan field currency/rate.
- [x] Tambahkan validasi nomor dokumen unik.
- [x] Tambahkan persist draft lines.
- [x] Tambahkan status outstanding line.
- [x] Integrasikan ke `accountsPayableService`.
- [x] Integrasikan ke hook/view Hutang Usaha.
- [x] Tambahkan branch payment untuk opening payable.
- [x] Tambahkan jurnal payment opening payable.
- [x] Tambahkan badge `Saldo Awal` di table dan payment history.
- [x] Tambahkan i18n ID/EN.
- [x] Tambahkan E2E `OB-04`.

## Catatan Implementasi 2026-07-14

- Form detail saldo awal sekarang memakai selector supplier untuk module
  `PAYABLE`, tetap mendukung party manual, currency, kurs, due date, dan draft.
- Line saldo awal hutang posted masuk ke read model Hutang Usaha sebagai row
  `OPENING_PAYABLE` dengan badge `Saldo Awal`, tanpa membuat Purchase Invoice
  operasional.
- Payment saldo awal hutang memakai branch service sendiri, mengupdate
  `paid_amount`, `remaining_amount`, dan `settlement_status` di
  `openingBalanceLines`, lalu menjurnal Dr Hutang Usaha Cr Kas/Bank dengan
  source event `OPENING_PAYABLE_PAYMENT_POSTED`.
- Verifikasi: `bun run build` dan
  `bunx playwright test tests/e2e/accounting-setup.spec.ts --project=chromium`
  hijau.

## Acceptance Criteria

- Hutang awal yang posted muncul di `/finance/payables`.
- Payment sebagian mengurangi outstanding dan status menjadi `PARTIAL`.
- Payment lunas mengubah status menjadi `PAID`.
- Jurnal payment balance dan mengarah ke akun Hutang Usaha yang benar.
- Row saldo awal tidak muncul sebagai Purchase Invoice/report purchase.
- Hub Saldo Awal menampilkan total hutang awal posted.

## Test Case

### OBP-01 - Posting Hutang Awal

Langkah:

1. Buka `/finance/opening-balances/payables`.
2. Pilih supplier.
3. Isi nomor dokumen, tanggal, due date, dan nominal.
4. Post.

Expected:

- Batch `PAYABLE` berstatus `POSTED`.
- Jurnal Dr Opening Balance Equity Cr Hutang Usaha terbentuk.
- Line berstatus outstanding/open.

### OBP-02 - Payment Sebagian

Langkah:

1. Buka `/finance/payables`.
2. Pilih row saldo awal hutang.
3. Catat pembayaran sebagian.

Expected:

- Outstanding berkurang.
- Status menjadi `PARTIAL`.
- Payment history tampil.
- Jurnal Dr Hutang Usaha Cr Kas/Bank terbentuk.

### OBP-03 - Payment Lunas

Langkah:

1. Bayar sisa outstanding.

Expected:

- Status menjadi `PAID`.
- Outstanding 0.
- Row tidak lagi masuk filter outstanding aktif.

## Referensi File

- `src/view/finance/opening-balances/OpeningBalancesManagement.tsx`
- `src/services/openingBalanceService.ts`
- `src/services/accountsPayableService.ts`
- `src/hooks/useAccountsPayable.tsx`
- `src/view/finance/payables/AccountsPayableManagement.tsx`
- `src/components/accounts-payable/PayablePaymentHistory.tsx`
- `tests/e2e/accounting-setup.spec.ts`
