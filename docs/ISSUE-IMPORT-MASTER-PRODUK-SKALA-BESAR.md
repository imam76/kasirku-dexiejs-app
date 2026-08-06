# Issue: Import Master Produk Skala Besar

Dokumen terkait:

- [Satu Pintu Stok Masuk](ISSUE-SATU-PINTU-STOK-MASUK.md) — memakai format file yang sama

Tanggal catatan: 2026-08-06

## Ringkasan

Import master produk sudah ada di [`src/utils/productsCsv.ts`](../src/utils/productsCsv.ts)
dan [`src/hooks/useStockManagement.tsx`](../src/hooks/useStockManagement.tsx),
tetapi belum layak dipakai pada skala 1000 produk dengan multi satuan dan multi
harga. Akibatnya user tetap jatuh ke input form satu per satu.

Tiga penghambat yang ditutup issue ini:

1. Multi satuan dan harga grosir hanya bisa diisi sebagai string JSON di dalam
   satu sel spreadsheet.
2. Import bersifat semua-atau-tidak-sama-sekali. Satu baris salah membatalkan
   seluruh file.
3. Hanya menerima `.csv`, padahal file dari supplier dan admin toko berbentuk
   `.xlsx`.

## Kondisi Saat Ini

| Perilaku | Lokasi |
| --- | --- |
| `wholesale_prices` hanya diparse dari JSON | [`productsCsv.ts:95`](../src/utils/productsCsv.ts#L95) |
| `unit_mappings` hanya diparse dari JSON | [`productsCsv.ts:110`](../src/utils/productsCsv.ts#L110) |
| Parser membuang seluruh item saat ada error | [`productsCsv.ts:338`](../src/utils/productsCsv.ts#L338) |
| Plan import membuang seluruh item saat ada error | [`productMasterImport.ts:148`](../src/utils/productMasterImport.ts#L148) |
| Mutation melempar error untuk seluruh transaksi | [`useStockManagement.tsx:264`](../src/hooks/useStockManagement.tsx#L264) |
| Input file dibatasi `.csv` | [`StockManagement.tsx:261`](../src/view/master-data/products/StockManagement.tsx#L261) |
| Modal error hanya menampilkan 5 baris pertama, tanpa jalan keluar | [`StockManagement.tsx:110`](../src/view/master-data/products/StockManagement.tsx#L110) |
| Export menulis kolom JSON | [`productsCsv.ts:347`](../src/utils/productsCsv.ts#L347) |

Contoh yang harus diketik user hari ini untuk satu produk multi satuan:

```txt
[{"unit":"dus","base_unit":"pcs","ratio":24}]
```

## Tujuan

- Multi satuan dan harga grosir bisa diisi dengan kolom biasa yang bisa diketik
  dan di-drag di Excel.
- Baris yang valid tetap masuk walaupun ada baris lain yang salah.
- Baris yang gagal bisa diunduh sebagai file kecil berisi baris aslinya plus
  kolom `error`, diperbaiki, lalu diunggah ulang.
- Menerima `.xlsx` selain `.csv`.
- Tersedia unduhan template berisi contoh terisi.
- File lama berformat JSON tetap bisa diimpor.

## Non-Tujuan

- Import master produk **tetap tidak boleh** membuat atau mengubah saldo stok
  maupun kas. Invariant ini sudah dijaga di
  [`productMasterImport.ts:65`](../src/utils/productMasterImport.ts#L65) dan
  kolom `stock` / `purchase_quantity` tetap diabaikan dengan peringatan.
- Tidak mengubah schema `Product`, `unit_mappings`, atau `wholesale_prices`.
- Tidak menambah bulk edit, aturan markup, atau template satuan per kategori.
  Itu lingkup terpisah.

## Spesifikasi Format Kolom Lebar

Satuan dasar produk adalah `purchase_unit`. Seluruh rasio dihitung terhadap
satuan dasar tersebut, konsisten dengan `ProductUnitMapping { unit, base_unit, ratio }`.

### Kolom satuan tambahan

Pasangan kolom berulang dengan sufiks angka, mulai dari `2` karena `1` adalah
satuan dasar:

```txt
satuan_2 | isi_2 | satuan_3 | isi_3 | ...
```

Arti: `1 satuan_N = isi_N × purchase_unit`.

| Kolom | Alias yang diterima | Wajib |
| --- | --- | --- |
| `satuan_N` | `unit_N` | berpasangan |
| `isi_N` | `rasio_N`, `ratio_N`, `konversi_N` | berpasangan |

Contoh satu baris:

```txt
name,purchase_unit,selling_unit,satuan_2,isi_2,satuan_3,isi_3
Rokok A,bungkus,bungkus,slop,10,dus,100
```

Hasil: `unit_mappings = [{unit:'slop',base_unit:'bungkus',ratio:10},{unit:'dus',base_unit:'bungkus',ratio:100}]`.

### Kolom harga grosir

```txt
grosir_qty_1 | grosir_harga_1 | grosir_tipe_1 | grosir_qty_2 | ...
```

| Kolom | Alias yang diterima | Nilai |
| --- | --- | --- |
| `grosir_qty_N` | `wholesale_min_N`, `min_qty_N` | angka > 0 |
| `grosir_harga_N` | `wholesale_price_N`, `harga_grosir_N` | angka >= 0 |
| `grosir_tipe_N` | `wholesale_type_N` | `unit` atau `bundle`, default `unit` |

### Deteksi kolom

Header dinormalisasi dulu memakai `normalizeHeaderName` yang sudah ada, lalu
dicocokkan dengan regex bersufiks angka. Jumlah `N` tidak dibatasi dan tidak
harus berurutan; kolom diurutkan menaik berdasarkan angka sufiks. Sufiks yang
tidak dipakai di sebuah baris cukup dikosongkan.

### Hubungan dengan `sellable_units`

Jika kolom `sellable_units` tidak ada, satuan yang bisa dijual diturunkan dari
satuan dasar plus seluruh `satuan_N` melalui
`buildSellableUnitsFromMappings` yang sudah dipakai sekarang. Jika kolom
`sellable_units` diisi, nilainya menang sebagai override eksplisit.

### Kompatibilitas dengan format JSON

- Kolom `unit_mappings` dan `wholesale_prices` berformat JSON tetap diterima.
- Jika pada baris yang sama kolom JSON **dan** kolom lebar sama-sama terisi
  untuk kelompok yang sama, baris itu ditolak dengan error eksplisit. Tidak ada
  pemenang diam-diam, karena salah tebak berarti kehilangan data harga.
- Export ([`createProductCsvExportRows`](../src/utils/productsCsv.ts#L347))
  diubah menulis format kolom lebar supaya hasil export bisa diedit di Excel
  lalu diimpor kembali tanpa menyentuh JSON. Lebar kolom mengikuti produk dengan
  jumlah satuan dan tier grosir terbanyak.

## Aturan Validasi Per Baris

Semua aturan berikut menghasilkan error **tingkat baris**, bukan tingkat file:

1. `satuan_N` terisi tetapi `isi_N` kosong, bukan angka, atau <= 0.
2. `isi_N` terisi tetapi `satuan_N` kosong.
3. Nama satuan duplikat dalam satu baris, termasuk bentrok dengan
   `purchase_unit` atau `selling_unit`.
4. `grosir_qty_N` bukan angka atau <= 0.
5. `grosir_harga_N` bukan angka atau < 0.
6. Pasangan grosir tidak lengkap (`qty` tanpa `harga`, atau sebaliknya).
7. `grosir_tipe_N` diisi selain `unit` atau `bundle`.
8. Kolom JSON dan kolom lebar sama-sama terisi untuk kelompok yang sama.
9. Aturan lama yang sudah ada: `name` kosong, `sku` duplikat dalam file, `id`
   duplikat dalam file, harga negatif, `product_type` tidak dikenal,
   `is_visible_in_pos` tidak dikenal.
10. Aturan tingkat plan yang sekarang membatalkan seluruh file dan harus
    diturunkan jadi error baris: SKU cocok ke lebih dari satu produk, `id` dan
    `sku` menunjuk produk berbeda, produk yang sama direncanakan dua kali.

Error tingkat **file** yang tetap membatalkan semuanya hanya dua: file kosong,
dan kolom `name` / `nama` tidak ditemukan.

## Perubahan Perilaku Import Parsial

`ProductCsvImportResult` diperluas:

```ts
interface ProductCsvRowError {
  rowNumber: number;   // nomor baris di file, header = 1
  rawRow: string[];    // baris asli apa adanya
  messages: string[];  // semua error pada baris itu
}
```

- `buildProductCsvImportItems` mengembalikan `items` berisi baris valid dan
  `rowErrors` berisi baris gagal. Baris gagal dilewati, tidak membatalkan file.
- `buildProductMasterImportPlan` melakukan hal yang sama: baris bermasalah
  dikeluarkan dari plan dan dilaporkan, sisanya tetap dieksekusi.
- Transaksi Dexie tetap atomik untuk baris yang diterima. `syncQueue` hanya
  diisi untuk baris yang benar-benar tersimpan.
- Import parsial aman karena master import tidak menyentuh stok maupun kas, jadi
  file setengah masuk tidak meninggalkan angka operasional yang timpang.

### Laporan baris gagal

File unduhan berisi header asli file sumber ditambah dua kolom di depan:

```txt
baris,error,<seluruh kolom asli...>
```

Nama file: `import-produk-gagal-<YYYYMMDD-HHmm>.csv`. Delimiter mengikuti
delimiter file sumber yang sudah terdeteksi otomatis oleh parser.

### Activity log

Deskripsi log di [`useStockManagement.tsx:287`](../src/hooks/useStockManagement.tsx#L287)
ditambah jumlah baris yang dilewati, supaya jejak audit tidak menyiratkan
seluruh file berhasil.

## Perubahan UI

Modal konfirmasi di [`StockManagement.tsx:148`](../src/view/master-data/products/StockManagement.tsx#L148)
menjadi preview ringkasan:

```txt
File            : daftar-barang.xlsx
Produk baru     : 812
Produk diperbarui: 165
Baris gagal     : 23   [Unduh baris gagal]
```

- Tombol import tetap aktif selama ada minimal satu baris valid.
- Modal `stock.importBlockedTitle` hanya muncul untuk dua error tingkat file.
- Menu export ditambah item `Unduh template` berisi header format kolom lebar
  plus tiga baris contoh: produk satuan tunggal, produk multi satuan, produk
  bertier grosir.
- `accept` diubah menjadi `.csv,.xlsx,text/csv` dan pemeriksaan ekstensi di
  [`StockManagement.tsx:91`](../src/view/master-data/products/StockManagement.tsx#L91)
  menyesuaikan.

## Dukungan XLSX

Dependency `xlsx` sudah terpasang dan dipakai untuk export di
[`src/utils/export/xlsx.ts`](../src/utils/export/xlsx.ts).

- Baca sheet pertama, ubah jadi matriks `string[][]` dengan `sheet_to_json`
  memakai `header: 1` dan `raw: false`, lalu masukkan ke pipeline parsing yang
  sama dengan CSV.
- Sel angka yang sudah diformat Excel dinormalisasi oleh `parseNumberFlexible`
  yang sudah menangani pemisah ribuan titik maupun koma.
- Sel kosong menjadi string kosong, bukan `undefined`.

## Berkas yang Berubah

| Berkas | Perubahan |
| --- | --- |
| [`src/utils/productsCsv.ts`](../src/utils/productsCsv.ts) | Parser kolom lebar, `rowErrors`, export format lebar, builder template |
| `src/utils/productsWorkbook.ts` (baru) | Pembaca `.xlsx` menjadi `string[][]` |
| [`src/utils/productMasterImport.ts`](../src/utils/productMasterImport.ts) | Skip baris bermasalah, laporkan per baris |
| [`src/hooks/useStockManagement.tsx`](../src/hooks/useStockManagement.tsx) | Terima hasil parsial, log jumlah dilewati |
| [`src/view/master-data/products/StockManagement.tsx`](../src/view/master-data/products/StockManagement.tsx) | Preview ringkasan, unduh baris gagal, unduh template, `accept` xlsx |
| [`src/i18n/stockMessages.ts`](../src/i18n/stockMessages.ts) | Kunci baru id + en |
| [`tests/unit/products-csv.test.ts`](../tests/unit/products-csv.test.ts) | Test case di bawah |

## Test Case

Ditambahkan ke [`tests/unit/products-csv.test.ts`](../tests/unit/products-csv.test.ts):

1. Kolom lebar `satuan_2`/`isi_2` menghasilkan `unit_mappings` yang benar dengan
   `base_unit` = `purchase_unit`.
2. Sufiks tidak berurutan (`satuan_2`, `satuan_4`) tetap terbaca dan terurut.
3. Alias `unit_2` / `rasio_2` diperlakukan sama dengan `satuan_2` / `isi_2`.
4. `satuan_2` tanpa `isi_2` menghasilkan error baris, baris lain tetap masuk.
5. `isi_2` bernilai `0` atau negatif menghasilkan error baris.
6. Nama satuan duplikat dengan `purchase_unit` menghasilkan error baris.
7. Kolom grosir lebar menghasilkan `wholesale_prices` terurut dengan
   `price_type` default `unit`.
8. `grosir_tipe_1 = bundle` terbaca sebagai `bundle`.
9. Pasangan grosir tidak lengkap menghasilkan error baris.
10. Kolom JSON `unit_mappings` tanpa kolom lebar tetap terbaca seperti sebelumnya.
11. Kolom JSON dan kolom lebar sama-sama terisi menghasilkan error baris.
12. File dengan 3 baris valid dan 1 baris salah menghasilkan `items.length === 3`
    dan `rowErrors.length === 1`.
13. `rowErrors[].rawRow` mempertahankan isi baris asli untuk laporan unduhan.
14. File tanpa kolom `name` tetap membatalkan seluruh file.
15. `sellable_units` diturunkan dari satuan dasar plus seluruh `satuan_N` bila
    kolomnya tidak ada.
16. Kolom `sellable_units` yang diisi menang atas hasil turunan.
17. Export lalu import kembali menghasilkan produk yang setara (round-trip).
18. `buildProductMasterImportPlan` melewati baris ber-SKU ganda tanpa
    membatalkan baris lain.
19. Import tetap tidak mengubah `stock` produk yang sudah ada.

## Definition of Done

Terverifikasi lewat test otomatis:

- [x] File dengan satuan tambahan dan tier grosir terimpor tanpa satu pun sel JSON.
- [x] File dengan baris rusak di tengah tetap memasukkan baris valid, dan baris
      gagal terkumpul lengkap dengan sel aslinya untuk diunduh.
- [x] Template bisa diimpor kembali apa adanya tanpa error.
- [x] Export lalu import kembali menghasilkan konversi satuan dan tier grosir
      yang sama.
- [x] Stok dan kas tidak berubah setelah import.
- [x] `bun test tests/unit` hijau (171 test), `tsc -b` dan `eslint` bersih.

Menunggu verifikasi manual di aplikasi:

- [ ] Unggah `.xlsx` nyata dari Excel dan pastikan sel angka terformat terbaca.
- [ ] File 1000 baris: cek waktu proses dan keterbacaan modal preview.
- [ ] Siklus perbaikan: unduh baris gagal, perbaiki, unggah ulang sampai bersih.
