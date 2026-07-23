import type {
  KitchenTicket,
  RestaurantArea,
  RestaurantMenuItem,
  RestaurantOrder,
  RestaurantPaymentMethod,
  RestaurantTable,
} from './types';

export const RESTAURANT_AREAS: RestaurantArea[] = [
  { id: 'indoor', name: 'Indoor' },
  { id: 'terrace', name: 'Teras' },
  { id: 'vip', name: 'VIP' },
];

export const RESTAURANT_TABLES: RestaurantTable[] = [
  { id: 'table-01', areaId: 'indoor', name: 'M01', capacity: 2, status: 'AVAILABLE' },
  { id: 'table-02', areaId: 'indoor', name: 'M02', capacity: 4, status: 'OCCUPIED', activeSince: '18:42' },
  { id: 'table-03', areaId: 'indoor', name: 'M03', capacity: 4, status: 'RESERVED', reservationName: 'Nadia · 19:30' },
  { id: 'table-04', areaId: 'indoor', name: 'M04', capacity: 6, status: 'AVAILABLE' },
  { id: 'table-05', areaId: 'indoor', name: 'M05', capacity: 2, status: 'OCCUPIED', activeSince: '19:06' },
  { id: 'table-06', areaId: 'indoor', name: 'M06', capacity: 4, status: 'CLEANING' },
  { id: 'table-07', areaId: 'terrace', name: 'T01', capacity: 2, status: 'AVAILABLE' },
  { id: 'table-08', areaId: 'terrace', name: 'T02', capacity: 4, status: 'OCCUPIED', activeSince: '18:55' },
  { id: 'table-09', areaId: 'terrace', name: 'T03', capacity: 4, status: 'AVAILABLE' },
  { id: 'table-10', areaId: 'terrace', name: 'T04', capacity: 6, status: 'RESERVED', reservationName: 'Bima · 20:00' },
  { id: 'table-11', areaId: 'vip', name: 'VIP 1', capacity: 8, status: 'AVAILABLE' },
  { id: 'table-12', areaId: 'vip', name: 'VIP 2', capacity: 10, status: 'OCCUPIED', activeSince: '18:20' },
];

export const RESTAURANT_MENU: RestaurantMenuItem[] = [
  { id: 'menu-01', name: 'Nasi Goreng Kampung', category: 'Makanan', price: 38000, station: 'KITCHEN', emoji: '🍛', description: 'Telur, ayam suwir, acar', popular: true, available: true },
  { id: 'menu-02', name: 'Mie Goreng Jawa', category: 'Makanan', price: 36000, station: 'KITCHEN', emoji: '🍜', description: 'Mie, sayur, ayam, telur', available: true },
  { id: 'menu-03', name: 'Ayam Sambal Matah', category: 'Makanan', price: 42000, station: 'KITCHEN', emoji: '🍗', description: 'Nasi, ayam, sambal matah', popular: true, available: true },
  { id: 'menu-04', name: 'Beef Rice Bowl', category: 'Makanan', price: 48000, station: 'KITCHEN', emoji: '🍚', description: 'Daging sapi, telur, nasi', available: true },
  { id: 'menu-05', name: 'Kentang Truffle', category: 'Camilan', price: 32000, station: 'KITCHEN', emoji: '🍟', description: 'Kentang, parmesan, truffle', popular: true, available: true },
  { id: 'menu-06', name: 'Pisang Goreng Aren', category: 'Camilan', price: 28000, station: 'DESSERT', emoji: '🍌', description: 'Pisang, gula aren, keju', available: true },
  { id: 'menu-07', name: 'Kopi Susu Gula Aren', category: 'Kopi', price: 26000, station: 'BAR', emoji: '🥤', description: 'Espresso, susu, gula aren', popular: true, available: true },
  { id: 'menu-08', name: 'Cappuccino', category: 'Kopi', price: 30000, station: 'BAR', emoji: '☕', description: 'Double espresso, steamed milk', available: true },
  { id: 'menu-09', name: 'Manual Brew', category: 'Kopi', price: 34000, station: 'BAR', emoji: '🫖', description: 'Beans pilihan hari ini', available: true },
  { id: 'menu-10', name: 'Matcha Latte', category: 'Non Kopi', price: 32000, station: 'BAR', emoji: '🍵', description: 'Matcha premium dan susu', available: true },
  { id: 'menu-11', name: 'Lemon Tea', category: 'Non Kopi', price: 24000, station: 'BAR', emoji: '🍋', description: 'Teh hitam dan lemon segar', available: true },
  { id: 'menu-12', name: 'Chocolate Cake', category: 'Dessert', price: 36000, station: 'DESSERT', emoji: '🍰', description: 'Dark chocolate, ganache', available: false },
];

const findMenu = (id: string) => RESTAURANT_MENU.find((item) => item.id === id)!;

export const INITIAL_TABLE_ORDERS: Record<string, RestaurantOrder> = {
  'table-05': {
    id: 'order-table-05',
    orderNumber: 'D-105',
    mode: 'TABLE_SERVICE',
    orderType: 'DINE_IN',
    tableId: 'table-05',
    guestCount: 2,
    waiterName: 'Sari',
    status: 'SENT_TO_KITCHEN',
    openedAt: '19:06',
    lines: [
      { id: 'line-01', menuItem: findMenu('menu-01'), quantity: 1, sentQuantity: 1, note: 'Pedas sedang' },
      { id: 'line-02', menuItem: findMenu('menu-07'), quantity: 2, sentQuantity: 2, note: '1 less sugar' },
    ],
  },
};

export const INITIAL_KITCHEN_TICKETS: KitchenTicket[] = [
  {
    id: 'ticket-01', orderId: 'order-table-02', orderNumber: 'D-102', destinationLabel: 'M02', station: 'KITCHEN', status: 'NEW', createdAt: '19:14',
    lines: [
      { menuItemId: 'menu-03', name: 'Ayam Sambal Matah', quantity: 2, note: '1 tanpa sambal' },
      { menuItemId: 'menu-05', name: 'Kentang Truffle', quantity: 1, note: '' },
    ],
  },
  {
    id: 'ticket-02', orderId: 'order-table-05', orderNumber: 'D-105', destinationLabel: 'M05', station: 'BAR', status: 'PREPARING', createdAt: '19:08',
    lines: [{ menuItemId: 'menu-07', name: 'Kopi Susu Gula Aren', quantity: 2, note: '1 less sugar' }],
  },
  {
    id: 'ticket-03', orderId: 'order-counter-17', orderNumber: 'A-017', destinationLabel: 'Ambil di counter', station: 'BAR', status: 'READY', createdAt: '19:04',
    lines: [{ menuItemId: 'menu-08', name: 'Cappuccino', quantity: 1, note: '' }],
  },
];

export const RESTAURANT_PAYMENT_METHODS: RestaurantPaymentMethod[] = [
  { id: 'CASH', name: 'Tunai', description: 'Terima uang dan hitung kembalian' },
  { id: 'QRIS', name: 'QRIS', description: 'Tampilkan QR dan tunggu konfirmasi' },
  { id: 'DEBIT', name: 'Kartu Debit', description: 'Proses melalui terminal EDC' },
];
