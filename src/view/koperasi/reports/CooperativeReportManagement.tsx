import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Alert, Button, DatePicker, Descriptions, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { BookOpen, RefreshCw } from 'lucide-react';
import CompanyReportHeader from '@/components/report/CompanyReportHeader';
import { useCooperativeReports } from '@/hooks/useCooperativeReports';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeCashBankReportRow,
  CooperativeFinancialStatementRow,
  CooperativeInstallmentReportRow,
  CooperativeLoanPaymentReportRow,
  CooperativeLoanReportRow,
  CooperativeMemberReportRow,
  CooperativeOverdueReportRow,
  CooperativeReconciliationKey,
  CooperativeReconciliationRow,
  CooperativeSavingBalanceReportRow,
  CooperativeSavingMutationReportRow,
} from '@/services/cooperativeReportService';
import type { JournalEntryWithLines } from '@/services/generalLedgerService';
import type {
  CooperativeLoanInstallmentStatus,
  CooperativeLoanPaymentStatus,
  CooperativeLoanPaymentType,
  CooperativeLoanStatus,
  CooperativeMemberStatus,
  CooperativeSavingTransactionStatus,
  CooperativeSavingTransactionType,
  CooperativeSavingType,
  FinanceTransactionType,
  JournalEntryLine,
  JournalEntryStatus,
  JournalSourceType,
} from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Text, Title } = Typography;

const journalStatusColor: Record<JournalEntryStatus, string> = {
  DRAFT: 'default',
  POSTED: 'green',
  VOIDED: 'red',
  REVERSED: 'orange',
};

const memberStatusColor: Record<CooperativeMemberStatus, string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  SUSPENDED: 'orange',
};

const memberStatusLabelKey: Record<CooperativeMemberStatus, TranslationKey> = {
  ACTIVE: 'cooperative.members.status.active',
  INACTIVE: 'cooperative.members.status.inactive',
  SUSPENDED: 'cooperative.members.status.suspended',
};

const savingTypeColor: Record<CooperativeSavingType, string> = {
  POKOK: 'blue',
  WAJIB: 'purple',
  SUKARELA: 'green',
};

const savingTypeLabelKey: Record<CooperativeSavingType, TranslationKey> = {
  POKOK: 'cooperative.savings.type.pokok',
  WAJIB: 'cooperative.savings.type.wajib',
  SUKARELA: 'cooperative.savings.type.sukarela',
};

const savingTransactionTypeColor: Record<CooperativeSavingTransactionType, string> = {
  DEPOSIT: 'green',
  WITHDRAWAL: 'red',
  REVERSAL: 'orange',
};

const savingTransactionTypeLabelKey: Record<CooperativeSavingTransactionType, TranslationKey> = {
  DEPOSIT: 'cooperative.savings.transactionType.deposit',
  WITHDRAWAL: 'cooperative.savings.transactionType.withdrawal',
  REVERSAL: 'cooperative.savings.transactionType.reversal',
};

const savingStatusColor: Record<CooperativeSavingTransactionStatus, string> = {
  POSTED: 'green',
  REVERSED: 'red',
};

const savingStatusLabelKey: Record<CooperativeSavingTransactionStatus, TranslationKey> = {
  POSTED: 'cooperative.savings.status.posted',
  REVERSED: 'cooperative.savings.status.reversed',
};

const loanStatusColor: Record<CooperativeLoanStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'blue',
  APPROVED: 'green',
  REJECTED: 'red',
  DISBURSED: 'purple',
  PAID_OFF: 'cyan',
  REVERSED: 'orange',
};

const loanStatusLabelKey: Record<CooperativeLoanStatus, TranslationKey> = {
  DRAFT: 'cooperative.loans.status.draft',
  SUBMITTED: 'cooperative.loans.status.submitted',
  APPROVED: 'cooperative.loans.status.approved',
  REJECTED: 'cooperative.loans.status.rejected',
  DISBURSED: 'cooperative.loans.status.disbursed',
  PAID_OFF: 'cooperative.loans.status.paidOff',
  REVERSED: 'cooperative.loans.status.reversed',
};

const installmentStatusColor: Record<CooperativeLoanInstallmentStatus, string> = {
  UNPAID: 'default',
  PARTIAL: 'blue',
  PAID: 'green',
  OVERDUE: 'red',
};

const installmentStatusLabelKey: Record<CooperativeLoanInstallmentStatus, TranslationKey> = {
  UNPAID: 'cooperative.loans.installmentStatus.unpaid',
  PARTIAL: 'cooperative.loans.installmentStatus.partial',
  PAID: 'cooperative.loans.installmentStatus.paid',
  OVERDUE: 'cooperative.loans.installmentStatus.overdue',
};

const paymentStatusColor: Record<CooperativeLoanPaymentStatus, string> = {
  POSTED: 'green',
  REVERSED: 'red',
};

const paymentStatusLabelKey: Record<CooperativeLoanPaymentStatus, TranslationKey> = {
  POSTED: 'cooperative.installments.paymentStatus.posted',
  REVERSED: 'cooperative.installments.paymentStatus.reversed',
};

const paymentTypeLabelKey: Record<CooperativeLoanPaymentType, TranslationKey> = {
  PAYMENT: 'cooperative.installments.paymentType.payment',
  REVERSAL: 'cooperative.installments.paymentType.reversal',
};

const financeTypeColor: Record<FinanceTransactionType, string> = {
  INCOME: 'green',
  EXPENSE: 'red',
  OPENING_BALANCE: 'blue',
};

const cooperativeReportTabKeys = new Set([
  'summary',
  'savings',
  'loans',
  'installments',
  'overdue',
  'cash-bank',
  'journal',
  'balance-sheet',
  'shu',
  'equity-change',
]);

const reconciliationLabelKey: Record<CooperativeReconciliationKey, TranslationKey> = {
  SAVING_BALANCE: 'cooperative.reports.reconciliation.savingBalance',
  LOAN_OUTSTANDING: 'cooperative.reports.reconciliation.loanOutstanding',
  PAYMENT_INSTALLMENT: 'cooperative.reports.reconciliation.paymentInstallment',
  FINANCE_TRANSACTION: 'cooperative.reports.reconciliation.financeTransaction',
  JOURNAL_ENTRY: 'cooperative.reports.reconciliation.journalEntry',
  LOAN_MIGRATION_OPENING: 'cooperative.reports.reconciliation.loanMigrationOpening',
};

const getSignedAmountClass = (value: number) => (
  value < 0 ? 'text-red-600' : 'text-gray-900'
);

const money = (value: number) => `Rp ${formatCurrency(value || 0)}`;

const idText = (value?: string) => value || '-';


const MemberLink = ({
  memberNumber,
  memberName,
}: {
  memberNumber: string;
  memberName: string;
}) => (
  <Link to="/koperasi/anggota" className="font-medium text-blue-600 hover:text-blue-700">
    {memberNumber} - {memberName}
  </Link>
);

const LoanLink = ({
  loanNumber,
  to = '/koperasi/pinjaman',
}: {
  loanNumber: string;
  to?: '/koperasi/pinjaman' | '/koperasi/angsuran';
}) => (
  <Link to={to} className="font-medium text-blue-600 hover:text-blue-700">
    {loanNumber}
  </Link>
);

const CooperativeSourceLink = ({
  sourceType,
  sourceEvent,
  sourceNumber,
}: {
  sourceType?: JournalSourceType;
  sourceEvent?: string;
  sourceNumber?: string;
}) => {
  const label = sourceNumber || '-';
  const className = 'font-medium text-blue-600 hover:text-blue-700';

  if (sourceType === 'COOPERATIVE_SAVING') {
    return <Link to="/koperasi/simpanan" className={className}>{label}</Link>;
  }

  if (sourceEvent === 'COOPERATIVE_LOAN_PAYMENT_POSTED') {
    return <Link to="/koperasi/angsuran" className={className}>{label}</Link>;
  }

  if (sourceType === 'COOPERATIVE_LOAN') {
    return <Link to="/koperasi/pinjaman" className={className}>{label}</Link>;
  }

  return <Text type="secondary">-</Text>;
};

export default function CooperativeReportManagement() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [asOfDate, setAsOfDate] = useState<Dayjs | null>(() => dayjs.tz());

  const filters = useMemo(() => ({
    startDate: dateRange?.[0].startOf('day').toISOString(),
    endDate: dateRange?.[1].endOf('day').toISOString(),
    asOfDate: asOfDate?.format('YYYY-MM-DD'),
  }), [asOfDate, dateRange]);

  const reportQuery = useCooperativeReports(filters);
  const data = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const summary = data?.summary;
  const overdueSummary = data?.overdueReport.summary;
  const financialReadiness = data?.financialReadiness;
  const cooperativeBalanceSheet = data?.cooperativeBalanceSheet;
  const cooperativeShuReport = data?.cooperativeShuReport;
  const cooperativeEquityChangeReport = data?.cooperativeEquityChangeReport;
  const reconciliation = data?.reconciliation;
  const canShowFinancialStatements = Boolean(financialReadiness?.can_show_financial_statements);
  const reportTabHash = location.hash.replace(/^#/, '');
  const activeReportTab = cooperativeReportTabKeys.has(reportTabHash) ? reportTabHash : 'summary';

  const handleReportTabChange = (tabKey: string) => {
    navigate({ to: '/koperasi/laporan', hash: tabKey === 'summary' ? undefined : tabKey });
  };

  const renderFinancialReport = (children: ReactNode) => (
    <Space direction="vertical" className="w-full" size="middle">
      {canShowFinancialStatements ? (
        <Alert
          type="info"
          showIcon
          message={t('cooperative.reports.financial.readyMessage', {
            date: financialReadiness?.cutoff_date?.slice(0, 10) ?? '-',
          })}
        />
      ) : (
        <Alert
          data-testid="koperasi-financial-readiness-alert"
          type="warning"
          showIcon
          message={t('cooperative.reports.financial.notReadyTitle')}
          description={(
            <Space direction="vertical" size={4}>
              {(financialReadiness?.messages.length ? financialReadiness.messages : [t('cooperative.reports.financial.loading')]).map((message) => (
                <Text key={message}>{message}</Text>
              ))}
            </Space>
          )}
        />
      )}
      {canShowFinancialStatements ? children : null}
    </Space>
  );

  const reconciliationColumns: ColumnsType<CooperativeReconciliationRow> = [
    {
      title: t('cooperative.reports.table.check'),
      dataIndex: 'key',
      key: 'key',
      render: (key: CooperativeReconciliationKey) => t(reconciliationLabelKey[key]),
    },
    {
      title: t('cooperative.reports.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeReconciliationRow['status']) => (
        <Tag color={status === 'OK' ? 'green' : 'orange'}>{t(status === 'OK' ? 'cooperative.reports.reconciliation.ok' : 'cooperative.reports.reconciliation.warning')}</Tag>
      ),
      width: 130,
    },
    {
      title: t('cooperative.reports.table.mismatchCount'),
      dataIndex: 'mismatch_count',
      key: 'mismatch_count',
      align: 'right',
      width: 150,
    },
    {
      title: t('cooperative.reports.table.expected'),
      dataIndex: 'expected_amount',
      key: 'expected_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 170,
    },
    {
      title: t('cooperative.reports.table.actual'),
      dataIndex: 'actual_amount',
      key: 'actual_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 170,
    },
    {
      title: t('cooperative.reports.table.difference'),
      dataIndex: 'difference_amount',
      key: 'difference_amount',
      align: 'right',
      render: (value: number) => <Text className={getSignedAmountClass(value)}>{money(value)}</Text>,
      width: 170,
    },
  ];

  const memberColumns: ColumnsType<CooperativeMemberReportRow> = [
    {
      title: t('cooperative.reports.table.member'),
      key: 'member',
      render: (_value, record) => <MemberLink memberNumber={record.member_number} memberName={record.name} />,
    },
    {
      title: t('cooperative.reports.table.joinDate'),
      dataIndex: 'join_date',
      key: 'join_date',
      render: (value: string) => formatDate(value),
      width: 150,
    },
    {
      title: t('cooperative.reports.table.phone'),
      dataIndex: 'phone',
      key: 'phone',
      render: idText,
      width: 150,
    },
    {
      title: t('cooperative.reports.table.officer'),
      key: 'officer',
      render: (_value, record) => (
        record.officer_name ? (
          <Space orientation="vertical" size={0}>
            <Text>{record.officer_name}</Text>
            <Text type="secondary">{record.officer_position || '-'}</Text>
          </Space>
        ) : '-'
      ),
      width: 220,
    },
    {
      title: t('cooperative.reports.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeMemberStatus) => <Tag color={memberStatusColor[status]}>{t(memberStatusLabelKey[status])}</Tag>,
      width: 130,
    },
    {
      title: t('cooperative.reports.table.savingBalance'),
      dataIndex: 'saving_balance',
      key: 'saving_balance',
      align: 'right',
      render: (value: number) => money(value),
      width: 170,
    },
    {
      title: t('cooperative.reports.table.activeLoans'),
      dataIndex: 'active_loan_count',
      key: 'active_loan_count',
      align: 'right',
      width: 140,
    },
    {
      title: t('cooperative.reports.table.loanOutstanding'),
      dataIndex: 'outstanding_loan_amount',
      key: 'outstanding_loan_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 180,
    },
  ];

  const savingBalanceColumns: ColumnsType<CooperativeSavingBalanceReportRow> = [
    {
      title: t('cooperative.reports.table.member'),
      key: 'member',
      render: (_value, record) => <MemberLink memberNumber={record.member_number} memberName={record.member_name} />,
      width: 260,
    },
    {
      title: t('cooperative.reports.table.savingType'),
      dataIndex: 'saving_type',
      key: 'saving_type',
      render: (savingType: CooperativeSavingType) => (
        <Tag color={savingTypeColor[savingType]}>{t(savingTypeLabelKey[savingType])}</Tag>
      ),
      width: 140,
    },
    {
      title: t('cooperative.reports.table.balance'),
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      render: (value: number) => money(value),
      width: 170,
    },
    {
      title: t('cooperative.reports.table.expected'),
      dataIndex: 'expected_balance',
      key: 'expected_balance',
      align: 'right',
      render: (value: number) => money(value),
      width: 170,
    },
    {
      title: t('cooperative.reports.table.difference'),
      dataIndex: 'difference_amount',
      key: 'difference_amount',
      align: 'right',
      render: (value: number) => <Text className={getSignedAmountClass(value)}>{money(value)}</Text>,
      width: 170,
    },
    {
      title: t('cooperative.reports.table.updatedAt'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (value: string) => formatDate(value),
      width: 170,
    },
  ];

  const savingMutationColumns: ColumnsType<CooperativeSavingMutationReportRow> = [
    {
      title: t('cooperative.reports.table.date'),
      dataIndex: 'transaction_date',
      key: 'transaction_date',
      render: (value: string) => formatDate(value),
      width: 160,
    },
    {
      title: t('cooperative.reports.table.member'),
      key: 'member',
      render: (_value, record) => <MemberLink memberNumber={record.member_number} memberName={record.member_name} />,
      width: 260,
    },
    {
      title: t('cooperative.reports.table.savingType'),
      dataIndex: 'saving_type',
      key: 'saving_type',
      render: (savingType: CooperativeSavingType) => (
        <Tag color={savingTypeColor[savingType]}>{t(savingTypeLabelKey[savingType])}</Tag>
      ),
      width: 140,
    },
    {
      title: t('cooperative.reports.table.type'),
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      render: (transactionType: CooperativeSavingTransactionType) => (
        <Tag color={savingTransactionTypeColor[transactionType]}>{t(savingTransactionTypeLabelKey[transactionType])}</Tag>
      ),
      width: 140,
    },
    {
      title: t('cooperative.reports.table.amount'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.reports.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeSavingTransactionStatus) => (
        <Tag color={savingStatusColor[status]}>{t(savingStatusLabelKey[status])}</Tag>
      ),
      width: 130,
    },
    {
      title: t('cooperative.reports.table.references'),
      key: 'references',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <Text type="secondary">{t('cooperative.reports.table.finance')}: {idText(record.finance_transaction_id)}</Text>
          <Text type="secondary">{t('cooperative.reports.table.journal')}: {idText(record.journal_entry_id)}</Text>
        </Space>
      ),
      width: 260,
    },
  ];

  const loanColumns: ColumnsType<CooperativeLoanReportRow> = [
    {
      title: t('cooperative.installments.table.loan'),
      key: 'loan',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <LoanLink loanNumber={record.loan_number} />
          <Text type="secondary">{formatDate(record.application_date)}</Text>
        </Space>
      ),
      width: 190,
    },
    {
      title: t('cooperative.reports.table.member'),
      key: 'member',
      render: (_value, record) => <MemberLink memberNumber={record.member_number} memberName={record.member_name} />,
      width: 260,
    },
    {
      title: t('cooperative.reports.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeLoanStatus) => <Tag color={loanStatusColor[status]}>{t(loanStatusLabelKey[status])}</Tag>,
      width: 130,
    },
    {
      title: t('cooperative.reports.table.principal'),
      dataIndex: 'principal_amount',
      key: 'principal_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 170,
    },
    {
      title: t('cooperative.reports.table.totalPayable'),
      dataIndex: 'total_payable_amount',
      key: 'total_payable_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 170,
    },
    {
      title: t('cooperative.reports.table.loanOutstanding'),
      dataIndex: 'outstanding_total_amount',
      key: 'outstanding_total_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 180,
    },
    {
      title: t('cooperative.reports.table.scheduleRemaining'),
      dataIndex: 'installment_remaining_amount',
      key: 'installment_remaining_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 190,
    },
    {
      title: t('cooperative.reports.table.installments'),
      key: 'installments',
      align: 'right',
      render: (_value, record) => `${record.paid_installment_count}/${record.installment_count}`,
      width: 130,
    },
  ];

  const installmentColumns: ColumnsType<CooperativeInstallmentReportRow> = [
    {
      title: t('cooperative.installments.table.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      render: (value: string) => formatDate(value),
      width: 160,
    },
    {
      title: t('cooperative.installments.table.loan'),
      key: 'loan',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <LoanLink loanNumber={record.loan_number} to="/koperasi/angsuran" />
          <MemberLink memberNumber={record.member_number} memberName={record.member_name} />
        </Space>
      ),
      width: 300,
    },
    {
      title: t('cooperative.installments.table.installmentNo'),
      dataIndex: 'installment_number',
      key: 'installment_number',
      align: 'right',
      width: 100,
    },
    {
      title: t('cooperative.installments.table.bill'),
      dataIndex: 'bill_amount',
      key: 'bill_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.installments.table.paid'),
      dataIndex: 'paid_amount',
      key: 'paid_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.installments.table.remaining'),
      dataIndex: 'remaining_amount',
      key: 'remaining_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.installments.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeLoanInstallmentStatus) => (
        <Tag color={installmentStatusColor[status]}>{t(installmentStatusLabelKey[status])}</Tag>
      ),
      width: 130,
    },
  ];

  const loanPaymentColumns: ColumnsType<CooperativeLoanPaymentReportRow> = [
    {
      title: t('cooperative.installments.payments.paymentDate'),
      dataIndex: 'payment_date',
      key: 'payment_date',
      render: (value: string) => formatDate(value),
      width: 160,
    },
    {
      title: t('cooperative.installments.payments.paymentNumber'),
      dataIndex: 'payment_number',
      key: 'payment_number',
      render: (value: string, record) => (
        <Space orientation="vertical" size={0}>
          <Link to="/koperasi/angsuran" className="font-medium text-blue-600 hover:text-blue-700">{value}</Link>
          {record.payment_type && <Text type="secondary">{t(paymentTypeLabelKey[record.payment_type])}</Text>}
        </Space>
      ),
      width: 190,
    },
    {
      title: t('cooperative.installments.table.loan'),
      key: 'loan',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <LoanLink loanNumber={record.loan_number} to="/koperasi/angsuran" />
          <MemberLink memberNumber={record.member_number} memberName={record.member_name} />
        </Space>
      ),
      width: 300,
    },
    {
      title: t('cooperative.installments.payments.amount'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.installments.payments.allocation'),
      key: 'allocation',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <Text>{t('cooperative.reports.table.principal')}: {money(record.principal_amount)}</Text>
          <Text>{t('cooperative.reports.table.interest')}: {money(record.interest_amount)}</Text>
          <Text>{t('cooperative.reports.table.penalty')}: {money(record.penalty_amount)}</Text>
        </Space>
      ),
      width: 220,
    },
    {
      title: t('cooperative.installments.payments.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeLoanPaymentStatus) => (
        <Tag color={paymentStatusColor[status]}>{t(paymentStatusLabelKey[status])}</Tag>
      ),
      width: 130,
    },
  ];

  const overdueColumns: ColumnsType<CooperativeOverdueReportRow> = [
    {
      title: t('cooperative.installments.table.dueDate'),
      dataIndex: 'due_date',
      key: 'due_date',
      render: (value: string) => formatDate(value),
      width: 170,
    },
    {
      title: t('cooperative.installments.table.loan'),
      key: 'loan',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <LoanLink loanNumber={record.loan_number} to="/koperasi/angsuran" />
          <MemberLink memberNumber={record.member_number} memberName={record.member_name} />
        </Space>
      ),
      width: 280,
    },
    {
      title: t('cooperative.installments.table.installmentNo'),
      dataIndex: 'installment_number',
      key: 'installment_number',
      align: 'right',
      width: 110,
    },
    {
      title: t('cooperative.reports.overdue.daysOverdue'),
      dataIndex: 'days_overdue',
      key: 'days_overdue',
      align: 'right',
      render: (value: number) => t('cooperative.reports.overdue.days', { days: value }),
      width: 140,
    },
    {
      title: t('cooperative.reports.overdue.principal'),
      dataIndex: 'remaining_principal_amount',
      key: 'remaining_principal_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.reports.overdue.interest'),
      dataIndex: 'remaining_interest_amount',
      key: 'remaining_interest_amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.reports.overdue.penalty'),
      dataIndex: 'remaining_penalty_amount',
      key: 'remaining_penalty_amount',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 160,
    },
    {
      title: t('cooperative.reports.overdue.remainingTotal'),
      dataIndex: 'remaining_total_amount',
      key: 'remaining_total_amount',
      align: 'right',
      render: (value: number) => <Text strong>{money(value)}</Text>,
      width: 170,
    },
    {
      title: t('cooperative.installments.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeLoanInstallmentStatus) => (
        <Tag color={installmentStatusColor[status]}>{t(installmentStatusLabelKey[status])}</Tag>
      ),
      width: 140,
    },
  ];

  const cashBankColumns: ColumnsType<CooperativeCashBankReportRow> = [
    {
      title: t('cooperative.reports.table.date'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) => formatDate(value),
      width: 160,
    },
    {
      title: t('cooperative.reports.table.category'),
      dataIndex: 'category',
      key: 'category',
      width: 220,
    },
    {
      title: t('cooperative.reports.table.description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('cooperative.reports.table.cashAccount'),
      key: 'cashAccount',
      render: (_value, record) => record.cash_account_code && record.cash_account_name
        ? `${record.cash_account_code} - ${record.cash_account_name}`
        : '-',
      width: 220,
    },
    {
      title: t('cooperative.reports.table.type'),
      dataIndex: 'type',
      key: 'type',
      render: (type: FinanceTransactionType) => <Tag color={financeTypeColor[type]}>{type}</Tag>,
      width: 130,
    },
    {
      title: t('cooperative.reports.table.amount'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('cooperative.reports.table.reference'),
      dataIndex: 'reference_id',
      key: 'reference_id',
      render: idText,
      width: 220,
    },
  ];

  const journalLineColumns: ColumnsType<JournalEntryLine> = [
    {
      title: t('generalLedger.account'),
      key: 'account',
      render: (_value, record) => `${record.account_code} - ${record.account_name}`,
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 160,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 160,
    },
    {
      title: t('generalLedger.journal.lineDescription'),
      dataIndex: 'description',
      key: 'description',
    },
  ];

  const journalColumns: ColumnsType<JournalEntryWithLines> = [
    {
      title: t('generalLedger.journal.date'),
      dataIndex: 'entry_date',
      key: 'entry_date',
      render: (value: string) => formatDate(value),
      width: 170,
    },
    {
      title: t('generalLedger.journal.number'),
      dataIndex: 'entry_number',
      key: 'entry_number',
      width: 170,
    },
    {
      title: t('generalLedger.journal.source'),
      key: 'source',
      render: (_value, record) => (
        <Space orientation="vertical" size={0}>
          <CooperativeSourceLink
            sourceType={record.source_type}
            sourceEvent={record.source_event}
            sourceNumber={record.source_number || record.source_id}
          />
          <Text type="secondary" className="text-sm">{record.source_type}</Text>
        </Space>
      ),
      width: 220,
    },
    {
      title: t('generalLedger.journal.description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('generalLedger.journal.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: JournalEntryStatus) => <Tag color={journalStatusColor[status]}>{status}</Tag>,
      width: 120,
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'total_debit',
      key: 'total_debit',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'total_credit',
      key: 'total_credit',
      align: 'right',
      render: (value: number) => money(value),
      width: 160,
    },
  ];

  const financialStatementColumns: ColumnsType<CooperativeFinancialStatementRow> = [
    {
      title: t('generalLedger.account'),
      key: 'account',
      render: (_value, record) => `${record.account_code} - ${record.account_name}`,
    },
    {
      title: t('cooperative.reports.table.type'),
      dataIndex: 'account_type',
      key: 'account_type',
      width: 150,
    },
    {
      title: t('generalLedger.debit'),
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 160,
    },
    {
      title: t('generalLedger.credit'),
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      render: (value: number) => value > 0 ? money(value) : '-',
      width: 160,
    },
    {
      title: t('cooperative.reports.table.balance'),
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      render: (value: number) => <Text className={getSignedAmountClass(value)}>{money(value)}</Text>,
      width: 170,
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <BookOpen size={24} />
            {t('cooperative.reports.title')}
          </Title>
          <Text type="secondary">{t('cooperative.reports.subtitle')}</Text>
        </div>
        <Space wrap>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(value) => setDateRange(value as [Dayjs, Dayjs] | null)}
          />
          <DatePicker
            value={asOfDate}
            onChange={(value) => setAsOfDate(value)}
            placeholder={t('cooperative.reports.asOfDate')}
          />
          <Button icon={<RefreshCw size={16} />} onClick={() => void reportQuery.refetch()} loading={isLoading}>
            {t('common.refresh')}
          </Button>
        </Space>
      </div>

      <CompanyReportHeader
        reportTitle={t('cooperative.reports.title')}
        reportDescription={t('cooperative.reports.subtitle')}
      />

      {reportQuery.error && (
        <Alert
          type="error"
          showIcon
          message={reportQuery.error instanceof Error ? reportQuery.error.message : t('common.unknownError')}
        />
      )}

      {reconciliation?.status === 'WARNING' && (
        <Alert
          type="warning"
          showIcon
          message={t('cooperative.reports.reconciliation.warningMessage', { count: reconciliation.mismatch_count })}
        />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <Statistic title={t('cooperative.reports.summary.activeMembers')} value={summary?.active_member_count ?? 0} />
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <Statistic
            title={t('cooperative.reports.summary.totalSavings')}
            value={summary?.total_saving_balance ?? 0}
            prefix="Rp"
            formatter={(value) => formatCurrency(Number(value || 0))}
          />
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <Statistic
            title={t('cooperative.reports.summary.loanOutstanding')}
            value={summary?.outstanding_loan_amount ?? 0}
            prefix="Rp"
            formatter={(value) => formatCurrency(Number(value || 0))}
          />
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <Statistic
            title={t('cooperative.reports.overdue.totalAmount')}
            value={overdueSummary?.total_amount ?? 0}
            prefix="Rp"
            formatter={(value) => formatCurrency(Number(value || 0))}
          />
        </div>
      </div>

      <Tabs
        activeKey={activeReportTab}
        onChange={handleReportTabChange}
        items={[
          {
            key: 'summary',
            label: t('cooperative.reports.tabs.summary'),
            children: (
              <Space direction="vertical" className="w-full" size="middle">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-gray-100 bg-white p-4">
                    <Statistic title={t('cooperative.reports.summary.members')} value={summary?.member_count ?? 0} />
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-white p-4">
                    <Statistic title={t('cooperative.reports.summary.activeLoans')} value={summary?.active_loan_count ?? 0} />
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-white p-4">
                    <Statistic
                      title={t('cooperative.reports.summary.netCash')}
                      value={summary?.net_cash_amount ?? 0}
                      prefix="Rp"
                      formatter={(value) => formatCurrency(Number(value || 0))}
                    />
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-white p-4">
                    <Statistic
                      title={t('cooperative.reports.reconciliation.title')}
                      value={reconciliation?.mismatch_count ?? 0}
                      suffix={t(reconciliation?.status === 'WARNING' ? 'cooperative.reports.reconciliation.warning' : 'cooperative.reports.reconciliation.ok')}
                    />
                  </div>
                </div>
                <Table
                  dataSource={reconciliation?.rows ?? []}
                  columns={reconciliationColumns}
                  rowKey="key"
                  loading={isLoading}
                  pagination={false}
                  scroll={{ x: 980 }}
                />
                <Table
                  dataSource={data?.memberRows ?? []}
                  columns={memberColumns}
                  rowKey="id"
                  loading={isLoading}
                  scroll={{ x: 1400 }}
                  locale={{ emptyText: t('cooperative.reports.empty.members') }}
                />
              </Space>
            ),
          },
          {
            key: 'savings',
            label: t('cooperative.reports.tabs.savings'),
            children: (
              <Space direction="vertical" className="w-full" size="middle">
                <Title level={4} className="!mb-0">{t('cooperative.reports.savings.balances')}</Title>
                <Table
                  dataSource={data?.savingBalanceRows ?? []}
                  columns={savingBalanceColumns}
                  rowKey="id"
                  loading={isLoading}
                  scroll={{ x: 1080 }}
                  locale={{ emptyText: t('cooperative.reports.empty.savingBalances') }}
                />
                <Title level={4} className="!mb-0">{t('cooperative.reports.savings.mutations')}</Title>
                <Table
                  dataSource={data?.savingMutationRows ?? []}
                  columns={savingMutationColumns}
                  rowKey="id"
                  loading={isLoading}
                  scroll={{ x: 1420 }}
                  locale={{ emptyText: t('cooperative.reports.empty.savingMutations') }}
                />
              </Space>
            ),
          },
          {
            key: 'loans',
            label: t('cooperative.reports.tabs.loans'),
            children: (
              <Table
                dataSource={data?.loanRows ?? []}
                columns={loanColumns}
                rowKey="id"
                loading={isLoading}
                scroll={{ x: 1380 }}
                locale={{ emptyText: t('cooperative.reports.empty.loans') }}
              />
            ),
          },
          {
            key: 'installments',
            label: t('cooperative.reports.tabs.installments'),
            children: (
              <Space direction="vertical" className="w-full" size="middle">
                <Title level={4} className="!mb-0">{t('cooperative.reports.installments.schedule')}</Title>
                <Table
                  dataSource={data?.installmentRows ?? []}
                  columns={installmentColumns}
                  rowKey="id"
                  loading={isLoading}
                  scroll={{ x: 1160 }}
                  locale={{ emptyText: t('cooperative.reports.empty.installments') }}
                />
                <Title level={4} className="!mb-0">{t('cooperative.reports.installments.payments')}</Title>
                <Table
                  dataSource={data?.loanPaymentRows ?? []}
                  columns={loanPaymentColumns}
                  rowKey="id"
                  loading={isLoading}
                  scroll={{ x: 1260 }}
                  locale={{ emptyText: t('cooperative.reports.empty.payments') }}
                />
              </Space>
            ),
          },
          {
            key: 'overdue',
            label: t('cooperative.reports.tabs.overdue'),
            children: (
              <Table
                dataSource={data?.overdueReport.rows ?? []}
                columns={overdueColumns}
                rowKey="id"
                loading={isLoading}
                scroll={{ x: 1380 }}
                locale={{ emptyText: t('cooperative.reports.overdue.empty') }}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Text strong>{t('common.total')}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong>{money(overdueSummary?.total_principal ?? 0)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong>{money(overdueSummary?.total_interest ?? 0)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <Text strong>{money(overdueSummary?.total_penalty ?? 0)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <Text strong>{money(overdueSummary?.total_amount ?? 0)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} />
                  </Table.Summary.Row>
                )}
              />
            ),
          },
          {
            key: 'cash-bank',
            label: t('cooperative.reports.tabs.cashBank'),
            children: (
              <Table
                dataSource={data?.cashBankRows ?? []}
                columns={cashBankColumns}
                rowKey="id"
                loading={isLoading}
                scroll={{ x: 1280 }}
                locale={{ emptyText: t('cooperative.reports.empty.cashBank') }}
              />
            ),
          },
          {
            key: 'journal',
            label: t('cooperative.reports.tabs.journal'),
            children: (
              <Table
                dataSource={data?.journalEntries ?? []}
                columns={journalColumns}
                rowKey="id"
                loading={isLoading}
                scroll={{ x: 980 }}
                expandable={{
                  expandedRowRender: (record) => (
                    <Table
                      dataSource={record.lines}
                      columns={journalLineColumns}
                      rowKey="id"
                      pagination={false}
                      size="middle"
                    />
                  ),
                }}
              />
            ),
          },
          {
            key: 'balance-sheet',
            label: t('cooperative.reports.tabs.balanceSheet'),
            children: renderFinancialReport(
              <Space direction="vertical" className="w-full" size="middle" data-testid="koperasi-balance-sheet-report">
                <Alert type="info" showIcon message={t('cooperative.reports.balanceSheet.asOfNote')} />
                <Descriptions bordered column={1}>
                  <Descriptions.Item label={t('generalLedger.balance.assets')}>
                    {money(cooperativeBalanceSheet?.assets ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.liabilities')}>
                    {money(cooperativeBalanceSheet?.liabilities ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.equity')}>
                    {money(cooperativeBalanceSheet?.equity ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.currentIncome')}>
                    {money(cooperativeBalanceSheet?.current_period_income ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.totalLiabilitiesAndEquity')}>
                    {money(cooperativeBalanceSheet?.total_liabilities_and_equity ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.balance.difference')}>
                    <Text strong className={getSignedAmountClass(cooperativeBalanceSheet?.difference ?? 0)}>
                      {money(cooperativeBalanceSheet?.difference ?? 0)}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
                {cooperativeBalanceSheet && !cooperativeBalanceSheet.is_balanced && (
                  <Alert className="mt-3" type="error" showIcon message={t('generalLedger.balanceNotBalanced')} />
                )}
                <Table
                  dataSource={cooperativeBalanceSheet?.rows ?? []}
                  columns={financialStatementColumns}
                  rowKey="account_id"
                  loading={isLoading}
                  pagination={false}
                  scroll={{ x: 850 }}
                />
              </Space>,
            ),
          },
          {
            key: 'shu',
            label: t('cooperative.reports.tabs.shu'),
            children: renderFinancialReport(
              <Space direction="vertical" className="w-full" size="middle" data-testid="koperasi-shu-report">
                <Descriptions bordered column={1}>
                  <Descriptions.Item label={t('generalLedger.income.revenue')}>
                    {money(cooperativeShuReport?.revenue ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.income.contraRevenue')}>
                    {money(cooperativeShuReport?.contra_revenue ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.income.netRevenue')}>
                    {money(cooperativeShuReport?.net_revenue ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('generalLedger.income.expense')}>
                    {money(cooperativeShuReport?.expense ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('cooperative.reports.shu.amount')}>
                    <Text strong className={getSignedAmountClass(cooperativeShuReport?.shu_amount ?? 0)}>
                      {money(cooperativeShuReport?.shu_amount ?? 0)}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
                <Table
                  dataSource={cooperativeShuReport?.rows ?? []}
                  columns={financialStatementColumns}
                  rowKey="account_id"
                  loading={isLoading}
                  pagination={false}
                  scroll={{ x: 850 }}
                />
              </Space>,
            ),
          },
          {
            key: 'equity-change',
            label: t('cooperative.reports.tabs.equityChange'),
            children: renderFinancialReport(
              <Space direction="vertical" className="w-full" size="middle" data-testid="koperasi-equity-change-report">
                <Descriptions bordered column={1}>
                  <Descriptions.Item label={t('cooperative.reports.equity.opening')}>
                    {money(cooperativeEquityChangeReport?.opening_equity_amount ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('cooperative.reports.equity.additions')}>
                    {money(cooperativeEquityChangeReport?.addition_amount ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('cooperative.reports.equity.reductions')}>
                    {money(cooperativeEquityChangeReport?.reduction_amount ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('cooperative.reports.equity.periodShu')}>
                    <Text className={getSignedAmountClass(cooperativeEquityChangeReport?.period_shu_amount ?? 0)}>
                      {money(cooperativeEquityChangeReport?.period_shu_amount ?? 0)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('cooperative.reports.equity.ending')}>
                    <Text strong>{money(cooperativeEquityChangeReport?.ending_equity_amount ?? 0)}</Text>
                  </Descriptions.Item>
                </Descriptions>
                <Table
                  dataSource={cooperativeEquityChangeReport?.rows ?? []}
                  columns={financialStatementColumns}
                  rowKey="account_id"
                  loading={isLoading}
                  pagination={false}
                  scroll={{ x: 850 }}
                  locale={{ emptyText: t('cooperative.reports.equity.empty') }}
                />
              </Space>,
            ),
          },
        ]}
      />
    </div>
  );
}
