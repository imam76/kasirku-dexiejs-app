# Laporan Persediaan

Menu **Laporan > Laporan Persediaan** (`/report/inventory-report`) menampilkan
kuantitas dan nilai stok produk saat ini dari database lokal. Data berubah
otomatis saat produk atau lot persediaan diperbarui, termasuk hasil sinkronisasi.
Laporan ini belum menyediakan saldo historis per tanggal.

## Isi laporan

- Nama, SKU, kategori, stok dalam satuan dasar produk, dan status stok.
- Modal rata-rata per satuan, nilai persediaan per produk, dan dasar penilaiannya.
- Jumlah produk, total stok per satuan, serta total nilai sesuai filter.
- Pencarian nama/SKU, kategori, jenis produk, dan status stok. Default: ada stok.
- Ekspor Excel (ringkasan dan rincian) atau CSV untuk seluruh hasil filter,
  termasuk baris di halaman tabel berikutnya.

## Dasar nilai

1. Jika kuantitas lot sama dengan stok produk, nilai dihitung dari jumlah
   `fifo_remaining × cost_per_unit` seluruh lot tersisa. Biaya efektif dan saldo
   ini mengikuti pembaca FIFO transaksi. `quantity_remaining` tidak digunakan
   karena bisa tertinggal dari konsumsi perangkat lain.
2. Lot berharga `ESTIMATED` tetap dihitung dan diberi penanda estimasi.
3. Jika catatan lot belum lengkap atau jumlahnya berbeda, seluruh stok produk
   dinilai dengan `stock × purchase_price` sebagai **estimasi harga master**.
   Selisih stok tetap ditandai untuk diperiksa.
4. Harga `PENDING`, biaya lot tidak valid, stok negatif, atau saldo lot tidak valid
   membuat nilai produk kosong. Produk tersebut dikecualikan dari total nilai
   dan jumlah produk yang belum dinilai ditampilkan. Tidak ada harga master yang
   valid saat fallback juga menghasilkan nilai kosong.
5. Stok nol bernilai nol. Lot habis atau digantikan saldo awal (`fifo_excluded`)
   tidak ikut dihitung. Lot final dengan harga nol tetap merupakan nilai sah.

Jumlah kg, pcs, dan satuan lain ditampilkan terpisah. Nilai ditampilkan dalam
mata uang dasar aplikasi. Nilai ini merupakan rincian operasional persediaan;
estimasi dan selisih perlu diselesaikan sebelum dibandingkan dengan neraca.

## Akses dan implementasi

Menggunakan permission `REPORT_INVENTORY_VIEW`, tersedia pada modul `PRODUCT`
atau `REPORT_STOCK_CARD`. Default role Owner, Admin, dan Gudang mendapat akses;
role khusus dapat diberi permission melalui pengaturan role. Pembaca laporan
memeriksa permission dan hanya membaca database, tanpa memperbarui sesi,
stok, lot, atau jurnal.

Uji terkait: `tests/unit/inventory-report.test.ts` dan
`tests/e2e/inventory-report.spec.ts`.
