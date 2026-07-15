fitur **Saldo Awal Akuntansi**

Rancang fitur tersebut dengan prinsip berikut:

## Tujuan utama

Pengguna harus dapat memasukkan data saldo awal secara bertahap dan menyimpannya berkali-kali, tetapi sistem tidak boleh membuat jurnal saldo awal baru setiap kali pengguna menyimpan data.

Bedakan dengan tegas antara:

1. **Simpan Draft**

   * Tidak memengaruhi buku besar.
   * Tidak membuat jurnal.
   * Dapat dilakukan berkali-kali.
   * Data dapat ditambah, diubah, atau dihapus.

2. **Posting Saldo Awal**

   * Membuat jurnal ke buku besar.
   * Hanya boleh ada satu versi saldo awal aktif untuk satu perusahaan dan satu tanggal cutoff.
   * Harus idempotent: menekan tombol posting dua kali tidak boleh membuat jurnal ganda.
   * Setelah berhasil diposting, batch menjadi terkunci.

3. **Koreksi setelah posting**

   * Jurnal yang sudah diposting tidak boleh diedit langsung.
   * Apabila belum ada transaksi turunan, saldo awal dapat di-unpost lalu diperbaiki.
   * Apabila sudah digunakan oleh transaksi lain, koreksi dilakukan melalui reversal dan batch revisi atau jurnal penyesuaian.
   * Seluruh perubahan harus mempunyai audit trail.

## Konsep data

Gunakan konsep **Opening Balance Batch**.

Setiap batch minimal mempunyai:

* ID
* Nomor batch
* Perusahaan
* Tanggal cutoff
* Tanggal mulai pembukuan
* Status
* Nomor revisi
* Referensi batch sebelumnya
* Referensi jurnal hasil posting
* Pembuat
* Waktu dibuat
* Pengguna yang mem-posting
* Waktu posting
* Pengguna yang melakukan reversal
* Waktu reversal

Status batch:

* `DRAFT`
* `VALIDATED`
* `POSTED`
* `LOCKED`
* `REVERSED`

Jelaskan apakah `POSTED` dan `LOCKED` perlu dipisahkan atau cukup dijadikan satu status.

## Jenis saldo awal

Fitur harus menangani:

1. Saldo akun buku besar
2. Kas dan bank
3. Piutang usaha per pelanggan dan invoice
4. Utang usaha per pemasok dan invoice
5. Persediaan per produk, gudang, lot, dan tanggal kedaluwarsa
6. Aset tetap dan akumulasi penyusutan
7. Ekuitas saldo awal
8. Saldo modul koperasi apabila relevan

Jangan memperlakukan seluruh saldo sebagai satu nominal akun apabila akun tersebut membutuhkan subledger.

Contoh:

* Piutang harus memiliki rincian pelanggan dan invoice.
* Utang harus memiliki rincian pemasok dan invoice.
* Persediaan harus memiliki rincian produk, gudang, kuantitas, dan biaya per unit.
* Aset tetap harus memiliki rincian aset, tanggal perolehan, nilai perolehan, umur manfaat, dan akumulasi penyusutan.

## Aturan validasi

Sebelum posting, sistem wajib memeriksa:

* Total debit sama dengan total kredit.
* Tanggal cutoff lebih kecil daripada tanggal mulai pembukuan.
* Tidak ada akun non-posting yang digunakan.
* Tidak ada akun yang sudah dinonaktifkan.
* Tidak ada invoice piutang duplikat.
* Tidak ada invoice utang duplikat.
* Total rincian piutang sama dengan saldo akun kontrol piutang.
* Total rincian utang sama dengan saldo akun kontrol utang.
* Total nilai persediaan sama dengan saldo akun kontrol persediaan.
* Total nilai buku aset tetap konsisten dengan akun aset dan akumulasi penyusutan.
* Tidak ada nominal negatif kecuali secara eksplisit diizinkan oleh tipe akun.
* Tidak ada saldo awal lain yang masih aktif pada tanggal cutoff yang sama.
* Posting ulang dengan request yang sama tidak menghasilkan jurnal tambahan.

Jika data tidak seimbang, sistem harus menolak posting. Jangan otomatis memasukkan selisih ke akun penyeimbang tanpa persetujuan eksplisit pengguna.

## Perilaku posting

Saat batch diposting:

1. Jalankan seluruh proses dalam satu database transaction.
2. Kunci batch agar tidak diposting secara paralel.
3. Validasi ulang seluruh data.
4. Buat satu jurnal saldo awal.
5. Buat baris jurnal untuk setiap akun.
6. Buat data subledger piutang.
7. Buat data subledger utang.
8. Buat inventory opening layers.
9. Buat opening records aset tetap.
10. Simpan referensi jurnal ke batch.
11. Ubah status batch.
12. Catat audit log.

Apabila salah satu proses gagal, seluruh perubahan harus di-rollback.

## Pencegahan jurnal ganda

Berikan rancangan teknis untuk mencegah kasus berikut:

* Tombol posting ditekan dua kali.
* Request dikirim ulang karena jaringan terputus.
* Dua pengguna mem-posting batch yang sama secara bersamaan.
* Server selesai membuat jurnal tetapi respons ke client gagal.
* Worker menjalankan proses yang sama lebih dari sekali.

Gunakan kombinasi:

* database transaction,
* row-level locking,
* unique constraint,
* idempotency key,
* pengecekan `posted_journal_entry_id`.

## Koreksi dan reversal

Jelaskan alur berikut secara terpisah:

### Belum ada transaksi turunan

`POSTED → UNPOST/REVERSE → DRAFT → EDIT → POSTED`

### Sudah ada transaksi turunan

`POSTED → REVERSED → CREATE REVISION → VALIDATE → POST REVISION`

Batch revisi harus menyimpan referensi ke batch sebelumnya.

Jangan menghapus jurnal yang pernah diposting apabila periode sudah digunakan atau ditutup.

## Output yang saya butuhkan

Berikan hasil dalam urutan berikut:

1. Keputusan desain utama
2. Alur bisnis pengguna
3. State machine status batch
4. Struktur tabel PostgreSQL
5. Primary key, foreign key, unique constraint, dan check constraint
6. Struktur jurnal hasil posting
7. Rancangan API endpoint
8. Pseudocode proses posting
9. Pseudocode reversal dan revisi
10. Aturan hak akses
11. Audit trail
12. Validasi frontend dan backend
13. Penanganan concurrency dan idempotency
14. Edge case
15. Acceptance criteria
16. Contoh skenario lengkap dari draft sampai posting
17. Contoh skenario koreksi setelah posting

## Batasan desain

* Jangan membuat jurnal saat data hanya disimpan sebagai draft.
* Jangan mengizinkan lebih dari satu jurnal aktif untuk batch yang sama.
* Jangan mengubah jurnal posted secara langsung.
* Jangan mengandalkan validasi frontend saja.
* Jangan menggunakan akun penyeimbang otomatis untuk menyembunyikan ketidakseimbangan.
* Jangan menghapus audit history.
* Jangan memberikan penjelasan umum saja; hasil harus cukup konkret untuk langsung dijadikan dasar implementasi.

Gunakan PostgreSQL dan berikan contoh SQL yang valid. Fokus pada konsistensi data, auditability, keamanan posting, dan kemudahan migrasi dari pembukuan manual.
