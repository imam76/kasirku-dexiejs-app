import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { App, Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Tooltip, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { Plus, Trash2 } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { postManualJournal } from '@/services/generalLedgerService';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import { formatCurrency } from '@/utils/formatters';
import type { ChartOfAccount } from '@/types';

const { Text } = Typography;

interface ManualJournalFormProps {
  open: boolean;
  accounts: ChartOfAccount[];
  onCancel: () => void;
  onPosted?: () => void;
}

interface ManualJournalLineForm {
  account_id?: string;
  debit?: number;
  credit?: number;
  description?: string;
}

interface ManualJournalFormValues {
  entry_date: Dayjs;
  description: string;
  lines: ManualJournalLineForm[];
}

interface ManualJournalField {
  key: number;
  name: number;
}

interface ManualJournalLinesProps {
  fields: ManualJournalField[];
  accountOptions: Array<{ value: string; label: string }>;
  onAdd: (line: ManualJournalLineForm) => void;
  onRemove: (name: number) => void;
  onClearOppositeSide: (index: number, side: 'debit' | 'credit', value: number | null) => void;
}

const emptyLine = (): ManualJournalLineForm => ({
  account_id: undefined,
  debit: 0,
  credit: 0,
  description: undefined,
});

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const amountOrZero = (value?: number | null) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? roundCurrency(amount) : 0;
};

const ManualJournalLines = ({
  fields,
  accountOptions,
  onAdd,
  onRemove,
  onClearOppositeSide,
}: ManualJournalLinesProps) => {
  const { t } = useI18n();
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: fields.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => fields[index]?.key ?? index,
    estimateSize: () => 54,
    overscan: 8,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [fields.length, rowVirtualizer]);

  const handleAdd = () => {
    onAdd(emptyLine());
    window.requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(fields.length, { align: 'end' });
    });
  };

  return (
    <div className="min-h-0">
      <div className="overflow-hidden rounded-md border border-gray-200">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[minmax(260px,1.35fr)_140px_140px_minmax(220px,1fr)_44px] gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium uppercase text-gray-500">
              <span>{t('generalLedger.account')}</span>
              <span className="text-right">{t('generalLedger.debit')}</span>
              <span className="text-right">{t('generalLedger.credit')}</span>
              <span>{t('generalLedger.journal.lineDescription')}</span>
              <span />
            </div>

            <div
              ref={parentRef}
              className="overflow-auto"
              style={{ height: 'min(46vh, 420px)', minHeight: 132 }}
            >
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: 'relative',
                  width: '100%',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const field = fields[virtualRow.index];
                  if (!field) return null;

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute left-0 top-0 grid w-full grid-cols-[minmax(260px,1.35fr)_140px_140px_minmax(220px,1fr)_44px] gap-2 border-b border-gray-100 bg-white px-3 py-2"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <Form.Item name={[field.name, 'account_id']} className="!mb-0">
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder={t('generalLedger.manual.accountPlaceholder')}
                          options={accountOptions}
                        />
                      </Form.Item>

                      <Form.Item name={[field.name, 'debit']} className="!mb-0">
                        <InputNumber
                          min={0}
                          precision={2}
                          placeholder={t('generalLedger.debit')}
                          style={{ width: '100%' }}
                          onChange={(value) => onClearOppositeSide(field.name, 'debit', value)}
                        />
                      </Form.Item>

                      <Form.Item name={[field.name, 'credit']} className="!mb-0">
                        <InputNumber
                          min={0}
                          precision={2}
                          placeholder={t('generalLedger.credit')}
                          style={{ width: '100%' }}
                          onChange={(value) => onClearOppositeSide(field.name, 'credit', value)}
                        />
                      </Form.Item>

                      <Form.Item name={[field.name, 'description']} className="!mb-0">
                        <Input placeholder={t('generalLedger.manual.lineDescriptionPlaceholder')} />
                      </Form.Item>

                      <Tooltip title={t('generalLedger.manual.removeLine')}>
                        <Button
                          aria-label={t('generalLedger.manual.removeLine')}
                          icon={<Trash2 size={16} />}
                          disabled={fields.length <= 2}
                          onClick={() => onRemove(field.name)}
                        />
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Button
        className="mt-3"
        icon={<Plus size={16} />}
        onClick={handleAdd}
      >
        {t('generalLedger.manual.addLine')}
      </Button>
    </div>
  );
};

export default function ManualJournalForm({
  open,
  accounts,
  onCancel,
  onPosted,
}: ManualJournalFormProps) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const { baseCurrencySymbol } = useBaseCurrency();
  const [form] = Form.useForm<ManualJournalFormValues>();
  const [isPosting, setIsPosting] = useState(false);
  const watchedLines = Form.useWatch('lines', form) ?? [];

  const accountOptions = useMemo(() => accounts
    .filter((account) => account.is_active && account.is_postable)
    .map((account) => ({
      value: account.id,
      label: `${account.code} - ${account.name}`,
    })), [accounts]);
  const normalizedLines = watchedLines
    .map((line) => ({
      ...line,
      debit: amountOrZero(line?.debit),
      credit: amountOrZero(line?.credit),
    }))
    .filter((line) => line.account_id || line.debit > 0 || line.credit > 0);
  const totalDebit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.credit, 0));
  const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.01;
  const hasPostableLines = normalizedLines.filter((line) => line.account_id && (line.debit > 0 || line.credit > 0)).length >= 2;

  useEffect(() => {
    if (!open) return;

    form.setFieldsValue({
      entry_date: dayjs(),
      description: undefined,
      lines: [emptyLine(), emptyLine()],
    });
  }, [form, open]);

  const clearOppositeSide = (index: number, side: 'debit' | 'credit', value: number | null) => {
    if (amountOrZero(value) <= 0) return;
    form.setFieldValue(['lines', index, side === 'debit' ? 'credit' : 'debit'], 0);
  };

  const validateLines = (lines: ManualJournalLineForm[]) => {
    const entries = lines
      .map((line) => ({
        account_id: line.account_id,
        debit: amountOrZero(line.debit),
        credit: amountOrZero(line.credit),
        description: line.description?.trim(),
      }))
      .filter((line) => line.account_id || line.debit > 0 || line.credit > 0);

    if (entries.length < 2 || entries.some((line) => !line.account_id || (line.debit <= 0 && line.credit <= 0))) {
      throw new Error(t('generalLedger.manual.validation.linesRequired'));
    }

    if (entries.some((line) => line.debit > 0 && line.credit > 0)) {
      throw new Error(t('generalLedger.manual.validation.singleSide'));
    }

    const debit = roundCurrency(entries.reduce((sum, line) => sum + line.debit, 0));
    const credit = roundCurrency(entries.reduce((sum, line) => sum + line.credit, 0));
    if (Math.abs(debit - credit) > 0.01) {
      throw new Error(t('generalLedger.manual.validation.balance'));
    }

    return entries;
  };

  const handleFinish = async (values: ManualJournalFormValues) => {
    try {
      const lines = validateLines(values.lines ?? []);
      setIsPosting(true);
      const entry = await postManualJournal({
        entry_date: values.entry_date.toISOString(),
        description: values.description.trim(),
        lines: lines.map((line) => ({
          account_id: line.account_id!,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        })),
      });

      if (!entry) {
        message.warning(t('generalLedger.manual.message.notPosted'));
        return;
      }

      message.success(t('generalLedger.manual.message.postSuccess', { number: entry.entry_number }));
      form.resetFields();
      onPosted?.();
      onCancel();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('generalLedger.manual.message.postFailed'));
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Modal
      title={t('generalLedger.manual.title')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('generalLedger.manual.post')}
      cancelText={t('common.cancel')}
      confirmLoading={isPosting}
      okButtonProps={{ disabled: !hasPostableLines || !isBalanced }}
      width={980}
      styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflow: 'hidden' } }}
      destroyOnHidden
      forceRender
    >
      <Form<ManualJournalFormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
          <Form.Item
            name="entry_date"
            label={t('generalLedger.manual.entryDate')}
            rules={[{ required: true, message: t('generalLedger.manual.validation.entryDateRequired') }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('generalLedger.manual.description')}
            rules={[
              { required: true, whitespace: true, message: t('generalLedger.manual.validation.descriptionRequired') },
              { max: 180, message: t('generalLedger.manual.validation.descriptionMax') },
            ]}
          >
            <Input placeholder={t('generalLedger.manual.descriptionPlaceholder')} />
          </Form.Item>
        </div>

        <Form.List name="lines">
          {(fields, { add, remove }) => (
            <ManualJournalLines
              fields={fields}
              accountOptions={accountOptions}
              onAdd={add}
              onRemove={remove}
              onClearOppositeSide={clearOppositeSide}
            />
          )}
        </Form.List>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {!isBalanced && (
            <Alert type="error" showIcon title={t('generalLedger.manual.validation.balance')} />
          )}
          <Space className="md:ml-auto">
            <Text strong>{t('generalLedger.debit')}: {baseCurrencySymbol} {formatCurrency(totalDebit)}</Text>
            <Text strong>{t('generalLedger.credit')}: {baseCurrencySymbol} {formatCurrency(totalCredit)}</Text>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}
