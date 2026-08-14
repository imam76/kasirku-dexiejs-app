import { Alert, Form, Input, InputNumber, Modal, Select, Switch, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import {
  previewRestaurantTableSeed,
  seedRestaurantTables,
  RESTAURANT_TABLE_NAME_MAX_LENGTH,
  RESTAURANT_TABLE_SEED_MAX_COUNT,
  RESTAURANT_TABLE_SEED_MAX_DIGITS,
  RESTAURANT_TABLE_TYPE_PRESETS,
  RESTAURANT_TABLE_TYPES,
  type RestaurantTableSeedInput,
} from '@/services/restaurantTableService';
import type { RestaurantTableRecord, RestaurantTableType } from '@/types';
import { RESTAURANT_TABLE_TYPE_LABEL_KEY } from './restaurantTableTypeMeta';

const PREVIEW_LIMIT = 12;
const DUPLICATE_PREVIEW_LIMIT = 5;

const buildSeedDefaults = (type: RestaurantTableType = 'REGULAR'): RestaurantTableSeedInput => ({
  type,
  prefix: RESTAURANT_TABLE_TYPE_PRESETS[type].prefix,
  startNumber: 1,
  count: 10,
  digits: 2,
  capacity: RESTAURANT_TABLE_TYPE_PRESETS[type].capacity,
  skipExisting: true,
});

interface RestaurantTableSeedModalProps {
  open: boolean;
  existingTables: RestaurantTableRecord[];
  onClose: () => void;
  onCreated: (result: { created: number; skipped: string[] }) => void;
}

export default function RestaurantTableSeedModal({
  open,
  existingTables,
  onClose,
  onCreated,
}: RestaurantTableSeedModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<RestaurantTableSeedInput>();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const watched = Form.useWatch([], form);
  const values = useMemo(() => ({ ...buildSeedDefaults(), ...(watched ?? {}) }), [watched]);
  const { type, prefix, startNumber, count, digits, capacity, skipExisting } = values;

  useEffect(() => {
    if (!open) return;
    setSubmitError(undefined);
    form.setFieldsValue(buildSeedDefaults());
  }, [form, open]);

  const preview = useMemo(() => {
    try {
      const result = previewRestaurantTableSeed(
        { type, prefix, startNumber, count, digits, capacity },
        existingTables,
      );
      return { ...result, error: undefined as string | undefined };
    } catch (error) {
      return {
        names: [] as string[],
        creatable: [] as string[],
        duplicates: [] as string[],
        error: error instanceof Error ? error.message : t('restaurantTables.bulkFailed'),
      };
    }
  }, [capacity, count, digits, existingTables, prefix, startNumber, t, type]);

  const blockedByDuplicates = !skipExisting && preview.duplicates.length > 0;
  const nothingToCreate = !preview.error && preview.creatable.length === 0;
  const canSubmit = !preview.error && !blockedByDuplicates && !nothingToCreate;

  const duplicateNames = preview.duplicates.slice(0, DUPLICATE_PREVIEW_LIMIT).join(', ')
    + (preview.duplicates.length > DUPLICATE_PREVIEW_LIMIT
      ? ` ${t('restaurantTables.bulkPreviewMore', { count: preview.duplicates.length - DUPLICATE_PREVIEW_LIMIT })}`
      : '');

  const handleTypeChange = (nextType: RestaurantTableType) => {
    const preset = RESTAURANT_TABLE_TYPE_PRESETS[nextType];
    form.setFieldsValue({ prefix: preset.prefix, capacity: preset.capacity });
  };

  const submit = async () => {
    setSaving(true);
    setSubmitError(undefined);
    try {
      const input = await form.validateFields();
      const result = await seedRestaurantTables(input);
      onCreated(result);
      onClose();
    } catch (error) {
      if (error instanceof Error) setSubmitError(error.message);
      else if (!(error && typeof error === 'object' && 'errorFields' in error)) {
        setSubmitError(t('restaurantTables.bulkFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('restaurantTables.bulkTitle')}
      open={open}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={saving}
      okText={t('restaurantTables.bulkSubmit', { count: preview.creatable.length })}
      cancelText={t('common.cancel')}
      okButtonProps={{ disabled: !canSubmit }}
      width={640}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary" className="!mb-4">
        {t('restaurantTables.bulkDescription')}
      </Typography.Paragraph>

      <Form<RestaurantTableSeedInput>
        form={form}
        layout="vertical"
        initialValues={buildSeedDefaults()}
        requiredMark="optional"
      >
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item name="type" label={t('restaurantTables.type')} rules={[{ required: true }]}>
            <Select<RestaurantTableType>
              onChange={handleTypeChange}
              options={RESTAURANT_TABLE_TYPES.map((tableType) => ({
                value: tableType,
                label: t(RESTAURANT_TABLE_TYPE_LABEL_KEY[tableType]),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="count"
            label={t('restaurantTables.bulkCount')}
            extra={t('restaurantTables.bulkCountHint', { max: RESTAURANT_TABLE_SEED_MAX_COUNT })}
            rules={[{ required: true, message: t('restaurantTables.bulkCount') }]}
          >
            <InputNumber min={1} max={RESTAURANT_TABLE_SEED_MAX_COUNT} precision={0} className="w-full" />
          </Form.Item>
          <Form.Item
            name="prefix"
            label={t('restaurantTables.bulkPrefix')}
            extra={t('restaurantTables.bulkPrefixHint')}
          >
            <Input maxLength={RESTAURANT_TABLE_NAME_MAX_LENGTH} placeholder="M" />
          </Form.Item>
          <Form.Item
            name="capacity"
            label={t('restaurantTables.capacity')}
            rules={[
              { required: true, message: t('restaurantTables.capacityRequired') },
              { type: 'integer', min: 1, message: t('restaurantTables.capacityInvalid') },
            ]}
          >
            <InputNumber min={1} precision={0} className="w-full" />
          </Form.Item>
          <Form.Item
            name="startNumber"
            label={t('restaurantTables.bulkStartNumber')}
            rules={[{ required: true, message: t('restaurantTables.bulkStartNumber') }]}
          >
            <InputNumber min={0} precision={0} className="w-full" />
          </Form.Item>
          <Form.Item
            name="digits"
            label={t('restaurantTables.bulkDigits')}
            extra={t('restaurantTables.bulkDigitsHint')}
            rules={[{ required: true, message: t('restaurantTables.bulkDigits') }]}
          >
            <InputNumber min={1} max={RESTAURANT_TABLE_SEED_MAX_DIGITS} precision={0} className="w-full" />
          </Form.Item>
        </div>

        <Form.Item
          name="skipExisting"
          label={t('restaurantTables.bulkSkipExisting')}
          extra={t('restaurantTables.bulkSkipExistingHint')}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Form>

      <div className="rounded-xl bg-slate-50 p-3">
        <Typography.Text strong className="block">{t('restaurantTables.bulkPreview')}</Typography.Text>
        {preview.error ? (
          <Alert className="mt-2" type="error" showIcon message={preview.error} />
        ) : (
          <>
            <Typography.Text type="secondary" className="mt-1 block text-xs">
              {t('restaurantTables.bulkSummary', {
                count: preview.creatable.length,
                capacity: Number(capacity) || 0,
                type: t(RESTAURANT_TABLE_TYPE_LABEL_KEY[type ?? 'REGULAR']),
              })}
            </Typography.Text>
            <div className="mt-2 flex flex-wrap gap-1">
              {preview.names.slice(0, PREVIEW_LIMIT).map((name) => (
                <Tag key={name} color={preview.duplicates.includes(name) ? 'default' : 'blue'}>{name}</Tag>
              ))}
              {preview.names.length > PREVIEW_LIMIT ? (
                <Typography.Text type="secondary" className="text-xs">
                  {t('restaurantTables.bulkPreviewMore', { count: preview.names.length - PREVIEW_LIMIT })}
                </Typography.Text>
              ) : null}
            </div>
            {nothingToCreate ? (
              <Alert className="mt-3" type="warning" showIcon message={t('restaurantTables.bulkNothingToCreate')} />
            ) : preview.duplicates.length > 0 ? (
              <Alert
                className="mt-3"
                type={blockedByDuplicates ? 'error' : 'warning'}
                showIcon
                message={t(
                  blockedByDuplicates ? 'restaurantTables.bulkDuplicateBlock' : 'restaurantTables.bulkDuplicateSkip',
                  { count: preview.duplicates.length, names: duplicateNames },
                )}
              />
            ) : null}
          </>
        )}
        {submitError ? <Alert className="mt-3" type="error" showIcon message={submitError} /> : null}
      </div>
    </Modal>
  );
}
