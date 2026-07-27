import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeSavingOpeningBalanceSuggestion } from '@/hooks/useCooperativeSavings';
import type {
  CooperativeMember,
  CooperativeSavingType,
} from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { cooperativeSavingTypeOptions } from './savingOptions';

const { TextArea } = Input;
const { Text } = Typography;

export interface CooperativeSavingOpeningBalanceFormValues {
  member_id: string;
  saving_type: CooperativeSavingType;
  amount: number;
  opening_interest_amount: number;
  transaction_date: Dayjs;
  notes?: string;
}

interface CooperativeSavingOpeningBalanceModalProps {
  form: FormInstance<CooperativeSavingOpeningBalanceFormValues>;
  open: boolean;
  isSubmitting: boolean;
  activeMembers: CooperativeMember[];
  suggestionByMemberId: Map<string, CooperativeSavingOpeningBalanceSuggestion>;
  onCancel: () => void;
  onSubmit: (values: CooperativeSavingOpeningBalanceFormValues) => void;
}

export default function CooperativeSavingOpeningBalanceModal({
  form,
  open,
  isSubmitting,
  activeMembers,
  suggestionByMemberId,
  onCancel,
  onSubmit,
}: CooperativeSavingOpeningBalanceModalProps) {
  const { t } = useI18n();
  const selectedMemberId = Form.useWatch('member_id', form);
  const selectedSavingType = Form.useWatch('saving_type', form);
  const selectedAmount = Number(Form.useWatch('amount', form) || 0);
  const selectedOpeningInterestAmount = Number(Form.useWatch('opening_interest_amount', form) || 0);
  const memberOptions = useMemo(() => activeMembers.map((member) => ({
    value: member.id,
    label: `${member.member_number} - ${member.name}`,
  })), [activeMembers]);
  const selectedSuggestion = selectedMemberId && selectedSavingType === 'WAJIB'
    ? suggestionByMemberId.get(selectedMemberId)
    : undefined;

  useEffect(() => {
    if (!open || !selectedSuggestion || selectedSavingType !== 'WAJIB') return;
    if (selectedAmount > 0) return;

    form.setFieldValue('amount', selectedSuggestion.suggested_amount);
  }, [
    form,
    open,
    selectedAmount,
    selectedSavingType,
    selectedSuggestion,
  ]);

  return (
    <Modal
      title={t('cooperative.savings.openingBalance.title')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('cooperative.savings.openingBalance.save')}
      okButtonProps={{ 'data-testid': 'koperasi-saving-opening-submit-button' }}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={760}
    >
      <Form<CooperativeSavingOpeningBalanceFormValues>
        name="cooperativeSavingOpeningBalanceForm"
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <Alert
          type="info"
          showIcon
          className="mb-4"
          message={t('cooperative.savings.openingBalance.infoTitle')}
          description={t('cooperative.savings.openingBalance.infoDescription')}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="member_id"
            label={t('cooperative.savings.form.member')}
            rules={[{ required: true, message: t('cooperative.savings.validation.memberRequired') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('cooperative.savings.form.memberPlaceholder')}
              options={memberOptions}
              data-testid="koperasi-saving-opening-member-select"
            />
          </Form.Item>
          <Form.Item
            name="saving_type"
            label={t('cooperative.savings.form.savingType')}
            rules={[{ required: true, message: t('cooperative.savings.validation.savingTypeRequired') }]}
          >
            <Select
              options={cooperativeSavingTypeOptions.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              onChange={(value: CooperativeSavingType) => {
                if (value === 'WAJIB') {
                  form.setFieldValue('opening_interest_amount', 0);
                }
              }}
              data-testid="koperasi-saving-opening-type-select"
            />
          </Form.Item>
        </div>

        {selectedSuggestion && (
          <div className="mb-4 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-3">
            <Space wrap>
              <Tag color="gold">{t('cooperative.savings.openingBalance.migrationSuggestion')}</Tag>
              <Text>
                Rp {formatCurrency(selectedSuggestion.suggested_amount)}
              </Text>
              <Text type="secondary">
                {selectedSuggestion.loan_numbers.join(', ')}
              </Text>
            </Space>
            <Space wrap>
              <Text type="secondary">
                {t('cooperative.savings.openingBalance.requiredMandatorySaving', {
                  amount: formatCurrency(selectedSuggestion.required_amount),
                })}
              </Text>
              <Button
                size="small"
                onClick={() => form.setFieldValue('amount', selectedSuggestion.suggested_amount)}
              >
                {t('cooperative.savings.openingBalance.useSuggestion')}
              </Button>
            </Space>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="amount"
            label={t('cooperative.savings.openingBalance.amount')}
            dependencies={['opening_interest_amount']}
            rules={[
              { required: true, message: t('cooperative.savings.openingBalance.amountRequired') },
              { type: 'number', min: 0, message: t('cooperative.savings.openingBalance.amountMin') },
              ({ getFieldValue }) => ({
                validator(_, value?: number) {
                  const openingInterest = Number(getFieldValue('opening_interest_amount') || 0);
                  if (Number(value || 0) > 0 || openingInterest > 0) return Promise.resolve();
                  return Promise.reject(new Error(t('cooperative.savings.openingBalance.totalRequired')));
                },
              }),
            ]}
          >
            <InputNumber<number>
              min={0}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              placeholder="0"
              data-testid="koperasi-saving-opening-amount-input"
            />
          </Form.Item>
          <Form.Item
            name="opening_interest_amount"
            label={t('cooperative.savings.openingBalance.interestAmount')}
            dependencies={['amount', 'saving_type']}
            extra={selectedSavingType === 'WAJIB'
              ? t('cooperative.savings.openingBalance.interestNotEligible')
              : t('cooperative.savings.openingBalance.interestAmountExtra')}
            rules={[
              { type: 'number', min: 0, message: t('cooperative.savings.openingBalance.interestMin') },
              ({ getFieldValue }) => ({
                validator(_, value?: number) {
                  if (getFieldValue('saving_type') === 'WAJIB' && Number(value || 0) > 0) {
                    return Promise.reject(new Error(t('cooperative.savings.openingBalance.interestNotEligible')));
                  }
                  const savingAmount = Number(getFieldValue('amount') || 0);
                  if (savingAmount > 0 || Number(value || 0) > 0) return Promise.resolve();
                  return Promise.reject(new Error(t('cooperative.savings.openingBalance.totalRequired')));
                },
              }),
            ]}
          >
            <InputNumber<number>
              min={0}
              disabled={selectedSavingType === 'WAJIB'}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              placeholder="0"
              data-testid="koperasi-saving-opening-interest-input"
            />
          </Form.Item>
          <Form.Item
            name="transaction_date"
            label={t('cooperative.savings.openingBalance.date')}
            rules={[{ required: true, message: t('cooperative.savings.openingBalance.dateRequired') }]}
          >
            <DatePicker showTime className="w-full" data-testid="koperasi-saving-opening-date-input" />
          </Form.Item>
        </div>

        <div className="mb-4 rounded border border-blue-100 bg-blue-50 px-4 py-3">
          <Text type="secondary">{t('cooperative.savings.openingBalance.totalEntitlement')}</Text>
          <div className="text-lg font-semibold text-blue-800">
            Rp {formatCurrency(selectedAmount + selectedOpeningInterestAmount)}
          </div>
        </div>

        <Form.Item name="notes" label={t('cooperative.savings.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.savings.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
