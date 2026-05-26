# Accounting Core - Fase 3 Integrasi Modul dan Reporting Ringan

Fase ini menghubungkan COA dengan modul finance yang sudah ada atau sedang direncanakan. Fokusnya tetap ringan: filter, grouping, account snapshot, dan mapping di atas operational cash-flow layer. Fase ini belum membuat general ledger.

## Tujuan

- Cash-flow bisa difilter dan digroup berdasarkan akun.
- Transaksi finance punya konteks akun tanpa mengubah saldo.
- Modul AR, Sales Return, AP, dan Cash/Bank punya jalur account reference yang konsisten.
- User bisa melihat transaksi yang belum dipetakan ke akun.
- Data sudah siap jika nanti masuk general ledger.

## Prinsip

- `financeTransactions` tetap operational cash-flow layer.
- Operational cash-flow bukan accounting ledger dan tidak boleh dipakai untuk klaim debit/kredit.
- Account snapshot tidak boleh mengubah `amount`, `type`, `category`, `reference_id`, atau `created_at`.
- Account snapshot hanya memperkaya konteks laporan.
- Modul lain tidak boleh langsung menulis rule COA sendiri. Gunakan service/helper mapping yang sama.
- Integrasi dibuat bertahap per modul, bukan refactor besar sekaligus.

## Cash-Flow Reporting

Update screen finance cash-flow:

- Tambah kolom `Akun`.
- Tambah filter account.
- Tambah filter account type.
- Tambah badge `Belum Dipetakan`.
- Tambah ringkasan per account type.
- Tambah ringkasan transaksi tanpa mapping.

Contoh summary:

```txt
Kas/Bank                 Rp xx
Pendapatan               Rp xx
Beban                    Rp xx
Belum Dipetakan          Rp xx
```

Catatan:

- Ini bukan neraca.
- Ini bukan laba rugi akuntansi.
- Ini hanya view operational cash-flow berdasarkan snapshot akun.

## Mapping Health Check

Tambahkan panel kecil di `Daftar Akun` atau cash-flow:

- Category finance yang belum punya mapping.
- Mapping yang mengarah ke akun inactive.
- Mapping yang mengarah ke akun non-postable.
- Jumlah transaksi tanpa account snapshot.

Action yang aman:

- Update mapping category.
- Backfill snapshot untuk transaksi lama berdasarkan mapping terbaru.

Backfill harus eksplisit dari user. Jangan otomatis mengubah transaksi lama tanpa konfirmasi.

## Accounts Receivable

Untuk AR, jangan memaksa full COA. Payment ledger tetap menjadi fondasi.

Integrasi yang disarankan:

- `salesInvoicePayments.account_id?`
- `salesInvoicePayments.account_code?`
- `salesInvoicePayments.account_name?`
- `salesInvoicePayments.account_type?`
- optional `cash_account_id` jika nanti multi kas/bank dibutuhkan.

Aturan:

- Invoice unpaid tidak menaikkan cash-flow.
- Payment invoice mencatat cash-flow lewat `financeTransactions`.
- Payment invoice default mapping ke kas/bank.
- Revenue dan margin invoice tetap dihitung dari sales document/report, bukan dari transaksi payment.
- Jika payment dibatalkan, reversal finance transaction ikut punya snapshot akun.

## Sales Return

Integrasi yang disarankan:

- `REFUND_PENJUALAN` mapping ke akun retur/refund atau kas/bank sesuai sudut pandang cash-flow fase ini.
- Finance refund dan reversal menyimpan snapshot akun.
- Jangan jadikan refund sebagai operational expense.
- Jangan membuat retur mengurangi profit dua kali.

Catatan:

- Sales Return sudah punya jalur finance refund/reversal.
- Integrasi COA tidak boleh mengubah aturan void/reversal yang sudah ada.

## Accounts Payable

Jika AP dibuat setelah COA:

- Supplier invoice bisa refer ke `2000 Hutang Usaha`.
- Payment AP bisa refer ke cash/bank.
- Ledger pembayaran AP sebaiknya append-only seperti AR.
- COA tidak wajib untuk AP fase awal, tetapi account snapshot membuat laporan lebih siap.

Field yang bisa dipertimbangkan:

```ts
account_id?: string;
account_code?: string;
account_name?: string;
cash_account_id?: string;
reversal_finance_transaction_id?: string;
```

## Cash/Bank

Jika multi kas/bank dibutuhkan:

- Tambah konsep `cashAccounts` atau gunakan COA akun kas/bank yang `is_postable=true`.
- Payment channel di AR/AP bisa menunjuk ke akun kas/bank.
- Transfer antar kas/bank tidak boleh dianggap income/expense.

Jangan membuat full general ledger hanya untuk memilih rekening penerima pembayaran. Field `cash_account_id` sudah cukup untuk fase ringan.

## Stock Purchase

Mapping fase ringan:

```txt
PEMBELIAN_STOK -> 5100 Pembelian Stok
```

Alternatif saat accounting lebih matang:

```txt
Pembelian barang untuk dijual -> Persediaan Barang
Saat barang terjual           -> HPP
```

Keputusan fase ini:

- Jangan ubah perilaku stock purchase dulu.
- Biarkan cash-flow tetap mencatat pembelian stok sebagai expense/cash-out sesuai model saat ini.
- Perubahan menjadi inventory accounting penuh masuk Fase 4 atau Fase 5.

## Backup dan Restore

Backup/restore tetap menjadi prioritas data safety untuk setiap integrasi finance.

Pastikan table/field baru ikut backup:

- account snapshot di finance transaction sudah bagian dari `financeTransactions`.
- field account di payment ledger jika AR/AP sudah dibuat.
- mapping table tetap ikut backup.
- `accountingProfileSetting` dan `enabledModules` tetap ikut backup karena menentukan gate/module yang aktif.

Restore harus menjaga data lama:

- Jika akun tidak ditemukan, snapshot tetap ditampilkan dari transaksi.
- Jangan drop transaksi karena account reference tidak ada.

## Acceptance Criteria

- Cash-flow bisa filter/group by akun.
- Transaksi tanpa akun tetap tampil.
- Mapping health check bisa menunjukkan gap.
- Backfill snapshot hanya berjalan jika user memilih action eksplisit.
- AR payment bisa menyimpan cash/account snapshot jika modul AR sudah ada.
- Sales Return refund/reversal tetap berjalan dengan account snapshot.
- Tidak ada jurnal debit/kredit di fase ini.

## Validasi Teknis

Minimal:

```txt
bun run build
bun run lint
```

Prioritas test:

- transaksi dengan mapping tampil dengan akun.
- transaksi tanpa mapping tampil `Belum Dipetakan`.
- update mapping tidak merusak transaksi lama.
- backfill tidak mengubah amount/type/category.
- Sales Return refund/reversal masih balance.
