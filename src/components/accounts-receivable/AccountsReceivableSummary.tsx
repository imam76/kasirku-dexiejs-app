import { Card, Col, Row, Statistic } from 'antd';
import { AlertCircle, Clock, FileText, Wallet } from 'lucide-react';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import type { AccountsReceivableSummary as AccountsReceivableSummaryValue } from '@/hooks/useAccountsReceivable';
import { formatCurrency } from '@/utils/formatters';

interface AccountsReceivableSummaryProps {
  summary: AccountsReceivableSummaryValue;
}

export function AccountsReceivableSummary({ summary }: AccountsReceivableSummaryProps) {
  const { t } = useI18n();
  const { baseCurrencySymbol } = useBaseCurrency();

  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small" className="border-l-4 border-l-blue-500">
          <Statistic
            title={t('accountsReceivable.totalOutstanding')}
            value={summary.total_outstanding}
            formatter={(value) => `${baseCurrencySymbol} ${formatCurrency(Number(value))}`}
            prefix={<Wallet size={18} className="mr-2 text-blue-600" />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small" className="border-l-4 border-l-emerald-500">
          <Statistic
            title={t('accountsReceivable.current')}
            value={summary.total_current}
            formatter={(value) => `${baseCurrencySymbol} ${formatCurrency(Number(value))}`}
            prefix={<Clock size={18} className="mr-2 text-emerald-600" />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small" className="border-l-4 border-l-rose-500">
          <Statistic
            title={t('accountsReceivable.overdue')}
            value={summary.total_overdue}
            formatter={(value) => `${baseCurrencySymbol} ${formatCurrency(Number(value))}`}
            prefix={<AlertCircle size={18} className="mr-2 text-rose-600" />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small" className="border-l-4 border-l-slate-500">
          <Statistic
            title={t('accountsReceivable.invoiceCount')}
            value={summary.open_invoice_count}
            suffix={`/ ${summary.invoice_count}`}
            prefix={<FileText size={18} className="mr-2 text-slate-600" />}
          />
        </Card>
      </Col>
    </Row>
  );
}
