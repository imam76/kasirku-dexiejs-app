import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, RotateCcw } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useI18n } from '@/hooks/useI18n';
import type { PaymentMethodCategory, PaymentMethodMaster } from '@/types';

const { Text } = Typography;

interface Props {
  paymentMethods: PaymentMethodMaster[];
  onEdit: (method: PaymentMethodMaster) => void;
  onArchive: (method: PaymentMethodMaster) => void;
  onRestore: (method: PaymentMethodMaster) => void;
}

export default function PaymentMethodTable({ paymentMethods, onEdit, onArchive, onRestore }: Props) {
  const { t } = useI18n();
  const accounts = useLiveQuery(() => db.chartOfAccounts.toArray(), [], []);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const columns: ColumnsType<PaymentMethodMaster> = [
    { title: t('paymentMethods.table.method'), key: 'method', render: (_, method) => <Space orientation="vertical" size={0}><Text strong>{method.name}</Text><Text type="secondary">{method.code}</Text></Space> },
    { title: t('paymentMethods.table.category'), dataIndex: 'category', render: (category: PaymentMethodCategory) => <Tag>{t(`paymentMethods.category.${category}`)}</Tag> },
    { title: t('paymentMethods.table.account'), key: 'account', render: (_, method) => {
      const account = method.posting_account_id ? accountById.get(method.posting_account_id) : undefined;
      const isInvalid = method.is_active && (!account || !account.is_active || !account.is_postable || account.type !== 'ASSET');
      return <Space orientation="vertical" size={0}><Text>{method.posting_account_code ? `${method.posting_account_code} — ${method.posting_account_name}` : '-'}</Text>{isInvalid && <Tag color="warning">{t('paymentMethods.accountInvalid')}</Tag>}</Space>;
    } },
    { title: t('paymentMethods.table.reference'), dataIndex: 'requires_reference', render: (required) => required ? t('common.yes') : t('common.no') },
    { title: t('paymentMethods.table.status'), dataIndex: 'is_active', render: (active, method) => <Space><Tag color={active ? 'green' : 'default'}>{active ? t('paymentMethods.status.active') : t('paymentMethods.status.inactive')}</Tag>{method.is_system && <Tag color="blue">{t('paymentMethods.system')}</Tag>}</Space> },
    { title: t('paymentMethods.table.action'), key: 'action', render: (_, method) => <Space wrap><Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(method)}>{t('paymentMethods.edit')}</Button>{method.is_active ? <Button danger type="text" disabled={method.is_system} icon={<Archive size={16} />} onClick={() => onArchive(method)}>{t('paymentMethods.archive')}</Button> : <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(method)}>{t('paymentMethods.restore')}</Button>}</Space> },
  ];
  return <Table dataSource={paymentMethods} columns={columns} rowKey="id" pagination={{ pageSize: 8 }} scroll={{ x: 1000 }} locale={{ emptyText: t('paymentMethods.empty') }} />;
}
