Berikut hasil sanitasi nama field beserta kegunaannya untuk fitur **Pendapatan yang Masih Harus Diterima** (Accrued Income) berdasarkan kedua tampilan tersebut.

## Bagian Header (Informasi Umum)

| No | Nama Field | Tipe Input | Kegunaan |
|----|-----------|-----------|----------|
| 1 | Akan Diterima Dari | Dropdown (pilihan kontak) | Memilih pelanggan/pihak yang menjadi sumber pendapatan yang masih harus diterima. Terdapat ikon tambah kontak untuk membuat kontak baru. |
| 2 | Kategori Akrual | Dropdown | Mengelompokkan transaksi akrual ke dalam kategori tertentu untuk keperluan pelaporan dan penelusuran. |
| 3 | Tanggal | Date picker | Tanggal pencatatan/pengakuan pendapatan akrual (default: tanggal hari ini, contoh: Jul 8, 2026). |
| 4 | No. Referensi | Text (auto-generate) | Nomor unik transaksi yang dibuat otomatis oleh sistem (contoh: AI000001, prefiks "AI" = Accrued Income). Dapat diubah manual bila diperlukan. |
| 5 | Deskripsi | Text | Keterangan atau catatan tambahan mengenai transaksi pendapatan akrual. |
| 6 | Departemen | Dropdown | Menentukan departemen yang terkait dengan pendapatan ini (default: Head Quarter) untuk pelaporan per departemen. |
| 7 | Proyek | Dropdown | Mengaitkan transaksi ke proyek tertentu agar pendapatan dapat dilacak per proyek. |
| 8 | Kode Biaya | Dropdown | Menetapkan kode biaya (cost code) untuk klasifikasi dan analisis keuangan. |
| 9 | Mata Uang | Dropdown (terkunci) | Mata uang transaksi (default: IDR). Field ini nonaktif/terkunci sehingga tidak dapat diubah. |
| 10 | Lihat Lebih Sedikit | Toggle link | Menyembunyikan/menampilkan field opsional pada bagian header. |

## Bagian Detail (Tabel Akun)

| No | Nama Field | Tipe Input | Kegunaan |
|----|-----------|-----------|----------|
| 1 | Akun | Dropdown dengan pencarian | Memilih akun COA (Chart of Accounts) yang digunakan untuk mencatat pendapatan akrual, contoh: 110099010 – Kas Kecil, 110099020 – Kas. Dilengkapi fitur search untuk mempermudah pencarian akun. |
| 2 | Total | Numeric | Nominal pendapatan yang masih harus diterima untuk setiap baris akun (default: 0). |
| 3 | Hapus Baris (ikon tempat sampah) | Button | Menghapus baris akun yang tidak diperlukan. |
| 4 | Tambah Baris Baru | Button | Menambahkan baris akun baru pada tabel detail transaksi. |
| 5 | Expand Baris (ikon panah) | Toggle | Membuka detail tambahan pada tiap baris (misalnya deskripsi per baris atau tag). |

## Bagian Pilihan Lainnya & Ringkasan

| No | Nama Field | Tipe Input | Kegunaan |
|----|-----------|-----------|----------|
| 1 | Pilihan Lainnya | Toggle switch | Menampilkan/menyembunyikan field opsional tambahan (Jatuh Tempo dan Tanggal Pembayaran). |
| 2 | Jatuh Tempo | Date picker | Tanggal jatuh tempo penerimaan pendapatan yang diakru. |
| 3 | Tanggal Pembayaran | Date picker | Tanggal estimasi/aktual pembayaran diterima dari pihak terkait. |
| 4 | Total Row | Info label | Menampilkan jumlah baris akun yang ada pada tabel detail (contoh: Total Row : 2). |
| 5 | Total | Info label | Menampilkan total keseluruhan nominal transaksi (contoh: Rp 0.00). |

## Tombol Aksi

| No | Nama Tombol | Kegunaan |
|----|------------|----------|
| 1 | Buka Template | Membuka/menggunakan template transaksi yang sudah disimpan sebelumnya agar pengisian lebih cepat. |
| 2 | Batal | Membatalkan pembuatan transaksi dan keluar dari form tanpa menyimpan. |

Kalau kamu butuh, saya juga bisa merapikan ini menjadi dokumen Word atau format user manual yang siap dipakai untuk dokumentasi produk.