import { useState, useMemo } from 'react';
import { Table, Button, Card, Tag, Typography, Statistic, Select, Row, Col, Divider, Empty } from 'antd';
import { useFinance } from '@/hooks/useFinance';
import { useCashBankTransfer } from '@/hooks/useCashBankTransfer';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import { formatCurrency, formatDate } from '@/utils/formatters';
import CashBankTransferModal from '@/view/finance/CashBankTransferModal';
import FinanceTransactionModal from '@/view/finance/FinanceTransactionModal';
import type { CashBankTransferFormData } from '@/lib/validations/cashBankTransfer';
import type { FinanceTransactionFormValues } from '@/view/finance/FinanceTransactionModal';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  RefreshCw,
  Plus,
  Minus,
  Banknote,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  LayoutDashboard,
  CreditCard,
  Scale
} from 'lucide-react';
import { FinanceTransaction, FinanceTransactionType } from '@/types';
import {
  FINANCE_CATEGORIES,
  getFinanceTransactionBusinessType,
  isInternalCashMovementFinanceCategory,
} from '@/constants/finance';

const { Title, Text } = Typography;

export default function FinanceManagement() {
  const { balance, transactions, isLoading, addTransaction, isAdding, recalculate, isRecalculating } = useFinance();
  const { cashBankAccounts, recordTransfer, isRecordingTransfer } = useCashBankTransfer();
  const { t } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [modalType, setModalType] = useState<FinanceTransactionType>('INCOME');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('ALL');
  const isMobile = useIsMobile();

  console.log('transcations => ',transactions);
  

  const summary = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (isInternalCashMovementFinanceCategory(t.category)) return acc;

      const businessType = getFinanceTransactionBusinessType(t);

      if (businessType === 'OPENING_BALANCE') acc.opening += t.amount;
      else if (businessType === 'INCOME') acc.income += t.amount;
      else if (businessType === 'EXPENSE') acc.expense += t.amount;
      return acc;
    }, { opening: 0, income: 0, expense: 0 });
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const accountKey = transaction.account_id ?? 'UNMAPPED';
      const matchesAccount = accountFilter === 'ALL' || accountFilter === accountKey;
      const matchesAccountType =
        accountTypeFilter === 'ALL' ||
        (accountTypeFilter === 'UNMAPPED' ? !transaction.account_type : transaction.account_type === accountTypeFilter);

      return matchesAccount && matchesAccountType;
    });
  }, [accountFilter, accountTypeFilter, transactions]);

  console.log('transactions => ',filteredTransactions);
  

  const accountOptions = useMemo(() => {
    const options = new Map<string, string>();
    transactions.forEach((transaction) => {
      if (transaction.account_id && transaction.account_code && transaction.account_name) {
        options.set(transaction.account_id, `${transaction.account_code} - ${transaction.account_name}`);
      }
    });

    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
  }, [transactions]);

  const accountTypeSummary = useMemo(() => {
    return filteredTransactions.reduce<Record<string, number>>((acc, transaction) => {
      const key = transaction.account_type ?? 'UNMAPPED';
      acc[key] = (acc[key] || 0) + transaction.amount;
      return acc;
    }, {});
  }, [filteredTransactions]);

  const cashBankSummary = useMemo(() => {
    const summaryMap = new Map<string, {
      key: string;
      label: string;
      balance: number;
      inflow: number;
      outflow: number;
      count: number;
    }>();

    transactions.forEach((transaction) => {
      const cashAccountId = transaction.cash_account_id
        ?? (transaction.account_type === 'ASSET' ? transaction.account_id : undefined);
      const cashAccountCode = transaction.cash_account_code
        ?? (transaction.account_type === 'ASSET' ? transaction.account_code : undefined);
      const cashAccountName = transaction.cash_account_name
        ?? (transaction.account_type === 'ASSET' ? transaction.account_name : undefined);

      if (!cashAccountId || !cashAccountName) return;

      const businessType = getFinanceTransactionBusinessType(transaction);
      const signedAmount = businessType === 'EXPENSE'
        ? -transaction.amount
        : transaction.amount;
      const existing = summaryMap.get(cashAccountId) ?? {
        key: cashAccountId,
        label: cashAccountCode ? `${cashAccountCode} - ${cashAccountName}` : cashAccountName,
        balance: 0,
        inflow: 0,
        outflow: 0,
        count: 0,
      };

      existing.balance += signedAmount;
      if (signedAmount >= 0) {
        existing.inflow += signedAmount;
      } else {
        existing.outflow += Math.abs(signedAmount);
      }
      existing.count += 1;
      summaryMap.set(cashAccountId, existing);
    });

    return Array.from(summaryMap.values())
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [transactions]);

  const handleAddTransaction = async (values: FinanceTransactionFormValues) => {
    await addTransaction({
      type: modalType,
      ...values,
    });
    setIsModalOpen(false);
  };

  const handleCashBankTransfer = async (values: CashBankTransferFormData) => {
    await recordTransfer(values);
    setIsTransferModalOpen(false);
  };

  const openModal = (type: FinanceTransactionType) => {
    setModalType(type);
    setIsModalOpen(true);
  };

  const getFinanceTypeMeta = (transaction: Pick<FinanceTransaction, 'type' | 'category' | 'transfer_direction'>) => {
    if (transaction.category === FINANCE_CATEGORIES.CASH_BANK_TRANSFER && transaction.transfer_direction) {
      const isTransferOut = transaction.transfer_direction === 'OUT';

      return {
        color: isTransferOut ? 'orange' : 'cyan',
        icon: <ArrowLeftRight size={14} className={isTransferOut ? 'text-orange-500' : 'text-cyan-600'} />,
        label: isTransferOut ? t('finance.transferOut') : t('finance.transferIn'),
      };
    }

    const businessType = getFinanceTransactionBusinessType(transaction);

    if (businessType === 'EXPENSE') {
      return {
        color: 'red',
        icon: <ArrowDownCircle size={14} className="text-red-500" />,
        label: t('finance.expense'),
      };
    }

    if (businessType === 'OPENING_BALANCE') {
      const label =
        transaction.category === FINANCE_CATEGORIES.CAPITAL_ADDITION ? t('finance.capitalAddition') :
          transaction.category === FINANCE_CATEGORIES.DEPOSIT ? t('finance.cashTopUp') :
            transaction.category === FINANCE_CATEGORIES.LOAN ? t('finance.loan') :
              t('finance.openingBalance');

      return {
        color: 'blue',
        icon: <Banknote size={14} className="text-blue-500" />,
        label,
      };
    }

    return {
      color: 'green',
      icon: <ArrowUpCircle size={14} className="text-green-500" />,
      label: t('finance.income'),
    };
  };

  const getTransferDirectionTag = (transaction: FinanceTransaction) => {
    if (!transaction.transfer_group_id || !transaction.transfer_direction) return null;
    if (transaction.category === FINANCE_CATEGORIES.CASH_BANK_TRANSFER) return null;

    return (
      <Tag color={transaction.transfer_direction === 'OUT' ? 'orange' : 'cyan'} className="m-0">
        {transaction.transfer_direction === 'OUT' ? t('finance.transferOut') : t('finance.transferIn')}
      </Tag>
    );
  };

  const columns = [
    {
      title: t('finance.date'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => formatDate(text),
      width: 180,
    },
    {
      title: t('finance.category'),
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => <Tag color="blue">{getFinanceCategoryLabel(cat, t)}</Tag>,
      width: 120,
    },
    {
      title: t('finance.description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('finance.type'),
      dataIndex: 'type',
      key: 'type',
      render: (_type: FinanceTransactionType, record: FinanceTransaction) => {
        const { color, icon, label } = getFinanceTypeMeta(record);

        return (
          <div className="flex flex-col items-start gap-1">
            <Tag color={color} className="m-0">
              <div className="flex items-center gap-1.5">
                {icon}
                {label}
              </div>
            </Tag>
            {getTransferDirectionTag(record)}
          </div>
        );
      },
      width: 140,
    },
    {
      title: t('finance.account'),
      dataIndex: 'account_name',
      key: 'account_name',
      render: (_value: string | undefined, record: FinanceTransaction) => (
        record.account_code && record.account_name ? (
          <Tag color="geekblue">{record.account_code} - {record.account_name}</Tag>
        ) : (
          <Tag color="default">{t('finance.unmappedAccount')}</Tag>
        )
      ),
      width: 220,
    },
    {
      title: t('finance.amount'),
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number, record: FinanceTransaction) => {
        const businessType = getFinanceTransactionBusinessType(record);

        return (
        <span className={businessType === 'EXPENSE' ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
          {businessType === 'EXPENSE' ? '-' : '+'} Rp {formatCurrency(amount)}
        </span>
      );
      },
      width: 150,
    },
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col flex-wrap md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Title level={2} style={{ margin: 0 }}>{t('finance.title')}</Title>
          <Text type="secondary">{t('finance.subtitle')}</Text>
        </div>
        {!isMobile &&
          <div className="flex flex-wrap gap-3">
            <Button
              icon={<RefreshCw size={16} />}
              onClick={() => recalculate()}
              loading={isRecalculating}
            >
              {t('finance.recalculate')}
            </Button>
            <Button
              icon={<Banknote size={16} />}
              onClick={() => openModal('OPENING_BALANCE')}
            >
              {t('finance.balanceCapital')}
            </Button>
            <Button
              icon={<ArrowLeftRight size={16} />}
              onClick={() => setIsTransferModalOpen(true)}
            >
              {t('finance.transfer')}
            </Button>
            <Button
              icon={<Scale size={16} />}
              href="/finance/cash-bank-reconciliation"
            >
              Rekonsiliasi
            </Button>
            <Button
              type="primary"
              icon={<Plus size={16} />}
              onClick={() => openModal('INCOME')}
              className="bg-green-600 hover:bg-green-700 border-none"
            >
              {t('finance.income')}
            </Button>
            <Button
              type="primary"
              danger
              icon={<Minus size={16} />}
              onClick={() => openModal('EXPENSE')}
            >
              {t('finance.expense')}
            </Button>
          </div>
        }
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={0} md={24}>
          <Card className="shadow-sm border-l-4 border-l-blue-500">
            <Statistic
              title={t('finance.openingBalanceAndCapital')}
              value={summary.opening}
              formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
              prefix={<Banknote size={20} className="text-blue-500 mr-2" />}
              style={{ fontSize: '1.25rem', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={24} md={0}>
          <div
            style={{
              background: '#2563EB',
              borderRadius: 16,
              padding: '20px',
              color: '#fff',
              position: 'relative',
            }}
          >
            {/* top-right card icon */}
            <CreditCard
              style={{ position: 'absolute', top: 20, right: 20, fontSize: 20, opacity: 0.75 }}
            />

            <Text style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.5px' }}>
              {t('finance.balanceAndCapitalMobile')}
            </Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: '4px 0 14px' }}>
              {formatCurrency(summary.opening)}
            </div>

            <Divider style={{ borderColor: 'rgba(255,255,255,0.25)', margin: '0 0 14px' }} />

            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{t('finance.cashOnHandNet')}</Text>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginTop: 2 }}>
              {formatCurrency(balance)}
            </div>

            {/* bottom-right trend icon */}
            <TrendingUp
              style={{ position: 'absolute', bottom: 20, right: 20, fontSize: 18, opacity: 0.8 }}
            />

          </div>
        </Col>
        <Col xs={12} sm={12} md={8}>
          <Card className="shadow-sm border-l-4 border-l-green-500">
            <Statistic
              title={t('finance.totalIncome')}
              value={summary.income}
              formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
              prefix={<TrendingUp size={20} className="text-green-500 mr-2" />}
              style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#16a34a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8}>
          <Card className="shadow-sm border-l-4 border-l-red-500">
            <Statistic
              title={t('finance.totalExpense')}
              value={summary.expense}
              formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
              prefix={<TrendingDown size={20} className="text-red-500 mr-2" />}
              style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#dc2626' }}
            />
          </Card>
        </Col>
        <Col xs={0} md={8}>
          <Card className="shadow-sm border-l-4 border-l-indigo-600 bg-indigo-50">
            <Statistic
              title={t('finance.cashOnHandNetTitle')}
              value={balance}
              formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
              prefix={<Wallet size={20} className="text-indigo-600 mr-2" />}
              style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#4f46e5' }}
            />
          </Card>
        </Col>
      </Row>

      {
        isMobile &&
        <Row gutter={[12, 12]}>
          <Col xs={8} sm={8} md={8}>
            <Button
              onClick={() => recalculate()}
              loading={isRecalculating}
              className="h-16 flex flex-col items-center justify-center w-full"
            >
              <RefreshCw size={18} />
              <span className="text-[10px] mt-1">{t('finance.recalculate')}</span>
            </Button>
          </Col>

          <Col xs={8} sm={8} md={8}>
            <Button
              onClick={() => openModal('OPENING_BALANCE')}
              className="h-16 flex flex-col items-center justify-center w-full"
            >
              <Banknote size={18} />
              <span className="text-[10px] mt-1">{t('finance.balanceCapitalShort')}</span>
            </Button>
          </Col>

          <Col xs={8} sm={8} md={8}>
            <Button
              onClick={() => setIsTransferModalOpen(true)}
              className="h-16 flex flex-col items-center justify-center w-full"
            >
              <ArrowLeftRight size={18} />
              <span className="text-[10px] mt-1">{t('finance.transfer')}</span>
            </Button>
          </Col>

          <Col xs={8} sm={8} md={8}>
            <Button
              href="/finance/cash-bank-reconciliation"
              className="h-16 flex flex-col items-center justify-center w-full"
            >
              <Scale size={18} />
              <span className="text-[10px] mt-1">Rekonsiliasi</span>
            </Button>
          </Col>

          <Col xs={8} sm={8} md={8}>
            <Button
              type="primary"
              onClick={() => openModal('INCOME')}
              className="h-16 flex flex-col items-center justify-center w-full bg-green-600 hover:bg-green-700 border-none"
            >
              <Plus size={18} />
              <span className="text-[10px] mt-1">{t('finance.income')}</span>
            </Button>
          </Col>

          <Col xs={8} sm={8} md={8}>
            <Button
              danger
              type="primary"
              onClick={() => openModal('EXPENSE')}
              className="h-16 flex flex-col items-center justify-center w-full"
            >
              <Minus size={18} />
              <span className="text-[10px] mt-1">{t('finance.expense')}</span>
            </Button>
          </Col>
        </Row>
      }

      <Card
        title={
          <div className="flex items-center gap-2">
            <Banknote size={18} />
            <span>{t('finance.cashBankSummaryTitle')}</span>
          </div>
        }
        className="shadow-sm"
        styles={{ body: { padding: isMobile ? '12px' : undefined } }}
      >
        {cashBankSummary.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cashBankSummary.map((item) => (
              <div key={item.key} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                    <div className="text-xs text-gray-500">
                      {t('finance.cashBankTransactionCount', { count: item.count })}
                    </div>
                  </div>
                  <Tag color={item.balance >= 0 ? 'green' : 'red'}>
                    Rp {formatCurrency(item.balance)}
                  </Tag>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-white p-2">
                    <div className="text-gray-500">{t('finance.cashBankInflow')}</div>
                    <div className="font-semibold text-green-600">Rp {formatCurrency(item.inflow)}</div>
                  </div>
                  <div className="rounded bg-white p-2">
                    <div className="text-gray-500">{t('finance.cashBankOutflow')}</div>
                    <div className="font-semibold text-red-600">Rp {formatCurrency(item.outflow)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('finance.cashBankSummaryEmpty')} />
        )}
      </Card>

      <Card
        title={
          <div className="flex items-center gap-2">
            <LayoutDashboard size={18} />
            <span>{t('finance.historyTitle')}</span>
          </div>
        }
        className="shadow-sm"
        styles={{ body: { padding: isMobile ? '12px' : undefined } }}
      >
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1fr)_220px]">
          <Select
            value={accountFilter}
            onChange={setAccountFilter}
            options={[
              { value: 'ALL', label: t('finance.allAccounts') },
              { value: 'UNMAPPED', label: t('finance.unmappedAccount') },
              ...accountOptions,
            ]}
          />
          <Select
            value={accountTypeFilter}
            onChange={setAccountTypeFilter}
            options={[
              { value: 'ALL', label: t('finance.allAccountTypes') },
              { value: 'ASSET', label: t('coa.accountType.ASSET') },
              { value: 'LIABILITY', label: t('coa.accountType.LIABILITY') },
              { value: 'EQUITY', label: t('coa.accountType.EQUITY') },
              { value: 'REVENUE', label: t('coa.accountType.REVENUE') },
              { value: 'CONTRA_REVENUE', label: t('coa.accountType.CONTRA_REVENUE') },
              { value: 'EXPENSE', label: t('coa.accountType.EXPENSE') },
              { value: 'UNMAPPED', label: t('finance.unmappedAccount') },
            ]}
          />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(accountTypeSummary).map(([type, amount]) => (
            <Tag key={type} color={type === 'UNMAPPED' ? 'default' : 'blue'}>
              {type === 'UNMAPPED' ? t('finance.unmappedAccount') : t(`coa.accountType.${type}` as TranslationKey)}: Rp {formatCurrency(amount)}
            </Tag>
          ))}
        </div>
        {isMobile ? (
          <div className="space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 gap-3">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              <p className="text-gray-500 text-sm">{t('finance.loadingData')}</p>
            </div>
          ) : filteredTransactions.length > 0 ? (
            <>
              {filteredTransactions.slice(0, 10).map((transaction) => {
                const businessType = getFinanceTransactionBusinessType(transaction);
                const { icon, label } = getFinanceTypeMeta(transaction);

                return (
                  <div
                    key={transaction.id}
                    className="bg-white rounded-lg border border-gray-100 p-3 shadow-sm active:bg-gray-50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                          {formatDate(transaction.created_at)}
                        </span>
                        <Tag color="blue" className="w-fit m-0 text-[10px] px-1.5 py-0">
                          {getFinanceCategoryLabel(transaction.category, t)}
                        </Tag>
                        <Tag color={transaction.account_code ? 'geekblue' : 'default'} className="w-fit m-0 text-[10px] px-1.5 py-0">
                          {transaction.account_code && transaction.account_name
                            ? `${transaction.account_code} - ${transaction.account_name}`
                            : t('finance.unmappedAccount')}
                        </Tag>
                        {transaction.transfer_group_id && transaction.transfer_direction && transaction.category !== FINANCE_CATEGORIES.CASH_BANK_TRANSFER && (
                          <Tag
                            color={transaction.transfer_direction === 'OUT' ? 'orange' : 'cyan'}
                            className="w-fit m-0 text-[10px] px-1.5 py-0"
                          >
                            {transaction.transfer_direction === 'OUT' ? t('finance.transferOut') : t('finance.transferIn')}
                          </Tag>
                        )}
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${businessType === 'EXPENSE' ? 'text-red-600' : 'text-green-600'}`}>
                          {businessType === 'EXPENSE' ? '-' : '+'} Rp {formatCurrency(transaction.amount)}
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          {icon}
                          <span className="text-[10px] text-gray-400">
                            {label}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded italic">
                      {transaction.description}
                    </div>
                  </div>
                );
              })}
              {filteredTransactions.length > 10 && (
                <div className="text-center py-2">
                  <Text type="secondary" className="text-xs">{t('finance.viewMoreDesktop')}</Text>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">
              {t('finance.emptyHistory')}
            </div>
          )}
          </div>
        ) : (
          <Table
            dataSource={filteredTransactions}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 800 }}
          />
        )}
      </Card>

      <CashBankTransferModal
        open={isTransferModalOpen}
        onCancel={() => setIsTransferModalOpen(false)}
        accounts={cashBankAccounts}
        onSubmit={handleCashBankTransfer}
        submitting={isRecordingTransfer}
      />

      <FinanceTransactionModal
        open={isModalOpen}
        type={modalType}
        accounts={cashBankAccounts}
        onCancel={() => setIsModalOpen(false)}
        onSubmit={handleAddTransaction}
        submitting={isAdding}
      />
    </div>
  );
}
