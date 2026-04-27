import { PaymentMethod } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { Switch } from 'antd';
import { Delete, DollarSign, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';

const PAYMENT_SHORTCUTS_STORAGE_KEY = 'kasirku-show-payment-shortcuts';

interface CartSummaryProps {
  total: number;
  showPayment: boolean;
  paymentAmount: string;
  paymentMethod: PaymentMethod;
  setShowPayment: (show: boolean) => void;
  setPaymentAmount: (amount: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  handleCheckout: () => void;
  onCancel?: () => void;
}

export default function CartSummary({
  total,
  showPayment,
  paymentAmount,
  paymentMethod,
  setShowPayment,
  setPaymentAmount,
  setPaymentMethod,
  handleCheckout,
  onCancel
}: CartSummaryProps) {
  const [showPaymentShortcuts, setShowPaymentShortcuts] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const savedValue = localStorage.getItem(PAYMENT_SHORTCUTS_STORAGE_KEY);
    return savedValue ? savedValue === 'true' : true;
  });
  const isNonCash = paymentMethod === 'NON_TUNAI';
  const payment = parseFloat(paymentAmount);
  const change = payment >= total ? payment - total : 0;
  const quickAmounts = [5000, 10000, 20000, 50000, 100000];

  const handleQuickAmount = (amount: number) => {
    const currentAmount = Number.isFinite(payment) ? payment : 0;
    setPaymentAmount(String(currentAmount + amount));
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method);

    if (method === 'NON_TUNAI') {
      setPaymentAmount(String(total));
    }
  };

  useEffect(() => {
    if (isNonCash && paymentAmount !== String(total)) {
      setPaymentAmount(String(total));
    }
  }, [isNonCash, paymentAmount, setPaymentAmount, total]);

  useEffect(() => {
    localStorage.setItem(PAYMENT_SHORTCUTS_STORAGE_KEY, String(showPaymentShortcuts));
  }, [showPaymentShortcuts]);

  return (
    <>
      <div className="border-t pt-4 mb-4">
        <div className="flex justify-between text-xl font-bold text-gray-800">
          <span>Total:</span>
          <span>Rp {formatCurrency(total)}</span>
        </div>
         {!isNonCash && paymentAmount && payment >= total && (
              <p className="text-sm text-gray-700 flex justify-between mt-1">
                Kembalian: <span className="font-bold">Rp {formatCurrency(change)}</span>
              </p>
            )}
      </div>

      {!showPayment ? (
        <button
          onClick={() => setShowPayment(true)}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 mb-6 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <DollarSign size={20} />
          Bayar
        </button>
      ) : (
        <div className="space-y-4 pb-6">
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => handlePaymentMethodChange('TUNAI')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 ${paymentMethod === 'TUNAI'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <DollarSign size={16} />
              Tunai
            </button>
            <button
              onClick={() => handlePaymentMethodChange('NON_TUNAI')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 ${paymentMethod === 'NON_TUNAI'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <Wallet size={16} />
              Non-Tunai
            </button>
          </div>

          <div className="space-y-3 pb-6">
            <input
              type="number"
              placeholder="Jumlah pembayaran"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              disabled={isNonCash}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${isNonCash ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                }`}
              autoFocus={!isNonCash}
            />
            {!isNonCash && (
              <div className="flex items-center justify-between gap-3 rounded-lg py-2 text-sm font-medium text-gray-700">
                <span>Shortcut Uang Pecahan</span>
                <Switch
                  size="small"
                  checked={showPaymentShortcuts}
                  onChange={setShowPaymentShortcuts}
                />
              </div>
            )}
            {!isNonCash && showPaymentShortcuts && (
              <div className="grid grid-cols-2 gap-2 py-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
                {quickAmounts.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => handleQuickAmount(amount)}
                    className="px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    +{formatCurrency(amount)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPaymentAmount('')}
                  className="px-3 py-2 text-sm font-semibold text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors flex items-center justify-center gap-1"
                >
                  <Delete size={16} />
                  Bersihkan
                </button>
              </div>
            )}
            {!isNonCash && (
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setPaymentAmount(String(total))}
                  className="w-full px-3 py-2 text-sm font-semibold text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors flex items-center justify-center gap-1"
                >
                  <DollarSign size={16} />
                  Uang Pas
                </button>
              </div>
            )}
            
          </div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setShowPayment(false);
                setPaymentAmount('');
                onCancel?.();
              }}
              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg font-semibold transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleCheckout}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold transition-colors"
            >
              Konfirmasi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
