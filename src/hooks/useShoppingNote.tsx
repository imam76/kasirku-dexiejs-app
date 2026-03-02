import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { ShoppingNoteItem } from '@/types';

export const useShoppingNote = () => {
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
  };
};
