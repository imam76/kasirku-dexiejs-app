# Terminologi Laporan Rekap Koperasi Simpan Usaha

Dokumen ini menjelaskan istilah-istilah pada laporan rekap harian koperasi simpan usaha. Laporan ini digunakan untuk memantau perkembangan anggota, target angsuran, realisasi setoran, pencairan/drop, tabungan keluar, dan posisi tunai.

## 1. HARI

**HARI** adalah hari operasional laporan atau hari penagihan.

Contoh:

```text
SELASA
RABU
KAMIS
JUMAT
```

Biasanya setiap baris mewakili aktivitas penagihan/setoran pada hari tersebut.

---

## 2. ANGGOTA

Bagian **ANGGOTA** menunjukkan pergerakan jumlah anggota pada hari tersebut.

### L / Lama

**L** berarti **Lama**.

Ini adalah jumlah anggota lama, yaitu anggota yang sudah terdaftar atau sudah aktif dari periode sebelumnya.

Contoh:

```text
L = 229
```

Artinya terdapat 229 anggota lama.

### B / Baru

**B** berarti **Baru**.

Ini adalah jumlah anggota baru pada hari tersebut. Dalam konteks koperasi simpan usaha, anggota baru bisa berarti anggota yang baru masuk, baru aktif, atau anggota yang baru menerima fasilitas pinjaman/drop.

Contoh:

```text
B = 5
```

Artinya terdapat 5 anggota baru.

### K / Keluar

**K** berarti **Keluar**.

Ini adalah jumlah anggota yang keluar, lunas, tidak aktif, atau tidak lagi masuk dalam daftar tagihan berjalan.

Contoh:

```text
K = 5
```

Artinya terdapat 5 anggota keluar.

### JML / Jumlah

**JML** berarti **Jumlah**.

Ini adalah jumlah anggota akhir setelah memperhitungkan anggota lama, anggota baru, dan anggota keluar.

Rumus umum:

```text
JML = L + B - K
```

Contoh:

```text
L = 229
B = 5
K = 5

JML = 229 + 5 - 5
JML = 229
```

Artinya jumlah anggota akhir tetap 229.

---

## 3. TARGET LAMA

**Target Lama** adalah target angsuran/tagihan dari anggota lama.

Kolom ini menunjukkan nilai tagihan yang seharusnya ditagih dari anggota lama pada hari tersebut.

Contoh:

```text
Target Lama = 33,895,000
```

Artinya target tagihan dari anggota lama adalah Rp33.895.000.

---

## 4. ANGSURAN

Bagian **ANGSURAN** berisi nilai transaksi angsuran yang memengaruhi target.

### Masuk

**Angsuran Masuk** adalah nilai angsuran atau pembayaran yang masuk dari anggota.

Contoh:

```text
Angsuran Masuk = 630,000
```

Artinya ada pembayaran angsuran masuk sebesar Rp630.000.

### Keluar

**Angsuran Keluar** adalah nilai angsuran yang keluar, dikoreksi, dialihkan, atau menjadi pengurang dalam perhitungan target.

Makna pastinya dapat mengikuti aturan internal koperasi.

Kemungkinan arti **Angsuran Keluar**:

```text
- koreksi angsuran
- angsuran yang dipindahkan
- pembatalan transaksi
- nilai pengurang target
- transaksi keluar yang memengaruhi saldo/target angsuran
```

Kolom ini perlu dikonfirmasi lagi ke pihak koperasi karena istilah “angsuran keluar” tidak selalu baku di semua koperasi.

---

## 5. TARGET BARU

**Target Baru** adalah target angsuran terbaru setelah memperhitungkan perubahan dari angsuran masuk dan angsuran keluar.

Rumus yang terlihat dari laporan:

```text
Target Baru = Target Lama + Angsuran Masuk - Angsuran Keluar
```

Contoh:

```text
Target Lama      = 33,895,000
Angsuran Masuk   = 630,000
Angsuran Keluar  = 580,000

Target Baru = 33,895,000 + 630,000 - 580,000
Target Baru = 33,945,000
```

Artinya target baru menjadi Rp33.945.000.

---

## 6. STORTING

**Storting** adalah realisasi setoran hasil penagihan.

Dalam konteks koperasi, storting biasanya berarti uang yang berhasil ditagih dan disetor oleh petugas/kolektor.

Contoh:

```text
Storting = 18,850,000
```

Artinya realisasi setoran pada hari tersebut adalah Rp18.850.000.

Storting digunakan untuk melihat berapa besar target yang berhasil terealisasi.

---

## 7. PERSENTASE %

Kolom **%** menunjukkan persentase pencapaian storting terhadap target baru.

Rumus umum:

```text
% = Storting / Target Baru × 100%
```

Contoh:

```text
Target Baru = 33,945,000
Storting    = 18,850,000

% = 18,850,000 / 33,945,000 × 100%
% ≈ 56%
```

Jika hasilnya lebih dari 100%, berarti realisasi setoran lebih besar daripada target baru.

Contoh:

```text
Target Baru = 35,790,000
Storting    = 38,305,000

% = 38,305,000 / 35,790,000 × 100%
% ≈ 107%
```

Artinya pencapaian melebihi target.

---

## 8. TARGET 10%

Kolom **10%** adalah **target angsuran kategori 10%**.

Kolom ini bukan potongan, bukan fee, dan bukan tabungan keluar. Kolom ini diperlakukan sebagai salah satu jenis target dalam laporan koperasi.

Contoh:

```text
10% = 630,000
```

Artinya target angsuran kategori 10% pada hari tersebut adalah Rp630.000.

Catatan penting:

```text
Kolom 10% dipahami sebagai TARGET, bukan otomatis potongan 10% dari kolom lain.
```

Jika sistem dibuat, kolom ini sebaiknya disimpan sebagai field target tersendiri:

```text
target_10_persen
```

---

## 9. DROP

**Drop** adalah pencairan pinjaman kepada anggota.

Dalam koperasi simpan usaha, istilah **drop** biasanya digunakan untuk menyebut uang yang dikeluarkan koperasi kepada anggota sebagai pinjaman baru atau pencairan pembiayaan.

Bagian drop terdiri dari:

```text
Drop Lalu
Drop Kini
Drop Berjalan
```

### Drop Lalu

**Drop Lalu** adalah nilai drop/pencairan sebelumnya atau saldo drop dari periode sebelumnya.

Contoh:

```text
Drop Lalu = 6,300,000
```

Artinya sebelum transaksi hari ini, sudah ada drop berjalan sebesar Rp6.300.000.

### Drop Kini

**Drop Kini** adalah nilai drop/pencairan pada hari tersebut.

Contoh:

```text
Drop Kini = 11,200,000
```

Artinya pada hari tersebut ada pencairan/drop sebesar Rp11.200.000.

### Drop Berjalan

**Drop Berjalan** adalah akumulasi drop sampai hari tersebut.

Rumus umum:

```text
Drop Berjalan = Drop Lalu + Drop Kini
```

Contoh:

```text
Drop Lalu = 6,300,000
Drop Kini = 11,200,000

Drop Berjalan = 17,500,000
```

Artinya total drop berjalan sampai hari itu adalah Rp17.500.000.

---

## 10. STORTING BERJALAN

**Storting Berjalan** adalah akumulasi storting dari hari ke hari dalam periode laporan.

Berbeda dengan kolom **Storting** biasa yang menunjukkan setoran hari itu, **Storting Berjalan** menunjukkan total setoran yang sudah terkumpul sampai hari tersebut.

Rumus umum:

```text
Storting Berjalan = Storting Berjalan Sebelumnya + Storting Hari Ini
```

Contoh:

```text
Storting Selasa = 18,850,000
Storting Rabu   = 35,820,000

Storting Berjalan Rabu = 18,850,000 + 35,820,000
Storting Berjalan Rabu = 54,670,000
```

Artinya sampai hari Rabu, total storting berjalan adalah Rp54.670.000.

---

## 11. TAB KELUAR

**TAB Keluar** kemungkinan berarti **Tabungan Keluar**.

Ini adalah nilai tabungan atau simpanan anggota yang keluar dari koperasi.

Contoh:

```text
TAB Keluar = 290,000
```

Artinya ada tabungan anggota yang keluar sebesar Rp290.000.

Kemungkinan konteks **TAB Keluar**:

```text
- anggota menarik tabungan
- anggota keluar dan simpanannya dikembalikan
- tabungan dipakai untuk menutup kewajiban
- transaksi simpanan keluar lainnya
```

---

## 12. TUNAI

**Tunai** adalah posisi uang tunai bersih pada laporan.

Kolom ini menunjukkan nilai kas/tunai setelah memperhitungkan uang masuk dan uang keluar pada hari atau periode tersebut.

Secara konsep:

```text
Tunai = Total Uang Masuk - Total Uang Keluar
```

Komponen uang masuk bisa berasal dari:

```text
- storting
- angsuran masuk
- setoran anggota
- penerimaan lainnya
```

Komponen uang keluar bisa berasal dari:

```text
- drop/pencairan pinjaman
- tabungan keluar
- angsuran keluar
- koreksi/pengeluaran lain
```

Rumus pasti kolom **Tunai** perlu mengikuti aturan koperasi, karena bisa berbeda tergantung kebiasaan pencatatan internal.

---

# Ringkasan Terminologi

```text
HARI
Hari operasional laporan.

L / Lama
Jumlah anggota lama.

B / Baru
Jumlah anggota baru.

K / Keluar
Jumlah anggota keluar.

JML / Jumlah
Jumlah anggota akhir.
Rumus: JML = L + B - K

Target Lama
Target angsuran dari anggota lama.

Angsuran Masuk
Nilai angsuran/pembayaran yang masuk.

Angsuran Keluar
Nilai angsuran yang keluar, dikoreksi, atau menjadi pengurang.

Target Baru
Target angsuran terbaru.
Rumus: Target Baru = Target Lama + Angsuran Masuk - Angsuran Keluar

Storting
Realisasi setoran hasil penagihan.

%
Persentase pencapaian storting terhadap target baru.
Rumus: % = Storting / Target Baru × 100%

10%
Target angsuran kategori 10%.

Drop
Pencairan pinjaman kepada anggota.

Drop Lalu
Nilai drop sebelumnya.

Drop Kini
Nilai drop hari ini.

Drop Berjalan
Akumulasi drop sampai hari berjalan.
Rumus: Drop Berjalan = Drop Lalu + Drop Kini

Storting Berjalan
Akumulasi setoran/storting sampai hari berjalan.

TAB Keluar
Tabungan/simpanan anggota yang keluar.

Tunai
Kas/tunai bersih akhir.
```

---

# Catatan Implementasi untuk AI / Developer

Saat membangun sistem berdasarkan laporan ini, jangan langsung menganggap semua kolom sebagai rumus akuntansi umum. Beberapa istilah berasal dari kebiasaan operasional koperasi.

Kolom yang cukup jelas:

```text
L
B
K
JML
Target Lama
Target Baru
Storting
%
10%
Drop Lalu
Drop Kini
Drop Berjalan
Storting Berjalan
TAB Keluar
```

Kolom yang masih perlu validasi aturan bisnis koperasi:

```text
Angsuran Keluar
Tunai
```

Struktur data minimal yang disarankan:

```text
tanggal
hari

anggota_lama
anggota_baru
anggota_keluar
anggota_jumlah

target_lama
angsuran_masuk
angsuran_keluar
target_baru

storting
persentase_storting
target_10_persen

drop_lalu
drop_kini
drop_berjalan

storting_berjalan
tabungan_keluar
tunai
```

Contoh nama field database:

```text
report_date
day_name

old_member_count
new_member_count
exit_member_count
total_member_count

old_target_amount
installment_in_amount
installment_out_amount
new_target_amount

storting_amount
storting_percentage
target_10_percent_amount

drop_previous_amount
drop_current_amount
drop_running_amount

running_storting_amount
saving_out_amount
cash_amount
```

Aturan dasar perhitungan yang bisa digunakan:

```text
anggota_jumlah = anggota_lama + anggota_baru - anggota_keluar

target_baru = target_lama + angsuran_masuk - angsuran_keluar

persentase_storting = storting / target_baru * 100

drop_berjalan = drop_lalu + drop_kini

storting_berjalan = storting_berjalan_sebelumnya + storting
```

Catatan khusus:

```text
Kolom 10% adalah target angsuran kategori 10%.
Jangan diperlakukan sebagai potongan otomatis, fee, atau tabungan.
```

Untuk tahap awal, sistem sebaiknya meniru format laporan manual terlebih dahulu. Setelah aturan bisnis koperasi dikonfirmasi, sistem bisa menambahkan perhitungan otomatis dan validasi balance.
