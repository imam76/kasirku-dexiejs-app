import { useState } from 'react';
import { App, Button, Empty, Form, Tag, Tooltip, Typography } from 'antd';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { ResponsiveCrudEditor, MobileCrudList, type MobileCrudAction } from '@/components/mobile-crud';
import { useBudgetCommitments } from '@/hooks/useBudgetCommitments';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { BudgetRealization } from '@/services/budgetRealizationService';
import type { Budget, BudgetCommitment } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import BudgetCommitmentFormModal, { type BudgetCommitmentFormValues } from './BudgetCommitmentFormModal';
import BudgetCommitmentTable from './BudgetCommitmentTable';
import { BUDGET_COMMITMENT_STATUS_COLOR, BUDGET_COMMITMENT_STATUS_LABEL_KEY } from './budgetFormatters';

const { Text } = Typography;

interface BudgetCommitmentDrawerProps {
  open: boolean;
  budget: Budget | null;
  realization: BudgetRealization | null;
  onClose: () => void;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export default function BudgetCommitmentDrawer({
  open,
  budget,
  realization,
  onClose,
}: BudgetCommitmentDrawerProps) {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [form] = Form.useForm<BudgetCommitmentFormValues>();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const {
    commitments,
    isLoading,
    editingCommitment,
    handleEdit,
    resetForm,
    submitForm,
    deleteCommitment,
    markRealized,
    cancelCommitment,
    isSubmitting,
  } = useBudgetCommitments(budget?.id);

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddForm = () => {
    resetForm();
    form.resetFields();
    setIsFormOpen(true);
  };

  const openEditForm = (commitment: BudgetCommitment) => {
    handleEdit(commitment);
    form.resetFields();
    form.setFieldsValue({
      description: commitment.description,
      amount: commitment.amount,
      notes: commitment.notes,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (values: BudgetCommitmentFormValues) => {
    if (!budget) return;
    try {
      const wasEditing = Boolean(editingCommitment);
      await submitForm({ budget_id: budget.id, ...values });
      message.success(wasEditing ? t('budget.commitment.updateSuccess') : t('budget.commitment.createSuccess'));
      closeForm();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('budget.commitment.saveFailed'));
    }
  };

  const handleMarkRealized = async (commitment: BudgetCommitment) => {
    try {
      await markRealized(commitment);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('budget.commitment.markRealizedFailed'));
    }
  };

  const handleCancel = async (commitment: BudgetCommitment) => {
    try {
      await cancelCommitment(commitment);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('budget.commitment.cancelFailed'));
    }
  };

  const handleDelete = (commitment: BudgetCommitment) => {
    modal.confirm({
      title: t('budget.commitment.deleteConfirmTitle'),
      content: t('budget.commitment.deleteConfirmContent', { description: commitment.description }),
      okText: t('budget.commitment.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteCommitment(commitment.id);
          message.success(t('budget.commitment.deleteSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('budget.commitment.deleteFailed'));
        }
      },
    });
  };

  if (!budget || !realization) {
    return (
      <ResponsiveCrudEditor open={open} title={t('budget.commitment.title')} onClose={onClose} desktopWidth={720} footer={null}>
        <Empty />
      </ResponsiveCrudEditor>
    );
  }

  const plannedAmount = realization.budget.planned_amount;
  const actualPercent = plannedAmount > 0 ? clampPercent((realization.actual_amount / plannedAmount) * 100) : 0;
  const committedPercent = plannedAmount > 0
    ? clampPercent(Math.min(100 - actualPercent, (realization.committed_amount / plannedAmount) * 100))
    : 0;

  const addDisabled = !budget.is_active;

  const addButton = (
    <Button type="primary" icon={<Plus size={16} />} disabled={addDisabled} onClick={openAddForm}>
      {t('budget.commitment.add')}
    </Button>
  );

  return (
    <>
      <ResponsiveCrudEditor
        open={open}
        title={`${t('budget.commitment.title')} - ${budget.name}`}
        onClose={onClose}
        desktopWidth={720}
        footer={null}
        showCloseButton
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Text type="secondary" className="text-xs">{t('budget.commitment.plannedAmount')}</Text>
              <div className="font-semibold">Rp {formatCurrency(realization.budget.planned_amount)}</div>
            </div>
            <div>
              <Text type="secondary" className="text-xs">{t('budget.commitment.actualAmount')}</Text>
              <div className="font-semibold">Rp {formatCurrency(realization.actual_amount)}</div>
            </div>
            <div>
              <Text type="secondary" className="text-xs">{t('budget.commitment.committedAmount')}</Text>
              <div className="font-semibold">Rp {formatCurrency(realization.committed_amount)}</div>
            </div>
            <div>
              <Text type="secondary" className="text-xs">{t('budget.commitment.availableAmount')}</Text>
              <div className={`font-semibold ${realization.available_amount < 0 ? 'text-red-500' : ''}`}>
                Rp {formatCurrency(realization.available_amount)}
              </div>
            </div>
          </div>

          <div
            className="relative h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
            role="img"
            aria-label={`${t('budget.commitment.actualAmount')} ${actualPercent.toFixed(0)}%, ${t('budget.commitment.committedAmount')} ${committedPercent.toFixed(0)}%`}
          >
            <div className="absolute inset-y-0 left-0 flex h-full">
              <div className="h-full bg-blue-500" style={{ width: `${actualPercent}%` }} />
              <div
                className="h-full"
                style={{
                  width: `${committedPercent}%`,
                  backgroundImage: 'repeating-linear-gradient(45deg, #faad14, #faad14 4px, transparent 4px, transparent 8px)',
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Text type="secondary" className="text-xs">{t('budget.commitment.title')}</Text>
            {addDisabled ? (
              <Tooltip title={t('budget.commitment.disabledForInactiveBudget')}>
                <span>{addButton}</span>
              </Tooltip>
            ) : addButton}
          </div>

          {isMobile ? (
            <MobileCrudList<BudgetCommitment>
              items={commitments}
              getKey={(commitment) => commitment.id}
              loading={isLoading}
              emptyText={t('budget.commitment.empty')}
              loadMoreLabel={(remaining) => t('budget.mobile.loadMore', { count: remaining })}
              getItemAriaLabel={(commitment) => commitment.description}
              getActionsAriaLabel={(commitment) => t('budget.commitment.mobile.actionsAria', { description: commitment.description })}
              getActionSheetTitle={(commitment) => commitment.description}
              renderItem={(commitment) => (
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <Text strong className="min-w-0 truncate">{commitment.description}</Text>
                    <Tag className="m-0 shrink-0" color={BUDGET_COMMITMENT_STATUS_COLOR[commitment.status]}>
                      {t(BUDGET_COMMITMENT_STATUS_LABEL_KEY[commitment.status])}
                    </Tag>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Rp {formatCurrency(commitment.amount)}</div>
                  {commitment.notes ? (
                    <div className="text-xs text-gray-400 dark:text-gray-500">{commitment.notes}</div>
                  ) : null}
                </div>
              )}
              getActions={(commitment): MobileCrudAction<BudgetCommitment>[] => [
                {
                  key: 'edit',
                  label: t('budget.commitment.edit'),
                  icon: <Edit2 aria-hidden size={19} />,
                  onSelect: (item) => openEditForm(item),
                },
                {
                  key: 'markRealized',
                  label: t('budget.commitment.markRealized'),
                  hidden: commitment.status !== 'PLANNED',
                  onSelect: (item) => handleMarkRealized(item),
                },
                {
                  key: 'cancel',
                  label: t('budget.commitment.cancel'),
                  hidden: commitment.status !== 'PLANNED',
                  onSelect: (item) => handleCancel(item),
                },
                {
                  key: 'delete',
                  label: t('budget.commitment.delete'),
                  icon: <Trash2 aria-hidden size={19} />,
                  danger: true,
                  onSelect: (item) => handleDelete(item),
                },
              ]}
            />
          ) : (
            <BudgetCommitmentTable
              commitments={commitments}
              loading={isLoading}
              onEdit={openEditForm}
              onMarkRealized={handleMarkRealized}
              onCancel={handleCancel}
              onDelete={handleDelete}
            />
          )}
        </div>
      </ResponsiveCrudEditor>

      <BudgetCommitmentFormModal
        form={form}
        open={isFormOpen}
        isEditing={Boolean(editingCommitment)}
        isSubmitting={isSubmitting}
        onCancel={closeForm}
        onSubmit={handleSubmit}
      />
    </>
  );
}
