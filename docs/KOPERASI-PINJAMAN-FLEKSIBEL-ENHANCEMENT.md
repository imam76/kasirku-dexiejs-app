# Enhancement Pinjaman Koperasi Fleksibel

> Tujuan: menambah opsi skema pinjaman sesuai kondisi lapangan tanpa merusak flow pinjaman koperasi yang sudah berjalan.
> Pendekatan utama: tambah mode baru secara kompatibel, jangan mengganti makna data lama secara diam-diam.

---

## Ringkasan Keputusan

Sistem pinjaman koperasi perlu mendukung dua pola:

1. **Mode lama: bunga per bulan**
   - Tetap dipertahankan untuk data dan flow existing.
   - Field existing seperti `interest_rate_per_month` dan `tenor_months` tetap valid.
   - Jadwal default tetap bulanan.

2. **Mode baru: jasa pinjaman total pengajuan**
   - Jasa pinjaman dihitung satu kali dari pokok pinjaman.
   - Frekuensi penagihan hanya mengatur jarak jatuh tempo, bukan mengubah total jasa.
   - Mendukung penagihan mingguan, 2 mingguan, dan bulanan.

Selain itu, pengajuan pinjaman baru perlu mendukung:

- Jasa pinjaman, contoh 20%.
- Biaya administrasi, contoh 5%.
- Simpanan wajib, contoh 5%.

---

## Prinsip Non-Regression

Enhancement ini tidak boleh mengubah flow yang sudah jalan:

- Pinjaman existing tetap terbaca dan dihitung dengan skema lama.
- Pengajuan, approval, pencairan, jadwal angsuran, pembayaran, reversal, jurnal, dan activity log existing tetap bekerja.
- Field existing tidak dihapus pada fase awal.
- Perubahan schema harus punya default aman untuk data lama.
- UI harus tetap bisa membuat pinjaman seperti sekarang, minimal melalui mode "Bunga per bulan".
- Sync Postgres/Tauri tidak boleh half-wired. Kalau field baru masuk sync, Rust model, repository, command, DTO TypeScript, dan migrasi SQL harus selesai dalam satu subfase.

---

## Kondisi Sistem Saat Ini

Titik existing yang perlu dijaga:

- `src/utils/koperasi/loanSchedule.ts`
  - Menghitung bunga flat dengan basis `interestRatePerMonth` dan `tenorMonths`.
  - Membagi pokok dan bunga ke sejumlah tenor.

- `src/services/cooperativeLoanService.ts`
  - Input pengajuan memakai `interest_rate_per_month` dan `tenor_months`.
  - Pencairan membuat `first_due_date` default `+1 month`.
  - Jadwal angsuran dibuat dengan interval `month`.

- `src/view/koperasi/loans/CooperativeLoanFormModal.tsx`
  - Form saat ini menampilkan bunga per bulan dan tenor bulan.

- `src/hooks/useCooperativeBilling.tsx`
  - Penagihan membaca `due_date` apa adanya.
  - Ini berarti halaman penagihan relatif siap membaca jadwal mingguan/2 mingguan setelah generator jadwal dibuat fleksibel.

---

## Terminologi Baru

Gunakan istilah yang jelas supaya akuntansi dan operasional tidak bercampur.

| Istilah | Makna | Dampak |
|---|---|---|
| Jasa pinjaman | Persentase tambahan atas pokok pinjaman, mirip bunga total pengajuan | Masuk total tagihan pinjaman |
| Biaya administrasi | Fee koperasi saat pencairan | Masuk pendapatan admin/fee |
| Simpanan wajib | Setoran simpanan anggota dari pinjaman | Masuk saldo simpanan anggota, bukan pendapatan |
| Frekuensi penagihan | Jarak tanggal jatuh tempo | Mengatur `due_date` angsuran |
| Jumlah angsuran | Banyaknya baris jadwal angsuran | Mengatur pembagian total tagihan |

---

## Flow Bisnis yang Direkomendasikan

### 1. Pengajuan Pinjaman

Form pengajuan pinjaman menambahkan pilihan skema:

```txt
Skema bunga/jasa:
- Bunga per bulan
- Jasa pinjaman total pengajuan
```

Jika memilih **Bunga per bulan**, tampilkan field lama:

```txt
Pokok pinjaman
Bunga per bulan (%)
Tenor bulan
Tanggal pengajuan
Catatan
```

Jika memilih **Jasa pinjaman total pengajuan**, tampilkan field baru:

```txt
Pokok pinjaman
Jasa pinjaman total (%)
Biaya administrasi (%)
Simpanan wajib (%)
Jumlah angsuran
Frekuensi penagihan: Mingguan / 2 Mingguan / Bulanan
Tanggal pengajuan
Catatan
```

### 2. Preview Simulasi

Sebelum pengajuan disimpan, sistem tampilkan simulasi.

Contoh input:

```txt
Pokok pinjaman: Rp 1.000.000
Jasa pinjaman: 20%
Biaya administrasi: 5%
Simpanan wajib: 5%
Jumlah angsuran: 10
Frekuensi penagihan: Mingguan
```

Hasil preview:

```txt
Jasa pinjaman: Rp 200.000
Biaya administrasi: Rp 50.000
Simpanan wajib: Rp 50.000
Total tagihan pinjaman: Rp 1.200.000
Nominal per angsuran: Rp 120.000
Estimasi uang diterima anggota: Rp 900.000
```

Catatan:

- Total tagihan pinjaman hanya pokok + jasa pinjaman.
- Biaya administrasi dan simpanan wajib tidak ikut dibagi ke angsuran jika metode potong saat pencairan dipakai.
- Angsuran terakhir tetap menjadi tempat koreksi selisih pembulatan.

### 3. Approval

Approval tetap memakai flow existing:

```txt
SUBMITTED -> APPROVED
```

Saat approval, snapshot nilai perhitungan harus sudah jelas:

- Pokok pinjaman.
- Skema bunga/jasa.
- Persentase jasa.
- Nominal jasa.
- Persentase admin.
- Nominal admin.
- Persentase simpanan wajib.
- Nominal simpanan wajib.
- Jumlah angsuran.
- Frekuensi penagihan.

Tujuannya supaya perubahan setting di kemudian hari tidak mengubah pinjaman yang sudah disetujui.

### 4. Pencairan

Pencairan tetap hanya untuk pinjaman `APPROVED`.

Untuk mode baru, rekomendasi default:

```txt
Metode potong saat pencairan
```

Artinya:

```txt
Pokok pinjaman dicatat: Rp 1.000.000
Admin dipotong: Rp 50.000
Simpanan wajib dipotong: Rp 50.000
Kas keluar ke anggota: Rp 900.000
Total tagihan pinjaman: Rp 1.200.000
```

Dampak pencatatan:

- Pinjaman anggota tetap sebesar pokok pinjaman.
- Admin menjadi pendapatan/fee koperasi.
- Simpanan wajib masuk saldo simpanan anggota.
- Kas/bank keluar sebesar net disbursement jika biaya dipotong.

### 5. Generate Jadwal Angsuran

Untuk mode lama:

```txt
interval = 1 bulan
jumlah angsuran = tenor_months
total bunga = pokok x bunga per bulan x tenor bulan
```

Untuk mode baru:

```txt
interval = berdasarkan frekuensi penagihan
jumlah angsuran = installment_count
total jasa = pokok x jasa pinjaman total %
total tagihan = pokok + total jasa
```

Mapping frekuensi:

```txt
WEEKLY    -> tambah 1 week per angsuran
BIWEEKLY  -> tambah 2 weeks per angsuran
MONTHLY   -> tambah 1 month per angsuran
```

### 6. Penagihan

Halaman penagihan tidak perlu berubah besar karena sudah berbasis `due_date`.

Enhancement yang perlu dipertimbangkan:

- Tampilkan frekuensi penagihan pada detail pinjaman.
- Tambah filter frekuensi jika diperlukan.
- Label "Jatuh Tempo Minggu Ini" tetap relevan untuk mingguan dan 2 mingguan.

### 7. Pembayaran Angsuran

Flow pembayaran existing tetap dipakai:

```txt
Pilih angsuran -> bayar -> alokasi denda/bunga/pokok -> update outstanding -> posting cash-flow/jurnal
```

Untuk mode baru, istilah "bunga" di internal bisa tetap dipakai sebagai `interest_amount` pada angsuran agar flow existing aman. Di UI bisa ditampilkan sebagai "Jasa pinjaman" untuk mode baru.

---

## Formula Perhitungan

### Mode Lama: Bunga Per Bulan

```txt
total_bunga = pokok x bunga_per_bulan% x tenor_bulan
total_tagihan = pokok + total_bunga
angsuran_pokok = pokok / tenor_bulan
angsuran_bunga = total_bunga / tenor_bulan
```

### Mode Baru: Jasa Pinjaman Total

```txt
total_jasa = pokok x jasa_pinjaman_total%
biaya_admin = pokok x admin_fee%
simpanan_wajib = pokok x mandatory_saving%
total_tagihan_pinjaman = pokok + total_jasa
angsuran_pokok = pokok / jumlah_angsuran
angsuran_jasa = total_jasa / jumlah_angsuran
```

Rekomendasi basis persentase:

```txt
Semua persentase dihitung dari pokok pinjaman.
```

Alasan:

- Mudah dijelaskan ke petugas dan anggota.
- Konsisten dengan contoh lapangan.
- Tidak membuat biaya admin/simpanan berubah karena potongan lain.

---

## Usulan Field Baru

Jangan hapus field existing pada fase awal.

Tambahkan field baru di `CooperativeLoan`:

```ts
interest_calculation_type?: 'MONTHLY_RATE' | 'TOTAL_PERCENT';
billing_frequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
installment_count?: number;
loan_service_rate?: number;
loan_service_amount?: number;
admin_fee_rate?: number;
admin_fee_amount?: number;
mandatory_saving_rate?: number;
mandatory_saving_amount?: number;
deduction_method?: 'NONE' | 'DEDUCT_ON_DISBURSEMENT';
net_disbursement_amount?: number;
```

Default untuk data lama:

```ts
interest_calculation_type = 'MONTHLY_RATE';
billing_frequency = 'MONTHLY';
installment_count = tenor_months;
loan_service_rate = interest_rate_per_month;
loan_service_amount = total_interest_amount;
admin_fee_rate = 0;
admin_fee_amount = 0;
mandatory_saving_rate = 0;
mandatory_saving_amount = 0;
deduction_method = 'NONE';
net_disbursement_amount = principal_amount;
```

Catatan:

- Field `interest_rate_per_month` dan `tenor_months` tetap dipertahankan untuk backward compatibility.
- UI baru harus membaca `interest_calculation_type` untuk menentukan label yang benar.
- Untuk mode baru, `total_interest_amount` existing bisa tetap diisi dengan total jasa pinjaman agar flow pembayaran existing tetap aman.

---

## Dampak Akuntansi dan Cash-Flow

### Mode Potong Saat Pencairan

Contoh:

```txt
Pokok pinjaman: Rp 1.000.000
Admin: Rp 50.000
Simpanan wajib: Rp 50.000
Kas keluar net: Rp 900.000
```

Pencatatan operasional:

- Finance transaction pencairan pinjaman mencerminkan kas keluar net atau gross sesuai keputusan accounting existing.
- Admin harus punya kategori/mapping pendapatan admin koperasi.
- Simpanan wajib harus membuat transaksi simpanan tipe `WAJIB` untuk anggota.

Poin penting:

- Admin bukan pengurang total tagihan pinjaman.
- Simpanan wajib bukan pendapatan.
- Simpanan wajib harus menambah saldo simpanan anggota.

---

## Tahapan Implementasi

### Fase 0 - Audit dan Keputusan Final

Checklist:

- Pastikan apakah biaya admin dan simpanan wajib selalu dipotong saat pencairan.
- Pastikan basis persentase adalah pokok pinjaman.
- Pastikan admin dan simpanan wajib tidak dicicil.
- Pastikan istilah UI yang dipakai: "Jasa pinjaman" atau "Bunga total".
- Pastikan apakah mode lama tetap terlihat di UI atau hanya dipakai untuk data lama.

Output:

- Catatan keputusan final di dokumen ini atau dokumen lanjutan.

### Fase 1 - Pure Helper Perhitungan

File kandidat:

```txt
src/utils/koperasi/loanSchedule.ts
```

Langkah:

- Tambah tipe input untuk mode baru.
- Tambah helper hitung total jasa/admin/simpanan wajib.
- Tambah helper build angsuran berdasarkan `installment_count`.
- Tambah helper resolve interval jatuh tempo berdasarkan `billing_frequency`.
- Pastikan fungsi lama tetap ada dan tidak berubah behavior.

Acceptance:

- Simulasi mode lama menghasilkan angka sama seperti sebelum enhancement.
- Simulasi mode baru menghasilkan total jasa/admin/simpanan sesuai contoh.
- Selisih rounding hanya masuk angsuran terakhir.

### Fase 2 - Schema dan Type Local

File kandidat:

```txt
src/types/index.ts
src/lib/validations/cooperativeLoan.ts
src/lib/db.ts
```

Langkah:

- Tambah union type untuk skema bunga/jasa.
- Tambah union type untuk frekuensi penagihan.
- Tambah field baru di `CooperativeLoan`.
- Tambah migrasi Dexie dengan default aman untuk data lama.
- Update validation agar mode lama dan mode baru punya rule masing-masing.

Acceptance:

- Data lama tetap bisa dibuka.
- Pinjaman lama otomatis dianggap `MONTHLY_RATE` dan `MONTHLY`.
- Tidak ada perubahan behavior untuk create/disburse mode lama.

### Fase 3 - Service Layer

File kandidat:

```txt
src/services/cooperativeLoanService.ts
src/services/cooperativeSavingService.ts
src/services/generalLedgerService.ts
```

Langkah:

- Extend input create loan dengan field mode baru.
- Saat create loan, simpan snapshot hasil kalkulasi.
- Saat disburse mode baru:
  - Hitung net disbursement.
  - Buat jadwal berdasarkan frekuensi.
  - Catat admin fee sesuai mapping finance/ledger.
  - Catat simpanan wajib ke transaksi simpanan anggota.
- Pastikan semua mutasi tetap memakai permission guard.
- Pastikan semua mutasi tetap menulis activity log.
- Pastikan semua store Dexie yang dibaca/ditulis masuk transaction scope.

Acceptance:

- Mode lama tetap jalan sama.
- Mode baru mencairkan net amount sesuai preview.
- Simpanan wajib muncul di saldo simpanan anggota.
- Admin fee tercatat sebagai transaksi/kategori yang benar.

### Fase 4 - UI Pinjaman

File kandidat:

```txt
src/view/koperasi/loans/CooperativeLoanFormModal.tsx
src/view/koperasi/loans/CooperativeLoanManagement.tsx
src/view/koperasi/loans/CooperativeLoanTable.tsx
src/view/koperasi/loans/CooperativeLoanDetailDrawer.tsx
src/i18n/messages.ts
```

Langkah:

- Tambah pilihan skema bunga/jasa.
- Render field mode lama atau mode baru secara kondisional.
- Tambah preview simulasi sebelum submit.
- Tampilkan frekuensi penagihan dan potongan pencairan di detail.
- Tabel tetap ringkas, jangan terlalu banyak kolom baru.

Acceptance:

- Petugas bisa membuat pinjaman lama seperti biasa.
- Petugas bisa membuat pinjaman mode jasa total.
- Detail pinjaman menjelaskan komponen angka tanpa ambigu.

### Fase 5 - Penagihan dan Angsuran

File kandidat:

```txt
src/hooks/useCooperativeBilling.tsx
src/view/koperasi/billing/*
src/view/koperasi/installments/*
```

Langkah:

- Pastikan penagihan tetap memakai `due_date`.
- Tambah display frekuensi bila membantu.
- Untuk mode baru, label bunga bisa tampil sebagai "Jasa" di detail.
- Jangan ubah flow pembayaran angsuran kecuali dibutuhkan untuk label.

Acceptance:

- Angsuran mingguan muncul sesuai tanggal.
- Angsuran 2 mingguan muncul sesuai tanggal.
- Tab overdue/hari ini/minggu ini tetap benar.

### Fase 6 - Sync Postgres/Tauri

Kerjakan hanya setelah flow local stabil.

File kandidat:

```txt
src/services/postgresAdapter.ts
src/services/syncQueueService.ts
src/services/cooperativeReadService.ts
src-tauri/src/models/cooperative.rs
src-tauri/src/repositories/cooperative_repository.rs
src-tauri/migrations/*
```

Langkah:

- Tambah migrasi SQL untuk field baru.
- Update Rust DTO.
- Update repository select/insert/upsert.
- Update TypeScript remote DTO.
- Update pull/push mapping.
- Pastikan default remote untuk data lama aman.

Acceptance:

- Data mode lama sync normal.
- Data mode baru sync round-trip tanpa kehilangan field.
- Tidak ada field baru yang hanya tersimpan local tapi hilang saat sync.

### Fase 7 - QA Manual

Skenario wajib:

1. Buat pinjaman lama bunga per bulan 1%, tenor 12 bulan.
   - Hasil harus sama dengan behavior sebelum enhancement.

2. Buat pinjaman baru:
   - Pokok Rp 1.000.000.
   - Jasa 20%.
   - Admin 5%.
   - Simpanan wajib 5%.
   - 10 angsuran.
   - Frekuensi mingguan.
   - Pastikan total tagihan Rp 1.200.000.
   - Pastikan net diterima Rp 900.000.
   - Pastikan jadwal jatuh tempo tiap 7 hari.

3. Buat pinjaman baru dengan frekuensi 2 mingguan.
   - Pastikan jadwal jatuh tempo tiap 14 hari.

4. Bayar sebagian angsuran.
   - Status menjadi `PARTIAL`.
   - Outstanding berkurang sesuai alokasi.

5. Bayar lunas semua angsuran.
   - Status pinjaman menjadi `PAID_OFF`.

6. Cek simpanan wajib.
   - Saldo simpanan anggota bertambah sesuai potongan.

7. Cek biaya admin.
   - Tercatat di kategori/mapping yang benar.

8. Cek data lama.
   - Pinjaman lama masih bisa dibuka, dicairkan, dan dibayar.

---

## Open Questions

Keputusan berikut perlu dikunci sebelum coding:

1. Apakah admin fee dan simpanan wajib selalu dipotong saat pencairan?
2. Apakah ada kasus admin fee dibayar tunai terpisah, bukan dipotong?
3. Apakah simpanan wajib selalu persentase dari pokok, atau bisa nominal manual?
4. Apakah jasa pinjaman selalu persentase, atau bisa nominal manual?
5. Apakah mode "Bunga per bulan" tetap boleh dipilih untuk pinjaman baru?
6. Apakah admin fee butuh akun/kategori khusus di chart of accounts?
7. Apakah potongan simpanan wajib harus memakai flow service simpanan existing penuh, termasuk cash-flow dan jurnal?

---

## Rekomendasi Implementasi Aman

Urutan paling aman:

```txt
1. Tambah helper perhitungan pure dan unit/manual calculation checklist.
2. Tambah schema/type dengan default backward compatible.
3. Tambah mode baru di service tanpa mengubah mode lama.
4. Tambah UI mode baru dengan preview.
5. Baru sambungkan admin fee dan simpanan wajib ke finance/saving.
6. Terakhir sambungkan sync Postgres/Tauri.
```

Dengan urutan ini, flow lama tetap menjadi baseline pembanding di setiap fase.
