import { useMemo, useState } from 'react';
import { Button, Card, DatePicker, Input, Select, Space, Typography } from 'antd';
import { Search, X } from 'lucide-react';
import { AccountsReceivableSummary } from '@/components/accounts-receivable/AccountsReceivableSummary';
import { AccountsReceivableTable } from '@/components/accounts-receivable/AccountsReceivableTable';
import { ReceivablePaymentModal } from '@/components/accounts-receivable/ReceivablePaymentModal';
import { useAccountsReceivable } from '@/hooks/useAccountsReceivable';
import { useI18n } from '@/hooks/useI18n';
import type {
  AccountsReceivableRow,
  ReceivableAgingBucket,
  SalesInvoicePaymentStatus,
} from '@/types';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

type PaymentStatusFilter = SalesInvoicePaymentStatus | 'ALL';
type AgingFilter = ReceivableAgingBucket | 'ALL';

export default function AccountsReceivableManagement() {
  const { t } = useI18n();
  const [searchText, setSearchText] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>('ALL');
  const [agingBucket, setAgingBucket] = useState<AgingFilter>('ALL');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState<string>();
  const [invoiceDateTo, setInvoiceDateTo] = useState<string>();
  const [dueDateFrom, setDueDateFrom] = useState<string>();
  const [dueDateTo, setDueDateTo] = useState<string>();
  const [selectedPaymentRow, setSelectedPaymentRow] = useState<AccountsReceivableRow>();
  const filters = useMemo(() => ({
    search: searchText,
    paymentStatus,
    agingBucket,
    invoiceDateFrom,
    invoiceDateTo,
    dueDateFrom,
    dueDateTo,
  }), [agingBucket, dueDateFrom, dueDateTo, invoiceDateFrom, invoiceDateTo, paymentStatus, searchText]);
  const { receivableRows, summary, recordPayment, isMutating } = useAccountsReceivable(filters);

  const resetFilters = () => {
    setSearchText('');
    setPaymentStatus('ALL');
    setAgingBucket('ALL');
    setInvoiceDateFrom(undefined);
    setInvoiceDateTo(undefined);
    setDueDateFrom(undefined);
    setDueDateTo(undefined);
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div>
        <Title level={2} style={{ margin: 0 }}>{t('accountsReceivable.title')}</Title>
        <Text type="secondary">{t('accountsReceivable.subtitle')}</Text>
      </div>

      <AccountsReceivableSummary summary={summary} />

      <Card size="small">
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1.4fr)_180px_190px_260px_260px_auto]">
          <Input
            allowClear
            prefix={<Search size={14} />}
            placeholder={t('accountsReceivable.searchPlaceholder')}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            value={paymentStatus}
            onChange={setPaymentStatus}
            options={[
              { value: 'ALL', label: t('accountsReceivable.allPaymentStatuses') },
              { value: 'UNPAID', label: t('salesDocuments.paymentStatus.unpaid') },
              { value: 'PARTIAL', label: t('salesDocuments.paymentStatus.partial') },
              { value: 'PAID', label: t('salesDocuments.paymentStatus.paid') },
            ]}
          />
          <Select
            value={agingBucket}
            onChange={setAgingBucket}
            options={[
              { value: 'ALL', label: t('accountsReceivable.allAging') },
              { value: 'CURRENT', label: t('accountsReceivable.status.current') },
              { value: 'OVERDUE_1_30', label: t('accountsReceivable.status.overdue1To30') },
              { value: 'OVERDUE_31_60', label: t('accountsReceivable.status.overdue31To60') },
              { value: 'OVERDUE_61_90', label: t('accountsReceivable.status.overdue61To90') },
              { value: 'OVERDUE_90_PLUS', label: t('accountsReceivable.status.overdue90Plus') },
            ]}
          />
          <RangePicker
            placeholder={[t('accountsReceivable.invoiceDateFrom'), t('accountsReceivable.invoiceDateTo')]}
            onChange={(_dates, dateStrings) => {
              setInvoiceDateFrom(dateStrings[0] || undefined);
              setInvoiceDateTo(dateStrings[1] || undefined);
            }}
          />
          <RangePicker
            placeholder={[t('accountsReceivable.dueDateFrom'), t('accountsReceivable.dueDateTo')]}
            onChange={(_dates, dateStrings) => {
              setDueDateFrom(dateStrings[0] || undefined);
              setDueDateTo(dateStrings[1] || undefined);
            }}
          />
          <Space>
            <Button icon={<X size={14} />} onClick={resetFilters}>
              {t('common.reset')}
            </Button>
          </Space>
        </div>
      </Card>

      <AccountsReceivableTable
        rows={receivableRows}
        onRecordPayment={setSelectedPaymentRow}
      />

      <ReceivablePaymentModal
        open={Boolean(selectedPaymentRow)}
        row={selectedPaymentRow}
        loading={isMutating}
        onCancel={() => setSelectedPaymentRow(undefined)}
        onSubmit={async (input) => {
          if (!selectedPaymentRow) return;
          await recordPayment({ invoiceId: selectedPaymentRow.sales_document_id, input });
          setSelectedPaymentRow(undefined);
        }}
      />
    </div>
  );
}
