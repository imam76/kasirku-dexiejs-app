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
