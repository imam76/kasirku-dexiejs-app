import type { AccountType, PromoType, Tax, TaxCalculationMode, TaxFlow } from '@/types';

export interface DocumentLineItemLike {
  quantity: number;
  price?: number;
  discount_type?: PromoType;
  discount_value?: number;
  discount_amount?: number;
  tax_id?: string;
  tax_name?: string;
  tax_code?: string;
  tax_rate?: number;
  tax_calculation_mode?: TaxCalculationMode;
  tax_flow?: TaxFlow;
  tax_account_id?: string;
  tax_account_code?: string;
  tax_account_name?: string;
  tax_account_type?: AccountType;
  tax_base_amount?: number;
  tax_amount?: number;
  subtotal?: number;
  total_amount?: number;
}

export interface DocumentTotalBehaviorConfig {
  behavior: {
    hasPricing: boolean;
    hasTax: boolean;
  };
}

export interface DocumentTotalInput<TItem extends DocumentLineItemLike> {
  items: TItem[];
  discountType?: PromoType;
  discountValue?: number;
  discountAmount?: number;
  taxRate?: number;
  taxCalculationMode?: TaxCalculationMode;
  taxId?: string;
  taxName?: string;
  taxCode?: string;
  taxFlow?: TaxFlow;
  taxAccountId?: string;
  taxAccountCode?: string;
  taxAccountName?: string;
  taxAccountType?: AccountType;
  taxAccountContext?: 'sales' | 'purchase';
  taxes?: Tax[];
  config: DocumentTotalBehaviorConfig;
}

export interface DocumentTotalResult<TItem extends DocumentLineItemLike> {
  items: TItem[];
  subtotal_amount?: number;
  discount_type?: PromoType;
  discount_value?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizeMoney = (value: number) => roundCurrency(Math.max(0, Number(value || 0)));

const getLineDiscountAmount = (item: DocumentLineItemLike, lineBase: number) => {
  const discountType = item.discount_type ?? 'fixed';
  const discountValue = normalizeMoney(Number(item.discount_value ?? item.discount_amount ?? 0));

  if (discountType === 'percent') {
    const normalizedPercent = Math.min(100, discountValue);
    return normalizeMoney(lineBase * (normalizedPercent / 100));
  }

  return normalizeMoney(Math.min(discountValue, lineBase));
};

const getDocumentDiscountAmount = (
  discountType: PromoType,
  discountValue: number,
  subtotal: number,
) => {
  if (discountType === 'percent') {
    const normalizedPercent = Math.min(100, normalizeMoney(discountValue));
    return normalizeMoney(subtotal * (normalizedPercent / 100));
  }

  return normalizeMoney(Math.min(discountValue, subtotal));
};

export const calculateDocumentTotal = <TItem extends DocumentLineItemLike>({
  items,
  discountType = 'fixed',
  discountValue,
  discountAmount = 0,
  taxRate = 0,
  taxCalculationMode = 'EXCLUSIVE',
  taxId,
  taxName,
  taxCode,
  taxFlow,
  taxAccountId,
  taxAccountCode,
  taxAccountName,
  taxAccountType,
  taxAccountContext,
  taxes = [],
  config,
}: DocumentTotalInput<TItem>): DocumentTotalResult<TItem> => {
  if (!config.behavior.hasPricing) {
    return { items };
  }

  const lineItems = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    const lineBase = Math.max(0, quantity * price);
    const lineDiscount = getLineDiscountAmount(item, lineBase);
    const subtotal = Math.max(0, lineBase - lineDiscount);

    return {
      ...item,
      quantity,
      price,
      discount_type: item.discount_type ?? 'fixed',
      discount_value: normalizeMoney(Number(item.discount_value ?? item.discount_amount ?? 0)),
      discount_amount: lineDiscount,
      subtotal: roundCurrency(subtotal),
    };
  });
  const subtotal = lineItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const normalizedDiscountType = discountType ?? 'fixed';
  const normalizedDiscountValue = normalizeMoney(Number(discountValue ?? discountAmount ?? 0));
  const normalizedDiscount = getDocumentDiscountAmount(normalizedDiscountType, normalizedDiscountValue, subtotal);
  const normalizedRate = Math.max(0, Number(taxRate || 0));

  const lineTaxReadyItems = lineItems.map((item) => {
    const selectedTax = item.tax_id ? taxes.find((tax) => tax.id === item.tax_id) : undefined;
    const selectedTaxAccount = selectedTax && taxAccountContext === 'sales'
      ? {
        id: selectedTax.sales_tax_account_id,
        code: selectedTax.sales_tax_account_code,
        name: selectedTax.sales_tax_account_name,
        type: selectedTax.sales_tax_account_type,
      }
      : selectedTax && taxAccountContext === 'purchase'
        ? {
          id: selectedTax.purchase_tax_account_id,
          code: selectedTax.purchase_tax_account_code,
          name: selectedTax.purchase_tax_account_name,
          type: selectedTax.purchase_tax_account_type,
        }
        : undefined;
    const lineTaxId = item.tax_id ?? taxId;
    const lineTaxName = selectedTax?.name ?? item.tax_name ?? taxName;
    const lineTaxCode = selectedTax?.code ?? item.tax_code ?? taxCode;
    const lineTaxFlow = selectedTax?.tax_flow ?? item.tax_flow ?? taxFlow ?? 'ADDITIVE';
    const lineTaxAccountId = item.tax_account_id ?? selectedTaxAccount?.id ?? taxAccountId;
    const lineTaxAccountCode = item.tax_account_code ?? selectedTaxAccount?.code ?? taxAccountCode;
    const lineTaxAccountName = item.tax_account_name ?? selectedTaxAccount?.name ?? taxAccountName;
    const lineTaxAccountType = item.tax_account_type ?? selectedTaxAccount?.type ?? taxAccountType;
    const lineTaxRate = Number(
      selectedTax?.rate ??
      item.tax_rate ??
      normalizedRate,
    );
    const lineTaxMode = selectedTax?.calculation_mode ?? item.tax_calculation_mode ?? taxCalculationMode;
    const normalizedLineRate = Math.max(0, Number(lineTaxRate || 0));
    const lineRate = normalizedLineRate / 100;

    const lineSubtotal = Number(item.subtotal || 0);
    const discountShare = subtotal > 0
      ? (lineSubtotal / subtotal) * normalizedDiscount
      : 0;
    const lineTaxBase = Math.max(0, lineSubtotal - discountShare);
    const lineTax = !config.behavior.hasTax || lineRate === 0
      ? 0
      : lineTaxMode === 'INCLUSIVE'
        ? lineTaxBase - lineTaxBase / (1 + lineRate)
        : lineTaxBase * lineRate;
    const lineTotal = lineTaxFlow === 'WITHHOLDING'
      ? lineTaxBase - lineTax
      : lineTaxMode === 'INCLUSIVE'
        ? lineTaxBase
        : lineTaxBase + lineTax;

    return {
      ...item,
      tax_id: config.behavior.hasTax ? lineTaxId : undefined,
      tax_name: config.behavior.hasTax ? lineTaxName : undefined,
      tax_code: config.behavior.hasTax ? lineTaxCode : undefined,
      tax_rate: config.behavior.hasTax ? normalizedLineRate : undefined,
      tax_calculation_mode: config.behavior.hasTax ? lineTaxMode : undefined,
      tax_flow: config.behavior.hasTax && lineTaxId ? lineTaxFlow : undefined,
      tax_account_id: config.behavior.hasTax && lineTaxId ? lineTaxAccountId : undefined,
      tax_account_code: config.behavior.hasTax && lineTaxId ? lineTaxAccountCode : undefined,
      tax_account_name: config.behavior.hasTax && lineTaxId ? lineTaxAccountName : undefined,
      tax_account_type: config.behavior.hasTax && lineTaxId ? lineTaxAccountType : undefined,
      tax_base_amount: roundCurrency(lineTaxBase),
      tax_amount: roundCurrency(lineTax),
      total_amount: roundCurrency(lineTotal),
    };
  });

  const taxAmount = lineTaxReadyItems.reduce((sum, item) => sum + Number(item.tax_amount || 0), 0);
  const total = lineTaxReadyItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

  return {
    items: lineTaxReadyItems,
    subtotal_amount: roundCurrency(subtotal),
    discount_type: normalizedDiscountType,
    discount_value: normalizedDiscountValue,
    discount_amount: roundCurrency(normalizedDiscount),
    tax_amount: roundCurrency(taxAmount),
    total_amount: roundCurrency(total),
  };
};
