import { DollarSign } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

interface CartSummaryProps {
  total: number;
  showPayment: boolean;
  paymentAmount: string;
  setShowPayment: (show: boolean) => void;
  setPaymentAmount: (amount: string) => void;
  handleCheckout: () => void;
  onCancel?: () => void;
}

export default function CartSummary({
  total,
  showPayment,
  paymentAmount,
  setShowPayment,
  setPaymentAmount,
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
