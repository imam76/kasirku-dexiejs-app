# Ringkasan Kondisi Terkini Proyek Kasirku Dexie.js App

## Deskripsi Proyek
Kasirku adalah aplikasi Point of Sale (POS) berbasis React untuk kebutuhan transaksi toko, manajemen stok, satuan produk, laporan, dan pencatatan keuangan. Data utama disimpan lokal menggunakan Dexie.js/IndexedDB sehingga aplikasi dapat berjalan offline-first. Proyek juga disiapkan sebagai aplikasi desktop/mobile melalui Tauri v2, termasuk dukungan build Android dan integrasi printer Bluetooth untuk cetak struk.

## Teknologi Utama
- **Frontend**: React 19, TypeScript, Vite 7
- **UI**: Ant Design, Ant Design Mobile, Tailwind CSS, lucide-react
- **Routing**: TanStack Router dengan route tree generated
- **Server/cache state**: TanStack React Query
- **Client state**: Zustand untuk state transaksi/keranjang
- **Form & validasi**: React Hook Form, Zod, `@hookform/resolvers`
- **Database lokal**: Dexie.js 4 di atas IndexedDB
- **Desktop/mobile runtime**: Tauri v2, Rust, Android generated project
- **Ekspor laporan**: CSV, JSON, XLSX, PDF (`xlsx`, `jspdf`, `jspdf-autotable`)
- **Scanner barcode**: `@zxing/browser`
- **Tanggal/waktu**: dayjs
- **Linting/build**: ESLint 9, TypeScript build, Vite

## Script NPM
- `npm run dev` / `bun run dev` - menjalankan Vite dev server.
- `npm run build` / `bun run build` - menjalankan `tsc -b` lalu `vite build`.
- `npm run lint` / `bun run lint` - menjalankan ESLint.
- `npm run preview` / `bun run preview` - preview hasil build.
- `npm run tauri` / `bun run tauri` - menjalankan CLI Tauri.

Catatan README saat ini masih berisi bawaan template Vite, dengan tambahan contoh build Android:

```bash
bun run tauri android build --apk --split-per-abi
```

## Fitur Aplikasi Saat Ini
### 1. Home dan Navigasi Aplikasi
- Halaman utama dengan layout dashboard POS.
- Navbar atas berisi logo aplikasi, tombol tema, dan shortcut pengaturan.
- Sidebar navigasi desktop/mobile untuk akses cepat ke Transaksi, Stok, Satuan, Belanja Stok, Riwayat, Keuangan, Laporan, Profit, dan Pengaturan.
- Route fallback/not found untuk halaman yang tidak tersedia.

### 2. Transaksi POS
- Menampilkan daftar produk dari database lokal Dexie.
- Pencarian produk berdasarkan nama atau SKU.
- Menambahkan produk ke keranjang.
- Mengubah jumlah item di keranjang.
- Mengubah satuan jual item, sesuai `sellable_units` produk.
- Menghapus item dari keranjang.
- Menghitung total belanja otomatis.
- Mendukung metode pembayaran `TUNAI` dan `NON_TUNAI`.
- Untuk pembayaran tunai, aplikasi menghitung uang bayar dan kembalian.
- Untuk pembayaran non-tunai, nilai bayar mengikuti total transaksi dan kembalian menjadi 0.
- Checkout membuat nomor transaksi otomatis dengan format `TRX-{timestamp}`.
- Checkout menyimpan data ke tabel `transactions` dan `transactionItems`.
- Stok produk berkurang otomatis setelah checkout.
- Jumlah stok yang dikurangi dikonversi lebih dulu ke unit stok/purchase unit.
- Setelah transaksi berhasil, keranjang dan input pembayaran di-reset.
- Setelah checkout, aplikasi mencoba mencetak struk melalui printer Bluetooth bila konfigurasi tersedia.

### 3. Keranjang Belanja
- State keranjang dikelola dengan Zustand di `transactionStore`.
- Keranjang menyimpan produk, kuantitas, dan satuan jual yang dipilih.
- Validasi stok dilakukan sebelum produk ditambah atau kuantitas diubah.
- Item dengan stok kosong tidak bisa ditambahkan.
- Jika kuantitas melebihi stok setelah konversi satuan, aplikasi menampilkan error.
- Tersedia komponen keranjang untuk desktop dan mobile drawer.

### 4. Manajemen Produk dan Stok
- Tambah produk baru.
- Edit data produk.
- Hapus produk.
- Menyimpan nama produk, kategori, SKU, harga beli, harga jual, stok, satuan beli, dan satuan jual.
- Mendukung `purchase_unit` untuk satuan pembelian/stok.
- Mendukung `selling_unit` untuk satuan default penjualan.
- Mendukung `sellable_units` agar produk bisa dijual dalam beberapa satuan.
- Mendukung harga grosir melalui `wholesale_prices`.
- Harga grosir dapat bertipe harga per unit atau harga paket/bundle.
- Menambahkan stok awal saat membuat produk.
- Menambahkan stok tambahan saat edit produk.
- Setiap penambahan stok dapat dicatat sebagai `stockPurchases`.
- Pembelian stok otomatis masuk ke modul keuangan sebagai pengeluaran kategori `PEMBELIAN_STOK`.
- Import produk dari CSV.
- Import CSV dapat membuat produk baru atau memperbarui produk yang sudah ada berdasarkan SKU atau ID.

### 5. Multi Unit dan Konversi Satuan
- Halaman khusus `Satuan & Konversi`.
- Menyimpan daftar konversi satuan di tabel `unitConversions`.
- Konversi bawaan otomatis diisi saat database pertama kali dibuat.
- Konversi bawaan meliputi kg, gram, ons, lusin, kodi, gros, dus, ikat, jam, menit, dan detik.
- Pengguna dapat menambah konversi custom.
- Pengguna dapat mengedit rasio konversi.
- Pengguna dapat menghapus konversi custom.
- Konversi bawaan diberi tanda preset dan tidak dihapus lewat aksi normal.
- Tersedia aksi pulihkan satuan bawaan.
- Registry konversi dimuat secara global dari root layout agar logika harga/stok memakai data terbaru.

### 6. Harga, Grosir, dan Perhitungan Satuan
- `pricing.ts` menyediakan logika konversi satuan, normalisasi harga, dan penghitungan harga jual.
- Harga beli dan harga jual dapat dinormalisasi antar satuan.
- Contoh: harga per kg dapat dihitung menjadi harga per gram atau ons.
- Harga jual transaksi mengikuti satuan yang dipilih di keranjang.
- Harga grosir dipilih berdasarkan minimal kuantitas.
- Untuk harga grosir tipe bundle, harga per satuan dihitung dari harga paket dibagi minimal kuantitas.
- Jika konversi satuan tidak ditemukan, fallback ratio bernilai 1.

### 7. Riwayat Transaksi
- Menyimpan riwayat transaksi POS.
- Menyimpan detail item untuk setiap transaksi.
- Item transaksi menyimpan snapshot data penting seperti nama produk, harga, quantity, unit, subtotal, dan profit.
- Transaksi menyimpan total, jumlah bayar, kembalian, metode bayar, waktu transaksi, dan status struk.
- Query riwayat di-invalidate setelah checkout dan setelah proses cetak struk.

### 8. Catatan Belanja Stok
- Membuat catatan belanja stok.
- Menyimpan item belanja, harga, quantity, subtotal, dan total cost.
- Menyimpan uang yang dibawa.
- Menghitung total belanja.
- Menghitung sisa uang.
- Menyediakan riwayat catatan belanja.
- Data disimpan di tabel `shoppingNotes`.

### 9. Keuangan
- Halaman manajemen keuangan untuk memantau arus kas toko.
- Menampilkan saldo berjalan dari `financeBalance`.
- Menampilkan daftar transaksi keuangan dari `financeTransactions`.
- Mendukung input saldo awal dengan tipe `OPENING_BALANCE`.
- Mendukung pencatatan pemasukan manual dengan tipe `INCOME`.
- Mendukung pencatatan pengeluaran manual dengan tipe `EXPENSE`.
- Pemasukan dari checkout POS otomatis dicatat sebagai kategori `PENJUALAN`.
- Pembelian stok otomatis dicatat sebagai kategori `PEMBELIAN_STOK`.
- Ada aksi hitung ulang untuk membangun ulang transaksi keuangan otomatis dari transaksi POS dan pembelian stok.
- Transaksi keuangan otomatis memakai `reference_id` untuk menghubungkan ke transaksi atau pembelian stok sumbernya.
- Pengeluaran/pemasukan operasional manual dapat ikut mempengaruhi saldo profit sesuai kategori dan tipe.

### 10. Profit dan Keuntungan
- Menyimpan saldo keuntungan di `profitBalance`.
- Menyimpan log perubahan profit di `profitLogs`.
- Profit penjualan otomatis dihitung saat checkout.
- Profit item dihitung dari selisih harga jual dan harga beli yang sudah dinormalisasi ke satuan transaksi.
- Total profit transaksi ditambahkan ke saldo profit.
- Aktivitas operasional tertentu dari modul keuangan dapat menambah atau mengurangi profit.
- Mendukung kategori profit seperti `SALES`, `WITHDRAW`, dan `OPERATIONAL`.

### 11. Laporan
- Laporan penjualan.
- Laporan pembelian stok.
- Laporan pengeluaran.
- Laporan keuntungan/profit.
- Laporan penjualan memiliki komponen tabel desktop dan daftar mobile.
- Laporan pengeluaran memiliki komponen tabel desktop dan daftar mobile.
- Ada komponen top products untuk melihat produk terlaris pada laporan penjualan.
- Laporan mengambil data dari Dexie melalui hook report dan query terkait.

### 12. Ekspor Data
- Ekspor data ke CSV.
- Ekspor data ke JSON.
- Ekspor data ke XLSX.
- Ekspor data ke PDF.
- Utilitas ekspor terpusat di `src/utils/export/`.
- Ada `fileSaver` dan deteksi platform untuk mendukung penyimpanan di web maupun runtime Tauri.
- Komponen `ExportActions` dipakai untuk tombol/aksi ekspor di UI laporan.

### 13. Backup dan Restore
- Tersedia utilitas `backupRestore.ts`.
- Modul ini disiapkan untuk backup dan restore data lokal aplikasi.
- Fitur ini penting karena data utama aplikasi berada di IndexedDB/Dexie.

### 14. Scanner Barcode
- Scanner menggunakan library `@zxing/browser`.
- Tersedia `ScannerModal` sebagai UI scanner.
- Tersedia `useScanner` untuk logika scanner.
- Produk dapat dicari/diproses berdasarkan SKU/barcode sesuai implementasi scanner dan pencarian produk.

### 15. Printer Bluetooth dan Struk
- Tersedia pengaturan printer melalui `PrinterSettingsCard`.
- Tipe data printer menyimpan nama, address, dan status paired.
- Service struk berada di `src/utils/printer/receiptService.ts`.
- Bridge printer Bluetooth berada di `src/utils/printer/bluetoothPrinter.ts`.
- Tauri/Rust menyediakan modul native `src-tauri/src/bluetooth_printer.rs`.
- Android generated project memiliki `BluetoothPrinterPlugin.kt`.
- Transaksi menyimpan `receipt_status`, `receipt_printed_at`, dan `receipt_print_error`.
- Status cetak mendukung `pending`, `printed`, dan `print_failed`.

### 16. Pengaturan Aplikasi
- Route pengaturan tersedia di `/settings`.
- Pengaturan terhubung dengan fitur printer dan preferensi aplikasi.
- Tombol pengaturan tersedia di navbar atas.

### 17. Tema Light/Dark
- Dukungan tema terang dan gelap.
- State tema dikelola melalui `ThemeProvider` dan `useTheme`.
- Toggle tema tersedia di navbar.
- Tema juga diterapkan ke komponen Ant Design seperti sidebar/menu.

### 18. Feedback Pengguna
- Modal feedback muncul berdasarkan trigger sesi/navigasi.
- Mendukung wave feedback 1 dan 2.
- Jawaban feedback disimpan di localStorage.
- Feedback dikirim ke endpoint Telegram melalui `fetch`.
- Setelah checkout, aplikasi memicu pengecekan feedback ulang.

### 19. Build Desktop, Mobile, dan Web
- Aplikasi dapat dijalankan sebagai web app melalui Vite.
- Aplikasi dapat dikemas dengan Tauri v2.
- Project Android generated tersedia di `src-tauri/gen/android`.
- README mencatat perintah build APK split per ABI.
- Ada `vercel.json`, sehingga project juga disiapkan untuk jalur deploy web.

## Struktur Folder Utama

### Root Level
- `package.json` - metadata proyek, dependency, dan script.
- `bun.lock` - lockfile Bun.
- `vite.config.ts`, `vite.config.js`, `vite.config.d.ts` - konfigurasi Vite dan TanStack Router plugin.
- `tsconfig.json`, `tsconfig.node.json` - konfigurasi TypeScript.
- `eslint.config.js` - konfigurasi ESLint.
- `tailwind.config.js`, `postcss.config.js` - konfigurasi styling.
- `index.html` - entry HTML Vite.
- `vercel.json` - konfigurasi deploy Vercel.
- `README.md` - dokumentasi awal, masih dominan template React + Vite.
- `summarize.md` - ringkasan proyek ini.
- `planing.md`, `finance_module_plan_pos.svg` - dokumen/perencanaan tambahan.

### Folder `PRD/`
- `Fitur Multi Unit — Aplikasi POS.md` - dokumen kebutuhan fitur multi-unit.

### Folder `public/`
- Aset publik Vite/Tauri seperti `vite.svg` dan `tauri.svg`.

### Folder `src/`
- `main.tsx` - entry point React.
- `App.tsx`, `App.css`, `index.css` - bootstrap dan style global aplikasi.
- `ThemeProvider.tsx`, `theme.ts` - konfigurasi tema.
- `routeTree.gen.ts` - file generated TanStack Router.
- `vite-env.d.ts` - type definition Vite.

### Folder `src/components/`
Komponen UI reusable:
- Komponen transaksi: `ProductList.tsx`, `CartItem.tsx`, `CartSidebar.tsx`, `CartSummary.tsx`, `MobileCartDrawer.tsx`, `ScannerModal.tsx`.
- Komponen stok/laporan/settings: `StockTable.tsx`, `ExportActions.tsx`, `PrinterSettingsCard.tsx`.
- Komponen umum: `Loading.tsx`, `NotFound.tsx`, `FeedbackModal.tsx`.

### Folder `src/hooks/`
Hook aplikasi:
- `useTransaction.tsx` - alur checkout POS, update stok, profit, finance bridge, dan cetak struk.
- `useStockManagement.tsx` - CRUD/import produk dan pencatatan pembelian stok.
- `useFinance.tsx` - saldo, transaksi keuangan manual, dan hitung ulang finance.
- `useProfit.tsx` - saldo/log keuntungan.
- `useReports.tsx` - data laporan.
- `useHistory.tsx` - riwayat transaksi.
- `useShoppingNote.tsx` - catatan belanja stok.
- `useScanner.ts` - scanner barcode.
- `useBluetoothPrinter.ts` - integrasi printer Bluetooth.
- `useTheme.tsx`, `index.ts` - tema dan export hook.

### Folder `src/lib/`
- `db.ts` - definisi Dexie database `KasirkuDB`.
- `dayjs.ts` - konfigurasi dayjs.
- `validations/stock.ts`, `validations/shopping.ts` - schema validasi Zod.

### Folder `src/store/`
- `transactionStore.ts` - store Zustand untuk produk, keranjang, pencarian, nominal bayar, metode bayar, dan state modal pembayaran.

### Folder `src/routes/`
Routing berbasis TanStack Router:
- `__root.tsx` - layout utama, navbar, sidebar, menu, theme toggle, feedback modal, dan registrasi konversi satuan global.
- `index.tsx` - halaman home.
- `transaction.lazy.tsx`, `stock.lazy.tsx`, `units.lazy.tsx`, `shopping-note.lazy.tsx`, `history.lazy.tsx`, `finance.lazy.tsx`, `profit.lazy.tsx`, `settings.lazy.tsx` - route fitur utama.
- `report/index.tsx` - route group laporan.
- `report/sales-report.lazy.tsx`, `report/purchase-report.lazy.tsx`, `report/expense-report.lazy.tsx` - route laporan.
- `$.lazy.tsx` - fallback/lazy route.

### Folder `src/view/`
Halaman fitur:
- `Transaction.tsx` - layar POS.
- `FinanceManagement.tsx` - manajemen kas/pemasukan/pengeluaran.
- `ProfitManagement.tsx` - manajemen profit.
- `History.tsx` - riwayat transaksi.
- `ShoppingNote.tsx`, `ShoppingNoteHistory.tsx` - catatan dan riwayat belanja.
- `UnitManagement.tsx` - satuan dan konversi.
- `SalesReport.tsx`, `PurchaseReport.tsx`, `ExpenseReport.tsx` - laporan.
- `stock-management/` dan `stock-manager/` - implementasi halaman/modal manajemen stok. Saat ini keduanya ada di repo dan perlu dijaga agar tidak tertukar saat refactor.
- `sales-report/` - komponen tabel/list laporan penjualan.
- `expense-report/` - komponen tabel/list laporan pengeluaran.

### Folder `src/utils/`
- `pricing.ts` - konversi satuan, normalisasi harga, dan logika harga grosir.
- `salesUnits.ts` - snapshot satuan pada item transaksi.
- `formatters.ts` - formatter mata uang/tanggal.
- `productsCsv.ts` - utilitas import/export produk CSV.
- `backupRestore.ts` - backup dan restore data.
- `feedback.ts` - trigger/penanda feedback.
- `export/` - ekspor CSV, JSON, XLSX, PDF, file saver, dan deteksi platform.
- `printer/` - service printer Bluetooth dan format struk.

### Folder `src/constants/`
- `units.ts` - satuan bawaan dan alias satuan berat.
- `categories.ts` - kategori produk.
- `feedback.ts` - pertanyaan feedback.

### Folder `src/providers/`
- `QueryProvider.tsx` - provider TanStack React Query.

### Folder `src/types/`
- `index.ts` - tipe domain utama: produk, transaksi, item transaksi, pembelian stok, profit, finance, unit conversion, receipt, printer, dan shopping note.

### Folder `src/assets/`
- `beep.mp3` - suara scanner/feedback.
- `react.svg` - aset bawaan template.

### Folder `src-tauri/`
Konfigurasi dan source Tauri:
- `Cargo.toml`, `build.rs`, `tauri.conf.json` - konfigurasi Rust/Tauri.
- `src/main.rs`, `src/lib.rs`, `src/bluetooth_printer.rs` - entry dan command/plugin printer Bluetooth.
- `capabilities/default.json` - permission/capability Tauri.
- `icons/` - ikon aplikasi berbagai ukuran.
- `gen/android/` - project Android generated dari Tauri, termasuk `MainActivity.kt`, `BluetoothPrinterPlugin.kt`, Gradle config, manifest, dan resource Android.

### Folder `supabase/`
- `migrations/` - migrasi SQL lama untuk tabel POS, harga beli/jual, dan pembelian stok.

Catatan: kode aplikasi aktif saat ini lebih dominan memakai Dexie/IndexedDB lokal. Folder Supabase masih ada sebagai artefak migrasi, tetapi tidak terlihat sebagai jalur utama runtime pada kode frontend yang diperiksa.

## Skema Data Lokal Dexie
Database bernama `KasirkuDB` dengan versi sampai **version 9**:
- `products` - produk, SKU, kategori, unit beli/jual, harga, stok, harga grosir, unit yang bisa dijual.
- `transactions` - transaksi POS, nomor transaksi, total, pembayaran, kembalian, metode pembayaran, status struk.
- `transactionItems` - item transaksi, produk, jumlah, satuan, snapshot konversi, subtotal, profit.
- `stockPurchases` - riwayat pembelian/penambahan stok.
- `profitLogs` dan `profitBalance` - log serta saldo keuntungan.
- `shoppingNotes` - catatan belanja stok.
- `financeTransactions` dan `financeBalance` - arus kas dan saldo keuangan.
- `unitConversions` - konversi satuan bawaan/custom.

Saat database pertama kali dibuat, `unitConversions` diisi dari `DEFAULT_CONVERSIONS`.

## Arsitektur Aplikasi
Aplikasi menggunakan arsitektur React modular:
- Route dan layout utama dikelola TanStack Router di `src/routes`.
- Data async IndexedDB dikelola lewat TanStack Query.
- Operasi database ditulis langsung ke Dexie melalui hook fitur.
- State keranjang transaksi yang sangat interaktif dipisahkan ke Zustand.
- Logika domain seperti pricing, satuan, ekspor, printer, dan backup dipisah ke `src/utils`.
- Tauri menyediakan packaging desktop/mobile dan bridge native untuk fitur seperti printer Bluetooth.

Alur transaksi utama:
1. Produk dimuat dari Dexie dan dipilih ke keranjang.
2. Harga dihitung dari `getPrice`, termasuk konversi satuan dan harga grosir.
3. Checkout membuat `transactions` dan `transactionItems`.
4. Stok produk dikurangi dengan konversi ke unit stok.
5. Profit dan finance otomatis diperbarui.
6. Struk disiapkan dan dikirim ke printer Bluetooth bila konfigurasi tersedia.

## Catatan Kondisi Repo
- Ada dua folder stok yang mirip: `src/view/stock-management/` dan `src/view/stock-manager/`. Perlu dicek route/import aktif sebelum menghapus salah satunya.
- README belum menggambarkan aplikasi POS sebenarnya dan masih banyak berisi teks template Vite.
- Supabase migration masih tersimpan, tetapi integrasi runtime Supabase tidak tampak pada dependency maupun import utama saat ini.
- Ada konfigurasi web deploy (`vercel.json`) sekaligus Tauri desktop/mobile; proyek dapat diarahkan ke web app, desktop app, atau Android tergantung kebutuhan build.
