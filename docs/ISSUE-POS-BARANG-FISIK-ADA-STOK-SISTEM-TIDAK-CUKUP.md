# Issue: POS Menemukan Barang Fisik Saat Stok Sistem Tidak Cukup

Dokumen terkait:

- [Stock Opname](STOCK-OPNAME.md)
- [Satu Pintu Stok Masuk](ISSUE-SATU-PINTU-STOK-MASUK.md)
- [Tech Debt - Sync Architecture](TECH-DEBT-PHASE-1-SYNC-ARCHITECTURE.md)

Tanggal catatan: 2026-08-22

Status: **Implemented — MVP selesai 2026-08-22**

## Hasil Implementasi

- POS menawarkan aksi `Barang fisik ada di depan saya` dan catatan observasi
  opsional ketika stok sistem tidak cukup. Tanpa konfirmasi, baris tetap
  diblokir.
- Checkout membaca ulang stok di dalam transaksi Dexie dan menghitung shortage
  berdasarkan satuan stok. Untuk saldo negatif, adjustment juga menutup saldo
  negatif tersebut sehingga saldo akhir tidak menjadi negatif.
- Shortage membentuk lot `ESTIMATED`, mutasi
  `POS_PHYSICAL_STOCK_FOUND`, konsumsi FIFO penjualan, kasus
  `PENDING_REVIEW`, dan transactional outbox bersama transaksi penjualan.
- Update master produk dari perubahan stok dikirim dengan `preserveStock`,
  sedangkan stok remote bersumber dari mutasi append-only yang retry-nya
  idempoten.
- Owner/Admin mendapat permission `POS_STOCK_DISCREPANCY_REVIEW` dan inbox
  review untuk memilih `REVIEWED` atau `NEEDS_INVESTIGATION`, mencatat hasil
  investigasi, serta menautkan Stock Opname bila diperlukan.
- Penutupan shift memberi peringatan berisi jumlah kasus, kasus pending,
  kuantitas adjustment, dan produk terdampak; pending review tidak memblokir
  penutupan.
- Entity discrepancy tersedia di Dexie, backup/restore, PostgreSQL/Tauri,
  incremental pull, sync queue, dan realtime refresh.

Keputusan MVP untuk pertanyaan terbuka: seluruh kasus memakai post-review,
penutupan shift hanya memperingatkan, foto tidak diwajibkan, dan barang temuan
memakai `product.purchase_price` sebagai estimasi (atau estimasi `UNKNOWN`
bernilai nol bila belum tersedia). Cost ini tidak ditandai `FINAL`.

## Ringkasan

Kasir dapat memegang barang fisik yang dibawa pelanggan, tetapi saldo produk di
sistem menunjukkan `0` atau lebih kecil daripada jumlah yang akan dijual. POS
saat ini menolak barang tersebut ketika dimasukkan ke keranjang. Tidak ada jalur
untuk mencatat fakta bahwa barang fisik ditemukan, melanjutkan penjualan, lalu
meminta supervisor meninjau selisih setelah pelanggan selesai dilayani.

Perilaku yang disepakati untuk arah solusi:

- Pelanggan tidak menunggu supervisor.
- Kasir hanya mengonfirmasi fakta **barang fisik ada di depan kasir**.
- Kasir tidak wajib mengetahui atau mengisi penyebab selisih stok.
- Penyesuaian operasional dan penjualan dicatat realtime dalam satu proses.
- Kasus masuk antrean `PENDING_REVIEW` untuk diperiksa supervisor.
- Supervisor mengisi hasil investigasi selama shift atau maksimal saat tutup
  shift.
- Penghitungan fisik terarah dilakukan saat toko sepi atau setelah tutup bila
  kasus berulang, bernilai besar, atau belum dapat dijelaskan.

Implementasi MVP mengikuti proses operasional ini; pekerjaan lanjutan yang
tercantum pada bagian status tetap memerlukan keputusan operasional terpisah.

## Skenario

Contoh paling sederhana:

```txt
stok sistem          0
barang fisik dibawa  1
jumlah akan dijual   1
```

Arah pencatatan yang dibahas:

```txt
penyesuaian barang fisik ditemukan  +1
penjualan                            -1
saldo akhir                           0
```

Penyesuaian hanya sebesar kekurangan yang diperlukan transaksi. Kasir tidak
boleh memasukkan adjustment bebas dari layar POS.

## Keputusan Proses Operasional

### Saat transaksi berlangsung — realtime

1. POS mendeteksi stok sistem tidak mencukupi.
2. Kasir memilih aksi `Barang fisik ada di depan saya`.
3. Sistem merekam stok sistem, kuantitas penjualan, besar kekurangan, kasir,
   waktu, perangkat, dan transaksi.
4. Sistem membuat efek stok masuk sebesar kekurangan dan efek stok keluar dari
   penjualan secara atomik.
5. Transaksi selesai tanpa menunggu review supervisor.
6. Kasus dibuat dengan status `PENDING_REVIEW`.

Catatan bebas dari kasir boleh tersedia, tetapi bersifat opsional. Field ini
bukan field "penyebab".

### Selama shift — review ringan

Supervisor dapat memeriksa antrean ketika operasional memungkinkan. Hasil
review sebaiknya membedakan minimal:

- `REVIEWED`: bukti dan penyebab operasional sudah dicatat.
- `NEEDS_INVESTIGATION`: perlu pemeriksaan lebih lanjut atau cycle count.

Kedua status tersebut digunakan sebagai model review pada MVP.

### Saat tutup shift

Penutupan shift menampilkan ringkasan kasus yang dibuat, produk yang terdampak,
kuantitas penyesuaian, kasir pencatat, dan kasus yang belum direview.

Kasus yang belum direview menghasilkan peringatan, bukan memblokir penutupan
shift.

### Saat toko sepi atau setelah tutup

Stock opname dilakukan secara terarah pada produk bermasalah. Tidak perlu
melakukan full stock opname untuk setiap kejadian tunggal.

## Temuan Kode Terkonfirmasi

### 1. POS memblokir stok nol sebelum barang masuk keranjang

File: [`src/store/transactionStore.ts`](../src/store/transactionStore.ts)

- `addToCart` mengembalikan `OUT_OF_STOCK` ketika `product.stock <= 0` pada
  sekitar baris 272-284.
- Penambahan kuantitas mengembalikan `INSUFFICIENT_STOCK` ketika hasil konversi
  kuantitas melebihi snapshot `product.stock` pada sekitar baris 286-303.
- `updateQuantity` dan `updateUnit` melakukan pemeriksaan yang sama terhadap
  snapshot produk di baris keranjang pada sekitar baris 323-400.

Dampak: produk biasa dengan stok `0` tidak memiliki jalur exception di POS.

### 2. UI hanya menampilkan error, belum menawarkan observasi barang fisik

File terkait:

- [`src/hooks/useTransaction.tsx`](../src/hooks/useTransaction.tsx)
- [`src/view/Transaction.tsx`](../src/view/Transaction.tsx)

`useTransaction` memetakan `OUT_OF_STOCK` dan `INSUFFICIENT_STOCK` menjadi modal
error. `Transaction` meneruskan hasil scan/click ke `addToCart`. Belum ada state,
modal, atau payload checkout untuk menandai barang fisik ditemukan.

### 3. Checkout tidak memvalidasi ulang kecukupan stok

File: [`src/services/checkoutService.ts`](../src/services/checkoutService.ts)

- `reduceProductStock` membaca produk terbaru dari Dexie, lalu langsung menulis
  `product.stock - quantityInStockUnit` pada sekitar baris 331-376.
- Checkout utama menjalankan pengurangan tersebut pada sekitar baris 588.
- Tidak ada guard `current stock >= requested stock` di dalam transaksi Dexie.

Dampak: jika keranjang tersimpan lama, produk berubah setelah masuk keranjang,
atau validasi UI terlewati, checkout dapat menulis stok lokal negatif.

### 4. Kekurangan FIFO lot diterima sebagai fallback

File: [`src/utils/inventory/consumeFifoLots.ts`](../src/utils/inventory/consumeFifoLots.ts)

Pada sekitar baris 119-138, kekurangan lot ditutup menggunakan harga lot terakhir.
Jika tidak ada lot sama sekali, fallback cost menjadi `0`.

Dampak: membypass stok nol tanpa lebih dulu membentuk dasar inventory lot dapat
menghasilkan HPP nol atau HPP yang tidak mewakili barang fisik tersebut.

### 5. Stock Opname sudah punya audit, tetapi bukan flow kasir realtime

File terkait:

- [`src/services/stockOpnameService.ts`](../src/services/stockOpnameService.ts)
- [`src/view/stock-opname/StockOpnameEditor.tsx`](../src/view/stock-opname/StockOpnameEditor.tsx)
- [`src/auth/permissions.ts`](../src/auth/permissions.ts)

Stock Opname sudah mendukung `DRAFT -> REVIEWED -> POSTED`, mengubah
`products.stock`, membuat FIFO lot/consumption, membuat stock mutation, activity
log, dan sync bundle. Namun semua aksi memakai permission
`STOCK_OPNAME_MANAGE`, yang secara default diberikan kepada Owner, Admin, dan
Gudang, bukan Kasir.

Dampak: Stock Opname tepat untuk rekonsiliasi terarah, tetapi terlalu panjang
dan terlalu berwenang untuk menyelesaikan antrean pelanggan di POS.

### 6. Penerimaan stok cepat bukan representasi yang tepat untuk selisih

File terkait:

- [`src/services/posQuickItemService.ts`](../src/services/posQuickItemService.ts)
- [`src/components/PosQuickItemModal.tsx`](../src/components/PosQuickItemModal.tsx)

`receiveQuickStockForProduct` dapat menerima stok produk lama melalui Purchase
Receipt berharga estimasi. Fitur ini membutuhkan `POS_QUICK_ITEM_ENTRY` dan
dimaksudkan sebagai penerimaan barang, bukan pengakuan selisih stok yang baru
ditemukan di kasir.

Dampak: memakai fitur ini sebagai workaround akan mencampur kejadian selisih
stok dengan proses pembelian/penerimaan.

### 7. Belum ada model data exception/review stok POS

File: [`src/types/index.ts`](../src/types/index.ts)

`Transaction`, `TransactionItem`, `StockMutation`, dan tipe terkait belum punya:

- referensi kasus selisih stok;
- status review supervisor;
- snapshot stok sistem dan kekurangan saat checkout;
- observasi kasir bahwa barang fisik tersedia;
- hasil investigasi supervisor.

`StockMutationSourceType` juga belum mempunyai source type khusus kejadian
barang fisik ditemukan di POS.

## Risiko Sinkronisasi Yang Perlu Reproduction Test

Bagian ini adalah risiko berdasarkan pembacaan kode. Belum ada test reproduksi
yang membuktikan semua urutan race di runtime.

### 1. Saldo produk dan ledger mutasi dikirim melalui jalur terpisah

File terkait:

- [`src/services/checkoutService.ts`](../src/services/checkoutService.ts)
- [`src/services/syncQueueService.ts`](../src/services/syncQueueService.ts)
- [`src-tauri/src/repositories/product_repository.rs`](../src-tauri/src/repositories/product_repository.rs)
- [`src-tauri/src/repositories/stock_mutation_repository.rs`](../src-tauri/src/repositories/stock_mutation_repository.rs)

Checkout melakukan dua upload konseptual:

1. `products.stock` lokal ditandai pending dan dienqueue sebagai update produk.
2. `StockMutation` dienqueue sebagai delta stok append-only.

`enqueuePendingProductsForSync` dipanggil tanpa `preserveStock` dari checkout.
Di server, upsert produk dapat menulis nilai `stock`, sedangkan upsert stock
mutation juga menambahkan `quantity_delta` ke `products.stock`.

Saat antrean diproses dalam batch, `processPendingSyncQueue` memberi prioritas
produk lebih tinggi daripada entity lain. Urutan snapshot produk dan delta
mutasi berpotensi menghasilkan overwrite snapshot lama atau penerapan perubahan
yang tidak sesuai ekspektasi, terutama setelah beberapa transaksi offline.

Perlu dibuat reproduction test minimal untuk:

- satu transaksi online;
- satu transaksi offline lalu reconnect;
- beberapa transaksi offline untuk produk yang sama;
- dua perangkat menjual produk yang sama;
- retry mutation dengan ID yang sama;
- urutan product update sebelum dan sesudah stock mutation.

### 2. Persistensi mutasi lokal tidak satu transaksi dengan posting POS

Migration Dexie v114 menjelaskan bahwa mutasi buatan lokal tidak langsung
ditulis ke `db.stockMutations`; objek dibuat di memory lalu didorong ke
`syncQueue` setelah transaksi checkout selesai.

File terkait:

- [`src/lib/database/migrations/versions/v114.ts`](../src/lib/database/migrations/versions/v114.ts)
- [`src/services/checkoutService.ts`](../src/services/checkoutService.ts)
- [`src/services/stockMutationSyncService.ts`](../src/services/stockMutationSyncService.ts)

Ada crash window antara commit transaksi Dexie dan enqueue mutasi/sync bundle.
Risiko ini perlu diverifikasi dan kemungkinan ditutup dengan transactional
outbox atau persistensi mutation lokal di transaksi yang sama.

## Arah Desain Teknis — Belum Disetujui

### Model kejadian

Pertimbangkan entity terpisah, misalnya `PosStockDiscrepancy`, agar review tidak
ditumpangkan ke Stock Opname atau Purchase Receipt.

Field awal yang perlu dievaluasi:

```txt
id
transaction_id
transaction_item_id
product_id
system_quantity_snapshot
requested_quantity
shortage_quantity
stock_unit
observation = PHYSICAL_ITEM_PRESENT
cashier_note?                # opsional
cashier_user_id
cashier_user_name
device/host snapshot
status = PENDING_REVIEW | REVIEWED | NEEDS_INVESTIGATION
reviewed_by?
reviewed_at?
investigation_cause?         # diisi supervisor, bukan kasir
investigation_note?
created_at
updated_at
sync metadata
```

Nama entity dan status belum final.

### Guard operasional

- Kasir hanya dapat membuat adjustment sebesar shortage transaksi.
- Kasir tidak dapat memasukkan kuantitas adjustment bebas.
- Penyebab selisih tidak wajib dan tidak ditanyakan kepada kasir.
- Catatan observasi kasir opsional.
- Review supervisor tidak membatalkan transaksi pelanggan yang sudah sah.
- Kasus berulang pada produk/kasir/perangkat harus mudah difilter.
- Kebijakan nilai tinggi atau jumlah besar masih merupakan keputusan terbuka.

### Efek stok dan HPP

Di dalam satu transaksi lokal, flow perlu:

1. Membaca ulang produk dan saldo terbaru.
2. Menghitung shortage setelah konversi satuan.
3. Membentuk stok masuk/lot hanya sebesar shortage.
4. Membentuk mutasi observasi barang fisik ditemukan.
5. Mengonsumsi FIFO untuk seluruh kuantitas penjualan.
6. Membentuk mutasi penjualan.
7. Menyimpan kasus review dan transactional outbox.

Kebijakan cost untuk barang fisik yang tidak punya lot/harga final belum
diputuskan. Jangan otomatis menyebut cost `FINAL` tanpa aturan akuntansi yang
disetujui.

## Batas Refactor Yang Disarankan

### 1. Pisahkan evaluasi ketersediaan stok dari store UI

Pemeriksaan stok saat ini berada di Zustand store. Extract pure domain helper
agar aturan yang sama dapat dipakai oleh:

- add/update cart;
- resume held draft;
- checkout realtime;
- restaurant POS bila memakai checkout service yang sama;
- unit test.

### 2. Pisahkan efek stok checkout dari orchestration pembayaran

`checkoutService.ts` sudah menangani pembayaran, membership, promo, jurnal,
profit, FIFO, stock mutation, dan sync. Pertimbangkan service/helper domain
khusus untuk merencanakan dan menerapkan stock effect per baris transaksi.

Tujuannya bukan sekadar memecah file, tetapi memastikan regular sale dan sale
dengan discrepancy menggunakan satu aturan stok yang teruji.

### 3. Tetapkan satu sumber kebenaran stok remote

Aturan sync perlu eksplisit:

- perubahan stok berasal dari append-only stock mutation;
- update master produk tidak menimpa stok remote untuk stock-derived change;
- snapshot `Product.stock` lokal tetap cache operasional;
- retry mutation harus idempotent;
- outbox mutation tersimpan atomik dengan transaksi bisnis.

### 4. Pisahkan review discrepancy dari Stock Opname

Antrean discrepancy adalah inbox investigasi per kejadian. Stock Opname adalah
proses hitung fisik dan posting variance. Supervisor boleh membuat cycle count
dari discrepancy, tetapi keduanya tidak boleh menjadi entity yang sama.

## File Yang Berpotensi Direfactor atau Ditambah

Daftar ini adalah audit scope historis yang dipakai saat implementasi MVP.

### POS dan domain frontend

- `src/store/transactionStore.ts`
- `src/hooks/useTransaction.tsx`
- `src/view/Transaction.tsx`
- `src/components/ProductList.tsx`
- `src/components/CartItem.tsx`
- `src/components/CartSidebar.tsx`
- `src/components/MobileCartDrawer.tsx`
- `src/services/checkoutService.ts`
- `src/services/restaurantPosService.ts`
- `src/types/index.ts`
- file domain helper baru untuk evaluasi availability/shortage
- komponen konfirmasi `Barang fisik ada di depan saya`

### Inventory, FIFO, dan audit

- `src/utils/inventory/addInventoryLot.ts`
- `src/utils/inventory/consumeFifoLots.ts`
- `src/services/stockMutationSyncService.ts`
- `src/services/stockMutationReadService.ts`
- `src/services/stockCardService.ts`
- `src/services/stockOpnameService.ts` hanya untuk integrasi/link cycle count,
  bukan untuk menampung flow POS
- service/read service baru untuk discrepancy dan review

### Dexie dan backup

- `src/lib/database/KasirkuDB.ts`
- migration baru di `src/lib/database/migrations/versions/`
- registrasi migration terkait di struktur database saat ini
- `src/utils/backupRestore.ts`

### Permission, navigasi, dan UI supervisor

- `src/auth/permissions.ts`
- `src/auth/permissionCatalog.ts`
- `src/auth/routePermissions.ts`
- `src/auth/moduleAccess.ts`
- `src/constants/setupModules.ts`
- `src/navigation/`
- route/view/hook/component baru untuk inbox review
- `src/i18n/messages.ts` atau file message terpisah

### Sync frontend

- `src/services/syncQueueService.ts`
- `src/services/syncOrchestratorService.ts`
- `src/services/realtimeSyncTableMap.ts`
- `src/services/postgresAdapter.ts`
- kemungkinan perubahan pada `src/hooks/useSyncQueueWorker.ts`

### Tauri dan PostgreSQL

- migration baru di `src-tauri/migrations/`
- model baru di `src-tauri/src/models/`
- repository baru di `src-tauri/src/repositories/`
- command baru di `src-tauri/src/commands/`
- `src-tauri/src/lib.rs`
- `src-tauri/src/repositories/product_repository.rs`
- `src-tauri/src/repositories/stock_mutation_repository.rs`
- migration realtime notification untuk table baru

### Test yang perlu ditambah

- unit test evaluasi shortage dan konversi satuan;
- unit/service test add/update cart dan held draft stale;
- checkout stok nol dengan konfirmasi fisik;
- checkout stok parsial, misalnya sistem `1`, fisik/penjualan `3`;
- verifikasi adjustment hanya sebesar shortage;
- verifikasi stok akhir dan HPP/FIFO;
- checkout biasa tidak berubah;
- permission kasir create observation vs supervisor review;
- closing shift dengan pending review;
- offline/reconnect/multi-device/idempotency tests;
- E2E desktop dan mobile POS.

## Acceptance Criteria

- Produk stok cukup tetap mengikuti flow checkout saat ini tanpa langkah baru.
- Produk stok tidak cukup menawarkan konfirmasi fakta barang fisik tersedia.
- Kasir tidak diminta menjelaskan penyebab selisih.
- Tanpa konfirmasi fisik, transaksi tetap diblokir.
- Dengan konfirmasi fisik, pelanggan dapat menyelesaikan pembayaran tanpa
  menunggu supervisor.
- Adjustment otomatis tidak dapat melebihi shortage transaksi.
- Adjustment, inventory lot/HPP, sale, audit case, dan outbox tersimpan atomik.
- Saldo akhir lokal dan remote konsisten setelah sync dan retry.
- Kasus muncul realtime di inbox supervisor saat online, atau setelah reconnect
  jika transaksi dibuat offline.
- Tutup shift menampilkan ringkasan pending review.
- Supervisor dapat mencatat hasil investigasi dan menautkan cycle count/Stock
  Opname bila dibutuhkan.
- Seluruh perubahan mempunyai actor, timestamp, source transaction, dan jejak
  mutation yang dapat diaudit.

## Keputusan MVP dan Pertanyaan Lanjutan

1. Seluruh kasus memakai post-review. Threshold approval realtime dapat
   dievaluasi kemudian dari data kejadian.
2. Tutup shift memberi peringatan dan tidak memblokir.
3. Target operasional review maksimal saat tutup shift; MVP belum menerapkan
   hard deadline.
4. Cost memakai `product.purchase_price` sebagai estimasi, atau nol dengan
   sumber `UNKNOWN`; keduanya tidak ditandai `FINAL`.
5. Setiap kasus dapat ditautkan ke Stock Opname. Pengelompokan otomatis beberapa
   kasus menjadi satu cycle count tetap menjadi pekerjaan lanjutan.
6. Foto barang/rak tidak diperlukan pada MVP.
7. Perubahan stok remote memakai mutation idempoten. Policy batas waktu offline
   dan validasi lapangan multi-device tetap menjadi pekerjaan lanjutan.

## Status

MVP sudah diimplementasikan. Reproduction test dengan beberapa perangkat fisik
dan kebijakan approval berbasis nilai/jumlah tetap menjadi pekerjaan lanjutan
operasional, bukan blocker flow ini.
