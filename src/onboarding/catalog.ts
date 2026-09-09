export const BASE_MODULES = [
  'ROLE_PERMISSION',
  'CASH_FLOW',
  'CHART_OF_ACCOUNTS',
];
const pos = [
  ...BASE_MODULES,
  'POS_TRANSACTION',
  'POS_RESTAURANT',
  'PRODUCT',
  'STOCK_OPNAME',
  'CONTACT',
  'WAREHOUSE',
  'PAYMENT_METHOD',
  'UNIT',
  'REPORT_POS_SALES',
  'REPORT_DEPOSIT',
  'REPORT_TRANSACTION_DETAIL',
  'REPORT_STOCK_CARD',
  'REPORT_INCOME',
  'REPORT_EXPENSE',
  'REPORT_CASH_FLOW',
  'REPORT_PROFIT',
];
const trading = [
  ...pos,
  'SALES_QUOTATION',
  'SALES_ORDER',
  'SALES_DELIVERY',
  'SALES_INVOICE',
  'SALES_RETURN',
  'PURCHASE_REQUEST',
  'PURCHASE_RFQ',
  'PURCHASE_ORDER',
  'PURCHASE_RECEIPT',
  'PURCHASE_INVOICE',
  'PURCHASE_RETURN',
  'RECEIVABLES',
  'PAYABLES',
  'TAX',
  'REPORT_PURCHASE',
  'REPORT_AGING',
];
const production = [...trading, 'PRODUCTION'];
const cooperative = [
  ...BASE_MODULES,
  'KOPERASI_ANGGOTA',
  'KOPERASI_SIMPANAN_POKOK',
  'KOPERASI_SIMPANAN_WAJIB',
  'KOPERASI_SIMPANAN_SUKARELA',
  'KOPERASI_PINJAMAN',
  'KOPERASI_ANGSURAN',
  'KOPERASI_PENAGIHAN',
  'KOPERASI_KAS_PETUGAS',
  'KOPERASI_SHU',
  'KOPERASI_REPORT_CASH',
  'KOPERASI_REPORT_DAILY_TARGET',
  'KOPERASI_REPORT_DAILY_FIELD_CASH',
  'KOPERASI_REPORT_DAILY_STORTING',
  'KOPERASI_REPORT_DAILY_DROP',
  'KOPERASI_REPORT_WEEKLY_DROP',
  'KOPERASI_REPORT_RESORT_DEVELOPMENT',
  'KOPERASI_REPORT_IPTW',
  'KOPERASI_REPORT_MEMBER_REGISTER',
  'KOPERASI_REPORT_INSTALLMENT_BOOK',
  'KOPERASI_REPORT_CASH_FLOW',
  'EMPLOYEE',
  'AREA',
  'REPORT_CASH_FLOW',
];

export const PLAN_IDS = [
  'pos',
  'trading',
  'production',
  'cooperative',
  'custom',
] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const PLAN_NAMES: Record<PlanId, string> = {
  pos: 'POS Ritel & Resto',
  trading: 'Perdagangan Umum',
  production: 'Produksi',
  cooperative: 'Koperasi',
  custom: 'Custom',
};
export const PLAN_CATALOG = [
  { id: 'pos', monthlyPrice: 149000, setupPrice: 0, modules: pos },
  { id: 'trading', monthlyPrice: 299000, setupPrice: 0, modules: trading },
  {
    id: 'production',
    monthlyPrice: 449000,
    setupPrice: 0,
    modules: production,
  },
  {
    id: 'cooperative',
    monthlyPrice: 699000,
    setupPrice: 0,
    modules: cooperative,
  },
  {
    id: 'custom',
    monthlyPrice: 999000,
    setupPrice: 3500000,
    modules: [...new Set([...production, ...cooperative])],
  },
] satisfies {
  id: PlanId;
  monthlyPrice: number;
  setupPrice: number;
  modules: string[];
}[];

export const getPlan = (id: PlanId) =>
  PLAN_CATALOG.find((plan) => plan.id === id)!;
export const getPlanModules = (id: PlanId, customModules: string[]) =>
  id === 'custom'
    ? getPlan(id).modules.filter(
        (code) => BASE_MODULES.includes(code) || customModules.includes(code),
      )
    : [...getPlan(id).modules];
