Analisis performa bayar/finish POS
================================

Analisis source checkout lokal dan benchmark IndexedDB sintetis, 14 September 2026. Keluhan yang diketahui: jeda terasa lebih dari 500 ms dan meningkat setelah pemakaian/data bertambah. Perangkat, transport printer, jumlah data, konfigurasi jurnal, dan status PostgreSQL client belum diketahui.

Update implementasi: optimasi awal 1 sampai 3 dilanjutkan dengan perbaikan pertumbuhan data pada FIFO, ringkasan sync, batch upload, dan katalog POS (Dexie v134). Uraian temuan dan tabel awal di bawah adalah catatan kondisi sebelum perbaikan, termasuk referensi baris source saat analisis. Hasil dan batasan implementasi terbaru ada pada bagian **Optimasi pertumbuhan data (v134)** di akhir dokumen.

Temuan mendukung hipotesis pertumbuhan data: ada pembacaan riwayat yang ukuran kerjanya bertambah seiring pemakaian. Penyebab dominan pada client belum dapat dipastikan tanpa pengukuran client. Benchmark ini tidak mengukur checkout lengkap atau printer fisik.

Alur yang membuat cetak ikut terlambat:

`Klik bayar -> validasi -> transaksi Dexie (FIFO, penjualan, pembayaran, jurnal, stok, outbox) -> enqueue tambahan -> checkout selesai -> pemicu cetak -> pengiriman ke printer -> simpan status cetak`.

[useTransaction.tsx](../src/hooks/useTransaction.tsx) menunggu `checkout()` pada baris 406 dan memanggil `printReceiptAfterTransaction()` pada baris 485. Cetak sudah dipanggil tanpa await, tetapi baru dimulai setelah checkout selesai. [receiptService.ts](../src/utils/printer/receiptService.ts) mengambil profil perusahaan berdasarkan primary key dan membangun struk dari snapshot transaksi yang diterima. Update status cetak dan enqueue ulang transaksi terjadi setelah pengiriman ke printer; bagian ini bisa menunda notifikasi berhasil, tetapi bukan penyebab tertundanya awal pengiriman cetak yang sama.

Temuan menurut prioritas:

1. **Lookup jurnal membaca seluruh riwayat jurnal POS untuk transaksi baru.**

   [generalLedgerService.ts](../src/services/generalLedgerService.ts), `getPostedJournalEntryForSource()` baris 639, memilih indeks `source_type`, kemudian memfilter `status`, `source_id`, dan `source_event` di callback. Untuk ID transaksi baru yang belum ada, query harus melewati seluruh entri dengan tipe `POS_TRANSACTION` sebelum mengembalikan hasil kosong. Ini terjadi di jalur `checkout -> postPosSaleJournal -> postBalancedJournalEntry`, di dalam transaksi tulis. Dampaknya bergantung pada aktifnya posting General Ledger: guard saat ini mensyaratkan modul aktif, setting siap, cutoff sesuai, kebijakan perpetual, dan periode yang dapat diposting.

   Perbaikan pertama yang paling terarah: gunakan indeks `source_id` yang sudah tersedia, lalu pertahankan pemeriksaan tipe, event, dan status. Dengan demikian, pemeriksaan idempotensi tetap berlaku tanpa menelusuri semua jurnal POS. Belum diterapkan ke source aplikasi.

2. **FIFO menghitung ulang konsumsi historis per produk pada setiap checkout.**

   [consumeFifoLots.ts](../src/utils/inventory/consumeFifoLots.ts), baris 58, mengambil semua lot produk, termasuk lot yang telah habis. [lotBalance.ts](../src/utils/inventory/lotBalance.ts), baris 23, membaca seluruh konsumsi dari seluruh lot tersebut dan menjumlahkannya ulang. [checkoutService.ts](../src/services/checkoutService.ts) menjalankan helper ini secara berurutan per baris keranjang. Beban bertambah menurut riwayat produk yang dijual, bukan hanya jumlah item checkout hari ini.

   Perbaikan struktural: saldo agregat per lot yang diperbarui secara atomik dan idempotent bersama perubahan ledger, termasuk konsumsi lokal, merge remote, reversal/void, restore, dan opening balance. Riwayat tetap tersedia untuk audit dan rekonstruksi. Jangan langsung mengganti perhitungan dengan `quantity_remaining`: [inventoryLotReadService.ts](../src/services/inventoryLotReadService.ts) sengaja tidak menimpa field tersebut pada lot lokal yang sudah ada, sehingga nilainya dapat tertinggal terhadap konsumsi perangkat lain. Desain saldo agregat perlu menangani kondisi tersebut.

3. **Indikator sinkronisasi memuat seluruh payload antrean berulang kali.**

   [useSyncStatus.ts](../src/hooks/useSyncStatus.ts), baris 37, melakukan `db.syncQueue.toArray()`, reduce untuk jumlah status, lalu filter/sort untuk entri synced terbaru dan tiga kegagalan. Hook dipasang lewat `SyncStatusIndicator` di layout root. Pembacaan dapat dijalankan ulang saat antrean berubah, termasuk enqueue checkout serta perubahan status processing/synced. Jumlah eksekusi aktual bergantung pada penggabungan notifikasi live query.

   `markQueueItemSynced()` pada [syncQueueService.ts](../src/services/syncQueueService.ts), baris 4301, mempertahankan row dan payload setelah berhasil. Tidak ditemukan pembersihan berkala antrean synced dalam jalur yang ditelusuri. Dengan demikian, riwayat yang sudah berhasil pun menambah biaya indikator. Ini merupakan beban background/UI dan kemungkinan kontensi, bukan await langsung pada `handleCheckout`.

   Perbaikan: hitung status lewat indeks, ambil data terakhir secara terbatas dengan indeks gabungan `[status+updated_at]`, dan hindari pemuatan payload historis hanya untuk badge. Pada data yang sangat besar, metadata ringkasan yang dipelihara saat mutasi dapat menghindari penghitungan ulang berulang. Kebijakan retensi antrean synced dapat dipertimbangkan terpisah dari riwayat transaksi.

4. **Daftar produk di POS membaca ulang seluruh katalog meskipun tampilan hanya 12 item.**

   [useTransaction.tsx](../src/hooks/useTransaction.tsx), baris 109, menjalankan `orderBy('name').filter(...).toArray()` sebelum pagination dengan `slice`. Hook lain pada baris 144 mengambil `db.products.toArray()` untuk lookup SKU dan kategori. Perubahan stok saat checkout atau metadata produk saat sync dapat memicu pembacaan ulang dan pembangunan ulang lookup. Ini bergantung pada ukuran katalog, dan merupakan kandidat tambahan untuk UI yang tersendat setelah transaksi.

   Perbaikan: pagination/query yang membatasi hasil sebelum materialisasi, lookup SKU melalui indeks, dan pemisahan kebutuhan metadata katalog dari update stok. Kombinasi pencarian, kategori, dan aturan visibilitas tetap harus dipertahankan.

5. **Backlog sync masih menambah pekerjaan setelah commit lokal.**

   [checkoutService.ts](../src/services/checkoutService.ts), baris 847, masih menunggu enqueue produk terdampak dan finance/member sebelum return. `enqueuePendingProductsForSync()` sudah memakai `bulkGet` untuk produk terkait, tetapi deduplikasi masih membaca semua antrean berstatus pending/processing/failed sebelum memfilter entity dan mencari per produk. `processPendingSyncQueue()` baris 6856 membaca dan mengurutkan semua row pending sebelum memproses 20 row; batch berikutnya membaca ulang sisa backlog.

   Upload PostgreSQL dipicu melalui `void processPendingSyncQueue()`, sehingga checkout tidak menunggu penyelesaian upload. Koneksi lambat tetap dapat memperbesar backlog dan pekerjaan background, tetapi tidak tepat menyimpulkan bahwa checkout secara langsung menunggu server. Gunakan query antrean per entity/ID dan pengambilan batch melalui indeks dengan urutan dependensi yang tetap benar. Lengkapi outbox dalam commit atomik sebelum menggeser pekerjaan tambahan keluar dari jalur cetak.

Benchmark yang dapat dijalankan ulang:

```sh
node scripts/diagnostics/pos-checkout-read-benchmark.mjs
```

[Script diagnostik](../scripts/diagnostics/pos-checkout-read-benchmark.mjs) memakai Chromium 148.0.7778.96, Dexie yang terpasang di repo, profil browser sementara, dan database sintetis tersendiri. Helper lookup jurnal dan saldo FIFO diekstrak dari source aktual dan ditranspilasi; query indikator meniru callback `useSyncStatus`. Tidak ada data client, PostgreSQL, pembayaran, atau printer yang diakses. Database sintetis dihapus setelah tiap skenario dan browser ditutup.

Setiap angka adalah median tiga pengulangan setelah satu warm-up. Kolom jumlah baris berlaku per tabel: jurnal POS, antrean synced, dan konsumsi lot untuk satu produk. Terdapat 100 konsumsi per lot; payload antrean sintetis berisi teks sekitar 1 KB. Ukuran riwayat per produk pada kasus terbesar adalah stress case, bukan asumsi jumlah data client. Kandidat query indikator diuji dengan indeks gabungan tambahan pada schema sintetis; indeks tersebut belum ditambahkan ke aplikasi.

| Baris per tabel | Lookup jurnal sekarang | Lookup lewat source_id | Indikator sync sekarang | Kandidat indikator berindeks | Baca riwayat FIFO satu produk |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1.000 | 13,1 ms | 0,3 ms | 13,0 ms | 4,4 ms | 14,5 ms |
| 10.000 | 124,3 ms | 0,2 ms | 83,1 ms | 37,3 ms | 135,9 ms |
| 50.000 | 681,5 ms | 0,2 ms | 431,5 ms | 210,9 ms | 733,8 ms |

Angka antarquery tidak boleh langsung dijumlahkan sebagai durasi checkout: sebagian merupakan query background, tiap pengukuran terisolasi, dan skenario belum mencakup render React, seluruh transaksi tulis, I/O perangkat kasir, atau transport printer. Data indikator seluruhnya synced dan timestamp sama, sehingga belum menggambarkan semua distribusi antrean nyata. Hasil cukup menunjukkan pertumbuhan biaya query dan menguji kandidat lookup, bukan menetapkan SLA produksi. Penghitungan status berindeks juga masih bertambah biayanya pada benchmark ini.

Validasi yang sudah dilakukan: dua test pada `tests/unit/pos-checkout-performance.test.ts` lulus; `node --check` untuk script diagnostik lulus. Test yang tersedia memeriksa struktur source (tidak ada recovery sweep global pada checkout dan penggunaan bulkGet/filter status tertentu), bukan batas latensi atau perilaku dataset besar. Karena itu test lulus tetap konsisten dengan temuan di atas.

Urutan tindak lanjut yang disarankan:

1. Ukur pada client: total klik sampai commit, FIFO, posting jurnal, enqueue setelah commit, waktu mulai print, durasi transport printer, dan penyimpanan status print. Sertakan jumlah jurnal POS, lot/konsumsi untuk produk dalam keranjang, produk katalog, serta antrean per status. Gunakan timing sinkron seperti `performance.now()`; jangan menyisipkan await non-Dexie ke transaksi IndexedDB hanya untuk instrumentasi.
2. Terapkan lookup jurnal lewat `source_id` dan optimasi indikator sync. Validasi transaksi baru, retry sumber sama, sumber dengan event berbeda, serta jurnal reversed agar idempotensi tidak berubah.
3. Perbaiki pembacaan katalog dan backlog; lanjutkan desain saldo FIFO incremental dengan uji konsistensi lintas perangkat, void, restore, dan opening balance.
4. Bandingkan p50/p95 durasi checkout dan jeda awal cetak pada dataset kecil/besar, keranjang satu/beberapa produk, serta sync idle/aktif. Transport printer diperiksa dari pengukuran durasinya sendiri setelah waktu mulai print jelas.

Implementasi rekomendasi 1 sampai 3:

- Lookup jurnal sekarang menggunakan indeks `source_id`, kemudian memeriksa status, tipe sumber, dan event. Retry dengan isi sama menggunakan jurnal yang sudah ada; perubahan isi tetap melakukan reversal sesuai perilaku sebelumnya.
- `readSyncStatusSnapshot()` menggantikan pemuatan seluruh antrean pada indikator: empat native count berdasarkan status, satu key indeks untuk timestamp synced terbaru, dan maksimal tiga payload gagal. Migrasi Dexie v133 menambahkan `[status+updated_at]` tanpa mengubah payload atau menghapus antrean.
- Checkout menyimpan outbox produk, finance, member, jurnal, transaksi, mutasi stok, dan konsumsi lot dalam transaksi Dexie yang sama. Produk terkait diambil lewat bulkGet dan payload tetap memakai `preserve_stock: true`. Tidak ada deduplikasi dengan membaca backlog dalam checkout. Jurnal pada jalur ini memakai opsi `syncInTransaction`, sehingga tidak membuat antrean melalui timer terpisah.
- POS reguler dan resto menunda pemicu upload dari checkout. Setelah commit dan pemanggilan transport printer, callback `onPrintDispatched` menjadwalkan refresh laporan dan worker sync. Jalur tanpa printer atau kegagalan persiapan juga melepaskan pekerjaan background. Pengiriman printer yang belum selesai tidak menahan callback tersebut. Worker yang sudah berjalan sebelum checkout tetap dapat berjalan; perubahan ini mengatur pekerjaan yang dipicu checkout ini.
- Status hasil cetak dan outbox pembaruannya juga disimpan atomik. Pemanggil checkout yang tidak mencetak tetap mendapatkan pemicu worker setelah commit melalui default `deferSyncProcessing: false`. Untuk resto, finalisasi pesanan tetap mengikuti flow yang sudah ada; opsi ini tidak menggabungkan penyimpanan pesanan resto ke transaksi sale.

Timing lokal dapat diaktifkan dari console perangkat kasir:

```js
localStorage.setItem('frayukti-pos-performance', '1');
```

Lakukan checkout, lalu cari log `[POS performance]`. Log `checkout_committed` dan hasil cetak menggunakan `traceId` yang sama. Tiap stage memiliki `durationMs` sejak checkpoint sebelumnya dan `elapsedMs` sejak awal. Stage meliputi preflight, waktu tunggu transaksi, pricing/payment, validasi stok, FIFO, penyimpanan sale, jurnal/outbox, mutasi stok, outbox, commit, awal print, persiapan struk, transport printer, dan penyimpanan status cetak. Untuk resto ada checkpoint finalisasi pesanan. Log hanya berisi timing dan ID trace acak; data keranjang, pembayaran, dan member tidak dicatat atau diunggah. Pencatatan default nonaktif.

```js
localStorage.removeItem('frayukti-pos-performance');
```

Validasi implementasi:

- `bun test tests/unit`: 401 test lulus.
- `bunx playwright test tests/e2e/pos-checkout-atomicity.spec.ts --project=chromium`: 5 test lulus memakai IndexedDB nyata pada profil Chromium sementara dan printer USB tiruan.
- Tes integrasi membuktikan rollback seluruh perubahan ketika enqueue finance gagal, outbox jurnal tidak ganda setelah timer diberi kesempatan berjalan, retry/event/tipe/reversal jurnal tetap benar tanpa membaca riwayat yang tidak terkait, indikator membaca maksimal tiga payload dan merespons perubahan live query, migrasi mempertahankan row lama, serta callback background tidak menunggu printer lambat selesai dan tetap berjalan tanpa printer.
- Pemeriksaan TypeScript dan ESLint pada file aplikasi yang diubah lulus. Pengukuran printer fisik dan p95 pada client masih diperlukan.
- `bun run build`: lulus. Build melaporkan warning resolusi URL beep, campuran import statis/dinamis Tauri, dan ukuran chunk besar pada bagian aplikasi di luar optimasi ini.

Script benchmark sekarang menjalankan helper lookup jurnal dan pembaca indikator dari source aplikasi saat ini, serta query sebelum optimasi sebagai baseline pembanding. Angka historis pada tabel awal tetap dipertahankan sebagai hasil analisis pertama.

Hasil pembandingan setelah implementasi (median tiga pengulangan hangat, ms):

| Baris per tabel | Jurnal sebelum | Jurnal sekarang | Indikator sebelum | Indikator sekarang |
| ---: | ---: | ---: | ---: | ---: |
| 1.000 | 13,6 | 0,2 | 12,9 | 4,4 |
| 10.000 | 123,3 | 0,3 | 86,0 | 35,8 |
| 50.000 | 709,1 | 0,3 | 439,6 | 201,3 |

Hasil ini tetap pengukuran query sintetis terpisah. Indikator sudah menghindari payload historis, tetapi count status masih membutuhkan waktu seiring pertumbuhan antrean. Saldo FIFO, katalog, dan durasi printer fisik belum dioptimasi pada pekerjaan 1 sampai 3 ini.

Optimasi pertumbuhan data (v134)
-------------------------------

Keluhan bahwa data besar masih lambat benar: indeks count pada tahap pertama masih bertambah biayanya, dan FIFO masih memutar ulang konsumsi lama. Implementasi lanjutan mengganti pekerjaan berulang tersebut dengan ringkasan yang diperbarui saat data berubah.

- **FIFO:** `inventoryConsumptionTotals` menyimpan jumlah konsumsi per lot, termasuk konsumsi yang datang sebelum lot dari perangkat lain. Saldo `fifo_remaining` dan indeks `[product_id+fifo_available+received_at+id]` memungkinkan checkout melewati lot habis. `readFifoLots()` mengambil maksimal 32 lot per batch dan berhenti ketika kebutuhan terpenuhi. Urutan tanggal penerimaan dan ID, validasi harga pending, serta perhitungan HPP tetap berlaku. Estimasi produksi memakai pembaca yang sama. Jumlah kerja mengikuti lot yang diperlukan untuk transaksi, bukan seluruh riwayat konsumsi.
- **Konsistensi saldo:** middleware menghitung selisih row sebelum/sesudah mutasi, sehingga replay ID yang sama tidak menambah konsumsi dua kali. Update jumlah/lot, delete, bulk put dengan ID berulang, restore, serta rollback ikut memperbarui saldo. Lot baru dari void langsung memperoleh saldo. Penggantian saldo awal menandai lot lama `fifo_excluded`; pemanggil FIFO tanpa ledger menyimpan pengurang lokal terpisah. Metadata hasil sync tidak menimpa saldo turunan. Konsistensi antarperangkat tetap mengikuti data konsumsi yang sudah tersinkron ke perangkat tersebut.
- **Indikator sync:** membaca satu `syncQueueSummary`, satu timestamp dari indeks, dan maksimal tiga payload gagal. Tidak ada count terhadap seluruh antrean pada setiap perubahan status.
- **Worker sync:** mengambil batch langsung dari indeks `[status+queue_priority+created_at+id]`. Prioritas produk, lot/jurnal, posting saldo awal, pengaturan ledger, lalu konsumsi tetap dipertahankan. Pemeriksaan pekerjaan berikutnya cukup mengambil satu key; backlog tidak diurutkan penuh berulang kali.
- **Katalog:** `posProductCatalog` hanya berisi metadata nama, SKU, kategori, dan produk yang terlihat di POS. Stok, harga, dan metadata sync tidak menulis ulang katalog. Halaman POS membaca 12 ID lalu bulkGet 12 produk terkini. Pencarian juga berhalaman; barcode mencari normalized SKU lewat indeks. Jumlah produk dan kategori berasal dari `posCatalogCounts`. Tes liveQuery memastikan perubahan stok tidak menjalankan ulang pencarian katalog.
- **Pembacaan pendukung:** sesi kasir/resto yang OPEN dicari dengan indeks gabungan user/status; cursor refresh konsumsi mengambil timestamp terakhir dari indeks, tanpa membaca seluruh ledger.

[Middleware](../src/lib/database/checkoutReadModelsMiddleware.ts) menambahkan store ringkasan ke transaksi native IndexedDB yang sama dengan sumbernya. Penulisan ringkasan melewati jalur observability Dexie agar liveQuery ikut diperbarui. Mutasi dalam satu transaksi diurutkan, termasuk saat pemanggil memakai Promise.all. Gagal menulis ringkasan membatalkan sumbernya juga. Pendekatan ini mengikuti API [Dexie DBCore](https://dexie.org/docs/DBCore/DBCore) dan [mutasi DBCore](https://dexie.org/docs/DBCore/DBCoreMutateRequest), sehingga jalur merge/restore yang menulis langsung melalui Dexie ikut tercakup.

[Migrasi v134](../src/lib/database/migrations/versions/v134.ts) membangun ringkasan dan indeks dari data lama dalam satu transaksi upgrade. Ledger/antrean dibaca sekali selama upgrade, bukan tiap checkout. Pembukaan pertama database besar dapat lebih lama; sesudahnya saldo diperbarui per mutasi. Riwayat transaksi tidak dihapus. Migrasi mempertahankan perhitungan saldo berbasis ledger sebelumnya; ia bukan rekonsiliasi untuk riwayat lama yang sudah tidak lengkap atau reset lama tanpa penanda.

Benchmark terbaru menggunakan modul aplikasi aktual, termasuk middleware saat seeding. Data sintetis berisi 1.000–50.000 produk, jurnal, antrean synced dengan payload sekitar 1 KB, dan konsumsi. Mayoritas lot sudah habis; satu lot memiliki saldo untuk penjualan berikutnya. Ada tambahan 50 antrean pending. Hasil median tiga pengulangan hangat, ms:

| Baris per tabel | FIFO sebelum | FIFO sekarang | Indikator sebelum | Indikator sekarang | Katalog sebelum | Halaman katalog sekarang |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1.000 | 16,9 | 0,3 | 12,9 | 0,4 | 9,4 | 0,8 |
| 10.000 | 131,6 | 0,3 | 85,6 | 0,4 | 73,3 | 0,6 |
| 50.000 | 735,0 | 0,8 | 450,5 | 0,3 | 374,0 | 0,6 |

Lookup jurnal pada ketiga ukuran: 0,2–0,3 ms; baca batch sync 20 row: 0,3–0,4 ms. Kolom FIFO mengukur pemilihan saldo/lot yang dibutuhkan, bukan penulisan sale lengkap. Jangan menjumlahkan kolom sebagai waktu bayar sampai struk keluar.

Validasi tambahan menggunakan IndexedDB nyata:

- `tests/e2e/pos-checkout-growth.spec.ts`: replay, konsumsi sebelum lot, koreksi, dua koneksi database, ID bulk berulang, partial failure, delete/clear/restore, abort, migrasi/reopen, SKU/kategori/pagination, dan invalidasi liveQuery.
- Uji 5.000 lot habis beserta konsumsinya, 100 lot aktif, 5.000 antrean synced dan 2.000 pending: permintaan FIFO 1 lalu 40 unit membaca dua rangkaian batch dengan total 96 lot aktif; **nol row riwayat** dibaca. Batch sync membaca tepat 20 row dan indikator melakukan **nol count**. Query lintas batch mempertahankan urutan FIFO.
- Tes atomisitas checkout juga memeriksa rollback saldo turunan dan ringkasan; kegagalan penulisan ringkasan harus membatalkan sumber walaupun pemanggil menangkap error.

Validasi akhir v134: **401 unit test**, **11 tes integrasi checkout/pertumbuhan data**, serta **6 tes alur numpad/scanner dan rekonsiliasi HPP** lulus. TypeScript, ESLint pada file yang diubah, syntax check script diagnostik, dan build produksi lulus. Warning build terkait URL beep, import Tauri statis/dinamis, dan ukuran chunk tetap seperti tahap sebelumnya.

Batas pengukuran: render React lengkap, database client nyata, lock dari worker yang sudah aktif, waktu transport printer, dan p50/p95 checkout lengkap belum diukur. Halaman jauh memakai offset. Riwayat tetap memakai ruang penyimpanan; perbaikan ini membatasi pembacaan pada jalur yang dioptimasi, bukan menetapkan waktu tetap untuk seluruh operasi aplikasi. Gunakan trace lokal di atas untuk menentukan tahap berikutnya bila client masih lambat setelah memakai build ini.

Penomoran jurnal dan overhead tetap
-----------------------------------

Lanjutan setelah v134, tanpa perubahan skema dan tanpa mengubah jaminan atomisitas checkout.

- **Penomoran jurnal:** `createJournalEntryNumber()` mengambil satu key terakhir dari indeks `entry_number` pada rentang tanggalnya, bukan menghitung seluruh jurnal hari itu. Ini satu-satunya pekerjaan di dalam transaksi tulis checkout yang biayanya masih bertambah mengikuti jumlah transaksi. Melanjutkan dari nomor tertinggi juga tidak lagi memakai ulang nomor ketika ada celah, misalnya karena jurnal dari perangkat lain sudah tersinkron; `count()` sebelumnya dapat mengeluarkan nomor yang sudah terpakai. Di atas lebar 4 digit penomoran kembali memakai `count()` seperti sebelumnya.
- **Pembacaan akun jurnal:** `postPosSaleJournal()` dulu memuat seluruh bagan akun lewat `chartOfAccounts.toArray()`. Sekarang hanya akun yang mungkin diposting jurnal itu yang dibaca, lewat primary key dan indeks `code`: kandidat penjualan POS, kas/bank, HPP, persediaan, serta akun posting tiap pembayaran. Hasil diurutkan menurut `id` agar pemilihan akun tetap identik dengan urutan `toArray()` bila ada dua akun berbagi satu `code`. Biaya mengikuti jumlah kandidat, bukan besar bagan akun.
- **Index lookup akun:** satu jurnal memanggil `getPostableAccount()` sampai empat kali, dan tiap panggilan membangun ulang dua `Map` atas array akun yang diterima. Index sekarang di-memo pada identitas array, sehingga setiap pembacaan baru tetap membangun index baru dan tidak ada data akun usang yang terpakai.
- **Worker sync:** `recoverStaleProcessingSyncQueueItems()` dijalankan sekali per drain, bukan sekali per batch 20 row. Drain memakai loop, bukan rekursi, sehingga satu query `syncQueue` per batch ikut hilang. Untuk backlog 2.000 row: dari sekitar 300 query menjadi 101. Manfaatnya pada kontensi lock, bukan biaya query, dan belum diukur pada perangkat nyata.

Hasil benchmark penomoran (median tiga pengulangan hangat, jurnal pada satu tanggal yang sama):

| Jurnal pada tanggal itu | Penomoran sebelum | Penomoran sekarang |
| ---: | ---: | ---: |
| 1.000 | 4,8 ms | 0,4 ms |
| 10.000 | 50,9 ms | 0,3 ms |
| 50.000 | 211,4 ms | 0,3 ms |

Angka 50.000 jurnal dalam satu hari adalah stress case, bukan asumsi data client. Ukuran yang relevan adalah jumlah jurnal pada tanggal yang sedang diposting.

Pembacaan akun untuk satu jurnal penjualan POS:

| Jumlah akun di bagan | Seluruh bagan | Kandidat saja |
| ---: | ---: | ---: |
| 100 | 0,8 ms | 0,6 ms |
| 300 | 3,0 ms | 0,8 ms |
| 1.000 | 6,9 ms | 0,8 ms |

Bagan akun tumbuh mengikuti kebutuhan pembukuan, bukan jumlah transaksi; ini overhead tetap per checkout, bukan growth path. Angka kandidat tetap rata karena jumlah akun yang dibaca tidak berubah.

Validasi: 406 unit test dan 13 tes e2e checkout/pertumbuhan data lulus, termasuk tes baru yang membuktikan penomoran pada riwayat 5.000 jurnal sehari membaca **nol row jurnal** dan melakukan **nol count**, tidak memakai ulang nomor pada celah, dan tetap memberi nomor berbeda untuk dua jurnal dalam satu transaksi. Tes lain memposting jurnal penjualan POS pada bagan 200 dan 1.000 akun tambahan: baris jurnal identik, **nol akun noise dibaca**, dan jumlah row akun yang dibaca sama pada kedua ukuran. TypeScript, ESLint pada file yang diubah, dan syntax check script diagnostik lulus.

Yang **tidak** dikerjakan pada tahap ini, beserta alasannya:

- Indeks `active` pada `promos`/`lotteries` tidak dapat dipakai: nilainya boolean, dan IndexedDB tidak menerima boolean sebagai key, sehingga row tersebut tidak masuk indeks sama sekali. Memperbaikinya butuh migrasi yang menyimpan 0/1. Kedua tabel juga terbatas jumlah promo yang dibuat, bukan riwayat transaksi.
- Cache in-memory untuk `chartOfAccounts` tidak dibuat, dan tidak diperlukan: pembacaan bertarget di atas menghilangkan biayanya tanpa menambah invalidasi lintas transaksi ke kode akuntansi. Catatan koreksi: angka 0,065 ms yang sempat dipakai untuk menolak cache hanya mengukur pembangunan `Map` di JS, bukan pembacaan IndexedDB-nya yang ternyata 3,1 ms pada 300 akun.
- `accountingPeriods.toArray()` masih dibaca penuh, dan terjadi dua kali per checkout karena `isGeneralLedgerPostingEnabled()` dipanggil di `postPosSaleJournal()` dan sekali lagi di `postBalancedJournalEntry()`. Biayanya 0,9 ms per pembacaan pada 120 periode (sepuluh tahun periode bulanan). Versi berindeksnya perlu memilih periode dengan `start_date` terbesar yang mencakup tanggal; semantik tumpang-tindih periode menentukan boleh/tidaknya posting ke periode LOCKED, sehingga tidak diubah hanya untuk angka tersebut.
- Posting jurnal, finance income, profit log, dan poin membership masih berada di dalam transaksi tulis checkout, dan jaminan atomisitasnya tidak diubah. Biaya ketiga item selain jurnal adalah O(1): satu `get` dan satu `put` pada saldo, plus baris log. Setelah penomoran dan pembacaan akun diperbaiki, sisa biaya jalur jurnal di dalam transaksi adalah beberapa pembacaan konfigurasi dan penulisan O(1), sehingga memindahkannya ke worker background — yang mengubah buku besar menjadi konsisten secara eventual — tidak lagi sepadan dengan risikonya.

Daftar member dan retensi antrean
---------------------------------

Dua perbaikan di luar transaksi tulis checkout, tanpa perubahan skema.

- **Daftar member POS:** [posMemberReadService.ts](../src/services/posMemberReadService.ts) menggantikan pembacaan seluruh tabel `memberships` pada layar POS. Sebelumnya satu live query memuat semua member aktif dan dijalankan ulang setiap kali ada row membership berubah — termasuk pembaruan poin dari checkout member dan setiap merge sync background. Sekarang picker membaca satu halaman terbatas (50) menurut indeks `member_number`, pencarian nomor dan telepon lewat indeks masing-masing, dan member terpilih lewat primary key. Member terpilih selalu diletakkan di depan daftar agar label pilihan tetap ada walau di luar halaman. `is_active` bertipe boolean sehingga tidak dapat diindeks IndexedDB, dan `status` tidak ada pada row lama; keduanya tetap diperiksa di callback.
- **Retensi antrean synced:** [syncQueueRetentionService.ts](../src/services/syncQueueRetentionService.ts) menghapus row `synced` yang lebih tua dari tujuh hari, dalam batch 500 agar backlog besar tidak menjadi satu transaksi tulis panjang. Row synced terbaru selalu dipertahankan karena indikator membaca timestamp-nya sebagai "terakhir tersinkron"; perangkat yang lama menganggur tidak kehilangan waktu tersebut. Jumlah status tetap benar karena middleware read model menerapkan delta delete pada `syncQueueSummary` di transaksi yang sama. Retensi dipanggil dari `processPendingSyncQueue()` setelah drain, maksimal sekali per jam, dan tidak membutuhkan koneksi.

Perubahan perilaku yang perlu diketahui: picker member kini menampilkan 50 member pertama, bukan seluruh daftar. Toko dengan member sampai 50 tidak melihat perbedaan; di atas itu kasir mengetik untuk mencari. Pencarian nama masih berjalan tanpa indeks — dibatasi jumlah hasil, minimal dua karakter, dan hanya saat picker dipakai, bukan saat checkout.

Validasi: 406 unit test dan 15 tes e2e checkout/pertumbuhan data lulus, ditambah 5 tes e2e alur POS (shortcut keyboard dan diagnosa qty) yang menjalankan layar Transaction sungguhan. Tes baru membuktikan halaman member membaca jumlah row yang sama pada 500 dan 5.000 member, tidak memuat member nonaktif, mencari nomor lewat indeks, dan mengambil member terpilih dengan **tepat satu** pembacaan primary key. Tes retensi membuktikan 1.200 row kedaluwarsa terhapus dalam batch, row pending/processing/failed tidak tersentuh, ringkasan cocok dengan hitungan manual, dan satu row synced tetap dipertahankan ketika semuanya sudah kedaluwarsa.

Yang masih terbuka setelah tahap ini: pencarian riwayat transaksi, offset pada halaman jauh, laporan yang membaca seluruh `journalEntries` dan `journalEntryLines` sebelum memfilter tanggal, serta 14 query key yang di-invalidate setiap checkout. Arsip riwayat transaksi lama juga belum ada; retensi di atas hanya membatasi antrean sync, bukan riwayat penjualan.

Pencarian katalog berindeks (v135)
----------------------------------

Pencarian produk adalah satu-satunya jalur interaktif yang tersisa dengan biaya sebesar seluruh katalog, dan ia dijalankan **setiap ketikan** melalui live query di [useTransaction.tsx](../src/hooks/useTransaction.tsx). Ini juga satu-satunya angka yang terukur berada di rentang keluhan awal.

Semantik pencarian tidak berubah. `matchesProductSearch()` memakai `includes()` pada nama dan SKU, jadi menurunkannya menjadi pencocokan awalan akan membuat "domie" berhenti menemukan "Indomie". Yang dilakukan: indeks multiEntry `*search_tokens` pada `posProductCatalog` berisi **sufiks setiap kata** dari nama dan SKU.

Dasar kebenarannya: kata pertama sebuah istilah tidak pernah melewati spasi. Jika teks memuat istilah itu, istilah tersebut mulai di dalam satu kata, sehingga ada sufiks kata yang berawalan kata pertama istilah. Maka memakai kata pertama sebagai probe indeks tidak mungkin melewatkan hasil. Setiap kandidat masih diverifikasi dengan `matchesProductSearch()` yang sama, sehingga himpunan hasil identik dengan memindai seluruh katalog. Istilah yang lebih panjang dari token terindeks tidak dapat diprobe dan kembali memakai pemindaian.

Indeks ini berada di tabel turunan, bukan di `products`. Perubahan stok dan harga tidak mengubah proyeksi katalog, sehingga checkout tidak menulis ulang token — pemisahan itu sudah dibuat di v134 dan tetap berlaku.

Median tiga pengulangan hangat, istilah selektif (1 hasil) dan istilah luas (~111 hasil):

| Jumlah produk | Selektif sebelum | Selektif sekarang | Luas sebelum | Luas sekarang |
| ---: | ---: | ---: | ---: | ---: |
| 1.000 | 14,8 ms | 0,5 ms | 14,6 ms | 2,4 ms |
| 10.000 | 135,8 ms | 0,3 ms | 137,5 ms | 2,5 ms |
| 50.000 | 724,0 ms | 0,4 ms | 727,6 ms | 2,7 ms |

Biaya sekarang mengikuti jumlah hasil, bukan besar katalog: istilah luas tetap lebih mahal daripada istilah selektif, tetapi keduanya rata terhadap ukuran tabel.

Harga yang dibayar adalah ruang indeks. Produk sintetis pada benchmark menghasilkan 17 token per produk; nama produk nyata yang lebih panjang menghasilkan lebih banyak. Token dibatasi 32 karakter per entri. Ini menambah ukuran database dan biaya tulis saat metadata produk berubah — bukan saat penjualan.

[Migrasi v135](../src/lib/database/migrations/versions/v135.ts) menambahkan indeks dan mengisi token dari nama serta SKU yang sudah ada di `posProductCatalog`, satu lintasan atas metadata katalog saja, tanpa membaca ulang `products`.

Validasi: 406 unit test dan 22 tes e2e POS lulus, termasuk pemeriksaan kesetaraan yang membandingkan hasil `readPosCatalogPage()` terhadap pemindaian penuh pada katalog 3.000 produk untuk 13 istilah kali 2 filter kategori — kata utuh, awalan kata, tengah kata, melewati spasi, dua kata, huruf besar, angka di tengah kata, SKU utuh dan sebagian, satu huruf, tanpa hasil, istilah 40 karakter, dan istilah tidak ter-trim — beserta halaman dalam dan quick-add. Tes yang sama membuktikan jumlah row katalog yang dibaca **sama dengan jumlah hasil** pada katalog 500 maupun 3.000. Tes upgrade membuktikan database yang sudah di v134 mendapatkan token setelah dibuka di v135, dan probe tengah kata, lintas kata, serta SKU menemukan row yang benar. TypeScript, ESLint pada file yang diubah, dan build produksi lulus dengan warning yang sama seperti tahap sebelumnya.

