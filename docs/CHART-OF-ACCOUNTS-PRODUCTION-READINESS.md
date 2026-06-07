# Accounting Core - Production Readiness

Dokumen ini adalah alur kerja untuk membuat Chart of Accounts dan General Ledger benar-benar siap production di Kasirku. Kondisi kode saat ini sudah punya fondasi `chartOfAccounts`, `financeAccountMappings`, `accountingProfileSetting`, `enabledModules`, `journalEntries`, `journalEntryLines`, posting service, backup/restore, dan UI laporan ledger. Tetapi General Ledger belum boleh dianggap production-ready sebelum blocker bisnis, data migration, inventory accounting, period lock, permission, dan QA berikut selesai.

## Status Saat Ini

Status: COA siap terbatas, General Ledger belum production-ready.

Yang sudah siap untuk staging/internal testing:
- `Daftar Akun` ada di Finance: `/finance/chart-of-accounts`.
- Default COA dan mapping finance category sudah ada di `src/constants/chartOfAccounts.ts`.
- Schema Dexie sudah punya `chartOfAccounts`, `financeAccountMappings`, `accountingProfileSetting`, `enabledModules`, `journalEntries`, dan `journalEntryLines`.
- `financeTransactions` sudah punya snapshot akun optional.
- Backup/restore sudah membawa table finance, COA, module gate, journal entry, dan journal line.
- Posting journal sudah ada untuk POS sale, stock purchase, Sales Invoice issue/payment, Sales Return issue/void, dan POS void.
- Report General Ledger sudah ada: journal list, buku besar per akun, trial balance, income statement, dan balance sheet.

Yang belum aman untuk production:
- `GENERAL_LEDGER` masih bisa diaktifkan tanpa readiness check cutoff, opening balance, dan policy posting.
- Belum ada cutoff ledger dan opening balance journal untuk mulai ledger dari tanggal tertentu.
- Belum ada backfill preview untuk history lama dari cash-flow ke ledger.
- Inventory accounting belum konsisten: stock purchase sudah masuk persediaan, tetapi POS sale belum posting HPP dan pengurangan persediaan.
- Payment invoice belum memilih akun kas/bank sesuai channel pembayaran.
- Belum ada `JOURNAL_MANAGE` untuk manual/adjustment journal.
- Belum ada accounting period, locked period, dan closing flow.
- Belum ada automated test untuk posting, reversal, trial balance, dan balance sheet.

## Prinsip Production

- `financeTransactions` tetap operational cash-flow layer.
- `journalEntries` dan `journalEntryLines` adalah accounting ledger.
- Jangan memakai cash-flow sebagai sumber klaim debit/kredit.
- General Ledger production harus dimulai dari cutoff date yang jelas.
- History sebelum cutoff tetap legacy cash-flow, kecuali user menjalankan backfill preview dan approve.
- Semua posting ledger harus lewat service layer, bukan dari component.
- Semua source posting harus idempotent berdasarkan `source_type`, `source_id`, dan `source_event`.
- Reversal tidak boleh hard delete journal.
- Akun journal line hanya boleh memakai akun aktif dan postable.
- Report accounting tidak boleh diklaim PSAK/PSAP/audit-ready sebelum period lock, adjustment, dan policy laporan stabil.

## Fase 0 - Freeze Scope Production v1

Tujuan fase ini adalah mengunci batas agar implementasi tidak melebar.

Keputusan production v1:
1. Profile production awal tetap `SAK_EMKM + RETAIL`.
2. General Ledger hanya untuk retail flow yang sudah ada: POS, stock purchase, Sales Invoice, Sales Invoice Payment, dan Sales Return.
3. Manufaktur, konstruksi, dan PSAP tetap preview/nonaktif.
4. Multi currency, tax compliance penuh, bank reconciliation, depresiasi aset tetap, dan payroll belum masuk production v1.
5. Manual journal hanya boleh masuk setelah permission khusus dan period guard siap.

Acceptance:
- Product owner setuju bahwa production v1 bukan PSAK/PSAP compliance penuh.
- UI dan copy tidak menyebut laporan sebagai audit-ready.
- `MANUFACTURING`, `CONSTRUCTION`, dan `PSAP_REPORTING` tetap tidak bisa diaktifkan dari retail default.

## Fase 1 - General Ledger Activation Guard

Masalah saat ini: `enabledModules.GENERAL_LEDGER` bisa diaktifkan dari panel mapping/template, tetapi belum ada readiness check yang memastikan cutoff, opening balance, dan posting policy sudah siap.

Tambahkan guard di service:

```txt
src/services/chartOfAccountService.ts
src/services/generalLedgerService.ts
```

Tambahkan helper:

```txt
src/utils/accounting/getGeneralLedgerReadiness.ts
```

Readiness minimal:
1. `chartOfAccounts` punya akun wajib aktif dan postable:
   - Kas Tunai
   - Bank / Non Tunai
   - Piutang Usaha
   - Persediaan Barang
   - Penjualan POS
   - Pendapatan Sales Invoice
   - Retur Penjualan
   - HPP
2. Mapping finance category tidak mengarah ke akun inactive/non-postable.
3. Ada cutoff setting untuk ledger.
4. Ada opening balance journal yang sudah posted untuk cutoff.
5. Policy inventory accounting sudah dipilih.
6. Backup/restore table ledger sudah lulus smoke test.

Data model yang disarankan:

```ts
export interface GeneralLedgerSetting {
  id: 'default';
  is_ready: boolean;
  cutoff_date?: string;
  inventory_policy: 'CASH_FLOW_ONLY' | 'PERPETUAL_INVENTORY';
  opening_balance_journal_id?: string;
  activated_at?: string;
  created_at: string;
  updated_at: string;
}
```

File yang diubah:
- `src/types/index.ts`
- `src/lib/db.ts`
- `src/constants/accounting.ts`
- `src/services/chartOfAccountService.ts`
- `src/services/generalLedgerService.ts`
- `src/components/chart-of-accounts/FinanceAccountMappingPanel.tsx`
- `src/view/finance/general-ledger/GeneralLedgerManagement.tsx`
- `src/i18n/messages.ts`
- `src/utils/backupRestore.ts`

Acceptance:
- User tidak bisa mengaktifkan `GENERAL_LEDGER` jika readiness belum lulus.
- General Ledger screen menampilkan status readiness yang jelas.
- Jika module belum aktif, report tidak ditampilkan sebagai laporan kosong yang bisa disalahartikan.
- Aktivasi module mencatat activity log.

## Fase 2 - Cutoff dan Opening Balance

Masalah production: ledger tidak boleh mulai dari tengah data tanpa saldo awal. Jika langsung membaca journal baru saja, balance sheet bisa salah.

Tambahkan flow setup:

```txt
/finance/general-ledger/setup
```

Aturan:
1. User memilih `cutoff_date`.
2. Semua transaksi sebelum cutoff dianggap legacy cash-flow.
3. User input saldo awal akun per cutoff.
4. Sistem membuat journal source:

```txt
source_type: OPENING_BALANCE
source_event: OPENING_BALANCE_POSTED
entry_date: cutoff_date
```

5. Opening balance harus balance.
6. Setelah opening balance posted, cutoff tidak boleh diubah tanpa reversal/reset ledger yang eksplisit.

Posting contoh:

```txt
Dr Kas Tunai
Dr Bank / Non Tunai
Dr Piutang Usaha
Dr Persediaan Barang
  Cr Hutang Usaha
  Cr Modal Pemilik
```

File yang diubah:
- `src/services/generalLedgerService.ts`
- `src/view/finance/general-ledger/GeneralLedgerManagement.tsx`
- `src/components/general-ledger/OpeningBalanceForm.tsx`
- `src/routes/finance/general-ledger.lazy.tsx`
- `src/types/index.ts`
- `src/lib/db.ts`

Acceptance:
- Opening balance tidak bisa posted jika debit dan credit tidak balance.
- Opening balance memakai akun aktif dan postable.
- Opening balance journal bisa dilihat di journal list.
- Trial balance setelah opening balance saja harus balance.
- Activity log mencatat setup cutoff dan opening balance.

## Fase 3 - Backfill Preview untuk History Lama

Masalah production: history lama dari POS, stock purchase, invoice, payment, dan return tidak boleh langsung dikonversi menjadi journal tanpa review.

Tambahkan preview service:

```txt
src/services/generalLedgerBackfillService.ts
```

Flow aman:
1. User memilih range tanggal setelah cutoff.
2. Service membaca source document yang belum punya journal posted.
3. Service membuat preview journal, bukan langsung menyimpan.
4. Preview menampilkan:
   - source number;
   - source type;
   - debit lines;
   - credit lines;
   - status balance;
   - warning akun hilang/non-postable.
5. User approve untuk post.
6. Posting memakai helper existing `postBalancedJournalEntry`.

Source yang masuk production v1:
- POS transaction status `COMPLETED`.
- Stock purchase.
- Sales Invoice status `ISSUED`.
- Sales Invoice payment dengan `paid_amount > 0`.
- Sales Return status `ISSUED`.
- Reversal dari source void/reversed jika source sudah terjadi setelah cutoff.

Acceptance:
- Tidak ada journal dibuat sebelum user approve.
- Preview menolak source yang tidak bisa balance.
- Source yang sudah punya journal tidak dibuat duplicate.
- Backfill bisa dijalankan ulang dan tetap idempotent.
- Backfill summary menampilkan jumlah posted, skipped, dan failed.

## Fase 4 - Inventory Accounting Policy

Masalah saat ini: stock purchase sudah posting `Dr Persediaan, Cr Kas`, tetapi POS sale belum posting `Dr HPP, Cr Persediaan`. Ini membuat persediaan di balance sheet tidak turun saat barang terjual.

Pilih satu policy production v1.

Policy A - Cash-flow only:
1. Jangan aktifkan balance sheet inventory accounting.
2. Stock purchase tetap tampil sebagai cash-flow expense.
3. General Ledger tidak dipakai untuk laporan persediaan penuh.
4. UI harus memberi label bahwa inventory accounting belum aktif.

Policy B - Perpetual inventory:
1. Stock purchase posting:

```txt
Dr Persediaan Barang
  Cr Kas/Bank
```

2. POS sale posting:

```txt
Dr Kas/Bank
  Cr Penjualan POS

Dr HPP
  Cr Persediaan Barang
```

3. Sales Delivery atau Sales Invoice yang mengurangi stok juga harus punya posting HPP/persediaan jika source tersebut diakui sebagai sale.
4. Sales Return restock harus membalik HPP/persediaan:

```txt
Dr Persediaan Barang
  Cr HPP
```

Rekomendasi untuk production accounting: pilih Policy B, karena table produk sudah menyimpan `purchase_price`, transaction item sudah menyimpan `purchase_price` dan `profit`, dan stock movement sudah terjadi di service.

File yang diubah:
- `src/services/generalLedgerService.ts`
- `src/services/checkoutService.ts`
- `src/services/salesDocumentService.ts`
- `src/services/salesReturnService.ts`
- `src/utils/transactions.ts`
- `src/utils/salesDocuments/calculateSalesDocumentMargin.ts`

Acceptance:
- POS sale mengurangi persediaan di ledger sebesar cost item.
- Stock purchase menaikkan persediaan di ledger.
- Sales Return yang restock menaikkan persediaan dan membalik HPP.
- Trial balance tetap balance setelah checkout, stock purchase, dan return.
- Profit report existing tidak double count dengan ledger report.

## Fase 5 - Payment Channel dan Cash/Bank Account

Masalah saat ini: Sales Invoice Payment journal selalu memakai akun kas default. Di production, user butuh membedakan tunai dan non tunai.

Tambahkan field pembayaran:

```ts
payment_method?: 'TUNAI' | 'NON_TUNAI';
cash_account_id?: string;
cash_account_code?: string;
cash_account_name?: string;
```

Minimal tempat field disimpan:
- `SalesDocument` untuk payment sederhana saat ini.
- Jika nanti dibuat payment ledger AR, pindahkan field ke table payment ledger.

Aturan:
1. `TUNAI` default ke akun `cash`.
2. `NON_TUNAI` default ke akun `bank`.
3. User boleh pilih akun kas/bank lain selama `type=ASSET`, active, dan postable.
4. Journal payment memakai akun cash/bank yang dipilih.
5. `financeTransactions` tetap mencatat cash-flow payment seperti sekarang, dengan account snapshot sesuai channel.

File yang diubah:
- `src/types/index.ts`
- `src/lib/db.ts`
- `src/services/salesDocumentService.ts`
- `src/services/generalLedgerService.ts`
- `src/view/finance/sales/SalesDocumentDetail.tsx`
- `src/i18n/messages.ts`

Acceptance:
- Payment tunai masuk akun Kas Tunai.
- Payment non tunai masuk akun Bank / Non Tunai.
- User tidak bisa memilih akun revenue/expense sebagai cash account.
- Journal payment tetap `Dr Kas/Bank, Cr Piutang Usaha`.
- Cash-flow dan ledger menunjukkan akun yang konsisten.

## Fase 6 - Journal Manage Permission dan Manual Journal

Masalah production: manual/adjustment journal terlalu sensitif jika hanya memakai `FINANCE_ACCESS`.

Tambahkan permission:

```ts
JOURNAL_MANAGE
```

Role awal:
- `OWNER`: boleh.
- `ADMIN`: opsional, default sebaiknya tidak.
- `KASIR`: tidak.
- `GUDANG`: tidak.

Manual journal production v1:
1. Bisa membuat draft manual journal.
2. Bisa post jika debit dan credit balance.
3. Tidak bisa edit posted journal.
4. Koreksi posted journal harus lewat reversal + journal baru.
5. Tidak boleh post ke periode locked.

File yang diubah:
- `src/types/index.ts`
- `src/auth/permissions.ts`
- `src/auth/routePermissions.ts`
- `src/services/generalLedgerService.ts`
- `src/view/finance/general-ledger/ManualJournalForm.tsx`
- `src/i18n/messages.ts`

Acceptance:
- Role tanpa `JOURNAL_MANAGE` tidak melihat action manual journal.
- Service tetap menolak walaupun UI dimanipulasi.
- Manual journal posted selalu balance.
- Reversal manual journal membuat jejak audit.

## Fase 7 - Accounting Period, Lock, dan Closing

Masalah production: tanpa period lock, user bisa membuat/mengubah transaksi lama setelah laporan dipakai.

Tambahkan table:

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
1. Source document dengan tanggal di periode locked/closed tidak boleh membuat posting baru tanpa adjustment journal.
2. Void/reversal source lama harus ditolak atau diarahkan ke adjustment date di periode open.
3. Closing membuat closing journal jika dibutuhkan.
4. Periode closed tidak bisa dibuka oleh Admin biasa.

File yang diubah:
- `src/types/index.ts`
- `src/lib/db.ts`
- `src/services/accountingPeriodService.ts`
- `src/services/generalLedgerService.ts`
- `src/services/checkoutService.ts`
- `src/services/stockPurchaseService.ts`
- `src/services/salesDocumentService.ts`
- `src/services/salesReturnService.ts`
- `src/services/transactionVoidService.ts`
- `src/utils/backupRestore.ts`

Acceptance:
- Posting ke periode locked ditolak.
- Void transaksi periode locked tidak mengubah journal lama tanpa adjustment/reversal policy.
- Closing period tercatat di activity log.
- Report bisa difilter per period.

## Fase 8 - Report Accuracy dan Product Wording

Masalah production: report ledger yang setengah siap bisa menyesatkan user.

Update General Ledger UI:
1. Jika `GENERAL_LEDGER` belum ready, tampilkan setup/readiness, bukan report kosong.
2. Tampilkan cutoff date dan inventory policy aktif.
3. Tampilkan warning jika report hanya valid setelah cutoff.
4. Journal list harus bisa trace ke source document.
5. Trial balance wajib menampilkan error jika tidak balance.
6. Balance sheet tidak boleh ditampilkan sebagai production report jika inventory policy belum siap.

File yang diubah:
- `src/view/finance/general-ledger/GeneralLedgerManagement.tsx`
- `src/routes/finance/index.tsx`
- `src/routes/__root.tsx`
- `src/i18n/messages.ts`

Acceptance:
- User paham laporan dimulai dari cutoff.
- Tidak ada report accounting yang terlihat final saat readiness belum lulus.
- Link/source trace tersedia minimal lewat source number dan source type.
- Copy Indonesia dan English tidak mengklaim compliance penuh.

## Fase 9 - Backup, Restore, dan Recalculate Safety

Pastikan data production bisa dipulihkan.

Checklist:
1. Backup membawa:
   - `chartOfAccounts`
   - `financeAccountMappings`
   - `accountingProfileSetting`
   - `enabledModules`
   - `journalEntries`
   - `journalEntryLines`
   - `generalLedgerSetting`
   - `accountingPeriods`
2. Restore menjalankan `ensureAccountingDefaults()` tanpa menimpa data user.
3. Restore tidak membuat journal duplicate.
4. Recalculate finance tidak menghapus journal.
5. Jika ada backfill/replay ledger, prosesnya eksplisit dan punya preview.

File yang diubah:
- `src/utils/backupRestore.ts`
- `src/services/financeService.ts`
- `src/services/generalLedgerBackfillService.ts`

Acceptance:
- Backup lalu restore tidak menghilangkan cutoff, opening balance, dan journal.
- Trial balance setelah restore sama dengan sebelum restore.
- Cash-flow balance tetap sama setelah restore.
- Recalculate finance tidak mengubah journal ledger.


## Go/No-Go Checklist

Go production hanya jika semua item ini `YES`:

- `GENERAL_LEDGER` tidak bisa aktif tanpa readiness check.
- Cutoff date tersimpan dan tidak bisa berubah sembarangan.
- Opening balance journal posted dan balance.
- Backfill history hanya lewat preview dan approval.
- POS sale punya policy inventory accounting yang jelas.
- Stock purchase, POS sale, Sales Invoice, Payment, dan Return menghasilkan journal balance.
- Void/reversal membuat reversal journal, bukan hard delete.
- Payment invoice bisa memilih akun kas/bank.
- Manual/adjustment journal punya `JOURNAL_MANAGE`.
- Posting ke periode locked/closed ditolak.
- Trial balance balance setelah QA matrix.
- Balance sheet balance setelah opening balance dan transaksi utama.
- Backup/restore membawa semua table accounting dan ledger.
- Report UI menjelaskan cutoff dan tidak klaim compliance penuh.
- Automated tests untuk posting dan reversal tersedia.
- Build dan lint pass.

## Urutan Implementasi Disarankan

1. Fase 1: General Ledger activation guard.
2. Fase 2: cutoff dan opening balance.
3. Fase 4: inventory accounting policy.
4. Fase 5: payment channel dan cash/bank account.
5. Fase 7: accounting period dan lock.
6. Fase 6: `JOURNAL_MANAGE` dan manual journal.
7. Fase 3: backfill preview untuk history lama.
8. Fase 8: report accuracy dan product wording.
9. Fase 9: backup/restore dan recalculate safety.
10. Fase 10: automated tests.
11. Fase 11-12: manual QA dan technical verification.

Catatan: jangan mulai Fase 5 extension industri/pemerintahan sebelum checklist General Ledger production ini lulus. Manufaktur, konstruksi, dan PSAP membutuhkan domain flow sendiri, bukan hanya tambahan akun.
