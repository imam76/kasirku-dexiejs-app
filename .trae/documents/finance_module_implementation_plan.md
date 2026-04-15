# Plan Modul Keuangan (Finance Module) - Aplikasi POS

Modul ini akan mengimplementasikan sistem pencatatan keuangan yang terintegrasi dengan transaksi POS, mencakup saldo awal, pemasukan, pengeluaran, dan perhitungan laba bersih.

## 1. Persiapan Database & Tipe Data
- **Update `src/types/index.ts`**: Menambahkan interface `FinanceTransaction` dan `FinanceBalance`.
- **Update `src/lib/db.ts`**: Menambahkan tabel `financeTransactions` dan `financeBalance` ke Dexie.js.

## 2. Implementasi Logic (Hooks)
- **Buat `src/hooks/useFinance.tsx`**:
    - `setOpeningBalance`: Mengatur saldo awal harian/shift.
    - `addIncome`: Menambah pemasukan manual.
    - `addExpense`: Menambah pengeluaran manual.
    - `getFinanceSummary`: Menghitung total saldo awal, pemasukan, pengeluaran, dan laba bersih.
    - `getFinanceLogs`: Mengambil riwayat transaksi keuangan.
- **Update `src/hooks/useTransaction.tsx`**:
    - Menambahkan "Finance Bridge": Setiap kali transaksi POS berhasil, otomatis mencatat `total_amount` sebagai pemasukan di `financeTransactions`.

## 3. Implementasi UI (View & Components)
- **Buat `src/view/FinanceManagement.tsx`**:
    - Dashboard ringkasan (Cards).
    - Tabel riwayat transaksi keuangan.
    - Modal/Form untuk Saldo Awal, Pemasukan Manual, dan Pengeluaran.
- **Buat `src/routes/finance.lazy.tsx`**: Mendaftarkan route baru untuk modul keuangan.

## 4. Integrasi & Navigasi
- **Update `src/App.tsx` atau Sidebar**: Menambahkan link navigasi ke modul Keuangan.

## Langkah-langkah Detail:

### Fase 1: Database & Finance Bridge
1. Modifikasi `src/types/index.ts` untuk menambahkan tipe data baru.
2. Modifikasi `src/lib/db.ts` untuk menambahkan tabel baru.
3. Update `src/hooks/useTransaction.tsx` untuk mencatat transaksi POS ke modul keuangan.

### Fase 2: Logic & UI Utama
1. Implementasi `src/hooks/useFinance.tsx`.
2. Implementasi `src/view/FinanceManagement.tsx`.
3. Tambahkan route di `src/routes/finance.lazy.tsx`.

### Fase 4: Perbaikan Sinkronisasi Laba & Pengeluaran Operasional (Bug Fix)
1. **Sinkronisasi Profit dengan Pengeluaran Manual**:
    - Update `useProfit.tsx`: Modifikasi `recalculateMutation` untuk menyertakan transaksi pengeluaran manual (EXPENSE) dari `financeTransactions` ke dalam perhitungan saldo keuntungan.
    - Update `useFinance.tsx`: Modifikasi `addTransactionMutation` agar otomatis memperbarui `profitBalance` saat ada pengeluaran/pemasukan manual yang memengaruhi laba.
2. **Verifikasi Perhitungan**:
    - Saldo Keuntungan = (Total Laba Kotor dari Penjualan) + (Pemasukan Manual non-Penjualan) - (Pengeluaran Manual) - (Penarikan Saldo).
