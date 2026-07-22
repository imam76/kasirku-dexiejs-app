import { Button, InputNumber, Modal, Segmented } from 'antd';
import { Banknote, CheckCircle2, CreditCard, QrCode, ReceiptText, ShieldCheck, Split } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency } from '@/utils/formatters';
import { RESTAURANT_PAYMENT_METHODS } from '../prototypeData';

interface RestaurantPaymentModalProps {
  open: boolean;
  total: number;
  orderLabel: string;
  onCancel: () => void;
  onComplete: (methodName: string) => void;
}

const METHOD_ICON = { CASH: Banknote, QRIS: QrCode, DEBIT: CreditCard };

export function RestaurantPaymentModal({ open, total, orderLabel, onCancel, onComplete }: RestaurantPaymentModalProps) {
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'SPLIT'>('FULL');
  const [methodId, setMethodId] = useState<'CASH' | 'QRIS' | 'DEBIT'>('QRIS');
  const [cashReceived, setCashReceived] = useState<number | null>(null);

  const selectedMethod = RESTAURANT_PAYMENT_METHODS.find((method) => method.id === methodId)!;
  const normalizedCashReceived = cashReceived ?? total;
  const change = methodId === 'CASH' ? Math.max(0, normalizedCashReceived - total) : 0;
  const handleCancel = () => {
    setCashReceived(null);
    onCancel();
  };
  const handleComplete = () => {
    setCashReceived(null);
    onComplete(selectedMethod.name);
  };

  return (
    <Modal open={open} onCancel={handleCancel} footer={null} width={620} centered destroyOnHidden title={null}>
      <div className="-m-5 overflow-hidden rounded-[10px] bg-white dark:bg-slate-900">
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">Simulasi pembayaran</p><h2 className="mt-1 text-2xl font-black">Selesaikan {orderLabel}</h2></div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider">Data dummy</span>
          </div>
          <div className="mt-6 flex items-end justify-between border-t border-white/10 pt-4"><span className="text-sm text-slate-300">Total tagihan</span><span className="text-3xl font-black">Rp {formatCurrency(total)}</span></div>
        </div>

        <div className="p-5">
          <Segmented
            block
            value={paymentMode}
            onChange={(value) => setPaymentMode(value as 'FULL' | 'SPLIT')}
            options={[{ label: 'Bayar penuh', value: 'FULL', icon: <ReceiptText size={14} /> }, { label: 'Split bill', value: 'SPLIT', icon: <Split size={14} /> }]}
          />

          {paymentMode === 'SPLIT' ? (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
              Mode split bill ditampilkan sebagai preview UX. Pada fase service, satu order dapat dialokasikan ke beberapa pembayaran dan pelanggan.
            </div>
          ) : null}

          <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">Pilih metode pembayaran</p>
          <div className="grid grid-cols-3 gap-2">
            {RESTAURANT_PAYMENT_METHODS.map((method) => {
              const Icon = METHOD_ICON[method.id];
              const selected = method.id === methodId;
              return (
                <button key={method.id} type="button" onClick={() => setMethodId(method.id)} className={`rounded-2xl border p-3 text-left transition ${selected ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-100 dark:bg-orange-950/30 dark:ring-orange-900' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}>
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${selected ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}><Icon size={18} /></span>
                  <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">{method.name}</p>
                  <p className="mt-1 hidden text-[10px] leading-4 text-slate-400 sm:block">{method.description}</p>
                </button>
              );
            })}
          </div>

          {methodId === 'CASH' ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
              <div className="flex items-center justify-between gap-4"><label className="text-sm font-bold text-slate-700 dark:text-slate-200">Uang diterima</label><InputNumber min={total} value={normalizedCashReceived} onChange={(value) => setCashReceived(Number(value ?? total))} prefix="Rp" className="w-44" formatter={(value) => formatCurrency(Number(value ?? 0))} parser={(value) => Number(String(value ?? '').replace(/\D/g, ''))} /></div>
              <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><span className="text-slate-500">Kembalian</span><span className="font-black text-emerald-600">Rp {formatCurrency(change)}</span></div>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 size={20} /><div><p className="text-sm font-bold">Siap disimulasikan</p><p className="text-[11px]">Tidak ada koneksi ke payment gateway atau EDC.</p></div></div>
          )}

          <div className="mt-5 flex items-center gap-2 text-[10px] text-slate-400"><ShieldCheck size={13} /> Prototipe tidak menyimpan pembayaran, jurnal, atau mutasi stok.</div>
          <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2"><Button size="large" onClick={handleCancel}>Kembali</Button><Button type="primary" size="large" onClick={handleComplete} className="!bg-orange-500 !font-bold hover:!bg-orange-600">Simulasikan pembayaran</Button></div>
        </div>
      </div>
    </Modal>
  );
}
