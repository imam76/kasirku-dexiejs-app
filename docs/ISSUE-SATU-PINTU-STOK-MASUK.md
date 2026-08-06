# Issue: Satu Pintu Stok Masuk

Dokumen terkait:

- [Import Master Produk Skala Besar](ISSUE-IMPORT-MASTER-PRODUK-SKALA-BESAR.md) — format file yang dipakai bersama
- [Enhancement Purchase Receipt: Harga Pending dan Rekonsiliasi HPP](ENHANCE-PENERIMAAN-BARANG-HARGA-PENDING.md)
- [Fase 7 - General Ledger dan Menu Saldo Awal Terpisah](ISSUE-E2E-REFACTOR-FLOW-AKUNTANSI-DEVELOPER-SETUP-F7-GL-OPENING-BALANCE-MODULES.md)

Tanggal catatan: 2026-08-06

## Ringkasan

Untuk menambah stok, user harus lebih dulu tahu ia sedang berada di sisi mana
dari tanggal cutoff. Sebelum cutoff memakai Saldo Awal Persediaan, sesudah
cutoff memakai dokumen pembelian. Dua model mental yang dipisahkan sebuah
tanggal inilah sumber keluhan "ribet", bukan jumlah langkahnya.

Issue ini menyatukan keduanya di balik satu entry point bernama **Stok Masuk**.
Sistem yang memilih jalur berdasarkan tanggal dokumen; user tidak pernah diminta
memilih dan tidak perlu tahu ada dua jalur.

## Kondisi Saat Ini

### Gerbang pada jalur saldo awal

Semua di [`src/services/openingInventoryBalanceService.ts`](../src/services/openingInventoryBalanceService.ts):

| Gerbang | Baris | Efek |
| --- | --- | --- |
| Wajib ada cutoff date dari setup akuntansi | [:142](../src/services/openingInventoryBalanceService.ts#L142) | Stok tidak bisa diisi sebelum setup akuntansi selesai |
| Periode akuntansi harus terbuka | [:152](../src/services/openingInventoryBalanceService.ts#L152) | Gerbang yang tidak terlihat dari layar produk |
| Wajib memuat seluruh produk bersaldo | [:420](../src/services/openingInventoryBalanceService.ts#L420) | Tidak bisa dicicil, harus satu batch sekali jadi |
| Tidak boleh ada mutasi stok setelah cutoff | [:457](../src/services/openingInventoryBalanceService.ts#L457) | Sekali toko jalan, pintu ini tertutup |

Gerbang-gerbang ini benar secara akuntansi dan **tidak dihapus** oleh issue ini.
Yang dihapus adalah keharusan user memahaminya.

### Perilaku dokumen pembelian

Dari [`src/services/purchaseDocumentService.ts`](../src/services/purchaseDocumentService.ts)
dan [`src/configs/purchase-document/purchaseReceipt.config.ts`](../src/configs/purchase-document/purchaseReceipt.config.ts):

| Fakta | Lokasi |
| --- | --- |
| Purchase Receipt bisa berdiri sendiri, `requiredFields: ['document_date']` | [purchaseReceipt.config.ts](../src/configs/purchase-document/purchaseReceipt.config.ts) |
| Stok naik pada Purchase Receipt, atau pada Purchase Invoice yang tidak berasal dari receipt | [:328](../src/services/purchaseDocumentService.ts#L328) |
| Jurnal General Ledger hanya diposting saat Purchase Invoice diterbitkan | [:786](../src/services/purchaseDocumentService.ts#L786) |
| Lawan jurnal Purchase Invoice adalah Hutang Usaha | [generalLedgerService.ts:1765](../src/services/generalLedgerService.ts#L1765) |
| Produk baru bisa dibuat langsung dari layar dokumen lewat `pendingProducts` | [usePurchaseDocuments.tsx:109](../src/hooks/usePurchaseDocuments.tsx#L109) |

Konsekuensi penting: **Purchase Receipt sendirian menaikkan stok tanpa menjurnal.**
Itu memang desain harga pending — nilai persediaan masuk buku saat faktur
diterbitkan atau saat rekonsiliasi HPP. Jadi Receipt bukan pengganti faktur,
melainkan jalur untuk barang yang harganya belum pasti.

Temuan `pendingProducts` juga berarti "buat produk baru" dan "catat stok masuk"
**sudah** bisa satu langkah hari ini, dibuat atomik bersama dokumennya. Kalau
belum terasa demikian oleh user, itu masalah discoverability.

## Tujuan

- Satu entry point untuk semua penambahan stok, apa pun tanggalnya.
- Format file impor yang identik untuk setup awal 1000 barang maupun faktur
  mingguan 60 baris.
- Produk yang belum ada bisa lahir dari file yang sama, tanpa keharusan impor
  master lebih dulu.
- Seluruh guard akuntansi yang ada sekarang tetap berlaku persis seperti
  sebelumnya.

## Non-Tujuan

- Tidak melonggarkan satu pun guard di tabel gerbang di atas.
- Tidak menghapus menu Saldo Awal Persediaan maupun menu Purchases yang ada.
  Keduanya tetap dipakai oleh yang sudah paham; Stok Masuk adalah pintu tambahan
  yang lebih rendah bebannya.
- Tidak mengubah alur harga pending dan rekonsiliasi HPP.

## Desain

### Routing

User mengisi tanggal, supplier, dan grid barang. Sistem memilih jalur:

```txt
tanggal <= cutoff
    -> jalur Saldo Awal Persediaan
       Dr Persediaan / Cr Ekuitas Saldo Awal

tanggal > cutoff, harga final tersedia
    -> Purchase Invoice standalone
       stok naik + jurnal Dr Persediaan / Cr Hutang Usaha

tanggal > cutoff, harga belum tersedia
    -> Purchase Receipt dengan cost_status non-final
       stok naik, jurnal menyusul saat faktur atau rekonsiliasi HPP
```

Pilihan "harga sudah pasti atau belum" adalah satu-satunya percabangan yang
tersisa untuk user, dan itu pertanyaan yang memang ia tahu jawabannya karena
tergantung ada tidaknya faktur di tangan.

### Yang dilihat user

Satu layar, tiga isian: tanggal, supplier, grid barang. Grid menerima ketikan,
scan barcode, tempel dari spreadsheet, atau unggah file. Tidak ada pilihan tipe
dokumen, tidak ada istilah cutoff, tidak ada istilah saldo awal.

Setelah simpan, sistem menampilkan dokumen apa yang terbentuk supaya jejaknya
tetap bisa ditelusuri: `Tersimpan sebagai Saldo Awal Persediaan per <tanggal>`
atau `Tersimpan sebagai Faktur Pembelian GR-2026-0041`.

### Perilaku saat jalur saldo awal tidak tersedia

Jika tanggal <= cutoff tetapi batch saldo awal sudah posted, atau sudah ada
mutasi setelah cutoff, sistem tidak menampilkan error mentah dari service.
Sistem menjelaskan dalam kalimat operasional dan menawarkan jalan keluar:
mengubah tanggal ke hari ini sehingga menjadi dokumen pembelian, atau membuka
revisi saldo awal bagi user yang berwenang.

### Produk baru dari file

Baris dengan SKU tidak dikenal membuat produk baru lewat mekanisme
`pendingProducts` yang sudah ada, memakai kolom master dari
[Import Master Produk Skala Besar](ISSUE-IMPORT-MASTER-PRODUK-SKALA-BESAR.md).
Produk dan dokumen tersimpan dalam satu transaksi, seperti perilaku
`createPurchaseDocument` sekarang di
[:628](../src/services/purchaseDocumentService.ts#L628).

Aturan pencocokan berurutan: `id` persis, lalu `sku` persis, lalu nama persis.
Ambigu berarti baris ditandai untuk dikonfirmasi, bukan ditebak. Rencana awal
menyebut `barcode` sebagai kunci kedua, tetapi `Product` tidak punya field
tersebut, jadi urutannya id → sku → nama.

### Format file bersama

Terimplementasi di [`src/utils/stockIn/stockInCsv.ts`](../src/utils/stockIn/stockInCsv.ts).

Kolom master mengikuti dokumen Tier 1 apa adanya, ditambah kolom transaksi:

```txt
sku | name | qty | satuan | harga_beli | notes | [kolom master opsional...]
```

Alias yang diterima: `qty` juga mengenal `jumlah`, `quantity`, `kuantitas`,
`opening_quantity`, `received_quantity`, `stock`, `stok`; `satuan` juga mengenal
`unit`, `stock_unit`; `harga_beli` juga mengenal `cost_per_unit`,
`purchase_price`, `harga`.

Aturan yang berlaku:

- `satuan` boleh satuan mana pun yang dikenal produk, termasuk `satuan_N` hasil
  konversi pada baris yang sama. Sistem mengonversi ke satuan dasar dan
  menghitung `costPerBaseUnit` sekalian. Satuan asing ditolak dengan menyebut
  satuan yang tersedia.
- `qty` kosong atau `0` berarti **baris dilewati**, bukan error. Ini yang
  membuat file template berisi seluruh produk tetap bisa dipakai sebagai lembar
  hitung.
- `harga_beli` kosong pada jalur pembelian berarti harga pending. Nilai `0`
  diterima karena barang bonus itu nyata.
- `harga_beli` kosong atau `0` pada jalur saldo awal adalah error, karena nilai
  persediaan wajib ada untuk jurnal.
- Produk yang sama boleh muncul beberapa kali pada jalur pembelian, dan ditolak
  pada jalur saldo awal karena akan menggandakan nilai jurnal.
- Baris dengan SKU tidak dikenal menjadi produk baru; kalau tidak ada nama, baris
  itu ditolak.

Format ini menggantikan header khusus di
[`src/utils/openingBalances/inventoryCsv.ts`](../src/utils/openingBalances/inventoryCsv.ts)
sebagai format yang dipromosikan ke user. Header lama tetap diterima karena
aliasnya (`opening_quantity`, `stock_unit`, `cost_per_unit`) sudah dikenali.

## Keputusan Akuntansi

Stok awal **tidak** dicatat sebagai pembelian ke supplier fiktif. Lawan jurnalnya
harus Ekuitas Saldo Awal, bukan Hutang Usaha, karena tidak ada kewajiban nyata ke
siapa pun. Karena itu jalur saldo awal tetap hidup di belakang layar dengan
seluruh guard-nya, hanya tidak lagi berupa menu yang harus dicari user.

Konsekuensi yang harus diterima: untuk tanggal <= cutoff, aturan "wajib memuat
seluruh produk bersaldo" tetap berlaku. Layar Stok Masuk harus menyampaikannya
sebagai kalimat biasa, misalnya `Masih ada 12 produk bersaldo yang belum masuk
daftar` dengan tombol untuk menambahkan semuanya sekaligus.

## Risiko Terpisah yang Ditemukan

[`src/services/stockOpnameService.ts`](../src/services/stockOpnameService.ts)
(582 baris) menaikkan dan menurunkan stok serta membuat FIFO lot, tetapi **tidak
memposting jurnal sama sekali** — transaksinya hanya menyentuh `products`,
`stockOpnames`, `stockOpnameItems`, `inventoryLots`, dan
`inventoryLotConsumptions`. Jalur ini juga tidak dijaga cutoff, dan sudah punya
import CSV di [`stockOpnameCsv.ts`](../src/utils/stockOpname/stockOpnameCsv.ts).

Artinya opname terlihat seperti jalan pintas stok masuk massal yang gratis,
padahal memakainya secara rutin membuat nilai persediaan di neraca menyimpang
diam-diam. Stok Masuk tidak boleh dirutekan ke opname. Kekurangan jurnal opname
layak jadi issue tersendiri.

## Fase Implementasi

| Fase | Isi | Status |
| --- | --- | --- |
| 1 | Format file bersama disepakati dan diimplementasikan | Selesai, 21 unit test |
| 2 | Layar Stok Masuk dengan grid manual dan routing tanggal | Selesai, 13 unit test |
| 3 | Unggah file dan tempel dari spreadsheet di grid yang sama | Menunggu fase 2 |
| 4 | Produk baru dari file lewat `pendingProducts` | Menunggu fase 3 |
| 5 | Alias kode barang supplier agar impor kedua otomatis cocok | Menunggu fase 4 |

Fase 1 sudah menyiapkan `newProducts` siap pakai untuk fase 4, dan fase 2 sudah
menyambungkannya: jalur pembelian meneruskannya ke `pendingProducts`, jalur saldo
awal membuat produknya lebih dulu di transaksi terpisah. Yang belum ada hanya
sumbernya, karena grid manual fase 2 baru bisa memilih produk yang sudah ada.

Berkas fase 2:

| Berkas | Isi |
| --- | --- |
| [`src/utils/stockIn/stockInRouting.ts`](../src/utils/stockIn/stockInRouting.ts) | Keputusan tanggal → jalur, murni dan teruji |
| [`src/utils/stockIn/stockInPayload.ts`](../src/utils/stockIn/stockInPayload.ts) | Pemetaan baris → saldo awal / dokumen pembelian |
| [`src/utils/stockIn/stockInLine.ts`](../src/utils/stockIn/stockInLine.ts) | Baris hasil ketik manual, aturannya sama dengan baris hasil unggah |
| [`src/hooks/useStockIn.tsx`](../src/hooks/useStockIn.tsx) | Baca cutoff dan status batch, submit ke kedua jalur |
| [`src/view/inventory/StockInPage.tsx`](../src/view/inventory/StockInPage.tsx) | Layar tunggal di `/inventory/stock-in` |

Fase 1 dan 2 sudah cukup untuk menghapus keluhan utama. Fase 5 yang membuat
faktur berulang benar-benar hemat waktu.

## Pertanyaan Terbuka

1. Apakah Stok Masuk menggantikan menu Purchases untuk user non-akuntansi, atau
   hidup berdampingan sebagai shortcut? Rekomendasi: berdampingan dulu, evaluasi
   setelah dipakai.
2. Untuk jalur saldo awal, apakah revisi batch boleh dilakukan dari layar Stok
   Masuk atau tetap wajib lewat menu Saldo Awal? Rekomendasi: tetap di menu
   Saldo Awal karena berdampak ke jurnal yang sudah posted.
3. Apakah multi gudang ikut di fase 2 atau ditunda? Rekomendasi: ditunda,
   supaya fase 2 tidak melebar.
