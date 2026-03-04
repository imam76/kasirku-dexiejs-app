import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import { ShoppingNoteItem } from '@/types';

export const useShoppingNote = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ShoppingNoteItem[]>([]);
  const [moneyCarried, setMoneyCarried] = useState<number>(0);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{
    name: string;
    unit_price: number;
    quantity: number;
    unit: string;
  }>({
    defaultValues: {
      name: '',
      unit_price: undefined,
      quantity: 1,
      unit: 'pcs',
    },
  });

  const addItem = (data: { name: string; unit_price: number; quantity: number; unit: string }) => {
    const newItem: ShoppingNoteItem = {
      id: crypto.randomUUID(),
      name: data.name,
      unit_price: Number(data.unit_price),
      quantity: Number(data.quantity),
      unit: data.unit,
      subtotal: Number(data.unit_price) * Number(data.quantity),
    };
    setItems((prev) => [...prev, newItem]);
    reset({
      name: '',
      unit_price: undefined,
      quantity: 1,
      unit: 'pcs',
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totalShopping = useMemo(() => {
    return items.reduce((acc, item) => acc + item.subtotal, 0);
  }, [items]);

  const remainingMoney = useMemo(() => {
    return moneyCarried - totalShopping;
  }, [moneyCarried, totalShopping]);

  const saveNote = async () => {
    if (items.length === 0) {
      message.warning('Daftar belanja masih kosong');
      return;
    }

    try {
      await db.shoppingNotes.add({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        items,
        money_carried: moneyCarried,
        total_shopping: totalShopping,
        remaining_money: remainingMoney,
      });
      message.success('Nota belanja berhasil disimpan');
      setItems([]);
      setMoneyCarried(0);
      queryClient.invalidateQueries({ queryKey: ['shoppingNotesHistory'] });
    } catch (error) {
      console.error('Failed to save note:', error);
      message.error('Gagal menyimpan nota belanja');
    }
  };

  const loadNote = (note: { items: ShoppingNoteItem[], money_carried: number }) => {
    setItems(note.items);
    setMoneyCarried(note.money_carried);
  };

  return {
    items,
    moneyCarried,
    setMoneyCarried,
    removeItem,
    totalShopping,
    remainingMoney,
    control,
    handleSubmit: handleSubmit(addItem),
    errors,
    saveNote,
    loadNote,
  };
};
