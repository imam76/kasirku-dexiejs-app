# Ringkasan Struktur Proyek Kasirku Dexie.js App

## Deskripsi Proyek
Proyek ini adalah aplikasi Point of Sale (POS) yang dibangun menggunakan teknologi web modern. Aplikasi ini menggunakan Dexie.js untuk penyimpanan data lokal, dengan integrasi Supabase untuk database cloud, dan dikemas sebagai aplikasi desktop menggunakan Tauri.

## Teknologi Utama
- **Frontend**: React dengan TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Database**: Dexie.js (IndexedDB) dan Supabase
- **Desktop App**: Tauri (Rust)
- **Routing**: TanStack Router
- **State Management**: Zustand (transactionStore)
- **Linting**: ESLint

## Struktur Folder Utama

### Root Level
- `eslint.config.js` - Konfigurasi ESLint
- `index.html` - Entry point HTML
- `package.json` - Dependencies dan scripts npm
- `postcss.config.js` - Konfigurasi PostCSS
- `README.md` - Dokumentasi proyek
- `tailwind.config.js` - Konfigurasi Tailwind CSS
- `tsconfig.json` - Konfigurasi TypeScript
- `tsconfig.node.json` - Konfigurasi TypeScript untuk Node.js
- `vite.config.d.ts` - Type definitions untuk Vite config
- `vite.config.js` - Konfigurasi Vite
- `vite.config.ts` - Konfigurasi Vite (TypeScript)

### Folder `PRD/`
- `Fitur Multi Unit — Aplikasi POS.md` - Dokumentasi Product Requirements

### Folder `public/`
- Berisi aset publik (favicon, dll.)

### Folder `src/`
- `App.css`, `App.tsx` - Komponen utama aplikasi
- `index.css`, `main.tsx` - Entry point React
- `routeTree.gen.ts` - Generated route tree
- `theme.ts`, `ThemeProvider.tsx` - Manajemen tema
- `vite-env.d.ts` - Type definitions untuk Vite

#### Subfolder `assets/`
- Aset statis (gambar, dll.)

#### Subfolder `components/`
- `CartItem.tsx` - Item dalam keranjang
- `CartSidebar.tsx` - Sidebar keranjang
- `CartSummary.tsx` - Ringkasan keranjang
- `Loading.tsx` - Komponen loading
- `MobileCartDrawer.tsx` - Drawer keranjang mobile
- `NotFound.tsx` - Halaman 404
- `ProductList.tsx` - Daftar produk
- `ScannerModal.tsx` - Modal scanner
- `StockTable.tsx` - Tabel stok

#### Subfolder `hooks/`
- `index.ts` - Export hooks
- `useHistory.tsx` - Hook untuk riwayat
- `useProfit.tsx` - Hook untuk laporan laba
- `useReports.tsx` - Hook untuk laporan
- `useScanner.ts` - Hook untuk scanner
- `useShoppingNote.tsx` - Hook untuk catatan belanja
- `useStockManagement.tsx` - Hook untuk manajemen stok
- `useTheme.tsx` - Hook untuk tema
- `useTransaction.tsx` - Hook untuk transaksi

#### Subfolder `lib/`
- `dayjs.ts` - Konfigurasi dayjs
- `db.ts` - Konfigurasi database Dexie.js

#### Subfolder `providers/`
- `QueryProvider.tsx` - Provider untuk query

#### Subfolder `routes/`
- `__root.tsx` - Root route
- `$.lazy.tsx` - Lazy route
- `history.lazy.tsx` - Route riwayat
- `index.tsx` - Route index
- `profit.lazy.tsx` - Route laba
- `purchase-report.lazy.tsx` - Route laporan pembelian
- `sales-report.lazy.tsx` - Route laporan penjualan
- `settings.lazy.tsx` - Route pengaturan
- `shopping-note.lazy.tsx` - Route catatan belanja
- `stock.lazy.tsx` - Route stok
- `transaction.lazy.tsx` - Route transaksi

#### Subfolder `store/`
- `transactionStore.ts` - Store Zustand untuk transaksi

#### Subfolder `types/`
- `index.ts` - Type definitions

#### Subfolder `utils/`
- `backupRestore.ts` - Utilitas backup/restore
- `formatters.ts` - Utilitas formatting
- `pricing.ts` - Utilitas pricing
- `productsCsv.ts` - Utilitas CSV produk

#### Subfolder `view/`
- `History.tsx` - View riwayat
- `ProfitManagement.tsx` - View manajemen laba
- `PurchaseReport.tsx` - View laporan pembelian
- `SalesReport.tsx` - View laporan penjualan
- `ShoppingNote.tsx` - View catatan belanja
- `ShoppingNoteHistory.tsx` - View riwayat catatan belanja
- `Transaction.tsx` - View transaksi
- `stock-management/` - Subfolder untuk manajemen stok
  - `StockManagement.tsx` - View manajemen stok
  - `StockProductModal.tsx` - Modal produk stok

### Folder `src-tauri/`
- Folder untuk aplikasi Tauri (Rust)
- `build.rs`, `Cargo.toml`, `tauri.conf.json` - Konfigurasi Tauri
- `capabilities/` - Capabilities Tauri
- `gen/` - Generated files untuk Android
- `icons/` - Icons aplikasi
- `src/` - Source code Rust
- `target/` - Build artifacts Rust

### Folder `supabase/`
- `migrations/` - Migrasi database Supabase
  - `20260225230341_pos_table.sql` - Migrasi tabel POS
  - `20260226143951_add_purchase_selling_price.sql` - Migrasi harga beli/jual
  - `20260228_create_stock_purchases.sql` - Migrasi pembelian stok

## Arsitektur Aplikasi
Aplikasi ini menggunakan arsitektur komponen React dengan routing berbasis file, state management menggunakan Zustand, dan penyimpanan data hybrid (lokal dengan Dexie.js dan cloud dengan Supabase). Aplikasi dikemas sebagai desktop app menggunakan Tauri untuk performa dan integrasi sistem operasi yang lebih baik.