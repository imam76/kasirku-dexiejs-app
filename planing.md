Berikut adalah plan lengkap untuk modul keuangan yang bisa kamu integrasikan ke aplikasi POS-mu.Klik node mana saja untuk explore lebih dalam. Ini detail plan-nya:

---

**Konsep inti: Finance Bridge**

Karena POS-mu sudah jalan, kamu tidak perlu rebuild dari nol. Cukup buat satu "jembatan" yang otomatis menangkap data transaksi dari POS dan mengalirkannya ke modul keuangan. Penjualan = pemasukan otomatis, tanpa input dobel.

---

**4 komponen utama yang perlu dibangun:**

**1. Pemasukan (Laba Kotor)** — Ambil otomatis dari total omset transaksi POS harian. Tambahkan form input manual untuk pendapatan lain (misal: deposit, biaya layanan). Bisa difilter per kasir atau per sesi shift.

**2. Pengeluaran** — Form input manual dengan kategori: HPP (bisa dihitung otomatis dari data stok jika kamu punya modul stok), biaya operasional, gaji, dll. Tambahkan tombol "pengeluaran berulang" agar tidak input ulang tiap bulan.

**3. Saldo Awal** — Input kas pembuka per hari atau per shift. Ini penting agar perhitungan kas fisik akurat. Bisa di-reset tiap awal hari.

**4. Laba Bersih / Saldo yang Bisa Ditarik** — Kalkulasi otomatis:
> `Saldo Awal + Total Pemasukan − Total Pengeluaran = Laba Bersih`

Ini yang tampil sebagai "uang yang boleh ditarik" oleh pemilik.

---

**Urutan pengerjaan yang disarankan:**

Mulai dari yang paling mudah dan langsung berguna — **Dashboard ringkasan + integrasi data POS ke pemasukan** (fase 1), lalu **form pengeluaran + kalkulasi laba bersih** (fase 2), terakhir **laporan & export** (fase 3).

---

**Peningkatan Fitur Transaksi & Stok (Multi Unit & Produk Curah)**

Tujuan: Mendukung produk curah (gram/kg/ons) dan produk satuan (ikat/pcs) dengan konversi harga otomatis.

**Langkah-langkah Implementasi:**

1. **Update Data Structure (`src/types/index.ts`):**
   - Tambahkan field pada `Product`: `category`, `purchase_unit`, `selling_unit`.
   - Pastikan `purchase_price` dan `selling_price` konsisten dengan unit masing-masing.

2. **Modular Pricing Utilities (`src/utils/pricing.ts`):**
   - Implementasi `konversiSatuan(nilai, dari, ke)`: gram ↔ kg ↔ ons.
   - Implementasi `normalisasiHarga(harga, dariSatuan, keSatuan)`: Menghitung harga per unit jual.
   - Implementasi `hitungHargaJual(produk, jumlah)`: Menghitung total berdasarkan input (gram/ikat).

3. **UI & Logic Enhancements:**
   - **Manajemen Stok (`src/view/stock-management/StockProductModal.tsx`):** Tambahkan opsi satuan beli, satuan jual, dan kategori.
   - **Transaksi (`src/view/Transaction.tsx` & `src/hooks/useTransaction.tsx`):** 
     - Input jumlah yang mendukung gram untuk produk bumbu/sembako.
     - Konversi otomatis saat produk ditambahkan ke keranjang.
   - **Tampilan Keranjang (`src/components/CartItem.tsx`):** Tampilkan satuan (misal: "500 gram" atau "2 ikat").

4. **Sinkronisasi Stok:**
   - Pastikan pengurangan stok tetap akurat (konversi gram ke kg jika stok disimpan dalam kg).

---

Mau aku buatkan mockup UI-nya, atau langsung ke struktur database / kode untuk salah satu modul?