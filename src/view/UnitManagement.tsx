import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Edit2, Plus, RefreshCcw, Scale, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import type { UnitConversion, UnitDefinition, UnitDefinitionType } from '@/types';
import { setConversionRegistry } from '@/utils/pricing';
import {
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

const unitTypeLabels: Record<UnitDefinitionType, string> = {
  measurement: 'Unit Ukur',
  count: 'Satuan Hitung',
  package: 'Kemasan',
  time: 'Waktu',
};

const conversionTypeLabels: Record<UnitConversionType, string> = {
  measurement: 'Unit Ukur',
  package: 'Kemasan',
  time: 'Waktu',
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
        throw new Error('Nama satuan harus diisi.');
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
      message.success(editingUnit ? 'Satuan berhasil diperbarui' : 'Satuan berhasil ditambahkan');
      setIsUnitModalOpen(false);
      setEditingUnit(null);
      unitForm.resetFields();
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.name === 'ConstraintError') {
        message.error('Satuan ini sudah ada');
        return;
      }

      message.error(error instanceof Error ? error.message : 'Gagal menyimpan satuan');
    },
  });

  const deleteUnitMutation = useMutation({
    mutationFn: async (unitId: string) => {
      const unit = await db.units.get(unitId);
      if (unit?.isPreset) {
        throw new Error('Satuan bawaan tidak bisa dihapus.');
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
        throw new Error('Satuan masih digunakan oleh produk atau konversi.');
      }

      await db.units.delete(unitId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      message.success('Satuan berhasil dihapus');
    },
    onError: (error: unknown) => {
      message.error(error instanceof Error ? error.message : 'Gagal menghapus satuan');
    },
  });

  const restoreUnitsMutation = useMutation({
    mutationFn: async () => {
      await db.units.bulkPut(DEFAULT_UNITS);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      message.success('Satuan bawaan berhasil dipulihkan');
    },
  });

  const upsertConversionMutation = useMutation({
    mutationFn: async (values: ConversionFormValues) => {
      const baseUnit = normalizeUnitKey(values.baseUnit);
      const conversionUnit = normalizeUnitKey(values.conversionUnit);
      const ratio = Number(values.ratio);

      if (!baseUnit || !conversionUnit) {
        throw new Error('Unit dasar dan unit konversi harus dipilih.');
      }

      if (baseUnit === conversionUnit) {
        throw new Error('Unit dasar dan unit konversi tidak boleh sama.');
      }

      if (!Number.isFinite(ratio) || ratio <= 0) {
        throw new Error('Rasio harus lebih besar dari 0.');
      }

      const baseUnitRecord = unitMap.get(baseUnit);
      const conversionUnitRecord = unitMap.get(conversionUnit);

      if (!baseUnitRecord || !conversionUnitRecord) {
        throw new Error('Unit yang dipilih tidak ditemukan.');
      }

      if (!baseUnitRecord.canBeBaseUnit || !conversionUnitRecord.canBeConversionUnit) {
        throw new Error('Unit yang dipilih tidak sesuai dengan flag base/conversion.');
      }

      if (!isGlobalConvertibleUnitType(baseUnitRecord.type) || !isGlobalConvertibleUnitType(conversionUnitRecord.type)) {
        throw new Error('Konversi global hanya boleh untuk unit ukur atau waktu.');
      }

      if (baseUnitRecord.type !== conversionUnitRecord.type) {
        throw new Error('Jenis unit dasar dan unit konversi harus sama.');
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
      message.success(editingConversion ? 'Konversi satuan berhasil diperbarui' : 'Konversi satuan berhasil ditambahkan');
      setIsConversionModalOpen(false);
      setEditingConversion(null);
      conversionForm.resetFields();
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.name === 'ConstraintError') {
        message.error('Kombinasi konversi ini sudah ada');
        return;
      }

      message.error(error instanceof Error ? error.message : 'Gagal menyimpan konversi');
    },
  });

  const deleteConversionMutation = useMutation({
    mutationFn: async (id: string) => {
      await db.unitConversions.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitConversions'] });
      message.success('Konversi satuan berhasil dihapus');
    },
  });

  const restoreConversionsMutation = useMutation({
    mutationFn: async () => {
      await db.unitConversions.bulkPut(DEFAULT_CONVERSIONS);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitConversions'] });
      message.success('Konversi bawaan berhasil dipulihkan');
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
      title: 'Hapus Satuan',
      content: `Apakah Anda yakin ingin menghapus satuan "${unit.name}"?`,
      okText: 'Hapus',
      okType: 'danger',
      cancelText: 'Batal',
      onOk: () => deleteUnitMutation.mutate(unit.id),
    });
  };

  const handleRestoreUnits = () => {
    modal.confirm({
      title: 'Pulihkan Satuan Bawaan',
      content: 'Ini akan memulihkan daftar satuan bawaan tanpa menghapus satuan custom.',
      okText: 'Pulihkan',
      cancelText: 'Batal',
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
      title: 'Hapus Konversi',
      content: `Apakah Anda yakin ingin menghapus konversi "${record.label}"?`,
      okText: 'Hapus',
      okType: 'danger',
      cancelText: 'Batal',
      onOk: () => deleteConversionMutation.mutate(record.id),
    });
  };

  const handleRestoreConversions = () => {
    modal.confirm({
      title: 'Pulihkan Konversi Bawaan',
      content: 'Ini akan memulihkan konversi global bawaan untuk unit ukur dan waktu. Konversi custom tidak akan terhapus.',
      okText: 'Pulihkan',
      cancelText: 'Batal',
      onOk: () => restoreConversionsMutation.mutate(),
    });
  };

  const unitColumns: ColumnsType<UnitDefinition> = [
    {
      title: 'Satuan',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'Jenis',
      dataIndex: 'type',
      key: 'type',
      render: (type: UnitDefinitionType) => <Tag color={unitTypeColors[type]}>{unitTypeLabels[type]}</Tag>,
    },
    {
      title: 'Base Unit',
      dataIndex: 'canBeBaseUnit',
      key: 'canBeBaseUnit',
      render: (value: boolean) => (value ? <Tag color="green">Ya</Tag> : <Tag>Tidak</Tag>),
    },
    {
      title: 'Conversion Unit',
      dataIndex: 'canBeConversionUnit',
      key: 'canBeConversionUnit',
      render: (value: boolean) => (value ? <Tag color="cyan">Ya</Tag> : <Tag>Tidak</Tag>),
    },
    {
      title: 'Tipe',
      dataIndex: 'isPreset',
      key: 'isPreset',
      render: (isPreset: boolean) => (
        isPreset ? <Tag color="gold">Bawaan</Tag> : <Tag color="cyan">Custom</Tag>
      ),
    },
    {
      title: 'Aksi',
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
      title: 'Unit Konversi',
      dataIndex: 'fromUnit',
      key: 'fromUnit',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'Unit Dasar',
      dataIndex: 'toUnit',
      key: 'toUnit',
      render: (text: string) => <Tag color="green">{text}</Tag>,
    },
    {
      title: 'Rasio ke Dasar',
      dataIndex: 'ratio',
      key: 'ratio',
      render: (value: number) => <Text strong>{value}</Text>,
    },
    {
      title: 'Jenis',
      key: 'unitType',
      render: (_value: unknown, record) => {
        const unitType = record.unitType ?? inferConversionUnitType(record.fromUnit, record.toUnit);

        if (record.isDeprecated) {
          return <Tag color="red">Legacy Kemasan</Tag>;
        }

        return <Tag color={conversionTypeColors[unitType]}>{conversionTypeLabels[unitType]}</Tag>;
      },
    },
    {
      title: 'Pemakaian',
      key: 'usage',
      render: (_value: unknown, record) => (
        record.allowPriceFallback ? <Tag color="cyan">Stok + Fallback Harga</Tag> : <Tag>Stok Saja</Tag>
      ),
    },
    {
      title: 'Keterangan',
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: 'Tipe',
      dataIndex: 'isPreset',
      key: 'isPreset',
      render: (_isPreset: boolean, record) => {
        if (record.isDeprecated) return <Tag color="red">Legacy</Tag>;
        return record.isPreset ? <Tag color="gold">Bawaan</Tag> : <Tag color="cyan">Custom</Tag>;
      },
    },
    {
      title: 'Aksi',
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
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
          <Scale size={24} />
        </div>
        <div>
          <Title level={4} style={{ margin: 0 }}>Manajemen Satuan & Konversi</Title>
          <Text type="secondary">Kelola satuan produk dan konversi kuantitas untuk stok.</Text>
        </div>
      </div>

      <Tabs
        items={[
          {
            key: 'units',
            label: 'Daftar Satuan',
            children: (
              <div className="space-y-4">
                <Alert
                  type="info"
                  showIcon
                  title="Satuan dipakai sebagai pilihan di produk"
                  description="Flag base unit menentukan satuan yang boleh menjadi satuan dasar stok. Flag conversion unit menentukan satuan yang boleh dikonversi ke base unit."
                />

                <Card
                  className="shadow-sm"
                  title="Daftar Satuan"
                  extra={
                    <Space>
                      <Button
                        icon={<RefreshCcw size={16} />}
                        onClick={handleRestoreUnits}
                        loading={restoreUnitsMutation.isPending}
                      >
                        Pulihkan Bawaan
                      </Button>
                      <Button type="primary" icon={<Plus size={16} />} onClick={handleAddUnit}>
                        Tambah Satuan
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
            label: 'Konversi Global',
            children: (
              <div className="space-y-4">
                <Alert
                  type={legacyPackageCount > 0 ? 'warning' : 'info'}
                  showIcon
                  title="Konversi global hanya untuk unit ukur yang stabil"
                  description={
                    legacyPackageCount > 0
                      ? `Terdapat ${legacyPackageCount} konversi kemasan legacy. Hapus dan pindahkan konsep isi kemasan ke pengaturan produk saat fitur product unit mapping tersedia.`
                      : 'Unit kemasan seperti dus, pack, ikat, dan renteng sebaiknya diatur per produk karena isi kemasan bisa berbeda antar produk.'
                  }
                />

                <Card
                  className="shadow-sm"
                  title="Konversi Global"
                  extra={
                    <Space>
                      <Button
                        icon={<RefreshCcw size={16} />}
                        onClick={handleRestoreConversions}
                        loading={restoreConversionsMutation.isPending}
                      >
                        Pulihkan Bawaan
                      </Button>
                      <Button type="primary" icon={<Plus size={16} />} onClick={handleAddConversion}>
                        Tambah Konversi
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
        title={editingUnit ? 'Edit Satuan' : 'Tambah Satuan Baru'}
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
            label="Nama Satuan"
            rules={[{ required: true, message: 'Wajib diisi' }]}
            extra="Contoh: gram, kg, pcs, dus"
          >
            <Input placeholder="gram" disabled={Boolean(editingUnit)} />
          </Form.Item>

          <Form.Item
            name="type"
            label="Jenis Satuan"
            rules={[{ required: true, message: 'Wajib dipilih' }]}
          >
            <Select
              options={[
                { value: 'measurement', label: 'Unit Ukur' },
                { value: 'count', label: 'Satuan Hitung' },
                { value: 'package', label: 'Kemasan' },
                { value: 'time', label: 'Waktu' },
              ]}
            />
          </Form.Item>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Form.Item name="canBeBaseUnit" valuePropName="checked">
              <Checkbox>Can be base unit</Checkbox>
            </Form.Item>
            <Form.Item name="canBeConversionUnit" valuePropName="checked">
              <Checkbox>Can be conversion unit</Checkbox>
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title={editingConversion ? 'Edit Konversi' : 'Tambah Konversi Baru'}
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
            label="Unit Dasar"
            rules={[{ required: true, message: 'Wajib dipilih' }]}
            extra="Satuan paling kecil/stabil untuk stok. Contoh: gram."
          >
            <Select
              showSearch
              placeholder="Pilih unit dasar"
              options={globalBaseUnitOptions}
              disabled={Boolean(editingConversion?.isPreset)}
            />
          </Form.Item>

          <Form.Item
            name="conversionUnit"
            label="Unit Konversi"
            rules={[{ required: true, message: 'Wajib dipilih' }]}
            extra="Satuan yang dikonversi ke unit dasar. Contoh: kg."
          >
            <Select
              showSearch
              placeholder="Pilih unit konversi"
              options={globalConversionUnitOptions}
              disabled={Boolean(editingConversion?.isPreset)}
            />
          </Form.Item>

          <Form.Item
            name="ratio"
            label="Conversion Ratio"
            rules={[{ required: true, message: 'Wajib diisi' }, { type: 'number', min: 0.000001, message: 'Harus > 0' }]}
            extra="1 unit konversi sama dengan berapa unit dasar."
          >
            <InputNumber
              inputMode="decimal"
              className="w-full"
              placeholder="Contoh: 1000"
              disabled={Boolean(editingConversion?.isPreset)}
            />
          </Form.Item>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
            <Text type="secondary" className="text-xs">
              Contoh: Unit Dasar gram, Unit Konversi kg, Ratio 1000 berarti 1 kg = 1000 gram.
            </Text>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
