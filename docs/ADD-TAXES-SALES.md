# ADD TAXES SALES - Kebutuhan Upgrade dan Langkah Implementasi

Dokumen ini menyiapkan kebutuhan upgrade pajak untuk modul Sales Document agar pajak tersimpan dan terhitung di level line item, tetap aman terhadap histori, dan tetap mengikuti standar arsitektur project Kasirku.

## Ringkasan Kondisi Saat Ini

Hasil audit kode saat ini:
- Pajak dipilih di header dokumen (`tax_id`) melalui `DocumentHeader` dan `SalesDocumentForm`.
- Kalkulasi pajak saat ini masih document-level di `calculateDocumentTotal.ts`.
- `SalesDocumentItem` memang punya `tax_amount`, tetapi belum diisi dari kalkulasi line item.
- `DocumentLineItems.tsx` belum menampilkan field pajak per baris.
- Service `salesDocumentService.ts` sudah menyimpan snapshot tax di dokumen (`tax_name`, `tax_rate`, `tax_calculation_mode`), tetapi belum line-level snapshot.

Implikasi:
- Total pajak dokumen sudah ada.
- Breakdown pajak per produk/baris belum ada.
- Kebutuhan audit/report per item pajak belum terpenuhi.

## Tujuan Upgrade

Target upgrade:
- Pajak tersimpan di setiap line item sales.
- Perhitungan pajak per baris konsisten untuk mode `EXCLUSIVE` dan `INCLUSIVE`.
- Total dokumen tetap dihitung dari agregasi line item.
- Histori dokumen lama tidak berubah ketika master tax diedit.
- Flow bisnis saat ini tetap aman: edit hanya draft, posted tidak bisa diedit data inti.

## Non-Goal Fase Ini

Hal di bawah ini tidak masuk fase upgrade awal:
- Integrasi e-Faktur.
- Multi-tax kompleks per line (stacked tax).
- Withholding tax.
- Otomasi pembentukan jurnal GL.
- Rework flow payment/void yang sudah stabil saat ini.

## Standar Implementasi Project (Wajib Diikuti)

- Routing tetap di `src/routes`, page utama di `src/view`.
- Business rule mutasi dan side effect hanya di service layer (`src/services`), bukan komponen.
- Kalkulasi tetap pure di `src/utils/salesDocuments`.
- Form layer tetap `RHF core + AntD UI` seperti implementasi terbaru.
- Jangan ubah `routeTree.gen.ts` manual.
- Jangan mengubah flow status dokumen yang sudah disepakati:
  - `DRAFT`: editable.
  - `ISSUED`: read-only data inti, bisa aksi bisnis khusus (convert/void/payment sesuai rule).
  - `VOIDED/CONVERTED`: read-only.

## Kebutuhan Data Model

### 1. Perluasan `SalesDocumentItem`

Tambahkan field snapshot tax per line item di `src/types/index.ts`:

```ts
tax_id?: string;
tax_name?: string;
tax_code?: string;
tax_rate?: number;
tax_calculation_mode?: TaxCalculationMode;
tax_base_amount?: number;
tax_amount?: number;
total_amount?: number;
```

Catatan:
- `tax_base_amount`: dasar pengenaan pajak per baris setelah diskon.
- `tax_amount`: nilai pajak per baris.
- `total_amount`: subtotal + pajak (untuk exclusive) atau subtotal net (untuk inclusive, sesuai keputusan rumus final).

### 2. Skema Dexie

- Jika tidak butuh index baru, field tambahan item bisa langsung disimpan tanpa version bump.
- Jika butuh query/report by `tax_id` per item, buat versi Dexie berikutnya (`version(18)`) dan tambah index `tax_id` pada `salesDocumentItems`.

Rekomendasi fase awal:
- Tidak perlu index baru dulu.
- Fokus di ketepatan data dan kalkulasi.

## Kebutuhan Kalkulasi

File utama: `src/utils/salesDocuments/calculateDocumentTotal.ts`.

### Aturan Rumus

Untuk dokumen `hasPricing=true`:

1. Hitung subtotal line:
- `line_subtotal = qty * price - line_discount`
- Normalisasi minimum `0`.

2. Terapkan diskon dokumen:
- Jika ada `discount_amount` dokumen, distribusikan prorata ke line berdasarkan porsi subtotal line.
- Simpan hasil distribusi sebagai `line_discount_allocated`.

3. Hitung base pajak line:
- `line_tax_base = max(0, line_subtotal - line_discount_allocated)`

4. Hitung pajak line:
- `EXCLUSIVE`: `line_tax = line_tax_base * rate / 100`
- `INCLUSIVE`: `line_tax = line_tax_base - line_tax_base / (1 + rate / 100)`

5. Agregasi ke dokumen:
- `subtotal_amount = sum(line_subtotal)`
- `discount_amount = input discount doc`
- `tax_amount = sum(line_tax)`
- `total_amount = subtotal - discount + tax` (exclusive)
- `total_amount = subtotal - discount` (inclusive)

### Rounding

- Tetap gunakan pembulatan dua desimal seperti helper `roundCurrency` saat ini.
- Untuk distribusi diskon prorata, lakukan penyesuaian sisa pembulatan di line terakhir agar total diskon konsisten.

## Kebutuhan UI

### `DocumentLineItems.tsx`

Tambahkan tampilan line tax:
- Kolom `Pajak (%)` read-only mengikuti tax dokumen pada fase awal.
- Kolom `Pajak` (`tax_amount`) read-only hasil kalkulasi.
- Gunakan mode expandable per row untuk field advanced (`harga`, `diskon`, dan line-tax field) agar table utama tidak berdesakan.
- Opsional fase lanjutan: enable override tax per baris.

### `DocumentSummary.tsx`

- Pastikan nilai pajak summary berasal dari agregasi line tax, bukan hitung tunggal document-level lama.
- Tetap tampil vertikal kanan seperti layout terbaru.

### `SalesDocumentDetail.tsx`

- Table detail line item perlu tampilkan `tax_amount` jika dokumen `hasPricing=true`.
- Summary detail tetap menampilkan total pajak dokumen.

## Kebutuhan Service Layer

File utama: `src/services/salesDocumentService.ts`.

Penyesuaian:
- `normalizeDocumentItems` perlu menerima field tax snapshot line item.
- `createSalesDocument`, `updateSalesDocument`, `convertSalesDocument` harus menyimpan hasil kalkulasi item yang sudah mengandung line tax.
- Validasi tetap di `validateSalesDocument.ts`.

Tambahan validasi yang disarankan:
- Jika dokumen punya `tax_id`, line item harus terisi `tax_rate` dan `tax_amount` hasil kalkulasi.
- `tax_amount` tidak boleh negatif.

## Langkah Implementasi Bertahap

### Fase 0 - Baseline Aman

1. Buat branch fitur.
2. Catat baseline behavior dengan uji manual singkat:
   - Buat draft SQ/SO/SI.
   - Cek total saat pajak exclusive vs inclusive.
3. Simpan snapshot hasil baseline untuk pembanding.

### Fase 1 - Model dan Kalkulasi

1. Update tipe `SalesDocumentItem` di `src/types/index.ts`.
2. Refactor `calculateDocumentTotal.ts` untuk hasil line-level tax.
3. Pastikan fungsi tetap pure dan backward-compatible.

### Fase 2 - Integrasi Form dan Service

1. Integrasikan hasil line tax ke `SalesDocumentForm.tsx` + `DocumentLineItems.tsx`.
2. Pastikan payload submit tetap `document + items`.
3. Update `salesDocumentService.ts` untuk persist field tax line.

### Fase 3 - Detail dan Konsistensi Tampilan

1. Update `SalesDocumentDetail.tsx` untuk menampilkan tax per line.
2. Sinkronkan summary agar source of truth dari item hasil kalkulasi.

### Fase 4 - Validasi dan Hardening

1. Update `validateSalesDocument.ts` sesuai rule baru.
2. Uji status workflow:
   - Draft editable.
   - Issued tidak bisa edit data inti.
   - Converted/Voided read-only.

### Fase 5 - Verifikasi

1. Jalankan `bun run build`.
2. Uji manual minimum:
   - SQ, SO, SI dengan tax exclusive.
   - SQ, SO, SI dengan tax inclusive.
   - Multi-item dengan diskon line + diskon dokumen.
   - Convert SQ -> SO -> SI, cek tax line tetap konsisten.
   - Void delivery posted, cek stok balik normal.

## Test Matrix Minimum

- 1 item, tanpa diskon, tax exclusive.
- 1 item, tanpa diskon, tax inclusive.
- Multi-item, diskon line berbeda.
- Multi-item + diskon dokumen.
- Nilai kecil yang rentan rounding.
- Dokumen lama (sebelum upgrade) masih bisa dibuka tanpa crash.

## Acceptance Criteria

Upgrade dianggap selesai jika:
- Pajak per line item tersimpan dan tampil.
- Total dokumen cocok dengan agregasi line item.
- Tidak ada perubahan liar pada histori dokumen lama.
- Flow status dokumen tetap sesuai rule bisnis saat ini.
- Build hijau (`bun run build`) dan uji manual utama lolos.

## Risiko dan Mitigasi

- Risiko mismatch rounding antar line dan summary:
  - Mitigasi: distribusi diskon prorata + residual adjustment di line terakhir.
- Risiko regressi convert dokumen:
  - Mitigasi: uji chain SQ -> SO -> SI sebagai test wajib.
- Risiko dokumen lama tanpa field tax line:
  - Mitigasi: fallback default `0` dan render defensif di detail/form.
