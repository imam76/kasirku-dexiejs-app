# Sales Return - Production Readiness

Dokumen ini adalah checklist langkah menuju production untuk fitur Sales Return di Kasirku. Fitur sudah punya fondasi module, route, service, table Dexie, permission, dan UI, tetapi belum boleh dianggap production-ready sebelum guard bisnis, audit finance, stok, dan QA berikut selesai.

## Status Saat Ini

Status: belum production-ready.

Yang sudah siap untuk staging/internal testing:
- Module terpisah dari `SalesDocumentType`, memakai table `salesReturns` dan `salesReturnItems`.
- Route berada di Finance > Sales: `/finance/sales/returns`.
- Permission `SALES_RETURN_MANAGE` sudah dipakai untuk Owner/Admin.
- Draft, issue, void, over-return per source, backup/restore, dan ringkasan return sudah ada.
- Payment invoice sudah membaca issued return credit saat menghitung net payable.

Yang belum aman untuk production:
- Refund invoice belum dibatasi oleh uang yang benar-benar sudah diterima.
- Return dari Sales Invoice bisa memberi efek restock walaupun invoice langsung tidak selalu pernah mengurangi stok.
- Return dari dokumen dalam satu chain, misalnya Delivery lalu Invoice, belum punya policy tunggal agar tidak double return.
- Void refund masih berisiko menghilangkan jejak finance jika dilakukan dengan delete, bukan reversal/audit trail.
- Status payment invoice belum selalu direcalculate setelah return issue/void.
- Report net sales/margin belum menjadi acceptance gate.

## Prinsip Production

- Source document historis tidak boleh diubah totalnya.
- Sales Return adalah dokumen kontra, bukan pengganti void.
- Semua angka return disimpan positif.
- Semua mutasi bisnis harus lewat service layer, bukan dari component.
- Semua efek stok, finance, payment status, dan activity log harus berada dalam transaksi Dexie.
- Tidak boleh ada hard delete untuk jejak bisnis production: return, finance refund, dan payment history harus bisa diaudit.
- Finance > Sales tetap terpisah dari POS transaction flow sampai POS Return punya desain sendiri.

## Fase 0 - Freeze Scope Production v1

Tujuan fase ini adalah mengunci aturan agar implementasi tidak melebar.

Keputusan production v1:
1. Source aktif hanya `SALES_DELIVERY` dan `SALES_INVOICE`.
2. POS Return tetap ditolak dengan pesan jelas.
3. Satu return hanya boleh punya satu resolution: `NO_FINANCE`, `CREDIT_NOTE`, atau `REFUND`.
4. Mixed case partial paid, misalnya return value lebih besar dari paid amount tetapi masih ada outstanding, ditolak dulu atau diminta split return di fase berikutnya.
5. Sales Return production v1 tidak membuat Chart of Accounts penuh.

Acceptance:
- Product owner setuju bahwa POS Return dan mixed refund+credit belum masuk production v1.
- Semua pesan error menjelaskan apa yang harus dilakukan user.

## Fase 1 - Invoice Refund Guard

Masalah saat ini: `REFUND` hanya divalidasi lebih dari 0 dan maksimal sebesar nilai return, belum dicek terhadap pembayaran invoice.

Tambahkan helper pure:

```txt
src/utils/salesReturns/calculateSalesReturnLimits.ts
```

Isi helper:
- `returnable_quantity` per item.
- `credit_note_limit` untuk invoice.
- `refund_limit` untuk invoice.
- `can_restock` berdasarkan source stock policy.

Aturan invoice:
1. Ambil invoice source.
2. Ambil issued return summary existing, exclude current return saat update/issue draft yang sama.
3. Hitung:

```ts
const invoiceTotal = Number(invoice.total_amount || 0);
const paidAmount = Number(invoice.paid_amount || 0);
const existingCredit = Number(summary.credit_amount || 0);
const existingRefund = Number(summary.refund_amount || 0);
const balanceBeforeReturn = Math.max(0, invoiceTotal - paidAmount - existingCredit);
const refundableCash = Math.max(0, paidAmount - existingRefund);
```

4. `CREDIT_NOTE` hanya boleh sampai `balanceBeforeReturn`.
5. `REFUND` hanya boleh sampai `refundableCash`.
6. Jika return value lebih besar dari limit resolution, service harus reject dengan error jelas.
7. Jangan auto-convert sisa nilai return ke resolution lain pada production v1.

File yang diubah:
- `src/utils/salesReturns/validateSalesReturn.ts`
- `src/services/salesReturnService.ts`
- `src/components/sales-return/SalesReturnForm.tsx`
- `src/components/sales-return/SalesReturnSummary.tsx`

Acceptance:
- Invoice unpaid tidak bisa memilih `REFUND`.
- Invoice partial hanya bisa refund maksimal uang yang sudah diterima dan belum pernah direfund.
- Invoice paid bisa refund maksimal nilai paid yang belum pernah direfund.
- Credit note tidak bisa melebihi outstanding invoice.
- Error service tetap berjalan walaupun UI dimanipulasi.

## Fase 2 - Stock Effect Policy

Masalah saat ini: saat return di-issue, service menjalankan restock effect untuk semua source yang memiliki `restock_quantity`, termasuk Sales Invoice langsung.

Tambahkan helper:

```txt
src/utils/salesReturns/getSalesReturnStockPolicy.ts
```

Aturan:
1. `SALES_DELIVERY`:
   - Boleh restock karena issue delivery mengurangi stok.
2. `SALES_INVOICE` direct tanpa source delivery:
   - Tidak boleh restock karena invoice config tidak mengurangi stok.
   - Force `restock_quantity = 0`.
3. `SALES_INVOICE` dari `SALES_DELIVERY`:
   - Boleh restock karena stok sudah keluar saat delivery.
   - Return harus dikaitkan ke stock source delivery agar tidak double return.

Tambahkan field jika diperlukan:

```ts
source_stock_document_id?: string;
source_stock_document_type?: 'SALES_DELIVERY';
```

File yang diubah:
- `src/types/index.ts`
- `src/services/salesReturnService.ts`
- `src/utils/salesReturns/mapSalesReturnSourceItem.ts`
- `src/components/sales-return/SalesReturnLineItems.tsx`
- `src/view/finance/sales/returns/SalesReturnDetail.tsx`

Acceptance:
- Return dari direct Sales Invoice tidak mengubah stok.
- Return dari Sales Delivery sellable menambah stok.
- Void return delivery mengurangi stok kembali dan menolak jika stok tidak cukup.
- Return dari invoice hasil convert delivery tidak double count terhadap return delivery.

## Fase 3 - Source Chain Anti Double Return

Masalah production: satu barang bisa punya chain Sales Order -> Sales Delivery -> Sales Invoice. Jika return boleh dibuat dari delivery dan invoice sekaligus tanpa group policy, user bisa mengembalikan barang yang sama dua kali.

Policy production v1:
1. Jika Sales Delivery sudah dikonversi ke Sales Invoice, user diarahkan membuat return dari invoice.
2. Jika invoice berasal dari delivery, service harus menghitung issued return dari satu chain yang sama, bukan hanya `source_id` tunggal.
3. Returnable quantity harus membaca return yang sudah issue dari:
   - source invoice itu sendiri;
   - source delivery asal invoice;
   - delivery yang sudah punya invoice terkait.

Tambahkan helper:

```txt
src/utils/salesReturns/resolveSalesReturnSourceChain.ts
```

File yang diubah:
- `src/services/salesReturnService.ts`
- `src/utils/salesReturns/aggregateSalesReturns.ts`
- `src/view/finance/sales/SalesDocumentDetail.tsx`
- `src/components/sales-return/SalesReturnForm.tsx`

Acceptance:
- Delivery yang sudah punya invoice issued tidak bisa diretur langsung jika policy mengharuskan return dari invoice.
- Return dari invoice hasil delivery membaca return history delivery.
- Over-return ditolak walaupun return dibuat dari dokumen berbeda dalam chain yang sama.

## Fase 4 - Invoice Payment Status Recalculation

Masalah saat ini: balance display sudah membaca credit amount, tetapi aggregate `payment_status` di invoice bisa stale setelah return issue/void.

Tambahkan helper pure:

```txt
src/utils/salesDocuments/calculateInvoicePaymentStatus.ts
```

Aturan:

```ts
const netInvoiceAmount = Math.max(0, invoiceTotal - issuedCreditAmount);
const balanceDue = Math.max(0, netInvoiceAmount - paidAmount);
```

Status:
- `PAID`: `balanceDue <= 0`.
- `PARTIAL`: `paidAmount > 0` dan `balanceDue > 0`.
- `UNPAID`: `paidAmount <= 0` dan `balanceDue > 0`.

Tambahkan service function:

```ts
recalculateSalesInvoicePaymentStatus(invoiceId: string): Promise<void>
```

Catatan dependency:
- Hindari circular import antara `salesDocumentService.ts` dan `salesReturnService.ts`.
- Jika perlu, pindahkan summary read helper ke utility/service read-only terpisah, misalnya:

```txt
src/services/salesReturnReadService.ts
```

Panggil recalculation setelah:
- `issueSalesReturn()`
- `voidSalesReturn()`
- `markSalesInvoicePaid()`

Acceptance:
- Credit note membuat invoice `PAID` jika net balance menjadi 0.
- Void credit note mengembalikan status invoice sesuai paid amount dan balance.
- Payment input tidak bisa melebihi net invoice setelah credit note.

## Fase 5 - Finance Audit Trail untuk Refund dan Void

Masalah production: transaksi finance refund tidak boleh hilang dari histori.

Aturan:
1. `REFUND` membuat finance transaction:
   - type `EXPENSE`
   - category `FINANCE_CATEGORIES.SALES_REFUND`
   - `reference_id = salesReturn.id`
2. Void return refund tidak boleh hard delete finance transaction.
3. Void return refund harus membuat reversal transaction:
   - type `INCOME`
   - category tetap `FINANCE_CATEGORIES.SALES_REFUND`
   - amount sama dengan refund awal
   - description jelas: `Pembalikan refund retur {return_number}`
   - `reference_id = salesReturn.id`
4. Simpan id reversal jika dibutuhkan:

```ts
reversal_finance_transaction_id?: string;
```

File yang diubah:
- `src/types/index.ts`
- `src/services/salesReturnService.ts`
- `src/constants/finance.ts`
- `src/view/finance/cash-flow` atau screen finance terkait jika perlu label reversal.

Acceptance:
- Finance balance turun saat refund.
- Finance balance naik kembali saat void refund.
- Finance transaction refund awal tetap ada.
- Reversal refund terlihat di cash flow.
- `SALES_REFUND` tetap masuk kategori non-profit finance.

## Fase 6 - UI Guard dan UX Safety

UI bukan pengganti service validation, tetapi harus membantu user tidak salah input.

Update UI:
1. Di form return, tampilkan limit:
   - sisa qty bisa retur;
   - max credit note;
   - max refund;
   - apakah restock aktif atau tidak.
2. Disable `REFUND` untuk invoice unpaid.
3. Disable restock input jika source tidak punya stock effect.
4. Untuk source chain, tampilkan info source asal, misalnya `Invoice dari Delivery SD-...`.
5. Di detail Sales Document, tombol `Buat Retur` harus mengikuti policy source chain.
6. Di detail Sales Return, tampilkan finance transaction dan reversal jika ada.

File yang diubah:
- `src/components/sales-return/SalesReturnForm.tsx`
- `src/components/sales-return/SalesReturnLineItems.tsx`
- `src/components/sales-return/SalesReturnSummary.tsx`
- `src/view/finance/sales/SalesDocumentDetail.tsx`
- `src/view/finance/sales/returns/SalesReturnDetail.tsx`
- `src/i18n/messages.ts`

Acceptance:
- User tidak melihat pilihan yang secara bisnis pasti ditolak.
- Semua limit tetap divalidasi ulang di service.
- Copy error tersedia dalam Indonesia dan English.

## Fase 7 - Report dan Read Model

Untuk production, minimal read model harus tidak menyesatkan.

Minimum production v1:
1. Sales Document detail menampilkan:
   - gross invoice amount;
   - paid amount;
   - issued credit note;
   - issued refund;
   - net balance due.
2. Finance cash flow menampilkan refund dan reversal dengan category yang benar.
3. Sales report POS tidak dicampur dengan Sales Document return.

Jika report margin Sales Document sudah dipakai user, tambahkan:
- gross sales;
- sales return;
- net sales;
- gross profit before return;
- gross profit after return.

File yang mungkin diubah:
- `src/view/finance/sales/SalesDocumentDetail.tsx`
- `src/hooks/useReports.tsx`
- `src/routes/report/*`
- `src/view/SalesReport.tsx`
- `docs/MARGIN-SALES-AFTER-BEFORE-TAX.md`

Acceptance:
- Report tidak menghitung refund sebagai biaya operasional biasa.
- Net sales tidak mencampur POS dan Sales Document tanpa label.
- Gross sales historis tetap bisa dilihat.

## Fase 8 - Backup, Restore, dan Recalculate

Pastikan data production bisa dipulihkan.

Checklist:
1. Backup membawa `salesReturns` dan `salesReturnItems`.
2. Backup membawa field baru seperti source stock document atau reversal finance id jika ditambahkan.
3. Restore membuat Sales Document detail tetap bisa membaca return summary.
4. `recalculateFinance()` tidak menghapus `SALES_REFUND`.
5. Jika nanti ada replay finance, refund dan reversal ikut direplay.

File yang diubah:
- `src/utils/backupRestore.ts`
- `src/services/financeService.ts`

Acceptance:
- Backup lalu restore tidak menghilangkan return.
- Setelah restore, invoice tetap menampilkan return summary.
- Finance balance setelah recalculate tetap benar.

## Fase 9 - QA Matrix Production

Jalankan manual QA dengan data fresh dan data restore.

### Sales Delivery Return

1. Buat Sales Delivery issued dengan 2 item.
2. Return sebagian item condition `SELLABLE`.
3. Issue return.
4. Pastikan stok bertambah sesuai satuan konversi.
5. Void return.
6. Pastikan stok kembali berkurang.
7. Coba void saat stok tidak cukup.
8. Pastikan service menolak dengan error jelas.

### Direct Sales Invoice Credit Note

1. Buat Sales Invoice direct unpaid.
2. Buat return `CREDIT_NOTE`.
3. Issue return.
4. Pastikan tidak ada cash movement.
5. Pastikan balance due turun.
6. Pastikan stok tidak berubah.
7. Void return.
8. Pastikan balance due kembali.

### Paid Sales Invoice Refund

1. Buat Sales Invoice.
2. Catat pembayaran penuh.
3. Buat return `REFUND`.
4. Issue return.
5. Pastikan finance balance turun.
6. Pastikan finance transaction refund ada.
7. Void return.
8. Pastikan reversal finance transaction ada dan balance kembali.

### Partial Payment Guard

1. Buat invoice total 100.000.
2. Catat payment 40.000.
3. Coba refund 60.000.
4. Pastikan ditolak.
5. Coba credit note melebihi outstanding.
6. Pastikan ditolak.

### Source Chain Guard

1. Buat Sales Delivery issued.
2. Convert ke Sales Invoice.
3. Buat return dari invoice.
4. Coba return lagi dari delivery untuk item yang sama.
5. Pastikan over-return/double-return ditolak.

### Backup Restore

1. Buat delivery return, invoice credit note, dan invoice refund.
2. Backup database.
3. Restore database.
4. Buka detail invoice/source.
5. Pastikan summary return, finance transaction, reversal, dan status payment tetap benar.

## Fase 10 - Verification Teknis

Sebelum merge production:

```bash
/home/imam/.bun/bin/bun run lint
/home/imam/.bun/bin/bun run build
git diff --check
```

Jika ada test runner/unit test ditambahkan:

```bash
/home/imam/.bun/bin/bun test
```

Minimum unit/helper tests:
- `calculateSalesReturnLimits`
- `validateSalesReturn`
- `aggregateSalesReturns`
- `calculateInvoicePaymentStatus`
- source chain resolver

Acceptance:
- Lint pass.
- Build pass.
- Tidak ada whitespace error.
- Helper tests pass untuk over-return, refund limit, credit note limit, stock policy, dan payment status.

## Go/No-Go Checklist

Go production hanya jika semua item ini `YES`:

- Refund tidak bisa melebihi paid amount yang belum direfund.
- Credit note tidak bisa melebihi outstanding invoice.
- Direct invoice return tidak mengubah stok.
- Delivery/invoice chain tidak bisa double return.
- Void return membalik stok dengan guard stok tidak cukup.
- Void refund membuat reversal, bukan menghapus histori finance.
- Invoice payment status recalculate setelah return issue/void.
- Payment invoice tidak bisa melebihi net invoice setelah return.
- Backup/restore membawa semua return dan finance reference.
- Report/cash flow tidak menyesatkan net sales dan refund.
- Owner/Admin bisa manage return, role lain tidak bisa.
- Build dan lint pass.

## Urutan Implementasi Disarankan

1. Fase 1: invoice refund/credit limit.
2. Fase 2: stock effect policy.
3. Fase 3: source chain anti double return.
4. Fase 4: invoice payment status recalculation.
5. Fase 5: finance audit trail reversal.
6. Fase 6: UI guard dan i18n.
7. Fase 8: backup/restore dan recalculate safety.
8. Fase 9-10: QA dan technical verification.
9. Fase 7: report production, wajib sebelum report dipakai untuk keputusan bisnis.

Catatan untuk Accounts Receivable: jangan jadikan Sales Return sebagai dependensi production AR sebelum Fase 1 sampai Fase 5 selesai, karena piutang bersih membutuhkan credit/refund yang benar dan audit-able.
