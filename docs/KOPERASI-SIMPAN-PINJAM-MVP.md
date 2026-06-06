Saya ingin menambahkan modul Koperasi Simpan Pinjam (KSP) sebagai menu khusus di aplikasi Kasirku yang sudah ada.

Modul ini adalah back-office internal untuk staf/admin koperasi, bukan portal anggota.

Target besar:
- Semua fitur KSP berada di parent menu khusus `Koperasi`.
- Route KSP memakai namespace `/koperasi/*`.
- Tetap memakai kerangka, struktur folder, service, hook, schema, route, permission, i18n, UI pattern, dan style yang sudah ada di repo ini.
- Jangan membuat standarisasi baru kalau repo sudah punya pola.
- Jangan mengimplementasikan semua fase sekaligus. Kerjakan hanya fase yang diminta user pada turn itu.

## Instruksi Wajib Sebelum Coding

Sebelum membuat file atau mengubah kode, audit dulu file hidup berikut dan sebutkan ringkas temuannya:

- `package.json`: script validasi yang tersedia.
- `src/lib/db.ts`: versi Dexie terakhir dan table existing.
- `src/types/index.ts`: tipe existing untuk auth, role, permission, finance, COA, journal.
- `src/auth/permissions.ts` dan `src/auth/routePermissions.ts`: pola role dan permission route.
- `src/auth/authService.ts`: pola guard permission dan `writeActivityLog`.
- `src/routes/__root.tsx`: pola sidebar/menu.
- `src/routes/finance/index.tsx` dan `src/routes/report/index.tsx`: pola parent menu page.
- `src/view/master-data/contacts/` atau `src/view/master-data/warehouses/`: pola page shell + modal + table.
- `src/services/financeService.ts`: pola cash-flow operational layer.
- `src/services/generalLedgerService.ts`: pola posting jurnal, idempotency, reversal, dan balance check.
- `src/services/chartOfAccountService.ts` dan `src/constants/chartOfAccounts.ts`: pola seed COA dan mapping.
- `src/utils/backupRestore.ts`: pola backup/restore untuk table baru.
- `src/i18n/messages.ts`: pola label/menu/form.

Jika ada asumsi yang tidak terbukti dari file di atas, jangan langsung coding. Tulis sebagai gap atau open question.

## Batasan Arsitektur Repo Ini

Wajib ikuti batasan ini:

- UI read/write tetap Dexie-first sesuai pola repo.
- `src/routeTree.gen.ts` adalah generated file. Jangan edit manual; biarkan build/router generator memperbarui.
- Jangan membuat tabel `users`, `roles`, atau `activity_logs` baru. Repo sudah punya `authUsers`, role/permission constant, dan `activityLogs`.
- Jangan membuat tabel `chart_of_accounts`, `journal_entries`, atau `journal_entry_lines` baru. Repo sudah punya `chartOfAccounts`, `journalEntries`, dan `journalEntryLines`.
- Jangan membuat engine kas/bank baru jika `financeTransactions` + snapshot `cash_account_*` + COA sudah cukup. Anggap `financeTransactions` sebagai cash-flow operational layer, bukan accounting ledger.
- Jangan menulis jurnal langsung dari komponen UI. Posting jurnal harus lewat service layer.
- Journal harus memakai helper/pola existing di `generalLedgerService.ts`, terutama balance check, idempotency berdasarkan source, dan reversal.
- Transaksi posted tidak boleh hard delete. Koreksi memakai reversal/void sesuai pola existing.
- Semua mutasi penting harus guard permission di service, bukan hanya sembunyikan tombol UI.
- Semua mutasi penting harus menulis `writeActivityLog`.
- Semua Dexie transaction harus memasukkan semua store yang dibaca/ditulis di scope transaksi.
- Jangan membuat folder arsitektur baru. Ikuti pola existing: `types -> Dexie -> constants/utils -> service -> hook -> validation -> route/view/components -> permissions/i18n -> backup/restore`.
- Jika PostgreSQL/Tauri mirror sync dibutuhkan, implementasikan sebagai subfase lengkap mengikuti pola existing. Jangan half-wire repository/command Rust. Untuk MVP awal, Dexie + backup/restore cukup kecuali user secara eksplisit meminta persistence Tauri/Postgres.
- Jangan menambah test framework baru. Jika repo tidak punya test runner, buat QA checklist/manual acceptance dan validasi dengan script existing.

## Role dan Permission

Role existing saat ini adalah sumber kebenaran. Jangan langsung mengganti seluruh model role.

Default untuk MVP:
- Owner/Admin: boleh mengelola KSP.
- Role lain mengikuti permission existing sampai Phase 5.
- Untuk route KSP awal, gunakan permission existing yang paling dekat, misalnya `FINANCE_ACCESS` atau `SETTINGS_ACCESS`, setelah audit file permission.
- Jika perlu permission baru, tambahkan minimal dan eksplisit, misalnya `COOPERATIVE_ACCESS` atau `COOPERATIVE_MANAGE`, lalu update:
  - `src/types/index.ts`
  - `src/auth/permissions.ts`
  - `src/auth/routePermissions.ts`
  - UI yang memakai `canAccessPath` atau `can(...)`

Jangan menambah role `STAFF`, `MANAGER`, atau `VIEWER` di awal hanya karena domain KSP menyebutnya. Jika role tersebut benar-benar dibutuhkan, jadikan Phase 5 setelah audit User Management dan permission matrix.

## Menu dan Route

Tambahkan parent menu khusus:

```txt
Koperasi
```

Route yang disarankan:

```txt
/koperasi
/koperasi/anggota
/koperasi/simpanan
/koperasi/pinjaman
/koperasi/angsuran
/koperasi/laporan
/koperasi/settings
```

Catatan:
- `Kas & Bank` tetap memakai layer existing Finance/Cash & Bank. Di menu Koperasi boleh ada link/view ringkas jika diperlukan, tetapi jangan membuat master kas/bank paralel.
- `Akuntansi` tetap memakai existing COA/General Ledger. Di menu Koperasi boleh tampilkan link/filter jurnal KSP, tetapi jangan membuat ledger baru.

## Naming dan Entity Baru

Gunakan naming TypeScript/Dexie sesuai pola repo:

- Type/interface PascalCase.
- Dexie table camelCase.
- Jangan memakai snake_case untuk table Dexie.
- Snake case hanya boleh untuk migrasi SQL/Tauri jika subfase Postgres memang dikerjakan.

Entity KSP yang disarankan:

```txt
cooperativeMembers
cooperativeSavingTransactions
cooperativeMemberSavingBalances
cooperativeLoans
cooperativeLoanInstallments
cooperativeLoanPayments
cooperativeSettings
```

Jangan membuat entity berikut karena sudah ada:

```txt
users
roles
cash_accounts
cash_mutations
chart_of_accounts
journal_entries
journal_entry_lines
activity_logs
```

Jika nama di atas perlu disesuaikan dengan pola repo setelah audit, jelaskan alasannya dulu.

## Model Minimum

### Anggota

Minimal field:

```txt
id
member_number
name
identity_number?
phone?
address?
join_date
status: ACTIVE | INACTIVE | SUSPENDED
notes?
created_at
updated_at
created_by?
created_by_name?
updated_by?
updated_by_name?
sync_status?
sync_error?
last_synced_at?
remote_updated_at?
```

Business rule:
- `member_number` wajib unik untuk anggota aktif.
- Hanya anggota `ACTIVE` yang boleh transaksi simpanan dan pinjaman.
- Archive/nonaktifkan anggota, jangan hard delete jika sudah punya transaksi.

### Simpanan

Jenis simpanan:

```txt
POKOK
WAJIB
SUKARELA
```

Jenis transaksi:

```txt
DEPOSIT
WITHDRAWAL
REVERSAL
```

Business rule:
- Simpanan pokok hanya boleh disetor satu kali per anggota.
- Penarikan hanya boleh dari simpanan sukarela.
- Penarikan tidak boleh melebihi saldo sukarela.
- Semua setoran/penarikan posted membuat cash-flow di `financeTransactions`.
- Semua setoran/penarikan posted membuat jurnal otomatis jika General Ledger ready.
- Koreksi memakai reversal, bukan delete.

### Pinjaman

Status minimal:

```txt
DRAFT
SUBMITTED
APPROVED
REJECTED
DISBURSED
PAID_OFF
REVERSED
```

Business rule:
- Pinjaman harus melalui pengajuan, approval, lalu pencairan.
- Pinjaman hanya boleh dicairkan setelah `APPROVED`.
- Pinjaman yang sudah dicairkan wajib generate jadwal angsuran otomatis.
- Untuk MVP gunakan bunga flat.
- Koreksi pinjaman posted memakai reversal/void flow, bukan hard delete.

### Jadwal Angsuran

Status minimal:

```txt
UNPAID
PARTIAL
PAID
OVERDUE
```

Business rule:
- Jadwal dibuat otomatis saat pencairan.
- Untuk MVP, pembayaran boleh diarahkan ke satu angsuran terpilih.
- Jika ingin pembayaran lintas beberapa angsuran, buat helper allocation yang jelas dan testable.

### Pembayaran Angsuran

Alokasi pembayaran:

```txt
1. denda
2. bunga
3. pokok
```

Business rule:
- Pembayaran angsuran membuat cash-flow masuk.
- Pembayaran angsuran mengurangi outstanding pinjaman.
- Status angsuran berubah menjadi `PARTIAL` atau `PAID`.
- Status pinjaman berubah menjadi `PAID_OFF` jika seluruh pokok/bunga/denda selesai.
- Jurnal pembayaran harus balance.

## Formula Bunga Flat MVP

Gunakan helper pure untuk perhitungan agar mudah diuji:

```txt
total_bunga = pokok_pinjaman * bunga_per_bulan * tenor
total_tagihan = pokok_pinjaman + total_bunga
angsuran_pokok_per_bulan = pokok_pinjaman / tenor
angsuran_bunga_per_bulan = total_bunga / tenor
angsuran_total_per_bulan = angsuran_pokok_per_bulan + angsuran_bunga_per_bulan
```

Aturan pembulatan:
- Ikuti helper pembulatan currency existing jika ada.
- Jika tidak ada helper yang cocok, buat helper kecil di `src/utils/koperasi/` atau lokasi yang mengikuti pola repo.
- Jelaskan dampak rounding untuk angsuran terakhir.

## Integrasi Cash-Flow

Gunakan `financeTransactions` sebagai mutasi kas/bank operational.

Kategori baru boleh ditambah di `src/constants/finance.ts` jika dibutuhkan, misalnya:

```txt
KSP_SAVING_DEPOSIT
KSP_SAVING_WITHDRAWAL
KSP_LOAN_DISBURSEMENT
KSP_LOAN_PAYMENT
```

Pastikan kategori KSP tidak membuat profit report existing salah hitung.

Panduan:
- Setoran simpanan: cash in, bukan pendapatan.
- Penarikan simpanan: cash out, bukan beban.
- Pencairan pinjaman: cash out, bukan beban.
- Pembayaran pokok pinjaman: cash in, bukan pendapatan.
- Bunga/denda pinjaman adalah pendapatan di accounting ledger, bukan alasan untuk menggandakan revenue di cash-flow operational.

Pilih akun kas/bank memakai helper existing seperti `getCashOrBankAccountForPayment(...)` jika masih sesuai.

## Integrasi COA dan Jurnal

Gunakan `chartOfAccounts` existing sebagai master akun.

Akun dasar KSP yang kemungkinan dibutuhkan:

```txt
Piutang Pinjaman Anggota
Simpanan Anggota
Pendapatan Bunga/Jasa Pinjaman
Pendapatan Denda Pinjaman
```

Jika akun belum ada:
- Tambahkan seed/missing-account logic sesuai pola `DEFAULT_CHART_OF_ACCOUNTS` dan `ensureAccountingDefaults`.
- Jangan overwrite akun user yang sudah ada.
- Jangan membuat COA table baru.

Jurnal otomatis:

1. Setoran simpanan

```txt
Debit Kas/Bank
Kredit Simpanan Anggota
```

2. Penarikan simpanan

```txt
Debit Simpanan Anggota
Kredit Kas/Bank
```

3. Pencairan pinjaman

```txt
Debit Piutang Pinjaman Anggota
Kredit Kas/Bank
```

4. Pembayaran angsuran

```txt
Debit Kas/Bank
Kredit Piutang Pinjaman Anggota
Kredit Pendapatan Bunga/Jasa Pinjaman
Kredit Pendapatan Denda Pinjaman, jika ada
```

Tambahkan `JournalSourceType` dan `source_event` KSP hanya jika memang diperlukan oleh `generalLedgerService.ts`.

Source event yang disarankan:

```txt
COOPERATIVE_SAVING_DEPOSIT_POSTED
COOPERATIVE_SAVING_WITHDRAWAL_POSTED
COOPERATIVE_LOAN_DISBURSED
COOPERATIVE_LOAN_PAYMENT_POSTED
```

Posting jurnal harus idempotent dan reversal harus mengikuti pola existing.

## Fase Implementasi

### Phase 0 - Audit dan Dokumen Rencana

Output:
- Buat atau update `docs/KOPERASI-SIMPAN-PINJAM-MVP.md`.
- Isi dokumen harus berbasis file hidup repo, bukan asumsi.
- Sebutkan next Dexie version dari `src/lib/db.ts`.
- Sebutkan entity existing yang akan dipakai ulang: auth, activity log, COA, GL, finance/cash-flow, backup/restore.
- Sebutkan entity baru yang benar-benar perlu dibuat.
- Sebutkan acceptance criteria per phase.

Jangan coding fitur sebelum Phase 0 selesai jika user meminta rencana dulu.

### Phase 1 - Foundation KSP

Scope:
- Tambah schema/type Dexie untuk entity KSP minimal.
- Tambah parent menu `Koperasi` dan route namespace `/koperasi`.
- Tambah Master Anggota:
  - service
  - hook
  - validation
  - UI list/table
  - UI form modal
  - detail page atau detail drawer sesuai pola repo
  - archive/restore, bukan hard delete
  - activity log
  - backup/restore
  - permission route/action
  - i18n
- Audit Cash & Bank existing dan pakai ulang. Jangan buat master kas/bank baru kalau COA cash/bank existing cukup.
- Tambah akun COA KSP dasar hanya jika belum ada dan diperlukan untuk phase berikutnya.

Tidak masuk Phase 1:
- Setoran simpanan.
- Pinjaman.
- Pembayaran angsuran.
- Laporan penuh.
- Role baru `STAFF/MANAGER/VIEWER`.

### Phase 2 - Simpanan Anggota

Scope:
- Setoran simpanan `POKOK`, `WAJIB`, `SUKARELA`.
- Penarikan hanya untuk `SUKARELA`.
- Balance per anggota per jenis simpanan.
- Cash-flow otomatis via `financeTransactions`.
- Jurnal otomatis setoran/penarikan via `generalLedgerService.ts`.
- Reversal transaksi simpanan posted.
- UI form, list/table, detail.
- Activity log, backup/restore, permission, i18n.

Acceptance criteria:
- Simpanan pokok kedua untuk anggota yang sama ditolak.
- Penarikan simpanan pokok/wajib ditolak.
- Penarikan sukarela melebihi saldo ditolak.
- Cash-flow bertambah/berkurang sesuai akun kas/bank.
- Jurnal balance saat GL ready.

### Phase 3 - Pinjaman dan Pencairan

Scope:
- Pengajuan pinjaman.
- Approval/reject pinjaman.
- Pencairan pinjaman.
- Generate jadwal angsuran flat.
- Cash-flow pencairan.
- Jurnal pencairan.
- UI form, list/table, detail.
- Activity log, backup/restore, permission, i18n.

Acceptance criteria:
- Pinjaman tidak bisa dicairkan sebelum approved.
- Jadwal angsuran dibuat sebanyak tenor.
- Total pokok jadwal sama dengan pokok pinjaman setelah rounding.
- Total bunga jadwal sama dengan total bunga setelah rounding.
- Jurnal pencairan balance saat GL ready.

### Phase 4 - Pembayaran Angsuran

Scope:
- Pembayaran angsuran.
- Allocation order: denda -> bunga -> pokok.
- Update status angsuran.
- Update outstanding pinjaman.
- Update status pinjaman menjadi `PAID_OFF` jika selesai.
- Cash-flow pembayaran.
- Jurnal pembayaran.
- Reversal pembayaran.
- UI form, list/table, detail.
- Activity log, backup/restore, permission, i18n.

Acceptance criteria:
- Pembayaran partial memperbarui paid amount dan status `PARTIAL`.
- Pembayaran penuh memperbarui status `PAID`.
- Outstanding tidak boleh negatif.
- Pinjaman lunas hanya jika semua angsuran selesai.
- Jurnal pembayaran balance saat GL ready.

### Phase 5 - Dashboard, Laporan, Audit, Role Access

Scope:
- Dashboard ringkas KSP.
- Laporan dasar:
  - daftar anggota
  - saldo simpanan anggota
  - mutasi simpanan
  - pinjaman aktif
  - outstanding pinjaman
  - jadwal angsuran
  - pembayaran angsuran
  - tunggakan
  - mutasi kas/bank terkait KSP
  - jurnal umum terkait KSP
  - buku besar
  - neraca sederhana
  - laba rugi sederhana
- Audit log viewer/filter untuk aktivitas KSP jika diperlukan.
- Review role access.
- Baru di phase ini boleh mempertimbangkan role `STAFF`, `MANAGER`, `VIEWER`, atau permission baru, setelah audit user management.

Untuk report:
- Default report read-only.
- Gunakan clickable identifier sebagai drill-down jika pola repo mendukung.
- Jangan menaruh action mutasi di report kecuali memang report itu pemilik workflow.

## UI Standar

Ikuti pola existing:
- Ant Design untuk form/table/modal.
- `lucide-react` atau AntD icon sesuai area existing.
- Page shell tipis, logic di hook/service.
- Form kompleks dalam modal atau halaman editor sesuai pola existing.
- Table/list untuk data operasional.
- Detail page/drawer untuk jejak transaksi.
- Error handling pakai `App.useApp().message` atau pola existing.
- Jangan membuat landing page marketing.
- Jangan membuat card bertumpuk atau layout dekoratif yang tidak sesuai aplikasi operasional.

## Validasi dan Test Minimal

Selalu jalankan validasi yang tersedia:

```txt
bun run build
bun run lint
git diff --check
```

Jika ada test runner existing, tambahkan test minimal untuk helper pure:
- perhitungan bunga flat
- pembulatan angsuran
- allocation pembayaran denda/bunga/pokok
- validasi saldo simpanan

Jika tidak ada test runner di repo:
- Jangan install framework baru.
- Tambahkan manual QA checklist di dokumen phase atau final response.
- Tetap validasi dengan build/lint/diff check.

## Format Kerja Yang Diinginkan

Saat menerima request implementasi:

1. Audit file existing yang relevan.
2. Sebutkan phase yang sedang dikerjakan.
3. Implementasikan hanya scope phase tersebut.
4. Jangan melebar ke phase berikutnya.
5. Setelah edit, jalankan validasi.
6. Laporkan:
   - file yang diubah
   - keputusan reuse vs file baru
   - business rule yang sudah dijaga
   - validasi yang berhasil/gagal
   - gap yang sengaja ditunda ke phase berikutnya

Mulai dari Phase 0 atau Phase 1 sesuai permintaan user terbaru. Jika user tidak menyebut phase, default ke Phase 0 audit + dokumen rencana, bukan langsung membangun semua modul.
