import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type HTMLAttributes,
} from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  CheckCircle2,
  CircleSlash,
  Download,
  PackageOpen,
  Save,
  Search,
  Upload,
} from 'lucide-react';
import { db } from '@/lib/db';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import {
  getInventoryOpeningBalancePreview,
  postInventoryOpeningBalance,
  saveInventoryOpeningBalanceDraft,
  skipInventoryOpeningBalance,
} from '@/services/openingInventoryBalanceService';
import {
  buildOpeningInventoryCsvTemplateRows,
  parseOpeningInventoryCsv,
} from '@/utils/openingBalances/inventoryCsv';
import { exportCsv } from '@/utils/export';
import { formatCurrency, formatDateOnly } from '@/utils/formatters';
import type {
  InventoryAccountingPolicy,
  OpeningBalanceBatchStatus,
  OpeningBalanceLine,
  Product,
} from '@/types';

const { Text, Title } = Typography;

type InventoryStatus = OpeningBalanceBatchStatus | 'EMPTY';

interface EditableInventoryOpeningRow {
  product_id: string;
  sku?: string;
  product_name: string;
  stock_unit: string;
  opening_quantity: number;
  cost_per_unit: number;
  notes?: string;
}

interface InventoryPreviewAccount {
  id: string;
  code: string;
  name: string;
}

interface InventoryOpeningPreview {
  productCount: number;
  totalQuantity: number;
  totalValue: number;
  inventoryAccount: InventoryPreviewAccount;
  equityAccount: InventoryPreviewAccount;
}

const statusColor: Record<InventoryStatus, string> = {
  EMPTY: 'default',
  DRAFT: 'blue',
  VALIDATED: 'cyan',
  POSTED: 'green',
  LOCKED: 'green',
  REVERSED: 'orange',
  SKIPPED: 'gold',
  VOIDED: 'red',
};

const statusKey: Record<InventoryStatus, string> = {
  EMPTY: 'openingInventory.status.empty',
  DRAFT: 'openingInventory.status.draft',
  VALIDATED: 'openingInventory.status.validated',
  POSTED: 'openingInventory.status.posted',
  LOCKED: 'openingInventory.status.locked',
  REVERSED: 'openingInventory.status.reversed',
  SKIPPED: 'openingInventory.status.skipped',
  VOIDED: 'openingInventory.status.voided',
};

const getInventoryBatchId = (cutoffDate: string) => (
  `opening-balance-inventory-${cutoffDate.slice(0, 10)}`
);

const isFinalStatus = (status: InventoryStatus) => (
  status === 'POSTED' ||
  status === 'LOCKED' ||
  status === 'REVERSED' ||
  status === 'SKIPPED' ||
  status === 'VOIDED'
);

const toEditableRow = (
  line: OpeningBalanceLine,
  productById: Map<string, Product>,
): EditableInventoryOpeningRow | null => {
  if (!line.product_id) return null;
  const product = productById.get(line.product_id);

  return {
    product_id: line.product_id,
    sku: line.product_sku ?? product?.sku,
    product_name: line.product_name ?? product?.name ?? line.product_id,
    stock_unit: line.unit ?? product?.purchase_unit ?? '',
    opening_quantity: Number(line.quantity || 0),
    cost_per_unit: Number(line.unit_cost || 0),
    notes: line.notes,
  };
};

const getErrorText = (issue: unknown) => {
  if (typeof issue === 'string') return issue;
  if (issue && typeof issue === 'object' && 'message' in issue) {
    return String((issue as { message?: unknown }).message ?? '');
  }
  return String(issue);
};

const accountLabel = (account?: { code?: string; name?: string }) => {
  if (!account) return '-';
  return [account.code, account.name].filter(Boolean).join(' - ') || '-';
};

export default function OpeningInventoryBalancePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { baseCurrencyCode, baseCurrencySymbol } = useBaseCurrency();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<EditableInventoryOpeningRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [preview, setPreview] = useState<InventoryOpeningPreview>();
  const [previewError, setPreviewError] = useState<string>();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const state = useLiveQuery(
    async () => {
      const [setup, setting, products] = await Promise.all([
        db.accountingInitialSetupSetting.get('default'),
        db.generalLedgerSetting.get('default'),
        db.products.orderBy('name').toArray(),
      ]);
      const cutoffDate = setup?.cutoff_date ?? setting?.cutoff_date;
      const batch = cutoffDate
        ? await db.openingBalanceBatches.get(getInventoryBatchId(cutoffDate))
        : undefined;
      const lines = batch
        ? await db.openingBalanceLines.where('batch_id').equals(batch.id).toArray()
        : [];

      return {
        setup,
        setting,
        products,
        cutoffDate,
        inventoryPolicy: setup?.inventory_policy ?? setting?.inventory_policy,
        batch,
        lines,
      };
    },
    [],
    {
      setup: undefined,
      setting: undefined,
      products: [] as Product[],
      cutoffDate: undefined,
      inventoryPolicy: undefined as InventoryAccountingPolicy | undefined,
      batch: undefined,
      lines: [] as OpeningBalanceLine[],
    },
  );

  const status: InventoryStatus = state.batch?.status ?? 'EMPTY';
  const isPosted = status === 'POSTED' || status === 'LOCKED';
  const isLocked = isFinalStatus(status);
  const hasCompatiblePolicy = state.inventoryPolicy === 'PERPETUAL_INVENTORY';
  const canEdit = Boolean(state.cutoffDate && hasCompatiblePolicy && !isLocked);
  const productById = useMemo(
    () => new Map(state.products.map((product) => [product.id, product])),
    [state.products],
  );
  const persistedRevision = useMemo(
    () => state.lines
      .map((line) => [
        line.id,
        line.product_id,
        line.quantity,
        line.unit_cost,
        line.notes,
        line.updated_at,
      ].join(':'))
      .sort()
      .join('|'),
    [state.lines],
  );

  useEffect(() => {
    if (isDirty && !isLocked) return;
    const persistedRows = state.lines
      .map((line) => toEditableRow(line, productById))
      .filter((row): row is EditableInventoryOpeningRow => Boolean(row));
    setRows(persistedRows);
    if (isLocked) setIsDirty(false);
  }, [isDirty, isLocked, persistedRevision, productById, state.lines]);

  useEffect(() => {
    if (!isDirty || isLocked) return undefined;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty, isLocked]);

  const activeRows = useMemo(
    () => rows.filter((row) => (
      Number.isFinite(row.opening_quantity) &&
      row.opening_quantity > 0 &&
      Number.isFinite(row.cost_per_unit) &&
      row.cost_per_unit >= 0
    )),
    [rows],
  );
  const localTotalValue = useMemo(
    () => activeRows.reduce(
      (total, row) => total + row.opening_quantity * row.cost_per_unit,
      0,
    ),
    [activeRows],
  );
  const activeRowsRevision = useMemo(
    () => activeRows
      .map((row) => [
        row.product_id,
        row.opening_quantity,
        row.cost_per_unit,
        row.notes ?? '',
      ].join(':'))
      .join('|'),
    [activeRows],
  );

  useEffect(() => {
    if (isLocked) {
      if (isPosted && state.lines.length > 0) {
        const firstLine = state.lines[0];
        setPreview({
          productCount: state.lines.length,
          totalQuantity: state.lines.reduce(
            (total, line) => total + Number(line.quantity || 0),
            0,
          ),
          totalValue: Number(state.batch?.total_debit || 0),
          inventoryAccount: {
            id: firstLine.account_id ?? '',
            code: firstLine.account_code ?? '',
            name: firstLine.account_name ?? '',
          },
          equityAccount: {
            id: firstLine.counter_account_id ?? '',
            code: firstLine.counter_account_code ?? '',
            name: firstLine.counter_account_name ?? '',
          },
        });
      } else {
        setPreview(undefined);
      }
      setPreviewError(undefined);
      setIsPreviewLoading(false);
      return;
    }

    if (activeRows.length === 0) {
      setPreview(undefined);
      setPreviewError(undefined);
      setIsPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreview(undefined);
    setPreviewError(undefined);
    setIsPreviewLoading(true);
    const timer = window.setTimeout(() => {
      void getInventoryOpeningBalancePreview({ lines: activeRows })
        .then((nextPreview: InventoryOpeningPreview) => {
          if (!cancelled) setPreview(nextPreview);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setPreview(undefined);
          setPreviewError(error instanceof Error ? error.message : t('openingInventory.previewFailed'));
        })
        .finally(() => {
          if (!cancelled) setIsPreviewLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeRows,
    activeRowsRevision,
    isLocked,
    isPosted,
    state.batch?.total_debit,
    state.lines,
    t,
  ]);

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => (
      row.product_name.toLowerCase().includes(query) ||
      (row.sku ?? '').toLowerCase().includes(query)
    ));
  }, [rows, searchText]);

  const updateRow = (
    productId: string,
    patch: Partial<EditableInventoryOpeningRow>,
  ) => {
    setRows((current) => current.map((row) => (
      row.product_id === productId ? { ...row, ...patch } : row
    )));
    setIsDirty(true);
  };

  const handleDownloadTemplate = async () => {
    if (state.products.length === 0) {
      message.info(t('openingInventory.noProducts'));
      return;
    }

    try {
      const exported = await exportCsv({
        filename: `saldo-awal-persediaan-${state.cutoffDate?.slice(0, 10) ?? 'template'}.csv`,
        rows: buildOpeningInventoryCsvTemplateRows(state.products),
      });
      if (exported) message.success(t('openingInventory.downloadSuccess'));
    } catch (error) {
      console.error('Failed to export inventory opening balance template:', error);
      message.error(t('openingInventory.downloadFailed'));
    }
  };

  const handleImportSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      message.error(t('openingInventory.csvOnly'));
      return;
    }

    try {
      const content = await file.text();
      const result = parseOpeningInventoryCsv(content, state.products);
      const errors = (result.errors ?? []).map(getErrorText).filter(Boolean);
      const skippedCount = result.skippedRowCount ?? 0;
      const importedRows: EditableInventoryOpeningRow[] = result.rows.map((row) => ({
        product_id: row.product_id,
        sku: row.sku,
        product_name: row.product_name,
        stock_unit: row.stock_unit,
        opening_quantity: row.opening_quantity,
        cost_per_unit: row.cost_per_unit,
        notes: row.notes,
      }));

      if (errors.length > 0 || importedRows.length === 0) {
        modal.error({
          title: t('openingInventory.importTitle'),
          width: 720,
          content: (
            <div className="space-y-3">
              <Text type="secondary">
                {t('openingInventory.importFile')}: {file.name}
              </Text>
              <Alert
                type="error"
                showIcon
                title={errors.length > 0
                  ? t('openingInventory.importBlocked', { count: errors.length })
                  : t('openingInventory.emptyDraft')}
                description={errors.length > 0 ? (
                  <ul className="mb-0 mt-2 pl-5">
                    {errors.slice(0, 10).map((errorText, index) => (
                      <li key={`${index}-${errorText}`}>{errorText}</li>
                    ))}
                    {errors.length > 10 && (
                      <li>{t('openingInventory.moreErrors', { count: errors.length - 10 })}</li>
                    )}
                  </ul>
                ) : undefined}
              />
            </div>
          ),
        });
        return;
      }

      modal.confirm({
        title: t('openingInventory.importTitle'),
        width: 820,
        okText: t('openingInventory.importApply'),
        cancelText: t('common.cancel'),
        okButtonProps: {
          'data-testid': 'opening-inventory-apply-import',
        },
        content: (
          <div className="space-y-3">
            <Descriptions size="small" column={{ xs: 1, sm: 3 }}>
              <Descriptions.Item label={t('openingInventory.importFile')}>
                {file.name}
              </Descriptions.Item>
              <Descriptions.Item label={t('openingInventory.validRows')}>
                {result.validRowCount ?? importedRows.length}
              </Descriptions.Item>
              <Descriptions.Item label={t('openingInventory.skippedRows')}>
                {skippedCount}
              </Descriptions.Item>
            </Descriptions>
            <Alert
              type="success"
              showIcon
              title={t('openingInventory.importReady', {
                count: importedRows.length,
                skipped: skippedCount,
              })}
            />
            {rows.length > 0 && (
              <Alert
                type="warning"
                showIcon
                title={t('openingInventory.importReplaceWarning')}
              />
            )}
            <Table<EditableInventoryOpeningRow>
              size="small"
              pagination={false}
              rowKey="product_id"
              dataSource={importedRows.slice(0, 5)}
              columns={[
                {
                  title: t('openingInventory.column.product'),
                  dataIndex: 'product_name',
                },
                {
                  title: t('openingInventory.column.quantity'),
                  dataIndex: 'opening_quantity',
                  align: 'right',
                },
                {
                  title: t('openingInventory.column.unitCost'),
                  dataIndex: 'cost_per_unit',
                  align: 'right',
                  render: (value: number) => `${baseCurrencySymbol} ${formatCurrency(value)}`,
                },
              ]}
              scroll={{ x: 560 }}
            />
          </div>
        ),
        onOk: () => {
          setRows(importedRows);
          setIsDirty(true);
          message.success(t('openingInventory.importApplied', { count: importedRows.length }));
        },
      });
    } catch (error) {
      console.error('Failed to read inventory opening balance CSV:', error);
      message.error(error instanceof Error ? error.message : t('openingInventory.readCsvFailed'));
    }
  };

  const handleSaveDraft = async () => {
    if (activeRows.length === 0) {
      message.warning(t('openingInventory.emptyDraft'));
      return;
    }

    try {
      setIsSaving(true);
      await saveInventoryOpeningBalanceDraft({ lines: activeRows });
      setIsDirty(false);
      message.success(t('openingInventory.saveSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('openingInventory.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePost = async () => {
    if (!preview || activeRows.length === 0) {
      message.warning(previewError ?? t('openingInventory.emptyDraft'));
      return;
    }

    modal.confirm({
      title: t('openingInventory.postConfirmTitle'),
      width: 680,
      okText: t('openingInventory.post'),
      cancelText: t('common.cancel'),
      okButtonProps: {
        'data-testid': 'opening-inventory-confirm-post',
      },
      content: (
        <div className="space-y-3">
          <Text>{t('openingInventory.postConfirmDescription')}</Text>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label={t('openingInventory.cutoff')}>
              {state.cutoffDate ? formatDateOnly(state.cutoffDate) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('openingInventory.summary.productCount')}>
              {preview.productCount}
            </Descriptions.Item>
            <Descriptions.Item label={t('openingInventory.summary.totalValue')}>
              {baseCurrencySymbol} {formatCurrency(preview.totalValue)}
            </Descriptions.Item>
            <Descriptions.Item label={t('openingInventory.inventoryAccount')}>
              {accountLabel(preview.inventoryAccount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('openingInventory.equityAccount')}>
              {accountLabel(preview.equityAccount)}
            </Descriptions.Item>
          </Descriptions>
          <Alert type="info" showIcon title={t('openingInventory.cashUnaffected')} />
          <Alert type="warning" showIcon title={t('openingInventory.postConfirmLock')} />
        </div>
      ),
      onOk: async () => {
        try {
          setIsPosting(true);
          await postInventoryOpeningBalance({
            lines: activeRows,
            idempotencyKey: `${getInventoryBatchId(state.cutoffDate ?? '')}:post`,
          });
          setIsDirty(false);
          message.success(t('openingInventory.postSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('openingInventory.postFailed'));
          throw error;
        } finally {
          setIsPosting(false);
        }
      },
    });
  };

  const handleSkip = () => {
    modal.confirm({
      title: t('openingInventory.skipConfirmTitle'),
      okText: t('openingInventory.skipConfirmAction'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      okButtonProps: {
        'data-testid': 'opening-inventory-confirm-skip',
      },
      content: (
        <div className="space-y-3">
          <Alert
            type="warning"
            showIcon
            title={t('openingInventory.skipConfirmDiscard')}
          />
          <Text>{t('openingInventory.skipConfirmRequirement')}</Text>
        </div>
      ),
      onOk: async () => {
        try {
          setIsSkipping(true);
          await skipInventoryOpeningBalance();
          setRows([]);
          setIsDirty(false);
          message.success(t('openingInventory.skipSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('openingInventory.skipFailed'));
          throw error;
        } finally {
          setIsSkipping(false);
        }
      },
    });
  };

  const columns: ColumnsType<EditableInventoryOpeningRow> = [
    {
      title: t('openingInventory.column.sku'),
      dataIndex: 'sku',
      key: 'sku',
      render: (value?: string) => value || '-',
      width: 150,
    },
    {
      title: t('openingInventory.column.product'),
      dataIndex: 'product_name',
      key: 'product_name',
      width: 260,
    },
    {
      title: t('openingInventory.column.unit'),
      dataIndex: 'stock_unit',
      key: 'stock_unit',
      width: 130,
    },
    {
      title: t('openingInventory.column.quantity'),
      dataIndex: 'opening_quantity',
      key: 'opening_quantity',
      align: 'right',
      width: 180,
      render: (value: number, record) => isLocked ? value : (
        <InputNumber
          className="w-full"
          min={0}
          value={value}
          data-testid={`opening-inventory-quantity-${record.product_id}`}
          onChange={(nextValue) => updateRow(record.product_id, {
            opening_quantity: Number(nextValue || 0),
          })}
        />
      ),
    },
    {
      title: t('openingInventory.column.unitCost'),
      dataIndex: 'cost_per_unit',
      key: 'cost_per_unit',
      align: 'right',
      width: 190,
      render: (value: number, record) => isLocked
        ? `${baseCurrencySymbol} ${formatCurrency(value)}`
        : (
          <InputNumber
            className="w-full"
            min={0}
            value={value}
            addonBefore={baseCurrencySymbol}
            data-testid={`opening-inventory-cost-${record.product_id}`}
            onChange={(nextValue) => updateRow(record.product_id, {
              cost_per_unit: Number(nextValue || 0),
            })}
          />
        ),
    },
    {
      title: t('openingInventory.column.value'),
      key: 'inventory_value',
      align: 'right',
      width: 190,
      render: (_value, record) => (
        `${baseCurrencySymbol} ${formatCurrency(record.opening_quantity * record.cost_per_unit)}`
      ),
    },
    {
      title: t('openingInventory.column.notes'),
      dataIndex: 'notes',
      key: 'notes',
      width: 240,
      render: (value: string | undefined, record) => isLocked ? (value || '-') : (
        <Input
          value={value}
          onChange={(event) => updateRow(record.product_id, { notes: event.target.value })}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <Space wrap>
        <Button
          icon={<ArrowLeft size={16} />}
          onClick={() => navigate({ to: '/finance/opening-balances' })}
        >
          {t('common.back')}
        </Button>
        <Tag color={statusColor[status]}>{t(statusKey[status] as never)}</Tag>
      </Space>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Title level={3} className="!mb-1 flex items-center gap-2">
              <PackageOpen size={22} />
              {t('openingBalances.modules.inventory.title')}
            </Title>
            <Text type="secondary">{t('openingBalances.modules.inventory.description')}</Text>
          </div>
          <Space wrap>
            <Button
              icon={<Download size={16} />}
              data-testid="opening-inventory-download-template"
              disabled={state.products.length === 0}
              onClick={() => void handleDownloadTemplate()}
            >
              {t('openingInventory.downloadTemplate')}
            </Button>
            {!isLocked && (
              <>
                <Button
                  icon={<Upload size={16} />}
                  data-testid="opening-inventory-import"
                  disabled={!canEdit}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('openingInventory.importCsv')}
                </Button>
                <Button
                  icon={<CircleSlash size={16} />}
                  loading={isSkipping}
                  disabled={!state.cutoffDate}
                  data-testid="opening-inventory-skip"
                  onClick={handleSkip}
                >
                  {t('openingInventory.skip')}
                </Button>
              </>
            )}
          </Space>
        </div>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        data-testid="opening-inventory-file-input"
        onChange={handleImportSelected}
      />

      {!state.cutoffDate && (
        <Alert
          type="warning"
          showIcon
          title={t('openingInventory.cutoffMissingTitle')}
          description={t('openingInventory.cutoffMissingDescription')}
        />
      )}

      {state.cutoffDate && !hasCompatiblePolicy && !isLocked && (
        <Alert
          type="error"
          showIcon
          title={t('openingInventory.policyBlockedTitle')}
          description={t('openingInventory.policyBlockedDescription')}
        />
      )}

      {status === 'SKIPPED' && (
        <Alert
          type="success"
          showIcon
          title={t('openingInventory.skipSuccess')}
        />
      )}

      {isPosted && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircle2 size={18} />}
          title={t('openingInventory.postedTitle')}
          description={state.batch?.journal_entry_id
            ? `${t('openingInventory.journalId')}: ${state.batch.journal_entry_id}`
            : undefined}
        />
      )}

      <Card>
        <Descriptions size="small" column={{ xs: 1, sm: 3 }}>
          <Descriptions.Item label={t('openingInventory.cutoff')}>
            {state.cutoffDate ? formatDateOnly(state.cutoffDate) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('openingInventory.policy')}>
            {state.inventoryPolicy === 'PERPETUAL_INVENTORY'
              ? t('generalLedger.inventoryPolicy.perpetual')
              : state.inventoryPolicy === 'CASH_FLOW_ONLY'
                ? t('generalLedger.inventoryPolicy.cashFlowOnly')
                : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('openingBalances.baseCurrency')}>
            {baseCurrencyCode}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {status !== 'SKIPPED' && (
        <div className="space-y-3">
          {!isLocked && (
            <Alert
              type="info"
              showIcon
              title={t('openingInventory.templateHint')}
              description={t('openingInventory.numberHint')}
            />
          )}
          <Alert
            type="info"
            showIcon
            title={t('openingInventory.postEffect')}
            description={t('openingInventory.cashUnaffected')}
          />
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            allowClear
            prefix={<Search size={16} />}
            value={searchText}
            placeholder={t('openingInventory.searchPlaceholder')}
            className="md:max-w-sm"
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Space wrap>
            <Tag>{t('openingInventory.summary.productCount')}: {preview?.productCount ?? activeRows.length}</Tag>
            <Tag color="blue">
              {t('openingInventory.summary.totalValue')}: {baseCurrencySymbol} {formatCurrency(preview?.totalValue ?? localTotalValue)}
            </Tag>
          </Space>
        </div>

        <Table<EditableInventoryOpeningRow>
          rowKey="product_id"
          dataSource={filteredRows}
          columns={columns}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1340 }}
          locale={{ emptyText: t('openingInventory.emptyDraft') }}
          data-testid="opening-inventory-table"
          onRow={(record) => ({
            'data-testid': `opening-inventory-row-${record.product_id}`,
          } as HTMLAttributes<HTMLElement>)}
        />

        {isDirty && !isLocked && (
          <Text className="mt-3 block" type="secondary">
            {t('openingInventory.unsavedChanges')}
          </Text>
        )}

        {!isLocked && (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              icon={<Save size={16} />}
              loading={isSaving}
              disabled={!canEdit || activeRows.length === 0}
              data-testid="opening-inventory-save-draft"
              onClick={() => void handleSaveDraft()}
            >
              {t('openingInventory.saveDraft')}
            </Button>
            <Button
              type="primary"
              icon={<CheckCircle2 size={16} />}
              loading={isPosting}
              disabled={!canEdit || isPreviewLoading || !preview || Boolean(previewError)}
              data-testid="opening-inventory-post"
              onClick={() => void handlePost()}
            >
              {t('openingInventory.post')}
            </Button>
          </div>
        )}
      </Card>

      {isPreviewLoading && (
        <Alert type="info" showIcon title={t('openingInventory.previewLoading')} />
      )}

      {previewError && (
        <Alert
          type="error"
          showIcon
          title={t('openingInventory.previewFailed')}
          description={previewError}
        />
      )}

      {preview && (
        <Card title={t('openingInventory.previewTitle')} data-testid="opening-inventory-summary">
          <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label={t('openingInventory.inventoryAccount')}>
              {accountLabel(preview.inventoryAccount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('generalLedger.debit')}>
              {baseCurrencySymbol} {formatCurrency(preview.totalValue)}
            </Descriptions.Item>
            <Descriptions.Item label={t('openingInventory.equityAccount')}>
              {accountLabel(preview.equityAccount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('generalLedger.credit')}>
              {baseCurrencySymbol} {formatCurrency(preview.totalValue)}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
}
