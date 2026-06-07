# Tutorial Setup Awal dan Test Case Demo KSP

Dokumen ini disiapkan untuk presentasi project Kasirku modul Koperasi Simpan Pinjam kepada Owner KSU Madu Kenjacana.

Fokus demo:
- Setup awal aplikasi sampai Owner bisa login.
- Setup accounting dasar: Daftar Akun, mapping, saldo awal, dan General Ledger ready jika demo ingin menampilkan jurnal.
- Alur operasional KSP: anggota, simpanan, pinjaman, angsuran, laporan.
- Validasi bisnis yang penting untuk owner: data anggota aktif, simpanan pokok satu kali, penarikan hanya sukarela, pencairan pinjaman setelah approval, pembayaran angsuran tidak boleh melebihi tagihan.

Catatan penting:
- Aplikasi bersifat offline-first. Data demo tersimpan lokal di browser atau desktop app melalui IndexedDB `KasirkuDB`.
- Daftar Akun sudah menjadi bagian Finance. General Ledger default belum ready dan module `GENERAL_LEDGER` default belum aktif pada database baru.
- Demo operasional KSP tetap bisa berjalan tanpa GL. Jika ingin menampilkan jurnal otomatis, setup Daftar Akun, saldo awal, dan General Ledger lebih dulu melalui Finance > Daftar Akun dan Finance > General Ledger.
- Route Koperasi yang tersedia saat dokumen ini dibuat: `/koperasi`, `/koperasi/anggota`, `/koperasi/simpanan`, `/koperasi/pinjaman`, `/koperasi/angsuran`, `/koperasi/laporan`.

## 1. Setup Teknis Sebelum Presentasi

### 1.1. Prasyarat

Pastikan laptop demo sudah siap:

- Bun sudah terinstall.
- Dependency project sudah tersedia.
- Browser modern tersedia, misalnya Chrome atau Chromium.
- Untuk demo desktop Tauri, pastikan dependency Tauri di OS sudah siap. Untuk demo cepat, mode browser Vite sudah cukup.

### 1.2. Install dependency

Jalankan dari root project:

```bash
bun install
```

### 1.3. Jalankan aplikasi mode browser

```bash
bun run dev
```

Buka URL yang muncul di terminal. Default Vite biasanya:

```txt
http://localhost:5173
```

Jika port sudah dipakai, Vite akan menampilkan port lain. Pakai URL yang ditampilkan terminal.

### 1.4. Jalankan aplikasi mode desktop, opsional

Jika presentasi ingin menunjukkan bentuk desktop app:

```bash
bun run tauri dev
```

Gunakan mode ini jika dependency Tauri di laptop sudah stabil. Untuk presentasi owner, browser demo biasanya lebih cepat dan cukup aman.

### 1.5. Validasi sebelum demo

Jalankan validasi minimal:

```bash
bun run build
bun run lint
git diff --check
```

Jika hanya presentasi dan waktu terbatas, minimal pastikan `bun run dev` berhasil membuka aplikasi dan alur demo utama bisa dijalankan dari awal sampai laporan.

### 1.6. Data demo bersih, opsional

Jika ingin mulai dari database kosong:

1. Buka browser yang dipakai demo.
2. Buka DevTools.
3. Masuk ke Application > IndexedDB.
4. Hapus database `KasirkuDB`.
5. Refresh aplikasi.

Jangan lakukan ini pada browser atau device yang menyimpan data penting.

## 2. Setup Awal di Aplikasi

### 2.1. Register Owner pertama

Kondisi awal: belum ada user aktif.

Langkah:

1. Buka aplikasi.
2. Pada halaman Masuk Kasirku, klik `Register Owner Pertama`.
3. Isi:

| Field | Contoh isi |
| --- | --- |
| Nama Owner | Owner KSU Madu Kenjacana |
| PIN | 123456 |
| Konfirmasi PIN | 123456 |

4. Klik `Simpan Owner`.
5. Aplikasi akan membuat Owner dan login otomatis.

Catatan demo:
- PIN contoh hanya untuk presentasi.
- Jika data demo akan dipakai lanjut, ganti PIN sesuai kebijakan owner.

### 2.2. Login ulang

Langkah:

1. Klik tombol logout di kanan atas.
2. Pada halaman login, pastikan user aktif muncul.
3. Masukkan PIN.
4. Klik `Masuk`.

Expected result:
- User berhasil masuk.
- Sidebar/menu utama tampil.
- Menu `Koperasi` bisa diakses oleh Owner.

### 2.3. Cek menu Koperasi

Buka menu `Koperasi`.

Menu yang perlu terlihat:

| Menu | Fungsi demo |
| --- | --- |
| Overview | Ringkasan pintu masuk modul Koperasi |
| Anggota | Master anggota KSP |
| Simpanan | Setoran, penarikan, saldo simpanan |
| Pinjaman | Pengajuan, approval, pencairan pinjaman |
| Angsuran | Jadwal angsuran dan pembayaran |
| Laporan | Ringkasan, rekonsiliasi, cash-bank, jurnal, ledger, neraca, laba rugi |

### 2.4. Cek Daftar Akun

Lewati bagian ini jika demo hanya fokus operasional KSP tanpa jurnal. Jika owner ingin melihat akuntansi/jurnal, lakukan setup accounting sebelum transaksi KSP pertama.

Langkah:

1. Buka Finance > Daftar Akun.
2. Pastikan tab `Daftar Akun` tampil.
3. Cari akun default yang diperlukan untuk demo KSP:

| Kode | Nama akun | Tipe | Dipakai untuk |
| --- | --- | --- | --- |
| 1010 | Kas Tunai | ASSET | Setoran, penarikan, pencairan, pembayaran tunai |
| 1020 | Bank / Non Tunai | ASSET | Transaksi non tunai |
| 1120 | Piutang Pinjaman Anggota | ASSET | Pencairan dan pelunasan pokok pinjaman |
| 2300 | Simpanan Anggota | LIABILITY | Kewajiban simpanan pokok, wajib, sukarela |
| 3000 | Modal Pemilik | EQUITY | Penyeimbang saldo awal demo |
| 4040 | Pendapatan Bunga Pinjaman Anggota | REVENUE | Bunga angsuran |
| 4050 | Pendapatan Denda Pinjaman Anggota | REVENUE | Denda angsuran jika ada |

Expected result:
- Akun-akun default tampil, aktif, dan bisa dipakai transaksi.
- Jika akun tidak ada, gunakan `Apply Template` di tab `Mapping & Template` atau buat akun manual dengan tipe yang sesuai.

### 2.5. Cek mapping dan module accounting

Langkah:

1. Masih di Finance > Daftar Akun, buka tab `Mapping & Template`.
2. Pastikan profile demo memakai `SAK EMKM` dan extension `Retail`.
3. Jika ada warning akun/template belum lengkap, klik `Apply Template`.
4. Pastikan kategori KSP sudah mengarah ke akun yang tepat:

| Kategori | Akun yang diharapkan |
| --- | --- |
| KSP_SETORAN_SIMPANAN | 2300 - Simpanan Anggota |
| KSP_PENARIKAN_SIMPANAN | 2300 - Simpanan Anggota |
| KSP_PENCAIRAN_PINJAMAN | 1120 - Piutang Pinjaman Anggota |
| KSP_PEMBAYARAN_ANGSURAN | 1000 - Kas dan Bank atau akun kas/bank terkait |

5. Biarkan module `GENERAL_LEDGER` belum aktif sampai opening balance selesai diposting.

Expected result:
- Mapping health tidak menunjukkan blocker untuk akun inactive atau akun header non-postable.
- Akun KSP tersedia sebelum transaksi anggota, simpanan, pinjaman, dan angsuran dimulai.

Catatan:
- Daftar Akun adalah master akun. Cash & Bank tetap memakai Finance > Cash & Bank.
- General Ledger adalah jurnal debit/kredit. Jangan membuat ledger baru di modul Koperasi.
- Jika hanya demo operasional, cukup pastikan mapping tidak menghalangi transaksi; module `GENERAL_LEDGER` boleh tetap off.

### 2.6. Posting saldo awal General Ledger

Lakukan bagian ini jika demo ingin menampilkan jurnal, buku besar, trial balance, laba rugi, atau neraca.

Langkah:

1. Buka Finance > General Ledger.
2. Pada panel `Setup Cutoff dan Opening Balance`, isi tanggal cutoff.
3. Pilih policy persediaan:
   - `Perpetual Inventory` jika ingin mengikuti default accounting retail.
   - `Cash-flow Only` jika demo tidak membahas persediaan dan ingin penjelasan lebih sederhana.
4. Isi saldo awal akun. Untuk demo KSU Madu Kenjacana yang sederhana, gunakan contoh:

| Kode | Akun | Debit | Kredit |
| --- | --- | ---: | ---: |
| 1010 | Kas Tunai | Rp 5.000.000 | Rp 0 |
| 1020 | Bank / Non Tunai | Rp 10.000.000 | Rp 0 |
| 3000 | Modal Pemilik | Rp 0 | Rp 15.000.000 |

5. Pastikan total debit dan kredit balance.
6. Klik `Post Opening Balance`.

Expected result:
- Cutoff ledger tersimpan.
- Opening balance journal terbuat.
- Prasyarat readiness General Ledger terpenuhi.
- Trial balance setelah module `GENERAL_LEDGER` aktif akan balance jika hanya opening balance yang ada.

Catatan:
- Cutoff sebaiknya tanggal hari demo atau tanggal sebelum transaksi KSP demo pertama.
- Transaksi sebelum cutoff tetap dianggap legacy cash-flow dan tidak menjadi dasar laporan ledger.
- Setelah opening balance diposting, cutoff tidak boleh diubah tanpa reset/reversal ledger eksplisit.
- Jika total debit dan kredit tidak balance, tombol posting tidak bisa dipakai.

### 2.7. Aktifkan General Ledger

Langkah:

1. Buka Finance > Daftar Akun.
2. Buka tab `Mapping & Template`.
3. Di panel `Module Activation`, aktifkan `GENERAL LEDGER`.
4. Kembali ke Finance > General Ledger.
5. Pastikan status `Readiness` menjadi `Siap`.
6. Pastikan laporan/tabs General Ledger tampil: `Jurnal`, `Buku Besar`, `Trial Balance`, `Laba Rugi`, `Neraca`.

Expected result:
- General Ledger siap menerima jurnal otomatis dari transaksi setelah cutoff.
- Transaksi KSP setelah cutoff dapat membuat jurnal otomatis jika service posting KSP berhasil.

Catatan:
- Jika status masih `Belum Siap`, baca warning readiness di halaman General Ledger: biasanya cutoff, opening balance, mapping, atau module activation belum lengkap.
- Jika demo tidak membahas jurnal, bagian 2.4 sampai 2.7 boleh dijelaskan sebagai opsional dan dilewati.

## 3. Data Demo yang Disarankan

Gunakan data sederhana supaya owner mudah mengikuti angka.

### 3.1. Saldo awal accounting, jika GL didemokan

Gunakan saldo awal kecil dan balance:

| Kode akun | Akun | Debit | Kredit |
| --- | --- | ---: | ---: |
| 1010 | Kas Tunai | Rp 5.000.000 | Rp 0 |
| 1020 | Bank / Non Tunai | Rp 10.000.000 | Rp 0 |
| 3000 | Modal Pemilik | Rp 0 | Rp 15.000.000 |
| Total |  | Rp 15.000.000 | Rp 15.000.000 |

Cutoff ledger:

```txt
Tanggal hari demo atau tanggal sebelum transaksi KSP pertama.
```

Expected setelah posting:

| Laporan | Expected |
| --- | --- |
| Trial Balance | Total debit = total kredit |
| Buku Besar Kas Tunai | Opening debit Rp 5.000.000 |
| Buku Besar Bank / Non Tunai | Opening debit Rp 10.000.000 |
| Neraca | Aset = Liabilitas + Ekuitas |

### 3.2. Anggota

| Nomor Anggota | Nama | NIK | No HP | Status |
| --- | --- | --- | --- | --- |
| KSU-001 | Siti Aminah | 3271010101010001 | 081234567001 | ACTIVE |
| KSU-002 | Budi Hartono | 3271010101010002 | 081234567002 | ACTIVE |
| KSU-003 | Nursalim | 3271010101010003 | 081234567003 | ACTIVE |

### 3.3. Simpanan untuk Siti Aminah

| Jenis | Tipe transaksi | Nominal |
| --- | --- | ---: |
| POKOK | DEPOSIT | Rp 500.000 |
| WAJIB | DEPOSIT | Rp 100.000 |
| SUKARELA | DEPOSIT | Rp 300.000 |
| SUKARELA | WITHDRAWAL | Rp 100.000 |

Expected saldo akhir Siti Aminah:

| Jenis simpanan | Saldo |
| --- | ---: |
| POKOK | Rp 500.000 |
| WAJIB | Rp 100.000 |
| SUKARELA | Rp 200.000 |
| Total | Rp 800.000 |

Jika GL ready, jurnal utama yang diharapkan:

| Transaksi | Debit | Kredit |
| --- | --- | --- |
| Setoran simpanan | Kas/Bank | Simpanan Anggota |
| Penarikan sukarela | Simpanan Anggota | Kas/Bank |

### 3.4. Pinjaman untuk Budi Hartono

| Field | Nilai |
| --- | --- |
| Pokok pinjaman | Rp 3.000.000 |
| Bunga flat per bulan | 1% |
| Tenor | 6 bulan |
| Total bunga | Rp 180.000 |
| Total tagihan | Rp 3.180.000 |
| Angsuran per bulan | Rp 530.000 |

Rumus:

```txt
total_bunga = pokok_pinjaman * bunga_per_bulan * tenor
total_tagihan = pokok_pinjaman + total_bunga
angsuran_bulanan = total_tagihan / tenor
```

Jika GL ready, jurnal utama yang diharapkan:

| Transaksi | Debit | Kredit |
| --- | --- | --- |
| Pencairan pinjaman | Piutang Pinjaman Anggota | Kas/Bank |
| Pembayaran angsuran | Kas/Bank | Piutang Pinjaman Anggota, Pendapatan Bunga Pinjaman Anggota, Pendapatan Denda jika ada |

## 4. Urutan Demo yang Direkomendasikan

Gunakan urutan ini agar cerita presentasi mengalir:

1. Register Owner pertama dan login.
2. Jika ingin menampilkan jurnal, setup Daftar Akun, mapping, saldo awal, dan aktifkan General Ledger.
3. Buka Finance > General Ledger dan tunjukkan status `Siap`.
4. Buka menu Koperasi dan jelaskan bahwa modul ini khusus back-office KSP.
5. Tambah anggota.
6. Catat simpanan pokok, wajib, dan sukarela.
7. Coba validasi simpanan pokok kedua untuk menunjukkan kontrol sistem.
8. Catat penarikan simpanan sukarela.
9. Buat pengajuan pinjaman.
10. Approve pinjaman.
11. Cairkan pinjaman dan tunjukkan jadwal angsuran otomatis.
12. Catat pembayaran angsuran partial atau penuh.
13. Buka laporan untuk melihat ringkasan, saldo, pinjaman, angsuran, cash-bank, dan rekonsiliasi.
14. Jika GL ready, buka tab jurnal/ledger untuk menunjukkan jurnal KSP dari transaksi setelah cutoff.

## 5. Test Case Manual

Status bisa diisi saat latihan demo:

```txt
PASS / FAIL / BLOCKED / SKIP
```

### 5.1. Akses dan setup awal

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| AUTH-01 | Register Owner pertama | Buka app kosong, klik Register Owner Pertama, isi nama dan PIN valid, simpan | Owner dibuat, aplikasi login otomatis |  |
| AUTH-02 | Validasi PIN register | Isi PIN dan konfirmasi PIN berbeda | Muncul pesan konfirmasi PIN tidak sama |  |
| AUTH-03 | Login Owner | Logout, masukkan PIN Owner, klik Masuk | Login berhasil dan menu utama tampil |  |
| AUTH-04 | Akses menu Koperasi | Buka menu Koperasi | Overview dan sub-menu koperasi tampil |  |

### 5.2. Setup akun, saldo awal, dan General Ledger

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| ACC-01 | Cek Daftar Akun default | Finance > Daftar Akun, cari akun `1010`, `1020`, `1120`, `2300`, `3000`, `4040`, `4050` | Akun tampil, aktif, dan tipe akun sesuai kebutuhan KSP |  |
| ACC-02 | Cek profile dan template | Daftar Akun > Mapping & Template, pastikan profile `SAK EMKM` dan extension `Retail`; klik Apply Template jika ada akun kurang | Template aktif dan akun/mapping default tersedia |  |
| ACC-03 | Cek mapping KSP | Di Mapping & Template, cek kategori `KSP_SETORAN_SIMPANAN`, `KSP_PENARIKAN_SIMPANAN`, `KSP_PENCAIRAN_PINJAMAN`, `KSP_PEMBAYARAN_ANGSURAN` | Mapping mengarah ke akun KSP/kas-bank yang benar dan tidak ke akun inactive/header |  |
| ACC-04 | Validasi opening balance tidak balance | Finance > General Ledger, isi debit Rp 5.000.000 dan kredit Rp 4.000.000 | Sistem menolak posting karena total debit/kredit tidak balance |  |
| ACC-05 | Posting saldo awal balance | Isi cutoff, policy, debit Kas Tunai Rp 5.000.000, debit Bank Rp 10.000.000, kredit Modal Pemilik Rp 15.000.000, klik Post Opening Balance | Opening balance posted, cutoff/policy tersimpan, dan prasyarat readiness terpenuhi |  |
| ACC-06 | Aktifkan GENERAL_LEDGER | Daftar Akun > Mapping & Template > Module Activation, aktifkan `GENERAL LEDGER` | Module aktif dan halaman General Ledger menampilkan readiness `Siap` |  |
| ACC-07 | Cek laporan awal GL | Finance > General Ledger, buka Trial Balance dan Neraca | Trial balance balance dan Neraca tidak selisih setelah opening balance |  |

Catatan:
- Jika demo tidak menampilkan jurnal, test `ACC-01` sampai `ACC-07` boleh diberi status `SKIP`.
- Jika test `ACC-05` sudah pernah dijalankan di database yang sama, opening balance terkunci. Gunakan database demo bersih untuk mengulang dari awal.

### 5.3. Master anggota

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| MEM-01 | Tambah anggota aktif | Koperasi > Anggota > Tambah, isi `KSU-001` dan data Siti Aminah, status ACTIVE, simpan | Anggota muncul di tabel dengan status ACTIVE |  |
| MEM-02 | Nomor anggota aktif unik | Tambah anggota baru dengan nomor `KSU-001` dan status ACTIVE | Sistem menolak dengan pesan nomor anggota sudah dipakai anggota aktif lain |  |
| MEM-03 | Edit data anggota | Edit nomor HP atau alamat anggota | Data anggota berubah dan tetap tampil di tabel |  |
| MEM-04 | Archive anggota | Archive anggota yang dipilih | Status berubah menjadi INACTIVE, data tidak hard delete |  |
| MEM-05 | Restore anggota | Restore anggota INACTIVE | Status kembali ACTIVE jika nomor tidak dipakai anggota aktif lain |  |

### 5.4. Simpanan anggota

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| SAV-01 | Setor simpanan pokok | Koperasi > Simpanan > Tambah, pilih Siti Aminah, DEPOSIT, POKOK, Rp 500.000, simpan | Transaksi POSTED, saldo POKOK Siti menjadi Rp 500.000, cash-flow masuk dibuat |  |
| SAV-02 | Setor simpanan wajib | Catat DEPOSIT WAJIB Rp 100.000 untuk Siti | Saldo WAJIB Siti menjadi Rp 100.000 |  |
| SAV-03 | Setor simpanan sukarela | Catat DEPOSIT SUKARELA Rp 300.000 untuk Siti | Saldo SUKARELA Siti menjadi Rp 300.000 |  |
| SAV-04 | Tolak simpanan pokok kedua | Catat DEPOSIT POKOK lagi untuk Siti | Sistem menolak karena simpanan pokok hanya boleh satu kali per anggota |  |
| SAV-05 | Tolak penarikan pokok/wajib | Catat WITHDRAWAL POKOK atau WAJIB | Sistem menolak karena penarikan hanya boleh dari SUKARELA |  |
| SAV-06 | Penarikan sukarela valid | Catat WITHDRAWAL SUKARELA Rp 100.000 untuk Siti | Saldo SUKARELA Siti turun menjadi Rp 200.000, cash-flow keluar dibuat |  |
| SAV-07 | Tolak penarikan melebihi saldo | Catat WITHDRAWAL SUKARELA Rp 999.000 untuk Siti | Sistem menolak karena penarikan melebihi saldo sukarela |  |
| SAV-08 | Reversal simpanan | Pilih transaksi simpanan POSTED, klik reversal, isi alasan, konfirmasi | Transaksi asal menjadi REVERSED, baris reversal dibuat, saldo dan cash-flow terkoreksi |  |
| SAV-09 | Jurnal simpanan, jika GL ready | Setelah SAV-01, buka General Ledger > Jurnal atau Laporan Koperasi > Journal | Jurnal setoran simpanan mendebit Kas/Bank dan mengkredit Simpanan Anggota |  |

### 5.5. Pinjaman dan pencairan

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| LOAN-01 | Buat pengajuan pinjaman | Koperasi > Pinjaman > Tambah, pilih Budi, pokok Rp 3.000.000, bunga 1%, tenor 6, submit | Pinjaman dibuat dengan status SUBMITTED |  |
| LOAN-02 | Approve pinjaman | Pada baris pinjaman SUBMITTED, klik approve | Status berubah menjadi APPROVED |  |
| LOAN-03 | Reject pinjaman | Buat pinjaman lain, klik reject, isi alasan minimal 3 karakter | Status berubah menjadi REJECTED dan alasan tersimpan |  |
| LOAN-04 | Cairkan pinjaman approved | Pada pinjaman APPROVED, klik cairkan, isi tanggal pencairan, jatuh tempo pertama, metode bayar, simpan | Status berubah DISBURSED, cash-flow keluar dibuat, jadwal angsuran 6 baris dibuat |  |
| LOAN-05 | Validasi jadwal angsuran | Buka detail pinjaman atau menu Angsuran | Terdapat 6 jadwal, tiap jadwal sekitar Rp 530.000, total tagihan Rp 3.180.000 |  |
| LOAN-06 | Tolak pencairan tanpa approval | Coba cairkan pinjaman yang masih SUBMITTED | Sistem menolak karena pinjaman hanya bisa dicairkan setelah approved |  |
| LOAN-07 | Jurnal pencairan, jika GL ready | Setelah LOAN-04, buka General Ledger > Jurnal atau Laporan Koperasi > Journal | Jurnal pencairan mendebit Piutang Pinjaman Anggota dan mengkredit Kas/Bank |  |

### 5.6. Pembayaran angsuran

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| PAY-01 | Bayar angsuran penuh | Koperasi > Angsuran, pilih jadwal pertama Budi, bayar Rp 530.000 | Pembayaran POSTED, angsuran menjadi PAID, outstanding pinjaman berkurang |  |
| PAY-02 | Bayar angsuran partial | Pilih jadwal berikutnya, bayar Rp 200.000 | Angsuran menjadi PARTIAL, paid amount bertambah, sisa tagihan masih tampil |  |
| PAY-03 | Tolak bayar melebihi sisa tagihan | Pilih jadwal yang sisa tagihannya Rp 530.000, isi Rp 999.000 | Sistem menolak karena nominal melebihi sisa tagihan angsuran |  |
| PAY-04 | Alokasi pembayaran | Bayar sebagian pada angsuran yang memiliki bunga | Alokasi masuk berurutan ke denda, bunga, lalu pokok |  |
| PAY-05 | Pinjaman lunas | Bayar semua jadwal sampai selesai | Semua angsuran PAID dan status pinjaman menjadi PAID_OFF |  |
| PAY-06 | Reversal pembayaran | Pilih pembayaran POSTED, klik reversal, isi alasan, konfirmasi | Pembayaran asal menjadi REVERSED, baris reversal dibuat, outstanding dan status angsuran terkoreksi |  |
| PAY-07 | Jurnal pembayaran angsuran, jika GL ready | Setelah PAY-01, buka General Ledger > Jurnal atau Laporan Koperasi > Journal | Jurnal pembayaran mendebit Kas/Bank dan mengkredit Piutang Pinjaman Anggota serta Pendapatan Bunga jika ada |  |

### 5.7. Laporan dan rekonsiliasi

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| REP-01 | Ringkasan laporan | Buka Koperasi > Laporan | Tampil jumlah anggota aktif, total simpanan, outstanding pinjaman, dan tunggakan |  |
| REP-02 | Tab Savings | Buka tab Savings | Tampil saldo simpanan dan mutasi simpanan |  |
| REP-03 | Tab Loans | Buka tab Loans | Tampil pinjaman, status, pokok, total tagihan, dan outstanding |  |
| REP-04 | Tab Installments | Buka tab Installments | Tampil jadwal angsuran dan histori pembayaran |  |
| REP-05 | Tab Cash-Bank | Buka tab Cash-Bank | Tampil mutasi kas/bank kategori KSP: setoran, penarikan, pencairan, pembayaran |  |
| REP-06 | Reconciliation | Buka tab Summary dan lihat rekonsiliasi | Status OK jika saldo operasional konsisten, WARNING jika ada mismatch |  |
| REP-07 | Filter tanggal | Isi date range laporan | Data laporan mengikuti rentang tanggal |  |
| REP-08 | Ledger akun, jika GL ready | Pilih akun KSP atau kas/bank di filter laporan | Buku besar akun tampil dengan opening, movement transaksi KSP, dan ending balance |  |

## 6. Checklist Narasi Presentasi

Gunakan poin ini saat menjelaskan ke owner:

- Sistem punya login Owner, sehingga akses awal tidak terbuka bebas.
- Daftar Akun dan General Ledger adalah layer accounting; Koperasi tidak membuat ledger paralel.
- Saldo awal diposting sekali per cutoff agar buku besar, trial balance, dan neraca punya titik mulai yang jelas.
- Anggota menjadi pusat data untuk simpanan dan pinjaman.
- Simpanan pokok dijaga satu kali per anggota.
- Penarikan hanya boleh dari simpanan sukarela.
- Pinjaman harus lewat pengajuan, approval, lalu pencairan.
- Jadwal angsuran dibuat otomatis dari tenor dan bunga flat.
- Pembayaran angsuran mengurangi outstanding dan bisa partial.
- Koreksi transaksi memakai reversal, bukan hapus data diam-diam.
- Laporan menyatukan anggota, simpanan, pinjaman, angsuran, cash-bank, jurnal, ledger, dan rekonsiliasi jika GL ready.
- Data tetap bisa dipakai offline di device demo.

## 7. Risiko Demo dan Antisipasi

| Risiko | Antisipasi |
| --- | --- |
| Browser masih menyimpan data latihan lama | Gunakan profile browser khusus demo atau hapus IndexedDB `KasirkuDB` sebelum mulai |
| PIN demo lupa | Catat PIN demo di catatan presenter, jangan tampilkan ke audience |
| Akun default/mapping tidak lengkap | Buka Finance > Daftar Akun > Mapping & Template, lalu Apply Template sebelum transaksi demo |
| Opening balance tidak balance | Gunakan data saldo awal demo: debit Kas Rp 5.000.000, debit Bank Rp 10.000.000, kredit Modal Rp 15.000.000 |
| GL belum ready sehingga jurnal kosong | Selesaikan cutoff, opening balance, dan aktifkan module GENERAL_LEDGER; jika tidak, jelaskan bahwa demo operasional tetap berjalan tanpa jurnal |
| Cutoff dipilih setelah transaksi KSP | Ulangi dari database bersih atau jelaskan bahwa transaksi sebelum cutoff masuk legacy cash-flow, bukan ledger |
| Port dev berubah | Ikuti URL yang tampil di terminal setelah `bun run dev` |
| Owner bertanya data multi-device/server | Jelaskan bahwa MVP saat ini offline-first; sinkronisasi PostgreSQL/Tauri adalah lapisan lanjutan sesuai roadmap |

## 8. Definisi Selesai untuk Latihan Demo

Latihan demo dianggap siap jika:

- Owner pertama bisa dibuat dan login.
- Daftar Akun default untuk KSP tersedia.
- Jika demo jurnal dipakai, opening balance sudah posted, module `GENERAL_LEDGER` aktif, dan status General Ledger `Siap`.
- Minimal 3 anggota demo berhasil dibuat.
- Simpanan pokok, wajib, sukarela, dan penarikan sukarela berhasil dicatat.
- Validasi negatif simpanan berhasil ditunjukkan.
- Pinjaman bisa diajukan, di-approve, dicairkan, dan membuat jadwal 6 bulan.
- Minimal 1 pembayaran angsuran berhasil dicatat.
- Laporan Koperasi menampilkan angka yang sesuai data demo.
- Jika GL ready, jurnal KSP muncul untuk setoran simpanan, pencairan pinjaman, dan pembayaran angsuran.
- Tidak ada error blocking di console atau UI selama alur presentasi utama.

## 9. Langkah Implementasi Playwright E2E

Bagian ini adalah rencana implementasi automated E2E untuk flow setup awal, accounting dasar, dan modul Koperasi. Scope awalnya sengaja dibuat bertahap: dari database kosong, register Owner pertama, setup Daftar Akun/General Ledger, buka menu Koperasi, tambah anggota, lalu lanjut ke simpanan, pinjaman, angsuran, dan laporan inti.

Referensi resmi yang dipakai:

- Playwright Installation: <https://playwright.dev/docs/intro>
- Playwright Configuration: <https://playwright.dev/docs/test-configuration>
- Playwright Web Server: <https://playwright.dev/docs/test-webserver>
- Playwright Locators: <https://playwright.dev/docs/locators>

### 9.1. Batas scope tahap awal

Masuk scope:

- Browser mode Vite dulu, melalui `bun run dev`.
- Test berjalan dari Playwright browser context yang bersih.
- Fokus route auth/accounting: `/`, `/finance/chart-of-accounts`, `/finance/general-ledger`, `/finance/general-ledger/setup`.
- Fokus route Koperasi: `/koperasi`, `/koperasi/anggota`, `/koperasi/simpanan`, `/koperasi/pinjaman`, `/koperasi/angsuran`, `/koperasi/laporan`.
- Fokus test case manual: `AUTH-01` sampai `AUTH-04`, `ACC-01` sampai `ACC-07`, lalu subset Koperasi yang paling penting untuk demo owner.
- Browser awal: Chromium saja.

Belum masuk scope:

- Tauri desktop automation.
- CI pipeline.
- Multi-browser Chromium, Firefox, dan WebKit.
- Visual regression/screenshot baseline.
- Full audit semua tab General Ledger, period lock, backfill, dan manual journal advanced.
- Test semua kombinasi permission role.

Alasan:

- Aplikasi ini offline-first dan state utama tersimpan di IndexedDB `KasirkuDB`.
- Flow Owner pertama hanya muncul saat belum ada owner aktif.
- General Ledger membutuhkan cutoff, opening balance, mapping, dan module activation sebelum jurnal otomatis bisa dipercaya.
- Test awal harus membuktikan alur utama dahulu, bukan langsung membuat suite besar yang rawan flaky.

### 9.2. Install dependency Playwright

Project ini memakai Bun dan sudah punya `bun.lock`, jadi gunakan install manual supaya tidak membuat lockfile package manager lain.

```bash
bun add -d @playwright/test
bunx playwright install --with-deps chromium
```

Setelah suite Chromium stabil, browser lain bisa dipasang:

```bash
bunx playwright install --with-deps
```

Tambahkan script ini ke `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:chromium": "playwright test --project=chromium",
    "test:e2e:headed": "playwright test --headed --project=chromium",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:report": "playwright show-report"
  }
}
```

Tambahkan artifact Playwright ke `.gitignore`:

```gitignore
playwright-report
test-results
```

### 9.3. Struktur file yang disarankan

Gunakan folder `tests/` yang sudah ada, lalu pisahkan E2E ke subfolder sendiri.

```txt
playwright.config.ts
tests/
  e2e/
    helpers/
      auth.ts
      accounting.ts
      koperasi.ts
    setup-owner.spec.ts
    accounting-setup.spec.ts
    koperasi-members.spec.ts
    koperasi-savings.spec.ts
    koperasi-loans-installments-reports.spec.ts
```

Catatan struktur:

- `tests/e2e/helpers/auth.ts` berisi helper register Owner, logout, dan login ulang.
- `tests/e2e/helpers/accounting.ts` berisi helper cek Daftar Akun, posting saldo awal, aktivasi GL, dan optional `setupAccountingReady(page)`.
- `tests/e2e/helpers/koperasi.ts` berisi helper navigasi Koperasi dan input data anggota/simpanan/pinjaman.
- Satu spec boleh berisi alur serial jika datanya saling bergantung.
- Jangan taruh helper test di `src/` kecuali helper itu memang dipakai aplikasi runtime.

### 9.4. Config awal Playwright

Buat `playwright.config.ts` di root project:

```ts
import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `bun run dev -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Catatan config:

- `webServer` menjalankan Vite sebelum test, sehingga tester cukup menjalankan `bun run test:e2e`.
- `baseURL` membuat test bisa memakai `page.goto('/koperasi')`.
- `workers: 1` dipakai untuk tahap awal supaya flow naratif setup + koperasi mudah dibaca dan stabil.
- Setelah helper state matang, spec yang tidak saling bergantung boleh dibuat paralel.

### 9.5. Aturan state dan data test

Gunakan prinsip ini untuk semua spec:

- Jangan memakai database browser manual dari latihan demo.
- Biarkan Playwright membuat browser context baru yang bersih.
- Register Owner melalui UI pada awal spec yang butuh login.
- Untuk test yang saling bergantung, pakai `test.describe.serial`.
- Pakai data demo dari dokumen ini agar angka mudah diverifikasi.
- Jika test mulai sering dijalankan di browser persistent/headed manual, tambahkan suffix unik pada nomor anggota, misalnya `KSU-E2E-${Date.now()}-001`.

Data awal E2E:

```ts
export const demoOwner = {
  name: 'Owner KSU Madu Kenjacana',
  pin: '123456',
};

export const demoOpeningBalance = [
  { accountCode: '1010', accountName: 'Kas Tunai', debit: 5_000_000, credit: 0 },
  { accountCode: '1020', accountName: 'Bank / Non Tunai', debit: 10_000_000, credit: 0 },
  { accountCode: '3000', accountName: 'Modal Pemilik', debit: 0, credit: 15_000_000 },
];

export const demoMembers = {
  siti: {
    memberNumber: 'KSU-001',
    name: 'Siti Aminah',
    identityNumber: '3271010101010001',
    phone: '081234567001',
    address: 'Alamat demo Siti Aminah',
  },
  budi: {
    memberNumber: 'KSU-002',
    name: 'Budi Hartono',
    identityNumber: '3271010101010002',
    phone: '081234567002',
    address: 'Alamat demo Budi Hartono',
  },
};
```

### 9.6. Helper auth awal

Contoh isi `tests/e2e/helpers/auth.ts`:

```ts
import { expect, type Page } from '@playwright/test';

export async function registerFirstOwner(page: Page, pin = '123456') {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Masuk Kasirku' })).toBeVisible();
  await expect(page.getByText('Belum ada user aktif.')).toBeVisible();

  await page.getByRole('button', { name: 'Register Owner Pertama' }).click();
  await expect(page.getByRole('heading', { name: 'Register Owner' })).toBeVisible();

  await page.getByLabel('Nama Owner').fill('Owner KSU Madu Kenjacana');
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByLabel('Konfirmasi PIN').fill(pin);
  await page.getByRole('button', { name: 'Simpan Owner' }).click();

  await expect(page.getByLabel('Logout')).toBeVisible();
}

export async function logoutAndLoginAgain(page: Page, pin = '123456') {
  await page.getByLabel('Logout').click();
  const logoutDialog = page.getByRole('dialog', { name: 'Logout dari Kasirku?' });
  await expect(logoutDialog).toBeVisible();
  await logoutDialog.getByRole('button', { name: 'Logout' }).click();

  await expect(page.getByRole('heading', { name: 'Masuk Kasirku' })).toBeVisible();
  await expect(page.getByText('Owner KSU Madu Kenjacana - Owner')).toBeVisible();

  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Masuk' }).click();

  await expect(page.getByLabel('Logout')).toBeVisible();
}

export async function loginAsBootstrappedOwner(page: Page) {
  await registerFirstOwner(page);
}
```

Jika locator `getByLabel('PIN')` bentrok karena ada beberapa field PIN, gunakan `getByLabel('PIN', { exact: true })` atau batasi dengan locator form/dialog terkait.

### 9.7. Test setup awal

Buat `tests/e2e/setup-owner.spec.ts`.

Target test case:

| ID manual | Test Playwright | Expected utama |
| --- | --- | --- |
| AUTH-01 | Register Owner pertama | Owner dibuat dan app masuk ke shell Kasirku |
| AUTH-02 | Validasi PIN register | Pesan `Konfirmasi PIN tidak sama.` muncul |
| AUTH-03 | Login Owner | Setelah logout, PIN valid bisa login ulang |
| AUTH-04 | Akses menu Koperasi | Route `/koperasi` menampilkan menu Koperasi |

Contoh spec:

```ts
import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner, logoutAndLoginAgain } from './helpers/auth';

test.describe.serial('setup awal owner', () => {
  test('AUTH-01, AUTH-03, AUTH-04 - register owner, login ulang, dan akses koperasi', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await logoutAndLoginAgain(page);

    await page.goto('/koperasi');
    await expect(page.getByRole('heading', { name: 'Koperasi' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Anggota/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Simpanan/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Pinjaman/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Angsuran/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Laporan/ })).toBeVisible();
  });

  test('AUTH-02 - register menolak konfirmasi PIN berbeda', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Register Owner Pertama' }).click();

    await page.getByLabel('Nama Owner').fill('Owner KSU Madu Kenjacana');
    await page.getByLabel('PIN', { exact: true }).fill('123456');
    await page.getByLabel('Konfirmasi PIN').fill('654321');
    await page.getByRole('button', { name: 'Simpan Owner' }).click();

    await expect(page.getByText('Konfirmasi PIN tidak sama.')).toBeVisible();
  });
});
```

### 9.8. Test setup accounting

Buat `tests/e2e/accounting-setup.spec.ts`.

Target test case:

| ID manual | Test Playwright | Expected utama |
| --- | --- | --- |
| ACC-01 | Cek akun default KSP | Akun `1010`, `1020`, `1120`, `2300`, `3000`, `4040`, `4050` tampil |
| ACC-02 | Cek profile/template | Profile `SAK EMKM`, extension `Retail`, template aktif |
| ACC-03 | Cek mapping KSP | Mapping kategori KSP tidak kosong dan tidak mengarah ke akun inactive/header |
| ACC-04 | Validasi opening balance tidak balance | Pesan total debit/kredit harus balance muncul atau tombol posting disabled |
| ACC-05 | Posting saldo awal balance | Opening balance posted |
| ACC-06 | Aktifkan GENERAL_LEDGER | Module aktif |
| ACC-07 | Cek laporan awal GL | Readiness `Siap`, tabs report tampil, trial balance balance |

Langkah implementasi:

1. Panggil `loginAsBootstrappedOwner(page)`.
2. Buka `/finance/chart-of-accounts`.
3. Assert heading `Daftar Akun`.
4. Assert akun default KSP/kas-bank tersedia.
5. Buka tab `Mapping & Template`.
6. Jika tombol `Apply Template` enabled dan ada akun kurang, klik `Apply Template`.
7. Assert panel `Module Activation` menampilkan `GENERAL LEDGER`.
8. Buka `/finance/general-ledger`.
9. Assert panel `Setup Cutoff dan Opening Balance` tampil.
10. Isi opening balance tidak balance lebih dulu untuk memastikan posting tidak bisa dipakai.
11. Isi opening balance balance:

| Akun | Debit | Kredit |
| --- | ---: | ---: |
| 1010 - Kas Tunai | 5000000 | 0 |
| 1020 - Bank / Non Tunai | 10000000 | 0 |
| 3000 - Modal Pemilik | 0 | 15000000 |

12. Klik `Post Opening Balance`.
13. Kembali ke `/finance/chart-of-accounts`, tab `Mapping & Template`, aktifkan `GENERAL LEDGER`.
14. Buka `/finance/general-ledger`.
15. Assert readiness `Siap`.
16. Assert tab `Jurnal`, `Buku Besar`, `Trial Balance`, `Laba Rugi`, dan `Neraca` tampil.

Catatan locator:

```ts
await page.goto('/finance/chart-of-accounts');
await expect(page.getByText('Daftar Akun')).toBeVisible();
await expect(page.getByText('1010')).toBeVisible();
await expect(page.getByText('Kas Tunai')).toBeVisible();
await expect(page.getByText('2300')).toBeVisible();
await expect(page.getByText('Simpanan Anggota')).toBeVisible();

await page.goto('/finance/general-ledger');
await expect(page.getByText('Setup Cutoff dan Opening Balance')).toBeVisible();
await expect(page.getByText('Readiness')).toBeVisible();
```

Jika input debit/kredit di table opening balance sulit ditarget karena kolom berulang, tambahkan `data-testid` kecil pada row akun opening balance, misalnya `gl-opening-balance-row-1010`, `gl-opening-balance-debit-1010`, dan `gl-opening-balance-credit-1010`.

### 9.9. Test master anggota

Buat `tests/e2e/koperasi-members.spec.ts`.

Target awal:

| ID manual | Test Playwright | Expected utama |
| --- | --- | --- |
| MEM-01 | Tambah anggota aktif | `KSU-001` dan `Siti Aminah` muncul di tabel |
| MEM-02 | Nomor anggota aktif unik | Duplikasi `KSU-001` ditolak |

Langkah implementasi:

1. Panggil `loginAsBootstrappedOwner(page)`.
2. Jika suite jurnal aktif, panggil helper `setupAccountingReady(page)` sebelum transaksi KSP.
3. `page.goto('/koperasi/anggota')`.
4. Assert heading `Master Anggota Koperasi`.
5. Klik `Tambah Anggota`.
6. Isi field `Nomor Anggota`, `Nama`, `No. Identitas`, `Telepon`, `Alamat`.
7. Biarkan `Tanggal Bergabung` default jika sudah terisi otomatis.
8. Simpan modal dengan tombol `OK` bawaan Ant Design atau tombol primary di modal.
9. Assert `Siti Aminah`, `KSU-001`, dan status `Aktif`.
10. Ulangi tambah anggota dengan `KSU-001`.
11. Assert pesan validasi bisnis nomor anggota aktif sudah dipakai.

Selector yang perlu diprioritaskan:

```ts
await page.getByRole('button', { name: 'Tambah Anggota' }).click();
await page.getByLabel('Nomor Anggota').fill('KSU-001');
await page.getByLabel('Nama').fill('Siti Aminah');
await page.getByLabel('No. Identitas').fill('3271010101010001');
await page.getByLabel('Telepon').fill('081234567001');
await page.getByLabel('Alamat').fill('Alamat demo Siti Aminah');
await page.getByRole('button', { name: 'OK' }).click();
```

Jika tombol `OK` terlalu umum, tambah `okText` eksplisit pada modal anggota atau tambahkan `data-testid` kecil pada modal. Jangan ubah business logic hanya demi test.

### 9.10. Test simpanan anggota

Buat `tests/e2e/koperasi-savings.spec.ts`.

Target awal:

| ID manual | Test Playwright | Expected utama |
| --- | --- | --- |
| SAV-01 | Setor simpanan pokok | Mutasi POSTED dan saldo Pokok Rp 500.000 |
| SAV-04 | Tolak simpanan pokok kedua | Pesan simpanan pokok hanya satu kali |
| SAV-06 | Penarikan sukarela valid | Saldo Sukarela berkurang |
| SAV-07 | Tolak penarikan melebihi saldo | Pesan saldo tidak cukup |
| SAV-09 | Jurnal simpanan, jika GL ready | Jurnal setoran simpanan tampil |

Langkah implementasi:

1. Bootstrap Owner.
2. Jika suite jurnal aktif, panggil helper `setupAccountingReady(page)` sebelum transaksi KSP.
3. Buat anggota `KSU-001 - Siti Aminah` lewat helper anggota.
4. Buka `/koperasi/simpanan`.
5. Klik `Tambah Simpanan`.
6. Pilih anggota `KSU-001 - Siti Aminah`.
7. Pilih `Setoran`, `Pokok`, nominal `500000`, lalu simpan.
8. Assert row mutasi berisi `Siti Aminah`, `Pokok`, `Setoran`, `Posted`, dan nominal Rp 500.000.
9. Buka tab `Saldo`, assert saldo Pokok Rp 500.000.
10. Coba setoran Pokok kedua, assert ditolak.
11. Tambah setoran Sukarela Rp 300.000.
12. Tambah penarikan Sukarela Rp 100.000.
13. Assert saldo Sukarela Rp 200.000.
14. Jika suite jurnal aktif, buka `/finance/general-ledger` dan assert jurnal setoran/penarikan simpanan muncul.

Catatan:

- Ant Design `Select` kadang butuh locator option: `page.getByRole('option', { name: /KSU-001 - Siti Aminah/ }).click()`.
- Jika dropdown option sulit ditemukan karena portal, gunakan `page.getByTitle(...)` atau tambah `data-testid` pada field Select.

### 9.11. Test pinjaman, angsuran, dan laporan

Buat `tests/e2e/koperasi-loans-installments-reports.spec.ts`.

Target awal:

| ID manual | Test Playwright | Expected utama |
| --- | --- | --- |
| LOAN-01 | Buat pengajuan pinjaman | Status `Submitted` |
| LOAN-02 | Approve pinjaman | Status `Approved` |
| LOAN-04 | Cairkan pinjaman approved | Status `Disbursed` dan jadwal dibuat |
| LOAN-05 | Validasi jadwal angsuran | Ada 6 jadwal sekitar Rp 530.000 |
| PAY-01 | Bayar angsuran penuh | Pembayaran POSTED dan angsuran PAID/Lunas |
| REP-01 | Ringkasan laporan | Laporan menampilkan anggota aktif, total simpanan, outstanding |
| LOAN-07 | Jurnal pencairan, jika GL ready | Jurnal pencairan tampil |
| PAY-07 | Jurnal pembayaran, jika GL ready | Jurnal pembayaran angsuran tampil |

Langkah implementasi:

1. Bootstrap Owner.
2. Jika suite jurnal aktif, panggil helper `setupAccountingReady(page)` sebelum transaksi KSP.
3. Buat anggota `KSU-002 - Budi Hartono`.
4. Buka `/koperasi/pinjaman`.
5. Klik `Tambah Pinjaman`.
6. Pilih anggota Budi.
7. Isi `Pokok Pinjaman` = `3000000`.
8. Isi `Bunga per Bulan (%)` = `1`.
9. Isi `Tenor Bulan` = `6`.
10. Klik `Ajukan Pinjaman`.
11. Assert status `Submitted`.
12. Klik `Approve`, konfirmasi modal.
13. Assert status `Approved`.
14. Klik `Cairkan`, isi tanggal default, metode `Tunai`, lalu simpan.
15. Assert status `Disbursed`.
16. Buka `/koperasi/angsuran`.
17. Assert row jadwal Budi muncul dengan tagihan sekitar Rp 530.000.
18. Klik `Bayar` pada jadwal pertama.
19. Simpan pembayaran penuh.
20. Assert pembayaran `Posted` dan jadwal menjadi `Lunas`.
21. Buka `/koperasi/laporan`.
22. Assert heading `Laporan Koperasi` dan statistik `Anggota Aktif`, `Total Simpanan`, `Outstanding Pinjaman`.
23. Jika suite jurnal aktif, buka `/finance/general-ledger` dan assert jurnal pencairan serta pembayaran angsuran muncul.

Catatan angka pinjaman:

```txt
pokok = 3.000.000
bunga = 3.000.000 * 1% * 6 = 180.000
total_tagihan = 3.180.000
angsuran_per_bulan = 530.000
```

### 9.12. Strategi locator untuk project ini

Prioritas locator:

| Prioritas | Gunakan | Contoh |
| --- | --- | --- |
| 1 | Role dan accessible name | `getByRole('button', { name: 'Tambah Anggota' })` |
| 2 | Label form | `getByLabel('Nomor Anggota')` |
| 3 | Text unik | `getByText('Master Anggota Koperasi')` |
| 4 | Placeholder | `getByPlaceholder('Pilih anggota aktif')` |
| 5 | `data-testid` | Hanya untuk elemen ambigu atau icon-only |

Tambahkan `data-testid` jika:

- Ada banyak tombol `Detail`, `Approve`, `Bayar`, atau `Reversal` dalam tabel yang sama.
- Action button berada di row Ant Design yang sulit dibatasi dengan role/text.
- DatePicker/Select portal Ant Design membuat locator berbasis label tidak stabil.

Contoh penamaan:

```txt
auth-register-owner-button
auth-owner-pin-input
accounting-opening-balance-row-1010
accounting-module-general-ledger-switch
koperasi-member-add-button
koperasi-member-form-modal
koperasi-member-row-KSU-001
koperasi-saving-add-button
koperasi-loan-row-KSU-002
koperasi-installment-pay-button
```

Jangan menambahkan `data-testid` ke semua elemen. Tambahkan hanya saat selector berbasis role/label tidak cukup stabil.

### 9.13. Urutan pengerjaan yang disarankan

Kerjakan bertahap:

1. Install `@playwright/test` dan browser Chromium.
2. Tambah script E2E ke `package.json`.
3. Tambah `playwright-report` dan `test-results` ke `.gitignore`.
4. Buat `playwright.config.ts`.
5. Buat helper `tests/e2e/helpers/auth.ts`.
6. Buat `setup-owner.spec.ts` sampai semua AUTH awal pass.
7. Buat helper accounting dan `accounting-setup.spec.ts` sampai `ACC-01` sampai `ACC-07` pass.
8. Buat helper anggota dan `koperasi-members.spec.ts`.
9. Tambah `data-testid` hanya jika locator tabel/modal tidak stabil.
10. Buat `koperasi-savings.spec.ts`.
11. Buat `koperasi-loans-installments-reports.spec.ts`.
12. Jalankan headed sekali untuk review flow visual.
13. Jalankan headless sebagai validasi final.

### 9.14. Command validasi

Jalankan semua E2E tahap awal:

```bash
bun run test:e2e:chromium
```

Jalankan dengan browser terlihat:

```bash
bun run test:e2e:headed
```

Buka UI Playwright untuk debugging:

```bash
bun run test:e2e:ui
```

Buka report setelah test:

```bash
bun run test:e2e:report
```

Validasi repo setelah implementasi:

```bash
bun run lint
bun run build
bun run test:e2e:chromium
git diff --check
```

### 9.15. Definisi selesai Playwright tahap awal

Implementasi Playwright tahap awal dianggap selesai jika:

- `bun run test:e2e:chromium` berhasil dari database Playwright yang bersih.
- Test `AUTH-01` sampai `AUTH-04` sudah otomatis.
- Test `ACC-01` sampai `ACC-07` sudah otomatis jika suite demo jurnal diaktifkan.
- Test tambah anggota aktif dan validasi nomor anggota duplikat sudah otomatis.
- Minimal satu flow simpanan pokok, validasi simpanan pokok kedua, dan penarikan sukarela sudah otomatis.
- Flow pinjaman Budi dari pengajuan, approve, pencairan, jadwal angsuran, pembayaran pertama, sampai laporan ringkasan sudah otomatis.
- Jika GL ready di suite, jurnal KSP terverifikasi minimal untuk setoran simpanan, pencairan pinjaman, dan pembayaran angsuran.
- Tidak ada test yang bergantung pada data browser manual.
- Artifact Playwright tidak ikut masuk git.
- Jika ada `data-testid`, penambahannya kecil, eksplisit, dan tidak mengubah business logic.
