# Rencana Implementasi: Dynamic Unit Conversion Registry

Sistem konversi satuan akan diubah dari hardcoded menjadi berbasis registry yang disimpan di database. Ini memungkinkan fleksibilitas untuk berbagai jenis usaha (toko kelontong, jasa, dll).

## 1. Perubahan Struktur Data & Database
- [ ] **Update `src/types/index.ts`**:
    - Tambahkan interface `UnitConversion`.
    - Ubah `ProductUnit` menjadi `string` (alias) agar dinamis.
- [ ] **Update `src/lib/db.ts`**:
    - Tambahkan tabel `unit_conversions` (id, fromUnit, toUnit, ratio, isPreset, label).
    - Tambahkan inisialisasi preset (kg -> gram, gram -> kg, ons -> gram, kg -> ons).

## 2. Refactor Utilitas Pricing
- [ ] **Update `src/utils/pricing.ts`**:
    - Implementasi registry-based logic untuk `konversiSatuan`.
    - Update `normalisasiHarga` dan `getPrice` agar mengambil rasio dari DB (atau cache store).
    - Tambahkan fallback ke rasio 1 jika konversi tidak ditemukan.

## 3. UI Manajemen Satuan
- [ ] **Buat `src/view/UnitManagement.tsx`**:
    - Tabel daftar konversi (Sistem vs User).
    - Form tambah konversi baru (fromUnit, toUnit, ratio).
    - Validasi agar preset tidak bisa dihapus.
- [ ] **Daftarkan Route**: Tambahkan menu "Satuan & Konversi" di sidebar/navigation.

## 4. Integrasi ke Manajemen Stok
- [ ] **Update `src/view/stock-management/StockProductModal.tsx`**:
    - Dropdown satuan beli/jual diambil dari registry.
    - Warning jika kombinasi satuan belum terdaftar konversinya.
- [ ] **Update `src/hooks/useStockManagement.tsx`**:
    - Integrasi pengambilan data unit dari DB.

## 5. Integrasi ke POS (Point of Sale)
- [ ] **Update `src/store/transactionStore.ts`**:
    - Pastikan logika `addToCart` dan `updateQuantity` menggunakan utilitas pricing yang baru.
- [ ] **Update `src/components/CartItem.tsx` & `src/components/ProductList.tsx`**:
    - Penyesuaian tampilan untuk mendukung satuan dinamis.

---
*Status: Perencanaan Selesai. Siap untuk implementasi.*

# Rencana Implementasi: Laporan Pengeluaran (Expense Report)

Halaman laporan baru untuk memantau semua pengeluaran (EXPENSE) dari tabel `financeTransactions`.

## 1. Persiapan Data & Hook
- [ ] **Update `src/hooks/useReports.tsx`**:
    - Tambahkan `useExpenseReport` untuk mengambil data dari `db.financeTransactions`.
    - Filter berdasarkan `type === 'EXPENSE'`, range tanggal, dan kategori.
    - Urutkan berdasarkan `created_at` descending.
    - Ambil daftar kategori unik dari `db.financeTransactions` bertipe `EXPENSE` secara dinamis.

## 2. UI Laporan Pengeluaran
- [ ] **Buat `src/view/ExpenseReport.tsx`**:
    - Filter Section:
        - Multi-select dropdown untuk Kategori (dinamis dari DB).
        - Date Range Picker dengan shortcuts (Today, Yesterday, This Week, This Month, Last Month, Custom).
        - Default: Hari ini.
    - Breakdown Section:
        - Ringkasan pengeluaran per kategori (misal: Pembelian Stok: Rp X | Operasional: Rp Y).
    - Table Section:
        - Kolom: Tanggal & Jam, Keterangan/Deskripsi, Kategori (Badge), Nominal (IDR).
        - Footer: Total keseluruhan.
    - Empty State: Tampilkan pesan informatif jika tidak ada data.

## 3. Fitur Export
- [ ] **Install Dependencies**: `jspdf`, `jspdf-autotable`, `xlsx`.
- [ ] **Implementasi Export PDF**:
    - Header: Judul, Periode, Tanggal Cetak.
    - Tabel: Data transaksi sesuai filter (tanpa elemen UI).
    - Footer: Total nominal.
- [ ] **Implementasi Export Excel**:
    - Header: Judul, Periode, Tanggal Cetak.
    - Tabel: Data transaksi sesuai filter.
    - Total di baris terakhir.

## 4. Routing & Navigasi
- [ ] **Daftarkan Route**: Tambahkan route `expense-report` di `src/routes/expense-report.lazy.tsx`.
- [ ] **Update Navigation**: Tambahkan menu "Laporan Pengeluaran" di sidebar/menu utama.

---
*Status: Perencanaan Laporan Pengeluaran Selesai. Siap untuk implementasi.*
