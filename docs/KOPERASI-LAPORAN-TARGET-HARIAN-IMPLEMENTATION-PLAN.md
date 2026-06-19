# Rencana Implementasi Laporan Target Harian Koperasi

Dokumen ini menjadi acuan implementasi fitur:

```txt
/koperasi/laporan-target-harian
```

Fitur berupa laporan operasional bulanan yang menampilkan target, realisasi storting, drop, tabungan keluar, dan tunai per hari. Data dikelompokkan berdasarkan karyawan/petugas koperasi.

Dokumen ini hanya berisi rencana. Implementasi kode dilakukan setelah rencana disetujui.

## 1. Keputusan Bisnis yang Sudah Dikunci

Keputusan berikut berasal dari konfirmasi user dan tidak perlu ditanyakan ulang saat implementasi:

1. `L` berarti Anggota Lama.
2. `B` berarti Anggota Baru.
3. `K` berarti Anggota Keluar karena pinjamannya lunas.
4. Target Lama adalah total angsuran terjadwal anggota aktif pada awal posisi harian, terdiri dari pokok dan jasa/bunga.
5. Angsuran Masuk berasal dari nilai angsuran kontraktual pinjaman yang dicairkan.
6. Angsuran Keluar berasal dari nilai angsuran kontraktual pinjaman yang lunas.
7. Target Baru dihitung dengan rumus:

```txt
Target Baru = Target Lama + Angsuran Masuk - Angsuran Keluar
```

8. Persentase dihitung dengan rumus:

```txt
Persentase = Storting / Target Lama * 100
```

9. Storting mencakup pembayaran tunai dan non-tunai.
10. Laporan dikelompokkan berdasarkan karyawan.
11. Export mengikuti laporan koperasi existing:
    - PDF
    - HTML
    - CSV
12. Tidak perlu menambahkan export Excel/XLSX.
13. Header laporan mengikuti standar laporan HTML/CSS existing.
14. Header dan tabel tidak memakai warna kuning/oranye dari screenshot.
15. Tampilan laporan menggunakan warna putih, hitam, dan abu-abu netral agar aman untuk cetak.

## 2. Tujuan Fitur

Laporan harus membantu manager melihat untuk setiap karyawan:

- Perubahan jumlah anggota aktif.
- Perubahan target angsuran per hari penagihan.
- Realisasi pembayaran angsuran.
- Persentase pencapaian target.
- Drop pinjaman harian dan kumulatif.
- Storting harian dan kumulatif.
- Penarikan tabungan anggota.
- Nilai tunai operasional berdasarkan rumus laporan.
- Subtotal mingguan.
- Total bulanan.

Laporan bersifat read-only dan seluruh nilainya diturunkan dari transaksi koperasi existing. Fitur ini tidak membuat entity transaksi atau tabel database baru.

## 3. Struktur Tampilan

### 3.1. Filter halaman

Halaman management menyediakan:

- Filter bulan laporan.
- Filter karyawan.
- Pilihan `Semua Karyawan`.
- Pilihan `Belum Ada Karyawan` untuk data lama yang belum mempunyai assignment.
- Tombol refresh.
- Tombol export PDF, HTML, dan CSV.

Default filter:

```txt
Bulan     = bulan berjalan
Karyawan  = semua karyawan
```

### 3.2. Grouping utama

Grouping utama adalah satu section per karyawan:

```txt
Karyawan / Resort
├── Minggu 1
│   ├── Baris harian
│   └── JUMLAH minggu
├── Minggu 2
│   ├── Baris harian
│   └── JUMLAH minggu
└── TOTAL karyawan
```

Jika filter memilih satu karyawan, laporan hanya menampilkan section karyawan tersebut.

Jika filter memilih semua karyawan, setiap karyawan mempunyai section, subtotal mingguan, dan total masing-masing. Pada akhir report dapat ditampilkan Grand Total seluruh karyawan.

### 3.3. Pembagian minggu

Pembagian minggu mengikuti pola laporan koperasi existing:

```txt
Senin sampai Minggu
```

Minggu pertama dan terakhir dipotong sesuai batas bulan laporan.

Contoh:

```txt
Minggu 1: tanggal 1 sampai Minggu pertama
Minggu terakhir: Senin terakhir sampai akhir bulan
```

### 3.4. Header laporan

Header memakai standar report existing:

- Logo perusahaan.
- Nama perusahaan/koperasi.
- Label `Laporan Koperasi`.
- Judul `LAPORAN TARGET HARIAN`.
- Bulan dan tahun laporan.
- Nama karyawan/resort jika filter memilih satu karyawan.
- Tanggal dan waktu cetak.

Untuk setiap section karyawan tampilkan:

- Nama karyawan.
- Jabatan.
- Area/resort yang menjadi tanggung jawab.

Aturan visual:

- Background putih.
- Teks hitam atau abu-abu gelap.
- Border abu-abu.
- Header tabel abu-abu sangat muda.
- Tidak menggunakan warna kuning, oranye, hijau, atau warna dekoratif screenshot.
- Tetap terbaca ketika dicetak grayscale.

### 3.5. Kolom tabel

Urutan kolom mengikuti makna screenshot:

| Grup | Kolom |
| --- | --- |
| Hari | Hari dan tanggal |
| Anggota | L |
| Anggota | B |
| Anggota | K |
| Anggota | JML |
| Target | Target Lama |
| Angsuran | Masuk |
| Angsuran | Keluar |
| Target | Target Baru |
| Realisasi | Storting |
| Realisasi | % |
| Drop | 10% |
| Drop | Lalu |
| Drop | Kini |
| Drop | Berjalan |
| Realisasi | Storting Berjalan |
| Tabungan | Tab Keluar |
| Kas | Tunai |

Kolom Hari harus tetap membedakan tanggal yang mempunyai nama hari sama. Rekomendasi tampilan satu cell:

```txt
KAMIS
03.04.2025
```

## 4. Interpretasi Baris Harian

### 4.1. Rantai target dipisahkan per hari penagihan

Dalam satu karyawan, target untuk hari penagihan yang berbeda tidak boleh dicampur.

Contoh:

```txt
Karyawan A
├── Track Senin
│   ├── Senin pertama
│   ├── Senin kedua
│   └── Senin ketiga
└── Track Kamis
    ├── Kamis pertama
    ├── Kamis kedua
    └── Kamis ketiga
```

Target Baru pada Senin pertama menjadi Target Lama pada Senin berikutnya.

Target Baru pada Kamis pertama menjadi Target Lama pada Kamis berikutnya.

Target Senin tidak diteruskan ke Kamis, dan target Kamis tidak diteruskan ke Senin.

Pola ini menjelaskan angka pada screenshot dan wajib dipertahankan.

### 4.2. Nilai yang kumulatif per karyawan

Kolom berikut bersifat kumulatif berdasarkan urutan tanggal untuk seluruh karyawan, tidak dipisahkan berdasarkan hari penagihan:

- Drop Lalu.
- Drop Berjalan.
- Storting Berjalan.

Contoh:

```txt
Senin  : Drop Kini 1.000.000, Drop Berjalan 1.000.000
Kamis  : Drop Kini   500.000, Drop Berjalan 1.500.000
Senin  : Drop Kini         0, Drop Berjalan 1.500.000
```

## 5. Definisi dan Rumus Setiap Kolom

### 5.1. L — Anggota Lama

`L` adalah jumlah anggota lama yang berada dalam portofolio aktif untuk karyawan dan track hari penagihan tersebut.

Aturan:

- Posisi awal dibawa dari anggota aktif sebelum tanggal baris.
- Anggota yang sudah pernah mempunyai pinjaman bukan Anggota Baru.
- Jika anggota lama kembali mengambil pinjaman setelah tidak aktif, anggota tersebut tetap diklasifikasikan sebagai `L`, bukan `B`.
- Pencairan ulang yang menggantikan pinjaman lama pada hari yang sama tidak boleh menggandakan jumlah anggota aktif.

### 5.2. B — Anggota Baru

`B` adalah jumlah anggota yang pinjaman pertamanya dicairkan pada tanggal baris.

Penentuan pinjaman pertama menggunakan seluruh riwayat pinjaman reportable anggota, bukan hanya pinjaman pada bulan filter.

### 5.3. K — Anggota Keluar

`K` adalah jumlah anggota yang keluar dari portofolio aktif karena pinjaman lunas pada tanggal baris.

Aturan:

- Hanya pelunasan yang benar-benar membuat anggota tidak mempunyai pinjaman aktif pada akhir tanggal yang dihitung sebagai keluar.
- Jika pinjaman lama lunas dan pinjaman pengganti dicairkan pada hari yang sama, anggota tidak dihitung keluar.
- Pelunasan loan tetap dipakai untuk Angsuran Keluar walaupun tidak menurunkan jumlah anggota karena ada pinjaman pengganti.

### 5.4. JML

```txt
JML = L + B - K
```

`JML` menjadi posisi anggota aktif setelah transaksi pada tanggal tersebut.

Posisi ini diteruskan ke occurrence berikutnya untuk karyawan dan track hari penagihan yang sama.

### 5.5. Nilai angsuran kontraktual

Target tidak memakai total saldo pinjaman. Setiap pinjaman menyumbang satu nilai angsuran kontraktual per periode penagihan.

Urutan sumber nilai:

1. Ambil jadwal angsuran dari `cooperativeLoanInstallments`.
2. Gunakan nilai:

```txt
principal_amount + interest_amount
```

3. Penalti tidak masuk target kontraktual.
4. Jika jadwal belum tersedia, fallback:

```txt
total_payable_amount / installment_count
```

5. Jika `installment_count` tidak tersedia, gunakan jumlah jadwal atau tenor sesuai billing configuration.
6. Semua nominal dibulatkan memakai `roundCurrency`.

Implementasi sebaiknya membuat satu helper yang konsisten untuk Target Lama, Angsuran Masuk, dan Angsuran Keluar.

### 5.6. Target Lama

Target Lama adalah total nilai angsuran kontraktual pinjaman yang aktif tepat sebelum transaksi pada tanggal baris, untuk:

- Karyawan yang sedang diproses.
- Track `collection_weekday` yang sedang diproses.

Untuk occurrence pertama dalam bulan:

```txt
Target Lama
= total angsuran kontraktual pinjaman
  yang sudah dicairkan sebelum tanggal occurrence
  dan belum keluar sebelum tanggal occurrence
```

Untuk occurrence berikutnya pada track yang sama:

```txt
Target Lama occurrence sekarang
= Target Baru occurrence sebelumnya
```

### 5.7. Angsuran Masuk

Angsuran Masuk adalah total nilai angsuran kontraktual dari semua pinjaman yang dicairkan pada tanggal baris.

Angsuran Masuk mencakup:

- Pinjaman pertama anggota baru.
- Pinjaman ulang anggota lama.

```txt
Angsuran Masuk
= sum(nilai angsuran kontraktual loan yang disbursed hari ini)
```

### 5.8. Angsuran Keluar

Angsuran Keluar adalah total nilai angsuran kontraktual dari pinjaman yang lunas pada tanggal baris.

```txt
Angsuran Keluar
= sum(nilai angsuran kontraktual loan yang paid off hari ini)
```

### 5.9. Target Baru

```txt
Target Baru
= Target Lama
 + Angsuran Masuk
 - Angsuran Keluar
```

Nilai minimum adalah `0`.

### 5.10. Storting

Storting adalah total pembayaran angsuran posted pada tanggal baris.

Sumber:

```txt
cooperativeLoanPayments.amount
```

Filter:

- `status = POSTED`.
- Bukan `payment_type = REVERSAL`.
- Bukan payment yang mempunyai `reversal_of_payment_id`.
- Payment original yang sudah reversed tidak ikut.
- Pembayaran tunai ikut.
- Pembayaran transfer/non-tunai ikut.

Penalti yang memang dibayar dan sudah termasuk pada `payment.amount` tetap masuk Storting, tetapi tidak menambah Target Lama.

### 5.11. Persentase

```txt
Persentase = Storting / Target Lama * 100
```

Jika Target Lama `0`:

```txt
Persentase = 0%
```

Format tampilan default berupa bilangan bulat seperti screenshot. Perhitungan internal tetap memakai nilai penuh sebelum formatting.

Persentase subtotal atau total harus dihitung ulang sebagai weighted percentage:

```txt
Persentase subtotal
= total Storting subtotal / total Target Lama subtotal * 100
```

Jangan menghitung subtotal dengan rata-rata persentase per baris.

### 5.12. 10%

```txt
10% = Drop Kini * 10%
```

Nilai ini mengikuti rumus bisnis screenshot, bukan mengambil `loan_service_amount` aktual.

### 5.13. Drop Lalu

Drop Lalu adalah total Drop Kini semua baris karyawan sebelum tanggal baris.

```txt
Drop Lalu baris pertama = 0
Drop Lalu baris berikutnya = Drop Berjalan baris sebelumnya
```

### 5.14. Drop Kini

Drop Kini adalah total pokok pinjaman yang dicairkan pada tanggal baris:

```txt
Drop Kini
= sum(cooperativeLoans.principal_amount)
```

Loan harus:

- Berstatus `DISBURSED` atau `PAID_OFF`.
- Mempunyai `disbursed_at`.
- Tanggal `disbursed_at` sama dengan tanggal baris.

### 5.15. Drop Berjalan

```txt
Drop Berjalan = Drop Lalu + Drop Kini
```

Kumulatif dihitung per karyawan selama bulan laporan.

### 5.16. Storting Berjalan

```txt
Storting Berjalan
= Storting Berjalan baris sebelumnya + Storting baris sekarang
```

Kumulatif dihitung per karyawan selama bulan laporan.

### 5.17. Tab Keluar

Tab Keluar adalah total penarikan simpanan posted pada tanggal baris.

Sumber:

```txt
cooperativeSavingTransactions
```

Filter:

- `transaction_type = WITHDRAWAL`.
- `status = POSTED`.
- Reversal tidak ikut.

### 5.18. Tunai

Rumus mengikuti screenshot:

```txt
Tunai
= Storting
 + 10%
 - Drop Kini
 - Tab Keluar
```

Karena Storting mencakup transaksi tunai dan non-tunai, kolom Tunai pada report ini adalah nilai operasional berdasarkan rumus bisnis. Nilai ini bukan saldo fisik kas petugas dan tidak menggantikan laporan Kas Petugas.

Nilai Tunai boleh negatif.

## 6. Penentuan Karyawan dan Hari Penagihan

### 6.1. Karyawan pemilik portofolio

Laporan Target Harian membandingkan target portofolio dengan realisasinya. Karena itu grouping memakai karyawan penanggung jawab/resort, bukan semata-mata user yang menginput transaksi.

Prioritas assignment loan:

1. `cooperativeLoans.officer_id`.
2. `cooperativeMembers.officer_id`.
3. Jika keduanya kosong, masuk group `Belum Ada Karyawan`.

Snapshot nama dan jabatan:

1. Master `employees`.
2. Snapshot pada loan.
3. Snapshot pada member.

### 6.2. Assignment pembayaran

Pembayaran dihubungkan ke pemilik portofolio melalui:

1. Loan dari `payment.loan_id`.
2. Officer snapshot loan.
3. Officer member.
4. `payment.collector_id` hanya menjadi fallback jika loan/member tidak mempunyai officer.

Dengan aturan ini, target dan storting tetap dibandingkan pada karyawan/resort yang sama.

Laporan Storting Harian existing tetap dapat dipakai jika user ingin melihat realisasi berdasarkan collector aktual.

### 6.3. Assignment Tab Keluar

Prioritas:

1. Officer member.
2. Karyawan pemilik `cash_account_id` jika akun tersebut merupakan field cash account.
3. Group `Belum Ada Karyawan`.

### 6.4. Hari penagihan

Prioritas penentuan track:

1. `cooperativeLoans.collection_weekday`.
2. Jadwal koleksi employee/area yang terkait.
3. ISO weekday dari `disbursed_at` sebagai fallback data lama.

Gunakan helper existing di:

```txt
src/utils/koperasi/collectionSchedule.ts
```

## 7. Pembentukan Tanggal Baris

Untuk setiap karyawan:

1. Ambil loan yang aktif pada suatu waktu dalam bulan laporan.
2. Kelompokkan loan berdasarkan `collection_weekday`.
3. Bangun seluruh occurrence tanggal hari tersebut dalam bulan menggunakan `getCollectionDatesInMonth`.
4. Tambahkan tanggal aktual transaksi jika ada payment, drop, pelunasan, atau tab keluar di luar occurrence normal.
5. Urutkan semua tanggal secara ascending.
6. Proses target secara terpisah untuk setiap track hari penagihan.
7. Proses nilai kumulatif Drop dan Storting berdasarkan urutan tanggal seluruh karyawan.

Baris dengan target aktif tetap ditampilkan walaupun tidak ada transaksi pada hari tersebut. Ini diperlukan agar perubahan target dan pencapaian mingguan tetap dapat dipantau.

Baris tanpa target dan tanpa aktivitas tidak perlu ditampilkan.

## 8. Penentuan Tanggal Pelunasan

Status `PAID_OFF` tidak cukup untuk laporan historis; service membutuhkan tanggal pelunasan.

Prioritas sumber tanggal:

1. Tanggal payment posted terakhir yang menyelesaikan loan.
2. Tanggal `paid_at` installment terakhir.
3. Fallback terakhir hanya untuk data legacy yang tidak lengkap dan harus ditulis jelas di helper.

Jangan memakai tanggal cetak report sebagai tanggal pelunasan.

Service sebaiknya membangun:

```ts
paidOffDateByLoanId: Map<string, string>
```

Logic harus konsisten dengan:

```txt
src/services/cooperativeDailyDropReportService.ts
```

Jika perlu perbaikan fallback untuk data legacy, lakukan dalam helper reusable agar Laporan Drop Harian dan Laporan Target Harian tidak menghasilkan tanggal pelunasan berbeda.

## 9. Bentuk Data Service

File baru:

```txt
src/services/cooperativeDailyTargetReportService.ts
```

### 9.1. Filter

```ts
export interface CooperativeDailyTargetReportFilters {
  monthDate?: string;
  employeeId?: string;
}
```

Constant untuk group tanpa karyawan:

```ts
export const COOPERATIVE_DAILY_TARGET_UNASSIGNED_EMPLOYEE = '__UNASSIGNED__';
```

### 9.2. Row

```ts
export interface CooperativeDailyTargetReportRow {
  id: string;
  date_key: string;
  collection_weekday: CooperativeCollectionWeekday;

  employee_id?: string;
  employee_name?: string;
  employee_position?: string;

  old_member_count: number;
  new_member_count: number;
  exit_member_count: number;
  ending_member_count: number;

  opening_target_amount: number;
  incoming_installment_amount: number;
  outgoing_installment_amount: number;
  ending_target_amount: number;

  storting_amount: number;
  achievement_percentage: number;

  drop_margin_amount: number;
  previous_drop_amount: number;
  current_drop_amount: number;
  running_drop_amount: number;

  running_storting_amount: number;
  saving_withdrawal_amount: number;
  cash_amount: number;
}
```

### 9.3. Summary

```ts
export interface CooperativeDailyTargetReportSummary {
  row_count: number;

  old_member_count: number;
  new_member_count: number;
  exit_member_count: number;
  ending_member_count: number;

  opening_target_amount: number;
  incoming_installment_amount: number;
  outgoing_installment_amount: number;
  ending_target_amount: number;

  storting_amount: number;
  achievement_percentage: number;

  drop_margin_amount: number;
  current_drop_amount: number;
  running_drop_amount: number;

  running_storting_amount: number;
  saving_withdrawal_amount: number;
  cash_amount: number;
}
```

Catatan summary:

- Kolom harian dijumlahkan.
- Persentase dihitung ulang dari total Storting dan total Target Lama.
- Drop Lalu tidak perlu dijumlahkan pada subtotal.
- Drop Berjalan memakai posisi akhir baris terakhir.
- Storting Berjalan memakai posisi akhir baris terakhir.

### 9.4. Week

```ts
export interface CooperativeDailyTargetReportWeek {
  key: string;
  week_index: number;
  start_date_key: string;
  end_date_key: string;
  rows: CooperativeDailyTargetReportRow[];
  summary: CooperativeDailyTargetReportSummary;
}
```

### 9.5. Group karyawan

```ts
export interface CooperativeDailyTargetReportGroup {
  key: string;
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  area_names: string[];
  collection_weekdays: CooperativeCollectionWeekday[];
  rows: CooperativeDailyTargetReportRow[];
  weeks: CooperativeDailyTargetReportWeek[];
  summary: CooperativeDailyTargetReportSummary;
}
```

### 9.6. Report

```ts
export interface CooperativeDailyTargetReport {
  month_key: string;
  start_date: string;
  end_date: string;
  employeeOptions: CooperativeDailyTargetEmployeeOption[];
  rows: CooperativeDailyTargetReportRow[];
  groups: CooperativeDailyTargetReportGroup[];
  summary: CooperativeDailyTargetReportSummary;
}
```

## 10. Langkah Implementasi

### Langkah 1 — Buat service laporan

File baru:

```txt
src/services/cooperativeDailyTargetReportService.ts
```

Pekerjaan:

1. Definisikan filter, row, summary, week, group, dan report.
2. Ambil data secara paralel:
   - `cooperativeLoans`
   - `cooperativeLoanInstallments`
   - `cooperativeLoanPayments`
   - `cooperativeSavingTransactions`
   - `cooperativeMembers`
   - `employees`
   - `employeeAreas`
   - collection schedule jika dibutuhkan fallback
3. Bangun map lookup untuk loan, member, employee, installment, dan payment.
4. Bangun urutan pinjaman per anggota untuk menentukan B atau L.
5. Bangun tanggal pelunasan per loan.
6. Bangun nilai angsuran kontraktual per loan.
7. Bangun employee option.
8. Bangun track `employee_id + collection_weekday`.
9. Bangun tanggal baris setiap track.
10. Hitung posisi anggota dan target secara kronologis.
11. Gabungkan transaksi harian.
12. Hitung running Drop dan Storting per karyawan.
13. Bentuk subtotal minggu.
14. Bentuk total karyawan dan Grand Total.

Service harus pure-read dan tidak menulis ke Dexie.

### Langkah 2 — Buat hook React Query

File baru:

```txt
src/hooks/useCooperativeDailyTargetReport.tsx
```

Query key yang disarankan:

```ts
[
  'cooperativeDailyTargetReport',
  'byEmployeeV1',
  filters.monthDate,
  filters.employeeId,
]
```

### Langkah 3 — Buat komponen report HTML/CSS

File baru:

```txt
src/view/koperasi/reports/CooperativeDailyTargetReport.tsx
```

Tanggung jawab:

1. Render header standar.
2. Render judul dan metadata.
3. Render section per karyawan.
4. Render table header bertingkat.
5. Render baris harian.
6. Render subtotal `JUMLAH` per minggu.
7. Render `TOTAL` per karyawan.
8. Render Grand Total jika report berisi lebih dari satu karyawan.
9. Gunakan inline style agar HTML export tetap konsisten.
10. Gunakan `forwardRef<HTMLDivElement>` untuk export PDF/HTML.

Test id:

```txt
koperasi-daily-target-report
koperasi-daily-target-group-{employeeId}
koperasi-daily-target-week-{employeeId}-{weekIndex}
koperasi-daily-target-row-{employeeId}-{dateKey}-{weekday}
koperasi-daily-target-week-total-{employeeId}-{weekIndex}
koperasi-daily-target-total-{employeeId}
```

Untuk employee kosong gunakan token `UNASSIGNED`.

### Langkah 4 — Buat management page

File baru:

```txt
src/view/koperasi/reports/CooperativeDailyTargetReportManagement.tsx
```

Tanggung jawab:

1. Filter bulan.
2. Filter karyawan.
3. Loading state.
4. Error alert.
5. Empty state.
6. Tombol refresh.
7. Preview report dalam container horizontal scroll.
8. Export CSV.
9. Export HTML.
10. Export PDF landscape.

Gunakan pola dari:

```txt
src/view/koperasi/reports/CooperativeDailyStortingReportManagement.tsx
```

### Langkah 5 — Implementasi export

Gunakan utility existing:

```txt
src/utils/export
```

Format:

#### PDF

```txt
orientation = landscape
page size    = A4
```

Nama file:

```txt
laporan-target-harian-YYYY-MM.pdf
```

#### HTML

Nama file:

```txt
laporan-target-harian-YYYY-MM.html
```

HTML standalone harus mempunyai:

- `<!doctype html>`.
- Meta charset.
- Meta viewport.
- `@page` A4 landscape.
- Background putih saat print.
- Report element hasil `outerHTML`.

#### CSV

Nama file:

```txt
laporan-target-harian-YYYY-MM.csv
```

Urutan CSV:

1. Judul.
2. Periode.
3. Karyawan.
4. Area/resort.
5. Header kolom.
6. Baris harian.
7. Subtotal minggu.
8. Total karyawan.
9. Grand Total jika ada.

### Langkah 6 — Tambah route

File baru:

```txt
src/routes/koperasi/laporan-target-harian.lazy.tsx
```

Route:

```txt
/koperasi/laporan-target-harian
```

Component:

```txt
CooperativeDailyTargetReportManagement
```

`src/routeTree.gen.ts` harus diperbarui melalui generator TanStack Router saat build/dev. Jangan mengedit hasil generated secara manual kecuali workflow repo memang mengharuskannya.

### Langkah 7 — Tambah permission route

File:

```txt
src/auth/routePermissions.ts
```

Tambahkan:

```ts
'/koperasi/laporan-target-harian': 'COOPERATIVE_REPORT_VIEW',
```

Tidak perlu permission baru.

### Langkah 8 — Tambah menu koperasi

File:

```txt
src/routes/koperasi/index.tsx
```

Tambahkan menu:

```txt
Laporan Target Harian
```

Rekomendasi:

- Icon `FileTextOutlined`.
- Warna icon hanya berlaku pada menu aplikasi.
- Warna icon menu tidak dibawa ke dokumen report.

### Langkah 9 — Tambah i18n

File:

```txt
src/i18n/cooperativeMessages.ts
src/i18n/navigationMessages.ts
```

Tambahkan key Indonesia dan English untuk:

- Judul.
- Subtitle.
- Filter bulan.
- Filter karyawan.
- Semua karyawan.
- Hari.
- Anggota Lama.
- Anggota Baru.
- Anggota Keluar.
- Jumlah.
- Target Lama.
- Angsuran Masuk.
- Angsuran Keluar.
- Target Baru.
- Storting.
- Persentase.
- Drop 10%.
- Drop Lalu.
- Drop Kini.
- Drop Berjalan.
- Storting Berjalan.
- Tab Keluar.
- Tunai.
- Empty state.
- Export success/failure.
- Navigation label dan description.

### Langkah 10 — Tambah automated test

File yang disarankan:

```txt
tests/e2e/helpers/koperasiDailyTarget.ts
tests/e2e/koperasi-daily-target-report.spec.ts
```

Gunakan fixture IndexedDB seperti Buku Angsuran agar tanggal, target, dan nominal deterministic.

## 11. Skenario Fixture Utama

Gunakan bulan tetap:

```txt
Juni 2026
```

Juni 2026 mempunyai:

- Senin: 1, 8, 15, 22, 29.
- Kamis: 4, 11, 18, 25.

Buat satu karyawan dengan dua track:

```txt
Petugas Target
├── Senin
└── Kamis
```

Tujuan fixture:

- Membuktikan target Senin diteruskan ke Senin berikutnya.
- Membuktikan target Kamis diteruskan ke Kamis berikutnya.
- Membuktikan Target Senin tidak mengambil Target Baru Kamis.
- Membuktikan Drop Berjalan tetap kumulatif lintas Senin dan Kamis.
- Membuktikan Storting Berjalan tetap kumulatif lintas Senin dan Kamis.

Contoh nilai sederhana:

### Senin, 1 Juni 2026

```txt
L                  = 2
B                  = 1
K                  = 1
JML                = 2
Target Lama        = 200.000
Angsuran Masuk     = 50.000
Angsuran Keluar    = 70.000
Target Baru        = 180.000
Storting           = 180.000
Persentase         = 90%
Drop Kini          = 100.000
10%                = 10.000
Drop Lalu          = 0
Drop Berjalan      = 100.000
Storting Berjalan  = 180.000
Tab Keluar         = 20.000
Tunai              = 70.000
```

Validasi:

```txt
180.000 + 10.000 - 100.000 - 20.000 = 70.000
```

### Kamis, 4 Juni 2026

```txt
Target Lama        = target khusus track Kamis
Drop Lalu          = 100.000
Drop Berjalan      = 100.000 + Drop Kini Kamis
Storting Berjalan  = 180.000 + Storting Kamis
```

### Senin, 8 Juni 2026

```txt
Target Lama = 180.000
```

Nilai tersebut harus berasal dari Target Baru Senin, 1 Juni 2026, bukan dari baris Kamis.

## 12. Test Case Minimum

### TH-01 — Route dan permission

Expected:

- Owner dapat membuka `/koperasi/laporan-target-harian`.
- User tanpa `COOPERATIVE_REPORT_VIEW` tidak dapat membuka route.

### TH-02 — Header standar monokrom

Expected:

- Logo dan nama perusahaan tampil.
- Judul tampil.
- Periode tampil.
- Tanggal cetak tampil.
- Tidak ada background kuning/oranye pada report.

### TH-03 — Grouping berdasarkan karyawan

Expected:

- Data Petugas A tidak masuk section Petugas B.
- Filter Petugas A menyembunyikan Petugas B.
- Group unassigned tampil terpisah.

### TH-04 — Rantai target terpisah per weekday

Expected:

- Target Baru Senin menjadi Target Lama Senin berikutnya.
- Target Baru Kamis menjadi Target Lama Kamis berikutnya.
- Senin dan Kamis tidak saling menimpa.

### TH-05 — Klasifikasi L/B/K

Expected:

- First loan dihitung B.
- Loan ulang tidak dihitung B.
- Loan lunas tanpa replacement dihitung K.
- Loan lunas dengan replacement hari yang sama tidak menurunkan JML.

### TH-06 — Rumus target

Expected:

```txt
Target Baru = Target Lama + Masuk - Keluar
```

### TH-07 — Storting tunai dan non-tunai

Fixture:

- Satu payment `TUNAI`.
- Satu payment transfer/non-tunai.

Expected:

- Keduanya masuk Storting.
- Keduanya masuk Storting Berjalan.

### TH-08 — Reversal

Expected:

- Payment reversed tidak masuk Storting.
- Saving withdrawal reversed tidak masuk Tab Keluar.
- Loan reversal tidak masuk Drop Kini.

### TH-09 — Persentase

Expected:

```txt
Storting / Target Lama * 100
```

- Target `0` menghasilkan `0%`.
- Subtotal memakai weighted percentage.

### TH-10 — Running values

Expected:

- Drop Lalu sama dengan Drop Berjalan baris sebelumnya.
- Drop Berjalan bertambah dengan Drop Kini.
- Storting Berjalan bertambah dengan Storting harian.
- Running value tidak reset ketika weekday berubah.
- Running value reset ketika karyawan berubah.

### TH-11 — Tunai

Expected:

```txt
Tunai = Storting + 10% - Drop Kini - Tab Keluar
```

### TH-12 — Subtotal mingguan

Expected:

- Minggu menggunakan Senin sampai Minggu.
- Kolom harian dijumlahkan.
- Drop Berjalan mengambil closing minggu.
- Storting Berjalan mengambil closing minggu.
- Persentase dihitung ulang.

### TH-13 — Total karyawan

Expected:

- Total menjumlahkan seluruh minggu karyawan.
- Running Drop memakai posisi akhir bulan.
- Running Storting memakai posisi akhir bulan.

### TH-14 — Export

Expected:

- PDF berhasil.
- HTML berhasil.
- CSV berhasil.
- Nama file memakai bulan laporan.
- Isi export konsisten dengan preview.
- HTML export bisa dibuka tanpa aplikasi.

### TH-15 — Empty state

Expected:

- Filter tanpa data tidak error.
- Pesan empty tampil.
- Tombol export disabled.

## 13. Validasi Teknis

Setelah implementasi:

1. Jalankan TypeScript dan production build:

```bash
npm run build
```

2. Jalankan lint untuk file terkait atau seluruh project:

```bash
npm run lint
```

3. Jalankan E2E report:

```bash
npx playwright test tests/e2e/koperasi-daily-target-report.spec.ts --project=chromium
```

4. Periksa preview pada desktop.
5. Periksa horizontal scroll pada viewport mobile.
6. Export HTML dan buka hasilnya.
7. Export PDF landscape dan periksa:
   - header tidak terpotong;
   - kolom angka terbaca;
   - subtotal tidak terpisah secara membingungkan;
   - warna tetap monokrom.
8. Bandingkan minimal satu fixture dengan perhitungan manual.

## 14. File Baru

```txt
src/services/cooperativeDailyTargetReportService.ts
src/hooks/useCooperativeDailyTargetReport.tsx
src/view/koperasi/reports/CooperativeDailyTargetReport.tsx
src/view/koperasi/reports/CooperativeDailyTargetReportManagement.tsx
src/routes/koperasi/laporan-target-harian.lazy.tsx
tests/e2e/helpers/koperasiDailyTarget.ts
tests/e2e/koperasi-daily-target-report.spec.ts
```

## 15. File yang Diubah

```txt
src/auth/routePermissions.ts
src/routes/koperasi/index.tsx
src/i18n/cooperativeMessages.ts
src/i18n/navigationMessages.ts
src/routeTree.gen.ts
```

`src/routeTree.gen.ts` berubah melalui generator route.

## 16. Di Luar Scope

Fitur ini tidak mencakup:

- Input target manual.
- Edit angka laporan.
- Penyimpanan snapshot laporan ke database.
- Export Excel/XLSX.
- Perubahan jurnal finance.
- Perubahan saldo kas petugas.
- Perubahan flow pencairan pinjaman.
- Perubahan flow pembayaran angsuran.
- Perubahan flow penarikan simpanan.
- Penambahan warna sesuai screenshot.
- Penggantian Laporan Storting Harian atau Laporan Drop Harian existing.

## 17. Definition of Done

Fitur dianggap selesai jika:

- Route dan menu tersedia.
- Permission memakai `COOPERATIVE_REPORT_VIEW`.
- Filter bulan dan karyawan bekerja.
- Laporan dikelompokkan per karyawan.
- Track target Senin, Kamis, atau weekday lain berjalan independen.
- L/B/K/JML sesuai definisi.
- Seluruh rumus sesuai keputusan bisnis.
- Storting mencakup tunai dan non-tunai.
- Running Drop dan Storting benar.
- Subtotal minggu dan total bulan benar.
- Header report standar dan monokrom.
- PDF, HTML, dan CSV berhasil diexport.
- Build, lint, dan E2E terkait lulus.
