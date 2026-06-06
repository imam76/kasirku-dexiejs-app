# Tutorial Setup Awal dan Test Case Demo KSP

Dokumen ini disiapkan untuk presentasi project Kasirku modul Koperasi Simpan Pinjam kepada Owner KSU Madu Kenjacana.

Fokus demo:
- Setup awal aplikasi sampai Owner bisa login.
- Alur operasional KSP: anggota, simpanan, pinjaman, angsuran, laporan.
- Validasi bisnis yang penting untuk owner: data anggota aktif, simpanan pokok satu kali, penarikan hanya sukarela, pencairan pinjaman setelah approval, pembayaran angsuran tidak boleh melebihi tagihan.

Catatan penting:
- Aplikasi bersifat offline-first. Data demo tersimpan lokal di browser atau desktop app melalui IndexedDB `KasirkuDB`.
- General Ledger default belum aktif. Demo operasional tetap bisa berjalan tanpa GL. Jika ingin menampilkan jurnal otomatis, aktifkan GL lebih dulu melalui menu Finance > General Ledger.
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

### 2.4. Setup GL, opsional untuk demo jurnal

Lewati bagian ini jika demo hanya fokus operasional KSP.

Langkah umum:

1. Buka Finance > General Ledger.
2. Isi tanggal cutoff.
3. Pilih inventory policy.
4. Isi saldo awal debit/kredit jika diperlukan.
5. Pastikan total debit dan kredit balance.
6. Klik posting opening balance.

Expected result:
- Status General Ledger menjadi ready.
- Transaksi KSP setelah tanggal cutoff dapat membuat jurnal otomatis.

Catatan:
- GL default tidak aktif dan belum ready pada database baru.
- Jika GL tidak ready, alur anggota, simpanan, pinjaman, angsuran, dan cash-flow tetap bisa didemokan.

## 3. Data Demo yang Disarankan

Gunakan data sederhana supaya owner mudah mengikuti angka.

### 3.1. Anggota

| Nomor Anggota | Nama | NIK | No HP | Status |
| --- | --- | --- | --- | --- |
| KSU-001 | Siti Aminah | 3271010101010001 | 081234567001 | ACTIVE |
| KSU-002 | Budi Hartono | 3271010101010002 | 081234567002 | ACTIVE |
| KSU-003 | Nursalim | 3271010101010003 | 081234567003 | ACTIVE |

### 3.2. Simpanan untuk Siti Aminah

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

### 3.3. Pinjaman untuk Budi Hartono

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

## 4. Urutan Demo yang Direkomendasikan

Gunakan urutan ini agar cerita presentasi mengalir:

1. Register Owner pertama dan login.
2. Buka menu Koperasi dan jelaskan bahwa modul ini khusus back-office KSP.
3. Tambah anggota.
4. Catat simpanan pokok, wajib, dan sukarela.
5. Coba validasi simpanan pokok kedua untuk menunjukkan kontrol sistem.
6. Catat penarikan simpanan sukarela.
7. Buat pengajuan pinjaman.
8. Approve pinjaman.
9. Cairkan pinjaman dan tunjukkan jadwal angsuran otomatis.
10. Catat pembayaran angsuran partial atau penuh.
11. Buka laporan untuk melihat ringkasan, saldo, pinjaman, angsuran, cash-bank, dan rekonsiliasi.

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

### 5.2. Master anggota

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| MEM-01 | Tambah anggota aktif | Koperasi > Anggota > Tambah, isi `KSU-001` dan data Siti Aminah, status ACTIVE, simpan | Anggota muncul di tabel dengan status ACTIVE |  |
| MEM-02 | Nomor anggota aktif unik | Tambah anggota baru dengan nomor `KSU-001` dan status ACTIVE | Sistem menolak dengan pesan nomor anggota sudah dipakai anggota aktif lain |  |
| MEM-03 | Edit data anggota | Edit nomor HP atau alamat anggota | Data anggota berubah dan tetap tampil di tabel |  |
| MEM-04 | Archive anggota | Archive anggota yang dipilih | Status berubah menjadi INACTIVE, data tidak hard delete |  |
| MEM-05 | Restore anggota | Restore anggota INACTIVE | Status kembali ACTIVE jika nomor tidak dipakai anggota aktif lain |  |

### 5.3. Simpanan anggota

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

### 5.4. Pinjaman dan pencairan

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| LOAN-01 | Buat pengajuan pinjaman | Koperasi > Pinjaman > Tambah, pilih Budi, pokok Rp 3.000.000, bunga 1%, tenor 6, submit | Pinjaman dibuat dengan status SUBMITTED |  |
| LOAN-02 | Approve pinjaman | Pada baris pinjaman SUBMITTED, klik approve | Status berubah menjadi APPROVED |  |
| LOAN-03 | Reject pinjaman | Buat pinjaman lain, klik reject, isi alasan minimal 3 karakter | Status berubah menjadi REJECTED dan alasan tersimpan |  |
| LOAN-04 | Cairkan pinjaman approved | Pada pinjaman APPROVED, klik cairkan, isi tanggal pencairan, jatuh tempo pertama, metode bayar, simpan | Status berubah DISBURSED, cash-flow keluar dibuat, jadwal angsuran 6 baris dibuat |  |
| LOAN-05 | Validasi jadwal angsuran | Buka detail pinjaman atau menu Angsuran | Terdapat 6 jadwal, tiap jadwal sekitar Rp 530.000, total tagihan Rp 3.180.000 |  |
| LOAN-06 | Tolak pencairan tanpa approval | Coba cairkan pinjaman yang masih SUBMITTED | Sistem menolak karena pinjaman hanya bisa dicairkan setelah approved |  |

### 5.5. Pembayaran angsuran

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| PAY-01 | Bayar angsuran penuh | Koperasi > Angsuran, pilih jadwal pertama Budi, bayar Rp 530.000 | Pembayaran POSTED, angsuran menjadi PAID, outstanding pinjaman berkurang |  |
| PAY-02 | Bayar angsuran partial | Pilih jadwal berikutnya, bayar Rp 200.000 | Angsuran menjadi PARTIAL, paid amount bertambah, sisa tagihan masih tampil |  |
| PAY-03 | Tolak bayar melebihi sisa tagihan | Pilih jadwal yang sisa tagihannya Rp 530.000, isi Rp 999.000 | Sistem menolak karena nominal melebihi sisa tagihan angsuran |  |
| PAY-04 | Alokasi pembayaran | Bayar sebagian pada angsuran yang memiliki bunga | Alokasi masuk berurutan ke denda, bunga, lalu pokok |  |
| PAY-05 | Pinjaman lunas | Bayar semua jadwal sampai selesai | Semua angsuran PAID dan status pinjaman menjadi PAID_OFF |  |
| PAY-06 | Reversal pembayaran | Pilih pembayaran POSTED, klik reversal, isi alasan, konfirmasi | Pembayaran asal menjadi REVERSED, baris reversal dibuat, outstanding dan status angsuran terkoreksi |  |

### 5.6. Laporan dan rekonsiliasi

| ID | Skenario | Langkah | Expected result | Status |
| --- | --- | --- | --- | --- |
| REP-01 | Ringkasan laporan | Buka Koperasi > Laporan | Tampil jumlah anggota aktif, total simpanan, outstanding pinjaman, dan tunggakan |  |
| REP-02 | Tab Savings | Buka tab Savings | Tampil saldo simpanan dan mutasi simpanan |  |
| REP-03 | Tab Loans | Buka tab Loans | Tampil pinjaman, status, pokok, total tagihan, dan outstanding |  |
| REP-04 | Tab Installments | Buka tab Installments | Tampil jadwal angsuran dan histori pembayaran |  |
| REP-05 | Tab Cash-Bank | Buka tab Cash-Bank | Tampil mutasi kas/bank kategori KSP: setoran, penarikan, pencairan, pembayaran |  |
| REP-06 | Reconciliation | Buka tab Summary dan lihat rekonsiliasi | Status OK jika saldo operasional konsisten, WARNING jika ada mismatch |  |
| REP-07 | Filter tanggal | Isi date range laporan | Data laporan mengikuti rentang tanggal |  |
| REP-08 | Ledger akun, jika GL ready | Pilih akun di filter laporan | Buku besar akun tampil dengan opening, movement, dan ending balance |  |

## 6. Checklist Narasi Presentasi

Gunakan poin ini saat menjelaskan ke owner:

- Sistem punya login Owner, sehingga akses awal tidak terbuka bebas.
- Anggota menjadi pusat data untuk simpanan dan pinjaman.
- Simpanan pokok dijaga satu kali per anggota.
- Penarikan hanya boleh dari simpanan sukarela.
- Pinjaman harus lewat pengajuan, approval, lalu pencairan.
- Jadwal angsuran dibuat otomatis dari tenor dan bunga flat.
- Pembayaran angsuran mengurangi outstanding dan bisa partial.
- Koreksi transaksi memakai reversal, bukan hapus data diam-diam.
- Laporan menyatukan anggota, simpanan, pinjaman, angsuran, cash-bank, dan rekonsiliasi.
- Data tetap bisa dipakai offline di device demo.

## 7. Risiko Demo dan Antisipasi

| Risiko | Antisipasi |
| --- | --- |
| Browser masih menyimpan data latihan lama | Gunakan profile browser khusus demo atau hapus IndexedDB `KasirkuDB` sebelum mulai |
| PIN demo lupa | Catat PIN demo di catatan presenter, jangan tampilkan ke audience |
| GL belum ready sehingga jurnal kosong | Jelaskan bahwa demo operasional tetap berjalan, lalu aktifkan GL hanya jika ingin menampilkan jurnal |
| Port dev berubah | Ikuti URL yang tampil di terminal setelah `bun run dev` |
| Owner bertanya data multi-device/server | Jelaskan bahwa MVP saat ini offline-first; sinkronisasi PostgreSQL/Tauri adalah lapisan lanjutan sesuai roadmap |

## 8. Definisi Selesai untuk Latihan Demo

Latihan demo dianggap siap jika:

- Owner pertama bisa dibuat dan login.
- Minimal 3 anggota demo berhasil dibuat.
- Simpanan pokok, wajib, sukarela, dan penarikan sukarela berhasil dicatat.
- Validasi negatif simpanan berhasil ditunjukkan.
- Pinjaman bisa diajukan, di-approve, dicairkan, dan membuat jadwal 6 bulan.
- Minimal 1 pembayaran angsuran berhasil dicatat.
- Laporan Koperasi menampilkan angka yang sesuai data demo.
- Tidak ada error blocking di console atau UI selama alur presentasi utama.
