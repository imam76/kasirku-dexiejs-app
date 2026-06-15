# Produksi / Perakitan Produk

Dokumen ini merangkum langkah implementasi fitur untuk mengolah bahan baku dari produk menjadi barang jadi, lalu menyimpan barang jadi kembali sebagai produk dengan HPP produksi sebagai harga modal atau harga beli awal.

## Tujuan

Fitur produksi memungkinkan user membuat barang jadi dari beberapa bahan baku yang sudah ada di master produk.

Contoh:

```txt
Produk jadi: Kopi Susu Botol
Jumlah produksi: 10 botol

Bahan:
- Kopi bubuk: 200 gram
- Susu: 2 liter
- Gula: 150 gram
- Botol: 10 pcs

Biaya tambahan:
- Tenaga kerja: Rp10.000
- Gas/listrik: Rp5.000

Total biaya bahan: Rp80.000
Total biaya tambahan: Rp15.000
Total biaya produksi: Rp95.000
HPP per botol: Rp9.500
```

Saat produksi diposting:

- Stok bahan baku berkurang.
- Stok barang jadi bertambah.
- FIFO lot bahan baku dikonsumsi untuk menghitung biaya aktual.
- Barang jadi dibuat sebagai inventory lot baru.
- `purchase_price` barang jadi bisa di-update memakai HPP produksi.
- Kartu stok menampilkan pergerakan bahan keluar dan barang jadi masuk.

## Fondasi Project Saat Ini

Project sudah punya beberapa fondasi yang bisa dipakai langsung:

- `Product` punya `purchase_price`, `selling_price`, `stock`, `purchase_unit`, dan `selling_unit`.
- Stok disimpan dalam base unit, biasanya `purchase_unit`.
- FIFO inventory sudah tersedia lewat:
  - `src/utils/inventory/consumeFifoLots.ts`
  - `src/utils/inventory/addInventoryLot.ts`
- Kartu stok tersedia di:
  - `src/services/stockCardService.ts`
- Stock mutation sync tersedia di:
  - `src/services/stockMutationSyncService.ts`
- General Ledger tersedia di:
  - `src/services/generalLedgerService.ts`
- Local database Dexie didefinisikan di:
  - `src/lib/database/KasirkuDB.ts`
  - `src/lib/database/migrations.ts`
- Sync Postgres/Tauri tersedia lewat:
  - `src/services/postgresAdapter.ts`
  - `src/services/syncQueueService.ts`
  - `src-tauri/migrations`
  - `src-tauri/src/models`
  - `src-tauri/src/repositories`
  - `src-tauri/src/commands`

## Scope MVP

Tahap MVP sebaiknya fokus ke alur produksi yang aman dan bisa diaudit:

1. User memilih produk barang jadi.
2. User mengisi jumlah produksi.
3. User memilih bahan baku dan jumlah pemakaian.
4. User mengisi biaya tambahan produksi.
5. Sistem menghitung total biaya bahan memakai FIFO.
6. Sistem menghitung HPP per unit barang jadi.
7. Sistem mengurangi stok bahan baku.
8. Sistem menambah stok barang jadi.
9. Sistem membuat riwayat produksi.
10. Sistem menampilkan efek produksi di kartu stok.

Fitur yang bisa ditunda:

- Multi tahap produksi atau work in process.
- Pemisahan akun bahan baku, barang dalam proses, dan barang jadi.
- Variance biaya produksi.
- Alokasi overhead otomatis.
- Production planning atau bill of material versioning kompleks.

## Langkah 1: Tambah Tipe Data

Tambahkan tipe produksi di `src/types/index.ts`.

Contoh struktur minimal:

```ts
export type ProductionOrderStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export interface ProductRecipe {
  id: string;
  finished_product_id: string;
  finished_product_name: string;
  output_quantity: number;
  output_unit: ProductUnit;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductRecipeItem {
  id: string;
  recipe_id: string;
  material_product_id: string;
  material_product_name: string;
  quantity: number;
  unit: ProductUnit;
  created_at: string;
  updated_at: string;
}

export interface ProductionOrder {
  id: string;
  production_number: string;
  status: ProductionOrderStatus;
  finished_product_id: string;
  finished_product_name: string;
  quantity_produced: number;
  unit: ProductUnit;
  material_cost: number;
  additional_cost: number;
  total_cost: number;
  unit_cost: number;
  produced_at: string;
  posted_at?: string;
  voided_at?: string;
  void_reason?: string;
  notes?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface ProductionOrderItem {
  id: string;
  production_order_id: string;
  material_product_id: string;
  material_product_name: string;
  sku?: string;
  quantity_used: number;
  unit: ProductUnit;
  stock_quantity_used: number;
  stock_unit: ProductUnit;
  cost_per_unit: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export interface ProductionOrderCost {
  id: string;
  production_order_id: string;
  name: string;
  amount: number;
  account_id?: string;
  account_code?: string;
  account_name?: string;
  created_at: string;
  updated_at: string;
}
```

Tambahkan source type baru:

```ts
export type StockMutationSourceType =
  | ...
  | 'PRODUCTION_CONSUMPTION'
  | 'PRODUCTION_OUTPUT'
  | 'PRODUCTION_VOID';

export type InventoryLotSourceType =
  | ...
  | 'PRODUCTION_OUTPUT';

export type InventoryLotConsumptionSourceType =
  | ...
  | 'PRODUCTION_CONSUMPTION';

export type JournalSourceType =
  | ...
  | 'PRODUCTION_ORDER';
```

## Langkah 2: Tambah Dexie Tables

Update `src/lib/database/KasirkuDB.ts`:

```ts
productRecipes!: Table<ProductRecipe>;
productRecipeItems!: Table<ProductRecipeItem>;
productionOrders!: Table<ProductionOrder>;
productionOrderItems!: Table<ProductionOrderItem>;
productionOrderCosts!: Table<ProductionOrderCost>;
```

Update import type di file yang sama.

Tambahkan migration baru di `src/lib/database/migrations.ts`.

Contoh:

```ts
this.version(52).stores({
  productRecipes: 'id, finished_product_id, finished_product_name, created_at, updated_at',
  productRecipeItems: 'id, recipe_id, material_product_id',
  productionOrders: 'id, production_number, status, finished_product_id, produced_at, sync_status, updated_at, created_at',
  productionOrderItems: 'id, production_order_id, material_product_id',
  productionOrderCosts: 'id, production_order_id',
});
```

Sesuaikan nomor version dengan versi Dexie terbaru di project saat implementasi.

## Langkah 3: Buat Service Produksi

Buat file:

```txt
src/services/productionService.ts
```

Service minimal:

- `createDraftProductionOrder`
- `postProductionOrder`
- `voidProductionOrder`
- `calculateProductionCost`
- `buildProductionNumber`

Alur `postProductionOrder`:

1. Validasi user punya permission inventory.
2. Ambil produk barang jadi.
3. Ambil semua produk bahan baku.
4. Konversi jumlah bahan ke `purchase_unit`.
5. Pastikan stok bahan cukup.
6. Konsumsi FIFO lot bahan baku dengan `consumeFifoLots`.
7. Hitung `material_cost`.
8. Hitung `additional_cost`.
9. Hitung `total_cost`.
10. Hitung `unit_cost = total_cost / quantity_produced`.
11. Kurangi stok bahan baku.
12. Tambah stok barang jadi.
13. Tambah inventory lot barang jadi dengan `addInventoryLot`.
14. Buat stock mutation untuk bahan keluar.
15. Buat stock mutation untuk barang jadi masuk.
16. Update `purchase_price` barang jadi.
17. Simpan production order sebagai `POSTED`.
18. Tulis activity log.
19. Queue sync product, stock mutation, production order, dan jurnal bila ada.

Pseudo-code:

```ts
await db.transaction('rw', [
  db.products,
  db.inventoryLots,
  db.inventoryLotConsumptions,
  db.productionOrders,
  db.productionOrderItems,
  db.productionOrderCosts,
], async () => {
  const finishedProduct = await db.products.get(input.finishedProductId);
  if (!finishedProduct) throw new Error('Produk barang jadi tidak ditemukan.');

  let materialCost = 0;

  for (const material of input.materials) {
    const product = await db.products.get(material.productId);
    if (!product) throw new Error('Produk bahan baku tidak ditemukan.');

    const stockQuantity = konversiSatuanProduk(
      material.quantity,
      product,
      material.unit,
      product.purchase_unit,
    );

    if (product.stock < stockQuantity) {
      throw new Error(`Stok ${product.name} tidak cukup.`);
    }

    const fifo = await consumeFifoLots(product.id, stockQuantity, {
      sourceType: 'PRODUCTION_CONSUMPTION',
      sourceId: productionOrder.id,
      sourceLineId: material.id,
      createdAt: now,
    });

    materialCost += fifo.totalCost;

    await db.products.update(product.id, {
      stock: product.stock - stockQuantity,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    });
  }

  const additionalCost = input.additionalCosts.reduce((sum, cost) => sum + cost.amount, 0);
  const totalCost = materialCost + additionalCost;
  const unitCost = totalCost / input.quantityProduced;

  await db.products.update(finishedProduct.id, {
    stock: finishedProduct.stock + input.quantityProduced,
    purchase_price: unitCost,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  });

  await addInventoryLot({
    productId: finishedProduct.id,
    productName: finishedProduct.name,
    sku: finishedProduct.sku,
    sourceType: 'PRODUCTION_OUTPUT',
    sourceId: productionOrder.id,
    sourceLineId: productionOrder.id,
    quantityReceived: input.quantityProduced,
    costPerUnit: unitCost,
    receivedAt: now,
  });
});
```

## Langkah 4: Aturan Update Harga Modal Barang Jadi

Ada dua opsi.

Opsi MVP:

```txt
purchase_price barang jadi = unit_cost produksi terakhir
```

Kelebihan:

- Mudah dipahami.
- Implementasi sederhana.
- Cocok untuk tahap awal.

Kekurangan:

- Jika masih ada stok lama, harga modal produk berubah mengikuti produksi terakhir.

Opsi lebih akurat:

```txt
average_cost = (nilai stok lama + nilai produksi baru) / total stok setelah produksi
```

Contoh:

```txt
Stok lama: 10 pcs x Rp8.000 = Rp80.000
Produksi baru: 10 pcs x Rp9.500 = Rp95.000

Average cost = Rp175.000 / 20 pcs = Rp8.750
```

Rekomendasi:

- Gunakan opsi MVP dulu.
- Karena penjualan sudah memakai FIFO lot, HPP transaksi tetap bisa lebih akurat walaupun `purchase_price` produk dipakai sebagai harga referensi.

## Langkah 5: Stock Mutation

Setiap posting produksi harus membuat stock mutation.

Untuk bahan baku:

```txt
source_type: PRODUCTION_CONSUMPTION
quantity_delta: negatif
```

Untuk barang jadi:

```txt
source_type: PRODUCTION_OUTPUT
quantity_delta: positif
```

Gunakan helper:

```ts
createStockMutation(...)
enqueueStockMutations(...)
```

Lokasi helper:

```txt
src/services/stockMutationSyncService.ts
```

## Langkah 6: Kartu Stok

Update:

```txt
src/services/stockCardService.ts
```

Tambahkan pembacaan `productionOrderItems` untuk bahan keluar dan `productionOrders` untuk barang jadi masuk.

Label yang disarankan:

```txt
PRODUCTION_CONSUMPTION -> Produksi - Bahan Keluar
PRODUCTION_OUTPUT -> Produksi - Barang Jadi
PRODUCTION_VOID -> Void Produksi
```

Kartu stok harus menampilkan:

- Bahan baku sebagai qty out.
- Barang jadi sebagai qty in.
- Nomor produksi sebagai source number.

## Langkah 7: UI Produksi

Tambahkan route:

```txt
src/routes/master-data/production.lazy.tsx
```

Tambahkan view:

```txt
src/view/production/ProductionManagement.tsx
src/view/production/ProductionOrderForm.tsx
src/view/production/ProductionOrderDetail.tsx
```

Tambahkan hook:

```txt
src/hooks/useProductionOrders.tsx
```

Tambahkan menu di:

```txt
src/routes/__root.tsx
```

Lokasi menu yang disarankan:

```txt
Master Data
- Produk
- Produksi
- Stock Opname
```

Kontrol form yang dibutuhkan:

- Select produk barang jadi.
- Input jumlah produksi.
- Table bahan baku.
- Select produk bahan baku.
- Input jumlah bahan.
- Select satuan bahan.
- Table biaya tambahan.
- Input nama biaya.
- Input nominal biaya.
- Preview total biaya bahan.
- Preview total biaya tambahan.
- Preview HPP per unit.
- Button simpan draft.
- Button posting produksi.

## Langkah 8: Recipe atau Bill of Material

Untuk MVP, produksi bisa langsung input bahan per order tanpa recipe.

Tahap berikutnya, tambahkan recipe agar user tidak perlu input bahan berulang.

Alur recipe:

1. User membuat recipe untuk produk barang jadi.
2. Recipe menyimpan daftar bahan untuk output tertentu.
3. Saat buat production order, user pilih recipe.
4. Sistem mengalikan quantity bahan sesuai jumlah produksi.

Contoh:

```txt
Recipe Kopi Susu Botol
Output: 1 botol

Bahan:
- Kopi bubuk 20 gram
- Susu 200 ml
- Gula 15 gram
- Botol 1 pcs
```

Jika produksi 10 botol, sistem otomatis menghitung:

```txt
- Kopi bubuk 200 gram
- Susu 2.000 ml
- Gula 150 gram
- Botol 10 pcs
```

## Langkah 9: General Ledger

Untuk tahap awal, gunakan akun inventory umum yang sudah ada.

Tambahkan event di `generalLedgerService.ts`:

```ts
PRODUCTION_ORDER_POSTED: 'PRODUCTION_ORDER_POSTED'
```

Tambahkan function:

```ts
postProductionOrderJournal(order, items, costs, actor)
```

Jurnal sederhana:

```txt
Debit  Persediaan Barang Jadi / Persediaan Barang    total_cost
Kredit Persediaan Barang / Bahan Baku                material_cost
Kredit Kas/Beban/Overhead Produksi                   additional_cost
```

Untuk MVP tanpa pemisahan akun bahan baku dan barang jadi:

```txt
Debit  Persediaan Barang    total_cost
Kredit Persediaan Barang    material_cost
Kredit Kas/Beban Produksi   additional_cost
```

Catatan:

- Jika akun debit dan kredit inventory sama, jurnal tetap bisa dipakai sebagai audit biaya produksi, tapi laporan tidak akan memisahkan bahan baku dan barang jadi.
- Versi manufacturing yang lebih matang sebaiknya menambah akun:
  - Persediaan Bahan Baku
  - Barang Dalam Proses
  - Persediaan Barang Jadi
  - Overhead Produksi

## Langkah 10: Sync Postgres dan Tauri

Jika fitur harus sync lintas device, tambahkan struktur remote.

Frontend:

```txt
src/services/postgresAdapter.ts
src/services/syncQueueService.ts
```

Tambahkan DTO:

```ts
RemoteProductRecipeDto
RemoteProductRecipeItemDto
RemoteProductionOrderDto
RemoteProductionOrderItemDto
RemoteProductionOrderCostDto
RemoteProductionOrderBundleDto
```

Tambahkan adapter:

```ts
productionOrderPostgresAdapter
```

Tambahkan enqueue:

```ts
enqueueProductionOrderBundleSync(order, items, costs, operation)
enqueuePendingProductionOrdersForSync()
```

Backend Tauri:

```txt
src-tauri/migrations/00xx_production_orders.sql
src-tauri/src/models/production_order.rs
src-tauri/src/repositories/production_order_repository.rs
src-tauri/src/commands/production_order_commands.rs
```

Update:

```txt
src-tauri/src/models/mod.rs
src-tauri/src/repositories/mod.rs
src-tauri/src/commands/mod.rs
src-tauri/src/lib.rs
```

## Langkah 11: Migration Postgres

Contoh table utama:

```sql
CREATE TABLE IF NOT EXISTS production_orders (
    id TEXT PRIMARY KEY,
    production_number TEXT NOT NULL,
    status TEXT NOT NULL,
    finished_product_id TEXT NOT NULL REFERENCES products(id),
    finished_product_name TEXT NOT NULL,
    quantity_produced DOUBLE PRECISION NOT NULL,
    unit TEXT NOT NULL,
    material_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    additional_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    produced_at TIMESTAMPTZ NOT NULL,
    posted_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    notes TEXT,
    created_by TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS production_order_items (
    id TEXT PRIMARY KEY,
    production_order_id TEXT NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    material_product_id TEXT NOT NULL REFERENCES products(id),
    material_product_name TEXT NOT NULL,
    sku TEXT,
    quantity_used DOUBLE PRECISION NOT NULL,
    unit TEXT NOT NULL,
    stock_quantity_used DOUBLE PRECISION NOT NULL,
    stock_unit TEXT NOT NULL,
    cost_per_unit DOUBLE PRECISION NOT NULL,
    total_cost DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS production_order_costs (
    id TEXT PRIMARY KEY,
    production_order_id TEXT NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
```

Tambahkan index:

```sql
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON production_orders (status);
CREATE INDEX IF NOT EXISTS idx_production_orders_finished_product_id ON production_orders (finished_product_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_produced_at ON production_orders (produced_at);
CREATE INDEX IF NOT EXISTS idx_production_order_items_order_id ON production_order_items (production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_order_items_material_product_id ON production_order_items (material_product_id);
```

## Langkah 12: Permission

Tambahkan permission baru di `src/types/index.ts`:

```ts
| 'PRODUCTION_MANAGE'
```

Update:

```txt
src/auth/permissionCatalog.ts
src/auth/roleSeed.ts
src/auth/routePermissions.ts
```

Rekomendasi default:

- OWNER: allowed
- ADMIN: allowed
- GUDANG: allowed
- KASIR: denied

## Langkah 13: Validasi

Validasi saat posting:

- Produk barang jadi wajib ada.
- Jumlah produksi harus lebih dari 0.
- Minimal ada satu bahan baku.
- Bahan baku tidak boleh sama dengan produk barang jadi.
- Jumlah bahan harus lebih dari 0.
- Stok bahan baku harus cukup.
- FIFO lot bahan tidak boleh `PENDING`.
- Total biaya produksi harus lebih dari 0.
- Unit bahan harus bisa dikonversi ke `purchase_unit`.
- Production order yang sudah `POSTED` tidak boleh diedit langsung.
- Production order `VOIDED` tidak boleh diposting ulang.

## Langkah 14: Void Produksi

Void produksi perlu hati-hati.

MVP yang aman:

- Hanya boleh void jika stok barang jadi masih cukup untuk dikurangi.
- Saat void:
  - Kurangi stok barang jadi.
  - Tambahkan kembali stok bahan baku memakai biaya saat konsumsi.
  - Buat stock mutation reversal.
  - Buat reversal journal jika GL aktif.

Alternatif lebih sederhana:

- Jangan sediakan void produksi di MVP.
- Koreksi dilakukan lewat stock opname.

Rekomendasi:

- MVP boleh tanpa void.
- Tambahkan void setelah posting produksi stabil.

## Langkah 15: Testing

Minimal test manual:

1. Buat bahan baku dengan stok dan harga beli.
2. Buat produk barang jadi dengan stok 0.
3. Posting produksi 10 unit.
4. Pastikan stok bahan baku berkurang.
5. Pastikan stok barang jadi bertambah.
6. Pastikan inventory lot barang jadi dibuat.
7. Pastikan `purchase_price` barang jadi menjadi HPP produksi.
8. Pastikan kartu stok bahan menampilkan qty keluar.
9. Pastikan kartu stok barang jadi menampilkan qty masuk.
10. Jual barang jadi.
11. Pastikan HPP transaksi mengambil lot produksi.

Test otomatis yang disarankan:

- Unit test `calculateProductionCost`.
- Unit test konversi satuan bahan.
- Integration test `postProductionOrder`.
- Integration test stok tidak cukup.
- Integration test FIFO lot pending cost.
- Integration test kartu stok produksi.

## Urutan Implementasi Rekomendasi

1. Tambah tipe data produksi.
2. Tambah Dexie tables dan migration.
3. Tambah source type produksi untuk stock mutation dan inventory lot.
4. Buat `productionService.ts`.
5. Implement `postProductionOrder`.
6. Integrasi `consumeFifoLots`.
7. Integrasi `addInventoryLot`.
8. Integrasi stock mutation.
9. Update kartu stok.
10. Buat hook `useProductionOrders`.
11. Buat UI list produksi.
12. Buat UI form produksi.
13. Tambah route dan menu.
14. Tambah permission.
15. Tambah activity log.
16. Tambah sync Postgres/Tauri.
17. Tambah jurnal GL.
18. Tambah void produksi jika diperlukan.
19. Tambah test.

## Keputusan Awal yang Disarankan

Untuk implementasi pertama, gunakan keputusan berikut:

- Produk tetap memakai table `products`.
- Barang jadi juga disimpan sebagai produk.
- Bahan baku juga disimpan sebagai produk.
- Produksi membuat record audit di `productionOrders`.
- HPP barang jadi memakai FIFO bahan baku plus biaya tambahan.
- Barang jadi masuk sebagai inventory lot `PRODUCTION_OUTPUT`.
- `purchase_price` barang jadi di-update ke HPP produksi terakhir.
- Sync Postgres dibuat setelah MVP lokal stabil.
- Jurnal GL dibuat setelah alur stok dan costing stabil.
