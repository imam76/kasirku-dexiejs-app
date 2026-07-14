# Sub-Issue: Fase 7 - General Ledger dan Menu Saldo Awal Terpisah

Parent issue:

- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-14

## Ringkasan

Setelah flow setup akuntansi awal dipindah ke Developer Setup, General Ledger
tidak perlu lagi menjadi tempat utama input opening balance. Pola yang lebih
rapih adalah memisahkan saldo awal ke menu tersendiri, sedangkan General Ledger
fokus ke jurnal, buku besar, trial balance, laba rugi, neraca, dan manual
journal.

Saldo awal dibuat per jenis masalah agar user tidak mengisi semuanya lewat satu
tabel akun besar:

| Kebutuhan lama | Judul singkat ID | Judul singkat EN | Route usulan |
| --- | --- | --- | --- |
| Entry Account Opening Balance | Saldo Awal Akun | Account Opening | `/finance/opening-balances/accounts` |
| Entry Account Receivable Opening Balance | Saldo Awal Piutang | Receivable Opening | `/finance/opening-balances/receivables` |
| Entry Account Payable Opening Balance | Saldo Awal Hutang | Payable Opening | `/finance/opening-balances/payables` |
| Add Cash Advance Income Opening Balance | Uang Muka Masuk | Advance Received | `/finance/opening-balances/advance-received` |
| Add Cash Advance Expense Opening Balance | Uang Muka Keluar | Advance Paid | `/finance/opening-balances/advance-paid` |

## Issue Lanjutan Per Submodule

Setelah fondasi menu Saldo Awal, route, batch, line, dan readiness GL tersedia,
implementasi detail tiap jenis saldo awal dipisah agar bisa dikerjakan dan
dites bertahap:

- [Fase 7A - Saldo Awal Akun](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7A-OPENING-BALANCE-ACCOUNTS.md)
- [Fase 7B - Saldo Awal Piutang](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7B-OPENING-BALANCE-RECEIVABLES.md)
- [Fase 7C - Saldo Awal Hutang](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7C-OPENING-BALANCE-PAYABLES.md)
- [Fase 7D - Uang Muka Masuk](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7D-OPENING-BALANCE-ADVANCE-RECEIVED.md)
- [Fase 7E - Uang Muka Keluar](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7E-OPENING-BALANCE-ADVANCE-PAID.md)

## Kenapa Perlu Sub-Issue

Saat ini `OpeningBalanceForm` masih muncul langsung di
`GeneralLedgerManagement` ketika ledger belum ready. Route
`/finance/general-ledger/setup` juga hanya mengarah ke komponen General Ledger
yang sama. Setelah accounting setup punya cutoff, periode, template, dan base
currency yang jelas, input saldo awal seharusnya menjadi workflow terpisah yang
bisa dikontrol per submodule.

Pemisahan ini mengurangi risiko double input, membuat AR/AP bisa punya detail
kontak dan invoice awal, dan membuat General Ledger tetap menjadi area baca dan
audit, bukan form setup campur aduk.

## Masalah Saat Ini

- Opening balance account-level berada di halaman General Ledger.
- `/finance/general-ledger/setup` belum menjadi halaman setup tersendiri.
- `generalLedgerSetting.opening_balance_journal_id` mengasumsikan satu jurnal
  opening balance global.
- `postOpeningBalanceJournal` hanya menerima baris akun debit/kredit, belum
  memodelkan saldo awal piutang, hutang, dan uang muka sebagai source document
  yang bisa dilunasi atau disettle kemudian.
- Hint piutang migrasi koperasi masih disisipkan di form saldo awal akun umum.
- User harus memahami debit/kredit untuk semua jenis saldo awal, padahal sebagian
  seharusnya bisa diinput sebagai daftar pelanggan, supplier, atau uang muka.

## Tujuan

- Tambahkan menu Finance baru: **Saldo Awal**.
- Jadikan General Ledger hanya untuk report, journal list/detail, ledger per
  akun, trial balance, income statement, balance sheet, dan manual journal.
- Pindahkan input account opening balance dari GL ke submodule Saldo Awal Akun.
- Tambahkan submodule saldo awal untuk Piutang, Hutang, Uang Muka Masuk, dan
  Uang Muka Keluar.
- Semua submodule memakai cutoff, inventory policy, base currency, dan lock dari
  Accounting Initial Setup.
- Posting tetap menghasilkan jurnal double-entry yang idempotent dan bisa
  ditrace dari source saldo awal.

## Scope

- Route hub `/finance/opening-balances`.
- Route detail untuk lima submodule saldo awal.
- Navigation sidebar dan halaman Finance index.
- Refactor `OpeningBalanceForm` menjadi form Saldo Awal Akun yang tidak dirender
  langsung dari GL.
- Service posting saldo awal per submodule.
- Readiness General Ledger membaca status saldo awal per submodule, bukan hanya
  satu field journal id.
- Guard posted/locked untuk mencegah perubahan cutoff atau saldo awal setelah
  posted.
- i18n ID/EN untuk menu, title, CTA, status, validation, dan activity log.
- E2E regression untuk GL, hub saldo awal, dan posting minimal.

## Non-Scope

- Tidak membuat reset ledger atau edit opening balance setelah posted.
- Tidak backfill semua invoice historis menjadi opening balance otomatis.
- Tidak mengubah flow Developer Setup yang sudah selesai di fase sebelumnya.
- Tidak membuat compliance PSAK/PSAP penuh.
- Tidak menghapus manual journal.
- Tidak memindahkan transaksi operasional existing ke menu saldo awal.

## Flow Target

### 1. Finance Menu

Menu Finance menampilkan item baru:

- Cash & Bank
- Piutang Usaha
- Hutang Usaha
- Payroll
- Daftar Akun
- **Saldo Awal**
- General Ledger
- Closing

General Ledger tetap bisa memberi CTA ke Saldo Awal bila ledger belum ready,
tetapi tidak merender form input saldo awal langsung di halaman GL.

### 2. Hub Saldo Awal

Halaman `/finance/opening-balances` menampilkan ringkasan setup:

- cutoff ledger;
- base currency;
- periode berjalan;
- status GL readiness;
- status per submodule: `Belum diisi`, `Draft`, `Posted`, atau `Dilewati`;
- total debit dan kredit opening balance yang sudah posted;
- CTA masuk ke tiap submodule.

Jika sebuah submodule memang tidak punya saldo, user harus bisa menandainya
sebagai `Dilewati` agar readiness tidak menggantung.

### 3. Saldo Awal Akun

Form ini menggantikan `OpeningBalanceForm` yang sekarang berada di General
Ledger. Fungsinya untuk akun-akun umum yang tidak dikelola oleh submodule detail,
misalnya kas/bank, aset tetap, modal, laba ditahan, atau akun lain yang memang
perlu saldo awal langsung.

Aturan:

- akun Piutang Usaha, Hutang Usaha, Uang Muka Masuk, dan Uang Muka Keluar harus
  readonly atau diberi warning jika sudah dikelola submodule khusus;
- input sebelum post boleh tidak balance dan bisa diedit di layar;
- saat posting, jurnal tetap balance. Jika total debit/kredit input tidak sama,
  sistem otomatis menambahkan line `Ekuitas Saldo Awal` /
  `Opening Balance Equity` sebesar selisih;
- line penyeimbang harus terlihat di preview/jurnal, bukan angka tersembunyi;
- posting membuat journal `OPENING_BALANCE` dengan source event khusus Saldo
  Awal Akun;
- jika sudah posted, form menjadi readonly.

### 4. Saldo Awal Piutang

Input berbentuk daftar customer/invoice outstanding per cutoff:

- customer/contact;
- nomor dokumen awal;
- tanggal dokumen;
- jatuh tempo;
- currency dan rate bila non-base;
- nominal outstanding;
- catatan.

Posting membuat source saldo awal piutang dan jurnal:

```txt
Dr Piutang Usaha
  Cr Ekuitas Saldo Awal / Opening Balance Equity
```

Row harus muncul di Piutang Usaha dan bisa menerima pembayaran seperti invoice
normal, tetapi tetap terlabel sebagai saldo awal.

### 5. Saldo Awal Hutang

Input berbentuk daftar supplier/bill outstanding per cutoff:

- supplier/contact;
- nomor dokumen awal;
- tanggal dokumen;
- jatuh tempo;
- currency dan rate bila non-base;
- nominal outstanding;
- catatan.

Posting membuat source saldo awal hutang dan jurnal:

```txt
Dr Ekuitas Saldo Awal / Opening Balance Equity
  Cr Hutang Usaha
```

Row harus muncul di Hutang Usaha dan bisa dibayar seperti hutang normal, tetapi
tetap terlabel sebagai saldo awal.

### 6. Uang Muka Masuk

Dipakai untuk saldo awal uang muka yang diterima dari customer atau pihak luar.
Nama dibuat pendek di UI agar tidak terasa seperti istilah teknis panjang.

Posting jurnal:

```txt
Dr Ekuitas Saldo Awal / Opening Balance Equity
  Cr Uang Muka Diterima / Advance Received
```

Settlement lanjutan boleh dibuat di issue terpisah bila belum ada modul invoice
atau revenue yang bisa mengonsumsi saldo tersebut.

### 7. Uang Muka Keluar

Dipakai untuk saldo awal uang muka yang sudah dibayarkan ke supplier, karyawan,
atau pihak lain. Untuk kasbon karyawan existing, perlu diputuskan apakah memakai
model `employeeCashAdvances` atau source opening balance generic yang ditampilkan
di payroll/kasbon.

Posting jurnal:

```txt
Dr Uang Muka Dibayar / Advance Paid
  Cr Ekuitas Saldo Awal / Opening Balance Equity
```

Settlement lanjutan boleh dibuat di issue terpisah bila belum ada modul yang
mengonsumsi saldo uang muka tersebut.

## Model Data Yang Disarankan

Tambahkan model batch agar status tiap submodule bisa diaudit dan disync:

```ts
export type OpeningBalanceModule =
  | 'ACCOUNT'
  | 'RECEIVABLE'
  | 'PAYABLE'
  | 'ADVANCE_RECEIVED'
  | 'ADVANCE_PAID';

export type OpeningBalanceBatchStatus =
  | 'DRAFT'
  | 'POSTED'
  | 'SKIPPED'
  | 'VOIDED';

export interface OpeningBalanceBatch {
  id: string;
  module: OpeningBalanceModule;
  cutoff_date: string;
  status: OpeningBalanceBatchStatus;
  total_debit: number;
  total_credit: number;
  journal_entry_id?: string;
  posted_at?: string;
  skipped_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
}
```

Untuk detail, rekomendasi v1:

- Saldo Awal Akun memakai line generic per account.
- Saldo Awal Piutang dan Hutang punya source row domain sendiri agar AR/AP bisa
  menampilkan dan melunasi saldo awal tanpa membuat sales/purchase document palsu
  yang mengotori report operasional.
- Uang Muka Masuk/Keluar memakai source row domain sendiri dan settlement
  generic berbasis akun settlement pilihan; auto-link ke dokumen spesifik bisa
  ditambahkan setelah kontrak Sales/Purchase/Payroll siap.

## Posting dan Readiness

- Semua posting memakai cutoff dari `accountingInitialSetupSetting` atau
  `generalLedgerSetting`.
- Semua posting memakai base currency dari setup.
- Setiap batch harus idempotent berdasarkan `module + cutoff + source id`.
- Jurnal memakai `source_type: 'OPENING_BALANCE'` dengan `source_event` berbeda,
  misalnya:
  - `ACCOUNT_OPENING_BALANCE_POSTED`;
  - `RECEIVABLE_OPENING_BALANCE_POSTED`;
  - `PAYABLE_OPENING_BALANCE_POSTED`;
  - `ADVANCE_RECEIVED_OPENING_BALANCE_POSTED`;
  - `ADVANCE_PAID_OPENING_BALANCE_POSTED`.
- `getGeneralLedgerReadiness` perlu membaca batch status:
  - setup cutoff valid;
  - akun wajib tersedia;
  - semua submodule required sudah `POSTED` atau `SKIPPED`;
  - total opening balance yang posted tetap balance;
  - GL module aktif jika report akan ditampilkan.
- Field legacy `opening_balance_journal_id` boleh tetap dipakai sementara untuk
  kompatibilitas, tetapi readiness baru tidak boleh bergantung hanya pada satu
  journal id.

## Checklist

- [x] Tambahkan type `OpeningBalanceModule`, `OpeningBalanceBatchStatus`, dan
  model batch/line yang dipilih.
- [x] Tambahkan Dexie migration dan backup/restore untuk tabel saldo awal.
- [x] Tambahkan PostgreSQL migration, Rust model/repository/command, adapter,
  sync queue, read refresh, dan realtime trigger untuk saldo awal.
  - Implementasi: `0053_opening_balances.sql`, model/repository/command Rust
    `opening_balance`, `openingBalancePostgresAdapter`,
    `openingBalanceReadService`, sync queue bundle, orchestrator refresh, dan
    realtime table invalidation.
- [x] Tambahkan route `/finance/opening-balances`.
- [x] Tambahkan route submodule:
  - [x] `/finance/opening-balances/accounts`;
  - [x] `/finance/opening-balances/receivables`;
  - [x] `/finance/opening-balances/payables`;
  - [x] `/finance/opening-balances/advance-received`;
  - [x] `/finance/opening-balances/advance-paid`.
- [x] Ubah `/finance/general-ledger/setup` agar redirect/menampilkan Saldo Awal,
  bukan alias dashboard General Ledger.
- [x] Pindahkan `OpeningBalanceForm` keluar dari `GeneralLedgerManagement`.
- [x] Tambahkan hub Saldo Awal dengan status per submodule.
- [x] Tambahkan form Saldo Awal Akun.
- [x] Tambahkan form Saldo Awal Piutang.
- [x] Tambahkan form Saldo Awal Hutang.
- [x] Tambahkan form Uang Muka Masuk.
- [x] Tambahkan form Uang Muka Keluar.
- [x] Tambahkan service posting batch saldo awal dan activity log.
- [x] Integrasikan saldo awal piutang ke `listAccountsReceivableRows` dan payment
  flow.
- [x] Integrasikan saldo awal hutang ke `listAccountsPayableRows` dan payment
  flow.
- [x] Integrasikan saldo awal uang muka ke read model minimal
  `listOpeningAdvanceBalanceRows`, hub Saldo Awal, dan journal trace.
- [x] Integrasikan saldo awal uang muka ke report/settlement lanjutan.
  - Implementasi: `getOpeningAdvanceBalanceReport` dan
    `recordOpeningAdvanceSettlement` untuk settlement generic berbasis akun
    settlement pilihan; auto-link ke dokumen Sales/Purchase/Payroll spesifik
    tetap bisa menjadi enhancement berikutnya.
- [x] Update `getGeneralLedgerReadiness`.
- [x] Update sidebar, finance index, i18n ID/EN, route permission, dan test id.
- [x] Update E2E helper yang masih mengisi opening balance lewat
  `/finance/general-ledger`.

## Acceptance Criteria

- General Ledger tidak lagi menampilkan form input opening balance langsung.
- User bisa membuka menu Saldo Awal dari Finance.
- Setiap submodule punya judul pendek dan flow input sendiri.
- User bisa menandai submodule kosong sebagai `Dilewati`.
- Saldo Awal Akun tidak menggandakan akun yang sudah dikelola oleh submodule
  Piutang/Hutang/Uang Muka.
- Posting setiap submodule menghasilkan journal entry yang balance.
- Piutang opening balance muncul di Piutang Usaha dan bisa dibayar.
- Hutang opening balance muncul di Hutang Usaha dan bisa dibayar.
- Uang Muka Masuk/Keluar muncul di summary/report yang relevan atau minimal di
  hub saldo awal dan journal trace.
- Setelah posted, saldo awal readonly dan perubahan membutuhkan flow
  reversal/reset terpisah.
- General Ledger readiness membaca status batch saldo awal, bukan hanya satu
  `opening_balance_journal_id`.

## Test Case

### OB-01 - GL tidak lagi menjadi tempat input saldo awal

Langkah:

1. Fresh setup accounting sampai cutoff tersimpan.
2. Buka `/finance/general-ledger`.

Expected:

- Halaman GL menampilkan status belum ready dan CTA ke Saldo Awal.
- Tidak ada tabel input debit/kredit opening balance di halaman GL.

### OB-02 - Saldo Awal Akun

Langkah:

1. Buka `/finance/opening-balances/accounts`.
2. Isi saldo awal kas/bank dan ekuitas sampai balance.
3. Post.
4. Buka General Ledger dan Trial Balance.

Expected:

- Batch `ACCOUNT` berstatus `POSTED`.
- Journal entry balance.
- Trial balance balance.
- Form menjadi readonly.

### OB-03 - Saldo Awal Piutang

Langkah:

1. Buka `/finance/opening-balances/receivables`.
2. Isi satu customer, nomor invoice awal, due date, dan nominal outstanding.
3. Post.
4. Buka `/finance/receivables`.
5. Catat pembayaran sebagian.

Expected:

- Row muncul di Piutang Usaha dengan label saldo awal.
- Payment mengurangi balance due.
- Jurnal payment tetap Dr Kas/Bank Cr Piutang.

### OB-04 - Saldo Awal Hutang

Langkah:

1. Buka `/finance/opening-balances/payables`.
2. Isi satu supplier, nomor bill awal, due date, dan nominal outstanding.
3. Post.
4. Buka `/finance/payables`.
5. Catat pembayaran sebagian.

Expected:

- Row muncul di Hutang Usaha dengan label saldo awal.
- Payment mengurangi balance due.
- Jurnal payment tetap Dr Hutang Cr Kas/Bank.

### OB-05 - Uang Muka Masuk dan Uang Muka Keluar

Langkah:

1. Post satu Uang Muka Masuk.
2. Post satu Uang Muka Keluar.
3. Buka hub Saldo Awal dan General Ledger journal list.

Expected:

- Kedua batch berstatus `POSTED`.
- Journal trace memakai source event yang berbeda.
- Summary hub menampilkan nominal per submodule.

### OB-06 - Skip submodule kosong

Langkah:

1. Buka submodule yang tidak punya saldo.
2. Klik tandai `Dilewati`.
3. Buka hub dan GL readiness.

Expected:

- Submodule berstatus `Dilewati`.
- Readiness tidak tertahan oleh submodule kosong.

## Referensi File

- `src/view/finance/general-ledger/GeneralLedgerManagement.tsx`
- `src/components/general-ledger/OpeningBalanceForm.tsx`
- `src/routes/finance/general-ledger/setup.lazy.tsx`
- `src/services/generalLedgerService.ts`
- `src/utils/accounting/getGeneralLedgerReadiness.ts`
- `src/routes/__root.tsx`
- `src/routes/finance/index.tsx`
- `src/i18n/messages.ts`
- `src/i18n/navigationMessages.ts`
- `src/services/accountsReceivableService.ts`
- `src/services/accountsPayableService.ts`
- `src/services/employeeCashAdvanceService.ts`
- `src/hooks/useAccountsReceivable.tsx`
- `src/hooks/useAccountsPayable.tsx`
- `tests/e2e/accounting-setup.spec.ts`
- `tests/e2e/helpers/accounting.ts`

## Dependency

- Fase 1: setup snapshot/read service dan sync.
- Fase 3: canonical save setup.
- Fase 4: base currency dinamis.
- Fase 5: maintenance UI membaca setup dan lock.
- Fase 6: regression baseline sebelum GL/opening balance dipisah.
