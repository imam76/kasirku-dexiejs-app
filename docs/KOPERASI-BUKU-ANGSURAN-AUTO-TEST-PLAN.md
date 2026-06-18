# Test Plan Otomatis Buku Angsuran Koperasi

Dokumen ini menjadi acuan implementasi automated test untuk route:

```txt
/koperasi/buku-angsuran
```

Fokus pengujian:

- Filter bulan dan hari penagihan.
- Pembentukan kolom tanggal sebanyak 4 atau 5 sesuai kalender.
- Pembayaran muncul pada tanggal penagihan yang tepat.
- Pinjaman masuk kategori Angsuran Lancar, Calon Macet, atau Macet.
- Perpindahan kategori ketika bulan laporan diganti.
- Nilai saldo awal, pembayaran bulan berjalan, dan saldo akhir.
- Konsistensi tampilan report dan hasil export.

## 1. Aturan Bisnis yang Sedang Diuji

Kategori pada Buku Angsuran saat ini ditentukan oleh umur pinjaman sejak bulan pencairan:

| Umur pinjaman pada bulan laporan | Kategori |
| --- | --- |
| Bulan ke-1 sampai ke-4 | Angsuran Lancar |
| Bulan ke-5 | Calon Macet |
| Bulan ke-6 dan seterusnya | Macet |

Rumus umur pinjaman:

```txt
umur = selisih bulan antara bulan laporan dan bulan pencairan + 1
```

Catatan:

- Kategori belum dihitung berdasarkan jumlah tunggakan atau kedisiplinan pembayaran.
- Pinjaman tetap harus memiliki saldo atau pembayaran pada bulan laporan agar masuk report.
- Filter hari menggunakan snapshot `collection_weekday` pada pinjaman.
- Nilai pembayaran dimasukkan ke kolom berdasarkan tanggal `payment_date`.

## 2. Strategi Test yang Direkomendasikan

Gunakan dua lapisan test:

### 2.1. Test report dengan fixture IndexedDB

Ini menjadi test utama dan paling stabil.

Data employee, area, anggota, pinjaman, dan pembayaran dimasukkan langsung ke IndexedDB `KasirkuDB`. Setelah fixture selesai, Playwright membuka halaman report dan melakukan assertion melalui UI.

Keuntungan:

- Tidak bergantung pada tanggal sistem.
- Tidak perlu menjalankan approval dan pencairan berulang untuk setiap test.
- Nilai saldo dan tanggal pembayaran dapat dibuat presisi.
- Test lebih cepat dan tidak mudah gagal karena perubahan modal transaksi.

### 2.2. Test integrasi transaksi melalui UI

Buat minimal satu skenario melalui UI:

1. Membuat anggota.
2. Membuat pinjaman.
3. Approve pinjaman.
4. Mencairkan pinjaman pada hari jadwal.
5. Mencatat pembayaran dengan tanggal tertentu.
6. Memastikan pembayaran muncul di Buku Angsuran.

Test ini memastikan data dari flow transaksi benar-benar terhubung ke report. Test tidak perlu mengulang semua kombinasi aging karena kombinasi tersebut sudah dicakup fixture report.

## 3. Periode Kalender Tetap

Jangan mengubah kalender atau waktu sistem.

Gunakan bulan laporan tetap berikut:

### Juni 2026

Hari Senin jatuh pada:

```txt
1, 8, 15, 22, 29
```

Expected result: report memiliki lima kolom tanggal.

### Juli 2026

Hari Senin jatuh pada:

```txt
6, 13, 20, 27
```

Expected result: report memiliki empat kolom tanggal.

## 4. Fixture Utama

### 4.1. Area dan petugas

| Data | Nilai |
| --- | --- |
| Area | `E2E-AREA-01 - Area Senin` |
| Petugas | `Petugas Senin` |
| Hari penagihan | Senin, ISO weekday `1` |
| Efektif mulai | 1 Januari 2026 |
| Efektif sampai | Tidak diisi |

Semua anggota di bawah harus memakai area dan petugas yang sama.

### 4.2. Anggota dan pinjaman

Gunakan nominal pinjaman yang sama agar assertion lebih sederhana:

```txt
Pokok pinjaman       = Rp 3.000.000
Total bunga          = Rp   180.000
Total tagihan        = Rp 3.180.000
Jumlah angsuran      = 6
Angsuran per periode = Rp   530.000
Status pinjaman      = DISBURSED
Hari penagihan       = Senin
```

| Anggota | Nomor anggota | Tanggal pencairan | Umur pada Juni 2026 | Kategori Juni |
| --- | --- | --- | ---: | --- |
| Anggota Lancar | E2E-BA-001 | 2 Maret 2026 | 4 | Angsuran Lancar |
| Anggota Calon Macet | E2E-BA-002 | 2 Februari 2026 | 5 | Calon Macet |
| Anggota Macet | E2E-BA-003 | 5 Januari 2026 | 6 | Macet |

Ketiga tanggal pencairan tersebut jatuh pada hari Senin.

### 4.3. Pembayaran bulan Juni 2026

| Anggota | Angsuran | Tanggal pembayaran | Nominal |
| --- | ---: | --- | ---: |
| Anggota Lancar | 1 | 1 Juni 2026 | Rp 530.000 |
| Anggota Lancar | 2 | 8 Juni 2026 | Rp 530.000 |
| Anggota Calon Macet | 1 | 15 Juni 2026 | Rp 530.000 |
| Anggota Macet | - | Tidak ada pembayaran | Rp 0 |

## 5. Expected Financial Values

Fixture tidak memiliki pembayaran sebelum Juni 2026.

### Anggota Lancar

```txt
Saldo awal Juni = Rp 3.180.000
Pembayaran 1 Juni = Rp 530.000
Pembayaran 8 Juni = Rp 530.000
Total angsuran Juni = Rp 1.060.000
Saldo akhir Juni = Rp 2.120.000
```

### Anggota Calon Macet

```txt
Saldo awal Juni = Rp 3.180.000
Pembayaran 15 Juni = Rp 530.000
Total angsuran Juni = Rp 530.000
Saldo akhir Juni = Rp 2.650.000
```

### Anggota Macet

```txt
Saldo awal Juni = Rp 3.180.000
Total angsuran Juni = Rp 0
Saldo akhir Juni = Rp 3.180.000
```

### Ringkasan report Juni

```txt
Jumlah anggota = 3
Pokok pinjaman = Rp 9.000.000
Saldo awal = Rp 9.540.000
Angsuran Juni = Rp 1.590.000
Saldo akhir = Rp 7.950.000
```

## 6. Test Case

### BA-01 — Menampilkan tiga kategori aging

Langkah:

1. Login sebagai Owner.
2. Pasang fixture utama.
3. Buka `/koperasi/buku-angsuran`.
4. Pilih bulan `Juni 2026`.
5. Pilih hari penagihan `Senin`.
6. Pilih resort `Petugas Senin`.
7. Tunggu report selesai dimuat.

Expected result:

- Bagian `Angsuran Lancar` tampil.
- `Anggota Lancar` hanya tampil pada bagian Angsuran Lancar.
- Bagian `Calon Macet` tampil.
- `Anggota Calon Macet` hanya tampil pada bagian Calon Macet.
- Bagian `Macet` tampil.
- `Anggota Macet` hanya tampil pada bagian Macet.
- Jumlah anggota pada ringkasan adalah `3`.

### BA-02 — Lima kolom tanggal untuk Juni 2026

Prerequisite: BA-01.

Expected result:

- Header tabel menampilkan `Hari Senin`.
- Kolom tanggal yang tampil tepat:

```txt
1, 8, 15, 22, 29
```

- Tidak ada kolom tanggal selain lima tanggal tersebut.
- Setiap section aging menggunakan susunan tanggal yang sama.

### BA-03 — Pembayaran masuk ke tanggal yang tepat

Prerequisite: BA-01.

Expected result:

#### Anggota Lancar

- Kolom `1` berisi `Rp 530.000`.
- Kolom `8` berisi `Rp 530.000`.
- Kolom `15`, `22`, dan `29` berisi `-`.
- Kolom Angsuran berisi `Rp 1.060.000`.
- Total Saldo berisi `Rp 2.120.000`.

#### Anggota Calon Macet

- Kolom `15` berisi `Rp 530.000`.
- Kolom `1`, `8`, `22`, dan `29` berisi `-`.
- Kolom Angsuran berisi `Rp 530.000`.
- Total Saldo berisi `Rp 2.650.000`.

#### Anggota Macet

- Semua kolom tanggal berisi `-`.
- Kolom Angsuran berisi `-` atau nilai nol sesuai format report.
- Total Saldo berisi `Rp 3.180.000`.

### BA-04 — Total per kategori dan total report

Prerequisite: BA-01.

Expected result:

- Total Angsuran Lancar adalah `Rp 1.060.000`.
- Total Calon Macet adalah `Rp 530.000`.
- Total Macet adalah `Rp 0`.
- Ringkasan report:

```txt
Jumlah anggota = 3
Pinjaman = Rp 9.000.000
Saldo Pokok = Rp 9.540.000
Angsuran = Rp 1.590.000
Total Saldo = Rp 7.950.000
```

### BA-05 — Perpindahan kategori pada Juli 2026

Langkah:

1. Gunakan fixture yang sama.
2. Ubah bulan laporan menjadi `Juli 2026`.
3. Tetap pilih hari `Senin`.
4. Jangan membuat pembayaran Juli.

Expected result:

| Anggota | Umur Juli | Kategori Juli |
| --- | ---: | --- |
| Anggota Lancar | 5 | Calon Macet |
| Anggota Calon Macet | 6 | Macet |
| Anggota Macet | 7 | Macet |

Assertion tambahan:

- Bagian Angsuran Lancar tidak tampil.
- Bagian Calon Macet berisi Anggota Lancar.
- Bagian Macet berisi Anggota Calon Macet dan Anggota Macet.
- Pembayaran Juni tidak tampil pada kolom Juli.
- Saldo awal Juli sudah dikurangi pembayaran Juni.

Expected saldo awal Juli:

| Anggota | Saldo awal Juli |
| --- | ---: |
| Anggota Lancar | Rp 2.120.000 |
| Anggota Calon Macet | Rp 2.650.000 |
| Anggota Macet | Rp 3.180.000 |

### BA-06 — Empat kolom tanggal untuk Juli 2026

Prerequisite: BA-05.

Expected result:

- Header tabel menampilkan `Hari Senin`.
- Kolom tanggal yang tampil tepat:

```txt
6, 13, 20, 27
```

- Jumlah kolom tanggal adalah empat.

### BA-07 — Filter hari tidak mencampur pinjaman

Tambahkan fixture pinjaman pembanding:

| Anggota | Nomor anggota | Hari penagihan |
| --- | --- | --- |
| Anggota Rabu | E2E-BA-004 | Rabu |

Langkah:

1. Buka report Juni 2026.
2. Pilih hari `Senin`.
3. Pastikan Anggota Rabu tidak tampil.
4. Ubah hari menjadi `Rabu`.

Expected result:

- Setelah memilih Rabu, pinjaman Senin tidak tampil.
- Anggota Rabu tampil.
- Header berubah menjadi `Hari Rabu`.
- Kolom tanggal Juni 2026 untuk Rabu adalah:

```txt
3, 10, 17, 24
```

### BA-08 — Pembayaran di luar hari filter

Tambahkan pembayaran untuk pinjaman Senin pada:

```txt
2 Juni 2026, hari Selasa, Rp 100.000
```

Expected behavior implementasi saat ini:

- Pembayaran tetap menambah kolom total Angsuran bulan Juni.
- Pembayaran tidak memiliki kolom tanggal pada report Senin karena tanggal `2` bukan hari Senin.

Test ini sebaiknya ditandai sebagai dokumentasi perilaku saat ini.

Jika kemudian form pembayaran divalidasi agar wajib mengikuti hari penagihan, ubah test menjadi:

- Form menolak tanggal 2 Juni 2026.
- Pesan validasi hari penagihan tampil.
- Tidak ada pembayaran yang tersimpan.

### BA-09 — Filter resort

Tambahkan satu petugas lain dengan pinjaman Senin.

Langkah:

1. Pilih `Semua Resort`.
2. Pastikan dua grup petugas tampil.
3. Pilih `Petugas Senin`.

Expected result:

- Hanya grup Petugas Senin yang tampil.
- Ringkasan report dihitung ulang hanya dari anggota Petugas Senin.

### BA-10 — Export mengikuti filter

Langkah:

1. Pilih Juni 2026, Senin, Petugas Senin.
2. Jalankan export CSV atau Excel.

Expected result:

- Nama file mengandung:

```txt
buku-angsuran-2026-06-senin
```

- Header export mengandung Hari Senin untuk tanggal:

```txt
1, 8, 15, 22, 29
```

- Data anggota dan nominal sama dengan report di layar.
- Data pinjaman dengan hari lain tidak ikut ter-export.

## 7. Flow Integrasi Melalui UI

Skenario ini cukup menggunakan Anggota Lancar agar runtime test tidak terlalu panjang.

### Setup

1. Login sebagai Owner.
2. Siapkan accounting menggunakan helper `setupAccountingReady`.
3. Buat area `E2E-AREA-01`.
4. Buat employee `Petugas Senin`.
5. Assign employee ke area tersebut.
6. Tambahkan jadwal Senin dengan efektif mulai 1 Januari 2026.
7. Buat anggota `E2E-BA-UI-001` pada area dan petugas tersebut.

### Pinjaman

1. Buka `/koperasi/pinjaman`.
2. Tambahkan pinjaman anggota.
3. Isi tanggal pengajuan sebelum atau sama dengan 2 Maret 2026.
4. Isi pokok Rp 3.000.000.
5. Isi bunga dan jumlah angsuran agar menghasilkan total tagihan Rp 3.180.000.
6. Simpan.
7. Approve pinjaman.
8. Cairkan pinjaman dengan tanggal `2 Maret 2026`.
9. Pastikan status menjadi Disbursed.

### Pembayaran

1. Buka `/koperasi/angsuran`.
2. Bayar angsuran pertama.
3. Ubah Tanggal Pembayaran menjadi `1 Juni 2026`.
4. Isi nominal Rp 530.000.
5. Simpan.
6. Bayar angsuran kedua.
7. Ubah Tanggal Pembayaran menjadi `8 Juni 2026`.
8. Isi nominal Rp 530.000.
9. Simpan.

### Assertion report

1. Buka `/koperasi/buku-angsuran`.
2. Pilih Juni 2026.
3. Pilih Senin.
4. Pilih Petugas Senin.

Expected result:

- Anggota tampil di bagian Angsuran Lancar.
- Pembayaran tampil pada kolom tanggal 1 dan 8.
- Total Angsuran adalah Rp 1.060.000.
- Total Saldo adalah Rp 2.120.000.

## 8. Test ID yang Perlu Ditambahkan

Agar Playwright tidak bergantung pada struktur internal Ant Design, tambahkan test ID berikut:

| Elemen | Test ID yang disarankan |
| --- | --- |
| Filter bulan | `koperasi-installment-book-month-filter` |
| Filter hari | `koperasi-installment-book-weekday-filter` |
| Filter resort | `koperasi-installment-book-resort-filter` |
| Report root | `koperasi-installment-book-report` |
| Grup resort | `koperasi-installment-book-group-{officerId}` |
| Section aging | `koperasi-installment-book-section-{category}` |
| Row pinjaman | `koperasi-installment-book-row-{loanId}` |
| Header tanggal | `koperasi-installment-book-date-{day}` |
| Cell pembayaran | `koperasi-installment-book-payment-{loanId}-{day}` |
| Total section | `koperasi-installment-book-total-{category}` |

Kategori untuk test ID:

```txt
CURRENT
WATCHLIST
DELINQUENT
```

## 9. Struktur File Test yang Disarankan

```txt
tests/e2e/
├── koperasi-installment-book-report.spec.ts
└── helpers/
    └── koperasiInstallmentBook.ts
```

Tanggung jawab helper:

- `seedInstallmentBookFixture(page)`
- `selectInstallmentBookMonth(page, month)`
- `selectInstallmentBookWeekday(page, weekday)`
- `selectInstallmentBookResort(page, resort)`
- `getInstallmentBookRow(page, loanId)`
- `expectPaymentOnDate(row, day, amount)`
- `expectInstallmentBookDateHeaders(page, days)`

## 10. Urutan Implementasi Automated Test

Implementasikan secara bertahap:

1. Tambahkan test ID pada filter, section, row, dan cell pembayaran.
2. Buat helper fixture IndexedDB.
3. Implementasikan BA-01 sampai BA-04.
4. Implementasikan BA-05 dan BA-06 untuk transisi bulan.
5. Implementasikan BA-07 untuk isolasi hari.
6. Tentukan keputusan bisnis BA-08 sebelum menjadikannya blocking test.
7. Implementasikan BA-09 dan BA-10.
8. Terakhir, tambahkan satu test integrasi penuh melalui UI.

## 11. Kriteria Lulus

Fitur dianggap aman jika:

- Tiga kategori aging muncul sesuai umur pinjaman.
- Perubahan bulan memindahkan kategori secara konsisten.
- Kolom tanggal selalu sesuai hari dan bulan terpilih.
- Jumlah kolom tanggal otomatis empat atau lima.
- Pembayaran tampil tepat pada tanggal transaksi.
- Saldo awal, total pembayaran, dan saldo akhir benar.
- Filter hari dan resort tidak mencampur data.
- Export menghasilkan data yang sama dengan report.

