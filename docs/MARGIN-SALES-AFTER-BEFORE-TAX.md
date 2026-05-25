# Margin Sales Document - Before Tax dan After Tax

Dokumen ini menjelaskan langkah implementasi pilihan basis margin untuk Sales Document: margin dihitung terhadap nilai sebelum pajak atau nilai setelah pajak. Targetnya: margin keuntungan dari Sales Invoice bisa dianalisis di laporan Sales/Sales Document tanpa mengubah detail dokumen, total invoice, cash flow, dan flow POS yang sudah ada.

## Audit Kondisi Project Saat Ini

Sales Document sudah memiliki pondasi data yang cukup untuk menghitung margin:

- `src/types/index.ts` sudah memiliki `SalesDocument` dan `SalesDocumentItem`.
- `SalesDocumentItem` sudah menyimpan `price`, `subtotal`, `tax_base_amount`, `tax_amount`, `total_amount`, dan `purchase_price`.
- `src/utils/salesDocuments/mapProductToSalesDocumentItem.ts` sudah membuat snapshot `purchase_price` dari harga modal produk saat item dipilih.
- `src/utils/salesDocuments/calculateDocumentTotal.ts` sudah menghitung subtotal, alokasi diskon dokumen, tax base, tax amount, dan line total.
- `src/services/salesDocumentService.ts` sudah mencatat pembayaran invoice ke finance transaction kategori `SALES_INVOICE_PAYMENT`.
- Profit POS masih berjalan lewat `src/services/checkoutService.ts`, `transactions`, `transactionItems`, `profitLogs`, dan `profitBalance`.
- Report margin saat ini masih berbasis POS transaction item di `src/hooks/useReports.tsx`, belum membaca `salesDocuments` dan `salesDocumentItems`.

Kesimpulan audit: pilihan before tax / after tax dibuat sebagai basis laporan margin Sales Document. Nilai laba kotor tetap harus memakai pendapatan sebelum pajak karena pajak bukan keuntungan toko. Detail dokumen SQ, SO, SD, dan SI tidak boleh menampilkan HPP, gross profit, atau margin karena detail itu adalah dokumen operasional/customer-facing, bukan laporan profit.

## Prinsip Implementasi

- Jangan mengubah nilai invoice yang sudah dihitung oleh `calculateDocumentTotal()`.
- Jangan mengubah flow POS checkout.
- Jangan memakai `transactions` dan `transactionItems` untuk Sales Document.
- Jangan memasukkan pajak sebagai laba toko.
- Jangan tampilkan HPP, gross profit, atau margin di detail dokumen SQ, SO, SD, atau SI.
- `grossProfit` tetap dihitung dari revenue sebelum pajak dikurangi HPP.
- Setting hanya menentukan denominator margin, bukan mengubah laba rupiah.
- Gunakan util bersama agar report dan service tidak punya rumus berbeda.
- Jika setting disimpan permanen, pastikan ikut backup/restore.
- Jika setting hanya untuk preferensi tampilan, boleh mulai dari `localStorage`, tetapi tetap bungkus lewat hook/helper typed agar mudah dipindah ke Dexie.

## Definisi Bisnis

Tambahkan tipe basis margin:

```ts
export type SalesDocumentMarginBasis = 'BEFORE_TAX' | 'AFTER_TAX';
```

Makna tiap pilihan:

- `BEFORE_TAX`: margin dihitung terhadap pendapatan bersih sebelum pajak. Ini default yang paling akurat untuk melihat performa penjualan.
- `AFTER_TAX`: margin dihitung terhadap total invoice yang dibayar customer. Ini berguna jika user ingin membandingkan keuntungan terhadap nominal tagihan final.

Rumus standar:

```ts
const hpp = purchasePrice * quantity;
const revenueBeforeTax = taxBaseAmount ?? subtotal ?? 0;
const revenueAfterTax = totalAmount ?? revenueBeforeTax;
const grossProfit = revenueBeforeTax - hpp;
const marginBase = basis === 'AFTER_TAX' ? revenueAfterTax : revenueBeforeTax;
const marginPercent = marginBase > 0 ? (grossProfit / marginBase) * 100 : 0;
```

Catatan penting:

- `grossProfit` tidak ikut berubah saat basis diganti.
- Yang berubah hanya persentase margin.
- Untuk tax inclusive, `tax_base_amount` adalah basis paling aman karena sudah dipisahkan dari pajak oleh kalkulasi dokumen.

## Struktur File Yang Disarankan

Tambahkan file baru:

```txt
src/utils/salesDocuments/calculateSalesDocumentMargin.ts
src/hooks/useSalesDocumentMarginSettings.tsx
```

Jika setting dibuat permanen di Dexie, tambahkan juga:

```txt
src/services/appSettingsService.ts
```

Update file existing:

- `src/types/index.ts`: tambah tipe `SalesDocumentMarginBasis`.
- `src/view/finance/sales/SalesDocumentDetail.tsx`: pastikan tidak ada HPP, gross profit, atau margin di detail dokumen.
- `src/hooks/useSalesDocumentReports.tsx`: tambah query/report khusus Sales Document.
- `src/view/finance/sales/*Report*.tsx` atau route report terkait: tampilkan ringkasan dan breakdown margin Sales Document di area laporan.
- `src/hooks/useReports.tsx`: jangan dicampur ke report POS tanpa keputusan eksplisit.
- `src/services/profitService.ts`: jika profit Sales Invoice mau masuk `profitBalance`, perluas replay agar membaca `salesDocuments` dan `salesDocumentItems`.
- `src/routes/settings.lazy.tsx`: tambah pilihan basis margin di halaman Settings.
- `src/i18n/messages.ts` atau file i18n terkait: tambah label setting dan label report margin.
- `src/utils/backupRestore.ts`: update hanya jika setting disimpan di Dexie.
- `src/lib/db.ts`: update hanya jika menambah table setting Dexie.

## Fase 1 - Util Kalkulasi Margin

1. Buat `src/utils/salesDocuments/calculateSalesDocumentMargin.ts`.
2. Isi util dengan fungsi murni yang menerima `SalesDocumentItem[]` dan `SalesDocumentMarginBasis`.
3. Jangan akses Dexie di util ini.
4. Return nilai berikut:
   - `totalRevenueBeforeTax`
   - `totalRevenueAfterTax`
   - `totalCost`
   - `grossProfit`
   - `marginPercent`
   - `items` berisi margin per line item
5. Pastikan fungsi menerima item yang sudah dihitung oleh `calculateDocumentTotal()`.
6. Gunakan fallback defensif untuk data lama:
   - `tax_base_amount ?? subtotal ?? 0`
   - `total_amount ?? tax_base_amount ?? subtotal ?? 0`
   - `purchase_price ?? 0`

Contoh shape util:

```ts
export interface SalesDocumentMarginItemResult {
  item_id: string;
  revenue_before_tax: number;
  revenue_after_tax: number;
  cost_amount: number;
  gross_profit: number;
  margin_percent: number;
}

export interface SalesDocumentMarginSummary {
  total_revenue_before_tax: number;
  total_revenue_after_tax: number;
  total_cost: number;
  gross_profit: number;
  margin_percent: number;
  items: SalesDocumentMarginItemResult[];
}
```

## Fase 2 - Setting Basis Margin

1. Buat default setting:

```ts
export const DEFAULT_SALES_DOCUMENT_MARGIN_BASIS: SalesDocumentMarginBasis = 'BEFORE_TAX';
```

2. Untuk implementasi awal yang ringan, simpan preferensi di `localStorage` lewat hook:

```txt
src/hooks/useSalesDocumentMarginSettings.tsx
```

3. Hook harus expose:
   - `marginBasis`
   - `setMarginBasis`
   - `isBeforeTax`
   - `isAfterTax`

4. Jangan baca/tulis `localStorage` langsung dari komponen report. Semua akses lewat hook.
5. Jika nanti setting harus ikut backup/restore, pindahkan storage ke Dexie table `appSettings`.

Rekomendasi default: mulai dari `localStorage` dulu karena pilihan ini hanya mempengaruhi tampilan persentase. Jangan tambah migrasi Dexie hanya untuk preferensi UI kecuali user memang butuh setting ikut backup/restore.

## Fase 3 - UI Settings

1. Update `src/routes/settings.lazy.tsx`.
2. Tambahkan section baru di halaman Settings untuk Sales Document.
3. Gunakan `Segmented` atau `Radio.Group` dari Ant Design.
4. Label pilihan:
   - `Sebelum pajak`
   - `Setelah pajak`
5. Tambahkan helper text singkat:
   - `Sebelum pajak`: margin dibanding nilai penjualan bersih.
   - `Setelah pajak`: margin dibanding total invoice.
6. Jangan membuat halaman settings baru jika section existing masih cukup.

## Fase 4 - Jaga Detail Sales Document Tetap Bersih

1. Update atau audit `src/view/finance/sales/SalesDocumentDetail.tsx`.
2. Jangan ambil `useSalesDocumentMarginSettings()` di detail dokumen.
3. Jangan hitung `calculateSalesDocumentMargin()` di detail dokumen.
4. Jangan tampilkan kolom atau card berikut di detail SQ, SO, SD, atau SI:
   - HPP
   - Gross Profit
   - Margin %
   - Ringkasan Margin
5. Detail dokumen hanya menampilkan informasi dokumen: customer, tanggal, status, item, qty, harga jual, diskon, pajak, total, pembayaran, catatan, dan status dokumen.
6. Jika nanti ada tombol cetak/export dokumen, pastikan HPP, gross profit, dan margin juga tidak ikut masuk ke output dokumen.

## Fase 5 - Report Sales Document

1. Margin Sales Document ditampilkan di area laporan, bukan di detail dokumen.
2. Jangan campur langsung ke `useSalesReport()` POS tanpa keputusan eksplisit, karena report POS saat ini membaca `transactions` dan `transactionItems`.
3. Buat helper/query khusus untuk Sales Document terlebih dahulu, misalnya:

```txt
src/hooks/useSalesDocumentReports.tsx
```

4. Query membaca:
   - `db.salesDocuments`
   - `db.salesDocumentItems`
5. Filter hanya dokumen yang relevan:
   - `type === 'SALES_INVOICE'`
   - `status === 'ISSUED'`
   - exclude `VOIDED`
6. Tentukan kapan invoice dihitung di report:
   - basis accrual: saat invoice issued.
   - basis cash: saat invoice paid/partial paid.
7. Untuk fase awal, pakai basis accrual untuk margin operasional, dan tetap biarkan cash flow mengikuti pembayaran invoice.
8. Ambil `marginBasis` dari `useSalesDocumentMarginSettings()` di layar/hook report.
9. Return summary:
   - total invoice before tax
   - total invoice after tax
   - total HPP
   - gross profit
   - margin percent
   - breakdown per customer/project/department jika dibutuhkan.
10. Pastikan data sensitif profit mengikuti guard permission yang sudah berlaku untuk akses profit jika fitur permission sudah aktif.

## Fase 6 - Profit Balance dan Recalculate Profit

Fase ini hanya perlu jika margin Sales Invoice mau mempengaruhi `profitBalance`, bukan hanya tampil di report.

1. Update `src/services/profitService.ts`.
2. Perluas `recalculateProfit()` supaya membaca Sales Invoice dari `salesDocuments`.
3. Jangan menghitung finance transaction `SALES_INVOICE_PAYMENT` sebagai profit penuh.
4. Gunakan `salesDocumentItems.purchase_price` dan revenue before tax untuk menghitung profit invoice.
5. Buat event replay baru, misalnya `SALES_INVOICE`.
6. Hindari double count jika invoice berasal dari convert Sales Order atau Sales Delivery.
7. Untuk void invoice, buat reversal seperti pola void POS.
8. Untuk partial payment, tentukan policy:
   - accrual profit penuh saat invoice issued, atau
   - proportional profit sesuai pembayaran.

Rekomendasi awal: gunakan accrual untuk report margin, tetapi jangan langsung masukkan ke withdrawable `profitBalance` sebelum policy pembayaran diputuskan. Ini mencegah profit yang belum diterima cash menjadi saldo yang bisa ditarik.

## Fase 7 - I18n dan Permission

1. Tambah key i18n untuk:
   - basis margin
   - sebelum pajak
   - setelah pajak
   - total HPP
   - gross profit
   - margin
2. Pastikan istilah konsisten:
   - HPP untuk cost.
   - Gross Profit untuk laba kotor.
   - Margin untuk persentase.
3. Jika permission profit sudah aktif, sembunyikan nilai HPP, gross profit, dan margin dari role yang tidak boleh melihat profit.
4. Jangan hanya menyembunyikan UI table; pastikan export report juga mengikuti guard yang sama.

## Fase 8 - Backup Restore Jika Setting Dexie Dipakai

Lewati fase ini jika setting masih memakai `localStorage`.

1. Tambah table `appSettings` di `src/lib/db.ts` memakai versi Dexie berikutnya.
2. Tambah type `AppSetting` di `src/types/index.ts`.
3. Tambah service `src/services/appSettingsService.ts`.
4. Update `src/utils/backupRestore.ts`:
   - export `appSettings`
   - restore `appSettings`
   - clear table saat restore
5. Pastikan migrasi tidak mengubah table bisnis existing.

## Fase 9 - Validasi

Jalankan validasi bertahap:

```bash
bun run build
git diff --check
```

Jika lint dipakai:

```bash
bun run lint
```

Catatan: jika lint gagal karena issue existing yang tidak terkait, catat file dan rule-nya di hasil implementasi.

Skenario manual minimal:

1. Buat Sales Invoice dengan tax exclusive.
2. Cek margin before tax di laporan Sales/Sales Document.
3. Ganti setting ke after tax.
4. Pastikan gross profit rupiah tetap sama.
5. Pastikan margin percent di laporan berubah sesuai denominator.
6. Buat Sales Invoice tax inclusive.
7. Pastikan before tax memakai `tax_base_amount`.
8. Void invoice dan pastikan tidak tampil sebagai invoice aktif di report.
9. Catat pembayaran invoice dan pastikan cash flow bertambah, tetapi profit tidak double count.

## Acceptance Criteria

- User bisa memilih basis margin Sales Document: sebelum pajak atau setelah pajak.
- Pilihan basis margin tidak mengubah total invoice.
- Gross profit rupiah tetap memakai revenue sebelum pajak.
- Margin percent berubah sesuai setting.
- Detail SQ, SO, SD, dan SI tidak menampilkan HPP, gross profit, margin per item, atau ringkasan margin.
- Sales Document report/laporan Sales bisa membaca data dari `salesDocuments` dan `salesDocumentItems`.
- Sales Document report/laporan Sales menampilkan total HPP, gross profit, dan margin percent dengan benar.
- POS checkout dan report POS tidak berubah.
- Cash flow invoice tetap mengikuti pembayaran invoice.
- Profit invoice tidak dihitung penuh dari finance income pembayaran invoice.
- Build berhasil.

## Urutan Implementasi Yang Disarankan

1. Tambah tipe `SalesDocumentMarginBasis`.
2. Tambah util `calculateSalesDocumentMargin()`.
3. Tambah hook setting margin dengan default `BEFORE_TAX`.
4. Tambah pilihan basis margin di Settings.
5. Pastikan `SalesDocumentDetail` bersih dari HPP, gross profit, dan margin.
6. Tambah report/query Sales Document khusus.
7. Baru setelah policy profit disepakati, integrasikan ke `profitService.recalculateProfit()`.

Dengan urutan ini, fitur margin masuk ke laporan Sales/Sales Document tanpa mengubah detail dokumen operasional, cash flow, POS checkout, atau withdrawable profit.
