# Accounting Core - Fase 4 General Ledger dan Double Entry

Fase ini adalah titik ketika Frayukti mulai masuk ke accounting engine penuh. Jangan mulai fase ini sebelum Fase 1 sampai 3 stabil dan kebutuhan report akuntansi benar-benar jelas.

## Tujuan

- Menambahkan jurnal umum debit/kredit.
- Membuat buku besar per akun.
- Membuat trial balance.
- Membuat laba rugi akuntansi.
- Membuat balance sheet.
- Menyiapkan closing period.
- Menjaga cash-flow operasional tetap berjalan berdampingan.

## Prinsip

- `chartOfAccounts` dari Fase 1 tetap dipakai sebagai master akun.
- `financeTransactions` tetap operational cash-flow layer, bukan accounting ledger.
- `journalEntries` dan `journalEntryLines` menjadi accounting ledger.
- `enabledModules.GENERAL_LEDGER` baru boleh aktif setelah table ledger, posting rules, backup/restore, dan report minimal siap.
- Source document tidak boleh langsung menulis line jurnal di UI. Posting dilakukan di service layer.
- Posting harus idempotent berdasarkan source document dan event.
- Void/reversal harus membuat reversal journal, bukan menghapus jejak.

## Data Model Yang Disarankan

```ts
export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'VOIDED' | 'REVERSED';

export type JournalSourceType =
  | 'POS_TRANSACTION'
  | 'STOCK_PURCHASE'
  | 'SALES_INVOICE'
  | 'SALES_INVOICE_PAYMENT'
  | 'SALES_RETURN'
  | 'ACCOUNTS_PAYABLE'
  | 'MANUAL_JOURNAL'
  | 'OPENING_BALANCE';

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  status: JournalEntryStatus;
  source_type: JournalSourceType;
  source_id?: string;
  source_number?: string;
  description: string;
  total_debit: number;
  total_credit: number;
  posted_at?: string;
  voided_at?: string;
  reversed_entry_id?: string;
  created_at: string;
  updated_at: string;
}

export interface JournalEntryLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  debit: number;
  credit: number;
  description?: string;
  department_id?: string;
  project_id?: string;
  created_at: string;
}
```

Dexie table contoh:

```ts
this.version(nextVersion).stores({
  journalEntries: 'id, entry_number, entry_date, status, source_type, source_id, created_at',
  journalEntryLines: 'id, journal_entry_id, account_id, created_at'
});
```

## Posting Rules Awal

Rules harus ditulis sebagai pure helper + service posting, bukan scattered di komponen.

### POS Sale Tunai

Jika memakai inventory accounting:

```txt
Dr Kas/Bank
  Cr Penjualan POS

Dr HPP
  Cr Persediaan Barang
```

Jika fase inventory accounting belum siap, jangan posting HPP akuntansi penuh. Tetap gunakan profit report existing sampai policy final.

### Stock Purchase Tunai

Inventory accounting:

```txt
Dr Persediaan Barang
  Cr Kas/Bank
```

Cash-flow existing tetap boleh menampilkan cash-out pembelian stok.

### Sales Invoice Issued

```txt
Dr Piutang Usaha
  Cr Pendapatan Sales Invoice
```

Jika pajak sudah aktif:

```txt
Dr Piutang Usaha
  Cr Pendapatan Sales Invoice
  Cr Pajak Keluaran
```

### Sales Invoice Payment

```txt
Dr Kas/Bank
  Cr Piutang Usaha
```

Jangan lagi menganggap payment invoice sebagai revenue baru jika invoice sudah diposting saat issued.

### Sales Return

Refund/credit note perlu rule terpisah:

```txt
Dr Retur Penjualan
Dr Pajak Keluaran
  Cr Piutang Usaha / Kas
```

Jika stok kembali:

```txt
Dr Persediaan Barang
  Cr HPP
```

### Manual Journal

Manual journal hanya untuk role yang sangat terbatas. Fase awal bisa tetap pakai `FINANCE_ACCESS`, tetapi sebelum production sebaiknya ada permission khusus seperti `JOURNAL_MANAGE`.

## Report

Report yang dibuat di fase ini:

- Buku besar per akun.
- Trial balance.
- Laporan laba rugi.
- Balance sheet.
- Journal list dan detail.
- Source document -> journal trace.

Jangan hapus report cash-flow existing. User operasional tetap butuh cash movement yang sederhana.

## Closing Period

Closing period jangan masuk sebelum report dasar stabil.

Minimal field:

```ts
export interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'OPEN' | 'LOCKED' | 'CLOSED';
  closed_at?: string;
  created_at: string;
  updated_at: string;
}
```

Aturan:

- Transaksi pada periode locked tidak boleh diedit tanpa reversal.
- Closing membuat saldo awal periode berikutnya.
- Adjustment setelah closing harus lewat jurnal penyesuaian/reversal.

## Migrasi Dari Cash-Flow

Jangan auto-convert semua history lama menjadi jurnal tanpa review.

Opsi aman:

1. Mulai ledger dari tanggal cutoff.
2. Buat opening balance journal per cutoff.
3. History sebelum cutoff tetap sebagai cash-flow/report legacy.

Jika harus backfill:

- Preview semua journal yang akan dibuat.
- Tampilkan transaksi yang tidak bisa dipetakan.
- Jangan posting jika debit != credit.
- Simpan trace source id.

## Acceptance Criteria

- Journal entry posted selalu balance.
- Journal entry line hanya memakai akun active dan postable.
- Source document tidak membuat duplicate journal jika action diulang.
- Void/reversal membuat jejak audit, bukan hard delete.
- Cash-flow existing tetap berjalan.
- Trial balance balance.
- Report bisa trace dari journal ke source document.

## Validasi Teknis

Minimal:

```txt
bun run build
bun run lint
```
