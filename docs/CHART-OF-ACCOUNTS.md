# Accounting Core Roadmap - Chart of Accounts, Operational Finance, dan Ledger Platform

Dokumen ini adalah dokumen induk untuk arah Accounting Core di Frayukti. Chart of Accounts tetap menjadi fondasi awal, tetapi roadmap ini lebih luas dari sekadar daftar akun: ada operational finance, accounting profile, template akun, module activation, feature gate, dan jalur menuju general ledger.

Target awal bukan "full accounting compliance". Target awal adalah fondasi Accounting Core yang aman: `Daftar Akun` sebagai katalog akun, mapping category finance, account snapshot, default accounting profile, feature gate awal, dan backup/restore yang tidak menjatuhkan data finance. Setelah itu baru masuk profile/template/module activation, reporting ringan, general ledger, dan extension industri/pemerintahan jika produknya memang butuh.

## Keputusan Utama

- COA masuk ke menu `Keuangan`, bukan `Master Data` dan bukan `Settings`.
- Label menu fase awal: `Daftar Akun`.
- Route fase awal: `/finance/chart-of-accounts`.
- Permission fase awal cukup memakai `FINANCE_ACCESS`.
- Roadmap ini disebut Accounting Core / Accounting Platform Roadmap, bukan COA roadmap murni.
- Fase awal tidak mengganti cash-flow engine yang sekarang masih category-based.
- Fase awal tidak membuat jurnal umum, buku besar, neraca, atau double-entry posting.
- COA fase awal dipakai sebagai katalog akun dan mapping category finance.
- `financeTransactions` tetap menjadi operational cash-flow layer yang sudah ada, bukan accounting ledger.
- General ledger, jika nanti dibuat, memakai ledger table terpisah seperti `journalEntries` dan `journalEntryLines`.
- Feature gate tidak menunggu Fase 5. Fondasi awal sudah perlu `accountingProfileSetting` dan `enabledModules` supaya module accounting tidak aktif asal semua.
- POS `/transaction` dan Finance > Sales `/finance/sales` tidak boleh berubah perilaku karena COA.
- Template standar akuntansi dibuat sebagai fase berikutnya bersama profile dan module activation, bukan syarat untuk CRUD COA awal.
- Backup/restore finance adalah prioritas data safety sebelum menambah table accounting baru.
- Jangan klaim support SAK/PSAK/PSAP hanya karena daftar akun tersedia. Compliance butuh posting rules, report, disclosure, dan audit trail yang sesuai.

## Audit Kondisi Project Saat Ini

Yang sudah ada:

- Finance sudah menjadi parent route di `src/routes/finance/index.tsx`.
- Child Finance yang sudah ada: `/finance/cash-flow`, `/finance/sales`, dan Sales Return di `/finance/sales/returns`.
- Sidebar Finance group sudah ada di `src/routes/__root.tsx`.
- Route permission Finance memakai `FINANCE_ACCESS` di `src/auth/routePermissions.ts`.
- Role `OWNER` dan `ADMIN` punya `FINANCE_ACCESS`; `KASIR` dan `GUDANG` tidak.
- `FinanceTransaction` saat ini menyimpan `type`, `category`, `amount`, `description`, `created_at`, dan `reference_id`.
- `src/constants/finance.ts` sudah menjadi pusat category cash flow seperti `PENJUALAN`, `PEMBELIAN_STOK`, `PEMBAYARAN_INVOICE_PENJUALAN`, dan `REFUND_PENJUALAN`.
- `src/services/financeService.ts` masih menghitung saldo dari category dan type transaksi.
- Dexie sudah punya table `financeTransactions` dan `financeBalance` sejak schema `version(6)`.
- Schema Dexie live sudah sampai `version(18)` untuk `salesReturns` dan `salesReturnItems`.
- Pattern mutasi data penting di repo ini: service layer + permission guard + activity log.
- `src/utils/backupRestore.ts` sudah membawa banyak table operasional seperti POS, stok, profit, promo, master data, sales document, sales return, auth user, dan activity log.
- Temuan data safety: `src/utils/backupRestore.ts` saat ini belum export/import `financeTransactions` dan `financeBalance`, padahal keduanya adalah sumber operational cash-flow. Ini harus diaudit dan dibenahi sebelum atau bersamaan dengan fondasi Accounting Core.
- `package.json` menyediakan `dev`, `build`, `lint`, `preview`, dan `tauri`; belum ada test runner khusus.

Yang belum ada:

- Table `chartOfAccounts`.
- Mapping category finance ke akun akuntansi.
- Table `accountingProfileSetting` untuk profile aktif toko.
- Table `enabledModules` untuk feature gate/module activation.
- Snapshot akun di `financeTransactions`.
- UI Daftar Akun.
- Report yang bisa difilter/group by akun.
- Template COA per standar.
- Jurnal debit/kredit.
- Buku besar, neraca saldo, laba rugi akuntansi, balance sheet, closing period.

Kesimpulan: implementasi Accounting Core harus dimulai dari fondasi ringan yang sesuai repo sekarang. COA adalah bagian awalnya, tetapi data safety backup/restore, operational cash-flow boundary, profile setting, dan feature gate harus masuk fondasi. Full accounting engine dipisah sebagai fase lanjut.

## Pemosisian Standar

Standar dan domain di bawah ini jangan dicampur menjadi satu pilihan datar.

```txt
Accounting Profile:
- SAK_EMKM
- SAK_EP
- PSAK_FULL
- PSAP

Industry Extension:
- RETAIL
- MANUFACTURING
- CONSTRUCTION
- NONE
```

Kombinasi yang masuk akal:

```txt
SAK_EMKM + RETAIL
SAK_EP + RETAIL
SAK_EP + MANUFACTURING
PSAK_FULL + MANUFACTURING
PSAK_FULL + CONSTRUCTION
PSAP + NONE
```

Catatan grooming:

- Untuk produk baru, gunakan `SAK_EP` sebagai pengganti arah `SAK_ETAP`. `SAK_ETAP` cukup diperlakukan sebagai legacy/import/migration label jika nanti memang dibutuhkan.
- `SAK_EMKM` adalah default paling cocok untuk Frayukti fase awal karena aplikasinya masih dominan POS, stok, cash-flow, dan invoice sederhana.
- `PSAK_FULL` jangan disamakan dengan hanya menambah akun lebih banyak. Fase ini butuh general ledger, posting rules, laporan akrual, dan kontrol periode.
- `MANUFACTURING` dan `CONSTRUCTION` adalah extension industri, bukan standar tunggal. Keduanya harus menempel pada profile seperti `SAK_EP` atau `PSAK_FULL`.
- Konstruksi baru sebaiknya diarahkan ke model pendapatan kontrak berbasis PSAK 72, bukan menjadikan PSAK 34/44 sebagai fondasi baru.
- `PSAP` adalah jalur pemerintahan berbasis akrual dan berbeda dari bisnis retail. Jangan campur konsep laba/rugi retail ke profile ini.

## Fondasi Feature Gate

Feature gate harus tersedia sejak fase fondasi, bukan baru muncul di extension industri. Minimal ada dua konsep:

```txt
accountingProfileSetting
- menyimpan profile aktif toko, industry extension, template terakhir, dan status lock ringan.

enabledModules
- menyimpan module accounting/finance mana yang aktif untuk toko ini.
```

Default awal Frayukti:

```txt
accounting_profile: SAK_EMKM
industry_extension: RETAIL

enabledModules:
- CHART_OF_ACCOUNTS: true
- CASH_FLOW_ACCOUNT_FILTER: false sampai snapshot akun siap di UI
- ACCOUNT_TEMPLATES: false sampai Fase 2
- GENERAL_LEDGER: false
- MANUFACTURING: false
- CONSTRUCTION: false
- PSAP_REPORTING: false
```

Gate ini bukan untuk menyembunyikan bug. Gate dipakai agar modul yang belum punya domain flow, report, atau ledger foundation tidak muncul sebagai fitur siap pakai.

## Pembagian Dokumen Fase

1. [Fase 1 - Fondasi Accounting Core Operasional](./CHART-OF-ACCOUNTS-PHASE-1-FOUNDATION.md)
   Audit backup/restore finance, CRUD Daftar Akun, default COA retail sederhana, mapping category finance, snapshot akun di operational cash-flow, `accountingProfileSetting`, `enabledModules`, dan report ringan di cash-flow.

2. [Fase 2 - Profile, Template, dan Module Activation](./CHART-OF-ACCOUNTS-PHASE-2-TEMPLATES.md)
   Pemilihan accounting profile, industry extension, template COA `SAK_EMKM`, `SAK_EP`, `PSAK_FULL`, `PSAP`, aturan apply template, dan aktivasi module yang aman berdasarkan gate.

3. [Fase 3 - Integrasi Modul dan Reporting Ringan](./CHART-OF-ACCOUNTS-PHASE-3-REPORTING-INTEGRATION.md)
   Integrasi COA ke Accounts Receivable, Sales Return, future Accounts Payable, Cash/Bank, dan laporan grouping/filter by akun tanpa membuat general ledger.

4. [Fase 4 - General Ledger dan Double Entry](./CHART-OF-ACCOUNTS-PHASE-4-GENERAL-LEDGER.md)
   Jurnal umum, journal lines, posting rules debit/kredit, buku besar, trial balance, laba rugi, balance sheet, dan closing period.

5. [Fase 5 - Extension Industri dan Pemerintahan](./CHART-OF-ACCOUNTS-PHASE-5-INDUSTRY-GOVERNMENT.md)
   Manufaktur, konstruksi, dan PSAP sebagai jalur lanjut setelah general ledger atau setelah kebutuhan domainnya jelas.

Production gate:

- [Accounting Core - Production Readiness](./CHART-OF-ACCOUNTS-PRODUCTION-READINESS.md)
  Alur kerja untuk menyelesaikan blocker production COA/General Ledger: activation guard, cutoff, opening balance, inventory accounting, payment channel, period lock, manual journal permission, backup/restore, automated tests, dan QA matrix.

## Urutan Implementasi Yang Disarankan

Urutan aman untuk repo sekarang:

Sebelum Fase 1: audit dan benahi backup/restore finance supaya `financeTransactions`, `financeBalance`, dan table accounting baru tidak hilang saat backup/restore.

1. Kerjakan Fase 1 dulu sampai stabil: COA operasional, profile default, feature gate awal, dan snapshot akun.
2. Setelah data transaksi sudah punya snapshot akun, tambahkan Fase 2 untuk profile, template, dan module activation.
3. Integrasikan ke AR, Sales Return, AP, dan Cash/Bank lewat Fase 3.
4. Mulai Fase 4 hanya jika produk benar-benar membutuhkan laporan akuntansi penuh.
5. Mulai Fase 5 hanya jika target user sudah jelas: manufaktur, konstruksi, atau instansi pemerintah.

Jangan mengerjakan Fase 2 sampai Fase 5 bersamaan dengan CRUD COA awal. Itu terlalu luas dan akan berisiko mengubah behavior finance yang sekarang sudah dipakai. Tetapi feature gate dasar dan audit backup/restore tetap bagian dari Fase 1 karena keduanya adalah fondasi safety.

## Prinsip Arsitektur

- `financeTransactions` tetap operational cash-flow layer.
- Operational cash-flow bukan accounting ledger dan tidak boleh dipakai untuk klaim debit/kredit.
- `chartOfAccounts` menjadi katalog akun dan sumber snapshot.
- `financeAccountMappings` menghubungkan category finance ke akun.
- `accountingProfileSetting` menyimpan profile accounting aktif per toko.
- `enabledModules` mengontrol module accounting/finance yang aktif.
- Snapshot akun di transaksi menjaga histori tetap stabil saat akun diedit.
- Template COA adalah blueprint. Saat diterapkan, template dicopy ke `chartOfAccounts`, bukan dipakai sebagai data transaksi langsung.
- General ledger, jika nanti dibuat, menjadi accounting ledger terpisah dari cash-flow.
- Cash-flow tetap bisa hidup berdampingan dengan ledger karena user operasional tetap butuh tampilan kas masuk/keluar sederhana.
- Backup/restore adalah kontrak data safety untuk semua table finance/accounting. Setiap table baru wajib masuk backup sejak fase pertamanya.
- Service layer tetap menjadi tempat mutasi penting. Hook tidak boleh menulis rule bisnis langsung ke Dexie.

## Batas Klaim Produk

Bahasa yang aman untuk fase awal:

```txt
Mendukung Daftar Akun dan mapping transaksi finance.
Menyediakan template awal SAK EMKM retail.
Menyiapkan jalan menuju general ledger.
```

Bahasa yang belum boleh dipakai di fase awal:

```txt
Compliant PSAK/IFRS penuh.
Compliant PSAP.
Laporan keuangan audit-ready.
Manufaktur lengkap.
Konstruksi lengkap.
```

## Validasi Teknis

Minimal setelah implementasi fase yang menyentuh kode:

```txt
bun run build
bun run lint
```

Prioritas test manual fase awal:

- POS checkout tetap berjalan seperti sebelumnya.
- Finance cash-flow tetap menghitung saldo seperti sebelumnya.
- Finance > Sales payment tidak berubah perilaku.
- Sales Return refund/reversal tidak berubah perilaku.
- Backup/restore membawa `financeTransactions`, `financeBalance`, table COA, mapping, `accountingProfileSetting`, dan `enabledModules`.
- Role `KASIR` dan `GUDANG` tidak melihat menu COA.
- Transaksi tanpa akun tetap tampil sebagai `Belum Dipetakan`.
