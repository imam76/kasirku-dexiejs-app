# Stock Opname - Langkah Implementasi Berbasis SoC

Dokumen ini adalah panduan implementasi Stock Opname untuk project Kasirku. Targetnya: stok fisik bisa dicocokkan dengan stok sistem tanpa menumpuk logic di komponen UI, tanpa merusak FIFO lot, dan tetap mengikuti struktur project saat ini.

## Update Implementasi

Opsi lanjutan yang sudah diimplementasikan:

- Sync dokumen Stock Opname ke Postgres sebagai bundle `stockOpnames` + `stockOpnameItems`.
- Pull remote Stock Opname ke Dexie lewat refresh sync global.
- Create draft sekarang bisa dibatasi dengan filter produk/kategori dan tanggal hitung.
- Editor punya filter item, pencarian item, bulk "stok fisik = stok sistem" untuk item yang tampil, dan clear count untuk item yang tampil.
- Workflow kontrol bisnis ringan: `DRAFT -> REVIEWED -> POSTED`, dengan opsi reopen dari `REVIEWED` ke `DRAFT` sebelum posting.
- Posting hanya boleh dari status `REVIEWED`.

SoC di dokumen ini berarti Separation of Concerns:

- UI hanya menampilkan data, input, dan action.
- Hook mengatur query/mutation dan state screen.
- Service memegang transaksi Dexie, perubahan stok, FIFO, activity log, dan sync.
- Utils memegang kalkulasi murni, validasi domain, nomor dokumen, dan CSV.
- Report/read service membaca data untuk tampilan tanpa efek samping.

## Audit Kondisi Project Saat Ini

Yang sudah ada:

- Master produk menyimpan stok global di `Product.stock` dalam base unit/purchase unit.
- `products`, `stockPurchases`, `inventoryLots`, dan `inventoryLotConsumptions` sudah tersedia di Dexie.
- FIFO sudah tersedia lewat `addInventoryLot()` dan `consumeFifoLots()`.
- `StockMutation` sudah dipakai oleh POS, Sales Delivery, Purchase Receipt, Purchase Return, dan Sales Return.
- Sync Postgres untuk `stock_mutations` sudah append-only dan remote repository mengubah `products.stock` berdasarkan `quantity_delta`.
- Kartu Stok sudah merekonstruksi mutasi dari dokumen/transaksi lokal.
- Route dan permission stok sudah ada lewat `STOCK_ACCESS`.

Yang belum ada:

- Belum ada table `stockOpnames` dan `stockOpnameItems`.
- Belum ada source type `STOCK_OPNAME` untuk `StockMutation`.
- Belum ada source type opname untuk `InventoryLot` dan `InventoryLotConsumption`.
- UI counting sheet, input stok fisik, review selisih, dan posting sudah tersedia untuk scope stok global.
- Sync dokumen Stock Opname ke Postgres sudah tersedia sebagai audit remote. Efek stok remote tetap lewat `stockMutations`.
- Belum ada jurnal variance persediaan untuk General Ledger.
- Stok masih global per produk, belum per gudang. Field gudang boleh menjadi metadata, tetapi belum boleh diklaim sebagai saldo per gudang.

Kesimpulan: project sudah siap untuk MVP Stock Opname per produk total/global. Stock Opname per gudang perlu fondasi saldo per warehouse terlebih dahulu.

## Scope MVP

MVP yang disarankan:

- Membuat draft Stock Opname.
- Mengisi stok fisik per produk dalam base unit produk.
- Menampilkan stok sistem, stok fisik, selisih, dan estimasi nilai selisih.
- Mereview hasil hitung sebelum posting.
- Posting opname secara atomik.
- Selisih plus menambah `products.stock`, membuat FIFO lot baru, dan membuat stock mutation.
- Selisih minus mengurangi `products.stock`, consume FIFO lot, dan membuat stock mutation.
- Hasil opname muncul di Kartu Stok.
- Export counting sheet CSV dan import hasil hitung fisik CSV.
- Activity log untuk create/update/review/reopen/post/cancel.

Di luar MVP:

- Perhitungan saldo per warehouse.
- Approval bertingkat.
- Void posted opname. Koreksi posted opname dibuat lewat opname baru.
- Approval bertingkat di atas status `REVIEWED`.
- Barcode batch counting.
- Jurnal otomatis selisih persediaan.
- Cycle count per kategori/rak/bin.

## Keputusan Arsitektur

Gunakan table baru:

```txt
stockOpnames
stockOpnameItems
```

Jangan memasukkan seluruh flow opname ke:

```txt
src/view/master-data/products/StockManagement.tsx
src/hooks/useStockManagement.tsx
src/components/StockTable.tsx
```

File tersebut boleh hanya diberi tombol/link kecil menuju halaman opname. Flow opname tetap punya service, hook, utils, dan view sendiri.

Route MVP:

```txt
/master-data/stock-opname
```

Alasannya: project saat ini belum punya group Inventory terpisah. Stock Opname tetap memakai module setup `PRODUCT` dan permission stok, tetapi dipisahkan dari halaman Product Management agar tidak menumpuk code.

Permission MVP:

```txt
STOCK_OPNAME_MANAGE
```

Grant awal:

- `OWNER`
- `ADMIN`
- `GUDANG`

Jika ingin rilis cepat, permission ini bisa sementara diganti `STOCK_ACCESS`, tetapi untuk produksi lebih aman dipisah karena opname mengubah stok.

## Struktur File Yang Disarankan

Tambahkan file baru:

```txt
src/components/stock-opname/
  StockOpnameHeader.tsx
  StockOpnameItemTable.tsx
  StockOpnameImportModal.tsx
  StockOpnameSummary.tsx
  StockOpnameStatusBadge.tsx

src/hooks/
  useStockOpnames.tsx

src/services/
  stockOpnameService.ts
  stockOpnameReadService.ts

src/utils/stockOpname/
  calculateStockOpnameVariance.ts
  createStockOpnameNumber.ts
  stockOpnameCsv.ts
  validateStockOpname.ts

src/view/stock-opname/
  StockOpnameManagement.tsx
  StockOpnameEditor.tsx
  StockOpnameDetail.tsx

src/routes/master-data/stock-opname.lazy.tsx

src/i18n/
  stockOpnameMessages.ts
```

Update file existing:

```txt
src/types/index.ts
src/lib/database/KasirkuDB.ts
src/lib/database/migrations.ts
src/utils/backupRestore.ts
src/services/stockCardService.ts
src/services/stockMutationSyncService.ts
src/services/postgresAdapter.ts
src/services/syncQueueService.ts
src/auth/permissions.ts
src/auth/permissionCatalog.ts
src/auth/routePermissions.ts
src/auth/moduleAccess.ts
src/constants/setupModules.ts
src/routes/__root.tsx
src/i18n/messages.ts atau src/i18n/stockOpnameMessages.ts
```

Tambahkan file Tauri/Postgres jika sync dokumen opname diaktifkan:

```txt
src-tauri/migrations/0022_stock_opnames.sql
src-tauri/src/models/stock_opname.rs
src-tauri/src/repositories/stock_opname_repository.rs
src-tauri/src/commands/stock_opname_commands.rs
```

Jangan edit manual:

```txt
src/routeTree.gen.ts
```

Biarkan build/generator TanStack Router yang memperbarui file tersebut.

## Data Model

Tambahkan tipe di `src/types/index.ts`.

```ts
export type StockOpnameStatus =
  | 'DRAFT'
  | 'REVIEWED'
  | 'POSTED'
  | 'CANCELLED';

export interface StockOpname {
  id: string;
  opname_number: string;
  status: StockOpnameStatus;
  counted_at: string;
  reviewed_at?: string;
  posted_at?: string;
  cancelled_at?: string;
  warehouse_id?: string;
  warehouse_code?: string;
  warehouse_name?: string;
  notes?: string;
  created_by?: string;
  created_by_name?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  posted_by?: string;
  posted_by_name?: string;
  cancelled_by?: string;
  cancelled_by_name?: string;
  cancel_reason?: string;
  total_items: number;
  total_adjustment_in: number;
  total_adjustment_out: number;
  total_variance_value: number;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface StockOpnameItem {
  id: string;
  opname_id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  category?: string;
  system_quantity: number;
  counted_quantity?: number;
  quantity_delta: number;
  unit: ProductUnit;
  cost_per_unit: number;
  variance_value: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}
```

Update source type:

```ts
export type StockMutationSourceType =
  | ...
  | 'STOCK_OPNAME';

export type InventoryLotSourceType =
  | ...
  | 'STOCK_OPNAME';

export type InventoryLotConsumptionSourceType =
  | ...
  | 'STOCK_OPNAME';
```

Catatan:

- `system_quantity` adalah stok sistem saat draft dibuat.
- Saat posting, service harus memastikan `Product.stock` saat ini masih sama dengan `system_quantity`. Jika sudah berubah karena POS/purchase/return, blok posting dan minta user refresh opname.
- `quantity_delta = counted_quantity - system_quantity`.
- `cost_per_unit` memakai `Product.purchase_price` saat draft dibuat. Untuk costing lebih akurat, selisih minus tetap memakai FIFO consumption.

## Dexie Migration

Tambah table di `src/lib/database/KasirkuDB.ts`:

```ts
stockOpnames!: Table<StockOpname>;
stockOpnameItems!: Table<StockOpnameItem>;
```

Tambah `version(53)` di `src/lib/database/migrations.ts`:

```ts
this.version(53).stores({
  stockOpnames: 'id, opname_number, status, counted_at, posted_at, warehouse_id, sync_status, updated_at, created_at',
  stockOpnameItems: 'id, opname_id, product_id, quantity_delta, created_at',
});
```

Jangan mengubah versi lama kecuali ada kebutuhan migrasi data historis.

## Postgres dan Sync

Untuk remote sync yang lengkap, tambahkan migration `0022_stock_opnames.sql`:

```txt
stock_opnames
stock_opname_items
```

Repository Postgres harus bersifat bundle:

```txt
StockOpnameBundleDto = {
  opname: StockOpnameDto;
  items: StockOpnameItemDto[];
}
```

Sync queue entity baru:

```txt
stockOpnames
```

Namun perubahan stok remote tetap dilakukan lewat `stockMutations`, bukan dengan product sync. Saat posting opname:

1. Update `products.stock` lokal di Dexie.
2. Buat `StockMutation[]`.
3. Enqueue `stockMutations`.
4. Enqueue bundle `stockOpnames` untuk audit remote.
5. Jangan enqueue `products` hanya untuk perubahan stok opname.

Alasan: remote `stock_mutations` sudah append-only dan repository remote sudah menambah/mengurangi `products.stock` dari `quantity_delta`. Product sync membawa snapshot `stock`, sehingga lebih rawan overwrite jika dipakai untuk event stok operasional.

## Domain Utils

`src/utils/stockOpname/calculateStockOpnameVariance.ts`

Tanggung jawab:

- Menghitung `quantity_delta`.
- Menghitung `variance_value`.
- Menghitung summary total in/out/value.
- Tidak membaca Dexie.
- Tidak menulis mutation.

`src/utils/stockOpname/validateStockOpname.ts`

Tanggung jawab:

- Memastikan status draft sebelum edit/review.
- Memastikan status reviewed sebelum post.
- Memastikan `counted_quantity` finite dan tidak negatif.
- Memastikan minimal satu item punya counted quantity.
- Memastikan tidak ada product duplicate.
- Memastikan unit item sama dengan `product.purchase_unit`.

`src/utils/stockOpname/createStockOpnameNumber.ts`

Format awal:

```txt
OPN-YYYYMMDD-HHmmss
```

Nanti bisa diganti sequence tanpa mengubah UI/service.

`src/utils/stockOpname/stockOpnameCsv.ts`

Tanggung jawab:

- Export counting sheet.
- Import hasil hitung fisik.
- Header yang disarankan:

```txt
product_id,sku,name,system_quantity,counted_quantity,unit,notes
```

Parser CSV tidak boleh langsung update database. Parser hanya return rows + errors.

## Service Layer

`src/services/stockOpnameService.ts` adalah pusat efek samping.

Public API:

```ts
createStockOpnameDraft(input)
updateStockOpnameDraft(input)
postStockOpname(input)
reviewStockOpnameDraft(input)
reopenStockOpnameReview(input)
cancelStockOpnameDraft(input)
```

### createStockOpnameDraft

Langkah:

1. Cek user dan permission `STOCK_OPNAME_MANAGE`.
2. Ambil products dari Dexie.
3. Filter produk aktif/sesuai pilihan kategori/search jika dibutuhkan.
4. Snapshot:
   - product id/name/sku/category
   - `Product.stock`
   - `Product.purchase_unit`
   - `Product.purchase_price`
5. Simpan `stockOpnames` status `DRAFT`.
6. Simpan `stockOpnameItems`.
7. Tulis activity log.

### updateStockOpnameDraft

Langkah:

1. Cek status masih `DRAFT`.
2. Validasi counted quantity.
3. Hitung ulang delta dan summary lewat utils.
4. Update item dan header summary.
5. Jangan mengubah `products.stock`.
6. Jangan membuat FIFO lot.
7. Jangan enqueue sync stock mutation.

### reviewStockOpnameDraft

Langkah di dalam satu transaksi Dexie:

1. Cek user dan permission.
2. Ambil opname + items.
3. Cek status `DRAFT`.
4. Validasi semua item yang akan direview.
5. Update opname status menjadi `REVIEWED`.
6. Simpan `reviewed_at`, `reviewed_by`, summary final, dan sync status pending.
7. Tulis activity log.
8. Enqueue bundle stock opname untuk audit remote.

### reopenStockOpnameReview

Langkah:

1. Cek status `REVIEWED`.
2. Update status kembali menjadi `DRAFT`.
3. Kosongkan snapshot reviewer.
4. Tulis activity log.
5. Enqueue bundle stock opname untuk audit remote.

### postStockOpname

Langkah di dalam satu transaksi Dexie:

1. Cek user dan permission.
2. Ambil opname + items.
3. Cek status `REVIEWED`.
4. Validasi semua item yang akan diposting.
5. Untuk setiap item yang `counted_quantity` terisi:
   - Ambil product terkini.
   - Pastikan `product.stock === item.system_quantity`.
   - Hitung `delta`.
   - Jika `delta > 0`, update product stock dan panggil `addInventoryLot({ sourceType: 'STOCK_OPNAME' })`.
   - Jika `delta < 0`, update product stock dan panggil `consumeFifoLots(..., { sourceType: 'STOCK_OPNAME' })`.
   - Buat `StockMutation` dengan `sourceType: 'STOCK_OPNAME'`.
6. Update opname status menjadi `POSTED`.
7. Simpan `posted_at`, `posted_by`, summary final.
8. Tulis activity log.

Setelah transaksi Dexie selesai:

1. `enqueueStockMutations(stockMutations)`.
2. `enqueueStockOpnameBundleSync(opname, items)`.
3. Invalidate query produk, opname, dan stock card.

Aturan penting:

- Jangan enqueue stock mutation di dalam transaksi Dexie.
- Jangan menulis logic FIFO di hook atau component.
- Jangan melakukan product sync hanya karena stok berubah akibat opname.
- Jangan memperbolehkan posting jika stok sistem berubah sejak draft dibuat.

### cancelStockOpnameDraft

Langkah:

1. Cek status masih `DRAFT` atau `REVIEWED`.
2. Update status menjadi `CANCELLED`.
3. Simpan alasan.
4. Tulis activity log.
5. Tidak ada efek stok.

Posted opname tidak di-void di MVP. Koreksi dilakukan dengan membuat opname baru agar audit trail tetap append-only.

## Read Service

`src/services/stockOpnameReadService.ts`

Tanggung jawab:

- `listStockOpnames(filters)`
- `getStockOpnameDetail(id)`
- `getStockOpnameCandidates(filters)`
- `getStockOpnameSummary(id)`

Read service boleh join manual dari Dexie, tetapi tidak boleh mengubah data.

## Hook

`src/hooks/useStockOpnames.tsx`

Tanggung jawab:

- Mengambil data list/detail lewat read service.
- Membungkus mutation service.
- Mengatur loading/error/success message.
- Invalidate query:
  - `['stockOpnames']`
  - `['stockOpname', id]`
  - `['products']`
  - `['stockCard']`

Hook tidak boleh:

- Menghitung FIFO.
- Mengubah `products.stock` langsung.
- Membuat `StockMutation` langsung.
- Mengakses `db.transaction` untuk proses posting.

## UI dan Component

`src/view/stock-opname/StockOpnameManagement.tsx`

Tanggung jawab:

- List dokumen opname.
- Filter status/tanggal/search.
- Tombol buat opname.
- Link ke detail/editor.

`src/view/stock-opname/StockOpnameEditor.tsx`

Tanggung jawab:

- Menampilkan header draft.
- Menampilkan tabel item.
- Menghubungkan input counted quantity ke hook.
- Tombol save draft, import CSV, export sheet, post, cancel.

`src/view/stock-opname/StockOpnameDetail.tsx`

Tanggung jawab:

- Tampilan read-only posted/cancelled opname.
- Ringkasan selisih.
- Table item.

`src/components/stock-opname/StockOpnameItemTable.tsx`

Tanggung jawab:

- Render baris item.
- Input counted quantity.
- Menampilkan selisih.
- Tidak membaca Dexie.
- Tidak memanggil service langsung.

Komponen menerima props dan callback dari view/hook.

## Routing, Navigation, dan Module Access

Tambahkan route:

```txt
src/routes/master-data/stock-opname.lazy.tsx
```

Update `src/auth/routePermissions.ts`:

```ts
'/master-data/stock-opname': 'STOCK_OPNAME_MANAGE'
```

Update `src/auth/moduleAccess.ts`:

```ts
'/master-data/stock-opname': ['PRODUCT']
```

Update navigation di `src/routes/__root.tsx` pada group Master Data:

```txt
Produk
Stock Opname
Gudang
Satuan
```

Gunakan icon lucide yang sudah ada, misalnya `ClipboardCheck`, `ClipboardList`, atau `PackageCheck`.

## Permission dan Role

Update `src/types/index.ts`:

```ts
export type Permission =
  | ...
  | 'STOCK_OPNAME_MANAGE';
```

Update `src/auth/permissions.ts`:

```txt
OWNER: STOCK_OPNAME_MANAGE
ADMIN: STOCK_OPNAME_MANAGE
GUDANG: STOCK_OPNAME_MANAGE
```

Update `src/auth/permissionCatalog.ts`:

```txt
Label: Kelola Stock Opname
Group: Stok
Module: PRODUCT
Sensitive: true
```

Jika role custom sudah banyak dipakai, tambahkan migration/backfill role permission agar role existing yang seharusnya boleh opname mendapat permission baru.

## Kartu Stok

Update `src/services/stockCardService.ts`.

Tambahkan pembacaan `stockOpnameItems` dengan header `stockOpnames`.

Aturan:

- Hanya opname status `POSTED`.
- `quantity_delta > 0` tampil sebagai Masuk.
- `quantity_delta < 0` tampil sebagai Keluar.
- `sourceType = 'STOCK_OPNAME'`.
- `sourceNumber = opname.opname_number`.
- Masuk ke `allMutations` bersama sumber lain.

Update label di `src/view/StockCard.tsx`:

```txt
STOCK_OPNAME: Stock Opname
```

## Backup dan Restore

Update `src/utils/backupRestore.ts`:

- Backup:
  - `stockOpnames`
  - `stockOpnameItems`
- Validation expected keys.
- Transaction table list.
- Clear table saat restore.
- Bulk add saat restore.
- Naikkan `version` backup.

Jangan lupa memastikan restore lama tetap valid jika key opname belum ada.

## I18n

Opsi rapi:

```txt
src/i18n/stockOpnameMessages.ts
```

Keys contoh:

```txt
stockOpname.title
stockOpname.create
stockOpname.post
stockOpname.cancel
stockOpname.countedAt
stockOpname.systemQty
stockOpname.countedQty
stockOpname.variance
stockOpname.postConfirmTitle
stockOpname.stockChangedError
stockOpname.importCsv
stockOpname.exportSheet
```

Jika registry i18n saat ini lebih mudah lewat `messages.ts`, boleh mulai dari sana, tetapi jangan menyebar literal text di komponen.

## Accounting / General Ledger

MVP boleh tanpa jurnal otomatis variance jika General Ledger belum siap untuk akun selisih persediaan.

Untuk production-ready, tambahkan:

- Akun `inventory-variance` atau mapping finance khusus selisih stok.
- `postStockOpnameJournal(opname, items, actor)` di `generalLedgerService.ts`.
- Jika delta plus:
  - Debit Persediaan Barang.
  - Credit Selisih Persediaan.
- Jika delta minus:
  - Debit Selisih Persediaan.
  - Credit Persediaan Barang.

Aktifkan hanya jika `inventory_policy === 'PERPETUAL_INVENTORY'`.

## Urutan Implementasi

### Fase 1 - Domain dan Schema

1. Tambah tipe `StockOpname`, `StockOpnameItem`, dan status.
2. Tambah source type `STOCK_OPNAME`.
3. Tambah Dexie table di `KasirkuDB.ts`.
4. Tambah migration Dexie `version(53)`.
5. Update backup/restore.

Acceptance:

- App build tanpa error tipe.
- Database bisa upgrade tanpa kehilangan table lama.

### Fase 2 - Utils

1. Buat kalkulasi variance.
2. Buat validasi opname.
3. Buat generator nomor opname.
4. Buat CSV export/import untuk counting sheet.

Acceptance:

- Kalkulasi delta plus/minus/zero konsisten.
- Parser CSV tidak menulis database.

### Fase 3 - Service

1. Buat `stockOpnameService.ts`.
2. Implement create draft.
3. Implement update draft.
4. Implement review draft.
5. Implement reopen review.
6. Implement post opname dengan transaksi Dexie.
7. Implement cancel draft/reviewed.
8. Tulis activity log.
9. Enqueue stock mutations dan bundle stock opname setelah transaksi selesai.

Acceptance:

- Delta plus menambah stok dan FIFO lot.
- Delta minus mengurangi stok dan consume FIFO.
- Posting hanya dari status `REVIEWED`.
- Posting terblokir jika stok product berubah sejak draft dibuat.
- No-op item tetap tersimpan sebagai audit, tetapi tidak membuat stock mutation.

### Fase 4 - Read Service dan Hook

1. Buat `stockOpnameReadService.ts`.
2. Buat `useStockOpnames.tsx`.
3. Pastikan hook tidak berisi domain logic.
4. Invalidate query yang relevan setelah mutation.

Acceptance:

- List, detail, create, update, post, cancel bisa dipanggil dari hook.
- UI tidak perlu import `db`.

### Fase 5 - UI

1. Buat component kecil di `src/components/stock-opname`.
2. Buat view management.
3. Buat editor draft.
4. Buat detail read-only.
5. Tambah import/export CSV.
6. Tambah modal create draft dengan filter produk/kategori.
7. Tambah filter item, pencarian item, dan bulk count untuk item yang tampil.
8. Tambah state empty/loading/error.

Acceptance:

- Component tidak memanggil service langsung.
- Tabel tetap usable di mobile dan desktop.
- Tidak ada logic posting di file view.
- Draft bisa dibatasi scope produk tanpa membuat semua produk otomatis.

### Fase 6 - Route, Permission, Navigation

1. Tambah route lazy.
2. Update permission dan role.
3. Update route permission.
4. Update module access.
5. Update navigation.
6. Jalankan build agar `routeTree.gen.ts` regenerated.

Acceptance:

- OWNER/ADMIN/GUDANG bisa akses.
- KASIR tidak bisa akses jika tidak diberi permission.
- Menu hilang jika module `PRODUCT` tidak aktif.

### Fase 7 - Stock Card dan Report

1. Tambah movement `STOCK_OPNAME` di `stockCardService.ts`.
2. Tambah label di `StockCard.tsx`.
3. Pastikan balance kartu stok tetap anchored ke `products.stock`.

Acceptance:

- Setelah posting opname, Kartu Stok menampilkan baris opname.
- Saldo akhir kartu stok sama dengan `products.stock`.

### Fase 8 - Sync Postgres

Status: selesai untuk audit dokumen.

1. Tambah migration `0022_stock_opnames.sql`.
2. Tambah model/repository/command Tauri.
3. Tambah remote DTO dan adapter.
4. Tambah sync queue entity `stockOpnames`.
5. Tambah merge remote opname ke Dexie.
6. Pastikan stock mutation tetap menjadi sumber update stok remote.

Acceptance:

- Dokumen opname tersync sebagai audit.
- Remote product stock berubah dari `stock_mutations`.
- Re-run sync tidak menggandakan efek stok karena mutation id idempotent.

### Fase 9 - Testing

Minimal test manual:

1. Buat produk stok 10 pcs.
2. Buat draft opname.
3. Isi stok fisik 12 pcs.
4. Post.
5. Produk menjadi 12 pcs.
6. FIFO lot bertambah 2 pcs source `STOCK_OPNAME`.
7. Kartu Stok menampilkan Masuk 2 pcs.
8. Buat opname baru stok fisik 9 pcs.
9. Post.
10. Produk menjadi 9 pcs.
11. FIFO lot ter-consume 3 pcs.
12. Kartu Stok menampilkan Keluar 3 pcs.

Minimal regression:

- POS sale setelah opname minus tetap bisa consume FIFO.
- Purchase Receipt setelah opname plus tetap menambah lot normal.
- Sales Return setelah opname tetap membuat lot restock normal.
- Backup lalu restore membawa dokumen opname.
- Role tanpa permission tidak bisa buka route.

Command verifikasi:

```txt
npm run build
```

Jika ada waktu:

```txt
npm run lint
```

## Anti-Pattern Yang Harus Dihindari

- Menaruh `db.transaction` di component.
- Mengubah `products.stock` langsung dari UI.
- Membuat mutation sync di hook.
- Mengubah `StockManagement.tsx` menjadi halaman campuran product + opname.
- Menggunakan CSV import produk sebagai shortcut opname.
- Membuat product sync untuk setiap selisih opname.
- Menghapus posted opname.
- Mengubah stok fisik tanpa audit item.
- Mengklaim opname per gudang sebelum ada saldo stok per gudang.

## Catatan Lanjutan

Kalau nanti ingin Stock Opname per gudang, tambahkan fondasi baru dulu:

```txt
stockBalances
stockBalanceMutations
warehouse_id wajib pada movement stok
```

Setelah itu `products.stock` bisa menjadi derived/global total, bukan satu-satunya sumber saldo operasional.
