-- Ambang peringatan "stok menipis" per produk. Sebelum ini ambangnya konstanta
-- 10 yang tertanam di kode klien.
--
-- Kolomnya sengaja NULL-able TANPA DEFAULT: baris produk lama harus tetap kosong
-- supaya klien membacanya sebagai "pakai ambang bawaan aplikasi". Kalau diberi
-- DEFAULT 10, seluruh produk lama akan terkunci permanen ke angka yang kebetulan
-- berlaku hari ini dan ambang bawaannya tidak akan pernah bisa diubah lagi.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS min_stock DOUBLE PRECISION;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_min_stock_check;
ALTER TABLE products
    ADD CONSTRAINT products_min_stock_check
    CHECK (min_stock IS NULL OR min_stock >= 0);
