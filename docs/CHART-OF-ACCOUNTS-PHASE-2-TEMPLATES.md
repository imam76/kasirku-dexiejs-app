# Accounting Core - Fase 2 Profile, Template, dan Module Activation

Fase ini bukan cuma menambahkan template COA. Fase ini menghubungkan `accountingProfileSetting`, template akun, dan `enabledModules` supaya toko bisa memilih profile akuntansi, memakai blueprint akun yang sesuai, lalu mengaktifkan module yang memang aman untuk profile tersebut. Fase ini tetap tidak mengubah transaksi menjadi double-entry.

## Tujuan

- User bisa memilih template COA yang sesuai jenis entitas.
- User bisa melihat dan mengubah accounting profile toko secara terkontrol.
- Sistem bisa menawarkan module activation berdasarkan profile dan industry extension.
- Sistem punya default `SAK_EMKM + RETAIL` untuk toko kecil.
- Template lain tersedia sebagai jalur naik kelas, bukan sebagai klaim compliance penuh.
- Template tidak merusak akun yang sudah dipakai transaksi.
- Template bisa diterapkan ke toko baru atau digunakan untuk menambah akun yang belum ada.
- Module lanjut tidak aktif otomatis tanpa preview, konfirmasi, dan data safety check.

## Keputusan Grooming

- `SAK_EMKM` menjadi default awal Frayukti.
- `SAK_EP` menjadi pengganti arah `SAK_ETAP` untuk target baru.
- `SAK_ETAP` tidak perlu menjadi template utama baru. Jika perlu, pakai `SAK_ETAP_LEGACY` hanya untuk import/migration.
- `PSAK_FULL` adalah profile lanjut yang butuh general ledger sebelum bisa diklaim serius.
- `MANUFACTURING` dan `CONSTRUCTION` adalah extension di atas profile, bukan standar tunggal.
- `PSAP` adalah profile khusus pemerintah dan tidak memakai konsep laba/rugi bisnis retail.
- `accountingProfileSetting` dari Fase 1 menjadi source of truth untuk profile aktif.
- `enabledModules` dari Fase 1 menjadi source of truth untuk module yang aktif.
- Mengganti profile tidak boleh diam-diam apply template, mengubah transaksi lama, atau mengaktifkan module domain berat.
- Aktivasi `GENERAL_LEDGER`, `MANUFACTURING`, `CONSTRUCTION`, dan `PSAP_REPORTING` harus tetap menunggu fondasi domain/report yang sesuai.

## Data Model Yang Disarankan

Type `AccountingProfileCode`, `IndustryExtensionCode`, `AccountingModuleCode`, `AccountingProfileSetting`, dan `EnabledModule` sudah dibuat di Fase 1. Fase 2 menambahkan template dan rule aktivasi.

```ts
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

export interface AccountingProfileTemplateRecommendation {
  id: string;
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  template_id: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AccountingModuleActivationRule {
  id: string;
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  module_code: AccountingModuleCode;
  default_enabled: boolean;
  requires_confirmation: boolean;
  requires_data_safety_check: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}
```

Catatan:

- `template_account_id` harus stabil, misalnya `cash`, `bank`, `inventory`, `sales-pos`.
- Saat template diterapkan, line template dicopy menjadi `ChartOfAccount`.
- Jangan pakai `template_account_id` sebagai `ChartOfAccount.id` jika sudah ada akun lama yang harus dipertahankan.
- Mapping default boleh berasal dari `mapping_key`.
- `AccountingProfileSetting.template_id` diupdate setelah template diterapkan dengan sukses.
- `EnabledModule` diupdate dari activation rule hanya setelah user melihat preview dan menyetujui perubahan.

## Alur Profile, Template, dan Module Activation

Alur aman:

1. User memilih `accounting_profile` dan `industry_extension`.
2. Sistem menampilkan template yang cocok untuk kombinasi tersebut.
3. Sistem menampilkan module yang direkomendasikan aktif/nonaktif dari `AccountingModuleActivationRule`.
4. Sistem menampilkan data safety check: status backup/restore finance, jumlah akun existing, transaksi yang sudah punya snapshot, dan mapping yang akan berubah.
5. User memilih mode apply template.
6. Sistem menyalin line template ke `chartOfAccounts` sesuai mode.
7. Sistem mengupdate `financeAccountMappings` jika user menyetujui mapping change.
8. Sistem mengupdate `accountingProfileSetting`.
9. Sistem mengupdate `enabledModules` hanya untuk module yang aman dan disetujui.

Aturan activation:

- `ACCOUNT_TEMPLATES` boleh aktif di Fase 2.
- `CASH_FLOW_ACCOUNT_FILTER` boleh aktif jika account snapshot dan UI filter sudah selesai.
- `GENERAL_LEDGER` tetap nonaktif sampai Fase 4.
- `MANUFACTURING` dan `CONSTRUCTION` tetap nonaktif sampai Fase 5 domain flow jelas.
- `PSAP_REPORTING` tetap nonaktif sampai profile PSAP punya UX dan report khusus.
- Perubahan profile tidak boleh menghapus akun existing atau transaksi lama.

## Template Yang Didukung

### SAK_EMKM + RETAIL

Template default untuk fase awal Frayukti.

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
- Sebaiknya tidak digabung ke UX default Frayukti retail.

## Cara Apply Profile dan Template

Aturan aman:

- Apply template hanya otomatis saat `chartOfAccounts` kosong.
- Jika akun sudah ada, tampilkan mode import/merge.
- Merge mencocokkan berdasarkan `code` dan/atau `template_account_id`.
- Jangan overwrite nama akun user tanpa konfirmasi.
- Jangan mengubah akun yang sudah dipakai transaksi kecuali hanya menambah field non-destruktif.
- Mapping category finance boleh ditawarkan untuk diupdate setelah template diterapkan.
- `accountingProfileSetting` boleh diupdate setelah preview disetujui.
- `enabledModules` boleh diupdate setelah data safety check dan konfirmasi.
- Jika data safety check menemukan backup/restore finance belum lengkap, tahan aktivasi module baru yang menulis table accounting/finance baru.

Mode apply:

```txt
CREATE_NEW_STORE
  Untuk database/toko baru. Seed penuh dari template.

MERGE_MISSING_ONLY
  Tambahkan akun template yang belum ada. Tidak mengubah akun existing.

UPDATE_MAPPING_ONLY
  Tidak menambah akun. Hanya membantu mapping category finance ke akun existing.

UPDATE_PROFILE_ONLY
  Mengubah profile/extension aktif tanpa apply template. Cocok untuk toko yang sudah punya COA manual.

ACTIVATE_MODULES_ONLY
  Mengaktifkan module yang sudah siap tanpa mengubah daftar akun.
```

## UI Yang Disarankan

Lokasi:

```txt
/finance/chart-of-accounts
```

Tambahkan panel atau modal `Template Akun`:

- Tampilkan profile aktif dari `accountingProfileSetting`.
- Pilih accounting profile.
- Pilih industry extension.
- Preview daftar akun template.
- Preview akun yang akan ditambah.
- Preview mapping yang akan berubah.
- Preview module yang akan aktif/nonaktif.
- Warning jika backup/restore finance belum lulus data safety check.
- Button apply template.
- Button simpan profile/module activation jika user tidak ingin apply template.

Untuk fase ini jangan buat wizard panjang di Settings. Tetap dekatkan ke modul Daftar Akun.

## Acceptance Criteria

- User bisa melihat profile/extension aktif toko.
- User bisa mengubah profile/extension lewat flow yang menampilkan preview dampak.
- User bisa melihat template `SAK_EMKM + RETAIL`.
- User bisa apply template hanya jika aman.
- Apply template tidak menghapus akun existing.
- Apply template tidak mengubah transaksi lama.
- Mapping finance bisa dibuat/diupdate dari template.
- Module activation tersimpan di `enabledModules`.
- Module lanjut tetap nonaktif jika belum ada fondasi domain/report.
- Flow menahan aktivasi berisiko jika backup/restore finance belum lulus data safety check.
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
- update profile only.
- activate modules only.
- duplicate code handling.
- preview perubahan sebelum apply.
