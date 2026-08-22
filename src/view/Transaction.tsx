import { CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Descriptions, Dropdown, Form, Input, InputNumber, Modal, Spin } from 'antd';
import type { InputRef } from 'antd';
import { useState, useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Archive, Banknote, Clock, FileClock, LockKeyhole, PlayCircle, RotateCcw, ScanLine, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useTransaction } from '@/hooks/useTransaction';
import { useCashierSession } from '@/hooks/useCashierSession';
import { formatCurrency } from '@/utils/formatters';
import ProductList from '../components/ProductList';
import CartSidebar from '../components/CartSidebar';
import MobileCartDrawer from '../components/MobileCartDrawer';
import ScannerModal from '../components/ScannerModal';
import { PosQuickItemModal } from '../components/PosQuickItemModal';
import PosHotkeysInfo from '../components/PosHotkeysInfo';
import { useAuth } from '@/auth/useAuth';
import { isProductUnverified } from '@/services/posQuickItemService';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getProductCategoryLabel } from '@/i18n/stock';
import { OPEN_MOBILE_CASHIER_CLOSE_EVENT } from '@/navigation/mobileNavigation';
import type { CashierSession, Product } from '@/types';
import type { CashierSessionReconciliation } from '@/services/cashierSessionService';
import { getPosProcessDraftScope } from '@/store/transactionStore';
import { getCartItemPrice } from '@/utils/pricing';
import { getAdjacentProductSellableUnit, getProductSellableUnits } from '@/utils/productUnits';
import { matchesProductSearch, normalizeProductSearchTerm } from '@/utils/productSearch';
import { hasVisiblePosShortcutBlocker, isPosShortcutTypingTarget } from '@/utils/posShortcutGuards';
import {
  appendKeyboardBarcodeCharacter,
  finishKeyboardBarcodeScan,
  isKeyboardBarcodeBufferActive,
  KEYBOARD_BARCODE_MIN_LENGTH,
  type KeyboardBarcodeBuffer,
} from '@/utils/keyboardBarcodeScanner';

const SEARCH_INPUT_SCANNER_MAX_INTERVAL_MS = 80;
const SEARCH_INPUT_MANUAL_FLUSH_DELAY_MS = SEARCH_INPUT_SCANNER_MAX_INTERVAL_MS + 20;

interface PendingSearchKeySequence {
  barcodeBuffer: KeyboardBarcodeBuffer;
  baseValue: string;
  selectionStart: number;
  selectionEnd: number;
}

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
    <header className="-mx-2 mb-2 flex min-h-10 items-center justify-between gap-3 border-b border-blue-100 bg-white/95 px-3 py-1.5 text-blue-950 shadow-sm sm:-mx-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <Banknote size={15} />
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs">
          <span className="shrink-0 font-bold text-emerald-700">{t('cashierSession.activeTitle')}</span>
          <span className="hidden h-4 w-px bg-blue-100 sm:block" />
          <span className="truncate font-medium text-slate-600">{session.session_number} · {session.cashier_user_name || '-'}</span>
          <span className="hidden shrink-0 text-slate-500 min-[1024px]:inline">
            {t('cashierSession.openingCash')}: Rp {formatCurrency(session.opening_cash_amount)}
          </span>
        </div>
      </div>
      <Button
        danger
        size="small"
        icon={<LockKeyhole size={14} />}
        onClick={onClose}
        loading={isClosing}
        className="shrink-0 !rounded-lg"
      >
        {t('cashierSession.closeButton')}
      </Button>
    </header>
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

const isTypingTarget = isPosShortcutTypingTarget;

export default function Transaction() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { can } = useAuth();
  const canQuickAddItem = can('POS_QUICK_ITEM_ENTRY');
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
    heldDrafts,
    isPosProcessReady,
    filteredProducts,
    productPagination,
    availableProductCategories,
    selectedProductCategory,
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
    updateCartProduct,
    findProductByScannedCode,
    findFirstProductBySearchTerm,
    removeFromCart,
    calculateTotal,
    handleCheckout,
    handleRecordExpense,
    handleAddPayment,
    clearCart,
    setSearchTerm,
    setSelectedProductCategory,
    updatePaymentDraft,
    removePaymentDraft,
    setVoucherCode,
    setMemberContactId,
    setRedeemPoints,
    setShowPayment,
    discardDraftScope,
    holdCurrentDraft,
    resumeHeldDraft,
    deleteHeldDraft,
  } = useTransaction(posProcessDraftScope);
  const isMobile = useIsMobile();

  // Mobile cart drawer state
  const [cartOpen, setCartOpen] = useState(false);
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0);
  const total = calculateTotal();
  const searchInputRef = useRef<InputRef>(null);
  const quantityInputRefs = useRef(new Map<string, HTMLInputElement>());
  const addFromSearchInFlightRef = useRef(false);
  const keyboardScannerBufferRef = useRef<KeyboardBarcodeBuffer | null>(null);
  const pendingSearchKeySequenceRef = useRef<PendingSearchKeySequence | null>(null);
  const pendingSearchFlushTimeoutRef = useRef<number | null>(null);
  const searchTermRef = useRef(searchTerm);
  searchTermRef.current = searchTerm;
  const [activeCartItemId, setActiveCartItemId] = useState<string>();

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [quickItemDraft, setQuickItemDraft] = useState<{ barcode: string; name: string } | null>(null);
  const [quickItemTopUp, setQuickItemTopUp] = useState<Product | null>(null);
  const [editingCartProduct, setEditingCartProduct] = useState<Product | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [reconciliation, setReconciliation] = useState<CashierSessionReconciliation | null>(null);
  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [draftListOpen, setDraftListOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');

  const openHoldModal = useCallback(() => {
    if (cart.length === 0) {
      message.info(t('transaction.draft.emptyCart'));
      return;
    }
    setDraftLabel(`${t('transaction.draft.defaultLabel')} ${heldDrafts.length + 1}`);
    setHoldModalOpen(true);
  }, [cart.length, heldDrafts.length, message, t]);

  const handleHoldDraft = useCallback(() => {
    const normalizedLabel = draftLabel.trim();
    if (!normalizedLabel) return;
    const draft = holdCurrentDraft(normalizedLabel);
    if (!draft) return;
    setHoldModalOpen(false);
    setCartOpen(false);
    setShowPayment(false);
    message.success(t('transaction.draft.held', { label: draft.label }));
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [draftLabel, holdCurrentDraft, message, setShowPayment, t]);

  const handleResumeDraft = useCallback((draftId: string) => {
    if (cart.length > 0) {
      message.warning(t('transaction.draft.holdCurrentFirst'));
      return;
    }
    const draft = heldDrafts.find((item) => item.id === draftId);
    if (!resumeHeldDraft(draftId) || !draft) return;
    setDraftListOpen(false);
    message.success(t('transaction.draft.resumed', { label: draft.label }));
  }, [cart.length, heldDrafts, message, resumeHeldDraft, t]);

  const handleDeleteDraft = useCallback((draftId: string) => {
    const draft = heldDrafts.find((item) => item.id === draftId);
    if (!draft) return;
    modal.confirm({
      title: t('transaction.draft.deleteTitle'),
      content: t('transaction.draft.deleteConfirm', { label: draft.label }),
      okText: t('transaction.draft.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => deleteHeldDraft(draftId),
    });
  }, [deleteHeldDraft, heldDrafts, modal, t]);

  useEffect(() => {
    if (!isMobile) return undefined;

    const openCloseCashierModal = () => setCloseModalOpen(true);
    window.addEventListener(OPEN_MOBILE_CASHIER_CLOSE_EVENT, openCloseCashierModal);
    return () => window.removeEventListener(OPEN_MOBILE_CASHIER_CLOSE_EVENT, openCloseCashierModal);
  }, [isMobile]);

  const resetPendingSearchKeySequence = useCallback(() => {
    if (pendingSearchFlushTimeoutRef.current !== null) {
      window.clearTimeout(pendingSearchFlushTimeoutRef.current);
      pendingSearchFlushTimeoutRef.current = null;
    }
    pendingSearchKeySequenceRef.current = null;
  }, []);

  const clearSearch = useCallback(() => {
    resetPendingSearchKeySequence();
    searchTermRef.current = '';
    setSearchTerm('');
    searchInputRef.current?.focus();
  }, [resetPendingSearchKeySequence, setSearchTerm]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  const handleAddProduct = useCallback((product: Product) => {
    // Barang hasil entri cepat selalu berakhir berstok nol setelah terjual, karena
    // yang dicatat hanya jumlah yang dibeli. Tawarkan penambahan stok supaya
    // pembeli berikutnya tidak buntu. Produk master biasa tetap tunduk pada
    // aturan stok habis dan diselesaikan lewat stok opname.
    if (canQuickAddItem && product.stock <= 0 && isProductUnverified(product)) {
      setQuickItemTopUp(product);
      return false;
    }

    const added = addToCart(product);
    if (added) setActiveCartItemId(product.id);
    return added;
  }, [addToCart, canQuickAddItem]);

  const registerQuantityInput = useCallback((productId: string, element: HTMLInputElement | null) => {
    if (element) {
      const nativeElement = (element as HTMLInputElement & { nativeElement?: HTMLElement }).nativeElement;
      const inputElement = nativeElement instanceof HTMLInputElement
        ? nativeElement
        : nativeElement?.querySelector('input') ?? element;
      quantityInputRefs.current.set(productId, inputElement);
      return;
    }

    quantityInputRefs.current.delete(productId);
  }, []);

  useEffect(() => {
    setActiveCartItemId((currentId) => {
      if (currentId && cart.some((item) => item.product.id === currentId)) return currentId;
      return cart[cart.length - 1]?.product.id;
    });
  }, [cart]);

  useEffect(() => {
    if (!activeCartItemId) return;

    const frame = window.requestAnimationFrame(() => {
      const activeElement = Array.from(document.querySelectorAll<HTMLElement>('[data-pos-cart-item-id]'))
        .find((element) => (
          element.dataset.posCartItemId === activeCartItemId
          && element.getClientRects().length > 0
        ));
      activeElement?.scrollIntoView({ block: 'nearest' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeCartItemId]);

  const focusActiveQuantity = useCallback(() => {
    if (!activeCartItemId) {
      message.open({
        key: 'pos-numpad-shortcut',
        type: 'info',
        content: t('transaction.shortcut.emptyCart'),
        duration: 1,
      });
      return;
    }

    const input = quantityInputRefs.current.get(activeCartItemId);
    if (!input) return;

    input.focus();
    input.select();
  }, [activeCartItemId, message, t]);

  const cycleActiveUnit = useCallback((direction: 1 | -1) => {
    const activeItem = cart.find((item) => item.product.id === activeCartItemId);
    if (!activeItem) {
      message.open({
        key: 'pos-numpad-shortcut',
        type: 'info',
        content: t('transaction.shortcut.emptyCart'),
        duration: 1,
      });
      return;
    }

    const productUnits = getProductSellableUnits(activeItem.product);
    if (productUnits.length <= 1) {
      message.open({
        key: 'pos-numpad-shortcut',
        type: 'info',
        content: t('transaction.shortcut.singleUnit', { unit: activeItem.unit }),
        duration: 1,
      });
      return;
    }

    const nextUnit = getAdjacentProductSellableUnit(activeItem.product, activeItem.unit, direction);
    if (!updateUnit(activeItem.product.id, nextUnit)) return;

    message.open({
      key: 'pos-numpad-shortcut',
      type: 'success',
      content: t('transaction.shortcut.unitChanged', { unit: nextUnit }),
      duration: 1,
    });
  }, [activeCartItemId, cart, message, t, updateUnit]);

  const activateAdjacentCartItem = useCallback((direction: 1 | -1) => {
    if (cart.length === 0) {
      message.open({
        key: 'pos-numpad-shortcut',
        type: 'info',
        content: t('transaction.shortcut.emptyCart'),
        duration: 1,
      });
      return;
    }

    const currentIndex = cart.findIndex((item) => item.product.id === activeCartItemId);
    const nextIndex = currentIndex === -1
      ? (direction === 1 ? 0 : cart.length - 1)
      : (currentIndex + direction + cart.length) % cart.length;
    const nextItem = cart[nextIndex];
    if (!nextItem) return;

    // Keep editing quantities hands-free: only chase focus into the next row when
    // the user was already inside the active item's quantity field.
    const activeQuantityInput = activeCartItemId
      ? quantityInputRefs.current.get(activeCartItemId)
      : undefined;
    const wasEditingQuantity = document.activeElement === activeQuantityInput;

    setActiveCartItemId(nextItem.product.id);

    if (wasEditingQuantity) {
      window.requestAnimationFrame(() => {
        const nextInput = quantityInputRefs.current.get(nextItem.product.id);
        nextInput?.focus();
        nextInput?.select();
      });
    }
  }, [activeCartItemId, cart, message, t]);

  const addProductFromSearch = useCallback(async (inputSearchTerm = searchTerm) => {
    const normalizedSearchTerm = normalizeProductSearchTerm(inputSearchTerm);
    if (!normalizedSearchTerm || addFromSearchInFlightRef.current) return;

    addFromSearchInFlightRef.current = true;
    try {
      const exactSkuMatch = findProductByScannedCode(inputSearchTerm);
      const visibleMatchingProduct = filteredProducts.find((product) => (
        matchesProductSearch(product, normalizedSearchTerm)
      ));
      const product = exactSkuMatch
        ?? visibleMatchingProduct
        ?? await findFirstProductBySearchTerm(inputSearchTerm);

      if (!product) {
        if (canQuickAddItem) {
          setQuickItemDraft({ barcode: '', name: inputSearchTerm.trim() });
          return;
        }

        message.open({
          key: 'pos-numpad-shortcut',
          type: 'warning',
          content: t('transaction.shortcut.noSearchResult'),
          duration: 1.5,
        });
        return;
      }

      if (!handleAddProduct(product)) return;
      setSearchTerm('');
      window.requestAnimationFrame(focusSearch);
    } finally {
      addFromSearchInFlightRef.current = false;
    }
  }, [
    canQuickAddItem,
    filteredProducts,
    findProductByScannedCode,
    findFirstProductBySearchTerm,
    focusSearch,
    handleAddProduct,
    message,
    searchTerm,
    setSearchTerm,
    t,
  ]);

  const handleScan = useCallback((text: string) => {
    const match = findProductByScannedCode(text);

    if (match) {
      if (handleAddProduct(match)) {
        searchTermRef.current = '';
        setSearchTerm('');
        message.success(t('transaction.addedToCart', { name: match.name }));
      }
    } else if (canQuickAddItem) {
      setQuickItemDraft({ barcode: text.trim(), name: '' });
    } else {
      message.error(t('transaction.productNotFound', { code: text }));
    }
  }, [canQuickAddItem, findProductByScannedCode, handleAddProduct, message, setSearchTerm, t]);

  const handleQuickItemResolved = useCallback((product: Product) => {
    setQuickItemDraft(null);
    setQuickItemTopUp(null);
    if (!handleAddProduct(product)) return;

    searchTermRef.current = '';
    setSearchTerm('');
    window.requestAnimationFrame(focusSearch);
  }, [focusSearch, handleAddProduct, setSearchTerm]);

  const handleEditCartProduct = useCallback((product: Product) => {
    setEditingCartProduct(product);
  }, []);

  const handleCartProductUpdated = useCallback((product: Product) => {
    // Baris keranjang disegarkan di tempat, bukan ditambahkan lagi.
    updateCartProduct(product);
    setEditingCartProduct(null);
  }, [updateCartProduct]);

  const flushPendingSearchInput = useCallback((restoreFocus: boolean) => {
    const pending = pendingSearchKeySequenceRef.current;
    if (!pending) return searchTermRef.current;

    resetPendingSearchKeySequence();
    const nextSearchTerm = [
      pending.baseValue.slice(0, pending.selectionStart),
      pending.barcodeBuffer.value,
      pending.baseValue.slice(pending.selectionEnd),
    ].join('');
    const nextCaretPosition = pending.selectionStart + pending.barcodeBuffer.value.length;

    searchTermRef.current = nextSearchTerm;
    setSearchTerm(nextSearchTerm);

    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        const input = searchInputRef.current?.input;
        input?.focus();
        input?.setSelectionRange(nextCaretPosition, nextCaretPosition);
      });
    }

    return nextSearchTerm;
  }, [resetPendingSearchKeySequence, setSearchTerm]);

  const schedulePendingSearchInputFlush = useCallback(() => {
    if (pendingSearchFlushTimeoutRef.current !== null) {
      window.clearTimeout(pendingSearchFlushTimeoutRef.current);
    }

    pendingSearchFlushTimeoutRef.current = window.setTimeout(() => {
      pendingSearchFlushTimeoutRef.current = null;
      flushPendingSearchInput(true);
    }, SEARCH_INPUT_MANUAL_FLUSH_DELAY_MS);
  }, [flushPendingSearchInput]);

  const handleSearchKeyDownCapture = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (
      event.nativeEvent.isComposing
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || event.repeat
    ) return;

    const keyAt = event.timeStamp;
    const pending = pendingSearchKeySequenceRef.current;
    const isModifierKey = event.key === 'Shift'
      || event.key === 'Control'
      || event.key === 'Alt'
      || event.key === 'AltGraph'
      || event.key === 'CapsLock';
    if (isModifierKey) return;

    const isTerminator = event.code === 'Enter'
      || event.code === 'NumpadEnter'
      || event.key === 'Tab';

    if (isTerminator) {
      const scannedCode = finishKeyboardBarcodeScan(
        pending?.barcodeBuffer ?? null,
        keyAt,
        KEYBOARD_BARCODE_MIN_LENGTH,
        SEARCH_INPUT_SCANNER_MAX_INTERVAL_MS,
      );

      if (scannedCode) {
        event.preventDefault();
        event.stopPropagation();
        resetPendingSearchKeySequence();
        handleScan(scannedCode);
        return;
      }

      if (pending && (event.code === 'Enter' || event.code === 'NumpadEnter')) {
        event.preventDefault();
        event.stopPropagation();
        const nextSearchTerm = flushPendingSearchInput(false);
        void addProductFromSearch(nextSearchTerm);
        return;
      }

      if (pending) flushPendingSearchInput(false);
      return;
    }

    if (event.key === 'Escape' && pending) {
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
      return;
    }

    if (event.key === 'Backspace' && pending) {
      event.preventDefault();
      event.stopPropagation();
      const nextBufferedValue = pending.barcodeBuffer.value.slice(0, -1);

      if (!nextBufferedValue) {
        resetPendingSearchKeySequence();
        return;
      }

      pending.barcodeBuffer = {
        value: nextBufferedValue,
        lastKeyAt: keyAt,
      };
      schedulePendingSearchInputFlush();
      return;
    }

    // Num*/Num+/Num- (dan padanan tanpa numpad fisik '*'/'+'/'-' saat kotak
    // cari masih kosong) harus lolos ke handler global di bawah, bukan
    // tertelan jadi teks pencarian di sini. Tanpa pengecualian ini,
    // stopPropagation di akhir fungsi membungkam shortcut edit qty/ganti
    // satuan setiap kali fokus masih ada di kotak cari (kondisi paling umum
    // sesudah menambah produk).
    const isEditShortcutKey = event.code === 'NumpadMultiply'
      || event.code === 'NumpadAdd'
      || event.code === 'NumpadSubtract'
      || (
        (event.key === '*' || event.key === '+' || event.key === '-')
        && !pending
        && !searchTermRef.current
      );

    if (isEditShortcutKey) {
      if (pending) flushPendingSearchInput(false);
      return;
    }

    if (event.key.length !== 1) {
      if (pending) flushPendingSearchInput(false);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const input = event.currentTarget;
    const isActiveSequence = isKeyboardBarcodeBufferActive(
      pending?.barcodeBuffer ?? null,
      keyAt,
      SEARCH_INPUT_SCANNER_MAX_INTERVAL_MS,
    );

    if (!pending || !isActiveSequence) {
      resetPendingSearchKeySequence();
      pendingSearchKeySequenceRef.current = {
        barcodeBuffer: appendKeyboardBarcodeCharacter(
          null,
          event.key,
          keyAt,
          SEARCH_INPUT_SCANNER_MAX_INTERVAL_MS,
        ),
        baseValue: searchTermRef.current,
        selectionStart: input.selectionStart ?? searchTermRef.current.length,
        selectionEnd: input.selectionEnd ?? searchTermRef.current.length,
      };
    } else {
      pending.barcodeBuffer = appendKeyboardBarcodeCharacter(
        pending.barcodeBuffer,
        event.key,
        keyAt,
        SEARCH_INPUT_SCANNER_MAX_INTERVAL_MS,
      );
    }

    schedulePendingSearchInputFlush();
  }, [
    addProductFromSearch,
    clearSearch,
    flushPendingSearchInput,
    handleScan,
    resetPendingSearchKeySequence,
    schedulePendingSearchInputFlush,
  ]);

  useEffect(() => resetPendingSearchKeySequence, [resetPendingSearchKeySequence]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || event.repeat
        || scannerOpen
        || closeModalOpen
        || cartOpen
        || hasVisiblePosShortcutBlocker()
      ) {
        keyboardScannerBufferRef.current = null;
        return;
      }

      const target = event.target;
      const searchInput = searchInputRef.current?.input;
      const activeQuantityInput = activeCartItemId
        ? quantityInputRefs.current.get(activeCartItemId)
        : undefined;
      const isSearchTarget = target === searchInput;
      const isActiveQuantityTarget = target === activeQuantityInput;
      const isUnrelatedTypingTarget = isTypingTarget(target) && !isSearchTarget && !isActiveQuantityTarget;
      const isScannerCaptureTarget = !isTypingTarget(target);
      const isScannerTerminator = event.code === 'Enter'
        || event.code === 'NumpadEnter'
        || event.key === 'Tab';

      if (isScannerCaptureTarget && isScannerTerminator) {
        const scannedCode = finishKeyboardBarcodeScan(
          keyboardScannerBufferRef.current,
          event.timeStamp,
        );
        keyboardScannerBufferRef.current = null;

        if (scannedCode) {
          event.preventDefault();
          void handleScan(scannedCode);
          window.requestAnimationFrame(focusSearch);
          return;
        }
      }

      const isModifierKey = event.key === 'Shift'
        || event.key === 'Control'
        || event.key === 'Alt'
        || event.key === 'AltGraph'
        || event.key === 'CapsLock';
      const hasActiveScannerSequence = isKeyboardBarcodeBufferActive(
        keyboardScannerBufferRef.current,
        event.timeStamp,
      );
      const isShortcutStart = !hasActiveScannerSequence && (
        event.key === '/'
        || event.code === 'NumpadDivide'
        || event.code === 'NumpadMultiply'
        || event.code === 'NumpadAdd'
        || event.code === 'NumpadSubtract'
        || ((event.key === '*' || event.key === '+' || event.key === '-') && !searchTerm)
      );

      if (isScannerCaptureTarget && event.key.length === 1 && !isShortcutStart) {
        keyboardScannerBufferRef.current = appendKeyboardBarcodeCharacter(
          keyboardScannerBufferRef.current,
          event.key,
          event.timeStamp,
        );
        event.preventDefault();
        return;
      }

      if (!isModifierKey) keyboardScannerBufferRef.current = null;

      if (event.code === 'NumpadDivide') {
        if (isUnrelatedTypingTarget) return;
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === '/' && !isTypingTarget(event.target)) {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === 'Escape' && searchTerm) {
        event.preventDefault();
        clearSearch();
        return;
      }

      if ((event.code === 'Enter' || event.code === 'NumpadEnter') && isSearchTarget) {
        if (!searchTerm.trim()) return;
        event.preventDefault();
        void addProductFromSearch();
        return;
      }

      // Banyak laptop/keyboard kasir ringkas tidak punya numpad fisik sama
      // sekali, jadi '*'/'+'/'-' polos juga diterima sebagai shortcut — tapi
      // HANYA saat kotak cari kosong, supaya SKU berstrip (mis. "POS-BOX")
      // tetap bisa diketik apa adanya begitu pencarian sudah berisi teks.
      const isCharacterEditShortcutSafe = !searchTerm;

      if (event.code === 'NumpadMultiply' || (event.key === '*' && isCharacterEditShortcutSafe)) {
        if (isUnrelatedTypingTarget) return;
        event.preventDefault();
        focusActiveQuantity();
        return;
      }

      if (
        event.code === 'NumpadAdd'
        || event.code === 'NumpadSubtract'
        || ((event.key === '+' || event.key === '-') && isCharacterEditShortcutSafe)
      ) {
        if (isUnrelatedTypingTarget) return;
        event.preventDefault();
        cycleActiveUnit((event.code === 'NumpadAdd' || event.key === '+') ? 1 : -1);
        return;
      }

      if ((event.code === 'Enter' || event.code === 'NumpadEnter') && isActiveQuantityTarget) {
        event.preventDefault();
        activeQuantityInput?.blur();
        focusSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeCartItemId,
    addProductFromSearch,
    cartOpen,
    clearSearch,
    closeModalOpen,
    cycleActiveUnit,
    focusActiveQuantity,
    focusSearch,
    handleScan,
    scannerOpen,
    searchTerm,
  ]);

  // F-keys and mod-combos never collide with the raw barcode-scanner listener above
  // (it only intercepts single printable characters), and react-hotkeys-hook's
  // `preventDefault: true` marks the event as defaultPrevented before that listener's
  // handler runs, so it short-circuits there instead of double-handling the key.
  const isPosHotkeyBlocked = useCallback(() => (
    scannerOpen || closeModalOpen || cartOpen || hasVisiblePosShortcutBlocker()
  ), [cartOpen, closeModalOpen, scannerOpen]);

  const handleOpenPaymentHotkey = useCallback(() => {
    if (cart.length === 0) {
      message.open({
        key: 'pos-numpad-shortcut',
        type: 'info',
        content: t('transaction.shortcut.emptyCart'),
        duration: 1,
      });
      return;
    }

    setShowPayment(true);
  }, [cart.length, message, setShowPayment, t]);

  useHotkeys('f2', handleOpenPaymentHotkey, {
    enableOnFormTags: true,
    preventDefault: true,
    ignoreEventWhen: () => showPayment || isPosHotkeyBlocked(),
  }, [handleOpenPaymentHotkey, isPosHotkeyBlocked, showPayment]);

  const handleOpenScannerHotkey = useCallback(() => setScannerOpen(true), []);

  // F7, not F3: F3 triggers macOS Mission Control at the OS level (unpreventable
  // from JS), and this app also ships as a native Tauri build for macOS.
  useHotkeys('f7', handleOpenScannerHotkey, {
    enableOnFormTags: true,
    preventDefault: true,
    ignoreEventWhen: () => showPayment || isPosHotkeyBlocked(),
  }, [handleOpenScannerHotkey, isPosHotkeyBlocked, showPayment]);

  const handleClearCartHotkey = useCallback(() => {
    if (cart.length === 0) return;

    modal.confirm({
      title: t('transaction.shortcut.clearCartConfirmTitle'),
      content: t('transaction.shortcut.clearCartConfirmContent'),
      okText: t('cart.clear'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => {
        clearCart();
        window.requestAnimationFrame(focusSearch);
      },
    });
  }, [cart.length, clearCart, focusSearch, modal, t]);

  useHotkeys('f4', handleClearCartHotkey, {
    enableOnFormTags: true,
    preventDefault: true,
    ignoreEventWhen: () => showPayment || isPosHotkeyBlocked(),
  }, [handleClearCartHotkey, isPosHotkeyBlocked, showPayment]);

  useHotkeys('f6', openHoldModal, {
    enableOnFormTags: true,
    preventDefault: true,
    ignoreEventWhen: () => showPayment || isPosHotkeyBlocked(),
  }, [isPosHotkeyBlocked, openHoldModal, showPayment]);

  useHotkeys('shift+f6', () => setDraftListOpen(true), {
    enableOnFormTags: true,
    preventDefault: true,
    ignoreEventWhen: () => showPayment || isPosHotkeyBlocked(),
  }, [isPosHotkeyBlocked, showPayment]);

  // PageUp/PageDown, not Arrow Up/Down: the active item's quantity field is an
  // antd InputNumber, which already steps its value on Arrow Up/Down.
  useHotkeys('pagedown', () => activateAdjacentCartItem(1), {
    enableOnFormTags: true,
    preventDefault: true,
    ignoreEventWhen: () => showPayment || isPosHotkeyBlocked(),
  }, [activateAdjacentCartItem, isPosHotkeyBlocked, showPayment]);

  useHotkeys('pageup', () => activateAdjacentCartItem(-1), {
    enableOnFormTags: true,
    preventDefault: true,
    ignoreEventWhen: () => showPayment || isPosHotkeyBlocked(),
  }, [activateAdjacentCartItem, isPosHotkeyBlocked, showPayment]);

  const handleRemoveActiveCartItemHotkey = useCallback(() => {
    if (!activeCartItemId) {
      message.open({
        key: 'pos-numpad-shortcut',
        type: 'info',
        content: t('transaction.shortcut.emptyCart'),
        duration: 1,
      });
      return;
    }

    const removedItem = cart.find((item) => item.product.id === activeCartItemId);
    if (!removedItem) return;

    removeFromCart(activeCartItemId);
    message.open({
      key: 'pos-numpad-shortcut',
      type: 'success',
      content: t('transaction.shortcut.itemRemoved', { name: removedItem.product.name }),
      duration: 1,
    });
  }, [activeCartItemId, cart, message, removeFromCart, t]);

  // Sengaja TANPA enableOnFormTags: React-hotkeys-hook lalu otomatis diam saat
  // fokus ada di input/textarea (mis. kolom qty atau kotak cari), sehingga
  // Delete tetap berfungsi normal untuk menghapus karakter di sana. Shortcut
  // ini hanya aktif saat baris keranjang aktif dipilih tanpa fokus di field
  // manapun (lih. PageUp/PageDown yang bisa mengaktifkan baris tanpa masuk ke
  // input). Untuk menghapus item aktif SAAT fokus ada di kolom qty, kosongkan
  // nilainya ke 0 lalu Enter — updateQuantity sudah menganggap qty < 1 sebagai
  // hapus (lihat transactionStore.ts).
  useHotkeys('delete', handleRemoveActiveCartItemHotkey, {
    preventDefault: true,
    ignoreEventWhen: () => showPayment || isPosHotkeyBlocked(),
  }, [handleRemoveActiveCartItemHotkey, isPosHotkeyBlocked, showPayment]);

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

    if (cart.length > 0 || heldDrafts.length > 0) {
      modal.warning({
        title: t('transaction.draft.closeBlockedTitle'),
        content: t('transaction.draft.closeBlocked'),
      });
      return;
    }

    closeForm.resetFields();
    closeForm.setFieldsValue({ closing_cash_amount: 0 });
    setCloseModalOpen(true);
    const nextReconciliation = await calculateReconciliation(activeSession.id, 0);
    setReconciliation(nextReconciliation);
  }, [activeSession, calculateReconciliation, cart.length, closeForm, heldDrafts.length, modal, t]);

  const handleCloseSession = async (values: CloseCashierFormValues) => {
    if (!activeSession) return;
    if (cart.length > 0 || heldDrafts.length > 0) {
      modal.warning({
        title: t('transaction.draft.closeBlockedTitle'),
        content: t('transaction.draft.closeBlocked'),
      });
      return;
    }

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50/60 p-2 sm:p-3 min-[1024px]:px-3 min-[1024px]:pb-3 min-[1024px]:pt-0">
      {!isMobile && (
        <CashierSessionStatusBar session={activeSession} onClose={openCloseModal} isClosing={isClosingSession} />
      )}

      <div className="mb-2 flex shrink-0 items-center justify-end gap-2">
        <Button
          icon={<Archive size={15} />}
          disabled={cart.length === 0}
          onClick={openHoldModal}
          title={`${t('transaction.shortcut.holdDraft')} · F6`}
        >
          {t('transaction.draft.hold')}
        </Button>
        <Button
          icon={<FileClock size={15} />}
          onClick={() => setDraftListOpen(true)}
          title={`${t('transaction.shortcut.openDrafts')} · Shift+F6`}
        >
          {t('transaction.draft.list')} ({heldDrafts.length})
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div id="product-list" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className={`sticky top-0 z-20 mb-2 shrink-0 border border-blue-100 bg-white shadow-sm ${isMobile ? 'rounded-xl p-2' : 'rounded-2xl p-3'}`}>
            {isMobile ? (
              <>
                <div className="flex items-stretch gap-2">
                  <Input
                    ref={searchInputRef}
                    size="large"
                    data-tour="transaction-search"
                    allowClear={false}
                    prefix={<SearchOutlined className="text-gray-400" />}
                    placeholder={t('transaction.searchPlaceholder')}
                    value={searchTerm}
                    onKeyDownCapture={handleSearchKeyDownCapture}
                    onChange={(event) => {
                      resetPendingSearchKeySequence();
                      searchTermRef.current = event.target.value;
                      setSearchTerm(event.target.value);
                    }}
                    className="min-w-0 flex-1 rounded-xl"
                  />
                  <Dropdown
                    trigger={['click']}
                    placement="bottomRight"
                    menu={{
                      items: [
                        {
                          key: 'scan',
                          icon: <ScanLine size={17} />,
                          label: t('transaction.scanBarcode'),
                          onClick: () => setScannerOpen(true),
                        },
                        {
                          key: 'reset',
                          icon: <RotateCcw size={17} />,
                          label: t('transaction.reset'),
                          disabled: !searchTerm,
                          onClick: clearSearch,
                        },
                      ],
                    }}
                  >
                    <Button
                      htmlType="button"
                      size="large"
                      icon={<SlidersHorizontal size={19} />}
                      aria-label={t('transaction.searchActions')}
                      title={t('transaction.searchActions')}
                      className="!h-auto !w-12 shrink-0 !rounded-xl"
                    />
                  </Dropdown>
                </div>

                <nav
                  aria-label={t('transaction.categoryNavigation')}
                  className="mobile-horizontal-scroll mt-2 flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedProductCategory(undefined)}
                    aria-pressed={!selectedProductCategory}
                    className={`min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-bold transition-colors ${
                      !selectedProductCategory
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {t('transaction.allCategories')}
                  </button>
                  {availableProductCategories.map((category) => {
                    const active = selectedProductCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedProductCategory(category)}
                        aria-pressed={active}
                        className={`min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-bold transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {getProductCategoryLabel(category, t)}
                      </button>
                    );
                  })}
                </nav>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input
                ref={searchInputRef}
                size="large"
                data-tour="transaction-search"
                allowClear={false}
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder={t('transaction.searchPlaceholder')}
                value={searchTerm}
                onKeyDownCapture={handleSearchKeyDownCapture}
                onChange={(event) => {
                  resetPendingSearchKeySequence();
                  searchTermRef.current = event.target.value;
                  setSearchTerm(event.target.value);
                }}
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
            )}

            {!isMobile && <PosHotkeysInfo />}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <ProductList
              products={filteredProducts}
              cart={cart}
              addToCart={handleAddProduct}
              updateQuantity={updateQuantity}
              pagination={productPagination}
              isMobile={isMobile}
              hasMobileCart={isMobile && totalItems > 0}
            />
          </div>
        </div>

        <CartSidebar
          cart={cart}
          updateQuantity={updateQuantity}
          updateUnit={updateUnit}
          removeFromCart={removeFromCart}
          onEditProduct={(item) => handleEditCartProduct(item.product)}
          activeCartItemId={activeCartItemId}
          onActivateCartItem={setActiveCartItemId}
          registerQuantityInput={registerQuantityInput}
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
          handleRecordExpense={handleRecordExpense}
          onCheckoutSuccess={() => {
            setCartOpen(false);
            window.requestAnimationFrame(focusSearch);
          }}
        />
      </div>

      {/* Mobile: floating cart button. Tablet: inline footer below the product panel. */}
      {totalItems > 0 && (
        <div
          className={isMobile
            ? 'fixed left-4 right-4 z-30'
            : 'fixed bottom-4 left-4 right-4 z-30 min-[1024px]:static min-[1024px]:mt-2 min-[1024px]:shrink-0 lg:hidden'}
          style={isMobile ? {
            bottom: 'calc(4rem + max(var(--app-safe-area-inset-bottom), 0.5rem) + 0.75rem)',
          } : undefined}
        >
          <button
            onClick={() => setCartOpen(true)}
            data-tour="transaction-mobile-cart"
            data-pos-cart-target
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
        onEditProduct={(item) => handleEditCartProduct(item.product)}
        activeCartItemId={activeCartItemId}
        onActivateCartItem={setActiveCartItemId}
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
        handleRecordExpense={handleRecordExpense}
      />

      {scannerOpen && (
        <ScannerModal
          onClose={() => setScannerOpen(false)}
          onScan={handleScan}
        />
      )}

      <PosQuickItemModal
        open={Boolean(quickItemDraft) || Boolean(quickItemTopUp) || Boolean(editingCartProduct)}
        initialBarcode={quickItemDraft?.barcode}
        initialName={quickItemDraft?.name}
        topUpProduct={quickItemTopUp}
        editProduct={editingCartProduct}
        onCancel={() => {
          setQuickItemDraft(null);
          setQuickItemTopUp(null);
          setEditingCartProduct(null);
        }}
        onResolved={handleQuickItemResolved}
        onEditResolved={handleCartProductUpdated}
      />

      <Modal
        title={t('transaction.draft.holdTitle')}
        open={holdModalOpen}
        okText={t('transaction.draft.hold')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !draftLabel.trim() }}
        onOk={handleHoldDraft}
        onCancel={() => setHoldModalOpen(false)}
        destroyOnHidden
      >
        <p className="mb-3 text-sm text-slate-500">{t('transaction.draft.holdHint')}</p>
        <Input
          autoFocus
          maxLength={80}
          value={draftLabel}
          placeholder={t('transaction.draft.labelPlaceholder')}
          onChange={(event) => setDraftLabel(event.target.value)}
          onPressEnter={handleHoldDraft}
        />
      </Modal>

      <Modal
        title={`${t('transaction.draft.list')} (${heldDrafts.length})`}
        open={draftListOpen}
        footer={null}
        onCancel={() => setDraftListOpen(false)}
        destroyOnHidden
      >
        {heldDrafts.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">{t('transaction.draft.empty')}</div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {heldDrafts.map((draft) => {
              const itemCount = draft.snapshot.cart.reduce((sum, item) => sum + item.quantity, 0);
              const subtotal = draft.snapshot.cart.reduce(
                (sum, item) => sum + getCartItemPrice(item) * item.quantity,
                0,
              );
              return (
                <div key={draft.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => handleResumeDraft(draft.id)}>
                    <p className="truncate font-bold text-slate-800">{draft.label}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {t('transaction.draft.summary', { count: itemCount, total: formatCurrency(subtotal) })}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.createdAt))}
                    </p>
                  </button>
                  <Button type="primary" size="small" onClick={() => handleResumeDraft(draft.id)}>
                    {t('transaction.draft.resume')}
                  </Button>
                  <Button danger type="text" size="small" aria-label={t('transaction.draft.delete')} icon={<Trash2 size={15} />} onClick={() => handleDeleteDraft(draft.id)} />
                </div>
              );
            })}
          </div>
        )}
      </Modal>

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

          {reconciliation && reconciliation.stock_discrepancy_case_count > 0 && (
            <Alert
              className="mt-4"
              type={reconciliation.stock_discrepancy_pending_review_count > 0 ? 'warning' : 'info'}
              showIcon
              message={`${reconciliation.stock_discrepancy_case_count} kasus selisih stok pada shift ini`}
              description={(
                <div>
                  <div>
                    {reconciliation.stock_discrepancy_pending_review_count} belum direview;
                    {' '}{reconciliation.stock_discrepancy_shortage_quantity} unit stok disesuaikan.
                  </div>
                  <div>{reconciliation.stock_discrepancy_products.join(', ')}</div>
                </div>
              )}
            />
          )}

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
