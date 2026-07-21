# Implementasi Fitur Pengembalian Lebih Bayar Pelanggan

Buat fitur **Pengembalian Lebih Bayar Pelanggan** untuk mencatat penyelesaian kelebihan pembayaran atas piutang usaha.

**Sesuai base project yang sekarang, masuk ke module sales, dan UI/UX mirip module sales.**

Ikuti seluruh konvensi yang sudah digunakan pada base project saat ini, meliputi:

* Struktur folder dan penamaan file.
* Arsitektur module.
* Pola repository, service, command, query, dan state management.
* Komponen form, tabel, modal, drawer, dan halaman detail.
* Validasi input.
* Format mata uang, tanggal, dan nomor referensi.
* Sistem otorisasi dan permission.
* Pencatatan activity log.
* Pola transaksi database.
* Integrasi General Ledger.
* Penanganan error dan notifikasi pengguna.

Jangan membuat pola arsitektur baru apabila kebutuhan ini dapat diselesaikan menggunakan pola yang sudah tersedia pada module sales.

## 1. Tujuan Fitur

Fitur digunakan ketika pelanggan melakukan pembayaran piutang dengan nominal lebih besar daripada total faktur yang dibayar.

Contoh:

* Nilai faktur: Rp500.000.
* Pembayaran pelanggan: Rp1.000.000.
* Nilai yang dialokasikan ke faktur: Rp500.000.
* Kelebihan pembayaran: Rp500.000.

Kelebihan pembayaran tersebut menjadi **kredit pelanggan/customer credit** dan harus dapat diselesaikan melalui dua metode:

1. Dialokasikan untuk membayar faktur penjualan lainnya milik pelanggan yang sama.
2. Dikembalikan kepada pelanggan dalam bentuk kas atau bank.

## 2. Lokasi Fitur

Tambahkan fitur pada:

`Sales > Piutang Usaha > Pengembalian Lebih Bayar`

Sesuaikan nama route, navigation item, permission, breadcrumb, dan page title dengan konvensi module sales yang sudah ada.

## 3. Halaman Daftar Lebih Bayar

Buat halaman daftar transaksi penerimaan piutang yang masih mempunyai saldo lebih bayar.

Tampilkan minimal kolom:

* Nomor penerimaan.
* Tanggal penerimaan.
* Nama pelanggan.
* Nomor faktur asal.
* Total pembayaran.
* Total pembayaran yang telah dialokasikan.
* Nilai lebih bayar awal.
* Nilai lebih bayar yang telah digunakan.
* Sisa lebih bayar.
* Status.
* Aksi.

Status lebih bayar:

* `OPEN`: saldo lebih bayar masih tersedia.
* `PARTIALLY_USED`: sebagian saldo sudah digunakan.
* `SETTLED`: seluruh saldo sudah dialokasikan atau dikembalikan.
* `CANCELLED`: transaksi dibatalkan atau direversal.

Sediakan fitur:

* Pencarian berdasarkan nomor transaksi, nomor faktur, dan nama pelanggan.
* Filter tanggal.
* Filter pelanggan.
* Filter status.
* Pagination.
* Sorting.
* Tombol melihat detail.
* Tombol memproses pengembalian lebih bayar.

Hanya transaksi dengan sisa lebih bayar lebih besar dari nol yang dapat diproses.

## 4. Pemilihan Metode Penyelesaian

Ketika pengguna memilih transaksi lebih bayar, tampilkan modal pemilihan metode:

### Opsi 1 — Untuk Pembayaran Faktur Lain

Kelebihan pembayaran digunakan untuk mengurangi piutang dari faktur penjualan lain milik pelanggan yang sama.

### Opsi 2 — Pengembalian dalam Bentuk Kas/Bank

Kelebihan pembayaran dikembalikan kepada pelanggan melalui akun kas atau bank.

Setelah metode dipilih, arahkan pengguna ke form transaksi yang sesuai.

## 5. Form Pembayaran Faktur Lain

Buat form untuk mengalokasikan saldo lebih bayar ke faktur penjualan lain.

Field header:

* Pelanggan.
* Tanggal transaksi.
* Nomor referensi.
* Deskripsi.
* Departemen, jika fitur departemen tersedia.
* Proyek, jika fitur proyek tersedia.
* Informasi transaksi penerimaan asal.
* Nilai lebih bayar awal.
* Sisa lebih bayar yang tersedia.

Ketentuan:

* Pelanggan otomatis berasal dari transaksi lebih bayar dan tidak boleh diganti.
* Nomor referensi dibuat otomatis menggunakan document numbering yang berlaku.
* Nomor referensi tetap dapat diubah secara manual apabila konfigurasi module mengizinkannya.
* Deskripsi dibuat otomatis, tetapi dapat diubah.
* Tanggal default menggunakan tanggal hari ini.
* Pengguna hanya boleh memilih faktur dari pelanggan yang sama.
* Faktur yang dapat dipilih hanya faktur dengan sisa piutang lebih besar dari nol.
* Faktur asal yang sudah lunas tidak boleh ditampilkan sebagai target alokasi.

Buat tabel alokasi faktur dengan kolom:

* Nomor faktur.
* Tanggal faktur.
* Tanggal jatuh tempo.
* Total faktur.
* Sisa piutang sebelum alokasi.
* Nominal alokasi.
* Sisa piutang setelah alokasi.

Pengguna dapat mengalokasikan ke satu atau beberapa faktur.

Validasi:

* Total alokasi tidak boleh melebihi sisa lebih bayar.
* Nominal alokasi per faktur tidak boleh melebihi sisa piutang faktur.
* Nominal alokasi harus lebih besar dari nol.
* Faktur harus berasal dari pelanggan yang sama.
* Faktur yang sudah lunas tidak boleh dipilih.
* Tidak boleh menyimpan transaksi tanpa baris alokasi.
* Seluruh proses penyimpanan harus menggunakan satu database transaction.

Setelah transaksi berhasil:

* Sisa piutang faktur target berkurang.
* Saldo kredit pelanggan berkurang.
* Status faktur diperbarui menjadi `PARTIALLY_PAID` atau `PAID`.
* Status saldo lebih bayar diperbarui menjadi `PARTIALLY_USED` atau `SETTLED`.
* Simpan relasi antara transaksi lebih bayar asal dan faktur target.
* Catat activity log.

## 6. Form Pengembalian Kas/Bank

Buat form untuk mengembalikan saldo lebih bayar kepada pelanggan dalam bentuk kas atau bank.

Field:

* Pelanggan.
* Tanggal transaksi.
* Nomor referensi.
* Deskripsi.
* Akun kas/bank.
* Nilai lebih bayar yang tersedia.
* Nominal pengembalian.
* Departemen, jika tersedia.
* Proyek, jika tersedia.
* Catatan tambahan.

Ketentuan:

* Pelanggan otomatis berasal dari transaksi lebih bayar dan tidak boleh diganti.
* Akun yang dapat dipilih hanya akun dengan tipe kas atau bank.
* Nominal pengembalian dapat sebagian atau seluruh saldo lebih bayar.
* Nominal pengembalian harus lebih besar dari nol.
* Nominal pengembalian tidak boleh melebihi sisa lebih bayar.
* Tampilkan saldo akun kas/bank jika sistem sudah mendukung informasi tersebut.
* Berikan konfirmasi sebelum transaksi disimpan.

Setelah transaksi berhasil:

* Saldo kredit pelanggan berkurang.
* Saldo kas atau bank berkurang.
* Status transaksi lebih bayar diperbarui menjadi `PARTIALLY_USED` atau `SETTLED`.
* Buat transaksi pengeluaran kas/bank.
* Simpan relasi dengan transaksi penerimaan piutang asal.
* Catat activity log.

## 7. Perlakuan Akuntansi

Gunakan akun mapping yang dapat dikonfigurasi. Jangan hardcode ID akun.

Minimal diperlukan mapping akun:

* Akun piutang usaha.
* Akun kredit pelanggan atau utang kepada pelanggan.
* Akun kas/bank yang digunakan dalam transaksi.

### Saat Kelebihan Pembayaran Pertama Kali Diterima

Contoh pembayaran Rp1.000.000 untuk faktur Rp500.000:

```text
Debit  Kas/Bank                     Rp1.000.000
Kredit Piutang Usaha                Rp500.000
Kredit Kredit Pelanggan             Rp500.000
```

Nama akun `Kredit Pelanggan` dapat menggunakan akun kewajiban lancar seperti:

* Utang kepada pelanggan.
* Titipan pelanggan.
* Customer credit.
* Kelebihan pembayaran pelanggan.

Gunakan akun yang telah dikonfigurasi dalam accounting posting account.

### Ketika Dialokasikan ke Faktur Lain

```text
Debit  Kredit Pelanggan             xxx
Kredit Piutang Usaha                xxx
```

Tidak ada pergerakan kas atau bank pada transaksi ini.

### Ketika Dikembalikan melalui Kas/Bank

```text
Debit  Kredit Pelanggan             xxx
Kredit Kas/Bank                     xxx
```

Pastikan jurnal selalu balance dan terhubung ke source transaction.

## 8. Struktur Data

Gunakan tabel yang sudah tersedia apabila secara fungsi masih sesuai. Apabila belum tersedia, buat struktur data yang kompatibel dengan pola database saat ini.

Data minimal yang perlu disimpan:

### Header Pengembalian Lebih Bayar

* ID.
* Nomor transaksi.
* Tanggal transaksi.
* Customer ID.
* Source receipt ID.
* Source invoice ID jika relevan.
* Metode penyelesaian.
* Total transaksi.
* Deskripsi.
* Department ID.
* Project ID.
* Status.
* Created by.
* Updated by.
* Created at.
* Updated at.
* Posted at.
* Reversed at.

### Detail Alokasi Faktur

* ID.
* Header ID.
* Target invoice ID.
* Nilai alokasi.
* Sisa piutang sebelum alokasi.
* Sisa piutang setelah alokasi.

### Detail Pengembalian Kas/Bank

* ID.
* Header ID.
* Cash/bank account ID.
* Nilai pengembalian.
* Finance transaction ID.
* Journal entry ID.

Gunakan foreign key, index, unique constraint, dan check constraint yang sesuai.

Pastikan transaksi yang sudah diposting tidak dapat dihapus secara langsung.

## 9. Detail Transaksi

Buat halaman detail transaksi yang menampilkan:

* Nomor transaksi.
* Tanggal.
* Pelanggan.
* Metode penyelesaian.
* Referensi transaksi penerimaan asal.
* Referensi faktur asal.
* Total lebih bayar.
* Nominal yang diproses.
* Sisa lebih bayar.
* Daftar faktur tujuan, jika dialokasikan ke faktur lain.
* Akun kas/bank, jika dikembalikan dalam bentuk kas.
* Informasi jurnal.
* Status.
* Pembuat transaksi.
* Waktu pembuatan dan posting.
* Riwayat aktivitas.

Sediakan navigasi menuju:

* Detail pelanggan.
* Detail faktur.
* Detail penerimaan piutang.
* Detail pengeluaran kas/bank.
* Detail journal entry.

## 10. Posting dan Reversal

Gunakan konsep posting dan reversal yang sudah digunakan pada module sales dan accounting.

Ketentuan:

* Draft belum memengaruhi saldo piutang, customer credit, kas/bank, dan General Ledger.
* Posting menjalankan seluruh perubahan saldo dan jurnal.
* Transaksi yang sudah diposting tidak boleh diedit langsung.
* Koreksi dilakukan dengan reversal.
* Reversal harus mengembalikan saldo kredit pelanggan.
* Reversal alokasi faktur harus mengembalikan sisa piutang faktur target.
* Reversal pengembalian kas/bank harus mengembalikan saldo kas/bank secara akuntansi.
* Reversal harus membuat jurnal pembalik.
* Simpan alasan reversal dan pengguna yang melakukan reversal.
* Periksa accounting period sebelum posting atau reversal.

## 11. Permission

Tambahkan permission mengikuti pola authorization project:

* Melihat daftar pengembalian lebih bayar.
* Melihat detail.
* Membuat transaksi.
* Mengubah draft.
* Posting transaksi.
* Melakukan reversal.
* Melihat jurnal transaksi.

Sembunyikan atau nonaktifkan aksi yang tidak sesuai dengan permission pengguna.

## 12. Kondisi yang Harus Ditangani

Tangani minimal kondisi berikut:

* Pembayaran pelanggan sama persis dengan nilai faktur.
* Pembayaran pelanggan lebih kecil dari nilai faktur.
* Pembayaran pelanggan lebih besar dari nilai faktur.
* Satu pembayaran digunakan untuk beberapa faktur.
* Kelebihan pembayaran dialokasikan ke satu faktur.
* Kelebihan pembayaran dialokasikan ke beberapa faktur.
* Pengembalian kas hanya sebagian.
* Pengembalian kas seluruhnya.
* Kombinasi sebagian dialokasikan ke faktur dan sisanya dikembalikan melalui kas/bank.
* Faktur target telah dilunasi oleh transaksi lain sebelum form disimpan.
* Saldo lebih bayar telah digunakan oleh pengguna lain.
* Accounting period sudah ditutup.
* Akun posting belum dikonfigurasi.
* Transaksi asal telah direversal.
* Kegagalan saat membuat jurnal.
* Race condition atau double submit.

Gunakan locking atau validasi ulang di server/service layer agar saldo lebih bayar tidak dapat digunakan dua kali.

## 13. UI/UX

UI/UX wajib mengikuti module sales yang sudah ada.

Gunakan pola yang sama untuk:

* Page header.
* Breadcrumb.
* Filter toolbar.
* Data table.
* Status badge.
* Form section.
* Form footer.
* Modal konfirmasi.
* Empty state.
* Loading state.
* Error state.
* Currency input.
* Date picker.
* Customer selector.
* Invoice selector.
* Account selector.
* Tombol simpan draft, posting, batal, dan reversal.

Jangan membuat desain yang terlihat seperti module terpisah dari module sales.

Pada form, tampilkan ringkasan secara jelas:

* Total lebih bayar tersedia.
* Total yang dialokasikan.
* Total yang dikembalikan.
* Sisa kredit pelanggan setelah transaksi.

## 14. Acceptance Criteria

Fitur dianggap selesai apabila:

1. Sistem dapat mendeteksi penerimaan piutang yang menghasilkan lebih bayar.
2. Saldo lebih bayar tercatat sebagai customer credit atau kewajiban kepada pelanggan.
3. Pengguna dapat melihat daftar saldo lebih bayar yang masih tersedia.
4. Pengguna dapat mengalokasikan saldo lebih bayar ke faktur lain milik pelanggan yang sama.
5. Pengguna dapat mengembalikan saldo lebih bayar melalui akun kas atau bank.
6. Sistem mendukung penggunaan saldo lebih bayar secara sebagian.
7. Sistem mencegah penggunaan saldo melebihi saldo yang tersedia.
8. Saldo faktur, customer credit, kas/bank, dan jurnal selalu konsisten.
9. Seluruh jurnal yang dibuat dalam kondisi balance.
10. Posting dan reversal mengikuti accounting period.
11. Transaksi yang sudah diposting tidak dapat dihapus langsung.
12. Seluruh perubahan penting tercatat dalam activity log.
13. UI/UX konsisten dengan module sales.
14. Fitur mengikuti struktur dan arsitektur base project yang sekarang.
14.5 Sync db + realtime
15. Seluruh test, lint, type-check, dan build project berhasil.

## 15. Testing

Tambahkan minimal:

* Unit test perhitungan saldo lebih bayar.
* Unit test alokasi ke faktur lain.
* Unit test pengembalian kas/bank.
* Unit test jurnal.
* Unit test validasi saldo.
* Integration test posting.
* Integration test reversal.
* Test penggunaan saldo secara sebagian.
* Test concurrent transaction atau double submit.
* Test accounting period yang sudah ditutup.
* Test akun posting yang belum dikonfigurasi.

Sebelum implementasi, analisis terlebih dahulu module sales, penerimaan piutang, invoice, finance transaction, journal entry, document numbering, permission, dan activity log yang sudah ada.

Gunakan kembali komponen dan service yang tersedia. Jangan menduplikasi logika pembayaran piutang, posting jurnal, document numbering, atau pengelolaan kas/bank.
