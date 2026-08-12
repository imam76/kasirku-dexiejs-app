# Issue: Standar CRUD List Khusus Mobile

Tanggal catatan: 2026-08-12

Status: implementasi pertama selesai pada Master Data Produk

## Ringkasan

Frayukti memiliki banyak flow CRUD master data dengan pola yang sama: cari,
filter, lihat daftar, tambah, edit, aksi tambahan, dan hapus. Sebelumnya pola
mobile belum memiliki primitive khusus. Master Produk tetap merender tabel
desktop selebar `1300px`, sehingga pengguna perlu menggeser horizontal dan aksi
utama sulit dipindai dengan satu tangan.

Issue ini membuat kerangka CRUD list yang:

- khusus mengoptimalkan layar ponsel tanpa merusak tabel desktop;
- dinamis melalui render function dan konfigurasi action berbasis domain;
- deterministik/idempoten saat filter berubah, drawer ditutup, atau tombol save
  tersentuh berulang;
- memusatkan loading, empty state, progressive disclosure, touch target, dan
  action sheet agar master data berikutnya tidak menyalin flow sendiri-sendiri;
- menentukan batas penggunaan list, drawer, modal, full-screen editor, dan
  gesture secara eksplisit.

## Masalah Sebelum Implementasi

| Masalah | Dampak di ponsel |
| --- | --- |
| `StockTable` selalu memakai tabel dengan `scrollX={1300}` | Informasi dan aksi tersebar di luar viewport |
| Tombol aksi berupa deretan icon kecil | Sulit disentuh dan arti aksi bergantung tooltip/hover |
| Form produk memakai modal yang dimanipulasi menjadi lebar `100%` | Secara visual penuh layar, tetapi lifecycle dan footer belum mengikuti pola editor mobile |
| Pagination tabel desktop dipakai di semua viewport | Kontrol rapat dan menambah beban navigasi |
| Implementasi drawer tersebar per halaman | Reset state, safe area, hierarchy action, dan ukuran target sentuh mudah berbeda |

## Riset UI/UX

Riset visual dilakukan pada:

- [Pinterest — Inventory Management App Design](https://www.pinterest.com/ideas/inventory-management-app-design/943780689972/)
- [Pinterest — Inventory Management App UI Design](https://www.pinterest.com/ideas/inventory-management-app-ui-design/917596908959/)
- [Dribbble — Inventory UI Mobile](https://dribbble.com/search/inventory-ui-mobile)
- [Dribbble — Add New Inventory Flow](https://dribbble.com/shots/21767457-Add-New-Inventory-Flow)

Pinterest dan Dribbble dipakai sebagai sumber eksplorasi visual, bukan sebagai
otoritas usability dan tidak ada asset/layout yang disalin. Pola yang berulang
pada contoh relevan adalah search di atas daftar, filter ringkas, card berisi
identitas dan metrik utama, status chip, serta satu tombol create yang jelas.

Keputusan interaksi divalidasi dengan pedoman platform:

- [Apple — Lists and Tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables): list cocok untuk data yang mendukung select, add, dan delete.
- [Apple — UI Design Dos and Don'ts](https://developer.apple.com/design/tips/): konten utama harus muat di layar tanpa zoom atau scroll horizontal.
- [Apple — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): target kontrol iOS default `44 × 44 pt`, beri jarak cukup, dan selalu sediakan alternatif untuk gesture.
- [Apple — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): aksi paling mungkin harus memiliki hierarchy visual paling kuat dan hit region minimal `44 × 44 pt`.
- [Material Design 3 — Bottom Sheets](https://m3.material.io/components/bottom-sheets): bottom sheet menampilkan konten sekunder yang tetap terkait konteks layar.
- [Material Design 3 — Floating Action Buttons](https://m3.material.io/components/floating-action-button/guidelines): FAB/extended FAB dipakai hanya untuk aksi utama layar seperti create.
- [Apple — Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars): search dan action ditempatkan dekat konten yang dipengaruhi.

### Sintesis untuk Frayukti

Kesimpulan berikut adalah inferensi dari gabungan sumber di atas dan karakter
Frayukti sebagai aplikasi operasional, bukan kutipan langsung satu sumber:

1. Produk harus menjadi vertical card list pada ponsel, bukan tabel yang
   diperkecil atau dipaksa horizontal.
2. Card menampilkan informasi yang dibutuhkan untuk mengenali dan mengambil
   keputusan cepat: nama, SKU, kategori/tipe, harga jual, stok, dan status.
3. Search selalu terlihat. Filter yang paling sering dipakai boleh menjadi chip
   horizontal; filter lengkap masuk bottom drawer.
4. Tap badan card menjalankan aksi paling natural, yaitu edit/lihat detail.
5. Aksi sekunder masuk bottom action drawer dengan label dan deskripsi; tidak
   bergantung pada icon atau tooltip.
6. Delete memerlukan confirmation modal terpisah setelah action drawer ditutup.
7. Form create/edit panjang memakai full-screen drawer agar keyboard, tab, safe
   area, dan footer save tetap nyaman. Desktop tetap memakai modal.
8. Daftar panjang memakai progressive disclosure “Muat lagi”, bukan pagination
   angka yang padat. Ini tetap deterministik dan tidak mengubah urutan sumber.

## Flow CRUD Standar

```text
CRUD List
├── Search langsung memfilter daftar
├── Quick filter chip langsung memfilter daftar
├── Filter lengkap → bottom filter drawer
│   ├── Reset → kembalikan default
│   └── Terapkan → tutup drawer (hasil sudah live-preview)
├── Tambah → FAB mengambang (mobile) / tombol header (desktop) → full-screen
│   form drawer (mobile) / modal (desktop)
├── Tap card → detail sheet ringkasan → aksi stok terkait atau "Edit Produk"
├── Tombol tiga titik → bottom action drawer
│   ├── Edit → editor
│   ├── Domain action → handler domain
│   └── Hapus → confirmation modal → mutation
├── Import/export → bottom utility drawer di mobile
└── Daftar panjang → Muat lagi
```

Setelah mutation sukses, sumber data Dexie/React Query tetap menjadi source of
truth. Primitive list tidak menyimpan salinan item domain sehingga tidak ada
dua state daftar yang dapat berbeda.

## Matriks Pemilihan Container Mobile

| Kebutuhan | Container | Alasan dan aturan |
| --- | --- | --- |
| Daftar record | Vertical card list | Tidak boleh membutuhkan scroll horizontal; satu card satu record |
| Create/edit form panjang | Full-screen right drawer | Fokus pada satu task, ruang cukup untuk keyboard/tab, footer action tetap tersedia |
| Create/edit desktop | Modal | Menjaga konteks halaman dan memanfaatkan viewport lebar |
| Filter lengkap | Bottom drawer | Bersifat sementara dan terkait daftar; perubahan memakai live-preview |
| Aksi satu record | Bottom action drawer | Mudah dijangkau ibu jari; seluruh aksi punya label, deskripsi, dan target besar |
| Import/export/template | Bottom utility drawer | Kumpulan aksi sekunder tingkat halaman, bukan aksi record |
| Konfirmasi delete/logout | Modal konfirmasi | Keputusan singkat, blocking, dan berisiko; tombol bahaya harus eksplisit |
| Kamera barcode | Full-screen overlay/scanner | Membutuhkan perhatian dan ruang kamera; selalu ada tombol close yang terlihat |
| Navigasi global | Left drawer + bottom navigation | Berbeda scope dari CRUD dan sudah ditangani root layout |
| Pilihan pendek dalam field | Select/popover bawaan | Tidak perlu drawer baru jika opsi sedikit dan komponen sudah touch-friendly |
| Informasi pasif singkat | Tooltip hanya desktop; inline text mobile | Hover tidak tersedia di touch screen |

### Aturan modal

- Modal mobile hanya untuk keputusan pendek seperti konfirmasi delete, bukan
  form panjang.
- Destructive confirmation harus menyebut objek/konsekuensinya bila data domain
  tersedia, memakai tombol danger, dan tidak dijalankan otomatis dari swipe.
- Modal ditutup setelah success; kegagalan mutation mempertahankan konteks atau
  menampilkan error yang bisa ditindaklanjuti.

### Aturan drawer

- Bottom drawer untuk aksi/filter yang bersifat sementara dan masih terkait
  layar asal.
- Full-screen drawer untuk create/edit yang menjadi task tersendiri.
- State pilihan record dibersihkan saat drawer ditutup atau record hilang dari
  hasil filter.
- Drawer wajib menghormati safe-area bawah dan action penting minimal setinggi
  sekitar `44px`.
- Tombol Back/close membatalkan editor melalui handler domain yang sama; form
  tidak memiliki implementasi reset kedua di primitive.

### Aturan gesture

- Tap adalah interaksi utama.
- Swipe boleh ditambahkan kemudian sebagai shortcut reveal action, tetapi tidak
  pernah menjadi satu-satunya akses ke edit/delete.
- Long press tidak dipakai untuk fungsi penting karena discoverability rendah.
- Press/active state harus terlihat; card dan button memakai feedback visual.

## Arsitektur Komponen

### `MobileCrudList<T>`

Lokasi: [`src/components/mobile-crud/MobileCrudList.tsx`](../src/components/mobile-crud/MobileCrudList.tsx)

Primitive tidak mengetahui `Product`, permission, Dexie, router, atau i18n key.
Domain memasok:

```ts
type MobileCrudAction<T> = {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onSelect: (item: T) => void | Promise<void>;
};
```

Kontrak utama:

- `items` dan `getKey`: daftar source-of-truth serta stable identity;
- `renderItem`: komposisi card milik domain;
- `getActions`: action configuration per record, termasuk permission/status;
- `onItemClick`: primary action card;
- `loading`, `emptyText`, `emptyAction`: lifecycle state standar;
- `initialVisibleCount`, `visibleStep`: progressive disclosure;
- `resetKey`: reset window dan action selection ketika query/filter berubah;
- label ARIA disuplai domain agar mengandung nama record.

### `ResponsiveCrudEditor`

Lokasi: [`src/components/mobile-crud/ResponsiveCrudEditor.tsx`](../src/components/mobile-crud/ResponsiveCrudEditor.tsx)

- mode mobile mengikuti `useIsMobile`: viewport di bawah `1280px`, coarse
  pointer, mobile user-agent/`userAgentData`, atau iPad desktop mode;
- mobile: `Drawer` kanan selebar `100%`;
- tablet/desktop: `Modal` dengan `desktopWidth` yang dapat dikonfigurasi;
- body form hanya satu instance sehingga validasi, scanner, field-array, dan
  submit tidak bercabang menurut device;
- footer disuplai domain dan tetap berada di area action container.

### Boundary yang sengaja dipertahankan

Primitive UI tidak menjalankan mutation. Create/update/delete, permission,
activity log, sync queue, navigation, dan confirmation copy tetap milik hook
atau page domain. Ini mencegah generic component menjadi service locator yang
sulit diuji dan dirawat.

## Idempotensi dan Ketahanan State

“Idempoten” pada flow UI ini diterapkan sebagai berikut:

1. `getKey` menjadi identitas tunggal card/action selection.
2. `resetKey` mengembalikan progressive window ke nilai awal setiap query atau
   filter berubah; render berulang menghasilkan window yang sama.
3. Visible count selalu di-clamp ke jumlah item. Menekan “Muat lagi” setelah
   semua data terlihat tidak menambah state tanpa batas.
4. Action drawer ditutup sebelum handler dijalankan dan selected item dibuang.
5. Jika selected record hilang dari `items`, action drawer otomatis ditutup.
6. Tombol save editor memakai in-flight guard dan loading state. Double tap
   selama promise berjalan hanya menjalankan satu `onSave`.
7. Form create dan update tetap melalui service yang sudah ada; primitive tidak
   membuat jalur penyimpanan kedua.
8. Delete tetap melewati confirmation dan mutation domain; tidak ada delete
   optimistik lokal di card list.

Catatan: idempotensi UI mencegah double-trigger dalam satu instance. Jaminan
idempotensi lintas device/network tetap menjadi tanggung jawab persistence dan
sync service domain.

## Implementasi Pertama: Master Data Produk

### Mobile list

[`src/components/StockTable.tsx`](../src/components/StockTable.tsx) sekarang
memilih presentasi berdasarkan viewport:

- mode mobile dari `useIsMobile`: `MobileCrudList<Product>`;
- desktop di luar mode mobile: `ManagementTable<Product>` lama tetap dipakai.

Card produk menampilkan:

- nama dan SKU;
- indikator tidak tampil di POS;
- kategori, tipe produk, dan badge perlu verifikasi;
- harga jual per satuan;
- jumlah stok dengan status visual yang sudah dimiliki Frayukti.

Tap pada badan card membuka **detail sheet** (bottom drawer tanpa header
bawaan, hanya drag handle + ringkasan icon/nama/SKU/harga/stok) berisi dua
aksi: "Kelola Saldo Awal Persediaan" dan "Edit Produk". Ini diselaraskan
dengan referensi desain Claude Design "Manajemen Stok" yang diimpor
2026-08-12: tap card tidak lagi langsung membuka form edit, tetapi berhenti
dulu di ringkasan agar pengguna bisa memastikan record yang benar sebelum
memilih aksi. Tombol tiga titik pada card tetap membuka action drawer di
bawah ini untuk aksi lengkap (termasuk hapus).

Tombol Tambah pada mobile berupa FAB bulat mengambang di kanan-bawah
(`data-tour="stock-add-product"` dipindah ke elemen ini), mengikuti layout
desain yang sama; desktop tetap memakai tombol di header.

Action drawer produk menyediakan:

1. Edit;
2. Tandai terverifikasi jika status membutuhkan;
3. Kelola Saldo Awal Persediaan;
4. Hapus produk, lalu confirmation modal dari `useStockManagement`.

Empty state master produk menyediakan CTA “Tambah Produk”. Empty state hasil
filter tidak menawarkan create karena aksi pemulihan yang tepat adalah reset
search/filter.

### Filter

- Search tetap terlihat dan memakai control besar pada ponsel.
- Status stok menjadi quick-filter chip horizontal.
- Parameter lengkap tetap berada di bottom drawer.
- Angka badge filter menghitung kelompok filter aktif, bukan jumlah field.
- Reset mengembalikan search dan seluruh parameter.

### Create/edit

[`StockProductModal.tsx`](../src/view/master-data/products/StockProductModal.tsx)
tetap menjadi satu form domain, tetapi container-nya dipindahkan ke
`ResponsiveCrudEditor`:

- mobile: full-screen drawer;
- desktop: modal `760px`;
- tab Produk, Multi Unit, Harga Grosir, camera scanner, hardware scanner, dan
  validasi tetap memakai logic lama;
- footer Cancel/Save konsisten dan Save dilindungi dari double tap.

### Aksi tingkat halaman

Implementasi yang sudah ada di
[`StockManagement.tsx`](../src/view/master-data/products/StockManagement.tsx)
dipertahankan karena sudah sesuai matriks:

- Tambah adalah primary button yang terlihat;
- Import/export/template mobile berada di bottom utility drawer;
- pilihan format Excel/CSV memakai segmented control;
- desktop tetap memakai dropdown karena mouse/viewport mendukung submenu.

## Berkas Implementasi

| Berkas | Perubahan |
| --- | --- |
| `src/components/mobile-crud/MobileCrudList.tsx` | Primitive card list, progressive disclosure, empty/loading, action drawer |
| `src/components/mobile-crud/ResponsiveCrudEditor.tsx` | Full-screen drawer mobile dan modal desktop |
| `src/utils/mobileCrud.ts` | Perhitungan window dan remaining count yang deterministik |
| `src/components/StockTable.tsx` | Adapter dan card/action config untuk produk |
| `src/view/master-data/products/StockProductModal.tsx` | Adopsi responsive editor dan double-submit guard |
| `src/view/master-data/products/StockManagement.tsx` | Menghubungkan CTA create ke empty state |
| `src/i18n/stockMessages.ts` | Copy mobile bahasa Indonesia dan Inggris |
| `tests/unit/mobile-crud.test.ts` | Test clamp progressive disclosure |
| `tests/e2e/mobile-product-crud.spec.ts` | Verifikasi card/drawer/modal/responsive flow pada browser |

## Checklist Adopsi untuk Master Data Berikutnya

- [ ] Tentukan field identitas primer dan maksimal 2–3 metadata utama card.
- [ ] Tentukan primary tap action: detail atau edit, jangan keduanya ambigu.
- [ ] Susun action config berdasarkan permission dan status record.
- [ ] Pisahkan action destruktif dan teruskan ke confirmation modal domain.
- [ ] Search selalu terlihat; hanya quick filter yang benar-benar sering dipakai dijadikan chip.
- [ ] Filter lengkap memakai bottom drawer dan memiliki Reset/Terapkan.
- [ ] Form panjang memakai `ResponsiveCrudEditor`; jangan membuat form mobile kedua.
- [ ] Sediakan loading, empty dataset, empty filtered result, dan error recovery.
- [ ] Gunakan stable `getKey`, `resetKey`, dan cegah double-submit.
- [ ] Label icon button dengan ARIA yang menyertakan nama record.
- [ ] Uji lebar 320px, 375px, 430px, tablet, desktop, dark mode, dan keyboard terbuka.
- [ ] Pastikan bottom navigation/safe area tidak menutup card atau footer drawer.

## Acceptance Criteria

- [x] Ponsel tidak merender tabel produk horizontal.
- [x] Search dan quick filter dapat dipakai tanpa membuka drawer.
- [x] Filter lengkap memakai bottom drawer.
- [x] Aksi record memakai bottom action drawer dengan label teks.
- [x] Delete tetap melalui confirmation modal.
- [x] Create/edit memakai full-screen drawer di ponsel dan modal di desktop.
- [x] Import/export memakai utility drawer mobile yang sudah ada.
- [x] Empty state awal menyediakan CTA create.
- [x] Progressive disclosure tidak melewati total item.
- [x] Save tidak dapat dieksekusi dua kali selama request yang sama berjalan.
- [x] Primitive generic tidak bergantung pada tipe atau service Produk.
- [ ] Validasi manual pada perangkat fisik Android/iOS dan Tauri mobile.

## Test Plan

### Otomatis

`tests/unit/mobile-crud.test.ts` memverifikasi:

1. window bertambah sesuai step;
2. window terakhir berhenti tepat di total;
3. remaining count tidak negatif;
4. input defensif tetap menghasilkan nilai deterministik.

Build TypeScript memastikan adapter `Product`, action handler, i18n key, dan
responsive editor tetap sesuai kontrak.

`tests/e2e/mobile-product-crud.spec.ts` memverifikasi card list, batas 20 item,
Muat Lagi, action drawer, confirmation modal, full-screen editor, filter drawer,
double-tap Save hanya membuat satu record, tidak adanya horizontal overflow pada
empat lebar ponsel, dan tabel desktop.

### Manual

1. Buka Master Produk pada viewport `320 × 568`; pastikan tidak ada horizontal scroll.
2. Cari nama/SKU, ubah quick filter, buka filter lengkap, reset, lalu terapkan.
3. Tap card; pastikan form edit berupa full-screen drawer.
4. Tap Tambah; isi tiga tab, buka scanner, simpan, dan pastikan list bereaksi.
5. Double tap Save cepat; pastikan hanya satu produk/mutation dibuat.
6. Buka action drawer; uji verify, saldo awal, cancel delete, dan confirm delete.
7. Uji import/export/template dari utility drawer.
8. Ulangi pada dark mode, keyboard virtual terbuka, dan safe-area device.
9. Uji desktop; pastikan tabel, sorting, dropdown, dan modal tetap sama.

## Non-Tujuan

- Tidak mengubah schema `Product`, service create/update/delete, permission,
  activity log, atau sync queue.
- Tidak menambahkan swipe-to-delete karena tombol action yang terlihat tetap
  lebih aman dan aksesibel untuk fase standar pertama.
- Tidak memigrasikan seluruh master data sekaligus. Produk menjadi reference
  implementation; modul lain diadopsi bertahap memakai checklist yang sama.
- Tidak menyalin visual Pinterest/Dribbble atau menambah asset gambar baru.
