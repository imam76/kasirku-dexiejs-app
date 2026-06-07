# Cash & Bank

Dokumen ini adalah panduan pengerjaan modul Cash & Bank untuk kondisi Kasirku saat ini. Targetnya: arus uang operasional tetap sederhana, saldo kas/bank bisa dipantau per akun, payment dari POS/AR/AP tetap tersambung ke cash-flow, dan General Ledger tetap menjadi lapisan akuntansi terpisah.

## Ringkasan Keputusan

- Cash & Bank berada di menu Finance.
- Route existing `/finance/cash-flow` tetap dipakai untuk menjaga kompatibilitas route dan permission.
- Label UI boleh berubah menjadi `Cash & Bank` karena scope halaman sudah berkembang dari arus kas umum menjadi pemantauan kas/bank.
- `financeTransactions` tetap menjadi operational cash-flow layer, bukan accounting ledger.
- `chartOfAccounts` tetap menjadi master akun. Cash & Bank hanya memakai akun bertipe `ASSET` sebagai akun kas/bank operasional.
- AR/AP payment ledger tetap menjadi source of truth histori pembayaran invoice.
- General Ledger tetap menjadi source of truth jurnal debit/kredit.

## Kondisi Project Saat Ini

Yang sudah tersedia:

- Finance parent route dan child route `/finance/cash-flow`.
- `financeTransactions` dan `financeBalance` untuk cash-flow operasional.
- Chart of Accounts dengan akun awal:
  - `1000 Kas dan Bank`
  - `1010 Kas Tunai`
  - `1020 Bank / Non Tunai`
- Account snapshot di `financeTransactions`.
- Sales Invoice payment ledger (`salesInvoicePayments`) dengan `payment_method`, `payment_channel`, dan `cash_account_id`.
- Purchase Invoice payment ledger (`purchaseInvoicePayments`) dengan pola serupa.
- AR/AP payment sudah menulis cash-flow dan journal saat GL ready.
- Backup/restore sudah membawa finance, COA, AR/AP payment, dan GL tables.

Gap utama:

- Belum ada label modul Cash & Bank yang eksplisit.
- Belum ada ringkasan saldo per akun kas/bank.
- POS cash-flow belum menyimpan snapshot akun kas/bank terpisah dari account mapping revenue.
- Manual finance transaction belum bisa memilih akun kas/bank.
- Belum ada transfer antar kas/bank.
- Belum ada rekonsiliasi bank.

## Batas Modul

Masuk Cash & Bank:

- Saldo per akun kas/bank.
- Riwayat uang masuk dan uang keluar.
- Payment channel seperti Tunai, QRIS, transfer, EDC, atau e-wallet.
- Transfer antar akun kas/bank.
- Opening balance per akun kas/bank.
- Void/reversal cash-flow yang menjaga histori.
- Rekonsiliasi bank di fase lanjutan.

Tidak masuk Cash & Bank:

- CRUD Chart of Accounts. Tetap di Finance > Daftar Akun.
- Jurnal Umum dan laporan debit/kredit. Tetap di Finance > General Ledger.
- Piutang dan Hutang. Tetap modul AR/AP, Cash & Bank hanya membaca payment cash movement.
- Sales/Purchase document. Tetap di modul dokumen masing-masing.
- Inventory valuation. Masuk modul Inventory/Accounting berikutnya.

## Prinsip Data

`financeTransactions.account_*` menjelaskan mapping finance/accounting snapshot.

`financeTransactions.cash_account_*` menjelaskan akun kas/bank operasional yang benar-benar menerima atau mengeluarkan uang.

Contoh:

- POS sale:
  - `account_*` bisa tetap `Penjualan POS`.
  - `cash_account_*` berisi `Kas Tunai` atau `Bank / Non Tunai`.
- Sales Invoice payment:
  - payment ledger adalah source document.
  - `financeTransactions` menyimpan cash-flow.
  - `cash_account_*` mengikuti akun kas/bank payment.
- Purchase Invoice payment:
  - payment ledger adalah source document.
  - cash-flow keluar dari `cash_account_*` payment.

## Fase 1 - Cash & Bank Foundation

Tujuan:

- Ubah label `Arus Kas / Cash Flow` menjadi `Cash & Bank`.
- Tambahkan snapshot akun kas/bank ke `financeTransactions` tanpa mengubah perhitungan saldo existing.
- Tampilkan ringkasan saldo per akun kas/bank yang sudah terpetakan.
- Pertahankan route `/finance/cash-flow`.

File target:

- `src/types/index.ts`
- `src/services/checkoutService.ts`
- `src/services/financeService.ts`
- `src/services/accountsReceivableService.ts`
- `src/services/accountsPayableService.ts`
- `src/services/stockPurchaseService.ts`
- `src/services/salesReturnService.ts`
- `src/view/finance/FinanceManagement.tsx`
- `src/i18n/messages.ts`
- `src/routes/finance/index.tsx`
- `src/routes/__root.tsx`

Acceptance criteria:

- Menu Finance menampilkan `Cash & Bank`.
- Halaman Cash & Bank tetap bisa dibuka dari `/finance/cash-flow`.
- POS tunai/non-tunai baru menyimpan `cash_account_*`.
- AR/AP payment dan void payment menyimpan `cash_account_*`.
- Stock purchase dan sales refund cash-flow menyimpan `cash_account_*` minimal default tunai.
- Ringkasan per akun tidak mengklaim sebagai ledger debit/kredit.
- `financeBalance` tetap dihitung seperti sebelumnya.

## Fase 2 - Manual Cash Movement

Tujuan:

- Tambahkan pilihan akun kas/bank di form:
  - Tambah Saldo / Modal
  - Tambah Pemasukan Manual
  - Catat Pengeluaran
- Tambahkan optional `payment_channel`.
- Validasi akun harus `ASSET`, aktif, dan postable.
- Default:
  - `TUNAI` -> Kas Tunai
  - `NON_TUNAI` -> Bank / Non Tunai

Catatan:

- Jangan membuat table baru hanya untuk manual movement jika `financeTransactions` masih cukup.
- Jangan memindahkan AR/AP payment history ke Cash & Bank.

## Fase 3 - Transfer Antar Kas/Bank

Tujuan:

- User bisa memindahkan dana dari satu akun kas/bank ke akun kas/bank lain.
- Transfer tidak mengubah total `financeBalance`.
- Transfer harus punya histori yang jelas.

Opsi data ringan:

- Buat dua `financeTransactions` berpasangan:
  - cash-out dari akun sumber
  - cash-in ke akun tujuan
- Simpan `transfer_group_id` jika nanti field ditambahkan.

Acceptance criteria:

- Total saldo semua kas/bank tidak berubah oleh transfer.
- Saldo sumber berkurang dan saldo tujuan bertambah.
- Void transfer harus membalik kedua sisi.

## Fase 4 - Bank Reconciliation

Tujuan:

- Tandai transaksi bank sebagai sudah cocok dengan mutasi bank.
- Simpan tanggal rekonsiliasi, catatan, dan user.
- Fokus ke akun `NON_TUNAI`/bank dulu.

Tidak dikerjakan di awal:

- Import mutasi bank otomatis.
- Matching otomatis.
- Multi-currency.

## QA Minimal

1. Buat POS tunai, pastikan summary Kas Tunai bertambah.
2. Buat POS non-tunai, pastikan summary Bank / Non Tunai bertambah.
3. Record payment Sales Invoice, pastikan cash-flow masuk ke akun yang dipilih.
4. Record payment Purchase Invoice, pastikan cash-flow keluar dari akun yang dipilih.
5. Void payment AR/AP, pastikan reversal masuk ke akun yang sama.
6. Jalankan backup/restore manual bila ada perubahan schema baru.
7. Pastikan General Ledger tetap menghasilkan jurnal dari service existing.

## Hal Yang Sengaja Ditunda

- Table khusus bank account.
- Import rekening koran.
- Rekonsiliasi otomatis.
- Transfer antar kas/bank.
- Opening balance per akun dengan form khusus.
- Perubahan besar ke route `/finance/cash-flow`.

Kesimpulan: Cash & Bank fase awal sebaiknya memperkuat cash-flow existing, bukan membuat engine baru. Setelah saldo per akun kas/bank stabil, baru lanjut ke transfer dan rekonsiliasi.
