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

Catatan UX: Saldo Awal Akun bukan syarat agar halaman General Ledger bisa
dibuka. GL tetap tampil setelah fondasi minimum akuntansi tersedia; saldo awal
akun menentukan kelengkapan baseline dan status production-ready.

## Tujuan

- Saldo awal akun umum memakai pola post langsung: user mengisi angka lalu post, tanpa
  action `Simpan Draft`.
- Input boleh tidak balance sebelum diposting karena sistem menampilkan selisih
  dan menambahkan line penyeimbang saat post.
- Akun yang sudah dikelola submodule detail tidak bisa diisi ganda di Saldo Awal
  Akun.
- Saat posting, jurnal General Ledger tetap harus balance dengan line otomatis
  ke akun `Ekuitas Saldo Awal`.
- Posting memakai source event `ACCOUNT_OPENING_BALANCE_POSTED`.
- Setelah posted atau skipped, form readonly.
- Jika user lupa mengisi modal/ekuitas setelah saldo awal akun terlanjur
  posted, koreksi dilakukan lewat jurnal penyesuaian saldo awal, bukan membuka
  ulang batch posted.
- Legacy opening balance tetap terbaca sebagai batch `ACCOUNT`.

## Keputusan UX: Post Sekali Lalu Locked

Saldo awal akun dibedakan antara **input setup** dan **jurnal resmi**:

- Input setup di layar boleh tidak balance sebelum user klik post.
- Tidak ada action `Simpan Draft` untuk Saldo Awal Akun. Persistensi resmi
  terjadi saat post.
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

## Tambalan Flow: Koreksi Modal Setelah Posted

Kasus nyata: user sudah post Saldo Awal Akun, lalu sadar akun `Modal Pemilik`
belum diisi. Karena batch `ACCOUNT` yang posted adalah jurnal resmi, sistem
tidak boleh mengedit ulang batch tersebut secara diam-diam.

Solusi akuntansi:

- Jika aset dan liabilitas awal sudah benar, tetapi modal pemilik lupa diinput,
  angka residual yang sebelumnya masuk `Ekuitas Saldo Awal` dipindahkan ke
  `Modal Pemilik` lewat jurnal koreksi:

```txt
Dr Ekuitas Saldo Awal / Opening Balance Equity
  Cr Modal Pemilik
```

- Jika aset setoran modal juga belum masuk, misalnya kas awal dari pemilik belum
  dicatat, koreksi memakai akun aset terkait:

```txt
Dr Kas/Bank/Aset terkait
  Cr Modal Pemilik
```

Flow produk:

1. Saldo Awal Akun yang sudah `POSTED` tetap readonly.
2. UI menampilkan action `Koreksi Saldo Awal` dari state posted.
3. User memilih tanggal koreksi:
   - default: tanggal cutoff bila periode cutoff masih terbuka;
   - fallback: tanggal awal periode terbuka paling awal bila cutoff sudah
     terkunci/tutup.
4. User mengisi jurnal koreksi balance dengan akun neraca saja.
5. Sistem membuat journal baru dengan source event
   `ACCOUNT_OPENING_BALANCE_ADJUSTMENT_POSTED`, linked ke batch `ACCOUNT`, dan
   menampilkan audit trail di halaman Saldo Awal Akun/General Ledger.

Tambalan ini menjaga dua hal sekaligus: posting awal tetap immutable, tetapi
user tetap punya jalan akuntansi yang benar untuk memindahkan residual
`Ekuitas Saldo Awal` ke akun modal/ekuitas yang tepat.

## Scope

- Refactor `OpeningBalanceForm` agar memakai `openingBalanceBatches` dan
  `openingBalanceLines` sebagai sumber saldo posted.
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
- Tambahkan flow koreksi saldo awal setelah batch `ACCOUNT` posted, dengan
  journal adjustment yang linked ke batch awal.
- Update activity log dan i18n.
- Update E2E helper lama yang masih mengisi saldo awal melalui
  `/finance/general-ledger`.

## Non-Scope

- Tidak membuat reset/reversal opening balance setelah posted. Koreksi setelah
  posted dilakukan lewat jurnal penyesuaian baru, bukan mengubah batch awal.
- Tidak otomatis mengubah saldo awal piutang/hutang detail menjadi baris akun.
- Tidak mengubah struktur template COA di luar akun penyeimbang
  `Ekuitas Saldo Awal` yang wajib tersedia untuk posting selisih.

## Risiko Tanpa Draft

- Karena tidak ada `Simpan Draft`, input yang belum diposting belum menjadi data
  resmi. Jika user reload/tutup tab sebelum post, perubahan dapat hilang.
- Mitigasi v1: UI menampilkan status unsaved changes dan browser memberi warning
  saat reload/tutup tab.
- Jika nanti user membutuhkan penyimpanan sementara tanpa membuat batch `DRAFT`,
  solusi yang lebih aman adalah autosave lokal per device (misalnya
  `localStorage/sessionStorage`) dengan label `Belum Diposting`, bukan menulis
  status draft ke tabel ledger.

## Flow Target

1. User membuka `/finance/opening-balances/accounts`.
2. Sistem membaca cutoff, inventory policy, base currency, batch `ACCOUNT`, dan
   status submodule detail.
3. User mengisi debit/kredit hanya untuk akun umum.
4. User bisa melihat selisih walau debit/kredit belum balance.
5. User klik post untuk menyimpan saldo awal resmi ke jurnal:

```txt
Dr akun debit saldo awal
  Cr akun kredit saldo awal
  Dr/Cr Ekuitas Saldo Awal jika ada selisih
```

6. Batch `ACCOUNT` berubah menjadi `POSTED`, form readonly, dan hub Saldo Awal
   menampilkan status posted.
7. Jika ada akun modal/ekuitas yang terlupa setelah posted, user memakai
   `Koreksi Saldo Awal` untuk membuat jurnal penyesuaian yang linked ke batch
   `ACCOUNT`, tanpa membuka kembali posting awal.

## Validasi

- Minimal satu baris debit/kredit bila user memilih post.
- Input sebelum post tidak wajib balance.
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
- Koreksi saldo awal hanya tersedia setelah batch `ACCOUNT` berstatus `POSTED`.
- Jurnal koreksi wajib balance dan hanya memakai akun neraca
  `ASSET`, `LIABILITY`, atau `EQUITY`.
- Jurnal koreksi wajib memakai source event
  `ACCOUNT_OPENING_BALANCE_ADJUSTMENT_POSTED` dan menyimpan referensi ke batch
  `ACCOUNT`.
- Jika tanggal cutoff sudah berada di periode terkunci/tutup, sistem memakai
  periode terbuka paling awal dan memberi catatan audit bahwa koreksi berasal
  dari saldo awal.

## Checklist

- [x] Tambahkan loader existing `openingBalanceLines` ke form akun.
- [x] Ubah source event dari legacy `OPENING_BALANCE_POSTED` ke
  `ACCOUNT_OPENING_BALANCE_POSTED` untuk posting baru.
- [x] Tambahkan akun/template `Ekuitas Saldo Awal` atau mapping fallback yang
  jelas.
- [x] Tambahkan kalkulasi selisih debit/kredit di UI.
- [x] Tambahkan preview line otomatis `Ekuitas Saldo Awal`.
- [x] Ubah validasi post agar input tidak harus balance selama akun penyeimbang
  tersedia.
- [x] Tambahkan registry managed account per submodule.
- [x] Tambahkan readonly/warning untuk managed account.
- [x] Hapus action `Simpan Draft` dari Saldo Awal Akun.
- [x] Tambahkan status dirty/unsaved changes.
- [x] Kunci batch `ACCOUNT` berstatus `POSTED` agar tidak bisa diedit/post ulang.
- [x] Tambahkan action `Koreksi Saldo Awal` pada state posted.
- [x] Tambahkan service journal adjustment linked ke batch `ACCOUNT`.
- [x] Tambahkan source event `ACCOUNT_OPENING_BALANCE_ADJUSTMENT_POSTED`.
- [x] Tambahkan audit trail koreksi di halaman Saldo Awal Akun dan General
  Ledger.
- [x] Update `getGeneralLedgerReadiness` agar legacy event dan event baru sama
  sama valid.
- [x] Update i18n ID/EN.
- [x] Update E2E `accounting-setup` untuk route Saldo Awal Akun.
- [x] Tambahkan E2E `OBA-06` untuk koreksi modal pemilik setelah posted.

## Catatan Implementasi 2026-07-14

- Akun `3050 Ekuitas Saldo Awal` ditambahkan ke seed/template COA dan migration
  Dexie v87 agar database lokal existing ikut mendapat akun penyeimbang.
- Baris `Ekuitas Saldo Awal` eksplisit dibuat readonly di form akun dan hanya
  dipakai sebagai line otomatis di preview/posting.
- Action `Simpan Draft` dihapus dari Saldo Awal Akun supaya tidak ada status
  draft yang bertabrakan dengan jurnal aktif.
- Batch `ACCOUNT` yang sudah `POSTED` kembali readonly dan pemanggilan service
  post ulang tidak mengubah batch/jurnal yang sudah posted.
- Action `Koreksi Saldo Awal` ditambahkan pada state posted. Service
  `postAccountOpeningBalanceAdjustment` membuat jurnal baru dengan source event
  `ACCOUNT_OPENING_BALANCE_ADJUSTMENT_POSTED`, source id unik ber-prefix batch
  `ACCOUNT`, dan validasi hanya akun neraca.
- Modal koreksi default mengarahkan kasus lupa modal pemilik menjadi jurnal
  `Dr Ekuitas Saldo Awal / Cr Modal Pemilik`; riwayat koreksi tampil di halaman
  Saldo Awal Akun.
- Verifikasi: `bun run build` dan
  `bunx playwright test tests/e2e/accounting-setup.spec.ts --project=chromium`
  sudah hijau.

## Acceptance Criteria

- User bisa membuka Saldo Awal Akun dari hub.
- Tidak ada tombol `Simpan Draft` di Saldo Awal Akun.
- User bisa post input yang belum balance dan sistem otomatis menambahkan line
  `Ekuitas Saldo Awal`.
- Preview posting menampilkan line penyeimbang otomatis sebelum user konfirmasi.
- Baris akun Piutang/Hutang/Uang Muka tidak menyebabkan double input bila
  submodule detail sudah mengelola saldo tersebut.
- Setelah posted, form readonly dan tidak ada post ulang.
- User tetap bisa membuat jurnal koreksi saldo awal yang linked ke batch posted.
- Koreksi modal pemilik memindahkan saldo dari `Ekuitas Saldo Awal` ke
  `Modal Pemilik` tanpa masuk ke pendapatan atau beban.
- Trial Balance tetap balance setelah posting.

## Test Case

### OBA-01 - Input Saldo Awal Akun Tanpa Draft

Langkah:

1. Buka `/finance/opening-balances/accounts`.
2. Isi kas debit tanpa mengisi kredit penyeimbang.
3. Lihat preview/selisih.

Expected:

- Tidak ada tombol `Simpan Draft`.
- Belum ada batch/jurnal baru sebelum user klik post.
- UI menampilkan selisih debit/kredit.

### OBA-02 - Post Saldo Awal Akun Tidak Balance

Langkah:

1. Isi saldo awal dengan total debit dan kredit belum balance.
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

### OBA-05 - Saldo Awal Akun Terkunci Setelah Posted

Langkah:

1. Post Saldo Awal Akun.
2. Buka kembali `/finance/opening-balances/accounts`.
3. Cek field debit/kredit dan tombol post.
4. Panggil service post ulang dengan nominal berbeda.

Expected:

- Input posted readonly.
- Tombol post disabled.
- Batch dan jurnal tetap mengikuti nominal posting pertama.
- Tidak ada jurnal reversal atau jurnal aktif baru.

### OBA-06 - Koreksi Modal Pemilik Setelah Posted

Langkah:

1. Post Saldo Awal Akun dengan selisih yang otomatis masuk ke
   `Ekuitas Saldo Awal`.
2. Buka kembali `/finance/opening-balances/accounts`.
3. Klik `Koreksi Saldo Awal`.
4. Isi jurnal koreksi:

```txt
Dr Ekuitas Saldo Awal
  Cr Modal Pemilik
```

5. Post koreksi dan buka General Ledger/Trial Balance.

Expected:

- Batch `ACCOUNT` awal tetap `POSTED` dan readonly.
- Jurnal koreksi baru terbentuk dengan source event
  `ACCOUNT_OPENING_BALANCE_ADJUSTMENT_POSTED`.
- Jurnal koreksi linked ke batch `ACCOUNT`.
- Saldo `Ekuitas Saldo Awal` berkurang dan `Modal Pemilik` bertambah.
- Tidak ada line pendapatan atau beban pada jurnal koreksi.

## Referensi File

- `src/components/general-ledger/OpeningBalanceForm.tsx`
- `src/view/finance/opening-balances/OpeningBalancesManagement.tsx`
- `src/services/generalLedgerService.ts`
- `src/services/openingBalanceService.ts`
- `src/utils/accounting/getGeneralLedgerReadiness.ts`
- `tests/e2e/accounting-setup.spec.ts`
- `tests/e2e/helpers/accounting.ts`
