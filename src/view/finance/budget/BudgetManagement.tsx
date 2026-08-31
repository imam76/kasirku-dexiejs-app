import { useState } from 'react';
import { App, Button, Card, DatePicker, Form, Input, Progress, Segmented, Select, Tag } from 'antd';
import type { Dayjs } from 'dayjs';
import { Edit2, Archive, ListChecks, Wallet2, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { GlobalBreadcrumb } from '@/components/GlobalBreadcrumb';
import {
  MobileCrudPageHeader,
  ResponsiveCrudCollection,
  type MobileCrudAction,
} from '@/components/mobile-crud';
import dayjs from '@/lib/dayjs';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import {
  useBudgets,
  type BudgetActiveFilter,
  type BudgetPeriodTypeFilter,
  type BudgetStatusFilter,
  type BudgetTypeFilter,
} from '@/hooks/useBudgets';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Budget } from '@/types';
import type { BudgetRealization } from '@/services/budgetRealizationService';
import type { BudgetUpsertInput } from '@/services/budgetService';
import { formatCurrency } from '@/utils/formatters';
import BudgetCommitmentDrawer from './BudgetCommitmentDrawer';
import BudgetFormModal, { type BudgetFormValues } from './BudgetFormModal';
import BudgetTable from './BudgetTable';
import {
  BUDGET_STATUS_COLOR,
  BUDGET_STATUS_LABEL_KEY,
  PROJECTED_BUDGET_STATUS_LABEL_KEY,
  formatBudgetPeriodLabel,
} from './budgetFormatters';

export default function BudgetManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [form] = Form.useForm<BudgetFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [viewingCommitmentsBudget, setViewingCommitmentsBudget] = useState<Budget | null>(null);
  const {
    budgets,
    isLoading,
    budgetsWithRealization,
    filteredBudgetsWithRealization,
    editingBudget,
    searchText,
    setSearchText,
    periodTypeFilter,
    setPeriodTypeFilter,
    periodKeyFilter,
    setPeriodKeyFilter,
    typeFilter,
    setTypeFilter,
    activeFilter,
    setActiveFilter,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveBudget,
    restoreBudget,
    isSubmitting,
  } = useBudgets();

  const activeFilterCount = [
    Boolean(searchText.trim()),
    typeFilter !== 'ALL',
    activeFilter !== 'active',
    statusFilter !== 'ALL',
    periodTypeFilter !== 'ALL',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearchText('');
    setPeriodTypeFilter('ALL');
    setTypeFilter('ALL');
    setActiveFilter('active');
    setStatusFilter('ALL');
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({
      budget_type: 'EXPENSE',
      period_type: 'MONTHLY',
      period: dayjs(),
      warning_threshold_percent: 80,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (budget: Budget) => {
    handleEdit(budget);
    form.resetFields();
    form.setFieldsValue({
      name: budget.name,
      budget_type: budget.budget_type,
      category: budget.category,
      period_type: budget.period_type,
      period: dayjs(budget.period_key, budget.period_type === 'MONTHLY' ? 'YYYY-MM' : 'YYYY'),
      planned_amount: budget.planned_amount,
      warning_threshold_percent: budget.warning_threshold_percent,
      notes: budget.notes,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: BudgetUpsertInput) => {
    try {
      const wasEditing = Boolean(editingBudget);
      await submitForm(values);
      message.success(wasEditing ? t('budget.updateSuccess') : t('budget.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('budget.saveFailed'));
    }
  };

  const handleArchive = (budget: Budget) => {
    modal.confirm({
      title: t('budget.archiveConfirmTitle'),
      content: t('budget.archiveConfirmContent', { name: budget.name }),
      okText: t('budget.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveBudget(budget.id);
          message.success(t('budget.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('budget.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (budget: Budget) => {
    try {
      await restoreBudget(budget.id);
      message.success(t('budget.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('budget.restoreFailed'));
    }
  };

  const periodFilterValue = periodTypeFilter === 'ALL'
    ? null
    : dayjs(periodKeyFilter, periodTypeFilter === 'MONTHLY' ? 'YYYY-MM' : 'YYYY');

  const handlePeriodFilterChange = (value: Dayjs | null) => {
    if (!value || periodTypeFilter === 'ALL') return;
    setPeriodKeyFilter(value.format(periodTypeFilter === 'MONTHLY' ? 'YYYY-MM' : 'YYYY'));
  };

  const renderFilterControls = (mobile = false) => (
    <div className={mobile ? 'space-y-3' : 'flex flex-wrap items-end gap-3'}>
      <Input.Search
        allowClear
        size={mobile ? 'large' : 'middle'}
        value={searchText}
        aria-label={t('budget.filter.searchPlaceholder')}
        placeholder={t('budget.filter.searchPlaceholder')}
        onChange={(event) => setSearchText(event.target.value)}
        className={mobile ? undefined : 'w-full sm:w-60'}
      />
      <Segmented<BudgetPeriodTypeFilter>
        block={mobile}
        value={periodTypeFilter}
        onChange={setPeriodTypeFilter}
        options={[
          { value: 'MONTHLY', label: t('budget.periodType.monthly') },
          { value: 'YEARLY', label: t('budget.periodType.yearly') },
          { value: 'ALL', label: t('budget.filter.allPeriods') },
        ]}
      />
      {periodTypeFilter !== 'ALL' ? (
        <DatePicker
          className={mobile ? 'w-full' : 'w-40'}
          size={mobile ? 'large' : 'middle'}
          picker={periodTypeFilter === 'MONTHLY' ? 'month' : 'year'}
          value={periodFilterValue}
          onChange={handlePeriodFilterChange}
          allowClear={false}
        />
      ) : null}
      <Select<BudgetTypeFilter>
        size={mobile ? 'large' : 'middle'}
        value={typeFilter}
        onChange={setTypeFilter}
        className={mobile ? 'w-full' : 'w-40'}
        options={[
          { value: 'ALL', label: t('budget.filter.allTypes') },
          { value: 'EXPENSE', label: t('budget.type.expense') },
          { value: 'INCOME', label: t('budget.type.income') },
        ]}
      />
      <Select<BudgetActiveFilter>
        size={mobile ? 'large' : 'middle'}
        value={activeFilter}
        onChange={setActiveFilter}
        className={mobile ? 'w-full' : 'w-40'}
        options={[
          { value: 'active', label: t('budget.filter.active') },
          { value: 'inactive', label: t('budget.filter.inactive') },
          { value: 'all', label: t('budget.filter.allStatuses') },
        ]}
      />
      <Select<BudgetStatusFilter>
        size={mobile ? 'large' : 'middle'}
        value={statusFilter}
        onChange={setStatusFilter}
        className={mobile ? 'w-full' : 'w-40'}
        options={[
          { value: 'ALL', label: t('budget.filter.allProgress') },
          { value: 'SAFE', label: t(BUDGET_STATUS_LABEL_KEY.SAFE) },
          { value: 'WARNING', label: t(BUDGET_STATUS_LABEL_KEY.WARNING) },
          { value: 'OVER', label: t(BUDGET_STATUS_LABEL_KEY.OVER) },
        ]}
      />
    </div>
  );

  const renderMobileCard = (realization: BudgetRealization) => {
    const { budget } = realization;
    return (
      <div className="space-y-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <Wallet2 aria-hidden size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{budget.name}</span>
              <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                {getFinanceCategoryLabel(budget.category, t)} · {formatBudgetPeriodLabel(budget)}
              </span>
            </span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Tag className="m-0" color={BUDGET_STATUS_COLOR[realization.status]}>
              {t(BUDGET_STATUS_LABEL_KEY[realization.status])}
            </Tag>
            {realization.committed_amount > 0 ? (
              <Tag className="m-0" color={BUDGET_STATUS_COLOR[realization.projected_status]}>
                {t('budget.projectedStatus.badge', { status: t(PROJECTED_BUDGET_STATUS_LABEL_KEY[realization.projected_status]) })}
              </Tag>
            ) : null}
          </div>
        </div>

        <Progress
          size="small"
          percent={Math.min(Math.round(realization.usage_percent), 100)}
          status={realization.status === 'OVER' ? 'exception' : 'normal'}
          strokeColor={realization.status === 'WARNING' ? '#faad14' : undefined}
        />

        <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span>{t('budget.mobile.planned')}: Rp {formatCurrency(budget.planned_amount)}</span>
          <span>{t('budget.mobile.actual')}: Rp {formatCurrency(realization.actual_amount)}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      {isMobile ? (
        <MobileCrudPageHeader
          testId="mobile-budget-page-header"
          title={t('budget.title')}
          icon={<Wallet2 aria-hidden className="h-5 w-5 shrink-0" />}
          breadcrumb={<GlobalBreadcrumb pathname="/finance/budget" compact />}
        />
      ) : null}

      <Card
        className={isMobile ? '' : 'shadow-md'}
        style={isMobile ? { background: 'transparent', border: 0, boxShadow: 'none' } : undefined}
        styles={isMobile ? { body: { padding: 0 } } : undefined}
        title={!isMobile ? (
          <div className="flex items-center gap-2">
            <Wallet2 className="h-5 w-5" />
            {t('budget.title')}
          </div>
        ) : undefined}
        extra={!isMobile ? (
          <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal} data-tour="budget-add">
            {t('budget.add')}
          </Button>
        ) : undefined}
      >
        <ResponsiveCrudCollection<BudgetRealization>
          desktop={(
            <>
              <div className="mb-4">{renderFilterControls()}</div>
              <BudgetTable
                budgetsWithRealization={filteredBudgetsWithRealization}
                loading={isLoading}
                onEdit={openEditModal}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onViewCommitments={setViewingCommitmentsBudget}
              />
            </>
          )}
          mobileFilter={{
            open: isFilterOpen,
            title: t('budget.filter.title'),
            onClose: () => setIsFilterOpen(false),
            onReset: resetFilters,
            resetDisabled: activeFilterCount === 0,
            resetLabel: t('budget.filter.reset'),
            applyLabel: t('budget.filter.apply'),
            children: (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <SlidersHorizontal aria-hidden size={18} />
                  <span>{t('budget.filter.title')}</span>
                </div>
                {renderFilterControls(true)}
              </div>
            ),
          }}
          mobileList={{
            items: filteredBudgetsWithRealization,
            getKey: (realization) => realization.budget.id,
            loading: isLoading,
            resetKey: JSON.stringify([searchText, periodTypeFilter, periodKeyFilter, typeFilter, activeFilter, statusFilter]),
            resultSummary: t('budget.filter.summary', { shown: filteredBudgetsWithRealization.length, total: budgets.length }),
            emptyText: activeFilterCount > 0 ? t('budget.filter.noResults') : t('budget.empty'),
            emptyAction: activeFilterCount === 0 ? (
              <Button type="primary" size="large" icon={<Plus size={18} />} onClick={openAddModal}>
                {t('budget.add')}
              </Button>
            ) : undefined,
            loadMoreLabel: (remaining) => t('budget.mobile.loadMore', { count: remaining }),
            getItemAriaLabel: (realization) => realization.budget.name,
            getActionsAriaLabel: (realization) => t('budget.mobile.actionsAria', { name: realization.budget.name }),
            getActionSheetTitle: (realization) => realization.budget.name,
            getActions: (realization): MobileCrudAction<BudgetRealization>[] => [
              {
                key: 'edit',
                label: t('budget.edit'),
                icon: <Edit2 aria-hidden size={19} />,
                onSelect: (item) => openEditModal(item.budget),
              },
              {
                key: 'viewCommitments',
                label: t('budget.commitment.view'),
                icon: <ListChecks aria-hidden size={19} />,
                onSelect: (item) => setViewingCommitmentsBudget(item.budget),
              },
              realization.budget.is_active ? {
                key: 'archive',
                label: t('budget.archive'),
                icon: <Archive aria-hidden size={19} />,
                danger: true,
                onSelect: (item) => handleArchive(item.budget),
              } : {
                key: 'restore',
                label: t('budget.restore'),
                icon: <RotateCcw aria-hidden size={19} />,
                onSelect: (item) => handleRestore(item.budget),
              },
            ],
            renderItem: renderMobileCard,
          }}
          mobileFloatingActions={{
            actions: [
              {
                key: 'add',
                type: 'primary',
                icon: <Plus size={24} />,
                label: t('budget.add'),
                testId: 'budget-add-fab',
                tourId: 'budget-add',
                onClick: openAddModal,
              },
              {
                key: 'filter',
                icon: <SlidersHorizontal size={22} />,
                label: t('budget.filter.title'),
                badge: { count: activeFilterCount, color: '#fa8c16' },
                testId: 'budget-filter-fab',
                onClick: () => setIsFilterOpen(true),
              },
            ],
          }}
        />

        <BudgetFormModal
          form={form}
          open={isModalOpen}
          isEditing={Boolean(editingBudget)}
          isSubmitting={isSubmitting}
          onCancel={closeModal}
          onSubmit={handleSubmit}
        />

        <BudgetCommitmentDrawer
          open={Boolean(viewingCommitmentsBudget)}
          budget={viewingCommitmentsBudget}
          realization={
            viewingCommitmentsBudget
              ? budgetsWithRealization.find((realization) => realization.budget.id === viewingCommitmentsBudget.id) ?? null
              : null
          }
          onClose={() => setViewingCommitmentsBudget(null)}
        />
      </Card>
    </>
  );
}
