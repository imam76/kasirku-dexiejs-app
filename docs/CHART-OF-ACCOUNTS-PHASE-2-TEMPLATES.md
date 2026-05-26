# Chart of Accounts - Fase 2 Template Standar Akuntansi

Fase ini menambahkan template COA berdasarkan accounting profile dan industry extension. Fase ini tidak mengubah transaksi menjadi double-entry. Template hanya menjadi blueprint awal yang dicopy ke `chartOfAccounts`.

## Tujuan

- User bisa memilih template COA yang sesuai jenis entitas.
- Sistem punya default `SAK_EMKM + RETAIL` untuk toko kecil.
- Template lain tersedia sebagai jalur naik kelas, bukan sebagai klaim compliance penuh.
- Template tidak merusak akun yang sudah dipakai transaksi.
- Template bisa diterapkan ke toko baru atau digunakan untuk menambah akun yang belum ada.

## Keputusan Grooming

- `SAK_EMKM` menjadi default awal Kasirku.
- `SAK_EP` menjadi pengganti arah `SAK_ETAP` untuk target baru.
- `SAK_ETAP` tidak perlu menjadi template utama baru. Jika perlu, pakai `SAK_ETAP_LEGACY` hanya untuk import/migration.
- `PSAK_FULL` adalah profile lanjut yang butuh general ledger sebelum bisa diklaim serius.
- `MANUFACTURING` dan `CONSTRUCTION` adalah extension di atas profile, bukan standar tunggal.
- `PSAP` adalah profile khusus pemerintah dan tidak memakai konsep laba/rugi bisnis retail.

## Data Model Yang Disarankan

Tambahkan type:

```ts
export type AccountingProfileCode =
  | 'SAK_EMKM'
  | 'SAK_EP'
  | 'PSAK_FULL'
  | 'PSAP'
  | 'SAK_ETAP_LEGACY';

export type IndustryExtensionCode =
  | 'NONE'
  | 'RETAIL'
  | 'MANUFACTURING'
  | 'CONSTRUCTION';

export interface ChartOfAccountTemplate {
  id: string;
  code: string;
  name: string;
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  description?: string;
  account_count_hint?: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChartOfAccountTemplateLine {
  id: string;
  template_id: string;
  template_account_id: string;
  code: string;
  name: string;
  type: AccountType;
  normal_balance: AccountNormalBalance;
  parent_template_account_id?: string;
  is_postable: boolean;
  description?: string;
  mapping_key?: string;
  created_at: string;
}

export interface AccountingProfileSetting {
  id: string;
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  template_id?: string;
  locked_after_transaction?: boolean;
  created_at: string;
  updated_at: string;
}
```

Catatan:

- `template_account_id` harus stabil, misalnya `cash`, `bank`, `inventory`, `sales-pos`.
- Saat template diterapkan, line template dicopy menjadi `ChartOfAccount`.
- Jangan pakai `template_account_id` sebagai `ChartOfAccount.id` jika sudah ada akun lama yang harus dipertahankan.
- Mapping default boleh berasal dari `mapping_key`.

## Template Yang Didukung

### SAK_EMKM + RETAIL

Template default untuk fase awal Kasirku.

Target:

- 25 sampai 35 akun.
- Cocok untuk POS, stok, piutang sederhana, hutang sederhana, dan beban operasional.
- Tidak perlu OCI, instrumen keuangan kompleks, pajak tangguhan, konsolidasi, atau segmen operasi.

Kelompok akun:

```txt
1000 Aset
  Kas
  Bank
  Piutang Usaha
  Persediaan Barang
  Aset Tetap sederhana

2000 Liabilitas
  Hutang Usaha
  Pinjaman
  Hutang Pajak sederhana

3000 Ekuitas
  Modal Pemilik
  Prive
  Laba Ditahan / Saldo Laba

4000 Pendapatan
  Penjualan POS
  Pendapatan Sales Invoice

4100 Kontra Pendapatan
  Retur Penjualan
  Diskon Penjualan

5000 Beban Pokok
  HPP
  Pembelian Stok / Persediaan

6000 Beban Operasional
  Gaji
  Sewa
  Listrik
  Transport
  Perlengkapan
  Beban Lainnya
```

### SAK_EP + RETAIL

Template untuk entitas privat yang lebih rapi daripada EMKM, tetapi belum public accountability.

Target:

- 50 sampai 70 akun.
- Cocok untuk usaha menengah dengan AR/AP, beberapa kas/bank, aset tetap, pajak, dan reporting lebih lengkap.
- Bisa menjadi pengganti arah `SAK_ETAP` untuk pengembangan baru.

Tambahan dibanding EMKM:

- Kas kecil dan beberapa rekening bank.
- Piutang lain-lain dan cadangan kerugian piutang.
- Uang muka pembelian/penjualan.
- Pajak masukan/keluaran jika fitur pajak sudah siap.
- Aset tetap per kelompok.
- Akumulasi penyusutan.
- Beban penyusutan.
- Pendapatan lain-lain.
- Beban keuangan.

### PSAK_FULL + RETAIL

Template skeleton untuk perusahaan besar/listed. Jangan jadikan target implementasi dekat.

Target:

- Dipakai setelah general ledger tersedia.
- Perlu dukungan report akrual penuh.
- Perlu kontrol periode, adjustment, reclassification, dan audit trail.

Tambahan konseptual:

- Instrumen keuangan lebih rinci.
- Pajak tangguhan.
- OCI jika nanti relevan.
- Liabilitas imbalan kerja jika nanti relevan.
- Ekuitas lebih rinci.
- Disclosure/reporting tidak cukup hanya dari COA.

### SAK_EP + MANUFACTURING

Template untuk manufaktur kecil/menengah.

Tambahan akun:

- Bahan Baku.
- Barang Dalam Proses / WIP.
- Barang Jadi.
- Overhead Pabrik.
- Tenaga Kerja Langsung.
- Selisih Biaya Produksi.
- HPP Produk Jadi.

Catatan: akun manufaktur tanpa fitur produksi hanya akan menjadi daftar akun pasif. Implementasi domainnya ada di Fase 5.

### PSAK_FULL + CONSTRUCTION

Template untuk konstruksi yang lebih kompleks.

Tambahan akun:

- Aset Kontrak.
- Liabilitas Kontrak.
- Piutang Retensi.
- Hutang Retensi.
- Uang Muka Proyek.
- Pendapatan Kontrak.
- Beban Subkontraktor.
- Beban Material Proyek.
- Beban Tenaga Kerja Proyek.

Catatan: untuk implementasi baru, arahkan revenue contract ke model PSAK 72. Jangan membuat desain baru yang bergantung ke PSAK 34/44 sebagai fondasi utama.

### PSAP + NONE

Template khusus instansi pemerintah.

Karakter:

- Tidak memakai konsep laba/rugi bisnis retail.
- Butuh struktur akun pendapatan, belanja, beban, aset, kewajiban, ekuitas dana, dan anggaran.
- Butuh report pemerintahan yang berbeda.
- Sebaiknya tidak digabung ke UX default Kasirku retail.

## Cara Apply Template

Aturan aman:

- Apply template hanya otomatis saat `chartOfAccounts` kosong.
- Jika akun sudah ada, tampilkan mode import/merge.
- Merge mencocokkan berdasarkan `code` dan/atau `template_account_id`.
- Jangan overwrite nama akun user tanpa konfirmasi.
- Jangan mengubah akun yang sudah dipakai transaksi kecuali hanya menambah field non-destruktif.
- Mapping category finance boleh ditawarkan untuk diupdate setelah template diterapkan.

Mode apply:

```txt
CREATE_NEW_STORE
  Untuk database/toko baru. Seed penuh dari template.

MERGE_MISSING_ONLY
  Tambahkan akun template yang belum ada. Tidak mengubah akun existing.

UPDATE_MAPPING_ONLY
  Tidak menambah akun. Hanya membantu mapping category finance ke akun existing.
```

## UI Yang Disarankan

Lokasi:

```txt
/finance/chart-of-accounts
```

Tambahkan panel atau modal `Template Akun`:

- Pilih accounting profile.
- Pilih industry extension.
- Preview daftar akun template.
- Preview akun yang akan ditambah.
- Preview mapping yang akan berubah.
- Button apply template.

Untuk fase ini jangan buat wizard panjang di Settings. Tetap dekatkan ke modul Daftar Akun.

## Acceptance Criteria

- User bisa melihat template `SAK_EMKM + RETAIL`.
- User bisa apply template hanya jika aman.
- Apply template tidak menghapus akun existing.
- Apply template tidak mengubah transaksi lama.
- Mapping finance bisa dibuat/diupdate dari template.
- `SAK_ETAP_LEGACY` tidak muncul sebagai rekomendasi utama untuk toko baru.
- UI tidak mengklaim full PSAK/IFRS/PSAP compliance.

## Validasi Teknis

Minimal:

```txt
bun run build
bun run lint
```

Prioritas test:

- apply template ke database kosong.
- merge missing only ke database yang sudah punya akun.
- update mapping only.
- duplicate code handling.
- preview perubahan sebelum apply.

