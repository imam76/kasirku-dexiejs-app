# Panduan Global CRUD Mobile

Dokumen ini merangkum penggunaan layout CRUD mobile yang pertama kali diterapkan pada Master Data Produk. Seluruh primitive publik tersedia dari satu entry point:

```tsx
import {
  MobileCrudBottomSheet,
  MobileCrudPageHeader,
  ResponsiveCrudCollection,
  ResponsiveCrudEditor,
  type MobileCrudAction,
} from '@/components/mobile-crud';
```

Implementasi produk yang dapat dijadikan referensi ada di:

- `src/components/StockTable.tsx`
- `src/view/master-data/products/StockManagement.tsx`
- `src/view/master-data/products/StockProductModal.tsx`

## Prinsip Pembagian Tanggung Jawab

Komponen global menangani:

- Pemilihan layout mobile atau desktop.
- Card list, loading skeleton, empty state, dan progressive disclosure.
- Action sheet per item.
- Bottom sheet filter dan detail.
- Full-screen editor pada mobile dan modal pada desktop.
- Ukuran target sentuh, posisi FAB, safe-area, dan keyboard inset.

Menu/domain tetap menangani:

- Mengambil dan memutasi data.
- Search, filter, sorting, dan validasi.
- Isi card dan detail.
- Hak akses setiap aksi.
- Konfirmasi hapus atau arsip.
- Pesan sukses/gagal dan aturan bisnis lainnya.

Jangan memindahkan aturan bisnis domain ke `src/components/mobile-crud`.

## Komponen Utama

| Komponen | Penggunaan |
| --- | --- |
| `ResponsiveCrudCollection<T>` | Entry point list CRUD responsif. Menerima tampilan desktop dan konfigurasi mobile. |
| `MobileCrudList<T>` | Card list mobile jika hanya membutuhkan list tanpa shell responsif lengkap. |
| `MobileCrudFilterSheet` | Bottom sheet filter dengan tombol Reset dan Terapkan. |
| `MobileCrudBottomSheet` | Bottom sheet generik untuk detail, menu aksi halaman, atau konten domain lainnya. |
| `MobileCrudFloatingActions` | Satu atau lebih FAB; posisi ditumpuk otomatis dari bawah. |
| `MobileCrudPageHeader` | Header halaman mobile yang fixed, safe-area aware, dan sudah memiliki spacer. |
| `ResponsiveCrudEditor` | Form full-screen drawer pada mobile dan modal pada desktop. |

## Template Collection CRUD

Contoh berikut memakai tipe domain `Item`. State, filter, dan handler tetap dibuat di komponen menu masing-masing.

```tsx
import { Button, Input, Tag } from 'antd';
import { Edit2, Filter, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import ManagementTable from '@/components/ManagementTable';
import {
  ResponsiveCrudCollection,
  type MobileCrudAction,
} from '@/components/mobile-crud';

type Item = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

export function ItemCollection({ items }: { items: Item[] }) {
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) => (
      !search
      || item.name.toLowerCase().includes(search)
      || item.code.toLowerCase().includes(search)
    ));
  }, [items, query]);

  const handleAdd = () => {
    // Buka editor create milik domain.
  };

  const handleEdit = (item: Item) => {
    // Isi form dan buka editor edit milik domain.
  };

  const handleDelete = (item: Item) => {
    // Jalankan permission guard, konfirmasi, lalu service domain.
  };

  return (
    <ResponsiveCrudCollection<Item>
      desktop={(
        <ManagementTable<Item>
          columns={[] /* ColumnsType<Item> milik domain */}
          dataSource={filteredItems}
          loading={false}
          emptyText="Belum ada data"
        />
      )}
      mobileList={{
        items: filteredItems,
        getKey: (item) => item.id,
        loading: false,
        resetKey: query,
        emptyText: query ? 'Data tidak ditemukan' : 'Belum ada data',
        loadMoreLabel: (remaining) => `Muat lagi (${remaining})`,
        resultSummary: `${filteredItems.length} dari ${items.length} data`,
        getItemAriaLabel: (item) => `Lihat detail ${item.name}`,
        getActionsAriaLabel: (item) => `Buka aksi untuk ${item.name}`,
        getActionSheetTitle: (item) => item.name,
        onItemClick: setSelectedItem,
        getActions: (item): MobileCrudAction<Item>[] => [
          {
            key: 'edit',
            label: 'Edit',
            icon: <Edit2 size={19} />,
            onSelect: handleEdit,
          },
          {
            key: 'delete',
            label: 'Hapus',
            icon: <Trash2 size={19} />,
            danger: true,
            disabled: !item.is_active,
            onSelect: handleDelete,
          },
        ],
        renderItem: (item) => (
          <div className="space-y-2">
            <div className="font-bold">{item.name}</div>
            <div className="text-xs text-gray-500">{item.code}</div>
            <Tag color={item.is_active ? 'green' : 'default'}>
              {item.is_active ? 'Aktif' : 'Nonaktif'}
            </Tag>
          </div>
        ),
      }}
      mobileFilter={{
        open: filterOpen,
        title: 'Filter Data',
        onClose: () => setFilterOpen(false),
        onReset: () => setQuery(''),
        resetDisabled: !query,
        resetLabel: 'Reset',
        applyLabel: 'Terapkan',
        children: (
          <Input.Search
            allowClear
            value={query}
            placeholder="Cari nama atau kode"
            onChange={(event) => setQuery(event.target.value)}
          />
        ),
      }}
      mobileDetail={{
        open: selectedItem !== null,
        onClose: () => setSelectedItem(null),
        closable: false,
        children: selectedItem ? (
          <div className="space-y-3">
            <div className="font-bold">{selectedItem.name}</div>
            <div>{selectedItem.code}</div>
            <Button type="primary" block onClick={() => handleEdit(selectedItem)}>
              Edit
            </Button>
          </div>
        ) : null,
      }}
      mobileFloatingActions={{
        actions: [
          {
            key: 'add',
            type: 'primary',
            label: 'Tambah',
            icon: <Plus size={24} />,
            onClick: handleAdd,
          },
          {
            key: 'filter',
            label: 'Filter',
            icon: <Filter size={22} />,
            badge: { count: query ? 1 : 0 },
            onClick: () => setFilterOpen(true),
          },
        ],
      }}
    />
  );
}
```

Urutan `mobileFloatingActions.actions` dimulai dari bawah. Aksi pertama berada paling dekat bottom navigation, aksi berikutnya otomatis ditumpuk ke atas.

## Template Editor Create/Edit

Form yang sama dipakai pada mobile dan desktop. Domain bertanggung jawab mencegah double-submit melalui state `saving` atau status mutation.

```tsx
<ResponsiveCrudEditor
  open={editorOpen}
  title={editingItem ? 'Edit Data' : 'Tambah Data'}
  onClose={closeEditor}
  desktopWidth={760}
  footer={(
    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
      <Button size="large" onClick={closeEditor}>
        Batal
      </Button>
      <Button
        size="large"
        type="primary"
        loading={saving}
        disabled={saving}
        onClick={() => void saveItem()}
      >
        Simpan
      </Button>
    </div>
  )}
>
  <form onSubmit={handleFormSubmit}>
    {/* Field dan validasi milik domain. */}
  </form>
</ResponsiveCrudEditor>
```

## Header dan Menu Aksi Halaman

Render header hanya pada mode mobile. Untuk penentuan mobile gunakan hook global `useIsMobile()`.

```tsx
{isMobile ? (
  <MobileCrudPageHeader
    title="Master Data"
    icon={<Package size={20} />}
    breadcrumb={<GlobalBreadcrumb pathname="/master-data/items" compact />}
    action={<Button icon={<MoreVertical size={18} />} onClick={openPageActions} />}
  />
) : null}

<MobileCrudBottomSheet
  open={pageActionsOpen}
  title="Aksi"
  onClose={closePageActions}
>
  {/* Export, import, download template, atau aksi domain lainnya. */}
</MobileCrudBottomSheet>
```

`MobileCrudPageHeader` sudah menyertakan spacer. Jangan menambahkan `mobile-page-fixed-header-spacer` kedua di halaman.

## Aturan Action Sheet

Setiap aksi item mendukung:

- `hidden`: sembunyikan aksi berdasarkan permission atau kondisi data.
- `disabled`: tampilkan aksi tetapi tidak dapat dijalankan.
- `danger`: gunakan tampilan merah untuk aksi destruktif.
- `description`: penjelasan singkat di bawah label.
- `onSelect`: boleh synchronous atau asynchronous.

Contoh permission dan kondisi bisnis:

```tsx
getActions: (item) => [
  {
    key: 'archive',
    label: 'Arsipkan',
    hidden: !canManageItem,
    disabled: item.has_open_transaction,
    danger: true,
    onSelect: () => confirmArchive(item),
  },
]
```

Konfirmasi dan validasi relasi tetap dilakukan oleh domain sebelum service mutasi dipanggil.

## Progressive Disclosure dan Reset

Default list menampilkan 20 item dan menambah 20 item setiap tombol “Muat lagi” ditekan. Gunakan `initialVisibleCount` dan `visibleStep` jika domain membutuhkan ukuran berbeda.

Isi `resetKey` dengan seluruh state yang mengubah hasil list agar jumlah item terlihat kembali ke awal setelah filter berubah:

```tsx
resetKey: JSON.stringify([query, status, categoryId]),
```

Jangan memasukkan state editor atau selected detail ke `resetKey` karena tidak mengubah hasil list.

## Checklist Menu Baru

- Gunakan import dari `@/components/mobile-crud`, bukan deep import file internal.
- Tetapkan tipe generic, misalnya `ResponsiveCrudCollection<Contact>`.
- `getKey` harus stabil dan unik.
- Sediakan `aria-label` yang menyebut nama item untuk detail dan menu aksi.
- Pisahkan state create/edit dari selected detail.
- Tutup detail/action sheet sebelum membuka editor atau navigasi lain.
- Gunakan `hidden` untuk permission dan `disabled` untuk kondisi bisnis yang perlu dijelaskan.
- Lakukan konfirmasi sebelum delete/archive.
- Pastikan handler simpan idempoten atau terkunci ketika sedang menyimpan.
- Gunakan service/hook domain untuk mutasi; jangan menulis ke Dexie langsung dari primitive global.
- Uji viewport minimal 320, 360, 390, dan 430 px tanpa horizontal overflow.
- Uji kembali fallback desktop setelah berpindah dari viewport mobile.

## Verifikasi Minimum

Jalankan pemeriksaan berikut setelah mengadopsi layout pada menu baru:

```bash
bunx tsc -b --pretty false
bunx eslint src/components/mobile-crud path/ke/menu-baru.tsx
bun test tests/unit/mobile-crud.test.ts
```

Tambahkan Playwright domain untuk memastikan:

- Card list tampil dan tabel desktop tidak tampil pada mobile.
- Progressive disclosure berhenti tepat pada jumlah data.
- Detail, edit, delete/archive, filter, dan FAB dapat digunakan.
- Editor mobile memenuhi lebar viewport.
- Tidak ada horizontal overflow.
- Tabel desktop kembali tampil pada viewport desktop.

