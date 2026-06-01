# Cash & Bank - Fase 3 Transfer Antar Kas/Bank

Dokumen ini adalah langkah implementasi fitur transfer antar akun kas/bank untuk modul Cash & Bank. Scope-nya sengaja sempit: user bisa memindahkan saldo dari satu akun kas/bank ke akun lain, histori transfer jelas, total `financeBalance` tetap sama, dan General Ledger tetap menjadi layer akuntansi terpisah.

## Prinsip Implementasi

- Route tetap `/finance/cash-flow`.
- Jangan membuat struktur folder baru.
- Jangan membuat table khusus transfer jika `financeTransactions` masih cukup.
- Jangan memakai `addFinanceTransaction()` untuk transfer, karena helper itu didesain untuk manual income/expense dan bisa mempengaruhi `profitBalance`.
- Transfer dibuat sebagai dua `financeTransactions`:
  - `EXPENSE` dari akun sumber.
  - `INCOME` ke akun tujuan.
- Kedua sisi transfer harus punya `transfer_group_id` yang sama.
- Total `financeBalance` tidak berubah.
- Transfer tidak boleh masuk profit/laba.
- Jika General Ledger ready, posting jurnal transfer kas/bank dibuat di service GL, bukan di komponen UI.
- Form memakai React Hook Form sebagai pengolah state form, Ant Design sebagai UI control, dan Zod sebagai validator.

## File Target

- `src/types/index.ts`
- `src/constants/finance.ts`
- `src/lib/validations/cashBankTransfer.ts`
- `src/services/cashBankTransferService.ts`
- `src/hooks/useCashBankTransfer.tsx`
- `src/view/finance/CashBankTransferModal.tsx`
- `src/view/finance/FinanceManagement.tsx`
- `src/services/generalLedgerService.ts`
- `src/i18n/messages.ts`

Catatan folder:

- Semua file baru ditempatkan di folder existing.
- Jangan membuat folder baru seperti `src/components/cash-bank`.
- Jika komponen modal masih kecil, boleh langsung di `src/view/finance/CashBankTransferModal.tsx`.

## Model Data Ringan

Tambahkan field optional di `FinanceTransaction`:

```ts
transfer_group_id?: string;
transfer_direction?: 'OUT' | 'IN';
reversal_of_transfer_group_id?: string;
```

Makna field:

- `transfer_group_id`: id pasangan transfer.
- `transfer_direction`: sisi transfer, `OUT` untuk sumber dan `IN` untuk tujuan.
- `reversal_of_transfer_group_id`: hanya terisi untuk reversal/void transfer.

Tidak perlu migration Dexie baru jika field ini tidak dijadikan index. Backup/restore tetap aman karena `financeTransactions` sudah ikut payload backup.

## Kategori Finance

Update `FINANCE_CATEGORIES`:

```ts
CASH_BANK_TRANSFER: 'TRANSFER_KAS_BANK'
```

Tambahkan kategori ini ke `NON_PROFIT_FINANCE_CATEGORIES`.

Alasan:

- Transfer kas/bank bukan income.
- Transfer kas/bank bukan expense operasional.
- Recalculate profit tidak boleh membaca transfer sebagai laba/rugi.

Tambahkan label i18n:

- `finance.category.TRANSFER_KAS_BANK`
- `finance.transfer`
- `finance.transferCashBank`
- label form dan error lain sesuai kebutuhan.

## Validator Zod

Buat `src/lib/validations/cashBankTransfer.ts`.

Isi minimal:

```ts
import { z } from 'zod';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const cashBankTransferSchema = z.object({
  from_cash_account_id: z.string().min(1, 'Akun sumber wajib dipilih.'),
  to_cash_account_id: z.string().min(1, 'Akun tujuan wajib dipilih.'),
  amount: z.number({ message: 'Jumlah transfer wajib diisi.' }).min(1, 'Jumlah transfer harus lebih dari 0.'),
  transfer_date: optionalTrimmedString,
  payment_channel: optionalTrimmedString,
  notes: optionalTrimmedString,
}).refine((value) => value.from_cash_account_id !== value.to_cash_account_id, {
  path: ['to_cash_account_id'],
  message: 'Akun tujuan harus berbeda dari akun sumber.',
});

export type CashBankTransferFormData = z.infer<typeof cashBankTransferSchema>;
```

Catatan:

- Validasi akun `ASSET`, aktif, dan postable tetap dilakukan di service karena perlu baca DB.
- Zod hanya validasi bentuk input dan rule antar field.

## Service

Buat `src/services/cashBankTransferService.ts`.

Interface input:

```ts
export interface RecordCashBankTransferInput {
  from_cash_account_id: string;
  to_cash_account_id: string;
  amount: number;
  transfer_date?: string;
  payment_channel?: string;
  notes?: string;
}
```

Function utama:

```ts
export const recordCashBankTransfer = async (input: RecordCashBankTransferInput) => {};
export const voidCashBankTransfer = async (transferGroupId: string, reason: string) => {};
```

Aturan `recordCashBankTransfer()`:

1. Ambil current user dan cek `FINANCE_ACCESS`.
2. Parse input dengan `cashBankTransferSchema`.
3. Ambil akun sumber dan tujuan dari `chartOfAccounts`.
4. Validasi dua akun:
   - ada,
   - `type === 'ASSET'`,
   - `is_active === true`,
   - `is_postable === true`,
   - id sumber dan tujuan berbeda.
5. Generate:
   - `transferGroupId = crypto.randomUUID()`
   - `outTransactionId = crypto.randomUUID()`
   - `inTransactionId = crypto.randomUUID()`
6. Jalankan `db.transaction('rw', [...])`.
7. Tambahkan finance transaction keluar:
   - `type: 'EXPENSE'`
   - `category: FINANCE_CATEGORIES.CASH_BANK_TRANSFER`
   - `cash_account_*` dari akun sumber
   - `account_*` dari akun sumber
   - `transfer_group_id: transferGroupId`
   - `transfer_direction: 'OUT'`
8. Tambahkan finance transaction masuk:
   - `type: 'INCOME'`
   - `category: FINANCE_CATEGORIES.CASH_BANK_TRANSFER`
   - `cash_account_*` dari akun tujuan
   - `account_*` dari akun tujuan
   - `transfer_group_id: transferGroupId`
   - `transfer_direction: 'IN'`
9. Jangan update `financeBalance`, karena total net transfer adalah nol.
10. Jika General Ledger ready, panggil helper GL untuk jurnal:
    - Dr akun tujuan
    - Cr akun sumber
11. Tulis `activityLogs` dengan action `CASH_BANK_TRANSFER_RECORDED`.
12. Return pasangan transaksi atau summary transfer.

Daftar table dalam transaction minimal:

```ts
[
  db.financeTransactions,
  db.chartOfAccounts,
  db.enabledModules,
  db.generalLedgerSetting,
  db.journalEntries,
  db.journalEntryLines,
  db.activityLogs,
]
```

Jika helper GL yang dipakai membaca table lain, tambahkan table itu ke scope transaction. Jangan memanggil table di luar scope Dexie transaction.

## Void Transfer

Void transfer tidak menghapus transaksi lama. Buat pasangan reversal baru.

Aturan `voidCashBankTransfer()`:

1. Cek permission `FINANCE_ACCESS`.
2. Ambil semua `financeTransactions` dengan `transfer_group_id`.
3. Pastikan ada tepat dua sisi aktif:
   - satu `OUT`,
   - satu `IN`.
4. Pastikan belum ada reversal dengan `reversal_of_transfer_group_id` yang sama.
5. Generate `reversalGroupId`.
6. Buat reversal:
   - reversal untuk sisi `OUT` menjadi `INCOME` ke akun sumber.
   - reversal untuk sisi `IN` menjadi `EXPENSE` dari akun tujuan.
7. Isi:
   - `transfer_group_id: reversalGroupId`
   - `reversal_of_transfer_group_id: transferGroupId`
   - `category: FINANCE_CATEGORIES.CASH_BANK_TRANSFER`
8. Jangan update `financeBalance`.
9. Jika GL ready, buat reversal journal dari journal transfer asal.
10. Tulis `activityLogs` dengan action `CASH_BANK_TRANSFER_VOIDED`.

Catatan:

- Jika tidak ingin expose void di UI fase awal, service tetap bisa disiapkan atau ditunda eksplisit.
- Acceptance dokumen induk meminta void transfer membalik kedua sisi, jadi minimal rencana service harus jelas.

## General Ledger

Tambahkan helper di `src/services/generalLedgerService.ts`:

```ts
export const postCashBankTransferJournal = async (input: {
  transferGroupId: string;
  transferDate: string;
  amount: number;
  fromAccount: ChartOfAccount;
  toAccount: ChartOfAccount;
  description?: string;
}) => {};
```

Jurnal:

- Debit akun tujuan kas/bank.
- Credit akun sumber kas/bank.

Syarat:

- Hanya posting kalau GL ready sesuai helper existing.
- Source type/event harus idempotent.
- Gunakan `source_type` seperti `CASH_BANK_TRANSFER`.
- Gunakan `source_id` = `transferGroupId`.
- Jangan posting dari UI.

Untuk void:

- Reuse pola reversal journal existing jika tersedia.
- Source id reversal memakai `reversalGroupId`.

## Hook

Buat `src/hooks/useCashBankTransfer.tsx`.

Tanggung jawab hook:

- Query akun kas/bank:
  - dari `db.chartOfAccounts`,
  - filter `ASSET`, aktif, postable.
- Expose `cashBankAccounts`.
- Expose mutation `recordTransfer`.
- Expose mutation `voidTransfer` jika UI void ikut dibuat.
- Invalidate:
  - `financeTransactions`,
  - `financeBalance`,
  - `journalEntries`,
  - `trialBalance`,
  - `balanceSheet`.
- Tampilkan success/error via `App.useApp()`.

Hook tidak boleh:

- Menulis Dexie langsung untuk transfer.
- Menghitung jurnal.
- Mengubah `financeBalance`.

## Form RHF + AntD

Buat `src/view/finance/CashBankTransferModal.tsx`.

Gunakan:

- `useForm<CashBankTransferFormData>`.
- `zodResolver(cashBankTransferSchema)`.
- `Controller` untuk AntD `Select`, `InputNumber`, `DatePicker`, dan `Input.TextArea`.
- `Modal` AntD untuk container.
- `Button` submit dengan `htmlType="submit"` di `<form>`.

Field form:

- Akun sumber.
- Akun tujuan.
- Jumlah.
- Tanggal transfer.
- Channel/catatan bank optional.
- Catatan optional.

Default:

- `transfer_date` default hari ini.
- Jika ada akun `cash`/`1010`, default sumber boleh Kas Tunai.
- Jika ada akun `bank`/`1020`, default tujuan boleh Bank / Non Tunai.
- Jika default sumber dan tujuan sama karena akun hanya satu, biarkan tujuan kosong.

Pola error:

- Ambil error dari `formState.errors`.
- Tampilkan ke AntD melalui `validateStatus="error"` dan `help={errors.field?.message}`.
- Jangan pakai validasi AntD sebagai sumber utama rule bisnis.

## Integrasi UI Cash & Bank

Update `src/view/finance/FinanceManagement.tsx`.

Langkah:

1. Tambahkan state `isTransferModalOpen`.
2. Tambahkan tombol `Transfer` di action header desktop.
3. Tambahkan tombol mobile jika action mobile sudah ada.
4. Render `CashBankTransferModal`.
5. Berikan props:
   - `open`,
   - `onCancel`,
   - `accounts`,
   - `onSubmit`,
   - `submitting`.
6. Setelah submit sukses:
   - tutup modal,
   - reset form,
   - summary per akun otomatis berubah dari query invalidation.

Jangan:

- Menaruh logic mutasi transfer langsung di `FinanceManagement`.
- Membuat route baru.
- Mengubah card summary menjadi laporan ledger.

## Tampilan History

History existing tetap memakai `financeTransactions`.

Tambahan ringan:

- Tambahkan label kategori `Transfer Kas/Bank`.
- Untuk transaksi dengan `transfer_group_id`, tampilkan tag kecil:
  - `Transfer Keluar` untuk `transfer_direction === 'OUT'`.
  - `Transfer Masuk` untuk `transfer_direction === 'IN'`.
- Amount tetap mengikuti type:
  - `EXPENSE` tampil minus.
  - `INCOME` tampil plus.

Jangan gabungkan dua row transfer menjadi satu row di fase awal. Biarkan dua row agar saldo per akun mudah diaudit.

## Recalculate Finance

`recalculateFinance()` tidak perlu menghapus transfer karena kategori transfer bukan auto-replay.

Pastikan:

- Transfer tidak termasuk `autoCategories`.
- Loop running balance tetap benar karena `EXPENSE` dan `INCOME` bernilai sama.
- Jika category transfer ditambah, jangan masukkan ke profit-affecting categories.

## Backup Restore

Tidak perlu perubahan khusus jika hanya menambah optional field di `financeTransactions`.

Tetap cek:

- Backup membawa `financeTransactions`.
- Restore mengembalikan `financeTransactions`.
- Field `transfer_group_id`, `transfer_direction`, dan `reversal_of_transfer_group_id` ikut tersimpan dalam object transaksi.

## Acceptance Criteria

- User bisa membuka modal Transfer dari halaman Cash & Bank.
- Form transfer memakai RHF, AntD component, dan Zod validator.
- Akun sumber dan tujuan hanya menampilkan akun `ASSET`, aktif, postable.
- Akun sumber dan tujuan tidak boleh sama.
- Transfer membuat dua `financeTransactions` dengan `transfer_group_id` sama.
- Sisi sumber mengurangi saldo akun sumber di summary.
- Sisi tujuan menambah saldo akun tujuan di summary.
- `financeBalance` tidak berubah setelah transfer.
- Transfer tidak mengubah `profitBalance`.
- `recalculateFinance()` tetap menghasilkan total balance yang sama.
- Jika GL ready, transfer membuat jurnal Dr akun tujuan dan Cr akun sumber.
- Jika transfer di-void, dibuat reversal dua sisi dan total tetap net-zero.

## QA Manual

1. Siapkan akun `1010 Kas Tunai` dan `1020 Bank / Non Tunai` aktif serta postable.
2. Catat saldo awal/manual income ke Kas Tunai.
3. Transfer dari Kas Tunai ke Bank / Non Tunai.
4. Pastikan summary Kas Tunai turun.
5. Pastikan summary Bank / Non Tunai naik.
6. Pastikan total `financeBalance` tidak berubah.
7. Cek history menampilkan dua row transfer dengan group yang sama.
8. Jalankan `recalculateFinance()`.
9. Pastikan total `financeBalance` tetap sama.
10. Jika GL ready, cek jurnal transfer:
    - Debit Bank / Non Tunai.
    - Credit Kas Tunai.
11. Jika void dibuat, void transfer dan pastikan saldo per akun kembali.

## Urutan Implementasi

1. Tambah optional transfer fields di `FinanceTransaction`.
2. Tambah `FINANCE_CATEGORIES.CASH_BANK_TRANSFER`.
3. Masukkan kategori transfer ke `NON_PROFIT_FINANCE_CATEGORIES`.
4. Tambah label i18n kategori dan UI transfer.
5. Buat `cashBankTransferSchema`.
6. Buat service `recordCashBankTransfer()`.
7. Tambah helper GL `postCashBankTransferJournal()`.
8. Buat hook `useCashBankTransfer()`.
9. Buat `CashBankTransferModal` dengan RHF + Zod + AntD.
10. Integrasikan tombol dan modal ke `FinanceManagement`.
11. Tambahkan tag transfer di history.
12. Implement void transfer jika scope pengerjaan langsung mencakup acceptance void.
13. Jalankan `bun run build`.
14. Jalankan `bun run lint`.
15. Jalankan `git diff --check`.

## Batas Yang Tidak Dikerjakan

- Table khusus bank account.
- Import mutasi bank.
- Rekonsiliasi bank.
- Matching otomatis.
- Multi-currency.
- Perubahan route dari `/finance/cash-flow`.
- Refactor besar `FinanceManagement` di luar kebutuhan modal transfer.

## Catatan SOC

- `src/lib/validations/cashBankTransfer.ts`: validasi shape form dan rule antar field.
- `src/services/cashBankTransferService.ts`: permission, validasi akun DB, write `financeTransactions`, activity log, dan panggil GL.
- `src/services/generalLedgerService.ts`: jurnal transfer kas/bank.
- `src/hooks/useCashBankTransfer.tsx`: query data untuk UI, mutation, invalidation, feedback UI.
- `src/view/finance/CashBankTransferModal.tsx`: form RHF + AntD.
- `src/view/finance/FinanceManagement.tsx`: membuka modal, tombol aksi, dan tampilan history.

Dengan pembagian ini, UI tetap tipis, validasi form tidak bocor ke service, dan mutasi uang tetap berada di service layer.
