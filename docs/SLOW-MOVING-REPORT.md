# Laporan produk slow moving

Buka **Laporan → Laporan Produk Slow Moving** (`/report/slow-moving-report`).

- Periode: hari ini, minggu ini, minggu lalu, bulan ini, bulan lalu, atau tanggal sendiri. Mengikuti zona waktu aplikasi (Asia/Jakarta); kedua tanggal termasuk dalam perhitungan. Periode berjalan berakhir hari ini.
- Awalnya menampilkan produk yang masih punya stok dan perlu perhatian pada bulan ini. Cari nama/SKU, pilih kategori, status performa, atau tampilkan semua stok.
- **Belum terjual:** tidak ada penjualan maupun retur di periode ini.
- **Penjualan bersih nol / negatif:** jumlah terjual dikurangi retur tidak positif.
- **Slow moving:** penjualan bersih positif dan paling banyak batas yang dipilih (awal: 5 satuan stok **selama seluruh periode**, bukan per hari).
- **Di atas batas:** penjualan bersih melebihi batas. Ini bukan penilaian laba produk.
- Stok habis/negatif dibedakan dari produk slow moving. Produk dengan jumlah atau konversi yang tidak valid ditandai untuk diperiksa, bukan dianggap tidak terjual.

Sumber penjualan adalah transaksi POS aktif (termasuk restoran, tanpa transaksi pengeluaran) dan faktur penjualan berstatus ISSUED. Penawaran, pesanan, surat jalan, draft, dan transaksi batal tidak dihitung. Retur ISSUED dari POS/faktur dikurangi pada tanggal dokumen retur, termasuk retur atas penjualan periode sebelumnya; retur surat jalan tidak termasuk. Penjualan POS memakai tanggal transaksi, faktur/retur memakai tanggal dokumen.

Jumlah dikonversi ke satuan stok masing-masing produk. Snapshot konversi POS diprioritaskan, termasuk untuk retur dalam satuan asal yang sama. Konversi faktur dan data lama memakai aturan satuan produk saat ini. Jumlah transaksi dihitung unik per produk; tanggal terakhir terjual hanya di dalam periode yang dipilih. Rata-rata harian adalah penjualan bersih dibagi jumlah hari kalender inklusif pada periode itu.

Laporan mencakup produk barang jadi yang masih ada di master, termasuk yang tidak terlihat di POS. Produk yang baru dibuat setelah akhir periode dan bahan baku tidak disertakan. Produk baru pada periode pilihan diberi label. Stok yang ditampilkan adalah **stok saat ini**; laporan ini tidak mengetahui apakah barang tersedia sepanjang periode. Angka mengikuti data lokal dan status dokumen terkini, bukan snapshot penutupan historis.

CSV mengekspor seluruh hasil filter, termasuk halaman tabel yang belum dibuka, bersama periode dan aturan penilaian. Hak akses: `REPORT_SLOW_MOVING_VIEW`, bawaan untuk Owner, Admin, dan Gudang; tersedia bila modul PRODUCT atau REPORT_POS_SALES aktif. Tidak ada migrasi database tambahan.

Verifikasi: `bun test tests/unit/slow-moving-report.test.ts` dan `bunx playwright test tests/e2e/slow-moving-report.spec.ts --project=chromium`.
