import { useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, List, Modal, Typography, Card, Empty, Spin } from 'antd';
import { History, Calendar, ShoppingCart, Trash2 } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import { ShoppingNote } from '@/types';

const { Text, Title } = Typography;

interface ShoppingNoteHistoryProps {
  onLoadNote: (note: ShoppingNote) => void;
  onClose?: () => void;
}

const PAGE_SIZE = 20;

export default function ShoppingNoteHistory({ onLoadNote, onClose }: ShoppingNoteHistoryProps) {
  const [selectedNote, setSelectedNote] = useState<ShoppingNote | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['shoppingNotesHistory'],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      const notes = await db.shoppingNotes
        .orderBy('created_at')
        .reverse()
        .offset(offset)
        .limit(PAGE_SIZE)
        .toArray();
      return notes;
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_SIZE ? allPages.length : undefined;
    },
    initialPageParam: 0,
  });

  const allNotes = data ? data.pages.flat() : [];
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? allNotes.length + 1 : allNotes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimate height of each item
    overscan: 5,
  });

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    Modal.confirm({
      title: 'Hapus Riwayat',
      content: 'Apakah Anda yakin ingin menghapus riwayat belanja ini?',
      okText: 'Hapus',
      cancelText: 'Batal',
      okType: 'danger',
      onOk: async () => {
        await db.shoppingNotes.delete(id);
        refetch();
        if (selectedNote?.id === id) {
          setSelectedNote(null);
        }
      },
    });
  };

  const handleLoad = () => {
    if (selectedNote) {
      onLoadNote(selectedNote);
      setSelectedNote(null);
      if (onClose) onClose();
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-8"><Spin size="large" /></div>;
  }

  if (allNotes.length === 0) {
    return <Empty description="Belum ada riwayat belanja" />;
  }

  return (
    <div className="flex h-[70vh] flex-col md:flex-row gap-0 md:gap-4 relative overflow-hidden">
      {/* List Section */}
      <div
        className={`flex-1 overflow-hidden border-r border-gray-200 pr-0 md:pr-2 transition-all duration-300 absolute md:relative w-full h-full bg-white z-10 ${selectedNote ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}`}
      >
        <div
          ref={parentRef}
          className="h-full w-full overflow-auto"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const isLoaderRow = virtualRow.index > allNotes.length - 1;
              const note = allNotes[virtualRow.index];

              return (
                <div
                  key={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="p-2"
                >
                  {isLoaderRow ? (
                    hasNextPage ? (
                      <div className="flex justify-center p-4">
                        <Button onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                          Muat Lebih Banyak
                        </Button>
                      </div>
                    ) : null
                  ) : (
                    <Card
                      hoverable
                      size="small"
                      className={`cursor-pointer transition-colors border-l-4 ${selectedNote?.id === note.id ? 'border-l-blue-500 bg-blue-50' : 'border-l-transparent'}`}
                      onClick={() => setSelectedNote(note)}
                      bodyStyle={{ padding: '12px' }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar size={14} className="text-gray-500" />
                            <Text type="secondary" className="text-xs">
                              {dayjs(note.created_at).format('DD MMM YYYY HH:mm')}
                            </Text>
                          </div>
                          <div className="flex justify-between items-center pr-2">
                            <div className="font-bold text-gray-800 text-base">
                              Rp {note.total_shopping.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              {note.items.length} Item
                            </div>
                          </div>
                        </div>
                        <Button
                          type="text"
                          danger
                          className="flex-shrink-0"
                          icon={<Trash2 size={18} />}
                          onClick={(e) => handleDelete(note.id, e)}
                        />
                      </div>
                    </Card>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail Section */}
      <div
        className={`w-full md:w-1/2 flex flex-col h-full overflow-hidden bg-gray-50 md:rounded-lg absolute md:relative transition-all duration-300 z-20 ${selectedNote ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}
      >
        {selectedNote ? (
          <div className="flex flex-col h-full bg-white md:bg-transparent">
            <div className="p-4 border-b border-gray-200 bg-white shadow-sm md:shadow-none md:bg-transparent z-10">
              <div className="flex items-center gap-2 mb-3 md:hidden">
                <Button icon={<History size={16} />} onClick={() => setSelectedNote(null)}>
                  Kembali
                </Button>
                <Title level={5} className="m-0">Detail Belanja</Title>
              </div>
              <div className="hidden md:block mb-2">
                <Title level={5}>Detail Belanja</Title>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-3">
                <div className="flex justify-between items-center mb-1">
                  <Text type="secondary" className="text-xs">Tanggal</Text>
                  <Text strong className="text-sm">{dayjs(selectedNote.created_at).format('DD MMM YYYY HH:mm')}</Text>
                </div>
                <div className="flex justify-between items-center">
                  <Text type="secondary" className="text-xs">Total Belanja</Text>
                  <Text strong className="text-lg text-blue-600">Rp {selectedNote.total_shopping.toLocaleString()}</Text>
                </div>
              </div>

              <Button type="primary" block icon={<ShoppingCart size={16} />} onClick={handleLoad} size="large">
                Muat Kembali ke Daftar
              </Button>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              <List
                dataSource={selectedNote.items}
                renderItem={(item) => (
                  <List.Item className="bg-white mb-2 p-3 rounded-lg shadow-sm border border-gray-100 flex-col items-start gap-1">
                    <div className="w-full flex justify-between items-start">
                      <Text strong className="text-gray-800 line-clamp-2 flex-1 mr-2">{item.name}</Text>
                      <Text strong className="whitespace-nowrap">Rp {item.subtotal.toLocaleString()}</Text>
                    </div>
                    <div className="w-full flex justify-between text-xs text-gray-500 mt-1 pt-1 border-t border-dashed border-gray-100">
                      <span>{item.quantity} {item.unit} x Rp {item.unit_price.toLocaleString()}</span>
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400 flex-col p-8 text-center hidden md:flex">
            <History size={64} className="mb-4 opacity-10" />
            <Text type="secondary" className="text-base">Pilih riwayat belanja dari daftar di sebelah kiri untuk melihat detail barang.</Text>
          </div>
        )}
      </div>
    </div>
  );
}
