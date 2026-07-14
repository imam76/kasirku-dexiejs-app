# Sub-Issue: Fase 7A - Saldo Awal Akun

Parent issue:

- [Fase 7 - General Ledger dan Menu Saldo Awal Terpisah](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7-GL-OPENING-BALANCE-MODULES.md)
- [E2E Refactor Flow Akuntansi Awal di Developer Setup](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP.md)

Tanggal catatan: 2026-07-14

## Ringkasan

Saldo Awal Akun adalah workflow untuk akun umum yang tidak punya submodule
operasional detail, misalnya kas/bank, aset tetap, modal, saldo laba, dan akun
neraca lain yang perlu dibawa dari periode sebelum cutoff.

Implementasi fondasi F7 sudah memindahkan form dari General Ledger ke route
`/finance/opening-balances/accounts` dan menyimpan batch `ACCOUNT`. Issue ini
melanjutkan hardening agar input akun umum tidak menggandakan saldo yang sudah
dikelola oleh submodule Piutang, Hutang, Uang Muka Masuk, dan Uang Muka Keluar.

## Tujuan

- Saldo awal akun umum bisa disimpan sebagai draft sebelum diposting.
- Draft boleh tidak balance seperti pola Zahir: user bisa input bertahap tanpa
  harus langsung menyelesaikan seluruh neraca.
- Akun yang sudah dikelola submodule detail tidak bisa diisi ganda di Saldo Awal
  Akun.
- Saat posting, jurnal General Ledger tetap harus balance dengan line otomatis
  ke akun `Ekuitas Saldo Awal`.
- Posting memakai source event `ACCOUNT_OPENING_BALANCE_POSTED`.
- Setelah posted atau skipped, form readonly.
- Legacy opening balance tetap terbaca sebagai batch `ACCOUNT`.

## Keputusan UX: Draft Boleh Tidak Balance

Saldo awal akun dibedakan antara **input setup** dan **jurnal resmi**:

- Input setup boleh tidak balance dan bisa diedit berulang selama belum dikunci.
- UI wajib menampilkan total debit, total kredit, dan selisih.
- Saat post, sistem otomatis membentuk line penyeimbang ke akun
  `Ekuitas Saldo Awal` / `Opening Balance Equity`.
- Line penyeimbang tidak diinput manual oleh user, tetapi harus terlihat jelas di
  preview posting dan trace jurnal.
- General Ledger tetap hanya menerima jurnal balance.

Rumus penyeimbang:

```txt
Jika total debit > total kredit:
  Cr Ekuitas Saldo Awal sebesar selisih

Jika total kredit > total debit:
  Dr Ekuitas Saldo Awal sebesar selisih
```

Contoh:

```txt
Dr Kas                         10.000.000
Dr Persediaan                   5.000.000
  Cr Hutang Usaha               3.000.000
  Cr Modal Pemilik             10.000.000
  Cr Ekuitas Saldo Awal         2.000.000
```

Catatan: `Ekuitas Saldo Awal` bukan angka tersembunyi. Akun ini harus tampil di
neraca/trial balance agar user bisa melihat bahwa ada angka residual dari setup
saldo awal.

## Scope

- Refactor `OpeningBalanceForm` agar memakai `openingBalanceBatches` dan
  `openingBalanceLines` sebagai draft source, bukan state lokal saja.
- Tambahkan rule managed account untuk akun:
  - Piutang Usaha;
  - Hutang Usaha;
  - Uang Muka Diterima;
  - Uang Muka Dibayar;
  - Piutang Pinjaman Anggota bila migrasi koperasi dikelola workflow terpisah.
- Tambahkan warning/readonly per baris akun yang sudah dikelola submodule
  detail.
- Tambahkan akun/mapping `Ekuitas Saldo Awal` jika belum tersedia di template.
- Tambahkan preview line penyeimbang otomatis sebelum posting.
- Update posting account opening agar idempotent berdasarkan `ACCOUNT + cutoff`.
- Update activity log dan i18n.
- Update E2E helper lama yang masih mengisi saldo awal melalui
  `/finance/general-ledger`.

## Non-Scope

- Tidak membuat reset/reversal opening balance setelah posted.
- Tidak otomatis mengubah saldo awal piutang/hutang detail menjadi baris akun.
- Tidak mengubah template COA di fase ini.

## Flow Target

1. User membuka `/finance/opening-balances/accounts`.
2. Sistem membaca cutoff, inventory policy, base currency, batch `ACCOUNT`, dan
   status submodule detail.
3. User mengisi debit/kredit hanya untuk akun umum.
4. User bisa menyimpan draft walau debit/kredit belum balance.
5. Posting membuat jurnal:

```txt
Dr akun debit saldo awal
  Cr akun kredit saldo awal
  Dr/Cr Ekuitas Saldo Awal jika ada selisih
```

6. Batch `ACCOUNT` berubah menjadi `POSTED`, form readonly, dan hub Saldo Awal
   menampilkan status posted.

## Validasi

- Minimal satu baris debit/kredit bila user memilih post.
- Draft tidak wajib balance.
- Posting boleh dilakukan saat input belum balance karena sistem menambahkan line
  otomatis ke `Ekuitas Saldo Awal`.
- Akun `Ekuitas Saldo Awal` wajib tersedia, aktif, dan postable sebelum posting.
- Jika selisih masuk debit `Ekuitas Saldo Awal`, tampilkan warning karena posisi
  tersebut biasanya menandakan pasiva/ekuitas input lebih besar dari aktiva.
- Cutoff wajib mengikuti `accountingInitialSetupSetting.cutoff_date` bila setup
  awal sudah ada.
- Akun non-postable tidak bisa diisi.
- Akun yang dikelola submodule detail tidak bisa diisi bila batch detail sudah
  `POSTED` atau `SKIPPED` dengan catatan module tersebut bertanggung jawab atas
  saldonya.

## Checklist

- [ ] Tambahkan draft save untuk batch `ACCOUNT`.
- [ ] Tambahkan loader existing `openingBalanceLines` ke form akun.
- [ ] Ubah source event dari legacy `OPENING_BALANCE_POSTED` ke
  `ACCOUNT_OPENING_BALANCE_POSTED` untuk posting baru.
- [ ] Tambahkan akun/template `Ekuitas Saldo Awal` atau mapping fallback yang
  jelas.
- [ ] Tambahkan kalkulasi selisih debit/kredit di UI.
- [ ] Tambahkan preview line otomatis `Ekuitas Saldo Awal`.
- [ ] Ubah validasi post agar input tidak harus balance selama akun penyeimbang
  tersedia.
- [ ] Tambahkan registry managed account per submodule.
- [ ] Tambahkan readonly/warning untuk managed account.
- [ ] Tambahkan action `Simpan Draft`.
- [ ] Tambahkan status dirty/unsaved changes.
- [ ] Update `getGeneralLedgerReadiness` agar legacy event dan event baru sama
  sama valid.
- [ ] Update i18n ID/EN.
- [ ] Update E2E `accounting-setup` untuk route Saldo Awal Akun.

## Acceptance Criteria

- User bisa membuka Saldo Awal Akun dari hub.
- User bisa menyimpan draft tanpa posting jurnal walau belum balance.
- User bisa post input yang belum balance dan sistem otomatis menambahkan line
  `Ekuitas Saldo Awal`.
- Preview posting menampilkan line penyeimbang otomatis sebelum user konfirmasi.
- Baris akun Piutang/Hutang/Uang Muka tidak menyebabkan double input bila
  submodule detail sudah mengelola saldo tersebut.
- Setelah posted, form readonly dan hub menampilkan status `Posted`.
- Trial Balance tetap balance setelah posting.

## Test Case

### OBA-01 - Draft Saldo Awal Akun

Langkah:

1. Buka `/finance/opening-balances/accounts`.
2. Isi kas debit tanpa mengisi kredit penyeimbang.
3. Klik Simpan Draft.
4. Reload halaman.

Expected:

- Input tetap terisi.
- Batch `ACCOUNT` berstatus `DRAFT`.
- Belum ada jurnal opening balance baru.
- UI menampilkan selisih debit/kredit.

### OBA-02 - Post Saldo Awal Akun Tidak Balance

Langkah:

1. Buka draft yang total debit dan kreditnya belum balance.
2. Klik Post.
3. Buka hub Saldo Awal dan General Ledger.

Expected:

- Batch `ACCOUNT` berstatus `POSTED`.
- Jurnal memakai source event `ACCOUNT_OPENING_BALANCE_POSTED`.
- Jurnal memiliki line otomatis `Ekuitas Saldo Awal`.
- Total debit/kredit jurnal balance.
- Form readonly.

### OBA-03 - Post Saldo Awal Akun Balance

Langkah:

1. Isi kas debit dan modal kredit dengan nominal sama.
2. Klik Post.

Expected:

- Tidak ada line otomatis `Ekuitas Saldo Awal`.
- Total debit/kredit jurnal balance.

### OBA-04 - Managed Account Guard

Langkah:

1. Post Saldo Awal Piutang.
2. Buka Saldo Awal Akun.

Expected:

- Akun Piutang Usaha tidak bisa diisi sebagai saldo awal akun umum.
- User melihat warning bahwa akun dikelola oleh submodule Piutang.

## Referensi File

- `src/components/general-ledger/OpeningBalanceForm.tsx`
- `src/view/finance/opening-balances/OpeningBalancesManagement.tsx`
- `src/services/generalLedgerService.ts`
- `src/services/openingBalanceService.ts`
- `src/utils/accounting/getGeneralLedgerReadiness.ts`
- `tests/e2e/accounting-setup.spec.ts`
- `tests/e2e/helpers/accounting.ts`
