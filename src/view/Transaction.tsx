import { CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Spin } from 'antd';
import type { InputRef } from 'antd';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Banknote, Clock, Keyboard, LockKeyhole, PlayCircle, ScanLine } from 'lucide-react';
import { useTransaction } from '@/hooks/useTransaction';
import { useCashierSession } from '@/hooks/useCashierSession';
import { formatCurrency } from '@/utils/formatters';
import ProductList from '../components/ProductList';
import CartSidebar from '../components/CartSidebar';
import MobileCartDrawer from '../components/MobileCartDrawer';
import ScannerModal from '../components/ScannerModal';
import { useI18n } from '@/hooks/useI18n';
import type { CashierSession } from '@/types';
import type { CashierSessionReconciliation } from '@/services/cashierSessionService';
import { getPosProcessDraftScope } from '@/store/transactionStore';

interface OpenCashierFormValues {
  opening_cash_amount: number;
  opening_note?: string;
}

interface CloseCashierFormValues {
  closing_cash_amount: number;
  closing_note?: string;
}

const CashierSessionStatusBar = ({
  session,
  onClose,
  isClosing,
}: {
  session: CashierSession;
  onClose: () => void;
  isClosing: boolean;
}) => {
  const { t } = useI18n();

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-blue-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-xl bg-white p-2 text-blue-700 shadow-sm ring-1 ring-blue-100">
          <Banknote size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('cashierSession.activeTitle')}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>{session.session_number}</span>
            <span>{session.cashier_user_name || '-'}</span>
            <span>{t('cashierSession.openingCash')}: Rp {formatCurrency(session.opening_cash_amount)}</span>
          </div>
        </div>
      </div>
      <Button danger onClick={onClose} loading={isClosing}>
        {t('cashierSession.closeButton')}
      </Button>
    </div>
  );
};

const ReconciliationSummary = ({ reconciliation }: { reconciliation: CashierSessionReconciliation }) => {
  const { t } = useI18n();

  return (
    <Descriptions size="small" column={1} bordered className="mt-4">
      <Descriptions.Item label={t('cashierSession.openingCash')}>
        Rp {formatCurrency(reconciliation.opening_cash_amount)}
      </Descriptions.Item>
      <Descriptions.Item label={t('cashierSession.cashSales')}>
        Rp {formatCurrency(reconciliation.cash_sales_amount)}
      </Descriptions.Item>
      <Descriptions.Item label={t('cashierSession.nonCashSales')}>
        Rp {formatCurrency(reconciliation.non_cash_sales_amount)}
      </Descriptions.Item>
      {reconciliation.payment_method_breakdown.map((payment) => (
        <Descriptions.Item key={payment.code} label={`${payment.name} (${payment.transaction_count} trx)`}>
          Rp {formatCurrency(payment.amount)}
        </Descriptions.Item>
      ))}
      <Descriptions.Item label={t('cashierSession.expectedCash')}>
        Rp {formatCurrency(reconciliation.expected_cash_amount)}
      </Descriptions.Item>
      <Descriptions.Item label={t('cashierSession.actualCash')}>
        Rp {formatCurrency(reconciliation.closing_cash_amount)}
      </Descriptions.Item>
      <Descriptions.Item label={t('cashierSession.difference')}>
        <span className={reconciliation.cash_difference_amount === 0 ? 'text-emerald-700' : 'text-red-600'}>
          Rp {formatCurrency(reconciliation.cash_difference_amount)}
        </span>
      </Descriptions.Item>
    </Descriptions>
  );
};

export default function Transaction() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [openForm] = Form.useForm<OpenCashierFormValues>();
  const [closeForm] = Form.useForm<CloseCashierFormValues>();
  const {
    activeSession,
    isLoadingActiveSession,
    openSession,
    isOpeningSession,
    closeSession,
    isClosingSession,
    calculateReconciliation,
  } = useCashierSession();
  const posProcessDraftScope = activeSession?.cashier_user_id
    ? getPosProcessDraftScope(activeSession.cashier_user_id, activeSession.id)
    : undefined;
  const {
    cart,
    searchTerm,
    paymentDrafts,
    paymentPreview,
    paymentMethods,
    voucherCode,
    memberContactId,
    redeemPoints,
    showPayment,
    isPosProcessReady,
    filteredProducts,
    productPagination,
    promoPreview,
    membershipPreview,
    activePromos,
    activeMembers,
    selectedMember,
    membershipSetting,
    createMember,
    isCreatingMember,
    addToCart,
    updateQuantity,
    updateUnit,
    findProductByScannedCode,
    removeFromCart,
    calculateTotal,
    handleCheckout,
    handleAddPayment,
    clearCart,
    setSearchTerm,
    updatePaymentDraft,
    removePaymentDraft,
    setVoucherCode,
    setMemberContactId,
    setRedeemPoints,
    setShowPayment,
    discardDraftScope,
  } = useTransaction(posProcessDraftScope);

  // Mobile cart drawer state
  const [cartOpen, setCartOpen] = useState(false);
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0);
  const total = calculateTotal();
  const searchInputRef = useRef<InputRef>(null);

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [reconciliation, setReconciliation] = useState<CashierSessionReconciliation | null>(null);
  const desktopShortcuts = [
    { keys: ['/'], label: t('transaction.shortcut.focusSearch') },
    { keys: ['Esc'], label: t('transaction.shortcut.clearSearch') },
  ];

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    searchInputRef.current?.focus();
  }, [setSearchTerm]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;

      const tagName = target.tagName.toLowerCase();
      return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === '/' && !isTypingTarget(event.target)) {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === 'Escape' && searchTerm) {
        event.preventDefault();
        clearSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSearch, focusSearch, searchTerm]);

  const handleScan = useCallback(async (text: string) => {
    const match = await findProductByScannedCode(text);

    if (match) {
      addToCart(match);
      message.success(t('transaction.addedToCart', { name: match.name }));
    } else {
      message.error(t('transaction.productNotFound', { code: text }));
    }
  }, [addToCart, findProductByScannedCode, message, t]);

  const handleOpenSession = async (values: OpenCashierFormValues) => {
    await openSession({
      opening_cash_amount: Number(values.opening_cash_amount || 0),
      opening_note: values.opening_note,
    });
    openForm.resetFields();
  };

  const refreshClosePreview = useCallback(async () => {
    if (!activeSession) return;

    const values = closeForm.getFieldsValue();
    const closingCashAmount = Number(values.closing_cash_amount || 0);
    const nextReconciliation = await calculateReconciliation(activeSession.id, closingCashAmount);
    setReconciliation(nextReconciliation);
  }, [activeSession, calculateReconciliation, closeForm]);

  const openCloseModal = useCallback(async () => {
    if (!activeSession) return;

    closeForm.resetFields();
    closeForm.setFieldsValue({ closing_cash_amount: 0 });
    setCloseModalOpen(true);
    const nextReconciliation = await calculateReconciliation(activeSession.id, 0);
    setReconciliation(nextReconciliation);
  }, [activeSession, calculateReconciliation, closeForm]);

  const handleCloseSession = async (values: CloseCashierFormValues) => {
    if (!activeSession) return;

    await closeSession({
      session_id: activeSession.id,
      closing_cash_amount: Number(values.closing_cash_amount || 0),
      closing_note: values.closing_note,
    });
    if (posProcessDraftScope) {
      discardDraftScope(posProcessDraftScope);
    }
    setCloseModalOpen(false);
    setReconciliation(null);
    closeForm.resetFields();
  };

  if (isLoadingActiveSession || !isPosProcessReady) {
    return (
      <div className="flex min-h-[360px] items-center justify-center p-6">
        <Spin />
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-xl rounded-2xl border border-blue-100 shadow-md">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
              <LockKeyhole size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('cashierSession.openTitle')}</h2>
              <p className="mt-1 text-sm text-gray-500">{t('cashierSession.openDescription')}</p>
            </div>
          </div>

          <Form
            form={openForm}
            layout="vertical"
            onFinish={handleOpenSession}
            initialValues={{ opening_cash_amount: 0 }}
          >
            <Form.Item
              name="opening_cash_amount"
              label={t('cashierSession.openingCash')}
              rules={[{ required: true, message: t('cashierSession.openingCashRequired') }]}
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
            <Form.Item name="opening_note" label={t('cashierSession.openingNote')}>
              <Input.TextArea rows={3} />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              icon={<PlayCircle size={18} />}
              loading={isOpeningSession}
              className="w-full bg-blue-600 hover:!bg-blue-700"
            >
              {t('cashierSession.openButton')}
            </Button>
          </Form>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col bg-slate-50/60 p-2 sm:p-3 lg:h-full lg:overflow-hidden">
      <CashierSessionStatusBar session={activeSession} onClose={openCloseModal} isClosing={isClosingSession} />

      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_270px_270px] xl:grid-cols-[minmax(0,1fr)_300px_300px] 2xl:grid-cols-[minmax(0,1fr)_320px_320px]">
        <div id="product-list" className="flex min-w-0 flex-col lg:min-h-0 lg:overflow-hidden">
          <div className="mb-3 shrink-0 rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input
                ref={searchInputRef}
                size="large"
                data-tour="transaction-search"
                allowClear={false}
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder={t('transaction.searchPlaceholder')}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="rounded-lg"
              />
              <Button
                size="large"
                htmlType='button'
                icon={<CloseCircleOutlined />}
                onClick={clearSearch}
                disabled={!searchTerm}
                className="w-full sm:w-auto"
              >
                {t('transaction.reset')}
              </Button>
              <Button
                htmlType="button"
                size="large"
                icon={<ScanLine size={18} />}
                onClick={() => setScannerOpen(true)}
                data-tour="transaction-scan"
                className="flex w-full items-center justify-center gap-2 bg-blue-600 font-semibold text-white hover:!border-blue-700 hover:!bg-blue-700 hover:!text-white sm:w-auto"
              >
                {t('transaction.scanBarcode')}
              </Button>
            </div>

            <div className="mt-3 hidden flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-900 lg:flex">
              <div className="flex items-center gap-1.5 font-semibold">
                <Keyboard size={15} />
                <span>{t('transaction.desktopShortcutTitle')}</span>
              </div>
              {desktopShortcuts.map((shortcut) => (
                <div
                  key={shortcut.label}
                  className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-blue-100"
                >
                  <span className="flex items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="min-w-6 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold leading-none text-blue-800"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                  <span className="font-medium">{shortcut.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:min-h-0 lg:flex-1 lg:overflow-hidden">
            <ProductList
              products={filteredProducts}
              cart={cart}
              addToCart={addToCart}
              pagination={productPagination}
            />
          </div>
        </div>

        <CartSidebar
          cart={cart}
          updateQuantity={updateQuantity}
          updateUnit={updateUnit}
          removeFromCart={removeFromCart}
          clearCart={clearCart}
          total={total}
          showPayment={showPayment}
          paymentDrafts={paymentDrafts}
          paymentPreview={paymentPreview}
          paymentMethods={paymentMethods}
          voucherCode={voucherCode}
          memberContactId={memberContactId}
          redeemPoints={redeemPoints}
          promoPreview={promoPreview}
          membershipPreview={membershipPreview}
          activePromos={activePromos}
          activeMembers={activeMembers}
          selectedMember={selectedMember}
          membershipSetting={membershipSetting}
          setShowPayment={setShowPayment}
          updatePaymentDraft={updatePaymentDraft}
          removePaymentDraft={removePaymentDraft}
          handleAddPayment={handleAddPayment}
          setVoucherCode={setVoucherCode}
          setMemberContactId={setMemberContactId}
          setRedeemPoints={setRedeemPoints}
          createMember={createMember}
          isCreatingMember={isCreatingMember}
          handleCheckout={handleCheckout}
        />
      </div>

      {/* Mobile/Tablet: Floating Cart Button */}
      {totalItems > 0 && (
        <div className="fixed bottom-4 left-4 right-4 lg:hidden z-30">
          <button
            onClick={() => setCartOpen(true)}
            data-tour="transaction-mobile-cart"
            className="flex w-full items-center justify-between rounded-2xl bg-blue-600 px-5 py-3.5 font-semibold text-white shadow-xl shadow-blue-200/70 transition-colors hover:bg-blue-700"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-600">
                {totalItems}
              </span>
              <span>{t('transaction.viewCart')}</span>
            </div>
            <span className="font-bold">Rp {formatCurrency(total)}</span>
          </button>
        </div>
      )}

      <MobileCartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        updateQuantity={updateQuantity}
        updateUnit={updateUnit}
        removeFromCart={removeFromCart}
        clearCart={clearCart}
        total={total}
        showPayment={showPayment}
        paymentDrafts={paymentDrafts}
        paymentPreview={paymentPreview}
        paymentMethods={paymentMethods}
        voucherCode={voucherCode}
        memberContactId={memberContactId}
        redeemPoints={redeemPoints}
        promoPreview={promoPreview}
        membershipPreview={membershipPreview}
        activePromos={activePromos}
        activeMembers={activeMembers}
        selectedMember={selectedMember}
        membershipSetting={membershipSetting}
        setShowPayment={setShowPayment}
        updatePaymentDraft={updatePaymentDraft}
        removePaymentDraft={removePaymentDraft}
        handleAddPayment={handleAddPayment}
        setVoucherCode={setVoucherCode}
        setMemberContactId={setMemberContactId}
        setRedeemPoints={setRedeemPoints}
        createMember={createMember}
        isCreatingMember={isCreatingMember}
        handleCheckout={handleCheckout}
      />

      {scannerOpen && (
        <ScannerModal
          onClose={() => setScannerOpen(false)}
          onScan={handleScan}
        />
      )}

      <Modal
        title={t('cashierSession.closeTitle')}
        open={closeModalOpen}
        onCancel={() => setCloseModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <Clock size={16} />
          <span>{activeSession.session_number}</span>
        </div>
        <Form
          form={closeForm}
          layout="vertical"
          onFinish={handleCloseSession}
          onValuesChange={refreshClosePreview}
          initialValues={{ closing_cash_amount: 0 }}
        >
          <Form.Item
            name="closing_cash_amount"
            label={t('cashierSession.actualCash')}
            rules={[{ required: true, message: t('cashierSession.actualCashRequired') }]}
          >
            <InputNumber<number>
              min={0}
              className="w-full"
              prefix="Rp"
              formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => Number((value || '').replace(/\./g, ''))}
            />
          </Form.Item>

          {reconciliation && <ReconciliationSummary reconciliation={reconciliation} />}

          <Form.Item
            className="mt-4"
            name="closing_note"
            label={t('cashierSession.closingNote')}
            rules={[
              {
                validator: async (_, value) => {
                  if (reconciliation?.cash_difference_amount && !String(value || '').trim()) {
                    throw new Error(t('cashierSession.closingNoteRequiredForDifference'));
                  }
                },
              },
            ]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <div className="flex justify-end gap-2">
            <Button onClick={() => setCloseModalOpen(false)}>{t('common.cancel')}</Button>
            <Button danger type="primary" htmlType="submit" loading={isClosingSession}>
              {t('cashierSession.closeButton')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
