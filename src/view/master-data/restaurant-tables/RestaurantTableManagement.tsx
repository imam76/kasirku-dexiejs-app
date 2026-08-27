import { App, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import { Armchair, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import {
  canDeleteRestaurantTable,
  createRestaurantTable,
  deleteRestaurantTable,
  normalizeRestaurantTableName,
  updateRestaurantTable,
  RESTAURANT_TABLE_TYPES,
  type RestaurantTableFilterStatus,
  type RestaurantTableFilterType,
  type RestaurantTableInput,
} from '@/services/restaurantTableService';
import type { RestaurantTableRecord, RestaurantTableType } from '@/types';
import RestaurantTableSeedModal from './RestaurantTableSeedModal';
import { RESTAURANT_TABLE_TYPE_LABEL_KEY, RESTAURANT_TABLE_TYPE_TAG_COLOR } from './restaurantTableTypeMeta';

export default function RestaurantTableManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { can } = useAuth();
  const [form] = Form.useForm<RestaurantTableInput>();
  const [editing, setEditing] = useState<RestaurantTableRecord>();
  const [formOpen, setFormOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<RestaurantTableFilterType>('ALL');
  const [statusFilter, setStatusFilter] = useState<RestaurantTableFilterStatus>('ALL');
  const tables = useLiveQuery(
    () => db.restaurantTables.filter((table) => table.is_active).sortBy('name'),
    [],
  );

  const visibleTables = useMemo(() => {
    const normalizedSearch = normalizeRestaurantTableName(search);
    return (tables ?? []).filter((table) => (
      (!normalizedSearch || table.normalized_name.includes(normalizedSearch))
      && (typeFilter === 'ALL' || table.type === typeFilter)
      && (statusFilter === 'ALL' || table.status === statusFilter)
    ));
  }, [search, statusFilter, tables, typeFilter]);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ type: 'REGULAR', capacity: 1 });
    setFormOpen(true);
  };

  const openEdit = (table: RestaurantTableRecord) => {
    setEditing(table);
    form.setFieldsValue({ name: table.name, capacity: table.capacity, type: table.type });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(undefined);
    form.resetFields();
  };

  const save = async (values: RestaurantTableInput) => {
    setSaving(true);
    try {
      if (editing) {
        await updateRestaurantTable(editing.id, values);
        message.success(t('restaurantTables.updateSuccess'));
      } else {
        await createRestaurantTable(values);
        message.success(t('restaurantTables.createSuccess'));
      }
      closeForm();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('restaurantTables.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (table: RestaurantTableRecord) => {
    modal.confirm({
      title: t('restaurantTables.deleteConfirmTitle'),
      content: t('restaurantTables.deleteConfirmContent', { name: table.name }),
      okText: t('restaurantTables.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteRestaurantTable(table.id);
          message.success(t('restaurantTables.deleteSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('restaurantTables.deleteFailed'));
        }
      },
    });
  };

  const typeLabel = (type: RestaurantTableType) => t(
    RESTAURANT_TABLE_TYPE_LABEL_KEY[type] ?? 'restaurantTables.regular',
  );

  const typeOptions = RESTAURANT_TABLE_TYPES.map((tableType) => ({
    value: tableType,
    label: typeLabel(tableType),
  }));

  const handleSeeded = ({ created, skipped }: { created: number; skipped: string[] }) => {
    message.success(skipped.length > 0
      ? t('restaurantTables.bulkSuccessSkipped', { count: created, skipped: skipped.length })
      : t('restaurantTables.bulkSuccess', { count: created }));
  };

  const columns: ColumnsType<RestaurantTableRecord> = [
    { title: t('restaurantTables.name'), dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name, 'id-ID') },
    { title: t('restaurantTables.capacity'), dataIndex: 'capacity', key: 'capacity', width: 150 },
    { title: t('restaurantTables.type'), dataIndex: 'type', key: 'type', width: 120, render: (type: RestaurantTableType) => <Tag color={RESTAURANT_TABLE_TYPE_TAG_COLOR[type] ?? 'blue'}>{typeLabel(type)}</Tag> },
    { title: t('restaurantTables.status'), dataIndex: 'status', key: 'status', width: 130, render: (status) => <Tag color={status === 'OCCUPIED' ? 'orange' : 'green'}>{status === 'OCCUPIED' ? t('restaurantTables.occupied') : t('restaurantTables.available')}</Tag> },
    {
      title: t('restaurantTables.actions'),
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, table) => (
        <Space size="small">
          {can('RESTAURANT_TABLE_UPDATE') ? <Button type="text" aria-label={`${t('restaurantTables.edit')} ${table.name}`} icon={<Pencil size={16} />} onClick={() => openEdit(table)} /> : null}
          {can('RESTAURANT_TABLE_DELETE') ? <Button type="text" danger aria-label={`${t('restaurantTables.delete')} ${table.name}`} disabled={!canDeleteRestaurantTable(table)} icon={<Trash2 size={16} />} onClick={() => confirmDelete(table)} /> : null}
        </Space>
      ),
    },
  ];

  return (
    <Card className="shadow-md">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700"><Armchair size={22} /></span>
          <div>
            <Typography.Title level={3} className="!mb-1">{t('restaurantTables.title')}</Typography.Title>
            <Typography.Text type="secondary">{t('restaurantTables.description')}</Typography.Text>
          </div>
        </div>
        {can('RESTAURANT_TABLE_CREATE') ? (
          <Space wrap>
            <Button icon={<LayoutGrid size={16} />} onClick={() => setSeedOpen(true)}>{t('restaurantTables.bulkAdd')}</Button>
            <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>{t('restaurantTables.add')}</Button>
          </Space>
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px]">
        <Input.Search allowClear value={search} placeholder={t('restaurantTables.search')} onChange={(event) => setSearch(event.target.value)} />
        <Select<RestaurantTableFilterType> value={typeFilter} onChange={setTypeFilter} options={[
          { value: 'ALL' as const, label: t('restaurantTables.allTypes') },
          ...typeOptions,
        ]} />
        <Select<RestaurantTableFilterStatus> value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'ALL', label: t('restaurantTables.allStatuses') },
          { value: 'AVAILABLE', label: t('restaurantTables.available') },
          { value: 'OCCUPIED', label: t('restaurantTables.occupied') },
        ]} />
      </div>

      <Table<RestaurantTableRecord>
        rowKey="id"
        loading={tables === undefined}
        columns={columns}
        dataSource={visibleTables}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={{ x: 720 }}
        locale={{ emptyText: <Empty description={t('restaurantTables.empty')} /> }}
      />

      <Modal title={editing ? t('restaurantTables.edit') : t('restaurantTables.add')} open={formOpen} onCancel={closeForm} onOk={() => form.submit()} confirmLoading={saving} okText={t('restaurantTables.save')} cancelText={t('common.cancel')} destroyOnHidden>
        <Form<RestaurantTableInput> form={form} layout="vertical" onFinish={save} requiredMark="optional">
          <Form.Item name="name" label={t('restaurantTables.name')} rules={[{ required: true, whitespace: true, message: t('restaurantTables.nameRequired') }]}>
            <Input autoFocus maxLength={80} placeholder={t('restaurantTables.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="capacity" label={t('restaurantTables.capacity')} rules={[
            { required: true, message: t('restaurantTables.capacityRequired') },
            { type: 'integer', min: 1, message: t('restaurantTables.capacityInvalid') },
          ]}>
            <InputNumber min={1} precision={0} className="w-full" />
          </Form.Item>
          <Form.Item name="type" label={t('restaurantTables.type')} initialValue="REGULAR" rules={[{ required: true }]}>
            <Select options={typeOptions} />
          </Form.Item>
          {editing ? <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500"><Tag color={editing.status === 'OCCUPIED' ? 'orange' : 'green'}>{editing.status === 'OCCUPIED' ? t('restaurantTables.occupied') : t('restaurantTables.available')}</Tag>{t('restaurantTables.readOnlyStatus')}</div> : null}
        </Form>
      </Modal>

      <RestaurantTableSeedModal
        open={seedOpen}
        existingTables={tables ?? []}
        onClose={() => setSeedOpen(false)}
        onCreated={handleSeeded}
      />
    </Card>
  );
}
