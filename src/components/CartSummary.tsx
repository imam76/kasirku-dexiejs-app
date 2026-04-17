import { DollarSign, Wallet } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import { PaymentMethod } from '@/types';

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
  const payment = parseFloat(paymentAmount);
  const change = payment >= total ? payment - total : 0;

  return (
    <>
      <div className="border-t pt-4 mb-4">
        <div className="flex justify-between text-xl font-bold text-gray-800">
          <span>Total:</span>
          <span>Rp {formatCurrency(total)}</span>
        </div>
      </div>

      {!showPayment ? (
        <button
          onClick={() => setShowPayment(true)}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <DollarSign size={20} />
          Bayar
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setPaymentMethod('TUNAI')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                paymentMethod === 'TUNAI'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <DollarSign size={16} />
              Tunai
            </button>
            <button
              onClick={() => setPaymentMethod('NON_TUNAI')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                paymentMethod === 'NON_TUNAI'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Wallet size={16} />
              Non-Tunai
            </button>
          </div>

          <div className="space-y-3">
            <input
              type="number"
              placeholder="Jumlah pembayaran"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              autoFocus
            />
            {paymentAmount && payment >= total && (
              <p className="text-sm text-gray-700">
                Kembalian: <span className="font-bold">Rp {formatCurrency(change)}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCheckout}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold transition-colors"
            >
              Konfirmasi
            </button>
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
          </div>
        </div>
      )}
    </>
  );
}
