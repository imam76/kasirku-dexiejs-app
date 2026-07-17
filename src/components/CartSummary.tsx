import { Contact, MembershipSetting } from '@/types';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { PromoEvaluationResult } from '@/services/promoService';
import type { MembershipCheckoutEvaluation, QuickCreateMemberInput } from '@/services/membershipService';
import { formatCurrency } from '@/utils/formatters';
import { Alert, Input, Select, Switch } from 'antd';
import { Delete, DollarSign } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import MembershipCheckoutPanel from './MembershipCheckoutPanel';

const PAYMENT_SHORTCUTS_STORAGE_KEY = 'frayukti-show-payment-shortcuts';

interface CartSummaryProps {
  total: number;
  showPayment: boolean;
  paymentAmount: string;
  paymentMethods: PosPaymentMethodOption[];
  paymentMethodId?: string;
  paymentReference: string;
  voucherCode: string;
  memberContactId?: string;
  redeemPoints: string;
  promoPreview: PromoEvaluationResult;
  membershipPreview: MembershipCheckoutEvaluation;
  activeMembers: Contact[];
  selectedMember: Contact | null;
  membershipSetting: MembershipSetting;
  setShowPayment: (show: boolean) => void;
  setPaymentAmount: (amount: string) => void;
  setPaymentMethodId: (id?: string) => void;
  setPaymentReference: (reference: string) => void;
  setVoucherCode: (voucherCode: string) => void;
  setMemberContactId: (memberContactId?: string) => void;
  setRedeemPoints: (points: string) => void;
  createMember: (input: QuickCreateMemberInput) => Promise<Contact>;
  isCreatingMember: boolean;
  handleCheckout: () => void;
  onCancel?: () => void;
}

export default function CartSummary({
  total,
  showPayment,
  paymentAmount,
  paymentMethods,
  paymentMethodId,
  paymentReference,
  voucherCode,
  memberContactId,
  redeemPoints,
  promoPreview,
  membershipPreview,
  activeMembers,
  selectedMember,
  membershipSetting,
  setShowPayment,
  setPaymentAmount,
  setPaymentMethodId,
  setPaymentReference,
  setVoucherCode,
  setMemberContactId,
  setRedeemPoints,
  createMember,
  isCreatingMember,
  handleCheckout,
  onCancel
}: CartSummaryProps) {
  const { t } = useI18n();
  const [showPaymentShortcuts, setShowPaymentShortcuts] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const savedValue = localStorage.getItem(PAYMENT_SHORTCUTS_STORAGE_KEY);
    return savedValue ? savedValue === 'true' : true;
  });
  const selectedOption = paymentMethods.find((option) => option.method.id === paymentMethodId);
  const selectedMethod = selectedOption?.method;
  const isCash = selectedMethod?.category === 'CASH';
  const payment = parseFloat(paymentAmount);
  const change = payment >= total ? payment - total : 0;
  const quickAmounts = [5000, 10000, 20000, 50000, 100000];

  const handleQuickAmount = (amount: number) => {
    const currentAmount = Number.isFinite(payment) ? payment : 0;
    setPaymentAmount(String(currentAmount + amount));
  };

  const handlePaymentMethodChange = (option: PosPaymentMethodOption) => {
    if (!option.isValid) return;
    setPaymentMethodId(option.method.id);
    if (!option.method.requires_reference) setPaymentReference('');
    if (option.method.category !== 'CASH') {
      setPaymentAmount(String(total));
    }
  };

  useEffect(() => {
    if (selectedMethod && !isCash && paymentAmount !== String(total)) {
      setPaymentAmount(String(total));
    }
  }, [isCash, paymentAmount, selectedMethod, setPaymentAmount, total]);

  useEffect(() => {
    localStorage.setItem(PAYMENT_SHORTCUTS_STORAGE_KEY, String(showPaymentShortcuts));
  }, [showPaymentShortcuts]);

  return (
    <>
      <div className="border-t pt-4 mb-4">
        <MembershipCheckoutPanel
          members={activeMembers}
          selectedMember={selectedMember}
          memberContactId={memberContactId}
          voucherCode={voucherCode}
          redeemPoints={redeemPoints}
          membershipSetting={membershipSetting}
          promoPreview={promoPreview}
          membershipPreview={membershipPreview}
          onMemberChange={setMemberContactId}
          onVoucherCodeChange={setVoucherCode}
          onRedeemPointsChange={setRedeemPoints}
          onCreateMember={createMember}
          isCreatingMember={isCreatingMember}
        />

        <div className="flex justify-between text-xl font-bold text-gray-800">
          <span>{t('cart.total')}:</span>
          <span>Rp {formatCurrency(total)}</span>
        </div>
         {isCash && paymentAmount && payment >= total && (
              <p className="text-sm text-gray-700 flex justify-between mt-1">
                {t('payment.change')}: <span className="font-bold">Rp {formatCurrency(change)}</span>
              </p>
            )}
      </div>

      {!showPayment ? (
        <button
          onClick={() => setShowPayment(true)}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 mb-6 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <DollarSign size={20} />
          {t('payment.pay')}
        </button>
      ) : (
        <div className="space-y-4 pb-6">
          {paymentMethods.length === 0 ? (
            <Alert type="error" showIcon message={t('payment.noMethodAvailable')} />
          ) : (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                {t('report.paymentMethod')}
              </label>
              <Select
                className="w-full"
                size="large"
                value={paymentMethodId}
                placeholder={t('report.paymentMethod')}
                onChange={(methodId) => {
                  const option = paymentMethods.find((item) => item.method.id === methodId);
                  if (option) handlePaymentMethodChange(option);
                }}
                options={paymentMethods.map((option) => ({
                  value: option.method.id,
                  label: option.method.name,
                  disabled: !option.isValid,
                  title: option.disabledReason,
                }))}
              />
            </div>
          )}

          {selectedMethod?.requires_reference && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('payment.reference')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={paymentReference}
                maxLength={100}
                placeholder={t('payment.referencePlaceholder')}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-3 pb-6">
            <input
              type="number"
              placeholder={t('payment.amountPlaceholder')}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              disabled={!isCash}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${!isCash ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                }`}
              autoFocus={isCash}
            />
            {isCash && (
              <div className="flex items-center justify-between gap-3 rounded-lg py-2 text-sm font-medium text-gray-700">
                <span>{t('payment.shortcuts')}</span>
                <Switch
                  size="small"
                  checked={showPaymentShortcuts}
                  onChange={setShowPaymentShortcuts}
                />
              </div>
            )}
            {isCash && showPaymentShortcuts && (
              <div className="grid grid-cols-2 gap-2 py-2 md:grid-cols-3">
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
                  {t('cart.clear')}
                </button>
              </div>
            )}
            {isCash && (
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setPaymentAmount(String(total))}
                  className="w-full px-3 py-2 text-sm font-semibold text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors flex items-center justify-center gap-1"
                >
                  <DollarSign size={16} />
                  {t('payment.exactAmount')}
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
              {t('payment.cancel')}
            </button>
            <button
              onClick={handleCheckout}
              disabled={!selectedOption?.isValid || Boolean(selectedMethod?.requires_reference && !paymentReference.trim())}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-2 rounded-lg font-semibold transition-colors"
            >
              {t('payment.confirm')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
