import type { Permission } from '@/types';

export interface ReportAccessDefinition {
  permission: Permission;
  moduleCode: string | string[];
}

export const GENERAL_REPORT_ACCESS: Record<string, ReportAccessDefinition> = {
  '/report/pos-sales-report': {
    permission: 'REPORT_POS_SALES_VIEW',
    moduleCode: 'REPORT_POS_SALES',
  },
  '/report/sales-report': {
    permission: 'REPORT_POS_SALES_VIEW',
    moduleCode: 'REPORT_POS_SALES',
  },
  '/report/deposit-report': {
    permission: 'REPORT_DEPOSIT_VIEW',
    moduleCode: 'REPORT_DEPOSIT',
  },
  '/report/transaction-detail-report': {
    permission: 'REPORT_TRANSACTION_DETAIL_VIEW',
    moduleCode: 'REPORT_TRANSACTION_DETAIL',
  },
  '/report/purchase-report': {
    permission: 'REPORT_PURCHASE_VIEW',
    moduleCode: 'REPORT_PURCHASE',
  },
  '/report/income-report': {
    permission: 'REPORT_INCOME_VIEW',
    moduleCode: 'REPORT_INCOME',
  },
  '/report/expense-report': {
    permission: 'REPORT_EXPENSE_VIEW',
    moduleCode: 'REPORT_EXPENSE',
  },
  '/report/cash-flow-report': {
    permission: 'REPORT_CASH_FLOW_VIEW',
    moduleCode: 'REPORT_CASH_FLOW',
  },
  '/report/payroll-report': {
    permission: 'REPORT_PAYROLL_VIEW',
    moduleCode: 'REPORT_PAYROLL',
  },
  '/report/profit-loss-report': {
    permission: 'REPORT_PROFIT_LOSS_VIEW',
    moduleCode: 'REPORT_PROFIT',
  },
  '/report/balance-sheet-report': {
    permission: 'REPORT_BALANCE_SHEET_VIEW',
    moduleCode: 'REPORT_BALANCE_SHEET',
  },
  '/report/buku-besar': {
    permission: 'REPORT_LEDGER_VIEW',
    moduleCode: 'GENERAL_LEDGER',
  },
  '/report/aging-report': {
    permission: 'REPORT_AGING_VIEW',
    moduleCode: 'REPORT_AGING',
  },
  '/report/stock-card': {
    permission: 'REPORT_STOCK_CARD_VIEW',
    moduleCode: 'REPORT_STOCK_CARD',
  },
};

export const COOPERATIVE_REPORT_ACCESS: Record<string, ReportAccessDefinition> = {
  '/koperasi/laporan': {
    permission: 'COOPERATIVE_OVERVIEW_REPORT_VIEW',
    moduleCode: 'KOPERASI_SHU',
  },
  '/koperasi/laporan-simpanan-sukarela': {
    permission: 'COOPERATIVE_SAVING_VIEW',
    moduleCode: 'KOPERASI_SIMPANAN_SUKARELA',
  },
  '/koperasi/laporan-tabungan-masuk': {
    permission: 'COOPERATIVE_SAVING_VIEW',
    moduleCode: ['KOPERASI_SIMPANAN_POKOK', 'KOPERASI_SIMPANAN_WAJIB', 'KOPERASI_SIMPANAN_SUKARELA'],
  },
  '/koperasi/laporan-tabungan-keluar': {
    permission: 'COOPERATIVE_SAVING_VIEW',
    moduleCode: ['KOPERASI_SIMPANAN_POKOK', 'KOPERASI_SIMPANAN_WAJIB', 'KOPERASI_SIMPANAN_SUKARELA'],
  },
  '/koperasi/laporan-tunai': {
    permission: 'COOPERATIVE_CASH_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_CASH',
  },
  '/koperasi/laporan-target-harian': {
    permission: 'COOPERATIVE_DAILY_TARGET_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_DAILY_TARGET',
  },
  '/koperasi/laporan-kas-harian-pdl': {
    permission: 'COOPERATIVE_CASH_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_DAILY_FIELD_CASH',
  },
  '/koperasi/laporan-storting-harian': {
    permission: 'COOPERATIVE_DAILY_STORTING_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_DAILY_STORTING',
  },
  '/koperasi/laporan-drop-harian': {
    permission: 'COOPERATIVE_DAILY_DROP_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_DAILY_DROP',
  },
  '/koperasi/laporan-drop-mingguan': {
    permission: 'COOPERATIVE_WEEKLY_DROP_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_WEEKLY_DROP',
  },
  '/koperasi/laporan-perkembangan-resort': {
    permission: 'COOPERATIVE_RESORT_DEVELOPMENT_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_RESORT_DEVELOPMENT',
  },
  '/koperasi/laporan-iptw': {
    permission: 'COOPERATIVE_IPTW_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_IPTW',
  },
  '/koperasi/laporan-induk-anggota': {
    permission: 'COOPERATIVE_MEMBER_REGISTER_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_MEMBER_REGISTER',
  },
  '/koperasi/buku-angsuran': {
    permission: 'COOPERATIVE_INSTALLMENT_BOOK_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_INSTALLMENT_BOOK',
  },
  '/koperasi/arus-kas': {
    permission: 'COOPERATIVE_CASH_FLOW_REPORT_VIEW',
    moduleCode: 'KOPERASI_REPORT_CASH_FLOW',
  },
};

export const GENERAL_REPORT_PERMISSION_LIST = Array.from(new Set(
  Object.values(GENERAL_REPORT_ACCESS).map((item) => item.permission),
));
export const COOPERATIVE_REPORT_PERMISSION_LIST = Object.values(COOPERATIVE_REPORT_ACCESS)
  .map((item) => item.permission);

const findReportDefinition = (
  path: string,
  definitions: Record<string, ReportAccessDefinition>,
) => Object.entries(definitions)
  .sort(([left], [right]) => right.length - left.length)
  .find(([routePath]) => path === routePath || path.startsWith(`${routePath}/`))
  ?.[1];

export const getReportAccessForPath = (path: string) => (
  findReportDefinition(path, GENERAL_REPORT_ACCESS) ??
  findReportDefinition(path, COOPERATIVE_REPORT_ACCESS)
);
