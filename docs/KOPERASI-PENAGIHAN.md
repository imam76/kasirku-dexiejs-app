# Fitur Penagihan Koperasi (Billing / Collection)

> **Tujuan:** Memudahkan karyawan/petugas koperasi untuk menagih anggota yang memiliki angsuran jatuh tempo.
> Fitur ini bersifat **read/action-only** — tidak ada entitas baru di database, melainkan memanfaatkan data `cooperativeLoanInstallments` yang sudah ada.

---

## Latar Belakang

Saat ini halaman **Angsuran** (`/koperasi/angsuran`) sudah menampilkan jadwal angsuran dan riwayat pembayaran.
Namun, tidak ada fitur khusus yang memberikan tampilan terfokus untuk **kegiatan penagihan**: siapa yang harus ditagih hari ini / minggu ini, berapa total tunggakan, dan aksi cepat untuk mencatat pembayaran langsung dari tampilan tagihan.

Fitur **Penagihan** akan ditambah sebagai menu baru di flow koperasi:
`/koperasi/penagihan` → `CooperativeBillingManagement`

---

## Standar Codebase yang Harus Diikuti

| Aspek | Pola |
|---|---|
| **Routing** | `createLazyFileRoute` di `src/routes/koperasi/penagihan.lazy.tsx` |
| **View component** | `src/view/koperasi/billing/CooperativeBillingManagement.tsx` |
| **Hook** | `src/hooks/useCooperativeBilling.tsx` (pola: `useLiveQuery` + `useMutation` + filter state) |
| **UI Library** | Antd `Card`, `Table`, `Tag`, `Button`, `Select`, `Input.Search`, `Tabs`, `Drawer`, `App.useApp()` |
| **Icons** | `lucide-react` (konsisten dengan `CreditCard`, `Bell`, `Plus`) |
| **i18n** | Tambah keys baru di `src/i18n/messages.ts` — prefix `cooperative.billing.*` |
| **Permissions** | Route pakai `FINANCE_ACCESS` (sama dengan `/koperasi/angsuran`) |
| **Menu** | Tambah entry di `src/routes/koperasi/index.tsx` |
| **routePermissions** | Tambah `/koperasi/penagihan` di `src/auth/routePermissions.ts` |
| **Service layer** | Tidak perlu service baru — reuse `recordCooperativeLoanPayment` & `reverseCooperativeLoanPayment` dari `cooperativeLoanService.ts` |
| **Formatter** | `formatCurrency`, `formatDate` dari `@/utils/formatters` |
| **Options/colors** | Reuse `cooperativeLoanInstallmentStatusOptions` dari `loans/loanOptions.ts` |

---

## Struktur File yang Dibuat / Dimodifikasi

```
src/
├── routes/koperasi/
│   └── [NEW] penagihan.lazy.tsx          ← lazy route
│   └── [MODIFY] index.tsx                ← tambah menu item Penagihan
├── view/koperasi/billing/               ← [NEW FOLDER]
│   ├── CooperativeBillingManagement.tsx  ← komponen utama (Card + filter + Tabs)
│   ├── CooperativeBillingTable.tsx       ← tabel angsuran jatuh tempo + overdue
│   └── CooperativeBillingDrawer.tsx      ← drawer detail tagihan per anggota
├── hooks/
│   └── [NEW] useCooperativeBilling.tsx   ← hook data + filter + mutation
├── i18n/
│   └── [MODIFY] messages.ts              ← tambah keys cooperative.billing.*
└── auth/
    └── [MODIFY] routePermissions.ts      ← tambah /koperasi/penagihan
```

---

## Langkah-Langkah Implementasi

### Langkah 1 — i18n: Tambah Translation Keys

**File:** `src/i18n/messages.ts`

Tambahkan keys berikut (setelah blok `cooperative.installments.*`):

```ts
// --- cooperative.billing ---
'cooperative.billing.title': 'Penagihan',
'cooperative.billing.subtitle': 'Daftar angsuran jatuh tempo yang perlu ditagih.',
'cooperative.billing.searchPlaceholder': 'Cari nomor pinjaman, nama anggota...',
'cooperative.billing.empty': 'Tidak ada tagihan yang perlu ditindaklanjuti.',
'cooperative.billing.paySuccess': 'Pembayaran angsuran berhasil dicatat.',
'cooperative.billing.payFailed': 'Gagal mencatat pembayaran.',
'cooperative.billing.summaryOverdue': 'Total Tunggakan',
'cooperative.billing.summaryDueToday': 'Jatuh Tempo Hari Ini',
'cooperative.billing.summaryDueThisWeek': 'Jatuh Tempo Minggu Ini',
'cooperative.billing.tab.overdue': 'Terlambat',
'cooperative.billing.tab.dueToday': 'Hari Ini',
'cooperative.billing.tab.dueThisWeek': 'Minggu Ini',
'cooperative.billing.tab.all': 'Semua Belum Lunas',
'cooperative.billing.table.member': 'Anggota',
'cooperative.billing.table.loan': 'No. Pinjaman',
'cooperative.billing.table.installmentNo': 'Angsuran Ke',
'cooperative.billing.table.dueDate': 'Jatuh Tempo',
'cooperative.billing.table.bill': 'Tagihan',
'cooperative.billing.table.remaining': 'Sisa Tagihan',
'cooperative.billing.table.status': 'Status',
'cooperative.billing.table.overdueDays': 'Hari Terlambat',
'cooperative.billing.table.action': 'Aksi',
'cooperative.billing.pay': 'Bayar',
'cooperative.billing.drawer.title': 'Detail Tagihan',
'cooperative.billing.drawer.memberInfo': 'Info Anggota',
'cooperative.billing.drawer.loanInfo': 'Info Pinjaman',
'cooperative.billing.drawer.outstandingTotal': 'Total Sisa Pinjaman',
'cooperative.billing.memberFilter.all': 'Semua Anggota',
'cooperative.billing.periodFilter.overdue': 'Terlambat',
'cooperative.billing.periodFilter.today': 'Hari Ini',
'cooperative.billing.periodFilter.thisWeek': 'Minggu Ini',
'cooperative.billing.periodFilter.all': 'Semua Belum Lunas',
```

> **Catatan:** Tambahkan di dalam objek `messages` yang sudah ada. Pastikan koma dan format string sesuai dengan entries lain.

---

### Langkah 2 — Route Permission

**File:** `src/auth/routePermissions.ts`

Tambahkan setelah entry `/koperasi/angsuran`:

```ts
'/koperasi/penagihan': 'FINANCE_ACCESS',
```

---

### Langkah 3 — Menu Entry di Koperasi Index

**File:** `src/routes/koperasi/index.tsx`

Tambahkan item baru di array `menuItems` (setelah entry angsuran):

```tsx
{
  to: '/koperasi/penagihan',
  label: t('cooperative.billing.title'),
  icon: BellOutlined,           // import dari @ant-design/icons
  color: 'text-rose-600',
  desc: t('cooperative.billing.subtitle'),
},
```

Tambahkan import `BellOutlined` dari `@ant-design/icons` di bagian atas file.

---

### Langkah 4 — Lazy Route File

**File baru:** `src/routes/koperasi/penagihan.lazy.tsx`

```tsx
import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeBillingManagement from '@/view/koperasi/billing/CooperativeBillingManagement';

export const Route = createLazyFileRoute('/koperasi/penagihan')({
  component: CooperativeBillingManagement,
});
```

> Ikuti pola yang identik dengan `angsuran.lazy.tsx`.

---

### Langkah 5 — Hook: `useCooperativeBilling`

**File baru:** `src/hooks/useCooperativeBilling.tsx`

**Pola:** Ikuti `useCooperativeInstallments.tsx` — `useLiveQuery` + `useMutation` + filter state.

**Yang perlu dilakukan hook ini:**

```ts
// Data dari Dexie (live reactive)
const installments = useLiveQuery(...)  // cooperativeLoanInstallments ordered by due_date
const loans = useLiveQuery(...)         // cooperativeLoans
const paymentAccounts = useLiveQuery(...)

// Computed
const loanById: Map<string, CooperativeLoan>
const overdueInstallments     // due_date < today && status !== PAID
const dueTodayInstallments    // due_date === today && status !== PAID
const dueThisWeekInstallments // due_date dalam 7 hari ke depan && status !== PAID
const allUnpaidInstallments   // semua status !== PAID dari loan DISBURSED

// Filter state
const [searchText, setSearchText]
const [memberFilter, setMemberFilter]      // string (member_id | 'ALL')
const [selectedInstallment, setSelectedInstallment]  // untuk drawer

// Summary stats
const overdueCount, overdueTotalAmount
const dueTodayCount, dueTodayTotalAmount
const dueThisWeekCount

// Mutation — reuse dari cooperativeLoanService (tidak buat baru)
recordPayment: (input: RecordCooperativeLoanPaymentInput) => ...
isMutating: boolean
```

**Logika filter overdue:**
```ts
const today = dayjs().startOf('day');
const overdue = installments.filter(i => 
  dayjs(i.due_date).isBefore(today) && i.status !== 'PAID'
  && loanById.get(i.loan_id)?.status === 'DISBURSED'
);
```

**Invalidation keys** (sama dengan `useCooperativeInstallments`):
```ts
['cooperativeLoans', 'cooperativeLoanInstallments', 'cooperativeLoanPayments',
 'financeBalance', 'financeTransactions', 'journalEntries', 'trialBalance']
```

---

### Langkah 6 — Tabel: `CooperativeBillingTable`

**File baru:** `src/view/koperasi/billing/CooperativeBillingTable.tsx`

**Pola:** Ikuti `CooperativeInstallmentTable.tsx`.

**Kolom tabel:**

| Kolom | Data | Keterangan |
|---|---|---|
| Jatuh Tempo | `due_date` | `formatDate(due_date)` — highlight merah jika overdue |
| Anggota | `member_number` + `member_name` | Typography.Text stacked seperti di installment table |
| No. Pinjaman | `loan_number` | |
| Angsuran Ke | `installment_number` | |
| Tagihan | `principal + interest + penalty` | `formatCurrency` |
| Sisa Tagihan | `remaining.total_amount` | `getInstallmentRemainingAmounts(installment)` |
| Hari Terlambat | computed `dayjs().diff(due_date, 'day')` | Hanya tampil jika > 0 |
| Status | `status` | `Tag` dengan color dari `cooperativeLoanInstallmentStatusOptions` |
| Aksi | Button Bayar | disabled jika PAID atau loan bukan DISBURSED |

**Row highlight:** Gunakan `onRow` untuk memberikan class CSS `text-red-600` pada baris overdue:
```tsx
onRow={(record) => ({
  className: dayjs(record.due_date).isBefore(dayjs().startOf('day')) ? 'billing-overdue-row' : '',
})}
```

**Props:**
```ts
interface CooperativeBillingTableProps {
  installments: CooperativeLoanInstallment[];
  loanById: Map<string, CooperativeLoan>;
  onPay: (installment: CooperativeLoanInstallment) => void;
  onView: (installment: CooperativeLoanInstallment) => void;
  loading?: boolean;
}
```

---

### Langkah 7 — Drawer: `CooperativeBillingDrawer`

**File baru:** `src/view/koperasi/billing/CooperativeBillingDrawer.tsx`

**Pola:** Ikuti `CooperativeLoanPaymentDetailDrawer.tsx` atau `CooperativeLoanDetailDrawer.tsx`.

**Konten drawer:**
- Info anggota: nama, nomor anggota
- Info pinjaman: nomor pinjaman, pokok awal, bunga, sisa outstanding total
- Info angsuran yang dipilih: jatuh tempo, tagihan, sudah dibayar, sisa, status
- Tombol "Bayar" di footer drawer (trigger modal pembayaran)

**Props:**
```ts
interface CooperativeBillingDrawerProps {
  installment: CooperativeLoanInstallment | null;
  loan: CooperativeLoan | undefined;
  open: boolean;
  onClose: () => void;
  onPay: (installment: CooperativeLoanInstallment) => void;
}
```

---

### Langkah 8 — Komponen Utama: `CooperativeBillingManagement`

**File baru:** `src/view/koperasi/billing/CooperativeBillingManagement.tsx`

**Pola:** Ikuti `CooperativeInstallmentManagement.tsx` secara ketat.

**Struktur JSX:**

```tsx
<Card
  title={<div className="flex items-center gap-2"><Bell />{t('cooperative.billing.title')}</div>}
>
  {/* Summary Stats Row */}
  <div className="mb-4 grid grid-cols-3 gap-3">
    <StatCard label="Total Tunggakan" value={overdueCount} amount={overdueTotalAmount} />
    <StatCard label="Jatuh Tempo Hari Ini" value={dueTodayCount} />
    <StatCard label="Minggu Ini" value={dueThisWeekCount} />
  </div>

  {/* Filters */}
  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(220px,260px)]">
    <Input.Search ... />
    <Select memberFilter ... />
  </div>

  {/* Tabs */}
  <Tabs items={[
    { key: 'overdue', label: '...', children: <CooperativeBillingTable ... /> },
    { key: 'today',   label: '...', children: <CooperativeBillingTable ... /> },
    { key: 'week',    label: '...', children: <CooperativeBillingTable ... /> },
    { key: 'all',     label: '...', children: <CooperativeBillingTable ... /> },
  ]} />

  {/* Modal Pembayaran — Reuse CooperativeLoanPaymentFormModal */}
  <CooperativeLoanPaymentFormModal ... />

  {/* Drawer Detail */}
  <CooperativeBillingDrawer ... />
</Card>
```

**Handle submit pembayaran:** Identik dengan `CooperativeInstallmentManagement.handleSubmit` — call `recordPayment` dari hook, lalu `message.success`.

**StatCard** — bisa berupa komponen inline sederhana (tidak perlu file terpisah):
```tsx
function StatCard({ label, count, amount }: { label: string; count: number; amount?: number }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-800">{count}</p>
      {amount !== undefined && (
        <p className="text-sm text-gray-600">Rp {formatCurrency(amount)}</p>
      )}
    </div>
  );
}
```

---

### Langkah 9 — Reuse Modal Pembayaran

**Jangan buat modal baru.** Reuse `CooperativeLoanPaymentFormModal` dari `src/view/koperasi/installments/`.

Import langsung:
```tsx
import CooperativeLoanPaymentFormModal, {
  type CooperativeLoanPaymentFormValues,
} from '@/view/koperasi/installments/CooperativeLoanPaymentFormModal';
```

Pola inisialisasi form sama dengan `CooperativeInstallmentManagement.openPaymentModal`.

---

## Checklist Implementasi

```
[ ] 1. Tambah i18n keys di messages.ts
[ ] 2. Tambah route permission /koperasi/penagihan
[ ] 3. Tambah menu item di koperasi/index.tsx
[ ] 4. Buat penagihan.lazy.tsx
[ ] 5. Buat useCooperativeBilling.tsx
[ ] 6. Buat CooperativeBillingTable.tsx
[ ] 7. Buat CooperativeBillingDrawer.tsx
[ ] 8. Buat CooperativeBillingManagement.tsx
[ ] 9. Verifikasi route terdaftar di routeTree.gen.ts (auto-generate oleh TanStack Router)
[ ] 10. Smoke test: buka /koperasi/penagihan, filter tabs, coba bayar
```

---

## Catatan Penting

### Tidak Perlu Entitas Baru di DB
Fitur ini **murni membaca** `cooperativeLoanInstallments` yang sudah ada. Tidak ada tabel baru, tidak ada field baru di `types/index.ts`, tidak ada perubahan service layer.

### Reuse Service yang Ada
Pembayaran tetap memanggil `recordCooperativeLoanPayment` dari `cooperativeLoanService.ts`. Sync, journal entry, finance transaction — semua sudah otomatis dihandle di sana.

### Perhatian pada `dayjs` Import
Selalu gunakan `import dayjs from '@/lib/dayjs'` (alias, bukan dari `dayjs` langsung) agar konfigurasi locale konsisten.

### `data-testid` Convention
Ikuti pattern:
```tsx
data-testid="koperasi-billing-pay-{installment.id}"
data-testid="koperasi-billing-row-{member_number}-{installment_number}"
```

### TanStack Router — Route Tree Auto-Generate
Setelah membuat `penagihan.lazy.tsx`, jalankan dev server (`npm run dev`) atau `npx tsr generate` agar `routeTree.gen.ts` ter-update otomatis.

---

## Referensi File Kunci

| File | Tujuan |
|---|---|
| [`CooperativeInstallmentManagement.tsx`](../src/view/koperasi/installments/CooperativeInstallmentManagement.tsx) | Template utama komponen management |
| [`CooperativeInstallmentTable.tsx`](../src/view/koperasi/installments/CooperativeInstallmentTable.tsx) | Template tabel |
| [`CooperativeLoanPaymentFormModal.tsx`](../src/view/koperasi/installments/CooperativeLoanPaymentFormModal.tsx) | Modal bayar — **dipakai ulang** |
| [`useCooperativeInstallments.tsx`](../src/hooks/useCooperativeInstallments.tsx) | Template hook |
| [`cooperativeLoanService.ts`](../src/services/cooperativeLoanService.ts) | Service recordPayment — **dipakai ulang** |
| [`loanOptions.ts`](../src/view/koperasi/loans/loanOptions.ts) | Status options — **dipakai ulang** |
| [`routePermissions.ts`](../src/auth/routePermissions.ts) | Permission map |
| [`messages.ts`](../src/i18n/messages.ts) | i18n keys |
