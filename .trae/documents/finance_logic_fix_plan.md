# Rencana Perbaikan Logika Keuangan

Bug: Saldo kas (Uang di Tangan) tidak akurat karena HPP dikurangi saat transaksi penjualan, padahal modal sudah keluar saat pembelian stok.

## 1. Perbaikan di `useTransaction.tsx`
- [x] Ubah kalkulasi `newFinanceBalance` agar hanya menambah `total` penjualan tanpa dikurangi `totalHpp`.
- [x] Hapus pencatatan transaksi pengeluaran otomatis `HPP_OTOMATIS` di tabel `financeTransactions`.
- [x] Pastikan `profitLogs` tetap mencatat keuntungan bersih (`total - totalHpp`) untuk laporan laba.

## 2. Perbaikan di `useFinance.tsx`
- [x] Bersihkan logika `addTransactionMutation` dari pengecekan `HPP_OTOMATIS`.
- [x] Perbarui fungsi `recalculate` agar tidak lagi membuat entri `HPP_OTOMATIS` dari data transaksi POS.
- [x] Pastikan `recalculate` menghitung saldo berdasarkan data yang baru (tanpa HPP otomatis).
- [x] Tambahkan integrasi `PEMBELIAN_STOK` ke dalam logika `recalculate`.

## 3. Perbaikan di `useProfit.tsx`
- [x] Perbarui fungsi `recalculate` agar konsisten dengan perubahan di modul keuangan (hapus referensi `HPP_OTOMATIS`).
- [x] Pastikan `PEMBELIAN_STOK` tidak masuk ke log laba untuk menghindari double-counting dengan HPP.

## 4. Integrasi Manajemen Stok
- [x] Update `useStockManagement.tsx` agar setiap penambahan stok (manual/import) mencatat pengeluaran di sistem keuangan.

## 5. Verifikasi
- [x] Pastikan laporan penjualan tetap menampilkan Pendapatan Kotor dan Laba Bersih dengan benar.
- [x] Pastikan laporan pengeluaran di Manajemen Keuangan hanya menampilkan pengeluaran manual (seperti beli stok atau operasional).
- [x] Pastikan fitur "Hitung Ulang" di kedua modul menghasilkan saldo yang benar.

---
*Status: Implementasi Selesai.*
