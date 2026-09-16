import { Minus, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { CartItem as CartItemType } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getCartItemOriginalPrice, getCartItemPrice } from '@/utils/pricing';
import { getProductSellableUnits } from '@/utils/productUnits';
import { InputNumber, Select } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import {
  appendKeyboardBarcodeCharacter,
  finishKeyboardBarcodeScan,
  isLikelyBarcodeWhileEditingQuantity,
  type KeyboardBarcodeBuffer,
} from '@/utils/keyboardBarcodeScanner';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

const QUANTITY_COMMIT_DELAY_MS = 150;
const QUANTITY_SCANNER_MAX_INTERVAL_MS = 80;

interface QuantityDraftState {
  baseQuantity: number;
  value: number | null;
}

interface CartItemProps {
  item: CartItemType;
  updateQuantity: (id: string, quantity: number) => boolean;
  updateUnit: (id: string, unit: string) => boolean;
  removeFromCart: (id: string) => void;
  onEditProduct?: (item: CartItemType) => void;
  isActive?: boolean;
  onActivate?: () => void;
  quantityInputRef?: (element: HTMLInputElement | null) => void;
  onBarcodeScan?: (barcode: string) => void;
  onQuantityEditingComplete?: () => void;
  /**
   * CartSidebar (desktop) dan MobileCartDrawer masing-masing selalu ingin
   * satu varian saja. Dulu kedua varian dirender sekaligus dan cuma
   * disembunyikan lewat kelas Tailwind responsif, sehingga callback ref yang
   * sama terpanggil dua kali per baris dan bisa menunjuk ke input yang
   * sedang display:none — shortcut keyboard (Num *) jadi gagal fokus diam-
   * diam. Merender hanya satu varian menghilangkan kelas bug ini sekaligus.
   */
  variant?: 'desktop' | 'mobile';
}

export default function CartItem({
  item,
  updateQuantity,
  updateUnit,
  removeFromCart,
  onEditProduct,
  isActive = false,
  onActivate,
  quantityInputRef,
  onBarcodeScan,
  onQuantityEditingComplete,
  variant = 'desktop',
}: CartItemProps) {
  const { t } = useI18n();
  const currentPrice = getCartItemPrice(item);
  const isWholesale = currentPrice < getCartItemOriginalPrice({ ...item, quantity: 1 });
  const quantityStep = ['gram', 'menit'].includes(item.unit.toLowerCase()) ? 10 : 1;
  const [quantityDraftState, setQuantityDraftState] = useState<QuantityDraftState>({
    baseQuantity: item.quantity,
    value: item.quantity,
  });
  const quantityDraft = quantityDraftState.baseQuantity === item.quantity
    ? quantityDraftState.value
    : item.quantity;
  const quantityCommitTimeoutRef = useRef<number | null>(null);
  const quantityScannerBufferRef = useRef<KeyboardBarcodeBuffer | null>(null);
  const skipNextQuantityBlurCommitRef = useRef(false);

  // Satuan utama produk plus setiap satuan yang punya konversi
  const productUnits = getProductSellableUnits(item.product);

  const clearPendingQuantityCommit = useCallback(() => {
    if (quantityCommitTimeoutRef.current === null) return;
    window.clearTimeout(quantityCommitTimeoutRef.current);
    quantityCommitTimeoutRef.current = null;
  }, []);

  const setQuantityDraft = useCallback((value: number | null) => {
    setQuantityDraftState({ baseQuantity: item.quantity, value });
  }, [item.quantity]);

  const commitQuantity = useCallback((value: number | null) => {
    clearPendingQuantityCommit();
    if (value === null) {
      setQuantityDraft(item.quantity);
      return;
    }

    const updated = updateQuantity(item.product.id, value);
    if (!updated) {
      setQuantityDraft(item.quantity);
    }
  }, [clearPendingQuantityCommit, item.product.id, item.quantity, setQuantityDraft, updateQuantity]);

  const handleQuantityChange = (value: number | null) => {
    setQuantityDraft(value);
    clearPendingQuantityCommit();

    if (value !== null) {
      quantityCommitTimeoutRef.current = window.setTimeout(() => {
        quantityCommitTimeoutRef.current = null;
        commitQuantity(value);
      }, QUANTITY_COMMIT_DELAY_MS);
    }
  };

  const handleQuantityBlur = () => {
    quantityScannerBufferRef.current = null;
    if (skipNextQuantityBlurCommitRef.current) {
      skipNextQuantityBlurCommitRef.current = false;
      clearPendingQuantityCommit();
      setQuantityDraft(item.quantity);
      return;
    }

    commitQuantity(quantityDraft);
  };

  const handleQuantityKeyDownCapture = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (
      event.nativeEvent.isComposing
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || event.repeat
    ) {
      quantityScannerBufferRef.current = null;
      return;
    }

    const isTerminator = event.code === 'Enter'
      || event.code === 'NumpadEnter'
      || event.key === 'Tab';

    if (isTerminator) {
      const scanCandidate = finishKeyboardBarcodeScan(
        quantityScannerBufferRef.current,
        event.timeStamp,
        undefined,
        QUANTITY_SCANNER_MAX_INTERVAL_MS,
      );
      quantityScannerBufferRef.current = null;

      if (
        scanCandidate
        && onBarcodeScan
        && isLikelyBarcodeWhileEditingQuantity(scanCandidate)
      ) {
        event.preventDefault();
        event.stopPropagation();
        clearPendingQuantityCommit();
        skipNextQuantityBlurCommitRef.current = true;
        setQuantityDraft(item.quantity);
        event.currentTarget.blur();
        onBarcodeScan(scanCandidate);
        return;
      }

      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        event.stopPropagation();
        commitQuantity(quantityDraft);
        skipNextQuantityBlurCommitRef.current = true;
        event.currentTarget.blur();
        onQuantityEditingComplete?.();
      }
      return;
    }

    const isModifierKey = event.key === 'Shift'
      || event.key === 'Control'
      || event.key === 'Alt'
      || event.key === 'AltGraph'
      || event.key === 'CapsLock';
    if (isModifierKey) return;

    if (event.key === 'Backspace' || event.key === 'Delete' || event.key.length !== 1) {
      quantityScannerBufferRef.current = null;
      return;
    }

    quantityScannerBufferRef.current = appendKeyboardBarcodeCharacter(
      quantityScannerBufferRef.current,
      event.key,
      event.timeStamp,
      QUANTITY_SCANNER_MAX_INTERVAL_MS,
    );

    // Setelah rangkaian cepat mulai terlihat seperti scanner, cegah shortcut
    // global '+'/'-' ikut mengganti satuan. Default input tetap dibiarkan agar
    // ketikan qty manual tidak terasa ditahan.
    if (quantityScannerBufferRef.current.value.length >= 3) {
      event.stopPropagation();
    }
  };

  useEffect(() => {
    clearPendingQuantityCommit();
  }, [clearPendingQuantityCommit, item.quantity]);

  useEffect(() => () => clearPendingQuantityCommit(), [clearPendingQuantityCommit]);

  const handleUnitChange = (newUnit: string) => {
    updateUnit(item.product.id, newUnit);
  };

  const unitOptions = productUnits.map((unit) => ({
    value: unit,
    label: unit,
  }));

  if (variant === 'desktop') {
    return (
      <article
        data-pos-cart-item-id={item.product.id}
        data-pos-active={isActive ? 'true' : 'false'}
        onClick={onActivate}
        className={`rounded-xl border bg-blue-50/40 p-2.5 ${
          isActive
            ? 'border-blue-500 shadow-md shadow-blue-100 ring-2 ring-blue-200'
            : 'border-blue-100'
        }`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1" title={item.product.name}>
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-bold leading-5 text-slate-800">{item.product.name}</p>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Rp {formatCurrency(currentPrice)} / {item.unit}
              </p>
              {isWholesale && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{t('product.wholesale')}</span>
              )}
            </div>
          </div>

          {onEditProduct && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEditProduct(item);
              }}
              className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
              title={t('cart.editProduct')}
            >
              <Pencil size={14} />
            </button>
          )}

          <Select
            data-testid={`pos-cart-unit-${item.product.id}`}
            value={item.unit}
            onChange={handleUnitChange}
            className="h-8 w-28 shrink-0"
            size="small"
            options={unitOptions}
          />

          <div className="flex h-8 w-[88px] shrink-0 items-center overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => updateQuantity(item.product.id, item.quantity - quantityStep)}
              className="grid h-full w-6 shrink-0 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
              title={t('cart.decrease')}
            >
              <Minus size={13} strokeWidth={2.5} />
            </button>

            <InputNumber
              ref={quantityInputRef}
              data-testid={`pos-cart-quantity-${item.product.id}`}
              inputMode='decimal'
              min={0}
              value={quantityDraft}
              onChange={handleQuantityChange}
              onFocus={() => { quantityScannerBufferRef.current = null; }}
              onBlur={handleQuantityBlur}
              onKeyDownCapture={handleQuantityKeyDownCapture}
              className="h-full min-w-0 flex-1 [&_.ant-input-number-input-wrap]:!h-full [&_.ant-input-number-input]:!h-full [&_.ant-input-number-input]:!p-0 [&_.ant-input-number-input]:!text-center [&_.ant-input-number-input]:!text-xs [&_.ant-input-number-input]:!font-bold [&_.ant-input-number-input]:!leading-[30px]"
              size="small"
              controls={false}
              variant="borderless"
            />

            <button
              type="button"
              onClick={() => updateQuantity(item.product.id, item.quantity + quantityStep)}
              className="grid h-full w-6 shrink-0 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
              title={t('cart.increase')}
            >
              <Plus size={13} strokeWidth={2.5} />
            </button>
          </div>

          <strong className="w-[76px] shrink-0 truncate text-right text-xs font-black tabular-nums text-slate-900" title={`Rp ${formatCurrency(currentPrice * item.quantity)}`}>
            Rp {formatCurrency(currentPrice * item.quantity)}
          </strong>

          <button
            type="button"
            onClick={() => removeFromCart(item.product.id)}
            className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title={t('cart.remove')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </article>
    );
  }

  return (
      <article
        data-testid={`pos-cart-item-${item.product.id}`}
        data-pos-cart-item-id={item.product.id}
        data-pos-active={isActive ? 'true' : 'false'}
        onClick={onActivate}
        className={`rounded-2xl border bg-blue-50/40 p-3 ${
          isActive
            ? 'border-blue-500 shadow-md shadow-blue-100 ring-2 ring-blue-200'
            : 'border-blue-100'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-blue-100">
            <Package size={19} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5">
              <p className="line-clamp-2 min-w-0 flex-1 text-sm font-bold leading-5 text-slate-800">{item.product.name}</p>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Rp {formatCurrency(currentPrice)} / {item.unit}
              </p>
              {isWholesale && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{t('product.wholesale')}</span>
              )}
            </div>
          </div>
          {onEditProduct && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEditProduct(item);
              }}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
              title={t('cart.editProduct')}
            >
              <Pencil size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => removeFromCart(item.product.id)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title={t('cart.remove')}
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div className="mt-3 border-t border-blue-100 pt-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Select
              data-testid={`pos-cart-unit-${item.product.id}`}
              value={item.unit}
              onChange={handleUnitChange}
              className="h-9 w-full min-w-0"
              size="middle"
              options={unitOptions}
            />

            <div className="flex h-9 min-w-0 items-center overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => updateQuantity(item.product.id, item.quantity - quantityStep)}
                className="grid h-full w-8 shrink-0 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
                title={t('cart.decrease')}
              >
                <Minus size={15} strokeWidth={2.5} />
              </button>

              <InputNumber
                ref={quantityInputRef}
                data-testid={`pos-cart-quantity-${item.product.id}`}
                inputMode='decimal'
                min={0}
                value={quantityDraft}
                onChange={handleQuantityChange}
                onFocus={() => { quantityScannerBufferRef.current = null; }}
                onBlur={handleQuantityBlur}
                onKeyDownCapture={handleQuantityKeyDownCapture}
                className="h-full min-w-0 flex-1 [&_.ant-input-number-input-wrap]:!h-full [&_.ant-input-number-input]:!h-full [&_.ant-input-number-input]:!p-0 [&_.ant-input-number-input]:!text-center [&_.ant-input-number-input]:!font-bold [&_.ant-input-number-input]:!leading-[34px]"
                size="small"
                controls={false}
                variant="borderless"
              />

              <button
                type="button"
                onClick={() => updateQuantity(item.product.id, item.quantity + quantityStep)}
                className="grid h-full w-8 shrink-0 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
                title={t('cart.increase')}
              >
                <Plus size={15} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('cart.total')}</span>
            <strong className="text-sm font-black tabular-nums text-slate-900">Rp {formatCurrency(currentPrice * item.quantity)}</strong>
          </div>
        </div>
      </article>
  );
}
