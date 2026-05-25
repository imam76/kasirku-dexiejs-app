import { Button, Card, Descriptions, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowLeft, Edit, Send } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { getSalesDocumentTypePathSegment } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { useSalesReturns } from '@/hooks/useSalesReturns';
import { db } from '@/lib/db';
import type { TranslationKey } from '@/i18n/messages';
import type { SalesReturnItem, SalesReturnResolution, SalesReturnStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const { Title, Text } = Typography;

const statusColor: Record<SalesReturnStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'blue',
  VOIDED: 'red',
};

const resolutionColor: Record<SalesReturnResolution, string> = {
  NO_FINANCE: 'default',
  CREDIT_NOTE: 'gold',
  REFUND: 'red',
};

const statusLabelKey: Record<SalesReturnStatus, 'salesReturns.status.draft' | 'salesReturns.status.issued' | 'salesReturns.status.voided'> = {
  DRAFT: 'salesReturns.status.draft',
  ISSUED: 'salesReturns.status.issued',
  VOIDED: 'salesReturns.status.voided',
};

const resolutionLabelKey: Record<SalesReturnResolution, 'salesReturns.resolution.noFinance' | 'salesReturns.resolution.creditNote' | 'salesReturns.resolution.refund'> = {
  NO_FINANCE: 'salesReturns.resolution.noFinance',
  CREDIT_NOTE: 'salesReturns.resolution.creditNote',
  REFUND: 'salesReturns.resolution.refund',
};

const conditionLabelKey: Record<SalesReturnItem['condition'], TranslationKey> = {
  SELLABLE: 'salesReturns.condition.sellable',
  DAMAGED: 'salesReturns.condition.damaged',
  DISCARDED: 'salesReturns.condition.discarded',
};

interface SalesReturnDetailProps {
  returnId: string;
}

export default function SalesReturnDetail({ returnId }: SalesReturnDetailProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { issueReturn, voidReturn, isMutating } = useSalesReturns();
  const salesReturn = useLiveQuery(
    () => db.salesReturns.get(returnId),
    [returnId],
  );
  const items = useLiveQuery(
    () => db.salesReturnItems.where('return_id').equals(returnId).toArray(),
    [returnId],
    [],
  );

  if (!salesReturn) {
    return <div className="p-6">{t('salesReturns.notFound')}</div>;
  }

  const sourceLink = salesReturn.source_document_type ? (
    <Link
      to="/finance/sales/$documentType/$documentId"
      params={{
        documentType: getSalesDocumentTypePathSegment(salesReturn.source_document_type),
        documentId: salesReturn.source_id,
      }}
    >
      {salesReturn.source_number}
    </Link>
  ) : salesReturn.source_number;

  const columns: ColumnsType<SalesReturnItem> = [
    {
      title: t('salesReturns.field.product'),
      dataIndex: 'product_name',
      render: (value: string, record) => (
        <div>
          <Text strong>{value}</Text>
          <div className="mt-1 text-xs text-gray-500">
            {record.sku ? `${record.sku} · ` : ''}
            {record.source_quantity} {record.unit}
          </div>
        </div>
      ),
    },
    {
      title: t('salesReturns.field.returnQuantity'),
      dataIndex: 'quantity',
      align: 'right',
      width: 130,
      render: (value: number, record) => `${value} ${record.unit}`,
    },
    {
      title: t('salesReturns.field.condition'),
      dataIndex: 'condition',
      width: 140,
      render: (value: SalesReturnItem['condition']) => t(conditionLabelKey[value]),
    },
    {
      title: t('salesReturns.field.restockQuantity'),
      dataIndex: 'restock_quantity',
      align: 'right',
      width: 140,
      render: (value: number | undefined, record) => `${value || 0} ${record.unit}`,
    },
    {
      title: t('salesReturns.field.returnValue'),
      dataIndex: 'total_amount',
      align: 'right',
      width: 150,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
  ];

  const handleVoid = () => {
    let voidReason = '';

    Modal.confirm({
      title: t('salesReturns.voidConfirmTitle'),
      content: (
        <div className="space-y-3">
          <Text type="secondary">{t('salesReturns.voidConfirmContent')}</Text>
          <Input.TextArea
            rows={3}
            placeholder={t('salesReturns.voidReasonPlaceholder')}
            onChange={(event) => {
              voidReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('salesReturns.void'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const normalizedReason = voidReason.trim();
        if (!normalizedReason) {
          throw new Error(t('salesReturns.voidReasonRequired'));
        }

        await voidReturn({ id: salesReturn.id, reason: normalizedReason });
      },
    });
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ margin: 0 }}>{salesReturn.return_number}</Title>
          <Text type="secondary">{t('salesReturns.detailSubtitle')}</Text>
        </div>
        <Space wrap>
          <Link to="/finance/sales/returns">
            <Button icon={<ArrowLeft size={16} />}>{t('salesReturns.backToList')}</Button>
          </Link>
          {salesReturn.status === 'DRAFT' && (
            <>
              <Button
                icon={<Edit size={16} />}
                onClick={() => navigate({ to: '/finance/sales/returns/$returnId/edit', params: { returnId: salesReturn.id } })}
              >
                {t('salesReturns.editDraft')}
              </Button>
              <Button
                type="primary"
                icon={<Send size={16} />}
                loading={isMutating}
                onClick={async () => {
                  await issueReturn(salesReturn.id);
                }}
              >
                {t('salesReturns.issue')}
              </Button>
            </>
          )}
          {salesReturn.status === 'ISSUED' && (
            <Button danger icon={<AlertTriangle size={16} />} loading={isMutating} onClick={handleVoid}>
              {t('salesReturns.void')}
            </Button>
          )}
        </Space>
      </div>

      <Card>
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label={t('salesReturns.field.status')}>
            <Tag color={statusColor[salesReturn.status]}>{t(statusLabelKey[salesReturn.status])}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('salesReturns.field.resolution')}>
            <Tag color={resolutionColor[salesReturn.resolution]}>{t(resolutionLabelKey[salesReturn.resolution])}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('salesReturns.field.source')}>{sourceLink}</Descriptions.Item>
          <Descriptions.Item label={t('salesReturns.field.customer')}>{salesReturn.customer_name}</Descriptions.Item>
          <Descriptions.Item label={t('salesReturns.field.documentDate')}>{formatDate(salesReturn.document_date)}</Descriptions.Item>
          <Descriptions.Item label={t('salesReturns.field.reason')}>{salesReturn.reason || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('salesReturns.field.refundAmount')}>Rp {formatCurrency(salesReturn.refund_amount || 0)}</Descriptions.Item>
          <Descriptions.Item label={t('salesReturns.field.creditAmount')}>Rp {formatCurrency(salesReturn.credit_amount || 0)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={items}
        pagination={false}
        scroll={{ x: true }}
      />

      <Card size="small">
        <div className="flex flex-col gap-2 md:items-end">
          <div className="w-full max-w-[300px] space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('salesReturns.field.subtotal')}</span>
              <span>Rp {formatCurrency(salesReturn.subtotal_amount || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t('salesReturns.field.discount')}</span>
              <span>Rp {formatCurrency(salesReturn.discount_amount || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t('salesReturns.field.tax')}</span>
              <span>Rp {formatCurrency(salesReturn.tax_amount || 0)}</span>
            </div>
            <div className="flex justify-between rounded-md bg-gray-900 px-3 py-2 text-white">
              <span>{t('salesReturns.field.total')}</span>
              <strong>Rp {formatCurrency(salesReturn.total_amount || 0)}</strong>
            </div>
          </div>
        </div>
      </Card>

      {salesReturn.status === 'VOIDED' && (
        <Card size="small">
          <Text type="danger">
            {salesReturn.voided_at ? formatDate(salesReturn.voided_at) : '-'} - {salesReturn.void_reason || '-'}
          </Text>
        </Card>
      )}
    </div>
  );
}
