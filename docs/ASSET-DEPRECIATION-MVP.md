# MVP Penyusutan Aset Tetap

## Status Dokumen

- Status: spesifikasi implementasi MVP.
- Area aplikasi: Master Data, dengan integrasi ke General Ledger.
- Route utama: `/master-data/fixed-assets`.
- Model pencatatan: offline-first Dexie dengan sinkronisasi PostgreSQL melalui Tauri.
- Basis nilai: base currency perusahaan.
- Metode MVP: garis lurus bulanan.
- Lingkup: penyusutan komersial aset tetap berwujud, bukan persediaan.

Dokumen ini menjadi acuan implementasi. Seluruh keputusan produk, akuntansi,
antarmuka, data, sinkronisasi, dan acceptance criteria yang diperlukan untuk MVP
dikunci di sini agar implementer tidak perlu menentukan kebijakan baru.

## Ringkasan Keputusan

- Aset tetap disimpan sebagai register tersendiri dan tidak memakai tabel
  `products`, karena produk pada base project adalah persediaan.
- Fitur ditempatkan di landing Master Data sebagai kartu **Aset Tetap** dan
  memakai satu halaman dengan tab **Daftar Aset** dan **Proses Penyusutan**.
- Sistem menghitung penyusutan, menyimpan draft per periode, dan baru membuat
  jurnal setelah user menekan **Posting**.
- Aset lama dapat dimasukkan dengan akumulasi penyusutan dan sisa umur manfaat
  pada tanggal saldo awal. Sistem tidak membuat jurnal historis otomatis.
- Posting penyusutan adalah transaksi nonkas. Sistem hanya membuat jurnal
  General Ledger, tidak membuat `financeTransactions` dan tidak mengubah
  `financeBalance`.
- Jurnal posted dan run tidak boleh diedit. Koreksi dilakukan melalui reversal,
  kemudian membuat draft pengganti.
- Tidak ada hard delete untuk aset atau run yang sudah pernah diposting.
- Semua label, validasi, empty state, notifikasi, dan konfirmasi tersedia dalam
  Bahasa Indonesia dan Inggris melalui `src/i18n/messages.ts`.

## Tujuan dan Success Criteria

MVP dianggap berhasil jika staf Finance dapat:

1. Mendaftarkan aset baru maupun aset lama dengan data nilai buku yang dapat
   ditelusuri.
2. Melihat biaya perolehan, akumulasi penyusutan, nilai buku, jadwal, dan riwayat
   posting per aset.
3. Membuat draft penyusutan untuk periode bulanan paling awal yang masih
   tertunggak.
4. Memeriksa seluruh line sebelum posting tanpa dapat mengubah angka line secara
   manual.
5. Memposting jurnal debit Beban Penyusutan dan kredit Akumulasi Penyusutan yang
   seimbang dan idempotent.
6. Membalik run terakhir ketika periode telah dibuka kembali, tanpa kehilangan
   audit trail.
7. Melihat dampak posting pada Buku Besar, Laba Rugi, dan Neraca yang sudah ada.
8. Mencegah tutup buku jika penyusutan aset yang eligible belum diposting.
9. Tetap dapat bekerja offline dan menyinkronkan data tanpa duplikasi ketika
   koneksi kembali tersedia.

## Pengguna dan Hak Akses

Tambahkan permission sensitif `FIXED_ASSET_MANAGE` pada grup **Data Master**.
Aktivitas postingnya tetap dilindungi permission jurnal dari grup Keuangan.

| Aktivitas | Permission |
| --- | --- |
| Membuka halaman, melihat, membuat, dan mengedit aset | `FIXED_ASSET_MANAGE` |
| Mengarsipkan atau memulihkan aset | `FIXED_ASSET_MANAGE` |
| Membuat atau menghapus draft run | `FIXED_ASSET_MANAGE` |
| Posting atau reversal run | `FIXED_ASSET_MANAGE` dan `JOURNAL_MANAGE` |
| Membuka atau menutup periode | Permission periode yang sudah ada |

- Owner dan role sistem Admin memperoleh `FIXED_ASSET_MANAGE` secara default.
- Role kustom tidak memperoleh permission baru secara otomatis; Owner harus
  memberikannya melalui halaman Role & Permission.
- Tambahkan setup module `FIXED_ASSET` pada grup Master Data dan masukkan ke
  default module instalasi baru.
- Instalasi lama yang sudah mempunyai setup config tidak diubah diam-diam;
  Owner mengaktifkan module `FIXED_ASSET` melalui developer setup.
- Route hanya ditampilkan ketika `FIXED_ASSET` aktif, user mempunyai permission,
  dan module `GENERAL_LEDGER` tersedia.

## Lingkup MVP

### Termasuk

- Register aset tetap yang dapat disusutkan.
- Kategori tetap: bangunan, kendaraan, mesin/peralatan, inventaris kantor,
  furnitur, dan lainnya.
- Metode garis lurus bulanan.
- Aset baru dan onboarding aset lama.
- Nilai residu dan umur manfaat dalam bulan.
- Akun per aset dengan snapshot pada setiap run line.
- Dimensi department dan project opsional.
- Jadwal penyusutan, nilai buku, dan riwayat posting per aset.
- Draft, posting, dan reversal run bulanan.
- Integrasi General Ledger, accounting period, closing precheck, activity log,
  backup/restore, permission, module setup, dan sinkronisasi PostgreSQL.
- Ekspor daftar aset terfilter dan detail run melalui pola `ExportActions`.

### Tidak Termasuk

- Penurunan nilai atau write-down produk/persediaan.
- Pencatatan pembelian, kapitalisasi otomatis dari Purchase Invoice, pembayaran,
  atau sumber pendanaan aset.
- Penghapusan, penjualan, disposal, trade-in, atau gain/loss pelepasan aset.
- Impairment, revaluasi, perubahan estimasi prospektif, dan component
  depreciation.
- Metode saldo menurun, unit produksi, atau metode berbasis pendapatan.
- Penyusutan fiskal, kelompok pajak, rekonsiliasi fiskal, dan pajak tangguhan.
- Tanah, aset takberwujud, aset hak-guna, properti investasi, dan construction in
  progress.
- Mata uang asing pada subledger aset.
- Import massal aset pada MVP pertama.

Jika salah satu kebutuhan di luar lingkup diperlukan, implementasikan sebagai
fase terpisah agar tidak mengubah hasil hitung atau audit trail MVP.

## Kebijakan Akuntansi

### Istilah

- **Biaya perolehan** adalah nilai aset yang dicatat pada register dalam base
  currency.
- **Nilai residu** adalah estimasi nilai aset pada akhir umur manfaat.
- **Nilai tersusutkan** adalah `biaya perolehan - nilai residu`.
- **Akumulasi penyusutan** adalah saldo awal ditambah seluruh run line posted dan
  belum dibalik.
- **Nilai buku** adalah `biaya perolehan - akumulasi penyusutan`.
- **Tanggal siap digunakan** adalah tanggal aset telah berada pada lokasi dan
  kondisi yang diperlukan untuk dipakai sesuai tujuan manajemen.

Konsep biaya, nilai residu, umur manfaat, dan tanggal siap digunakan mengikuti
prinsip umum [IAS 16 Property, Plant and Equipment](https://www.ifrs.org/issued-standards/list-of-standards/ias-16-property-plant-and-equipment/)
dan materi IAI mengenai review nilai residu, umur manfaat, serta metode
penyusutan dalam [modul PSAK 216](https://web.iaiglobal.or.id/assets/materi/Sertifikasi/CA/modul/pk_19/files/basic-html/page140.html).

### Konvensi Bulanan MVP

- MVP memakai konvensi bulan penuh.
- Bulan pertama yang dikelola aplikasi adalah bulan kalender setelah tanggal
  siap digunakan.
- Tidak ada prorata harian pada bulan pertama atau terakhir.
- Kebijakan ini harus ditampilkan pada form dan dokumentasi sebagai kebijakan
  perusahaan yang perlu dikonfirmasi akuntan sebelum dipakai di produksi.
- Sistem tidak menyediakan pause. Aset yang sedang tidak digunakan tetap masuk
  perhitungan sampai disusutkan penuh atau diproses melalui fitur disposal pada
  fase berikutnya.

Contoh aset baru:

```text
Biaya perolehan       Rp12.000.000
Nilai residu          Rp0
Umur manfaat          12 bulan
Tanggal siap digunakan 15 Januari 2026
Mulai penyusutan      Februari 2026
Beban reguler         Rp1.000.000 per bulan
Selesai               Januari 2027
```

### Perhitungan Aset Baru

```text
nilai_tersusutkan = biaya_perolehan - nilai_residu
beban_reguler = round(nilai_tersusutkan / umur_manfaat_bulan, 2)
```

Untuk setiap periode eligible:

```text
sisa_yang_boleh_disusutkan = biaya_perolehan - nilai_residu - akumulasi_sebelum_run
beban_periode = min(beban_reguler, sisa_yang_boleh_disusutkan)
akumulasi_setelah_run = akumulasi_sebelum_run + beban_periode
nilai_buku_akhir = biaya_perolehan - akumulasi_setelah_run
```

Line terakhir memakai seluruh `sisa_yang_boleh_disusutkan`, bukan beban reguler,
agar total tepat dan nilai buku akhir sama dengan nilai residu.

Contoh pembulatan:

```text
Nilai tersusutkan Rp100, umur 3 bulan
Bulan 1: Rp33,33
Bulan 2: Rp33,33
Bulan 3: Rp33,34
```

### Onboarding Aset Lama

Form menyediakan mode `EXISTING` untuk aset yang sudah dimiliki sebelum module
dipakai. Field tambahan:

- tanggal saldo awal;
- akumulasi penyusutan awal;
- sisa umur manfaat dalam bulan.

Aturannya:

- Tanggal saldo awal wajib merupakan hari terakhir suatu bulan.
- Periode aplikasi pertama adalah bulan setelah tanggal saldo awal.
- Akumulasi awal tidak boleh negatif dan tidak boleh melebihi nilai tersusutkan.
- Sisa umur wajib `1..umur_manfaat_bulan` jika nilai buku masih di atas nilai
  residu.
- Sisa umur boleh `0` hanya jika akumulasi awal sudah sama dengan nilai
  tersusutkan.
- Tidak ada run atau jurnal otomatis untuk periode sebelum tanggal saldo awal.

Rumus aset lama:

```text
sisa_nilai_tersusutkan = biaya_perolehan - nilai_residu - akumulasi_awal
beban_reguler = round(sisa_nilai_tersusutkan / sisa_umur_manfaat_bulan, 2)
```

Contoh:

```text
Biaya perolehan        Rp12.000.000
Nilai residu           Rp0
Akumulasi per 31 Maret Rp4.000.000
Sisa umur              8 bulan
Mulai dikelola aplikasi April 2026
Beban reguler          Rp1.000.000 per bulan
```

Saldo awal hanya membuat baseline subledger. User harus memastikan biaya
perolehan dan akumulasi awal sudah dicatat pada Opening Balance atau jurnal
manual General Ledger. Form dan detail aset menampilkan peringatan ini.

### Validasi Tanggal dan Nilai

- `acquisition_date <= available_for_use_date`.
- Biaya perolehan harus lebih besar dari nol.
- Nilai residu harus `>= 0` dan `< biaya perolehan`.
- Umur manfaat harus bilangan bulat positif.
- Aset baru tidak boleh memiliki tanggal saldo awal atau akumulasi awal.
- Aset lama wajib memiliki tanggal saldo awal dan tidak boleh memulai periode
  yang sudah `CLOSED`.
- Jika tanggal yang dihasilkan berada sebelum atau di dalam periode terakhir
  yang sudah ditutup, user harus memperbarui baseline aset lama sampai akhir
  periode tertutup terakhir.
- Semua operasi uang dibulatkan dua desimal dengan helper yang sama pada preview,
  service, journal, export, dan test.
- Nilai buku tidak boleh menjadi negatif atau lebih rendah dari nilai residu.

### Akun General Ledger

Setiap aset menyimpan tiga pilihan akun berikut beserta snapshot kode dan nama:

| Akun | Syarat |
| --- | --- |
| Akun aset tetap | `ASSET`, normal `DEBIT`, aktif, postable |
| Akumulasi penyusutan | `ASSET`, normal `CREDIT`, aktif, postable |
| Beban penyusutan | `EXPENSE`, normal `DEBIT`, aktif, postable |

- Jangan mengandalkan kode akun tertentu karena user dapat memakai COA kustom.
- Picker hanya menampilkan akun valid dan dapat dicari berdasarkan kode/nama.
- Jika akun prasyarat tidak tersedia, tampilkan blocking empty state dengan link
  ke `/finance/chart-of-accounts`.
- Akun dan dimensi disalin ke run line. Perubahan akun aset hanya berlaku untuk
  run berikutnya dan tidak mengubah jurnal historis.

Base project saat ini membentuk normal balance seluruh akun `ASSET` sebagai
`DEBIT`, termasuk template `accumulated-depreciation`. Implementasi wajib:

1. Mengizinkan helper template menerima override `normal_balance`.
2. Menetapkan seluruh template akun Akumulasi Penyusutan sebagai `CREDIT`.
3. Memastikan template relevan mempunyai akun Beban Penyusutan yang postable.
4. Melakukan migrasi aman hanya terhadap akun Akumulasi Penyusutan yang
   `is_system=true` dan masih salah `DEBIT`.
5. Tidak mengubah akun kustom secara otomatis; akun kustom yang salah ditahan
   oleh precheck dan diperbaiki user dari Daftar Akun.

### Jurnal Posting

Posting satu run menghasilkan satu `JournalEntry` dengan:

```text
source_type   = FIXED_ASSET_DEPRECIATION
source_id     = depreciation_run.id
source_number = depreciation_run.run_number
source_event  = DEPRECIATION_RUN_POSTED
entry_date    = accounting_period.end_date
description   = Penyusutan aset periode <nama periode>
```

Run line dikelompokkan berdasarkan kombinasi:

```text
depreciation_expense_account_id
accumulated_depreciation_account_id
department_id
project_id
```

Untuk setiap kelompok:

```text
Debit  Beban Penyusutan       total kelompok
Kredit Akumulasi Penyusutan   total kelompok
```

- Kedua sisi line membawa department/project yang sama.
- `total_debit`, `total_credit`, dan `run.total_depreciation` harus sama.
- Posting tidak membuat transaksi kas, payment, `financeTransactions`, atau
  perubahan `financeBalance`.
- Jurnal langsung dibaca report General Ledger yang ada sehingga tidak perlu
  menambahkan logika khusus pada Laba Rugi dan Neraca.

### Guard General Ledger

Helper `isGeneralLedgerPostingEnabled` saat ini bergantung pada inventory policy
`PERPETUAL_INVENTORY`. Ketergantungan tersebut tidak boleh dipakai untuk
penyusutan karena penyusutan bukan transaksi persediaan.

Buat guard nonkas yang memeriksa:

- module `GENERAL_LEDGER` aktif;
- `generalLedgerSetting.is_ready=true`;
- tanggal posting tidak sebelum cutoff;
- terdapat accounting period bulanan untuk tanggal tersebut;
- status periodenya `OPEN`;
- akun jurnal masih aktif dan postable.

Guard tidak memeriksa `inventory_policy`.

## Lifecycle Aset

Status tampilan aset dihitung, bukan dipilih bebas oleh user:

| Status | Kondisi |
| --- | --- |
| `NOT_STARTED` | Aktif dan periode mulai penyusutan belum tiba |
| `DEPRECIATING` | Aktif, sudah mulai, dan nilai buku di atas residu |
| `FULLY_DEPRECIATED` | Akumulasi sama dengan nilai tersusutkan |
| `ARCHIVED` | `is_active=false` |

### Create

- Kode aset wajib unik tanpa membedakan huruf besar/kecil dan disimpan uppercase.
- Asset baru default `is_active=true`.
- Create tidak membuat jurnal pengakuan aset.
- Activity log: `FIXED_ASSET_CREATED`.

### Edit

Sebelum ada run posted, seluruh field boleh diedit selama tetap valid. Setelah
ada run posted:

- biaya perolehan, nilai residu, umur manfaat, tanggal perolehan, tanggal siap
  digunakan, mode registrasi, saldo awal, dan sisa umur dikunci;
- nama, lokasi, deskripsi, kategori, akun untuk periode berikutnya, department,
  dan project boleh diedit;
- perubahan menghasilkan activity log `FIXED_ASSET_UPDATED`;
- perubahan estimasi prospektif bukan bagian MVP dan tidak boleh disimulasikan
  dengan mengubah field yang dikunci.

### Archive dan Restore

- Archive hanya diizinkan jika aset belum mempunyai run posted atau sudah
  `FULLY_DEPRECIATED`.
- Aset dengan nilai buku di atas residu dan riwayat posted ditolak karena
  menghentikan penyusutan memerlukan proses disposal yang belum ada.
- Aset archived tidak ikut draft baru dan tetap tampil bila filter Archived/All
  dipilih.
- Restore aset tanpa riwayat posted ditolak jika akan menciptakan kewajiban
  penyusutan pada periode yang sudah `CLOSED`; user harus memperbarui baseline
  aset lama terlebih dahulu.
- Activity log: `FIXED_ASSET_ARCHIVED` dan `FIXED_ASSET_RESTORED`.

## Lifecycle Depreciation Run

Status run:

```ts
type FixedAssetDepreciationRunStatus = 'DRAFT' | 'POSTED' | 'REVERSED';
```

Nomor run memakai format `DEP-YYYYMM-NNNN`, misalnya `DEP-202607-0001`.

### Membuat Draft

1. User memilih accounting period bulanan `OPEN`.
2. Sistem memastikan periodenya adalah periode tertunggak paling awal.
3. Sistem memilih seluruh aset aktif yang eligible dan belum mempunyai line
   posted pada periode tersebut.
4. Sistem menghitung line secara deterministik dan menampilkan preview.
5. User menekan **Buat Draft** untuk menyimpan run dan line sebagai snapshot.

Line tidak dapat ditambah, dihapus, atau diubah manual. Jika ada kesalahan, user
harus menghapus draft, memperbaiki master aset, lalu membuat ulang draft.

Maksimal satu run non-deleted berstatus `DRAFT` atau `POSTED` untuk satu
`period_id`. Run `REVERSED` dipertahankan sehingga run koreksi dapat dibuat
dengan nomor baru.

### Posting

Posting wajib berjalan dalam satu transaksi Dexie yang mencakup:

- `fixedAssetDepreciationRuns`;
- `fixedAssetDepreciationRunLines`;
- `journalEntries`;
- `journalEntryLines`;
- `activityLogs`.

Sebelum menulis data, service menghitung ulang signature draft dan memastikan:

- semua aset dan akun masih valid;
- periodenya masih `OPEN`;
- tidak ada run aktif lain untuk periode yang sama;
- tidak ada jurnal posted dengan source run tersebut;
- total draft masih sama dengan jumlah line.

Jika jurnal source sudah ada dan signature sama, kembalikan hasil yang ada agar
posting idempotent. Jika signature berbeda, hentikan dengan error dan jangan
menulis sebagian data.

Setelah berhasil:

- run menjadi `POSTED`;
- simpan `posted_at`, `posted_by`, `posted_by_name`, dan `journal_entry_id`;
- jurnal dan run ditandai pending sync;
- activity log `FIXED_ASSET_DEPRECIATION_POSTED` dibuat.

### Reversal

- Hanya run posted terakhir secara kronologis yang boleh dibalik.
- Accounting period terkait harus kembali `OPEN`.
- Service membuat jurnal lawan dengan tanggal akhir periode dan
  `source_event=DEPRECIATION_RUN_REVERSED`.
- Run menjadi `REVERSED` dan menyimpan `reversal_journal_entry_id`, actor, waktu,
  serta alasan wajib.
- Jurnal asli tetap ada dan mengikuti status/reversal convention General Ledger.
- Setelah reversal, run baru untuk periode yang sama boleh dibuat.
- Activity log: `FIXED_ASSET_DEPRECIATION_REVERSED`.

## Accounting Period dan Tutup Buku

- Draft dan posting hanya tersedia untuk period type `MONTHLY` berstatus `OPEN`.
- Periode `LOCKED` atau `CLOSED` menolak create draft, regenerate, posting, dan
  reversal.
- User harus memposting penyusutan sebelum mengunci periode.
- Jika periode sudah terkunci tetapi penyusutan belum lengkap, closing precheck
  meminta user membuka lock, posting penyusutan, lalu mengunci kembali.

Tambahkan blocking precheck `fixed_asset_depreciation_posted` pada closing:

- precheck dianggap lolos jika module `FIXED_ASSET` nonaktif;
- precheck dianggap lolos jika tidak ada aset eligible;
- jika ada aset eligible, harus ada run `POSTED` yang mencakup seluruh asset ID
  eligible pada periode tersebut;
- draft, run reversed, atau posted run yang kehilangan aset eligible tidak
  memenuhi precheck.

Jika aset baru ditambahkan untuk periode yang sudah memiliki run posted tetapi
belum ditutup, user harus reversal run terakhir dan membuat ulang run. Jika
periode sudah `CLOSED`, create aset harus memakai baseline setelah periode
tertutup terakhir sehingga tidak mengubah histori.

## Desain Halaman

### Navigasi

- Tambahkan kartu **Aset Tetap** pada `/master-data`.
- Deskripsi: “Kelola nilai perolehan, jadwal, dan posting penyusutan aset tetap.”
- Gunakan ikon yang konsisten dengan landing Master Data, misalnya `Building2`.
- Route file: `src/routes/master-data/fixed-assets.lazy.tsx`.
- Tidak perlu menambahkan submenu sidebar baru karena base project menavigasikan
  submodule Master Data melalui landing card.

### Layout Utama

Ikuti struktur card CRUD `ProjectManagement`, lalu gunakan pola summary dan
advanced filter `AccountsReceivableManagement` di dalam card:

```text
Container: space-y-4 p-3 sm:p-4 md:p-6

Card shadow-md
  Title + icon
  Extra: tombol Tambah Aset / Buat Draft sesuai tab

  Summary cards

  Tabs
    Daftar Aset
    Proses Penyusutan

  Filter bar/card
  Table
Modal/Drawer
```

- Desktop dan tablet menggunakan tabel dengan `scroll.x`.
- Mobile tetap memakai tabel responsif; tombol aksi boleh menjadi icon/overflow
  agar tidak memaksa lebar layar.
- Loading, disabled state, empty state, dan error notification mengikuti Ant
  Design `App.useApp()`.

### Summary Cards

Empat kartu menghitung data sesuai filter status aktif, bukan pagination:

1. Total biaya perolehan.
2. Total akumulasi penyusutan.
3. Total nilai buku.
4. Penyusutan periode aktif/terpilih, dengan indikator Posted atau Belum Posted.

Jumlah summary selalu berasal dari helper kalkulasi yang sama dengan tabel dan
run agar tidak terjadi selisih.

### Tab Daftar Aset

Filter bar:

- Input search kode, nama, dan lokasi.
- Tombol **Filter** dengan jumlah filter aktif.
- Tombol **Reset**.

Filter modal:

- kategori;
- status turunan;
- aktif/arsip/all;
- department;
- project;
- rentang tanggal siap digunakan;
- akun aset.

Kolom tabel:

| Kolom | Perilaku |
| --- | --- |
| Kode / Nama | Fixed kiri, nama tebal, lokasi sebagai teks sekunder |
| Kategori | Tag terjemahan |
| Siap Digunakan | Format tanggal lokal |
| Biaya Perolehan | Rata kanan, base currency |
| Akumulasi | Rata kanan |
| Nilai Buku | Rata kanan dan tebal |
| Beban Reguler | Rata kanan |
| Status | Tag warna konsisten |
| Aksi | Detail, Edit, Archive/Restore |

Gunakan pagination `{ pageSize: 10, showSizeChanger: true }`, `rowKey="id"`,
empty state terjemahan, dan horizontal scroll.

### Form Aset

Gunakan modal lebar sekitar 820–900 px, `layout="vertical"`, `requiredMark=false`,
dan grid satu kolom di mobile serta dua/tiga kolom mulai breakpoint `md`.

Bagian **Identitas**:

- kode aset;
- nama aset;
- kategori;
- lokasi;
- deskripsi.

Bagian **Nilai dan Kebijakan**:

- mode `NEW | EXISTING`;
- tanggal perolehan;
- tanggal siap digunakan;
- biaya perolehan;
- nilai residu;
- umur manfaat bulan;
- metode read-only `Garis Lurus`;
- preview mulai penyusutan, beban reguler, dan estimasi selesai.

Bagian **Saldo Awal**, hanya mode `EXISTING`:

- tanggal saldo awal;
- akumulasi penyusutan awal;
- sisa umur manfaat;
- preview nilai buku awal;
- peringatan bahwa jurnal saldo awal harus sudah dicatat terpisah.

Bagian **Akun dan Dimensi**:

- akun aset;
- akun akumulasi penyusutan;
- akun beban penyusutan;
- department opsional;
- project opsional;
- switch aktif hanya ditampilkan pada create atau aset tanpa posting.

### Detail Aset

Gunakan Drawer atau modal detail lebar dengan:

- `Descriptions` identitas dan kebijakan;
- tiga nilai utama: biaya, akumulasi, nilai buku;
- akun dan dimensi;
- tabel jadwal yang menggabungkan periode lalu dan proyeksi berikutnya;
- tabel riwayat run dengan link ke jurnal;
- badge peringatan bila nilai baseline subledger belum direkonsiliasi secara
  manual dengan GL.

### Tab Proses Penyusutan

Filter bar:

- search nomor run atau nama periode;
- status `ALL | DRAFT | POSTED | REVERSED`;
- rentang periode;
- tombol reset.

Kolom tabel:

| Kolom | Isi |
| --- | --- |
| Nomor Run | Link membuka detail |
| Periode | Nama dan rentang tanggal |
| Jumlah Aset | Jumlah line |
| Total Penyusutan | Base currency, rata kanan |
| Status | Tag |
| Jurnal | Nomor jurnal atau `-` |
| Dibuat / Diposting | Actor dan waktu |
| Aksi | Detail, Posting, Hapus Draft, Reversal |

Detail run menampilkan precheck, totals, daftar line, akun/dimensi snapshot,
link jurnal, audit metadata, dan `ExportActions`.

## Kontrak Data

### Enum

```ts
export type FixedAssetCategory =
  | 'BUILDING'
  | 'VEHICLE'
  | 'MACHINERY_EQUIPMENT'
  | 'OFFICE_EQUIPMENT'
  | 'FURNITURE'
  | 'OTHER';

export type FixedAssetRegistrationType = 'NEW' | 'EXISTING';
export type FixedAssetDepreciationMethod = 'STRAIGHT_LINE';
export type FixedAssetDepreciationRunStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export type FixedAssetDerivedStatus =
  | 'NOT_STARTED'
  | 'DEPRECIATING'
  | 'FULLY_DEPRECIATED'
  | 'ARCHIVED';
```

Tambahkan `'FIXED_ASSET_DEPRECIATION'` ke `JournalSourceType`.

### FixedAsset

```ts
export interface FixedAsset {
  id: string;
  asset_code: string;
  name: string;
  category: FixedAssetCategory;
  location?: string;
  description?: string;

  registration_type: FixedAssetRegistrationType;
  acquisition_date: string;
  available_for_use_date: string;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  depreciation_method: 'STRAIGHT_LINE';
  depreciation_start_date: string;
  regular_depreciation_amount: number;

  opening_balance_date?: string;
  opening_accumulated_depreciation: number;
  opening_remaining_useful_life_months?: number;

  asset_account_id: string;
  asset_account_code: string;
  asset_account_name: string;
  accumulated_depreciation_account_id: string;
  accumulated_depreciation_account_code: string;
  accumulated_depreciation_account_name: string;
  depreciation_expense_account_id: string;
  depreciation_expense_account_code: string;
  depreciation_expense_account_name: string;

  department_id?: string;
  department_code?: string;
  department_name?: string;
  project_id?: string;
  project_code?: string;
  project_name?: string;

  is_active: boolean;
  version: number;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

`depreciation_start_date` dan `regular_depreciation_amount` dihitung service dan
disimpan agar kebijakan yang digunakan dapat diaudit. UI tidak mengirim kedua
nilai tersebut sebagai input bebas.

### FixedAssetDepreciationRun

```ts
export interface FixedAssetDepreciationRun {
  id: string;
  run_number: string;
  period_id: string;
  period_name: string;
  period_start: string;
  period_end: string;
  posting_date: string;
  status: FixedAssetDepreciationRunStatus;
  asset_count: number;
  total_depreciation: number;
  journal_entry_id?: string;
  reversal_journal_entry_id?: string;
  reversal_reason?: string;
  notes?: string;
  version: number;
  created_by?: string;
  created_by_name?: string;
  posted_by?: string;
  posted_by_name?: string;
  posted_at?: string;
  reversed_by?: string;
  reversed_by_name?: string;
  reversed_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}
```

### FixedAssetDepreciationRunLine

```ts
export interface FixedAssetDepreciationRunLine {
  id: string;
  run_id: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  asset_category: FixedAssetCategory;

  acquisition_cost: number;
  residual_value: number;
  regular_depreciation_amount: number;
  opening_accumulated_depreciation: number;
  opening_book_value: number;
  depreciation_amount: number;
  closing_accumulated_depreciation: number;
  closing_book_value: number;

  asset_account_id: string;
  asset_account_code: string;
  asset_account_name: string;
  accumulated_depreciation_account_id: string;
  accumulated_depreciation_account_code: string;
  accumulated_depreciation_account_name: string;
  depreciation_expense_account_id: string;
  depreciation_expense_account_code: string;
  depreciation_expense_account_name: string;

  department_id?: string;
  department_code?: string;
  department_name?: string;
  project_id?: string;
  project_code?: string;
  project_name?: string;
  created_at: string;
}
```

Line tidak mempunyai sync status sendiri karena selalu disinkronkan sebagai
bundle milik run.

## Database Lokal

Current Dexie schema terakhir saat dokumen dibuat adalah `v101`. Tambahkan
`v102` dengan tiga table property pada `KasirkuDB` dan schema berikut:

```ts
fixedAssets:
  'id, &asset_code, name, category, is_active, available_for_use_date, asset_account_id, department_id, project_id, updated_at, sync_status'

fixedAssetDepreciationRuns:
  'id, &run_number, period_id, status, period_start, period_end, posting_date, journal_entry_id, updated_at, sync_status'

fixedAssetDepreciationRunLines:
  'id, run_id, asset_id, [run_id+asset_id]'
```

Aturan unik run per periode tidak cukup diwakili index Dexie karena run reversed
harus tetap tersimpan. Service wajib memeriksa bahwa hanya ada satu run
non-deleted `DRAFT` atau `POSTED` per `period_id` dalam transaksi yang sama.

Upgrade `v102` juga boleh memperbaiki `normal_balance` menjadi `CREDIT` hanya
untuk akun Akumulasi Penyusutan sistem yang dikenali secara deterministik.

## PostgreSQL dan Tauri

Current migration terakhir saat dokumen dibuat adalah `0060`. Tambahkan
`0061_fixed_asset_depreciation.sql` dengan tabel yang setara.

Ketentuan database remote:

- `asset_code` unik secara case-insensitive untuk row yang belum soft-deleted.
- `run_number` unik.
- Partial unique index menjamin satu run `DRAFT` atau `POSTED` per period.
- Unique `(run_id, asset_id)` pada run lines.
- Run line boleh mempunyai foreign key cascade ke run.
- Referensi ke asset, period, department, project, dan journal berupa `TEXT`
  tanpa hard foreign key agar urutan upload offline tidak menggagalkan sync.
- Tambahkan index status, tanggal, account ID, department, project, `updated_at`,
  dan `deleted_at` sesuai kebutuhan filter/sync.
- Ketiga tabel didaftarkan pada trigger realtime dan allow-list database pool.

Tambahkan model/DTO Rust, repository list/upsert bundle, Tauri command, registrasi
command, DTO TypeScript, dan adapter PostgreSQL mengikuti pola Project, Payroll,
serta Journal Entry.

## Service dan Data Flow

### Struktur yang Disarankan

```text
src/routes/master-data/
  fixed-assets.lazy.tsx

src/view/master-data/fixed-assets/
  FixedAssetManagement.tsx
  FixedAssetSummary.tsx
  FixedAssetTable.tsx
  FixedAssetFormModal.tsx
  FixedAssetFilterModal.tsx
  FixedAssetDetailDrawer.tsx
  DepreciationRunTable.tsx
  DepreciationRunDetailModal.tsx

src/hooks/
  useFixedAssets.tsx
  useFixedAssetDepreciationRuns.tsx

src/services/
  fixedAssetService.ts
  fixedAssetReadService.ts

src/lib/validations/
  fixedAsset.ts

src/utils/fixedAssets/
  calculateDepreciation.ts
  buildDepreciationRun.ts
  fixedAssetExport.ts
```

Nama komponen dapat digabung jika implementasinya kecil, tetapi tanggung jawab
calculation, validation, mutation, read/sync, orchestration React, dan rendering
tidak boleh dicampur.

### Calculation Utility

Utility harus murni dan tidak mengakses Dexie. Kontrak minimum:

```ts
calculateFixedAssetPolicy(input): {
  depreciationStartDate: string;
  regularDepreciationAmount: number;
  depreciableAmount: number;
}

calculateFixedAssetPosition(asset, postedLines, asOfDate): {
  accumulatedDepreciation: number;
  bookValue: number;
  remainingDepreciableAmount: number;
  derivedStatus: FixedAssetDerivedStatus;
}

calculateDepreciationForPeriod(asset, postedLines, period): {
  eligible: boolean;
  depreciationAmount: number;
  openingAccumulatedDepreciation: number;
  openingBookValue: number;
  closingAccumulatedDepreciation: number;
  closingBookValue: number;
}
```

Seluruh caller memakai utility yang sama. Dilarang menyalin rumus ke komponen,
export, summary, atau journal service.

### Mutation Service

Kontrak minimum:

```ts
createFixedAsset(input)
updateFixedAsset(id, input)
archiveFixedAsset(id)
restoreFixedAsset(id)

previewDepreciationRun(periodId)
createDepreciationRunDraft(periodId, notes?)
deleteDepreciationRunDraft(runId)
postDepreciationRun(runId)
reverseDepreciationRun(runId, reason)
```

Semua mutation:

- mengambil current session user;
- memeriksa permission pada service, bukan hanya UI;
- menjalankan Zod validation;
- menormalisasi kode/string;
- memakai transaksi Dexie untuk operasi lintas tabel;
- menulis activity log;
- menaikkan version dan menandai pending sync;
- tidak mengandalkan state komponen sebagai sumber kebenaran.

### Hook

Hook memakai `useLiveQuery` untuk data lokal dan React Query mutation untuk aksi.
Hook bertanggung jawab atas state filter/editing/modal dan invalidation, tetapi
tidak menulis Dexie langsung.

Filter dan summary dihitung dengan `useMemo`. Data diurutkan:

- aset: `asset_code` ascending sebagai default;
- run: `period_end` descending, lalu `created_at` descending.

## Sinkronisasi

Tambahkan dua entity sync:

- `fixedAssets` untuk satu asset record;
- `fixedAssetDepreciationRuns` untuk bundle run dan seluruh lines.

Aturan:

- Asset menggunakan create/update/delete-soft semantics, version, actor, dan
  `updated_at` seperti entity accounting lain.
- Run bundle meng-upsert header lalu mengganti lines dalam satu transaksi remote.
- Journal tetap memakai pipeline `journalEntries` yang sudah ada.
- Tidak ada foreign key keras dari run ke journal sehingga run boleh tiba lebih
  dulu tanpa gagal; refresh berikutnya akan melengkapi referensi yang sama.
- Enqueue seluruh record pending pada startup/retry, termasuk record yang dibuat
  sebelum queue berhasil ditulis.
- Read refresh mempertahankan local row dengan `sync_status=pending|failed`.
- Remote diterapkan jika local tidak mempunyai perubahan tertunda dan remote
  version lebih tinggi; untuk version sama gunakan `updated_at` terbaru.
- Refresh run mengganti lines hanya ketika header remote diterapkan.
- Upsert bersifat idempotent agar retry tidak membuat run, line, atau journal
  ganda.
- Daftarkan refresh dan enqueue pada `syncOrchestratorService`.

## Backup dan Restore

Tambahkan payload:

```text
fixedAssets
fixedAssetDepreciationRuns
fixedAssetDepreciationRunLines
```

- Naikkan versi payload backup dari `27` menjadi `28`.
- Ketiga tabel masuk expected keys, transaction table list, clear, dan bulk-add.
- Backup lama tanpa key tersebut tetap valid dan menghasilkan tiga tabel kosong.
- Restore mempertahankan urutan parent sebelum line.
- Setelah restore, accounting defaults dan koreksi metadata akun sistem tetap
  dijalankan melalui mekanisme ensure yang aman.

## Export

Gunakan `ExportActions` agar perilaku konsisten dengan report yang sudah ada.

### Register Aset

- Data yang diekspor mengikuti filter aktif, bukan hanya current page.
- Kolom: kode, nama, kategori, lokasi, tanggal perolehan, siap digunakan, biaya,
  residu, umur, mulai penyusutan, beban reguler, akumulasi, nilai buku, status,
  akun, department, dan project.
- Filename: `fixed-assets-YYYY-MM-DD`.

### Detail Run

- Kolom: nomor run, periode, kode/nama aset, opening book value, beban periode,
  closing accumulated depreciation, closing book value, akun, department, dan
  project.
- Filename: `fixed-asset-depreciation-YYYY-MM`.

## Validasi dan Pesan Error Utama

Gunakan pesan domain yang dapat langsung dipahami user, antara lain:

- “Kode aset sudah digunakan.”
- “Nilai residu harus lebih kecil dari biaya perolehan.”
- “Tanggal siap digunakan tidak boleh sebelum tanggal perolehan.”
- “Tanggal saldo awal harus merupakan akhir bulan.”
- “Akun akumulasi penyusutan harus berupa akun aset aktif, postable, dengan
  normal balance kredit.”
- “Periode belum dapat diposting karena General Ledger belum siap.”
- “Posting harus dimulai dari periode penyusutan tertunggak paling awal.”
- “Draft berubah sejak dibuat. Hapus dan buat ulang draft sebelum posting.”
- “Aset tidak dapat diarsipkan karena masih mempunyai nilai yang harus
  disusutkan.”
- “Run ini bukan run posted terakhir dan tidak dapat dibalik.”

Error service tidak boleh diganti menjadi pesan generic oleh hook. UI boleh
menambahkan judul notifikasi terjemahan, tetapi description memakai pesan domain
dari service.

## Test Plan

### Unit — Calculation

1. Aset Rp12.000.000, residu Rp0, umur 12 menghasilkan Rp1.000.000 selama 12
   bulan.
2. Aset Rp12.000.000, residu Rp2.000.000, umur 10 menghasilkan Rp1.000.000 dan
   berhenti pada nilai buku Rp2.000.000.
3. Aset siap 15 Januari baru eligible Februari.
4. Aset belum mencapai start date menghasilkan `eligible=false`.
5. Aset lama Rp12.000.000, akumulasi Rp4.000.000, sisa umur 8 menghasilkan
   Rp1.000.000 per bulan.
6. Nilai Rp100 selama 3 bulan menghasilkan Rp33,33, Rp33,33, dan Rp33,34.
7. Line terakhir tidak membuat nilai buku di bawah residu.
8. Posted line dihitung, reversed line dikeluarkan.
9. Aset fully depreciated tidak masuk run berikutnya.
10. Summary, schedule, preview, dan export memberikan angka yang sama.

### Unit — Validation

- biaya nol/negatif;
- residu negatif atau melebihi/sama dengan biaya;
- umur bukan integer positif;
- tanggal perolehan setelah tanggal siap digunakan;
- tanggal saldo awal bukan akhir bulan;
- saldo awal di atas nilai tersusutkan;
- sisa umur tidak valid;
- kode duplikat case-insensitive;
- account type, normal balance, active, dan postable tidak sesuai;
- baseline berada dalam periode closed;
- perubahan field terkunci setelah posting.

### Service dan Integrasi

- Create, edit, archive, dan restore menghasilkan actor/version/activity log yang
  benar.
- Draft menyimpan line snapshot dan tidak berubah ketika master aset diedit.
- Draft tidak dapat dibuat untuk periode non-monthly, locked, closed, atau bukan
  periode tertunggak paling awal.
- Hanya satu draft/posted aktif per periode.
- Posting dua kali menghasilkan satu jurnal dan satu perubahan status.
- Posting gagal atomik jika akun berubah menjadi nonaktif atau signature berbeda.
- Total debit, kredit, run, dan lines selalu sama.
- Posting tidak membuat `financeTransactions`.
- Reversal hanya untuk posted run terakhir dan menghasilkan jurnal lawan.
- Run reversed tidak menambah akumulasi aset.
- Closing precheck gagal bila ada aset eligible yang belum masuk posted run.
- Laba Rugi, Neraca, Trial Balance, dan Buku Besar membaca jurnal penyusutan
  dengan tanda yang benar.

### Sync dan Backup

- Pending local asset tidak ditimpa refresh remote.
- Remote version lebih baru diterapkan bersama bundle lines.
- Retry queue tidak menggandakan asset, run, line, atau journal.
- Run dapat tersinkron sebelum journal tanpa foreign-key error.
- Backup v28 round-trip mengembalikan semua data.
- Backup v27 tanpa tabel aset tetap tetap dapat direstore.
- Koreksi normal balance hanya menyentuh akun sistem yang ditargetkan.

### E2E

1. Owner mengaktifkan module, membuka Master Data, dan melihat kartu Aset Tetap.
2. User membuat aset baru, melihat preview kebijakan, lalu menemukannya melalui
   search dan filter.
3. User membuat aset lama dan nilai buku awal tampil benar tanpa jurnal baru.
4. User membuat draft periode paling awal, memeriksa detail, dan posting.
5. Nomor jurnal dapat dibuka dan laporan menunjukkan beban serta pengurang aset.
6. User mencoba menutup periode dengan penyusutan belum posted dan mendapat
   blocker.
7. User membuka kembali periode, membalik run terakhir, memperbaiki data, dan
   memposting run pengganti.
8. User tanpa permission tidak melihat kartu/route dan mutation service menolak
   akses langsung.
9. Layout, filter modal, tabel, dan form tetap dapat digunakan pada viewport
   mobile.

## Acceptance Criteria

- Tidak ada data aset tetap yang ditulis ke tabel produk atau stok.
- Nilai buku setiap aset selalu `>= nilai residu`.
- Total akumulasi hanya berasal dari opening balance dan run posted yang belum
  dibalik.
- Satu periode tidak dapat memiliki lebih dari satu draft/posted aktif.
- Posting dan reversal bersifat atomik serta idempotent.
- Jurnal penyusutan selalu seimbang dan tidak menyentuh saldo kas.
- Periode tidak dapat ditutup jika penyusutan wajib belum lengkap.
- Data posted tidak berubah ketika master aset diedit.
- Aset, run, lines, dan journal dapat dipulihkan dari backup serta disinkronkan
  tanpa duplikasi.
- Seluruh state UI mempunyai loading, empty, success, validation, dan error state
  terjemahan.
- Build, lint, unit test, dan E2E terkait lulus tanpa regresi pada General Ledger,
  closing, backup/restore, dan sync existing.

## Urutan Implementasi yang Direkomendasikan

1. Tambahkan type, enum, migration Dexie/PostgreSQL, dan koreksi template akun.
2. Implementasikan validation serta calculation utility beserta unit test.
3. Implementasikan asset/run service, journal posting, reversal, dan activity log.
4. Implementasikan repository, adapter, queue, read refresh, serta backup/restore.
5. Tambahkan module, permission, route, landing card, dan i18n.
6. Bangun UI register, form, detail, filter, run, dan export mengikuti komponen
   base project.
7. Tambahkan closing precheck dan verifikasi dampak pada seluruh report GL.
8. Jalankan integration test dan E2E, lalu lakukan accountant review atas
   konvensi bulan penuh sebelum release produksi.

## Risiko dan Batas Produksi

- Konvensi mulai bulan berikutnya adalah simplifikasi MVP. Jika dampaknya
  material bagi perusahaan, implementasikan prorata dari tanggal siap digunakan
  sebelum produksi.
- Onboarding aset lama dapat membuat subledger tidak sama dengan GL jika user
  belum mencatat saldo perolehan dan akumulasi secara benar. UI wajib menampilkan
  peringatan, tetapi rekonsiliasi otomatis berada di luar MVP.
- Perubahan umur manfaat/nilai residu setelah posting belum didukung. Jangan
  membuka field terkunci tanpa menambahkan revision history dan perhitungan
  prospektif.
- Disposal belum didukung sehingga aset yang belum fully depreciated tidak boleh
  diarsipkan sebagai cara menghentikan penyusutan.
- Normal balance akun Akumulasi Penyusutan yang salah pada template existing
  harus diselesaikan sebelum module boleh memposting jurnal pertama.
