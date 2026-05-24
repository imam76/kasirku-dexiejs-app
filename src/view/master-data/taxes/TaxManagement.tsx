import { useState } from 'react';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { Archive, CheckCircle2, Edit2, Percent, Plus, RotateCcw } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useTaxes, type TaxCalculationModeFilter, type TaxStatusFilter } from '@/hooks/useTaxes';
import { useI18n } from '@/hooks/useI18n';
import type { Tax, TaxCalculationMode } from '@/types';

const { Text } = Typography;
const { TextArea } = Input;

const calculationModeOptions: Array<{ value: TaxCalculationMode; labelKey: string; color: string }> = [
  { value: 'EXCLUSIVE', labelKey: 'taxes.mode.exclusive', color: 'blue' },
  { value: 'INCLUSIVE', labelKey: 'taxes.mode.inclusive', color: 'purple' },
];

export default function TaxManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<TaxFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    filteredTaxes,
    editingTax,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    calculationModeFilter,
    setCalculationModeFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveTax,
    restoreTax,
    setDefaultTax,
    isSubmitting,
  } = useTaxes();

  const modeLabelMap = calculationModeOptions.reduce<Record<TaxCalculationMode, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey as Parameters<typeof t>[0]);
    return acc;
  }, {} as Record<TaxCalculationMode, string>);

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({
      rate_type: 'PERCENTAGE',
      calculation_mode: 'EXCLUSIVE',
      is_default: false,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (tax: Tax) => {
    handleEdit(tax);
    form.resetFields();
    form.setFieldsValue({
      name: tax.name,
      code: tax.code,
      rate: tax.rate,
      rate_type: tax.rate_type,
      calculation_mode: tax.calculation_mode,
      effective_from: tax.effective_from ? dayjs(tax.effective_from) : null,
      effective_to: tax.effective_to ? dayjs(tax.effective_to) : null,
      description: tax.description,
      is_default: tax.is_default,
      is_active: tax.is_active,
    });
    setIsModalOpen(true);
  };

  const toTaxInput = (values: TaxFormValues) => ({
    name: values.name,
    code: values.code,
    rate: Number(values.rate),
    rate_type: 'PERCENTAGE' as const,
    calculation_mode: values.calculation_mode,
    effective_from: values.effective_from?.toISOString(),
    effective_to: values.effective_to?.toISOString(),
    description: values.description,
    is_default: values.is_default,
    is_active: values.is_active,
  });

  const handleSubmit = async (values: TaxFormValues) => {
    try {
      const wasEditing = Boolean(editingTax);
      await submitForm(toTaxInput(values));
      message.success(wasEditing ? t('taxes.updateSuccess') : t('taxes.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('taxes.saveFailed'));
    }
  };

  const handleArchive = (tax: Tax) => {
    modal.confirm({
      title: t('taxes.archiveConfirmTitle'),
      content: t('taxes.archiveConfirmContent', { name: tax.name }),
      okText: t('taxes.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveTax(tax.id);
          message.success(t('taxes.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('taxes.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (tax: Tax) => {
    try {
      await restoreTax(tax.id);
      message.success(t('taxes.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('taxes.restoreFailed'));
    }
  };

  const handleSetDefault = async (tax: Tax) => {
    try {
      await setDefaultTax(tax.id);
      message.success(t('taxes.setDefaultSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('taxes.setDefaultFailed'));
    }
  };

  const columns: ColumnsType<Tax> = [
    {
      title: t('taxes.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, tax) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {tax.code && <Text type="secondary">{tax.code}</Text>}
        </Space>
      ),
    },
    {
      title: t('taxes.table.rate'),
      dataIndex: 'rate',
      key: 'rate',
      render: (rate: number) => `${rate}%`,
    },
    {
      title: t('taxes.table.mode'),
      dataIndex: 'calculation_mode',
      key: 'calculation_mode',
      render: (mode: TaxCalculationMode) => {
        const option = calculationModeOptions.find((item) => item.value === mode);
        return <Tag color={option?.color}>{modeLabelMap[mode]}</Tag>;
      },
    },
    {
      title: t('taxes.table.default'),
      dataIndex: 'is_default',
      key: 'is_default',
      render: (isDefault: boolean) => isDefault ? <Tag color="gold">{t('taxes.default.yes')}</Tag> : '-',
    },
    {
      title: t('taxes.table.period'),
      key: 'period',
      render: (_value: unknown, tax) => getPeriodLabel(tax),
    },
    {
      title: t('taxes.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('taxes.status.active') : t('taxes.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('taxes.table.action'),
      key: 'action',
      render: (_value: unknown, tax) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => openEditModal(tax)}>
            {t('taxes.edit')}
          </Button>
          {tax.is_active && !tax.is_default && (
            <Button type="text" icon={<CheckCircle2 size={16} />} onClick={() => handleSetDefault(tax)}>
              {t('taxes.setDefault')}
            </Button>
          )}
          {tax.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => handleArchive(tax)}>
              {t('taxes.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => handleRestore(tax)}>
              {t('taxes.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Percent className="h-5 w-5" />
          {t('taxes.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('taxes.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('taxes.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<TaxStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: t('taxes.filter.active') },
            { value: 'inactive', label: t('taxes.filter.inactive') },
            { value: 'all', label: t('taxes.filter.allStatuses') },
          ]}
        />
        <Select<TaxCalculationModeFilter>
          value={calculationModeFilter}
          onChange={setCalculationModeFilter}
          options={[
            { value: 'ALL', label: t('taxes.filter.allModes') },
            ...calculationModeOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey as Parameters<typeof t>[0]),
            })),
          ]}
        />
      </div>

      <Table
        dataSource={filteredTaxes}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 8 }}
        scroll={{ x: true }}
        locale={{ emptyText: t('taxes.empty') }}
      />

      <Modal
        title={editingTax ? t('taxes.editTitle') : t('taxes.addTitle')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={isSubmitting}
        destroyOnHidden
        forceRender
        width={760}
      >
        <Form<TaxFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="mt-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="name" label={t('taxes.form.name')} rules={[{ required: true, whitespace: true, message: t('taxes.validation.nameRequired') }]}>
              <Input placeholder={t('taxes.form.namePlaceholder')} />
            </Form.Item>
            <Form.Item name="code" label={t('taxes.form.code')} rules={[{ max: 30, message: t('taxes.validation.codeMax') }]}>
              <Input placeholder={t('taxes.form.codePlaceholder')} />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="rate" label={t('taxes.form.rate')} rules={[{ required: true, message: t('taxes.validation.rateRequired') }, { type: 'number', min: 0, max: 100, message: t('taxes.validation.rateRange') }]}>
              <InputNumber min={0} max={100} className="w-full" suffix="%" />
            </Form.Item>
            <Form.Item name="calculation_mode" label={t('taxes.form.mode')} rules={[{ required: true, message: t('taxes.validation.modeRequired') }]}>
              <Select
                options={calculationModeOptions.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey as Parameters<typeof t>[0]),
                }))}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="effective_from" label={t('taxes.form.effectiveFrom')}>
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item
              name="effective_to"
              label={t('taxes.form.effectiveTo')}
              dependencies={['effective_from']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value: Dayjs | null) {
                    const effectiveFrom = getFieldValue('effective_from') as Dayjs | null;
                    if (!effectiveFrom || !value || !value.isBefore(effectiveFrom, 'day')) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error(t('taxes.validation.effectiveToAfterFrom')));
                  },
                }),
              ]}
            >
              <DatePicker className="w-full" />
            </Form.Item>
          </div>

          <Form.Item name="description" label={t('taxes.form.description')}>
            <TextArea rows={3} placeholder={t('taxes.form.descriptionPlaceholder')} />
          </Form.Item>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item name="is_default" label={t('taxes.form.default')} valuePropName="checked">
              <Switch checkedChildren={t('taxes.default.yes')} unCheckedChildren={t('taxes.default.no')} />
            </Form.Item>
            <Form.Item name="is_active" label={t('taxes.form.status')} valuePropName="checked">
              <Switch checkedChildren={t('taxes.status.active')} unCheckedChildren={t('taxes.status.inactive')} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </Card>
  );
}

interface TaxFormValues {
  name: string;
  code?: string;
  rate: number;
  rate_type?: 'PERCENTAGE';
  calculation_mode: TaxCalculationMode;
  effective_from?: Dayjs | null;
  effective_to?: Dayjs | null;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
}

const getPeriodLabel = (tax: Tax) => {
  if (!tax.effective_from && !tax.effective_to) return '-';

  const startDate = tax.effective_from ? dayjs(tax.effective_from).format('DD MMM YYYY') : '-';
  const endDate = tax.effective_to ? dayjs(tax.effective_to).format('DD MMM YYYY') : '-';

  return `${startDate} - ${endDate}`;
};
