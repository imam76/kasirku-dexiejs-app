import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Plus, Trash2, PackagePlus } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useStockIn } from '@/hooks/useStockIn';
import { buildManualStockInLine } from '@/utils/stockIn/stockInLine';
import { getProductUnits } from '@/utils/productUnits';
import { useI18n } from '@/hooks/useI18n';
import type { StockInLine } from '@/utils/stockIn/stockInCsv';

const { Text } = Typography;

interface DraftRow {
  key: string;
  productId?: string;
  quantity?: number;
  unit?: string;
  costPerUnit?: number;
  notes?: string;
}

const createEmptyRow = (): DraftRow => ({ key: crypto.randomUUID() });

const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(value);

export default function StockInPage() {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const {
    products,
    suppliers,
    cutoffDate,
    getRouting,
    submitStockIn,
    isSubmitting,
  } = useStockIn();

  const [documentDate, setDocumentDate] = useState(() => dayjs());
  const [contactId, setContactId] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([createEmptyRow()]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const documentDateValue = documentDate.format('YYYY-MM-DD');

  /**
   * Every filled row is converted eagerly so the screen can show the same
   * errors, totals, and routing the submit would produce. Nothing is decided at
   * save time that is not already visible here.
   */
  const { lines, rowErrors } = useMemo(() => {
    const built: StockInLine[] = [];
    const errors = new Map<string, string>();

    rows.forEach((row, index) => {
      const product = row.productId ? productsById.get(row.productId) : undefined;
      if (!product || row.quantity === undefined || row.quantity === null) return;

      const result = buildManualStockInLine({
        rowNumber: index + 1,
        product,
        quantity: row.quantity,
        unit: row.unit,
        costPerUnit: row.costPerUnit ?? undefined,
        notes: row.notes,
      });

      if (result.ok) {
        built.push(result.line);
      } else {
        errors.set(row.key, result.error);
      }
    });

    return { lines: built, rowErrors: errors };
  }, [rows, productsById]);

  const hasFinalPrice = lines.length > 0 && lines.every((line) => line.costPerUnit !== undefined);
  const routing = getRouting(documentDateValue, hasFinalPrice);
  const totalValue = lines.reduce((sum, line) => sum + (line.totalValue ?? 0), 0);

  const updateRow = (key: string, patch: Partial<DraftRow>) => {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleProductChange = (key: string, productId: string) => {
    const product = productsById.get(productId);
    updateRow(key, {
      productId,
      unit: product?.purchase_unit,
      costPerUnit: product?.purchase_price || undefined,
    });
  };

  const handleAddRow = () => setRows((previous) => [...previous, createEmptyRow()]);

  const handleRemoveRow = (key: string) => {
    setRows((previous) => (
      previous.length === 1 ? [createEmptyRow()] : previous.filter((row) => row.key !== key)
    ));
  };

  const destinationLabel = routing.mode === 'OPENING'
    ? t('stockIn.destination.opening', { date: documentDate.format('DD MMM YYYY') })
    : routing.purchaseDocumentType === 'PURCHASE_INVOICE'
      ? t('stockIn.destination.invoice')
      : t('stockIn.destination.receipt');

  const blockerNotice = (() => {
    if (routing.mode !== 'PURCHASE') return undefined;
    if (routing.openingBlocker === 'BATCH_POSTED') return t('stockIn.blocker.batchPosted');
    if (routing.openingBlocker === 'BATCH_LOCKED') return t('stockIn.blocker.batchLocked');
    if (routing.openingBlocker === 'NO_CUTOFF') return t('stockIn.blocker.noCutoff');
    return undefined;
  })();

  const handleSubmit = async () => {
    if (rowErrors.size > 0) {
      message.error(t('stockIn.fixRowsFirst'));
      return;
    }
    if (lines.length === 0) {
      message.error(t('stockIn.noLines'));
      return;
    }

    modal.confirm({
      title: t('stockIn.confirmTitle'),
      content: (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">{destinationLabel}</div>
          <div className="text-sm text-gray-700">
            {t('stockIn.confirmLines', { count: lines.length })}
          </div>
          {hasFinalPrice ? (
            <div className="text-sm text-gray-700">
              {t('stockIn.confirmTotal', { total: formatCurrency(totalValue) })}
            </div>
          ) : (
            <Alert type="warning" showIcon message={t('stockIn.confirmPendingPrice')} />
          )}
        </div>
      ),
      okText: t('stockIn.save'),
      cancelText: t('stockIn.cancel'),
      okButtonProps: { disabled: isSubmitting },
      onOk: async () => {
        try {
          await submitStockIn({
            documentDate: documentDateValue,
            lines,
            supplierName: suppliers.find((supplier) => supplier.id === contactId)?.name,
            contactId,
            notes: notes.trim() || undefined,
          });
          setRows([createEmptyRow()]);
          setNotes('');
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('stockIn.saveFailed'));
          throw error;
        }
      },
    });
  };

  const columns: ColumnsType<DraftRow> = [
    {
      title: t('stockIn.column.product'),
      dataIndex: 'productId',
      width: 260,
      render: (_, row) => (
        <Select
          showSearch
          allowClear
          className="w-full"
          placeholder={t('stockIn.selectProduct')}
          value={row.productId}
          optionFilterProp="label"
          onChange={(value) => (value
            ? handleProductChange(row.key, value)
            : updateRow(row.key, { productId: undefined }))}
          options={products.map((product) => ({
            value: product.id,
            label: product.sku ? `${product.sku} — ${product.name}` : product.name,
          }))}
        />
      ),
    },
    {
      title: t('stockIn.column.quantity'),
      dataIndex: 'quantity',
      width: 120,
      render: (_, row) => (
        <InputNumber
          className="w-full"
          min={0}
          value={row.quantity}
          onChange={(value) => updateRow(row.key, { quantity: value ?? undefined })}
        />
      ),
    },
    {
      title: t('stockIn.column.unit'),
      dataIndex: 'unit',
      width: 130,
      render: (_, row) => {
        const product = row.productId ? productsById.get(row.productId) : undefined;
        return (
          <Select
            className="w-full"
            disabled={!product}
            value={row.unit}
            onChange={(value) => updateRow(row.key, { unit: value })}
            options={(product ? getProductUnits(product) : []).map((unit) => ({
              value: unit,
              label: unit,
            }))}
          />
        );
      },
    },
    {
      title: t('stockIn.column.price'),
      dataIndex: 'costPerUnit',
      width: 160,
      render: (_, row) => (
        <InputNumber
          className="w-full"
          min={0}
          value={row.costPerUnit}
          placeholder={routing.mode === 'OPENING' ? t('stockIn.priceRequired') : t('stockIn.pricePending')}
          onChange={(value) => updateRow(row.key, { costPerUnit: value ?? undefined })}
        />
      ),
    },
    {
      title: t('stockIn.column.notes'),
      dataIndex: 'notes',
      render: (_, row) => (
        <Input
          value={row.notes}
          onChange={(event) => updateRow(row.key, { notes: event.target.value })}
        />
      ),
    },
    {
      title: '',
      dataIndex: 'actions',
      width: 56,
      render: (_, row) => (
        <Button
          type="text"
          aria-label={t('stockIn.removeRow')}
          icon={<Trash2 size={16} />}
          onClick={() => handleRemoveRow(row.key)}
        />
      ),
    },
  ];

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5" />
          {t('stockIn.title')}
        </div>
      )}
      extra={(
        <Button type="primary" loading={isSubmitting} onClick={() => void handleSubmit()}>
          {t('stockIn.save')}
        </Button>
      )}
    >
      <div className="space-y-4">
        <Alert
          type={routing.redirectedFromOpening ? 'warning' : 'info'}
          showIcon
          message={destinationLabel}
          description={blockerNotice}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Text className="mb-1 block text-xs text-gray-500">{t('stockIn.date')}</Text>
            <DatePicker
              className="w-full"
              value={documentDate}
              allowClear={false}
              format="DD MMM YYYY"
              onChange={(value) => value && setDocumentDate(value)}
            />
            {cutoffDate ? (
              <Text className="mt-1 block text-xs text-gray-400">
                {t('stockIn.cutoffHint', { date: dayjs(cutoffDate).format('DD MMM YYYY') })}
              </Text>
            ) : null}
          </div>

          <div>
            <Text className="mb-1 block text-xs text-gray-500">{t('stockIn.supplier')}</Text>
            <Select
              showSearch
              allowClear
              className="w-full"
              disabled={routing.mode === 'OPENING'}
              placeholder={routing.mode === 'OPENING' ? t('stockIn.supplierNotUsed') : t('stockIn.selectSupplier')}
              value={contactId}
              optionFilterProp="label"
              onChange={setContactId}
              options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
            />
          </div>

          <div>
            <Text className="mb-1 block text-xs text-gray-500">{t('stockIn.notes')}</Text>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>

        {rowErrors.size > 0 ? (
          <Alert
            type="error"
            showIcon
            message={t('stockIn.rowErrorsTitle', { count: rowErrors.size })}
            description={(
              <div className="text-xs">
                {Array.from(rowErrors.values()).map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            )}
          />
        ) : null}

        <Table
          rowKey="key"
          size="small"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description={t('stockIn.noLines')} /> }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}>
                <Text strong>{t('stockIn.totalLines', { count: lines.length })}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} colSpan={3}>
                {hasFinalPrice ? (
                  <Text strong>{formatCurrency(totalValue)}</Text>
                ) : (
                  <Tag color="orange">{t('stockIn.pricePending')}</Tag>
                )}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />

        <Button icon={<Plus size={16} />} onClick={handleAddRow}>
          {t('stockIn.addRow')}
        </Button>
      </div>
    </Card>
  );
}
