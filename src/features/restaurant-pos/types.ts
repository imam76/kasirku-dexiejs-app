export type RestaurantServiceMode = 'TABLE_SERVICE' | 'COUNTER_SERVICE';
export type RestaurantOrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type RestaurantTableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
export type RestaurantOrderStatus = 'DRAFT' | 'SENT_TO_KITCHEN' | 'READY_TO_PAY' | 'PAID';
export type KitchenTicketStatus = 'NEW' | 'PREPARING' | 'READY';
export type KitchenStation = 'KITCHEN' | 'BAR' | 'DESSERT';

export interface RestaurantArea {
  id: string;
  name: string;
}

export interface RestaurantTable {
  id: string;
  areaId: string;
  name: string;
  capacity: number;
  status: RestaurantTableStatus;
  activeSince?: string;
  reservationName?: string;
}

export interface RestaurantMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  station: KitchenStation;
  emoji: string;
  description: string;
  popular?: boolean;
  available?: boolean;
}

export interface RestaurantOrderLine {
  id: string;
  menuItem: RestaurantMenuItem;
  quantity: number;
  sentQuantity: number;
  note: string;
}

export interface RestaurantOrder {
  id: string;
  orderNumber: string;
  mode: RestaurantServiceMode;
  orderType: RestaurantOrderType;
  tableId?: string;
  guestCount: number;
  waiterName: string;
  status: RestaurantOrderStatus;
  openedAt: string;
  lines: RestaurantOrderLine[];
}

export interface KitchenTicketLine {
  menuItemId: string;
  name: string;
  quantity: number;
  note: string;
}

export interface KitchenTicket {
  id: string;
  orderId: string;
  orderNumber: string;
  destinationLabel: string;
  station: KitchenStation;
  status: KitchenTicketStatus;
  createdAt: string;
  lines: KitchenTicketLine[];
}

export interface RestaurantPaymentMethod {
  id: 'CASH' | 'QRIS' | 'DEBIT';
  name: string;
  description: string;
}

export interface RestaurantPosRepository {
  listAreas(): Promise<RestaurantArea[]>;
  listTables(): Promise<RestaurantTable[]>;
  listMenu(): Promise<RestaurantMenuItem[]>;
  saveOrder(order: RestaurantOrder): Promise<RestaurantOrder>;
  sendKitchenTickets(tickets: KitchenTicket[]): Promise<void>;
  settleOrder(orderId: string, paymentMethodId: string): Promise<void>;
}
