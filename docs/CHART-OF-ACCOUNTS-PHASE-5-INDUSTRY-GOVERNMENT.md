# Accounting Core - Fase 5 Extension Industri dan Pemerintahan

Fase ini berisi jalur lanjut untuk manufaktur, konstruksi, dan PSAP. Fase ini jangan dikerjakan sebelum target user jelas, karena masing-masing domain bukan sekadar tambahan daftar akun.

## Prinsip

- Manufaktur dan konstruksi adalah industry extension.
- PSAP adalah accounting profile terpisah.
- Jangan aktifkan semua extension untuk semua toko.
- Jangan mencampur istilah dan report pemerintahan ke retail.
- Extension harus memakai feature gate dari Fase 1 berdasarkan `accountingProfileSetting` dan `enabledModules`.

## Manufaktur

Kombinasi yang masuk akal:

```txt
SAK_EP + MANUFACTURING
PSAK_FULL + MANUFACTURING
```

Tambahan akun:

```txt
Persediaan Bahan Baku
Persediaan Barang Dalam Proses / WIP
Persediaan Barang Jadi
Overhead Pabrik
Tenaga Kerja Langsung
Beban Produksi Tidak Langsung
Selisih Biaya Produksi
HPP Produk Jadi
```

Fitur domain yang dibutuhkan:

- Bill of Materials / BOM.
- Production order.
- Material issue.
- Labor cost allocation.
- Factory overhead allocation.
- Finished goods receipt.
- Inventory costing policy.
- WIP movement.

Posting contoh:

```txt
Material ke produksi:
Dr WIP
  Cr Persediaan Bahan Baku

Overhead dialokasi:
Dr WIP
  Cr Overhead Pabrik

Produk selesai:
Dr Persediaan Barang Jadi
  Cr WIP

Produk terjual:
Dr HPP Produk Jadi
  Cr Persediaan Barang Jadi
```

Jangan membuat akun manufaktur tanpa rencana domain minimal. Kalau hanya daftar akun, user akan mengira sistem sudah menghitung produksi padahal belum.

## Konstruksi

Kombinasi yang masuk akal:

```txt
PSAK_FULL + CONSTRUCTION
SAK_EP + CONSTRUCTION
```

Tambahan akun:

```txt
Aset Kontrak
Liabilitas Kontrak
Piutang Retensi
Hutang Retensi
Uang Muka Proyek
Pendapatan Kontrak
Beban Material Proyek
Beban Tenaga Kerja Proyek
Beban Subkontraktor
Beban Overhead Proyek
```

Fitur domain yang dibutuhkan:

- Contract master.
- Project phase/progress.
- Progress billing.
- Retention/retensi.
- Subcontractor billing.
- Cost to complete.
- Revenue recognition rule.
- Project margin report.

Catatan standar:

- Untuk implementasi baru, arahkan revenue contract ke model PSAK 72.
- Jangan membangun desain baru dengan asumsi PSAK 34/44 sebagai fondasi utama.
- Akun retensi dan kontrak tidak cukup. Sistem harus tahu progress dan kewajiban pelaksanaan.

Posting contoh sederhana:

```txt
Progress billing:
Dr Piutang Usaha / Piutang Retensi
  Cr Pendapatan Kontrak / Liabilitas Kontrak

Biaya proyek:
Dr Beban Material Proyek / WIP Proyek
  Cr Kas/Bank / Hutang Usaha
```

Detail posting sangat bergantung policy revenue recognition. Jangan hard-code terlalu awal.

## PSAP

Profile:

```txt
PSAP + NONE
```

PSAP adalah jalur berbeda dari bisnis retail. Tidak ada konsep profit/loss seperti toko biasa.

Karakter yang perlu disiapkan:

- Basis akrual pemerintahan.
- Struktur akun anggaran dan realisasi.
- Pendapatan-LO dan Pendapatan-LRA bisa berbeda.
- Belanja, beban, pembiayaan, dan ekuitas dana perlu treatment khusus.
- Report berbeda dari laporan bisnis.

Report yang mungkin dibutuhkan:

- Laporan Realisasi Anggaran.
- Laporan Operasional.
- Neraca.
- Laporan Perubahan Ekuitas.
- Laporan Arus Kas jika scope entitas membutuhkan.
- Catatan atas laporan keuangan.

Konsekuensi produk:

- UX retail Frayukti tidak cocok langsung untuk PSAP.
- Modul POS, Sales Invoice, dan Profit Report tidak boleh dipaksa menjadi report PSAP.
- Kalau PSAP benar-benar ditargetkan, lebih aman buat mode/profile khusus, bukan sekadar template COA.

## Feature Gate

Feature gate dasar sudah dibuat di Fase 1. Fase ini hanya menambah rule dan module domain yang lebih spesifik.

```ts
accountingProfileSetting.accounting_profile:
  'SAK_EMKM' | 'SAK_EP' | 'PSAK_FULL' | 'PSAP';

accountingProfileSetting.industry_extension:
  'NONE' | 'RETAIL' | 'MANUFACTURING' | 'CONSTRUCTION';

enabledModules:
  MANUFACTURING
  CONSTRUCTION
  PSAP_REPORTING
```

Aturan gate:

- `MANUFACTURING` hanya menampilkan menu produksi jika extension aktif.
- `CONSTRUCTION` hanya menampilkan menu kontrak/proyek konstruksi jika extension aktif.
- `PSAP` menonaktifkan label profit/loss retail dari area accounting.
- Retail default tetap sederhana.
- Module domain tidak boleh aktif hanya karena template akun extension dipilih.

## Acceptance Criteria

- Extension tidak aktif untuk toko retail default.
- Template akun extension bisa dipreview sebelum apply.
- Manufaktur tidak diklaim lengkap tanpa production order dan costing.
- Konstruksi tidak diklaim lengkap tanpa contract/progress/retention flow.
- PSAP tidak memakai label laba/rugi retail.
- General ledger atau minimal posting foundation sudah jelas sebelum extension membuat report akuntansi.

## Validasi Teknis

Minimal:

```txt
bun run build
bun run lint
```