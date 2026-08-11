import { App, Button, Card, Descriptions, Drawer, Form, Input, InputNumber, Modal, Segmented, Spin } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, ChefHat, Clock3, LayoutGrid, LockKeyhole, MonitorDot, PlayCircle, ShoppingBag } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/hooks/useI18n';
import { useRestaurantSession } from '@/hooks/useRestaurantSession';
import { usePosPaymentMethods } from '@/hooks/usePosPaymentMethods';
import { db } from '@/lib/db';
import { getActivePromos } from '@/services/promoService';
import {
  addProductToRestaurantOrder,
  advanceRestaurantKitchenTicket,
  cancelRestaurantOrder,
  evaluateRestaurantOrderPromos,
  sendRestaurantOrderToKitchen,
  settleRestaurantOrder,
  settleRestaurantOrderAsExpense,
  updateRestaurantOrderLineFulfillmentType,
  updateRestaurantOrderLineNote,
  updateRestaurantOrderLineQuantity,
  updateRestaurantOrderInfo,
} from '@/services/restaurantPosService';
import type { RestaurantSessionReconciliation } from '@/services/restaurantSessionService';
import type { Product, RestaurantOrderLineFulfillmentType, RestaurantOrderType, RestaurantServiceMode } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { printReceiptAfterTransaction } from '@/utils/printer/receiptService';
import { RestaurantFloorPanel } from './production/RestaurantFloorPanel';
import { RestaurantKitchenBoard } from './production/RestaurantKitchenBoard';
import { RestaurantMenuCatalog } from './production/RestaurantMenuCatalog';
import { RestaurantOrderPanel } from './production/RestaurantOrderPanel';
import { RestaurantPaymentModal } from './production/RestaurantPaymentModal';

type Workspace = 'ORDER' | 'KITCHEN';

interface OpenRestaurantFormValues {
  opening_cash_amount: number;
  opening_note?: string;
}

interface CloseRestaurantFormValues {
  closing_cash_amount: number;
  closing_note?: string;
}

export default function RestaurantPos() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [openForm] = Form.useForm<OpenRestaurantFormValues>();
  const [closeForm] = Form.useForm<CloseRestaurantFormValues>();
  const {
    activeSession,
    isLoadingActiveSession,
    openSession,
    isOpeningSession,
    closeSession,
    isClosingSession,
    calculateReconciliation,
  } = useRestaurantSession();
  const { options: paymentMethods } = usePosPaymentMethods();
  const [workspace, setWorkspace] = useState<Workspace>('ORDER');
  const [serviceMode, setServiceMode] = useState<RestaurantServiceMode>('TABLE_SERVICE');
  const [selectedTableId, setSelectedTableId] = useState<string>();
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [customerName, setCustomerName] = useState('');
  const [guestCount, setGuestCount] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<RestaurantOrderType>('DINE_IN');
  const [orderRequiringCustomerName, setOrderRequiringCustomerName] = useState<string>();
  const [updatingOrderInfo, setUpdatingOrderInfo] = useState(false);
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [sendingKitchen, setSendingKitchen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [reconciliation, setReconciliation] = useState<RestaurantSessionReconciliation | null>(null);
  const tables = useLiveQuery(
    () => db.restaurantTables.filter((table) => table.is_active).sortBy('name'),
    [],
    [],
  );
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [], []);
  const promos = useLiveQuery(() => getActivePromos(), [], []);
  const orders = useLiveQuery(
    () => activeSession
      ? db.restaurantOrders
          .where('restaurant_session_id')
          .equals(activeSession.id)
          .and((order) => order.status === 'DRAFT' || order.status === 'SENT_TO_KITCHEN')
          .toArray()
      : [],
    [activeSession?.id],
    [],
  );
  const tickets = useLiveQuery(
    () => activeSession
      ? db.restaurantKitchenTickets
          .where('restaurant_session_id')
          .equals(activeSession.id)
          .and((ticket) => ticket.status !== 'COMPLETED')
          .toArray()
      : [],
    [activeSession?.id],
    [],
  );

  const activeOrder = useMemo(() => {
    const selected = orders.find((order) => order.id === selectedOrderId && order.mode === serviceMode);
    if (selected) return selected;
    if (serviceMode === 'TABLE_SERVICE') return orders.find((order) => order.table_id === selectedTableId);
    return undefined;
  }, [orders, selectedOrderId, selectedTableId, serviceMode]);
  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId),
    [selectedTableId, tables],
  );
  const promoPreview = useMemo(
    () => evaluateRestaurantOrderPromos(activeOrder, products, promos, voucherCode),
    [activeOrder, products, promos, voucherCode],
  );
  const totalItems = activeOrder?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;

  useEffect(() => {
    setCustomerName(activeOrder?.id === orderRequiringCustomerName ? '' : activeOrder?.customer_name ?? '');
    setGuestCount(activeOrder
      ? activeOrder.guest_count ?? null
      : serviceMode === 'TABLE_SERVICE' ? selectedTable?.capacity ?? null : null);
    setOrderType(serviceMode === 'TABLE_SERVICE' ? 'DINE_IN' : activeOrder?.order_type === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY');
  }, [activeOrder, orderRequiringCustomerName, selectedTable?.capacity, serviceMode]);

  useEffect(() => {
    setVoucherCode('');
  }, [activeOrder?.id]);

  const handleOpenSession = async (values: OpenRestaurantFormValues) => {
    await openSession({
      opening_cash_amount: Number(values.opening_cash_amount || 0),
      opening_note: values.opening_note,
    });
    openForm.resetFields();
  };

  const handleAddProduct = useCallback(async (product: Product) => {
    if (!activeSession) return;
    try {
      const table = selectedTableId ? tables.find((item) => item.id === selectedTableId) : undefined;
      const isNewOrder = !activeOrder;
      const needsCustomerName = isNewOrder && !customerName.trim();
      const orderId = await addProductToRestaurantOrder({
        session: activeSession,
        mode: serviceMode,
        tableId: activeOrder?.table_id ?? selectedTableId,
        orderId: activeOrder?.id,
        customerName: customerName.trim() || (table ? `Pelanggan ${table.name}` : 'Pelanggan Counter'),
        guestCount: guestCount ?? undefined,
        orderType: serviceMode === 'TABLE_SERVICE' ? 'DINE_IN' : orderType,
        product,
      });
      if (needsCustomerName) setOrderRequiringCustomerName(orderId);
      setSelectedOrderId(orderId);
      message.success(t('restaurantPos.menuAdded', { name: product.name }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [activeOrder, activeSession, customerName, guestCount, message, orderType, selectedTableId, serviceMode, t, tables]);

  const handleCustomerNameBlur = async () => {
    if (!activeOrder) return;
    const nextCustomerName = customerName.trim();
    if (!nextCustomerName) {
      message.warning('Nama pelanggan wajib diisi.');
      return;
    }
    if (nextCustomerName === activeOrder.customer_name) return;
    setUpdatingOrderInfo(true);
    try {
      await updateRestaurantOrderInfo(activeOrder.id, {
        customerName: nextCustomerName,
        guestCount: guestCount ?? undefined,
        orderType: serviceMode === 'TABLE_SERVICE' ? 'DINE_IN' : orderType,
        tableId: selectedTableId,
      });
      setOrderRequiringCustomerName(undefined);
    } catch (error) {
      setCustomerName(activeOrder.customer_name);
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingOrderInfo(false);
    }
  };

  const handleGuestCountBlur = async () => {
    if (!activeOrder) return;
    const nextGuestCount = guestCount === null
      ? undefined
      : Math.max(1, Math.floor(Number(guestCount)));
    setGuestCount(nextGuestCount ?? null);
    if (nextGuestCount === activeOrder.guest_count) return;
    setUpdatingOrderInfo(true);
    try {
      await updateRestaurantOrderInfo(activeOrder.id, {
        customerName: customerName.trim() || activeOrder.customer_name,
        guestCount: nextGuestCount,
        orderType: serviceMode === 'TABLE_SERVICE' ? 'DINE_IN' : orderType,
        tableId: selectedTableId,
      });
    } catch (error) {
      setGuestCount(activeOrder.guest_count ?? null);
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingOrderInfo(false);
    }
  };

  const handleOrderTypeChange = async (nextOrderType: RestaurantOrderType) => {
    if (serviceMode !== 'COUNTER_SERVICE') return;
    const counterOrderType = nextOrderType === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY';
    setOrderType(counterOrderType);
    if (!activeOrder) return;
    setUpdatingOrderInfo(true);
    try {
      await updateRestaurantOrderInfo(activeOrder.id, {
        customerName: customerName.trim() || activeOrder.customer_name,
        guestCount: guestCount ?? undefined,
        orderType: counterOrderType,
        tableId: selectedTableId,
      });
    } catch (error) {
      setOrderType(activeOrder.order_type);
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingOrderInfo(false);
    }
  };

  const handleQuantityChange = async (lineId: string, quantity: number) => {
    if (!activeOrder) return;
    try {
      await updateRestaurantOrderLineQuantity(activeOrder.id, lineId, quantity);
    } catch (error) {
      message.warning(error instanceof Error ? error.message : t('restaurantPos.quantityBlocked'));
    }
  };

  const handleNoteChange = async (lineId: string, note: string) => {
    if (!activeOrder) return;
    try {
      await updateRestaurantOrderLineNote(activeOrder.id, lineId, note);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleFulfillmentTypeChange = async (
    lineId: string,
    fulfillmentType: RestaurantOrderLineFulfillmentType,
  ) => {
    if (!activeOrder) return;
    try {
      await updateRestaurantOrderLineFulfillmentType(activeOrder.id, lineId, fulfillmentType);
    } catch (error) {
      message.warning(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSendKitchen = async () => {
    if (!activeOrder || sendingKitchen) return;
    setSendingKitchen(true);
    try {
      const ticket = await sendRestaurantOrderToKitchen(activeOrder.id);
      message[ticket ? 'success' : 'info'](
        ticket ? t('restaurantPos.kitchenSent') : t('restaurantPos.noPendingKitchen'),
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSendingKitchen(false);
    }
  };

  const handleAdvanceTicket = async (ticketId: string) => {
    try {
      await advanceRestaurantKitchenTicket(ticketId);
      message.success(t('restaurantPos.ticketUpdated'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handlePayment = async (payments: Array<{
    paymentMethodId: string;
    tenderedAmount: number;
    paymentReference?: string;
  }>) => {
    if (!activeOrder || paymentLoading) return false;
    setPaymentLoading(true);
    try {
      const result = await settleRestaurantOrder({ orderId: activeOrder.id, payments, voucherCode });
      setPaymentOpen(false);
      setOrderDrawerOpen(false);
      setVoucherCode('');
      message.success(t('restaurantPos.paymentSuccess', { order: activeOrder.order_number }));
      ['transactions-history', 'journalEntries', 'trialBalance', 'incomeStatement', 'balanceSheet']
        .forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      void printReceiptAfterTransaction({
        ...result.transaction,
        items: result.items,
        payments: result.payments,
      }, { openCashDrawer: true }).then((printResult) => {
        if (!printResult.success) message.warning(printResult.error || t('checkout.receiptPrintFailed'));
      }).catch((error) => {
        message.warning(error instanceof Error ? error.message : t('checkout.receiptPrintFailed'));
      });
      return true;
    } catch (error) {
      modal.error({
        title: t('restaurantPos.paymentFailed'),
        content: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleRecordExpense = async () => new Promise<boolean>((resolve) => {
    if (!activeOrder || paymentLoading) {
      resolve(false);
      return;
    }

    modal.confirm({
      title: 'Catat sebagai Pengeluaran (Beban)?',
      content: 'Order akan diselesaikan tanpa penjualan atau penerimaan kas. Stok tetap berkurang dan beban dicatat berdasarkan HPP/FIFO.',
      okText: 'Catat Pengeluaran',
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onCancel: () => resolve(false),
      onOk: async () => {
        setPaymentLoading(true);
        try {
          const result = await settleRestaurantOrderAsExpense(activeOrder.id);
          setPaymentOpen(false);
          setOrderDrawerOpen(false);
          setVoucherCode('');
          result.warnings?.forEach((warning) => message.warning(warning));
          [
            'transactions-history',
            'expenseReport',
            'expenseCategories',
            'journalEntries',
            'trialBalance',
            'incomeStatement',
            'balanceSheet',
          ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
          message.success(
            `Order ${activeOrder.order_number} tercatat sebagai pengeluaran sebesar Rp ${formatCurrency(result.transaction.total_amount)}.`,
          );
          resolve(true);
        } catch (error) {
          modal.error({
            title: 'Gagal mencatat pengeluaran',
            content: error instanceof Error ? error.message : String(error),
          });
          resolve(false);
        } finally {
          setPaymentLoading(false);
        }
      },
    });
  });

  const handleCancelOrder = () => {
    if (!activeOrder) return;
    modal.confirm({
      title: t('restaurantPos.cancelOrderTitle'),
      content: t('restaurantPos.cancelOrderConfirm', { order: activeOrder.order_number }),
      okText: t('restaurantPos.cancelOrder'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await cancelRestaurantOrder(activeOrder.id);
          setOrderDrawerOpen(false);
          message.success(t('restaurantPos.cancelOrderSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : String(error));
        }
      },
    });
  };

  const refreshClosePreview = useCallback(async () => {
    if (!activeSession) return;
    const values = closeForm.getFieldsValue();
    setReconciliation(await calculateReconciliation(
      activeSession.id,
      Number(values.closing_cash_amount || 0),
    ));
  }, [activeSession, calculateReconciliation, closeForm]);

  const openCloseModal = useCallback(async () => {
    if (!activeSession) return;
    closeForm.resetFields();
    closeForm.setFieldsValue({ closing_cash_amount: 0 });
    setReconciliation(await calculateReconciliation(activeSession.id, 0));
    setCloseModalOpen(true);
  }, [activeSession, calculateReconciliation, closeForm]);

  const handleCloseSession = async (values: CloseRestaurantFormValues) => {
    if (!activeSession) return;
    await closeSession({
      session_id: activeSession.id,
      closing_cash_amount: Number(values.closing_cash_amount || 0),
      closing_note: values.closing_note,
    });
    setCloseModalOpen(false);
    setReconciliation(null);
    closeForm.resetFields();
  };

  if (isLoadingActiveSession) {
    return <div className="grid min-h-[360px] place-items-center"><Spin tip={t('restaurantPos.loading')} /></div>;
  }

  if (!activeSession) {
    return (
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-xl rounded-2xl border border-blue-100 shadow-md">
          <div className="mb-6 flex items-start gap-3">
            <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><LockKeyhole size={24} /></span>
            <div><h1 className="text-xl font-bold text-slate-900">{t('restaurantSession.openTitle')}</h1><p className="mt-1 text-sm text-slate-500">{t('restaurantSession.openDescription')}</p></div>
          </div>
          <Form form={openForm} layout="vertical" initialValues={{ opening_cash_amount: 0 }} onFinish={handleOpenSession}>
            <Form.Item
              name="opening_cash_amount"
              label={t('restaurantSession.openingCash')}
              rules={[{ required: true, message: t('restaurantSession.openingCashRequired') }]}
            >
              <InputNumber<number>
                min={0}
                className="w-full"
                prefix="Rp"
                size="large"
                formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={(value) => Number((value || '').replace(/\./g, ''))}
              />
            </Form.Item>
            <Form.Item name="opening_note" label={t('restaurantSession.openingNote')}><Input.TextArea rows={3} /></Form.Item>
            <Button type="primary" htmlType="submit" size="large" icon={<PlayCircle size={18} />} loading={isOpeningSession} className="w-full !bg-blue-600 hover:!bg-blue-700">
              {t('restaurantSession.openButton')}
            </Button>
          </Form>
        </Card>
      </div>
    );
  }

  const orderPanel = (
    <RestaurantOrderPanel
      mode={serviceMode}
      order={activeOrder}
      promo={promoPreview}
      isSending={sendingKitchen}
      isPaying={paymentLoading}
      isUpdatingInfo={updatingOrderInfo}
      isOrderInfoComplete={Boolean(activeOrder && customerName.trim() && activeOrder.id !== orderRequiringCustomerName)}
      customerName={customerName}
      guestCount={guestCount}
      orderType={orderType}
      onCustomerNameChange={setCustomerName}
      onCustomerNameBlur={handleCustomerNameBlur}
      onGuestCountChange={setGuestCount}
      onGuestCountBlur={handleGuestCountBlur}
      onOrderTypeChange={handleOrderTypeChange}
      onQuantityChange={handleQuantityChange}
      onNoteChange={handleNoteChange}
      onFulfillmentTypeChange={handleFulfillmentTypeChange}
      onSendKitchen={handleSendKitchen}
      onPay={() => setPaymentOpen(true)}
      onCancel={handleCancelOrder}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50/60 p-2 sm:p-3 min-[1024px]:pt-0">
      <header className="-mx-2 mb-2 flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-blue-100 bg-white/95 px-3 py-1.5 shadow-sm sm:-mx-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><Banknote size={15} /></span>
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs">
            <span className="shrink-0 font-bold text-emerald-700">{t('restaurantSession.activeTitle')}</span>
            <span className="hidden h-4 w-px bg-blue-100 sm:block" />
            <span className="truncate font-medium text-slate-600">{activeSession.session_number} · {activeSession.operator_user_name}</span>
            <span className="hidden shrink-0 text-slate-500 min-[1024px]:inline">{t('restaurantSession.openingCash')}: Rp {formatCurrency(activeSession.opening_cash_amount)}</span>
          </div>
        </div>
        <Button type="text" danger size="small" icon={<LockKeyhole size={14} />} loading={isClosingSession} onClick={openCloseModal}>
          {t('restaurantSession.closeButton')}
        </Button>
      </header>

      <div className="mb-2 flex shrink-0 flex-col gap-2 rounded-2xl border border-blue-100 bg-white p-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={workspace}
          onChange={(value) => setWorkspace(value as Workspace)}
          options={[
            { label: t('restaurantPos.orders'), value: 'ORDER', icon: <ShoppingBag size={14} /> },
            { label: t('restaurantPos.kitchen'), value: 'KITCHEN', icon: <ChefHat size={14} /> },
          ]}
        />
        <Segmented
          value={serviceMode}
          onChange={(value) => {
            setServiceMode(value as RestaurantServiceMode);
            setSelectedOrderId(undefined);
            setWorkspace('ORDER');
          }}
          options={[
            { label: t('restaurantPos.tableService'), value: 'TABLE_SERVICE', icon: <LayoutGrid size={14} /> },
            { label: t('restaurantPos.counterService'), value: 'COUNTER_SERVICE', icon: <MonitorDot size={14} /> },
          ]}
        />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto min-[1024px]:overflow-hidden">
        {workspace === 'ORDER' ? (
          <div className={`grid h-full min-h-0 gap-3 ${serviceMode === 'TABLE_SERVICE'
            ? 'grid-cols-1 min-[1024px]:grid-cols-[300px_minmax(0,1fr)] min-[1280px]:grid-cols-[280px_minmax(0,1fr)_360px]'
            : 'grid-cols-1 min-[1280px]:grid-cols-[minmax(0,1fr)_380px]'}`}
          >
            {serviceMode === 'TABLE_SERVICE' ? (
              <div className="min-h-[300px] min-[1024px]:min-h-0">
                <RestaurantFloorPanel
                  tables={tables}
                  orders={orders}
                  selectedTableId={selectedTableId}
                  onSelect={(tableId) => {
                    setSelectedTableId(tableId);
                    setSelectedOrderId(tables.find((table) => table.id === tableId)?.active_order_id);
                  }}
                />
              </div>
            ) : null}
            <div className="min-h-[420px] min-[1024px]:min-h-0">
              <RestaurantMenuCatalog
                products={products}
                promos={promos}
                order={activeOrder}
                disabled={serviceMode === 'TABLE_SERVICE' && !selectedTableId}
                onAdd={handleAddProduct}
              />
            </div>
            <div className="hidden min-h-0 min-[1280px]:block">{orderPanel}</div>
          </div>
        ) : (
          <RestaurantKitchenBoard tickets={tickets} onAdvance={handleAdvanceTicket} />
        )}
      </main>

      {workspace === 'ORDER' && totalItems > 0 ? (
        <button
          type="button"
          aria-label={t('restaurantPos.openCart')}
          onClick={() => setOrderDrawerOpen(true)}
          className="fixed bottom-4 left-4 right-4 z-30 flex items-center justify-between rounded-2xl bg-blue-600 px-5 py-3.5 font-semibold text-white shadow-xl shadow-blue-200/70 min-[1280px]:hidden"
        >
          <span className="flex items-center gap-3"><span className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-1 text-sm font-black text-blue-600">{totalItems}</span>{t('restaurantPos.activeOrder')}</span>
          <span className="font-black">Rp {formatCurrency(promoPreview.total_amount)}</span>
        </button>
      ) : null}

      <Drawer
        title={t('restaurantPos.activeOrder')}
        open={orderDrawerOpen}
        onClose={() => setOrderDrawerOpen(false)}
        width="min(420px, 100vw)"
        styles={{ body: { padding: 0, overflow: 'hidden' } }}
      >
        {orderPanel}
      </Drawer>

      {paymentOpen ? (
        <RestaurantPaymentModal
          open
          order={activeOrder}
          promo={promoPreview}
          promos={promos}
          voucherCode={voucherCode}
          methods={paymentMethods}
          loading={paymentLoading}
          onVoucherCodeChange={setVoucherCode}
          onCancel={() => setPaymentOpen(false)}
          onConfirm={handlePayment}
          onRecordExpense={handleRecordExpense}
        />
      ) : null}

      <Modal title={t('restaurantSession.closeTitle')} open={closeModalOpen} onCancel={() => setCloseModalOpen(false)} footer={null} destroyOnHidden>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"><Clock3 size={16} /> {activeSession.session_number}</div>
        <Form form={closeForm} layout="vertical" initialValues={{ closing_cash_amount: 0 }} onFinish={handleCloseSession} onValuesChange={refreshClosePreview}>
          <Form.Item name="closing_cash_amount" label={t('restaurantSession.actualCash')} rules={[{ required: true, message: t('restaurantSession.actualCashRequired') }]}>
            <InputNumber<number>
              min={0}
              className="w-full"
              prefix="Rp"
              formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => Number((value || '').replace(/\./g, ''))}
            />
          </Form.Item>
          {reconciliation ? (
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label={t('restaurantSession.openingCash')}>Rp {formatCurrency(reconciliation.opening_cash_amount)}</Descriptions.Item>
              <Descriptions.Item label={t('restaurantSession.cashSales')}>Rp {formatCurrency(reconciliation.cash_sales_amount)}</Descriptions.Item>
              <Descriptions.Item label={t('restaurantSession.nonCashSales')}>Rp {formatCurrency(reconciliation.non_cash_sales_amount)}</Descriptions.Item>
              {reconciliation.payment_method_breakdown.map((payment) => <Descriptions.Item key={payment.code} label={`${payment.name} (${payment.transaction_count})`}>Rp {formatCurrency(payment.amount)}</Descriptions.Item>)}
              <Descriptions.Item label={t('restaurantSession.expectedCash')}>Rp {formatCurrency(reconciliation.expected_cash_amount)}</Descriptions.Item>
              <Descriptions.Item label={t('restaurantSession.actualCash')}>Rp {formatCurrency(reconciliation.closing_cash_amount)}</Descriptions.Item>
              <Descriptions.Item label={t('restaurantSession.difference')}><span className={reconciliation.cash_difference_amount === 0 ? 'text-emerald-700' : 'text-red-600'}>Rp {formatCurrency(reconciliation.cash_difference_amount)}</span></Descriptions.Item>
            </Descriptions>
          ) : null}
          <Form.Item
            className="mt-4"
            name="closing_note"
            label={t('restaurantSession.closingNote')}
            rules={[{
              validator: async (_, value) => {
                if (reconciliation?.cash_difference_amount && !String(value || '').trim()) {
                  throw new Error(t('restaurantSession.closingNoteRequiredForDifference'));
                }
              },
            }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <div className="flex justify-end gap-2"><Button onClick={() => setCloseModalOpen(false)}>{t('common.cancel')}</Button><Button danger type="primary" htmlType="submit" loading={isClosingSession}>{t('restaurantSession.closeButton')}</Button></div>
        </Form>
      </Modal>
    </div>
  );
}
