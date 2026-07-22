import { useMemo, useState } from 'react';
import {
  INITIAL_KITCHEN_TICKETS,
  INITIAL_TABLE_ORDERS,
  RESTAURANT_AREAS,
  RESTAURANT_MENU,
  RESTAURANT_TABLES,
} from './prototypeData';
import type {
  KitchenStation,
  KitchenTicket,
  RestaurantMenuItem,
  RestaurantOrder,
  RestaurantOrderLine,
  RestaurantOrderType,
  RestaurantServiceMode,
  RestaurantTable,
} from './types';

const nowTime = () => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date());
const createOrderNumber = (prefix: 'D' | 'A') => `${prefix}-${String(Math.floor(100 + Math.random() * 899))}`;

const createOrder = (
  mode: RestaurantServiceMode,
  tableId?: string,
): RestaurantOrder => ({
  id: crypto.randomUUID(),
  orderNumber: createOrderNumber(mode === 'TABLE_SERVICE' ? 'D' : 'A'),
  mode,
  orderType: 'DINE_IN',
  tableId,
  guestCount: mode === 'TABLE_SERVICE' ? 2 : 1,
  waiterName: mode === 'TABLE_SERVICE' ? 'Sari' : 'Kasir 01',
  status: 'DRAFT',
  openedAt: nowTime(),
  lines: [],
});

const updateOrderLineQuantity = (lines: RestaurantOrderLine[], lineId: string, quantity: number) => (
  lines
    .map((line) => line.id === lineId ? { ...line, quantity: Math.max(line.sentQuantity, quantity) } : line)
    .filter((line) => line.quantity > 0 || line.sentQuantity > 0)
);

export function useRestaurantPosPrototype() {
  const [serviceMode, setServiceMode] = useState<RestaurantServiceMode>('TABLE_SERVICE');
  const [selectedAreaId, setSelectedAreaId] = useState(RESTAURANT_AREAS[0].id);
  const [selectedTableId, setSelectedTableId] = useState('table-05');
  const [tables, setTables] = useState<RestaurantTable[]>(RESTAURANT_TABLES);
  const [tableOrders, setTableOrders] = useState<Record<string, RestaurantOrder>>(INITIAL_TABLE_ORDERS);
  const [counterOrder, setCounterOrder] = useState<RestaurantOrder>(() => createOrder('COUNTER_SERVICE'));
  const [tickets, setTickets] = useState<KitchenTicket[]>(INITIAL_KITCHEN_TICKETS);

  const selectedTable = tables.find((table) => table.id === selectedTableId);
  const activeOrder = serviceMode === 'TABLE_SERVICE'
    ? tableOrders[selectedTableId]
    : counterOrder;
  const visibleTables = tables.filter((table) => table.areaId === selectedAreaId);
  const total = activeOrder?.lines.reduce((sum, line) => sum + line.menuItem.price * line.quantity, 0) ?? 0;
  const pendingLineCount = activeOrder?.lines.reduce((sum, line) => sum + Math.max(0, line.quantity - line.sentQuantity), 0) ?? 0;

  const updateActiveOrder = (updater: (order: RestaurantOrder) => RestaurantOrder) => {
    if (serviceMode === 'COUNTER_SERVICE') {
      setCounterOrder((current) => updater(current));
      return;
    }

    setTableOrders((current) => {
      const existing = current[selectedTableId] ?? createOrder('TABLE_SERVICE', selectedTableId);
      return { ...current, [selectedTableId]: updater(existing) };
    });
  };

  const selectTable = (tableId: string) => {
    const table = tables.find((item) => item.id === tableId);
    if (!table || table.status === 'CLEANING') return;
    setSelectedTableId(tableId);
  };

  const selectArea = (areaId: string) => {
    setSelectedAreaId(areaId);
    const firstUsableTable = tables.find(
      (table) => table.areaId === areaId && table.status !== 'CLEANING',
    );
    if (firstUsableTable) setSelectedTableId(firstUsableTable.id);
  };

  const addMenuItem = (menuItem: RestaurantMenuItem) => {
    if (menuItem.available === false) return;

    updateActiveOrder((order) => {
      const existing = order.lines.find((line) => line.menuItem.id === menuItem.id);
      const lines = existing
        ? order.lines.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...order.lines, { id: crypto.randomUUID(), menuItem, quantity: 1, sentQuantity: 0, note: '' }];
      return { ...order, lines, status: order.status === 'PAID' ? 'DRAFT' : order.status };
    });

    if (serviceMode === 'TABLE_SERVICE') {
      setTables((current) => current.map((table) => table.id === selectedTableId && (table.status === 'AVAILABLE' || table.status === 'RESERVED')
        ? { ...table, status: 'OCCUPIED', activeSince: nowTime() }
        : table));
    }
  };

  const changeLineQuantity = (lineId: string, quantity: number) => {
    updateActiveOrder((order) => ({ ...order, lines: updateOrderLineQuantity(order.lines, lineId, quantity) }));
  };

  const changeLineNote = (lineId: string, note: string) => {
    updateActiveOrder((order) => ({
      ...order,
      lines: order.lines.map((line) => line.id === lineId ? { ...line, note } : line),
    }));
  };

  const setOrderType = (orderType: RestaurantOrderType) => {
    updateActiveOrder((order) => ({ ...order, orderType }));
  };

  const setGuestCount = (guestCount: number) => {
    updateActiveOrder((order) => ({ ...order, guestCount: Math.max(1, guestCount) }));
  };

  const buildTickets = (order: RestaurantOrder): KitchenTicket[] => {
    const stationLines = new Map<KitchenStation, RestaurantOrderLine[]>();
    order.lines.forEach((line) => {
      const pendingQuantity = line.quantity - line.sentQuantity;
      if (pendingQuantity <= 0) return;
      const entries = stationLines.get(line.menuItem.station) ?? [];
      entries.push({ ...line, quantity: pendingQuantity });
      stationLines.set(line.menuItem.station, entries);
    });

    return Array.from(stationLines.entries()).map(([station, lines]) => ({
      id: crypto.randomUUID(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      destinationLabel: order.mode === 'TABLE_SERVICE'
        ? tables.find((table) => table.id === order.tableId)?.name ?? 'Meja'
        : order.orderType === 'DINE_IN' ? 'Dine-in · counter' : 'Ambil di counter',
      station,
      status: 'NEW',
      createdAt: nowTime(),
      lines: lines.map((line) => ({
        menuItemId: line.menuItem.id,
        name: line.menuItem.name,
        quantity: line.quantity,
        note: line.note,
      })),
    }));
  };

  const sendToKitchen = () => {
    if (!activeOrder || pendingLineCount === 0) return 0;
    const nextTickets = buildTickets(activeOrder);
    setTickets((current) => [...nextTickets, ...current]);
    updateActiveOrder((order) => ({
      ...order,
      status: 'SENT_TO_KITCHEN',
      lines: order.lines.map((line) => ({ ...line, sentQuantity: line.quantity })),
    }));
    return nextTickets.length;
  };

  const advanceTicket = (ticketId: string) => {
    setTickets((current) => current
      .map((ticket) => {
        if (ticket.id !== ticketId) return ticket;
        if (ticket.status === 'NEW') return { ...ticket, status: 'PREPARING' as const };
        if (ticket.status === 'PREPARING') return { ...ticket, status: 'READY' as const };
        return ticket;
      }));
  };

  const completeTicket = (ticketId: string) => {
    setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
  };

  const completePayment = () => {
    if (!activeOrder || activeOrder.lines.length === 0) return;
    const unsentTickets = buildTickets(activeOrder);
    if (unsentTickets.length > 0) setTickets((current) => [...unsentTickets, ...current]);

    if (serviceMode === 'TABLE_SERVICE') {
      setTableOrders((current) => {
        const next = { ...current };
        delete next[selectedTableId];
        return next;
      });
      setTables((current) => current.map((table) => table.id === selectedTableId
        ? { ...table, status: 'CLEANING', activeSince: undefined }
        : table));
      return;
    }

    setCounterOrder(createOrder('COUNTER_SERVICE'));
  };

  const markTableAvailable = (tableId: string) => {
    setTables((current) => current.map((table) => table.id === tableId
      ? { ...table, status: 'AVAILABLE', activeSince: undefined }
      : table));
  };

  const categories = useMemo(() => ['Semua', ...new Set(RESTAURANT_MENU.map((item) => item.category))], []);

  return {
    areas: RESTAURANT_AREAS,
    menu: RESTAURANT_MENU,
    categories,
    serviceMode,
    selectedAreaId,
    selectedTableId,
    selectedTable,
    visibleTables,
    activeOrder,
    total,
    pendingLineCount,
    tickets,
    setServiceMode,
    selectArea,
    selectTable,
    addMenuItem,
    changeLineQuantity,
    changeLineNote,
    setOrderType,
    setGuestCount,
    sendToKitchen,
    advanceTicket,
    completeTicket,
    completePayment,
    markTableAvailable,
  };
}
