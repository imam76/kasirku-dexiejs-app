import { useMemo, useState } from 'react';
import { Button, Card, Input, Typography } from 'antd';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  AccountsReceivableFilterModal,
  type AccountsReceivableFilterValues,
} from '@/components/accounts-receivable/AccountsReceivableFilterModal';
import { AccountsReceivableSummary } from '@/components/accounts-receivable/AccountsReceivableSummary';
import { AccountsReceivableTable } from '@/components/accounts-receivable/AccountsReceivableTable';
import { ReceivablePaymentModal } from '@/components/accounts-receivable/ReceivablePaymentModal';
import { useAccountsReceivable } from '@/hooks/useAccountsReceivable';
import { useI18n } from '@/hooks/useI18n';
import type { AccountsReceivableRow } from '@/types';

const { Title, Text } = Typography;

const DEFAULT_FILTERS: AccountsReceivableFilterValues = {
  paymentStatus: 'ALL',
  agingBucket: 'ALL',
};

const countActiveFilters = (filters: AccountsReceivableFilterValues) => {
  return [
    filters.paymentStatus !== 'ALL',
    filters.agingBucket !== 'ALL',
    Boolean(filters.invoiceDateFrom || filters.invoiceDateTo),
    Boolean(filters.dueDateFrom || filters.dueDateTo),
  ].filter(Boolean).length;
};

export default function AccountsReceivableManagement() {
  const { t } = useI18n();
  const [searchText, setSearchText] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState<AccountsReceivableFilterValues>(DEFAULT_FILTERS);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedPaymentRow, setSelectedPaymentRow] = useState<AccountsReceivableRow>();
  const filters = useMemo(() => ({
    search: searchText,
    ...advancedFilters,
  }), [advancedFilters, searchText]);
  const { receivableRows, summary, recordPayment, isMutating } = useAccountsReceivable(filters);
  const activeFilterCount = useMemo(() => countActiveFilters(advancedFilters), [advancedFilters]);

  const resetFilters = () => {
    setSearchText('');
    setAdvancedFilters(DEFAULT_FILTERS);
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div>
        <Title level={2} style={{ margin: 0 }}>{t('accountsReceivable.title')}</Title>
        <Text type="secondary">{t('accountsReceivable.subtitle')}</Text>
      </div>

      <AccountsReceivableSummary summary={summary} />

      <Card size="small">
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto_auto]">
          <Input
            allowClear
            prefix={<Search size={14} />}
            placeholder={t('accountsReceivable.searchPlaceholder')}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Button
            icon={<SlidersHorizontal size={14} />}
            onClick={() => setIsFilterModalOpen(true)}
          >
            {activeFilterCount > 0
              ? t('accountsReceivable.filterWithCount', { count: activeFilterCount })
              : t('accountsReceivable.filter')}
          </Button>
          <Button icon={<X size={14} />} onClick={resetFilters}>
            {t('common.reset')}
          </Button>
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
          await recordPayment({ row: selectedPaymentRow, input });
          setSelectedPaymentRow(undefined);
        }}
      />

      <AccountsReceivableFilterModal
        open={isFilterModalOpen}
        value={advancedFilters}
        onCancel={() => setIsFilterModalOpen(false)}
        onReset={() => {
          setAdvancedFilters(DEFAULT_FILTERS);
          setIsFilterModalOpen(false);
        }}
        onApply={(nextFilters) => {
          setAdvancedFilters(nextFilters);
          setIsFilterModalOpen(false);
        }}
      />
    </div>
  );
}
