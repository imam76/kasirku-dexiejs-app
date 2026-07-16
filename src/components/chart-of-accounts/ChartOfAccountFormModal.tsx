import { Form, Input, Modal, Select, Switch, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import { accountTypeValues } from '@/lib/validations/chartOfAccount';
import { getAccountNormalBalance } from '@/utils/chartOfAccounts/getAccountNormalBalance';
import type { AccountType, ChartOfAccount } from '@/types';

const { TextArea } = Input;
const { Text } = Typography;

export interface ChartOfAccountFormValues {
  code: string;
  name: string;
  type: AccountType;
  parent_id?: string;
  is_postable?: boolean;
  is_active?: boolean;
  description?: string;
}

interface ChartOfAccountFormModalProps {
  form: FormInstance<ChartOfAccountFormValues>;
  open: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  accounts: ChartOfAccount[];
  editingAccount?: ChartOfAccount | null;
  onCancel: () => void;
  onSubmit: (values: ChartOfAccountFormValues) => void;
}

export default function ChartOfAccountFormModal({
  form,
  open,
  isEditing,
  isSubmitting,
  accounts,
  editingAccount,
  onCancel,
  onSubmit,
}: ChartOfAccountFormModalProps) {
  const { t } = useI18n();
  const selectedType = Form.useWatch('type', form);
  const parentOptions = useMemo(() => {
    return accounts
      .filter((account) => {
        return (
          account.is_active &&
          account.id !== editingAccount?.id &&
          (!selectedType || account.type === selectedType)
        );
      })
      .map((account) => ({
        value: account.id,
        label: `${account.code} - ${account.name}`,
      }));
  }, [accounts, editingAccount?.id, selectedType]);

  return (
    <Modal
      title={isEditing ? t('coa.form.editTitle') : t('coa.form.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={760}
    >
      <Form<ChartOfAccountFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="code"
            label={t('coa.form.code')}
            rules={[
              { required: true, whitespace: true, message: t('coa.validation.codeRequired') },
              { max: 30, message: t('coa.validation.codeMax') },
              { pattern: /^[A-Za-z0-9._-]+$/, message: t('coa.validation.codePattern') },
            ]}
          >
            <Input placeholder={t('coa.form.codePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('coa.form.name')}
            rules={[
              { required: true, whitespace: true, message: t('coa.validation.nameRequired') },
              { max: 120, message: t('coa.validation.nameMax') },
            ]}
          >
            <Input placeholder={t('coa.form.namePlaceholder')} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="type"
            label={t('coa.form.type')}
            rules={[{ required: true, message: t('coa.validation.typeRequired') }]}
          >
            <Select
              placeholder={t('coa.form.typePlaceholder')}
              options={accountTypeValues.map((type) => ({
                value: type,
                label: t(`coa.accountType.${type}` as TranslationKey),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="parent_id"
            label={t('coa.form.parent')}
            extra={t('coa.form.parentHint')}
          >
            <Select
              allowClear
              showSearch
              placeholder={t('coa.form.parentPlaceholder')}
              optionFilterProp="label"
              options={parentOptions}
            />
          </Form.Item>
        </div>

        {selectedType && (
          <div className="mb-4 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
            <Text type="secondary">
              {t('coa.form.normalBalance')}: {t(`coa.normalBalance.${getAccountNormalBalance(selectedType)}` as TranslationKey)}
            </Text>
          </div>
        )}

        <Form.Item name="description" label={t('coa.form.description')}>
          <TextArea rows={3} placeholder={t('coa.form.descriptionPlaceholder')} />
        </Form.Item>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item name="is_postable" label={t('coa.form.postable')} valuePropName="checked">
            <Switch checkedChildren={t('common.yes')} unCheckedChildren={t('common.no')} />
          </Form.Item>
          <Form.Item name="is_active" label={t('coa.form.status')} valuePropName="checked">
            <Switch checkedChildren={t('coa.status.active')} unCheckedChildren={t('coa.status.inactive')} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
