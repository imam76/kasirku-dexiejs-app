# PRD — Fitur Multi Unit pada Aplikasi POS

> **Versi:** 1.0 | **Status:** Draft | **Tanggal:** April 2026 | **Tim:** Product & Engineering

---

## 1. Ringkasan Eksekutif

Fitur Multi Unit memungkinkan satu produk dijual dalam beberapa satuan ukuran berbeda (misalnya: PCS, LUSIN, DUS) dengan konversi tetap terhadap satu satuan dasar (base unit). Sistem secara otomatis mengelola stok lintas satuan, sehingga kasir tidak perlu input manual saat terjadi penjualan lintas unit.

Fitur ini krusial untuk bisnis retail, grosir, dan distribusi dengan ribuan SKU dan variasi kemasan.

> **Target utama:** Menghilangkan kesalahan hitung stok akibat konversi manual dan mempercepat proses transaksi di kasir untuk produk multi-kemasan.

---

## 2. Metrik Keberhasilan

| Metrik | Target |
|--------|--------|
| Kesalahan stok | Turun 80% vs. kondisi saat ini |
| Waktu setup produk | < 2 menit per produk multi-unit |
| Adopsi fitur | 70% merchant aktif dalam 60 hari |
| Akurasi konversi | 100% otomatis, tanpa input manual |

---

## 3. Kasus Penggunaan

### 3.1 Retail & Grosir
Menjual produk dalam kemasan kecil (PCS) sekaligus kemasan besar (DUS/BOX) pada satu entri produk yang sama.
**Contoh:** Mie instan dijual per bungkus (PCS) dan per dus isi 40.

### 3.2 Manajemen Stok Otomatis
Saat stok satuan kecil habis, sistem otomatis memecah satu unit besar sesuai rasio konversi (contoh: 1 kardus = 12 botol) tanpa input manual kasir.

### 3.3 Inventaris Fleksibel
Toko elektronik atau bahan bangunan bisa mengelola item satuan kecil (PCS) maupun paket besar (PAKET/KOTAK) dalam satu SKU yang sama.

---

## 4. Persyaratan Fungsional

> **Catatan Implementasi:** Gunakan dan ikuti struktur project saat ini. Sesuaikan penamaan file, folder, service, dan komponen dengan konvensi yang sudah ada di codebase.

### F-01 · Konfigurasi Base Unit & Multi Unit `[Prioritas Tinggi]`
Pengguna dapat menetapkan satu satuan dasar (base unit) pada setiap produk, lalu menambahkan satu atau lebih satuan turunan (multi unit) beserta rasio konversinya.

**Contoh:** Base = PCS → Multi Unit 1 = LUSIN (rasio 12) → Multi Unit 2 = DUS (rasio 48)

**Acceptance Criteria:**
- [ ] Admin dapat mengaktifkan toggle "Multi Unit" pada halaman produk
- [ ] Sistem hanya mengizinkan satu base unit per produk
- [ ] Rasio konversi harus bilangan bulat positif (≥ 2)
- [ ] Dapat menambah maksimal 10 satuan turunan per produk

---

### F-02 · Harga per Unit `[Prioritas Tinggi]`
Setiap satuan memiliki harga jual yang dapat dikonfigurasi secara independen. Sistem dapat menghitung harga multi unit otomatis berdasarkan `harga base unit × rasio konversi`, namun dapat di-override secara manual.

**Acceptance Criteria:**
- [ ] Harga multi unit terhitung otomatis saat rasio diisi
- [ ] Harga dapat di-override secara manual per satuan
- [ ] Harga tampil sesuai satuan yang dipilih di halaman kasir

---

### F-03 · Pengurangan Stok Otomatis Lintas Satuan `[Prioritas Tinggi]`
Saat transaksi penjualan terjadi, stok dikurangi dalam satuan dasar. Jika stok base unit tidak mencukupi, sistem secara otomatis memecah unit yang lebih besar (auto-break) untuk memenuhi kebutuhan stok. Setiap pemecahan dicatat dalam log inventaris.

**Acceptance Criteria:**
- [ ] Pengurangan stok bersifat atomic (tidak boleh partial deduction)
- [ ] Auto-break hanya terjadi jika diaktifkan pada konfigurasi produk
- [ ] Setiap auto-break tercatat di log dengan timestamp dan user
- [ ] Transaksi gagal jika total stok (semua satuan) tidak mencukupi

---

### F-04 · Tampilan Stok per Satuan di Kasir `[Prioritas Tinggi]`
Kasir dapat memilih satuan produk saat transaksi (PCS / LUSIN / DUS). Sistem menampilkan sisa stok yang tersedia dalam satuan yang dipilih secara real-time.

**Acceptance Criteria:**
- [ ] Dropdown satuan tersedia di halaman kasir untuk produk multi-unit
- [ ] Sisa stok tampil dalam satuan yang sedang dipilih
- [ ] Perubahan satuan memperbarui harga secara instan

---

### F-05 · Pembelian (Pengadaan) Multi Unit `[Prioritas Menengah]`
Saat mencatat pembelian/penerimaan barang, pengguna bisa menginput stok dalam satuan multi unit (contoh: terima 5 DUS). Sistem otomatis mengkonversi ke base unit dan menambahkan ke stok.

**Acceptance Criteria:**
- [ ] Form penerimaan barang mendukung pemilihan satuan input
- [ ] Konversi ke base unit berjalan otomatis saat disimpan
- [ ] Riwayat penerimaan mencatat satuan asli dan ekuivalennya

---

### F-06 · Laporan Stok per Satuan `[Prioritas Menengah]`
Laporan inventaris menampilkan stok dalam satuan dasar (canonical) maupun tampilan multi unit yang dapat dipilih oleh pengguna. Tersedia filter per kategori dan satuan.

**Acceptance Criteria:**
- [ ] Laporan dapat ditampilkan dalam base unit maupun multi unit pilihan
- [ ] Filter berdasarkan kategori dan satuan tersedia
- [ ] Laporan dapat diekspor (format mengikuti fitur ekspor yang sudah ada)

---

### F-07 · Barcode per Satuan `[Prioritas Rendah]`
Mendukung barcode berbeda untuk setiap satuan (PCS vs DUS) pada satu produk. Saat barcode dipindai, sistem mengenali satuan yang sesuai dan memilihnya secara otomatis.

**Acceptance Criteria:**
- [ ] Setiap satuan dapat memiliki barcode tersendiri
- [ ] Pemindaian barcode otomatis memilih satuan yang sesuai di kasir

---

## 5. Alur Kerja Utama

```
1. Setup Produk
   Admin → Halaman Produk → Aktifkan Multi Unit
   → Tetapkan base unit → Tambah unit turunan + rasio + harga

2. Penerimaan Barang
   Input stok (mis. 10 DUS) → Sistem konversi ke base unit
   → (10 × 48 = 480 PCS) → Stok bertambah

3. Transaksi Kasir
   Pilih produk → Pilih satuan → Sistem tampilkan harga & stok
   → Checkout → Stok dikurangi otomatis dalam base unit

4. Auto-break Stok (Opsional)
   Stok PCS habis → Sistem pecah 1 DUS menjadi 48 PCS
   → Transaksi dilanjutkan → Dicatat di log

5. Laporan & Rekonsiliasi
   Manajer → Laporan stok → Pilih tampilan satuan
   → Unduh laporan
```

---

## 6. Aturan Bisnis

- Setiap produk hanya boleh memiliki **satu base unit**. Satuan turunan boleh lebih dari satu.
- Rasio konversi harus **bilangan bulat positif (≥ 2)**.
- Harga multi unit default = `harga base unit × rasio`; dapat di-override manual.
- Pengurangan stok selalu dilakukan dalam **base unit**. Tampilan satuan lain bersifat presentasi.
- Auto-break stok hanya terjadi jika **diaktifkan** pada konfigurasi produk (dapat dinonaktifkan per produk).
- Penghapusan satuan turunan hanya dapat dilakukan jika **tidak ada transaksi aktif** yang menggunakan satuan tersebut.
- Perubahan rasio konversi memerlukan konfirmasi dan **tidak berlaku retroaktif** terhadap transaksi historis.

---

## 7. Persyaratan Non-Fungsional

| Aspek | Persyaratan |
|-------|-------------|
| Performa | Kalkulasi konversi stok selesai dalam < 200ms per transaksi, tidak memblokir UI kasir |
| Konsistensi Data | Pengurangan stok bersifat atomic — tidak boleh partial deduction saat sistem gagal di tengah transaksi |
| Skalabilitas | Mendukung produk hingga 10 satuan turunan dan katalog hingga 100.000 SKU |
| Kemudahan Pakai | Konfigurasi multi unit dapat diselesaikan operator tanpa pelatihan teknis khusus (< 2 menit per produk) |
| Audit Trail | Setiap auto-break dan perubahan konversi tercatat di log dengan timestamp dan user yang melakukan |

---

## 8. Panduan Implementasi

> **Gunakan dan ikuti struktur project saat ini.** Semua file, folder, service, komponen, dan penamaan variabel harus mengikuti konvensi yang sudah ada di codebase. Jangan membuat pola arsitektur baru jika sudah ada padanannya di project.

Hal-hal yang perlu disesuaikan dengan struktur project:

- **Model / Schema** — Tambahkan field multi unit mengikuti konvensi model yang sudah ada (ORM, migrasi, validasi).
- **Service / Business Logic** — Tempatkan logika konversi dan auto-break di layer service yang sudah berjalan.
- **API Endpoint** — Ikuti pola routing dan format response yang sudah digunakan di endpoint lain.
- **Komponen UI** — Gunakan komponen, design system, dan state management yang sudah tersedia.
- **Testing** — Tambahkan unit test dan integration test mengikuti struktur test yang sudah ada.
- **Migrasi Database** — Ikuti alur migrasi yang sudah digunakan tim (misal: Flyway, Alembic, Rails migrate, dsb.).

---

## 9. Roadmap Rilis

| Fase | Scope | Target | Status |
|------|-------|--------|--------|
| MVP (v1.0) | F-01, F-02, F-03, F-04 | M+0 – M+2 | In Progress |
| v1.1 | F-05, F-06 | M+3 – M+4 | Planned |
| v1.2 | F-07 | M+5 – M+6 | Backlog |

---

## 10. Asumsi & Ketergantungan

- Modul manajemen produk dan inventaris sudah tersedia dan dapat dimodifikasi untuk menampung field multi unit.
- Database mendukung transaksi atomic (ACID) untuk menjamin konsistensi pengurangan stok lintas satuan.
- Antarmuka kasir sudah menggunakan komponen yang dapat menerima parameter satuan secara dinamis.
- Fitur ini tidak memerlukan perubahan pada skema pajak atau diskon yang sudah berjalan.

---

## 11. Out of Scope

- Konversi satuan dengan rasio desimal / tidak tetap (misalnya satuan berat yang berfluktuasi).
- Bundling produk yang menggabungkan SKU berbeda menjadi satu paket (fitur terpisah).
- Migrasi data otomatis produk lama — akan ditangani melalui proses onboarding terpisah.