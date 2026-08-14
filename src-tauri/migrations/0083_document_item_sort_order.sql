-- Item dokumen sales/purchase tidak punya kolom urutan: Dexie maupun Postgres membaca
-- baris terurut primary key (UUID), sehingga urutan input user teracak setiap dokumen
-- dibuka ulang. sort_order diisi klien dari index array baris pada saat simpan; baris
-- lama yang bernilai NULL di-fallback ke created_at oleh pembaca.

ALTER TABLE sales_document_items
    ADD COLUMN IF NOT EXISTS sort_order INTEGER;

ALTER TABLE purchase_document_items
    ADD COLUMN IF NOT EXISTS sort_order INTEGER;
