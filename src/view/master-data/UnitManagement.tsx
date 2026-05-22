import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Edit2, Plus, RefreshCcw, Scale, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { db } from '@/lib/db';
import type { UnitConversion, UnitDefinition, UnitDefinitionType } from '@/types';
import type { TranslationKey } from '@/i18n/messages';
import { setConversionRegistry } from '@/utils/pricing';
import { useI18n } from '@/hooks/useI18n';
import {
  areUnitsInSameCategory,
  DEFAULT_CONVERSIONS,
  DEFAULT_UNITS,
  inferConversionUnitType,
  inferUnitDefinitionType,
  isGlobalConvertibleUnitType,
  isLegacyGlobalPackageConversion,
  normalizeUnitKey,
} from '@/constants/units';

const { Text, Title } = Typography;

type UnitConversionType = NonNullable<UnitConversion['unitType']>;

type UnitFormValues = {
  name: string;
  type: UnitDefinitionType;
  canBeBaseUnit: boolean;
  canBeConversionUnit: boolean;
};

type ConversionFormValues = {
  baseUnit: string;
  conversionUnit: string;
  ratio: number;
};

const unitTypeLabelKeys: Record<UnitDefinitionType, TranslationKey> = {
  measurement: 'units.type.measurement',
  count: 'units.type.count',
  package: 'units.type.package',
  time: 'units.type.time',
};

const conversionTypeLabelKeys: Record<UnitConversionType, TranslationKey> = {
  measurement: 'units.type.measurement',
  package: 'units.type.package',
  time: 'units.type.time',
};

const unitTypeColors: Record<UnitDefinitionType, string> = {
  measurement: 'green',
  count: 'blue',
  package: 'orange',
  time: 'purple',
};

const conversionTypeColors: Record<UnitConversionType, string> = {
  measurement: 'green',
  package: 'orange',
  time: 'purple',
};

const getUnitTabFromHash = (hash: string) => {
  const normalizedHash = hash.replace(/^#/, '');
  return normalizedHash === 'conversions' ? 'conversions' : 'units';
};

const normalizeStoredUnit = (unit: UnitDefinition): UnitDefinition => {
  const id = normalizeUnitKey(unit.id || unit.name);
  const type = unit.type ?? inferUnitDefinitionType(id);

  return {
    ...unit,
    id,
    name: normalizeUnitKey(unit.name || id),
    type,
    canBeBaseUnit: unit.canBeBaseUnit ?? type !== 'package',
    canBeConversionUnit: unit.canBeConversionUnit ?? type !== 'count',
    isPreset: Boolean(unit.isPreset),
  };
};

const normalizeStoredConversion = (conversion: UnitConversion): UnitConversion => {
  const fromUnit = normalizeUnitKey(conversion.fromUnit);
  const toUnit = normalizeUnitKey(conversion.toUnit);
  const unitType = conversion.unitType ?? inferConversionUnitType(fromUnit, toUnit);
  const isDeprecated = Boolean(conversion.isDeprecated || isLegacyGlobalPackageConversion({ ...conversion, fromUnit, toUnit }));

  return {
    ...conversion,
    fromUnit,
    toUnit,
    unitType,
    scope: conversion.scope ?? 'global',
    allowPriceFallback: conversion.allowPriceFallback ?? unitType === 'measurement',
    isDeprecated,
  };
};

const buildConversionLabel = (baseUnit: string, conversionUnit: string, ratio: number) => {
  return `1 ${conversionUnit} = ${ratio} ${baseUnit}`;
};

const getDefaultFlagsForType = (type: UnitDefinitionType) => ({
  canBeBaseUnit: type !== 'package',
  canBeConversionUnit: type !== 'count',
});

export default function UnitManagement() {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [isConversionModalOpen, setIsConversionModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitDefinition | null>(null);
  const [editingConversion, setEditingConversion] = useState<UnitConversion | null>(null);
  const [unitForm] = Form.useForm<UnitFormValues>();
  const [conversionForm] = Form.useForm<ConversionFormValues>();

  const { data: units = [], isLoading: isLoadingUnits } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const data = (await db.units.toArray()).map(normalizeStoredUnit);

      if (data.length > 0) return data;

      await db.units.bulkPut(DEFAULT_UNITS);
      return DEFAULT_UNITS;
    },
  });

  const { data: conversions = [], isLoading: isLoadingConversions } = useQuery({
    queryKey: ['unitConversions'],
    queryFn: async () => {
      const data = (await db.unitConversions.toArray()).map(normalizeStoredConversion);
      setConversionRegistry(data);
      return data;
    },
  });

  useEffect(() => {
    setConversionRegistry(conversions);
  }, [conversions]);

  const activeTab = getUnitTabFromHash(location.hash);
  const handleTabChange = (tabKey: string) => {
    navigate({ to: '/master-data/units', hash: tabKey });
  };


  const unitMap = useMemo(() => {
    return new Map(units.map((unit) => [unit.id, unit]));
  }, [units]);

  const globalBaseUnitOptions = useMemo(
    () =>
      units
        .filter((unit) => unit.canBeBaseUnit && isGlobalConvertibleUnitType(unit.type))
        .map((unit) => ({ value: unit.id, label: unit.name })),
    [units],
  );

  const globalConversionUnitOptions = useMemo(
    () =>
      units
        .filter((unit) => unit.canBeConversionUnit && isGlobalConvertibleUnitType(unit.type))
        .map((unit) => ({ value: unit.id, label: unit.name })),
    [units],
  );

  const legacyPackageCount = useMemo(
    () => conversions.filter((conversion) => conversion.isDeprecated).length,
    [conversions],
  );

  const upsertUnitMutation = useMutation({
    mutationFn: async (values: UnitFormValues) => {
      const id = normalizeUnitKey(values.name);
      const type = values.type ?? inferUnitDefinitionType(id);
      const now = new Date().toISOString();

      if (!id) {
        throw new Error(t('units.validation.nameRequired'));
      }

      const record: UnitDefinition = {
        id,
        name: id,
        type,
        canBeBaseUnit: Boolean(values.canBeBaseUnit),
        canBeConversionUnit: Boolean(values.canBeConversionUnit),
        isPreset: false,
        created_at: editingUnit?.created_at ?? now,
        updated_at: now,
      };

      if (!editingUnit) {
        await db.units.add(record);
        return;
      }

      await db.units.update(editingUnit.id, {
        type: record.type,
        canBeBaseUnit: record.canBeBaseUnit,
        canBeConversionUnit: record.canBeConversionUnit,
        updated_at: now,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      message.success(editingUnit ? t('units.success.unitUpdated') : t('units.success.unitAdded'));
      setIsUnitModalOpen(false);
      setEditingUnit(null);
      unitForm.resetFields();
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.name === 'ConstraintError') {
        message.error(t('units.validation.duplicateUnit'));
        return;
      }

      message.error(error instanceof Error ? error.message : t('units.validation.saveUnitFailed'));
    },
  });

  const deleteUnitMutation = useMutation({
    mutationFn: async (unitId: string) => {
      const unit = await db.units.get(unitId);
      if (unit?.isPreset) {
        throw new Error(t('units.validation.presetDeleteBlocked'));
      }

      const [fromCount, toCount, products] = await Promise.all([
        db.unitConversions.where('fromUnit').equals(unitId).count(),
        db.unitConversions.where('toUnit').equals(unitId).count(),
        db.products.toArray(),
      ]);

      const usedByProduct = products.some(
        (product) =>
          product.purchase_unit === unitId ||
          product.selling_unit === unitId ||
          Boolean(product.sellable_units?.includes(unitId)),
      );

      if (fromCount > 0 || toCount > 0 || usedByProduct) {
        throw new Error(t('units.validation.unitInUse'));
      }

      await db.units.delete(unitId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      message.success(t('units.success.unitDeleted'));
    },
    onError: (error: unknown) => {
      message.error(error instanceof Error ? error.message : t('units.validation.deleteUnitFailed'));
    },
  });

  const restoreUnitsMutation = useMutation({
    mutationFn: async () => {
      await db.units.bulkPut(DEFAULT_UNITS);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      message.success(t('units.success.unitsRestored'));
    },
  });

  const upsertConversionMutation = useMutation({
    mutationFn: async (values: ConversionFormValues) => {
      const baseUnit = normalizeUnitKey(values.baseUnit);
      const conversionUnit = normalizeUnitKey(values.conversionUnit);
      const ratio = Number(values.ratio);

      if (!baseUnit || !conversionUnit) {
        throw new Error(t('units.validation.unitsRequired'));
      }

      if (baseUnit === conversionUnit) {
        throw new Error(t('units.validation.sameUnits'));
      }

      if (!Number.isFinite(ratio) || ratio <= 0) {
        throw new Error(t('units.validation.ratioPositive'));
      }

      const baseUnitRecord = unitMap.get(baseUnit);
      const conversionUnitRecord = unitMap.get(conversionUnit);

      if (!baseUnitRecord || !conversionUnitRecord) {
        throw new Error(t('units.validation.unitNotFound'));
      }

      if (!baseUnitRecord.canBeBaseUnit || !conversionUnitRecord.canBeConversionUnit) {
        throw new Error(t('units.validation.invalidFlags'));
      }

      if (!isGlobalConvertibleUnitType(baseUnitRecord.type) || !isGlobalConvertibleUnitType(conversionUnitRecord.type)) {
        throw new Error(t('units.validation.globalConversionType'));
      }

      if (baseUnitRecord.type !== conversionUnitRecord.type) {
        throw new Error(t('units.validation.sameType'));
      }

      if (!areUnitsInSameCategory(baseUnit, conversionUnit)) {
        throw new Error(t('units.validation.sameType'));
      }

      const id = `${conversionUnit}-${baseUnit}`;
      const unitType: UnitConversionType = baseUnitRecord.type === 'time' ? 'time' : 'measurement';
      const record: UnitConversion = {
        id,
        fromUnit: conversionUnit,
        toUnit: baseUnit,
        ratio,
        isPreset: false,
        label: buildConversionLabel(baseUnit, conversionUnit, ratio),
        unitType,
        scope: 'global',
        allowPriceFallback: unitType === 'measurement',
        isDeprecated: false,
      };

      if (!editingConversion) {
        await db.unitConversions.add(record);
        return;
      }

      await db.transaction('rw', db.unitConversions, async () => {
        if (editingConversion.id !== id) {
          await db.unitConversions.delete(editingConversion.id);
          await db.unitConversions.add(record);
          return;
        }

        await db.unitConversions.update(editingConversion.id, {
          fromUnit: record.fromUnit,
          toUnit: record.toUnit,
          ratio: record.ratio,
          label: record.label,
          unitType: record.unitType,
          scope: record.scope,
          allowPriceFallback: record.allowPriceFallback,
          isDeprecated: false,
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitConversions'] });
      message.success(editingConversion ? t('units.success.conversionUpdated') : t('units.success.conversionAdded'));
      setIsConversionModalOpen(false);
      setEditingConversion(null);
      conversionForm.resetFields();
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.name === 'ConstraintError') {
        message.error(t('units.validation.duplicateConversion'));
        return;
      }

      message.error(error instanceof Error ? error.message : t('units.validation.saveConversionFailed'));
    },
  });

  const deleteConversionMutation = useMutation({
    mutationFn: async (id: string) => {
      await db.unitConversions.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitConversions'] });
      message.success(t('units.success.conversionDeleted'));
    },
  });

  const restoreConversionsMutation = useMutation({
    mutationFn: async () => {
      await db.unitConversions.bulkPut(DEFAULT_CONVERSIONS);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitConversions'] });
      message.success(t('units.success.conversionsRestored'));
    },
  });

  const handleAddUnit = () => {
    setEditingUnit(null);
    unitForm.resetFields();
    unitForm.setFieldsValue({
      name: '',
      type: 'measurement',
      ...getDefaultFlagsForType('measurement'),
    });
    setIsUnitModalOpen(true);
  };

  const handleEditUnit = (unit: UnitDefinition) => {
    if (unit.isPreset) return;

    setEditingUnit(unit);
    unitForm.setFieldsValue({
      name: unit.name,
      type: unit.type,
      canBeBaseUnit: unit.canBeBaseUnit,
      canBeConversionUnit: unit.canBeConversionUnit,
    });
    setIsUnitModalOpen(true);
  };

  const handleDeleteUnit = (unit: UnitDefinition) => {
    if (unit.isPreset) return;

    modal.confirm({
      title: t('units.confirm.deleteUnitTitle'),
      content: t('units.confirm.deleteUnitContent', { unit: unit.name }),
      okText: t('units.confirm.deleteOk'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => deleteUnitMutation.mutate(unit.id),
    });
  };

  const handleRestoreUnits = () => {
    modal.confirm({
      title: t('units.confirm.restoreUnitsTitle'),
      content: t('units.confirm.restoreUnitsContent'),
      okText: t('units.confirm.restoreOk'),
      cancelText: t('common.cancel'),
      onOk: () => restoreUnitsMutation.mutate(),
    });
  };

  const handleAddConversion = () => {
    setEditingConversion(null);
    conversionForm.resetFields();
    conversionForm.setFieldsValue({ ratio: 1 });
    setIsConversionModalOpen(true);
  };

  const handleEditConversion = (record: UnitConversion) => {
    if (record.isPreset || record.isDeprecated) return;

    setEditingConversion(record);
    conversionForm.setFieldsValue({
      baseUnit: record.toUnit,
      conversionUnit: record.fromUnit,
      ratio: record.ratio,
    });
    setIsConversionModalOpen(true);
  };

  const handleDeleteConversion = (record: UnitConversion) => {
    const canDelete = !record.isPreset || record.isDeprecated;
    if (!canDelete) return;

    modal.confirm({
      title: t('units.confirm.deleteConversionTitle'),
      content: t('units.confirm.deleteConversionContent', { label: record.label }),
      okText: t('units.confirm.deleteOk'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => deleteConversionMutation.mutate(record.id),
    });
  };

  const handleRestoreConversions = () => {
    modal.confirm({
      title: t('units.confirm.restoreConversionsTitle'),
      content: t('units.confirm.restoreConversionsContent'),
      okText: t('units.confirm.restoreOk'),
      cancelText: t('common.cancel'),
      onOk: () => restoreConversionsMutation.mutate(),
    });
  };

  const unitColumns: ColumnsType<UnitDefinition> = [
    {
      title: t('units.column.unit'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: t('units.column.kind'),
      dataIndex: 'type',
      key: 'type',
      render: (type: UnitDefinitionType) => <Tag color={unitTypeColors[type]}>{t(unitTypeLabelKeys[type])}</Tag>,
    },
    {
      title: t('units.column.baseUnit'),
      dataIndex: 'canBeBaseUnit',
      key: 'canBeBaseUnit',
      render: (value: boolean) => (value ? <Tag color="green">{t('units.yes')}</Tag> : <Tag>{t('units.no')}</Tag>),
    },
    {
      title: t('units.column.conversionUnit'),
      dataIndex: 'canBeConversionUnit',
      key: 'canBeConversionUnit',
      render: (value: boolean) => (value ? <Tag color="cyan">{t('units.yes')}</Tag> : <Tag>{t('units.no')}</Tag>),
    },
    {
      title: t('units.column.type'),
      dataIndex: 'isPreset',
      key: 'isPreset',
      render: (isPreset: boolean) => (
        isPreset ? <Tag color="gold">{t('units.preset')}</Tag> : <Tag color="cyan">{t('units.custom')}</Tag>
      ),
    },
    {
      title: t('units.column.action'),
      key: 'action',
      render: (_value: unknown, record) => (
        <Space>
          <Button
            type="text"
            icon={<Edit2 size={16} />}
            disabled={record.isPreset}
            onClick={() => handleEditUnit(record)}
            className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          />
          <Button
            danger
            type="text"
            icon={<Trash2 size={16} />}
            disabled={record.isPreset}
            onClick={() => handleDeleteUnit(record)}
          />
        </Space>
      ),
    },
  ];

  const conversionColumns: ColumnsType<UnitConversion> = [
    {
      title: t('units.column.conversionUnitSource'),
      dataIndex: 'fromUnit',
      key: 'fromUnit',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: t('units.column.baseUnitTarget'),
      dataIndex: 'toUnit',
      key: 'toUnit',
      render: (text: string) => <Tag color="green">{text}</Tag>,
    },
    {
      title: t('units.column.baseRatio'),
      dataIndex: 'ratio',
      key: 'ratio',
      render: (value: number) => <Text strong>{value}</Text>,
    },
    {
      title: t('units.column.kind'),
      key: 'unitType',
      render: (_value: unknown, record) => {
        const unitType = record.unitType ?? inferConversionUnitType(record.fromUnit, record.toUnit);

        if (record.isDeprecated) {
          return <Tag color="red">{t('units.legacyPackage')}</Tag>;
        }

        return <Tag color={conversionTypeColors[unitType]}>{t(conversionTypeLabelKeys[unitType])}</Tag>;
      },
    },
    {
      title: t('units.column.usage'),
      key: 'usage',
      render: (_value: unknown, record) => (
        record.allowPriceFallback ? <Tag color="cyan">{t('units.stockAndPriceFallback')}</Tag> : <Tag>{t('units.stockOnly')}</Tag>
      ),
    },
    {
      title: t('units.column.description'),
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: t('units.column.type'),
      dataIndex: 'isPreset',
      key: 'isPreset',
      render: (_isPreset: boolean, record) => {
        if (record.isDeprecated) return <Tag color="red">{t('units.legacy')}</Tag>;
        return record.isPreset ? <Tag color="gold">{t('units.preset')}</Tag> : <Tag color="cyan">{t('units.custom')}</Tag>;
      },
    },
    {
      title: t('units.column.action'),
      key: 'action',
      render: (_value: unknown, record) => {
        const canEdit = !record.isPreset && !record.isDeprecated;
        const canDelete = !record.isPreset || record.isDeprecated;

        return (
          <Space>
            <Button
              type="text"
              icon={<Edit2 size={16} />}
              disabled={!canEdit}
              onClick={() => handleEditConversion(record)}
              className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            />
            <Button
              danger
              type="text"
              icon={<Trash2 size={16} />}
              disabled={!canDelete}
              onClick={() => handleDeleteConversion(record)}
            />
          </Space>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-6 flex items-center gap-3" data-tour="units-workflow">
        <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
          <Scale size={24} />
        </div>
        <div>
          <Title level={4} style={{ margin: 0 }}>{t('units.title')}</Title>
          <Text type="secondary">{t('units.subtitle')}</Text>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'units',
            label: t('units.tab.units'),
            children: (
              <div className="space-y-4">
                <Alert
                  type="info"
                  showIcon
                  title={t('units.unitsAlertTitle')}
                  description={t('units.unitsAlertDescription')}
                />

                <Card
                  className="shadow-sm"
                  title={t('units.tab.units')}
                  extra={
                    <Space>
                      <Button
                        icon={<RefreshCcw size={16} />}
                        onClick={handleRestoreUnits}
                        loading={restoreUnitsMutation.isPending}
                      >
                        {t('units.restoreDefaults')}
                      </Button>
                      <Button type="primary" icon={<Plus size={16} />} onClick={handleAddUnit}>
                        {t('units.addUnit')}
                      </Button>
                    </Space>
                  }
                >
                  <Table
                    dataSource={units}
                    columns={unitColumns}
                    rowKey="id"
                    loading={isLoadingUnits}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: true }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'conversions',
            label: t('units.tab.conversions'),
            children: (
              <div className="space-y-4">
                <Alert
                  type={legacyPackageCount > 0 ? 'warning' : 'info'}
                  showIcon
                  title={t('units.conversionsAlertTitle')}
                  description={
                    legacyPackageCount > 0
                      ? t('units.legacyPackageWarning', { count: legacyPackageCount })
                      : t('units.conversionsAlertDescription')
                  }
                />

                <Card
                  className="shadow-sm"
                  title={t('units.tab.conversions')}
                  extra={
                    <Space>
                      <Button
                        icon={<RefreshCcw size={16} />}
                        onClick={handleRestoreConversions}
                        loading={restoreConversionsMutation.isPending}
                      >
                        {t('units.restoreDefaults')}
                      </Button>
                      <Button type="primary" icon={<Plus size={16} />} onClick={handleAddConversion}>
                        {t('units.addConversion')}
                      </Button>
                    </Space>
                  }
                >
                  <Table
                    dataSource={conversions}
                    columns={conversionColumns}
                    rowKey="id"
                    loading={isLoadingConversions}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: true }}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={editingUnit ? t('units.editUnitTitle') : t('units.addUnitTitle')}
        open={isUnitModalOpen}
        onCancel={() => {
          setIsUnitModalOpen(false);
          setEditingUnit(null);
        }}
        onOk={() => unitForm.submit()}
        confirmLoading={upsertUnitMutation.isPending}
        destroyOnHidden
        forceRender
      >
        <Form<UnitFormValues>
          form={unitForm}
          layout="vertical"
          onFinish={(values) => upsertUnitMutation.mutate(values)}
          initialValues={{
            type: 'measurement',
            canBeBaseUnit: true,
            canBeConversionUnit: true,
          }}
          onValuesChange={(changed) => {
            const nextType = changed.type;
            if (!nextType || editingUnit) return;
            unitForm.setFieldsValue(getDefaultFlagsForType(nextType));
          }}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label={t('units.name')}
            rules={[{ required: true, message: t('units.nameRequired') }]}
            extra={t('units.nameExtra')}
          >
            <Input placeholder="gram" disabled={Boolean(editingUnit)} />
          </Form.Item>

          <Form.Item
            name="type"
            label={t('units.kind')}
            rules={[{ required: true, message: t('units.requiredSelect') }]}
          >
            <Select
              options={[
                { value: 'measurement', label: t('units.type.measurement') },
                { value: 'count', label: t('units.type.count') },
                { value: 'package', label: t('units.type.package') },
                { value: 'time', label: t('units.type.time') },
              ]}
            />
          </Form.Item>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Form.Item name="canBeBaseUnit" valuePropName="checked">
              <Checkbox>{t('units.canBeBaseUnit')}</Checkbox>
            </Form.Item>
            <Form.Item name="canBeConversionUnit" valuePropName="checked">
              <Checkbox>{t('units.canBeConversionUnit')}</Checkbox>
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title={editingConversion ? t('units.editConversionTitle') : t('units.addConversionTitle')}
        open={isConversionModalOpen}
        onCancel={() => {
          setIsConversionModalOpen(false);
          setEditingConversion(null);
        }}
        onOk={() => conversionForm.submit()}
        confirmLoading={upsertConversionMutation.isPending}
        destroyOnHidden
        forceRender
      >
        <Form<ConversionFormValues>
          form={conversionForm}
          layout="vertical"
          onFinish={(values) => upsertConversionMutation.mutate(values)}
          initialValues={{ ratio: 1 }}
          className="mt-4"
        >
          <Form.Item
            name="baseUnit"
            label={t('units.baseUnit')}
            rules={[{ required: true, message: t('units.requiredSelect') }]}
            extra={t('units.baseUnitExtra')}
          >
            <Select
              showSearch
              placeholder={t('units.baseUnitPlaceholder')}
              options={globalBaseUnitOptions}
              disabled={Boolean(editingConversion?.isPreset)}
            />
          </Form.Item>

          <Form.Item
            name="conversionUnit"
            label={t('units.conversionUnit')}
            rules={[{ required: true, message: t('units.requiredSelect') }]}
            extra={t('units.conversionUnitExtra')}
          >
            <Select
              showSearch
              placeholder={t('units.conversionUnitPlaceholder')}
              options={globalConversionUnitOptions}
              disabled={Boolean(editingConversion?.isPreset)}
            />
          </Form.Item>

          <Form.Item
            name="ratio"
            label={t('units.ratio')}
            rules={[{ required: true, message: t('units.ratioRequired') }, { type: 'number', min: 0.000001, message: t('units.ratioMin') }]}
            extra={t('units.ratioExtra')}
          >
            <InputNumber
              inputMode="decimal"
              className="w-full"
              placeholder={t('units.ratioPlaceholder')}
              disabled={Boolean(editingConversion?.isPreset)}
            />
          </Form.Item>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
            <Text type="secondary" className="text-xs">
              {t('units.ratioExample')}
            </Text>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
