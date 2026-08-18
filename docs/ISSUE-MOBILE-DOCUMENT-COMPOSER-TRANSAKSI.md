# Issue: Mobile Document Composer untuk Form Transaksi Kompleks (Fase 1 & 2)

Tanggal catatan: 2026-08-18

Status: Fase 1 & Fase 2 selesai (2026-08-18)

## Ringkasan

Form transaksi kompleks (Stock In, Sales/Purchase Invoice, dst.) saat ini
tidak punya percabangan mobile sama sekali — confirmed lewat grep
`isMobile|useIsMobile` yang nihil di
[`SalesDocumentForm.tsx`](../src/components/sales-document/SalesDocumentForm.tsx)
(556 baris) dan
[`PurchaseDocumentForm.tsx`](../src/components/purchase-document/PurchaseDocumentForm.tsx)
(860 baris). Tabel desktop lebar (virtualized table item, `Table` antd di
Stock In) dirender apa adanya di layar ponsel.

Diskusi awal (lihat riwayat percakapan) menyimpulkan pola target:
**Document Composer + Hub-and-Spoke + Progressive Disclosure + Smart
Defaults + Review sebelum Posting**, dengan urutan kerja
**Eliminate → Automate → Default → Group → Progressive Disclosure →
Validate** dan formula per field: *"apakah pengguna benar-benar perlu
mengisi ini? kalau tidak: hapus → otomatisasi → default → sembunyikan
sampai dibutuhkan."*

Issue ini membagi pekerjaan itu ke dua fase supaya biaya implementasi
terukur, dan menegakkan aturan keras dari user: **hindari duplikasi —
cari function/komponen yang sudah ada dulu, baru boleh bikin baru.**

Aplikasi ini sudah punya standar CRUD mobile
([`docs/MOBILE-CRUD-GLOBAL.md`](MOBILE-CRUD-GLOBAL.md),
[`docs/ISSUE-MOBILE-CRUD-LIST-STANDARD.md`](ISSUE-MOBILE-CRUD-LIST-STANDARD.md))
yang lahir dari Master Data Produk. Primitive di sana (`MobileCrudList`,
`ResponsiveCrudEditor`, `MobileCrudBottomSheet`, dll.) didesain untuk CRUD
list record sederhana (satu record = satu card, aksi edit/hapus). Issue
ini **memperluas** pemakaiannya ke dalam satu dokumen multi-baris
(bukan menggantinya) — primitive-nya dipakai ulang sebagai container,
bukan diduplikasi jadi versi baru.

## Kondisi Existing yang WAJIB Dipakai Ulang

Tabel ini adalah checklist "cari dulu" sebelum menulis kode baru di kedua
fase. Kalau kebutuhan sudah ada di baris ini, jangan bikin ulang.

| Kebutuhan | Sudah ada di | Catatan reuse |
| --- | --- | --- |
| Deteksi mobile | [`useIsMobile`](../src/hooks/useIsMobile.ts) | Satu-satunya sumber kebenaran breakpoint/coarse-pointer/UA. Jangan bikin deteksi kedua. |
| Bottom sheet generik | [`MobileCrudBottomSheet`](../src/components/mobile-crud/MobileCrudBottomSheet.tsx) | Untuk spoke ringan (pilihan pendek, aksi halaman). |
| Full-screen drawer (mobile) / modal (desktop) | [`ResponsiveCrudEditor`](../src/components/mobile-crud/ResponsiveCrudEditor.tsx) | Untuk editor baris item dan panel "Detail Lainnya". Body form satu instance, tidak bercabang per device — pola yang sama harus dipertahankan. |
| Card list + action sheet + progressive disclosure | [`MobileCrudList`](../src/components/mobile-crud/MobileCrudList.tsx) | Container list generik, domain memasok `renderItem`/`getActions`. |
| Search + filter + hitung baris terisi + deteksi duplikat produk | [`useLineItemViewControls`](../src/hooks/useLineItemViewControls.ts) + [`lineItemView.ts`](../src/utils/documentLineItems/lineItemView.ts) | Sudah dipakai Sales & Purchase. Card mobile tinggal konsumsi `entries`/`filledCount`/`duplicateProductIds` yang sama. |
| Handler baris item (update/select produk/hapus/expand) | `updateItem`, `selectProduct`, `removeItem`, `toggleExpanded`, `addRow` di [`DocumentLineItems.tsx`](../src/components/sales-document/DocumentLineItems.tsx) | Semua berbasis `item.id`, bukan index — aman dipanggil dari card mobile tanpa ubah logic sort/filter. |
| Field lanjutan per baris (diskon, pajak baris) | [`LineItemExpandedFields`](../src/components/document-line-items/LineItemExpandedFields.tsx) | Sudah persis konten "editor lengkap per item" yang diminta poin 5 diskusi. Parametris `i18nPrefix`. |
| Ringkasan subtotal/diskon/pajak/total dokumen | [`DocumentTotalsSummary`](../src/components/document-line-items/DocumentTotalsSummary.tsx) | Sudah persis konten layar Review (poin 12). Parametris `i18nPrefix`/`discountPurpose`/`discountAccountType`. |
| Field header dokumen (customer, tanggal, dst.) | `config.headerFields` di [`src/configs/sales-document/*.config.ts`](../src/configs/sales-document) dirender oleh [`DocumentHeader.tsx`](../src/components/sales-document/DocumentHeader.tsx) + `FieldRenderer` | Sudah config-driven per tipe dokumen. Progressive Disclosure = tambah 1 properti ke config, bukan komponen baru. |
| Draft vs Posting | Status `DRAFT`/`ISSUED`/`VOIDED` di `salesDocumentService.ts`, transisi lewat `issueDocument()` (dipanggil di [`SalesDocumentDetail.tsx:352-358`](../src/view/finance/sales/SalesDocumentDetail.tsx)) | Sudah ada sebagai konsep data, bukan cuma UI. Jangan bikin state draft lokal baru. |
| Autosave lokal | Arsitektur Dexie-first (offline-first) | Draft yang sudah tersimpan otomatis persist lokal. Tidak perlu mekanisme autosave terpisah untuk data yang sudah `setValue`-ed ke form state tersimpan. |
| Scanner barcode | [`StockProductBarcodeScanner.tsx`](../src/view/master-data/products/StockProductBarcodeScanner.tsx) | Reuse komponen ini kalau butuh scan saat pilih produk; jangan bikin scanner kedua. |
| Default harga/unit saat pilih produk | `handleProductChange` (Stock In), `selectProduct`/`createSystemPricingPatch` (Sales) | Sudah defaulting dari data produk. Tidak ada pekerjaan baru di sini. |

## Fase 1 — Pilot: Stock In (Penerimaan Stok Manual)

### Kenapa jadi pilot

[`StockInPage.tsx`](../src/view/inventory/StockInPage.tsx) (389 baris) adalah
dokumen paling sederhana yang punya masalah ini: 6 kolom (`Table` antd,
`scroll={{x:'max-content'}}`), tanpa diskon/pajak per baris, tanpa expand
row, submit langsung sekali jalan (`useStockIn().submitStockIn` yang di
baliknya memanggil `createPurchaseDocument` lalu langsung
`issuePurchaseDocument` — lihat
[`useStockIn.tsx:174-181`](../src/hooks/useStockIn.tsx)). Risiko rendah,
cocok untuk memvalidasi pola composer sebelum disentuh ke dokumen finance
yang lebih sensitif.

### Pemetaan ke prinsip

1. **Eliminate/Automate/Default** — sudah terpenuhi, tidak ada pekerjaan
   baru: tanggal default hari ini (`dayjs()`), unit & harga default ikut
   produk (`handleProductChange`, `StockInPage.tsx:108-115`).
2. **Group / item summary** — ganti `Table` jadi card list di mobile.
   Reuse `MobileCrudList<DraftRow>`: `renderItem` menampilkan pola
   "Produk × qty unit → subtotal" dari `lines`/`rowErrors` yang **sudah**
   dihitung di `useMemo` (`StockInPage.tsx:73-98`) — tidak perlu hitung
   ulang.
3. **Editor baris** — karena field-nya cuma 5 (produk, qty, unit, harga,
   catatan) dan tidak ada sub-section, ini di bawah ambang "task
   tersendiri" pada matriks `ISSUE-MOBILE-CRUD-LIST-STANDARD.md` §Matriks
   Pemilihan Container. Pakai `MobileCrudBottomSheet` (bukan full-screen
   `ResponsiveCrudEditor`), isinya kontrol yang sama persis dengan
   `render()` di `columns` (`StockInPage.tsx:188-281`), cuma disusun
   vertikal alih-alih jadi sel tabel — tidak ada input baru.
4. **Review sebelum posting** — sudah ada sebagai `modal.confirm`
   (`StockInPage.tsx:149-185`) yang menampilkan tujuan, jumlah baris,
   total, dan warning harga pending. Verifikasi tampilannya di viewport
   sempit; tidak perlu komponen baru.
5. **Progressive Disclosure** — tidak relevan di fase ini, field sudah
   minimal.
6. **Validate** — validasi per baris (`rowErrors`) sudah ada, cukup
   dipindahkan tampilannya ke card (badge error di card, bukan alert
   global) memakai data yang sama.

### Kode baru yang genuinely dibutuhkan

- Percabangan render `useIsMobile()` di `StockInPage.tsx` yang memanggil
  `MobileCrudList` + `MobileCrudBottomSheet` alih-alih `Table`. State
  (`rows`, `updateRow`, `handleProductChange`, dst.) **tidak berubah**,
  cuma dipakai ulang oleh JSX mobile.
- Card renderer kecil (nama produk, qty×unit→subtotal, badge error).

### Non-tujuan Fase 1

- **Tidak** membangun autosave/draft baru — Stock In adalah alur sekali
  duduk (petugas gudang input lalu submit), beda karakter dari invoice
  yang bisa diisi bertahap. Kalau nanti ada laporan user menutup app
  di tengah input, baru dievaluasi ulang.
- **Tidak** membangun product picker baru dengan recent/favorite. `Select
  showSearch` yang ada sudah memenuhi "search + autocomplete"; recent/
  favorite/scanner terintegrasi ditunda ke evaluasi terpisah supaya tidak
  scope creep di pilot.
- **Tidak** mengubah `useStockIn.tsx`, `stockInPayload.ts`, atau service
  purchase/opening-balance apa pun. Murni perubahan presentasi.

### Acceptance Criteria

- [x] Viewport 320–430px: tidak ada horizontal scroll pada halaman Stock In.
- [x] Tambah/hapus/edit baris via card + bottom sheet menghasilkan `lines`
      yang identik dengan hasil path desktop (state dan fungsi hitung
      tidak diduplikasi).
- [x] Modal konfirmasi submit tetap terbaca penuh tanpa terpotong di layar
      sempit.
- [x] Desktop (`Table` lama) tidak berubah perilaku maupun tampilannya.

### Test Plan

- Unit: tidak ada logic baru untuk diuji (murni presentasi) — cukup
  smoke-test render mobile branch tidak crash dengan produk kosong/terisi.
- E2E: tambahkan skenario mobile viewport ke
  `tests/e2e/` mengikuti pola `tests/e2e/mobile-product-crud.spec.ts`
  (card muncul, tabel desktop tidak muncul, submit berhasil, tidak ada
  overflow horizontal). — implemented di
  [`tests/e2e/mobile-stock-in.spec.ts`](../tests/e2e/mobile-stock-in.spec.ts),
  lulus (`bun x playwright test tests/e2e/mobile-stock-in.spec.ts`).

## Fase 2 — Sales Invoice Mobile Document Composer

### Kenapa Sales Invoice, bukan semua dokumen sekaligus

`SalesDocumentForm.tsx` dipakai bersama oleh Quotation, Order, Delivery,
dan Invoice (`config.type` beda, komponen sama) — jadi mendesain mobile
shell untuk Sales Invoice otomatis berlaku untuk ketiga tipe lain karena
semuanya lewat `config.headerFields` yang sama. Purchase Invoice/Receipt
**sengaja tidak digarap fase ini**: strukturnya paralel
(`PurchaseDocumentForm.tsx`) tapi dijaga terpisah dari Sales sejak
refactor line-item sebelumnya (lihat memory
`line-item-view-controls-decision` — divergensi bisnis harga manual vs
landed-cost). Adopsinya jadi fast-follow yang menyalin pola yang sama
setelah Sales Invoice terbukti, bukan pekerjaan baru di fase ini.

### Kondisi existing yang relevan (selain tabel di atas)

- `config.headerFields` untuk Sales Invoice
  ([`salesInvoice.config.ts`](../src/configs/sales-document/salesInvoice.config.ts))
  sudah cuma 8 field: `contact_id`, `customer_name`, `document_date`,
  `due_date`, `payment_status`, `department_id`, `project_id`, `notes`.
  Ini sudah dekat dengan daftar "informasi utama" di poin 3 diskusi —
  `department_id`/`project_id` yang paling masuk akal jadi "Detail
  Lainnya".
- `SalesDocumentDetail.tsx` (halaman detail/read-only, bukan form) juga
  belum mobile-aware: item ditampilkan lewat `<table
  className="w-full min-w-[640px]...">` di dalam `overflow-x-auto`
  (`SalesDocumentDetail.tsx:630-696`) — tetap men-scroll horizontal di
  ponsel. Ini bagian dari "Review" yang harus ikut dibenahi, bukan
  diasumsikan sudah beres.
- Draft → Issued sudah dipisah di level halaman: tombol "Simpan Draft" di
  form (`SalesDocumentForm.tsx:525`) vs tombol "Terbitkan" di Detail
  (`SalesDocumentDetail.tsx:352-358`, memanggil `issueDocument`). Alur
  Draft ≠ Posting dari poin 12 **secara struktural sudah ada** — bukan
  fitur baru, cuma perlu dipastikan halaman Detail nyaman dibaca di
  ponsel supaya benar-benar berfungsi sebagai layar Review.

### Pemetaan ke prinsip & apa yang dibangun

1. **Eliminate/Automate/Default** — audit field per field di
   `salesInvoice.config.ts` sebelum menyentuh UI: currency sudah default
   base currency (`SalesDocumentForm.tsx:414-432`), discount sudah default
   `fixed`/0. Yang belum: default `contact_id` terakhir dipakai,
   `department_id`/`project_id` default dari user aktif — kalau ada data
   sumbernya, ini cukup murah untuk dikerjakan lebih dulu karena berlaku
   juga di desktop. Kalau tidak ada sumber default yang jelas, biarkan
   kosong (opsional).
2. **Group + Progressive Disclosure (poin 3–4)** — tambah properti
   opsional `group?: 'core' | 'advanced'` ke `SalesDocumentFieldConfig`
   (`src/configs/sales-document/index.ts`), field tanpa `group` dianggap
   `'core'`. Isi `group: 'advanced'` untuk `department_id`/`project_id` di
   ke-4 file config. `DocumentHeader`/`FieldRenderer` **tidak berubah**;
   cukup filter `config.headerFields` jadi dua array di layer mobile baru
   (lihat poin 4) dan render array kedua di dalam sheet "Detail Lainnya".
3. **Item sebagai card, bukan tabel (poin 5)** — di
   `DocumentLineItemsVirtualTable.tsx`, tambah percabangan `useIsMobile()`
   yang me-render card (pola sama seperti Fase 1: nama produk, qty×unit,
   subtotal, badge diskon/pajak kalau ada) alih-alih baris virtual table.
   Tap card → buka `ResponsiveCrudEditor` berisi: pilih produk (Select
   showSearch yang sudah ada) + qty/unit/harga (input yang sudah ada di
   row desktop) + `LineItemExpandedFields` (diskon & pajak baris, dipakai
   ulang persis). Semua lewat callback `onUpdateItem`/`onSelectProduct`
   yang **sudah ada** di `DocumentLineItems.tsx` — tidak ada jalur mutasi
   baru.
4. **Hub-and-Spoke (poin 6)** — satu komponen baru,
   `src/components/sales-document/SalesDocumentMobileComposer.tsx`,
   dirender oleh `SalesDocumentForm.tsx` sebagai percabangan
   `useIsMobile()` (bukan route/form terpisah — form state `control`,
   `items`, `total`, `setValue` yang sudah ada di `SalesDocumentForm`
   dioper turun apa adanya). Isinya hub ringkas:

   ```text
   Sales Invoice (hub)
   ├─ Ringkasan: customer, tanggal, jatuh tempo, jumlah item, total
   ├─ Customer & Tanggal >        → sheet: field 'core' dari config.headerFields
   ├─ Item (n) >                  → DocumentLineItems versi card (poin 3.)
   ├─ Diskon & Pajak Dokumen >    → sheet: DocumentTotalsSummary (dipakai ulang)
   ├─ Detail Lainnya >            → sheet: field 'advanced' dari config.headerFields
   └─ Simpan Draft (tombol tetap, aksi sama seperti sekarang)
   ```

   Tiap spoke adalah `ResponsiveCrudEditor` atau `MobileCrudBottomSheet`
   yang berisi komponen existing di atas — komponen baru ini murni
   komposisi/tata-letak, bukan logic baru. State spoke terbuka/tertutup
   cukup `useState<SpokeKey | null>` lokal di komponen hub, tidak perlu
   router/subroute baru (menghindari kompleksitas back-button/deep-link
   yang teridentifikasi sebagai bagian paling mahal saat diskusi).
5. **Review sebelum Posting (poin 12)** — bukan layar baru. Perbaiki
   `SalesDocumentDetail.tsx` supaya bagian tabel item
   (`SalesDocumentDetail.tsx:630-696`) punya varian card mobile,
   idealnya lewat komponen presentasi kecil yang dipakai bersama dengan
   card item di composer (mis. `LineItemSummaryCard`, read-only vs
   editable lewat prop), supaya format "Produk × qty → subtotal" tidak
   ditulis dua kali. Tombol "Terbitkan" yang sudah ada
   (`issueDocument`) tetap jadi satu-satunya jalur posting.

### Kode baru yang genuinely dibutuhkan (ringkasan)

| # | Item | Sifat |
| - | --- | --- |
| 1 | `SalesDocumentMobileComposer.tsx` | Baru — komposisi hub, memanggil komponen existing |
| 2 | `LineItemSummaryCard.tsx` (card composer, editable via tap) | Baru — presentasi, callback existing |
| 3 | `SalesDocumentDetail.tsx` mobile row (read-only) | Baru — renderer terpisah (kebutuhan beda: sku/diskon/pajak inline), berbagi helper format `formatLineItemQuantitySummary` dengan #2 |
| 4 | `group?: 'core' \| 'advanced'` di `SalesDocumentFieldConfig` + isi di 4 file config | Selesai |
| 5 | Default `department_id` dari employee user aktif | Selesai — `contact_id`/`project_id` dilewati, tidak ada sumber data yang jelas di codebase |
| 6 | `LineItemProductPicker.tsx` (product Select + quick-create) | Baru — extract dari `DocumentLineItemRow` supaya tidak duplikat antara row desktop & editor mobile |
| 7 | Fix `LineItemExpandedFields` grid 3 kolom jadi responsif (`grid-cols-1 sm:grid-cols-3`) | Bug ditemukan saat implementasi: field diskon collapse ke lebar 0 di drawer sempit |

Semua yang lain (item handlers, totals, expanded fields, draft/issue,
bottom sheet & full-screen container, deteksi mobile) **dipakai ulang**
dari tabel reuse di atas.

### Non-tujuan Fase 2

- **Tidak** menggarap Purchase Invoice/Receipt — fast-follow terpisah
  setelah pola Sales Invoice stabil, menyalin komponen yang sama
  (`LineItemExpandedFields`, `DocumentTotalsSummary`, `ResponsiveCrudEditor`
  sudah parametris untuk `purchaseDocuments`).
- **Tidak** menyentuh POS retail (`src/view/Transaction.tsx`) — arsitektur
  dan hotkeys-nya sudah berbeda (lihat memory
  `pos-retail-hotkeys-architecture`), di luar cakupan dokumen ini.
- **Tidak** membangun subroute/deep-link per spoke. Hub-and-spoke di sini
  adalah state lokal (`useState`), bukan navigasi router baru — kalau
  nanti terbukti dibutuhkan (mis. share link ke spoke tertentu), itu jadi
  fase terpisah dengan pertimbangan biaya sendiri.
- **Tidak** membangun product/customer picker baru dengan recent/favorite
  di fase ini. `Select showSearch` dipakai ulang seperti sekarang.
- **Tidak** mengubah `calculateDocumentTotal`, `salesDocumentService.ts`,
  atau skema `SalesDocument`/`SalesDocumentItem`. Murni presentasi +
  satu properti config opsional.

### Acceptance Criteria

- [x] Viewport 320–430px: form Sales Invoice tidak ada horizontal scroll,
      baik saat create maupun edit draft.
- [x] Hub menampilkan ringkasan yang benar (customer, tanggal, jatuh
      tempo, jumlah item terisi, total) sinkron dengan `total` yang sama
      dipakai desktop.
- [x] Tiap spoke membuka `ResponsiveCrudEditor`/`MobileCrudBottomSheet`
      berisi field yang sesuai grup, tanpa field yang hilang dibanding
      desktop.
- [x] Edit item lewat card mobile menghasilkan `items` yang identik
      dengan hasil path desktop untuk input yang sama (tidak ada jalur
      hitung harga/diskon/pajak kedua).
- [x] `SalesDocumentDetail.tsx` di mobile menampilkan item sebagai card,
      bukan tabel yang di-scroll horizontal.
- [x] Tombol Simpan Draft dan Terbitkan tetap memanggil fungsi yang sama
      seperti sekarang (`onSubmit`, `issueDocument`).
- [x] Desktop (virtual table, layout existing) tidak berubah perilaku
      maupun tampilan.
- [x] Quotation/Order/Delivery (config lain yang berbagi
      `SalesDocumentForm`) di-smoke-test tetap berfungsi setelah
      percabangan mobile ditambahkan.

### Test Plan

- Unit: test filter `group: 'core' | 'advanced'` pada
  `config.headerFields` (deterministik, mirip pola
  `tests/unit/mobile-crud.test.ts` untuk clamp progressive disclosure).
  — implemented di
  [`tests/unit/sales-document-header-field-groups.test.ts`](../tests/unit/sales-document-header-field-groups.test.ts)
  dan [`tests/unit/sales-document-line-item-summary-format.test.ts`](../tests/unit/sales-document-line-item-summary-format.test.ts).
- E2E (viewport mobile, mengikuti pola
  `tests/e2e/mobile-product-crud.spec.ts`) — implemented di
  [`tests/e2e/mobile-sales-document-composer.spec.ts`](../tests/e2e/mobile-sales-document-composer.spec.ts),
  lulus (`bun x playwright test tests/e2e/mobile-sales-document-composer.spec.ts`):
  1. Buka Sales Invoice baru di viewport 375px, isi lewat tiap spoke,
     simpan draft.
  2. Tambah item lewat card + sheet, ubah diskon baris, pastikan
     total di hub berubah sesuai.
  3. Buka draft yang sudah ada, pastikan data ter-load benar ke tiap
     spoke.
  4. Terbitkan dari halaman Detail, pastikan status berubah `ISSUED` dan
     tampilan tetap card (tidak scroll horizontal).
  5. Ulangi smoke test singkat untuk Sales Order/Delivery/Quotation.
  6. Regression desktop: pastikan virtual table & layout lama tidak
     berubah.

## Urutan Pengerjaan

1. Fase 1 (Stock In) selesai & di-review dulu sebagai validasi pola,
   sebelum masuk Fase 2 — supaya kesalahan pola (bottom sheet vs
   full-screen, struktur card) dikoreksi di dokumen berisiko rendah.
2. Fase 2 dimulai dari langkah 1 (Eliminate/Automate/Default + properti
   `group` di config) karena berlaku juga ke desktop dan tidak
   menyentuh struktur komponen.
3. Fase 2.1 kemudian card item mobile, lalu hub composer, lalu perbaikan
   `SalesDocumentDetail.tsx`.

## Risiko / Yang Perlu Diverifikasi Sebelum Mulai

- Menambah percabangan `useIsMobile()` di komponen yang dipakai bersama
  desktop (`DocumentLineItemsVirtualTable.tsx`, `DocumentHeader.tsx`)
  berisiko regresi desktop kalau tidak di-guard dengan jelas — wajib
  test kedua viewport di setiap langkah, bukan cuma di akhir fase.
- `SalesDocumentDetail.tsx` (790 baris) belum dibaca penuh saat menulis
  issue ini di luar bagian status/tabel item — perlu telaah ulang area
  lain (payment, return summary) sebelum mengklaim seluruh halaman siap
  jadi layar Review mobile.
- Belum ada keputusan apakah `LineItemSummaryCard` (item #3 di tabel kode
  baru Fase 2) benar-benar layak dipisah jadi komponen bersama, atau
  cukup dua renderer kecil terpisah (konsisten dengan keputusan lama
  "row/container sales vs purchase sengaja tetap terpisah" di memory
  `line-item-view-controls-decision`) — putuskan saat implementasi
  berdasar seberapa mirip kebutuhan read-only vs editable ternyata.
