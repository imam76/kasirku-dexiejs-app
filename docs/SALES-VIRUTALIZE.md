# Sales Document Line Item Virtualization

## Tujuan

Membuat editor line item sales document tetap lancar saat berisi lebih dari 500 baris tanpa memecah source of truth perhitungan dokumen, pajak, diskon, stok, dan submit flow.

Target utama:

- Scroll line item tetap ringan di 500 sampai 1000 baris.
- Tambah baris tidak membuat semua row terasa freeze.
- Field produk, qty, unit, harga, diskon, dan pajak tetap editable.
- Perhitungan subtotal, diskon, pajak, dan total tetap lewat helper sales document yang sudah ada.
- Tidak membuat fungsi util duplikat untuk item, unit, tax option, atau kalkulasi.

## Keputusan Teknis

Gunakan `@tanstack/react-virtual` untuk mengganti render `Table` penuh di `DocumentLineItems`.

Jangan pakai virtual bawaan AntD Table sebagai implementasi utama untuk editor ini, karena line item sales document punya:

- Input dan select aktif di setiap row.
- Expanded row untuk harga, diskon, dan pajak.
- Tinggi row yang bisa berubah.
- Target 500+ row yang lebih cocok dikontrol sebagai virtual editable grid.

AntD tetap dipakai untuk control form seperti `Select`, `InputNumber`, dan `Button`. Yang diganti adalah layout tabelnya, bukan komponen inputnya.

## Struktur File

Ikuti struktur modul yang sudah ada di sales document:

```txt
src/components/sales-document/
  DocumentLineItems.tsx
  DocumentLineItemsVirtualTable.tsx
  DocumentLineItemRow.tsx
  DocumentLineItemExpandedFields.tsx

src/utils/salesDocuments/
  createEmptySalesDocumentItem.ts
```

Peran file:

- `DocumentLineItems.tsx`: container state, handler, memoized lookup, dan tombol tambah baris.
- `DocumentLineItemsVirtualTable.tsx`: scroll container, `useVirtualizer`, sticky header, dan absolute row layout.
- `DocumentLineItemRow.tsx`: satu row editable yang di-memoize.
- `DocumentLineItemExpandedFields.tsx`: field tambahan untuk harga, diskon, pajak, dan tax amount.
- `createEmptySalesDocumentItem.ts`: satu-satunya helper untuk membuat item kosong.

Jangan membuat folder baru di luar `src/components/sales-document` kecuali untuk helper domain di `src/utils/salesDocuments`.

## Reuse Helper Yang Ada

Gunakan helper yang sudah ada:

- `src/utils/salesDocuments/calculateDocumentTotal.ts` untuk seluruh kalkulasi subtotal, discount, tax, dan total.
- `src/utils/salesDocuments/mapProductToSalesDocumentItem.ts` untuk mengisi row dari product.
- `src/utils/productUnits.ts` untuk unit produk.
- `src/utils/formatters.ts` untuk format currency.

Jika butuh helper baru untuk list unit dokumen, tambahkan ke `src/utils/productUnits.ts` atau `src/utils/salesDocuments`, jangan definisikan ulang di component.

Contoh yang perlu dihindari:

```tsx
const getProductUnits = (product?: Product) => {
  ...
};
```

Helper seperti ini saat ini ada di `DocumentLineItems.tsx`; pindahkan atau gabungkan ke util agar tidak ada versi kedua.

## Tahap 1: Rapikan Source of Truth Row

Masalah awal saat ini:

- `SalesDocumentForm` mengirim `total.items` ke `DocumentLineItems`.
- `calculateDocumentTotal()` melakukan `map` semua item.
- Akibatnya identity object row lama ikut berubah saat satu field berubah.

Langkah:

1. Di `SalesDocumentForm.tsx`, tetap hitung `total` dengan `calculateDocumentTotal`.
2. Kirim raw `items` ke `DocumentLineItems`.
3. Kirim calculated items sebagai lookup terpisah, misalnya `calculatedItems={total.items}`.
4. Di `DocumentLineItems`, buat `calculatedItemsById` dengan `useMemo`.
5. Row menampilkan `subtotal`, `tax_amount`, dan field kalkulasi lain dari `calculatedItemsById.get(item.id)`.
6. Submit tetap memakai `total.items`, bukan raw `items`.

Tujuannya supaya edit satu row tidak memaksa semua row menerima object baru dari hasil kalkulasi.

## Tahap 2: Memo Lookup dan Options

Di `DocumentLineItems.tsx`, siapkan lookup sebelum render virtual table:

```tsx
const productOptions = useMemo(
  () => products.map((product) => ({
    value: product.id,
    label: product.sku ? `${product.name} - ${product.sku}` : product.name,
  })),
  [products],
);

const productsById = useMemo(
  () => new Map(products.map((product) => [product.id, product])),
  [products],
);

const taxOptions = useMemo(
  () => taxes.map((tax) => ({
    value: tax.id,
    label: `${tax.name} (${tax.rate}%, ${tax.calculation_mode})`,
  })),
  [taxes],
);
```

Tambahkan juga:

- `unitOptionsByProductId`
- `calculatedItemsById`
- `expandedRowKeySet`

Jangan jalankan `products.map`, `products.find`, atau `taxes.map` di render row.

## Tahap 3: Stabilkan Handler

Bungkus handler utama dengan `useCallback`:

- `updateItem`
- `addRow`
- `selectProduct`
- `removeItem`
- `toggleExpanded`

Shortcut keyboard cukup depend ke `addRow`:

```tsx
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'enter') {
      event.preventDefault();
      addRow();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [addRow]);
```

## Tahap 4: Buat Virtual Table

Buat `DocumentLineItemsVirtualTable.tsx`.

Pola dasar mengikuti virtual list yang sudah ada di project:

```tsx
const parentRef = useRef<HTMLDivElement>(null);

const rowVirtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  getItemKey: (index) => items[index]?.id ?? index,
  estimateSize: (index) => expandedRowKeySet.has(items[index]?.id) ? 220 : 56,
  overscan: 10,
});
```

Layout dasar:

```tsx
<div className="overflow-hidden rounded border border-gray-200">
  <div className="grid grid-cols-[minmax(260px,1fr)_120px_120px_140px_56px_56px] border-b bg-gray-50">
    ...
  </div>

  <div ref={parentRef} className="max-h-[640px] min-h-[360px] overflow-auto">
    <div
      style={{
        height: rowVirtualizer.getTotalSize(),
        position: 'relative',
        width: '100%',
      }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const item = items[virtualRow.index];
        if (!item) return null;

        return (
          <DocumentLineItemRow
            key={virtualRow.key}
            ref={rowVirtualizer.measureElement}
            data-index={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
            item={item}
            ...
          />
        );
      })}
    </div>
  </div>
</div>
```

Catatan:

- Gunakan `measureElement` karena expanded row mengubah tinggi.
- Pakai `getItemKey` berbasis `item.id`, bukan index saja.
- `overscan: 10` cukup sebagai awal untuk form input. Naikkan ke 15 jika scroll terasa terlalu agresif.
- Jangan mount expanded fields untuk row yang tidak expanded.

## Tahap 5: Row Memoized

Buat `DocumentLineItemRow.tsx` dengan `forwardRef` dan `memo`.

Row menerima data yang sudah siap pakai:

- `item`
- `calculatedItem`
- `productOptions`
- `unitOptions`
- `isExpanded`
- `hasPricing`
- `isSalesDelivery`
- handler yang stabil

Contoh comparator:

```tsx
export const DocumentLineItemRow = memo(forwardRef<HTMLDivElement, Props>(...),
  (prev, next) => (
    prev.item === next.item &&
    prev.calculatedItem === next.calculatedItem &&
    prev.isExpanded === next.isExpanded &&
    prev.unitOptions === next.unitOptions &&
    prev.productOptions === next.productOptions &&
    prev.taxOptions === next.taxOptions
  ),
);
```

Kalau raw `items` sudah dijaga, row yang tidak diedit tidak ikut render.

## Tahap 6: Expanded Fields

Buat `DocumentLineItemExpandedFields.tsx`.

Isi field yang saat ini ada di `expandedRowRender`:

- Harga
- Diskon type
- Diskon value
- Pajak item
- Tax amount readonly

Props utama:

- `item`
- `calculatedItem`
- `taxOptions`
- `onUpdateItem`

Field pajak tetap hanya mengubah id dan mengosongkan snapshot:

```tsx
onUpdateItem(item.id, {
  tax_id: taxId,
  tax_name: undefined,
  tax_code: undefined,
  tax_rate: undefined,
  tax_calculation_mode: undefined,
});
```

Snapshot final tetap dipulihkan oleh `calculateDocumentTotal`.

## Tahap 7: Mobile dan Horizontal Scroll

Untuk desktop, gunakan grid column tetap agar tidak terjadi layout shift.

Untuk mobile:

- Bungkus virtual table dengan horizontal scroll.
- Tetapkan `min-w`, misalnya `min-w-[760px]`.
- Jangan mengubah jumlah kolom saat scroll virtual aktif.

Contoh:

```tsx
<div className="overflow-x-auto">
  <div className="min-w-[760px]">
    ...
  </div>
</div>
```

Ini menjaga ukuran row stabil untuk virtualizer.

## Tahap 8: Re-measure Saat Expand Berubah

Di `DocumentLineItemsVirtualTable.tsx`:

```tsx
useEffect(() => {
  rowVirtualizer.measure();
}, [expandedRowKeys, rowVirtualizer]);
```

Jika `expandedRowKeys` berbentuk array, buat dependency yang stabil:

```tsx
const expandedRowSignature = expandedRowKeys.join('|');

useEffect(() => {
  rowVirtualizer.measure();
}, [expandedRowSignature, rowVirtualizer]);
```

## Tahap 9: Optional Auto Scroll ke Row Baru

Setelah `addRow`, scroll ke row terakhir:

```tsx
rowVirtualizer.scrollToIndex(items.length - 1, {
  align: 'end',
});
```

Jangan lakukan ini di `DocumentLineItems` langsung kalau virtualizer instance ada di child. Sediakan callback dari virtual table atau simpan intent seperti `pendingScrollToLast`.

Implement ini setelah virtual table stabil.

## Tahap 10: Validation dan Verifikasi

Minimal cek:

1. Tambah 500 row kosong.
2. Scroll dari atas ke bawah tanpa row blank.
3. Pilih produk di row pertama, tengah, dan terakhir.
4. Ubah qty, unit, harga, diskon, dan pajak.
5. Expand beberapa row lalu scroll jauh.
6. Hapus row expanded.
7. Submit draft dan pastikan item tersimpan lengkap.
8. Edit dokumen existing dan pastikan item lama muncul benar.

Command:

```bash
bun run lint
bun run build
```

Kalau build terlalu lama saat iterasi, minimal jalankan:

```bash
bun run lint
```

## Acceptance Criteria

Implementasi dianggap selesai jika:

- `DocumentLineItems` tidak lagi memakai AntD `Table` untuk render 500 row.
- Hanya row visible dan overscan yang mounted.
- Expanded fields hanya mounted pada row expanded yang visible.
- Tidak ada helper duplikat untuk empty item, product units, atau tax option.
- `calculateDocumentTotal` tetap jadi pusat kalkulasi.
- Submit tetap memakai item hasil kalkulasi.
- 500+ line item bisa discroll dan diedit tanpa freeze yang mengganggu.

## Risiko yang Perlu Dijaga

- Select dropdown AntD di dalam virtual row bisa unmount saat row keluar viewport. Ini normal, tapi jangan simpan state penting di row component.
- Focus input bisa hilang jika row di-scroll keluar viewport. Ini tradeoff virtual list.
- Expanded row dengan tinggi dinamis wajib pakai `measureElement`.
- Jangan menjadikan index sebagai key utama karena delete row akan menggeser identity.
- Jangan memindahkan side effect finance, stock, atau invoice payment ke component virtual. Component ini hanya UI editing.

