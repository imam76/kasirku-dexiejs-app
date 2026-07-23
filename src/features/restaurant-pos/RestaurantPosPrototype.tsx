import { App, Segmented } from 'antd';
import {
  ChefHat,
  CircleDollarSign,
  Clock3,
  LayoutGrid,
  MonitorDot,
  PlayCircle,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { KitchenDisplayBoard } from './components/KitchenDisplayBoard';
import { RestaurantFloorPanel } from './components/RestaurantFloorPanel';
import { RestaurantFlowGuide } from './components/RestaurantFlowGuide';
import { RestaurantMenuCatalog } from './components/RestaurantMenuCatalog';
import { RestaurantOrderPanel } from './components/RestaurantOrderPanel';
import { RestaurantPaymentModal } from './components/RestaurantPaymentModal';
import { useRestaurantPosPrototype } from './useRestaurantPosPrototype';
import type { RestaurantServiceMode } from './types';

type Workspace = 'ORDER' | 'KITCHEN' | 'FLOW';

const WORKSPACE_OPTIONS = [
  { label: 'Pesanan', value: 'ORDER', icon: <ShoppingBag size={15} /> },
  { label: 'Dapur / KDS', value: 'KITCHEN', icon: <ChefHat size={15} /> },
  { label: 'Panduan flow', value: 'FLOW', icon: <PlayCircle size={15} /> },
];

export default function RestaurantPosPrototype() {
  const { message } = App.useApp();
  const prototype = useRestaurantPosPrototype();
  const [workspace, setWorkspace] = useState<Workspace>('ORDER');
  const [paymentOpen, setPaymentOpen] = useState(false);

  const flowSteps = useMemo(() => prototype.serviceMode === 'TABLE_SERVICE'
    ? ['Pilih meja', 'Catat menu', 'Kirim ke dapur', 'Sajikan', 'Bayar & tutup meja']
    : ['Pilih layanan', 'Catat menu', 'Bayar', 'Kirim ke dapur', 'Serahkan pesanan'], [prototype.serviceMode]);

  const activeFlowStep = useMemo(() => {
    if (!prototype.activeOrder?.lines.length) return prototype.serviceMode === 'TABLE_SERVICE' ? 1 : 0;
    if (prototype.pendingLineCount > 0) return prototype.serviceMode === 'TABLE_SERVICE' ? 2 : 2;
    const hasReadyTicket = prototype.tickets.some((ticket) => ticket.orderId === prototype.activeOrder?.id && ticket.status === 'READY');
    if (hasReadyTicket) return 3;
    return prototype.serviceMode === 'TABLE_SERVICE' ? 3 : 4;
  }, [prototype.activeOrder, prototype.pendingLineCount, prototype.serviceMode, prototype.tickets]);

  const handleModeChange = (mode: RestaurantServiceMode) => {
    prototype.setServiceMode(mode);
    setWorkspace('ORDER');
    message.info(mode === 'TABLE_SERVICE' ? 'Mode table service aktif.' : 'Mode counter service aktif.');
  };

  const handleSendKitchen = () => {
    const ticketCount = prototype.sendToKitchen();
    if (ticketCount > 0) {
      message.success(`${ticketCount} tiket dummy dikirim ke KDS.`);
      setWorkspace('KITCHEN');
    }
  };

  const handleCompletePayment = (methodName: string) => {
    const orderNumber = prototype.activeOrder?.orderNumber ?? 'pesanan';
    prototype.completePayment();
    setPaymentOpen(false);
    message.success(`${orderNumber} disimulasikan lunas melalui ${methodName}.`);
  };

  const orderLabel = prototype.serviceMode === 'TABLE_SERVICE'
    ? `${prototype.selectedTable?.name ?? 'meja'} · ${prototype.activeOrder?.orderNumber ?? 'pesanan baru'}`
    : prototype.activeOrder?.orderNumber ?? 'pesanan counter';

  return (
    <div className="min-h-full bg-[#f6f7f9] p-1 dark:bg-slate-950 sm:p-2">
      <header className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-950 via-slate-900 to-orange-950 px-4 py-4 text-white sm:px-5">
          <div className="pointer-events-none absolute -right-16 -top-24 h-52 w-52 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-950/50"><UtensilsCrossed size={24} /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight sm:text-3xl">POS Resto</h1>
                  <span className="flex items-center gap-1 rounded-full border border-orange-300/20 bg-orange-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-200"><Sparkles size={11} /> Prototype</span>
                </div>
                <p className="mt-1 max-w-xl text-xs leading-5 text-slate-300 sm:text-sm">Simulasikan table service, counter service, alur dapur, dan pembayaran tanpa menyentuh data transaksi riil.</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Shift simulasi aktif
                <span className="h-4 w-px bg-white/10" />
                <Clock3 size={14} /> 18:00–23:00
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
                <button type="button" onClick={() => handleModeChange('TABLE_SERVICE')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition ${prototype.serviceMode === 'TABLE_SERVICE' ? 'bg-white text-slate-950 shadow' : 'text-slate-300 hover:bg-white/10'}`}><LayoutGrid size={15} /> Table service</button>
                <button type="button" onClick={() => handleModeChange('COUNTER_SERVICE')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition ${prototype.serviceMode === 'COUNTER_SERVICE' ? 'bg-white text-slate-950 shadow' : 'text-slate-300 hover:bg-white/10'}`}><MonitorDot size={15} /> Counter service</button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented block value={workspace} options={WORKSPACE_OPTIONS} onChange={(value) => setWorkspace(value as Workspace)} className="lg:max-w-[520px]" />
          {workspace === 'ORDER' ? (
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
              {flowSteps.map((step, index) => (
                <div key={step} className="flex shrink-0 items-center">
                  <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[10px] font-black ${index <= activeFlowStep ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>{index + 1}</span>
                  <span className={`ml-1.5 text-[10px] font-bold ${index <= activeFlowStep ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>{step}</span>
                  {index < flowSteps.length - 1 ? <span className="mx-2 h-px w-4 bg-slate-200 dark:bg-slate-700" /> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {workspace === 'ORDER' ? (
        <div className={`grid min-h-0 gap-3 ${prototype.serviceMode === 'TABLE_SERVICE'
          ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[280px_minmax(0,1fr)_360px]'
          : 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]'}`}
        >
          {prototype.serviceMode === 'TABLE_SERVICE' ? (
            <div className="lg:col-span-2 xl:col-span-1 xl:h-[calc(100dvh-238px)]">
              <RestaurantFloorPanel
                areas={prototype.areas}
                tables={prototype.visibleTables}
                selectedAreaId={prototype.selectedAreaId}
                selectedTableId={prototype.selectedTableId}
                onAreaChange={prototype.selectArea}
                onTableSelect={prototype.selectTable}
                onMarkAvailable={(tableId) => {
                  prototype.markTableAvailable(tableId);
                  message.success('Meja ditandai siap digunakan.');
                }}
              />
            </div>
          ) : null}

          <div className="xl:h-[calc(100dvh-238px)]">
            <RestaurantMenuCatalog menu={prototype.menu} categories={prototype.categories} onAdd={prototype.addMenuItem} />
          </div>

          <div className="xl:h-[calc(100dvh-238px)]">
            <RestaurantOrderPanel
              mode={prototype.serviceMode}
              table={prototype.selectedTable}
              order={prototype.activeOrder}
              total={prototype.total}
              pendingLineCount={prototype.pendingLineCount}
              onOrderTypeChange={prototype.setOrderType}
              onGuestCountChange={prototype.setGuestCount}
              onQuantityChange={prototype.changeLineQuantity}
              onNoteChange={prototype.changeLineNote}
              onSendKitchen={handleSendKitchen}
              onOpenPayment={() => setPaymentOpen(true)}
            />
          </div>
        </div>
      ) : null}

      {workspace === 'KITCHEN' ? (
        <KitchenDisplayBoard
          tickets={prototype.tickets}
          onAdvance={(ticketId) => {
            prototype.advanceTicket(ticketId);
            message.success('Status tiket diperbarui secara lokal.');
          }}
          onComplete={(ticketId) => {
            prototype.completeTicket(ticketId);
            message.success('Pesanan ditandai sudah diantar.');
          }}
        />
      ) : null}

      {workspace === 'FLOW' ? <RestaurantFlowGuide /> : null}

      <RestaurantPaymentModal
        open={paymentOpen}
        total={prototype.total}
        orderLabel={orderLabel}
        onCancel={() => setPaymentOpen(false)}
        onComplete={handleCompletePayment}
      />

      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
        <span className="flex items-center gap-2"><Sparkles size={14} className="text-orange-500" /> Seluruh interaksi hanya mengubah state React di halaman ini.</span>
        <span className="flex items-center gap-2 font-semibold"><CircleDollarSign size={14} /> Tidak ada request service, jurnal, stok, atau pembayaran riil.</span>
      </div>
    </div>
  );
}
