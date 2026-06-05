import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Space, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { ReceivablePaymentHistory } from '@/components/accounts-receivable/ReceivablePaymentHistory';
import { ReceivablePaymentModal } from '@/components/accounts-receivable/ReceivablePaymentModal';
import {
  getSalesDocumentConfig,
  getSalesDocumentTypePathSegment,
  SALES_DOCUMENT_TYPE_OPTIONS,
} from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/auth/useAuth';
import { useAccountsReceivable } from '@/hooks/useAccountsReceivable';
import { useSalesDocuments } from '@/hooks/useSalesDocuments';
import { db } from '@/lib/db';
import { getIssuedReturnSummaryForSource, loadSalesReturnSourceChain } from '@/services/salesReturnReadService';
import type {
  AccountsReceivableRow,
  IssuedSalesReturnSummary,
  SalesDocument,
  SalesDocumentItem,
  SalesDocumentStatus,
  SalesDocumentType,
  SalesInvoicePaymentStatus,
} from '@/types';
import {
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  snapshotFromDocumentInput,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { calculateReceivableBalance } from '@/utils/accountsReceivable/calculateReceivableBalance';
import { salesDocumentStatusLabelKeys, salesInvoicePaymentStatusLabelKeys } from '@/utils/salesDocuments/i18n';

const { Title, Text } = Typography;

const statusColor: Record<SalesDocumentStatus, { background: string; color: string; border: string }> = {
  DRAFT: { background: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  ISSUED: { background: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' },
  CONVERTED: { background: '#DCFCE7', color: '#166534', border: '#BBF7D0' },
  VOIDED: { background: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
};

const paymentStatusColor: Record<SalesInvoicePaymentStatus, { background: string; color: string; border: string }> = {
  UNPAID: { background: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  PARTIAL: { background: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  PAID: { background: '#DCFCE7', color: '#166534', border: '#BBF7D0' },
};

const getDocumentDiscountLabel = (document: SalesDocument) => {
  const discountType = document.discount_type ?? 'fixed';
  const discountValue = Number(document.discount_value ?? document.discount_amount ?? 0);

  if (discountType === 'percent') {
    return `${formatCurrency(discountValue)}%`;
  }

  return formatDocumentCurrencyAmount(toDocumentCurrencyAmount(discountValue, document), document);
};

interface SalesDocumentDetailProps {
  documentId: string;
}

export default function SalesDocumentDetail({ documentId }: SalesDocumentDetailProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { issueDocument, voidDocument, convertDocument, isMutating } = useSalesDocuments();
  const {
    getInvoicePayments,
    recordPayment,
    voidPayment,
    isMutating: isReceivableMutating,
  } = useAccountsReceivable();
  const [document, setDocument] = useState<SalesDocument | undefined>();
  const [items, setItems] = useState<SalesDocumentItem[]>([]);
  const [returnSummary, setReturnSummary] = useState<IssuedSalesReturnSummary | undefined>();
  const [returnSourcePolicy, setReturnSourcePolicy] = useState<{ canReturn: boolean; notice?: string }>({ canReturn: true });
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const loadDocument = useCallback(async () => {
    const [loadedDocument, loadedItems] = await Promise.all([
      db.salesDocuments.get(documentId),
      db.salesDocumentItems.where('document_id').equals(documentId).toArray(),
    ]);
    const loadedReturnSummary = loadedDocument && (loadedDocument.type === 'SALES_DELIVERY' || loadedDocument.type === 'SALES_INVOICE')
      ? await getIssuedReturnSummaryForSource(loadedDocument.type, loadedDocument.id)
      : undefined;
    const sourceChain = loadedDocument && (loadedDocument.type === 'SALES_DELIVERY' || loadedDocument.type === 'SALES_INVOICE')
      ? await loadSalesReturnSourceChain(loadedDocument.type, loadedDocument.id)
      : undefined;
    setDocument(loadedDocument);
    setItems(loadedItems);
    setReturnSummary(loadedReturnSummary);
    setReturnSourcePolicy({
      canReturn: sourceChain?.chain.can_return_from_source ?? true,
      notice: sourceChain?.chain.return_from_source_block_reason ?? sourceChain?.chain.source_chain_label,
    });
  }, [documentId]);

  useEffect(() => {
    let isCurrent = true;

    const syncDocument = async () => {
      const [loadedDocument, loadedItems] = await Promise.all([
        db.salesDocuments.get(documentId),
        db.salesDocumentItems.where('document_id').equals(documentId).toArray(),
      ]);
      const loadedReturnSummary = loadedDocument && (loadedDocument.type === 'SALES_DELIVERY' || loadedDocument.type === 'SALES_INVOICE')
        ? await getIssuedReturnSummaryForSource(loadedDocument.type, loadedDocument.id)
        : undefined;
      const sourceChain = loadedDocument && (loadedDocument.type === 'SALES_DELIVERY' || loadedDocument.type === 'SALES_INVOICE')
        ? await loadSalesReturnSourceChain(loadedDocument.type, loadedDocument.id)
        : undefined;
      if (!isCurrent) return;

      setDocument(loadedDocument);
      setItems(loadedItems);
      setReturnSummary(loadedReturnSummary);
      setReturnSourcePolicy({
        canReturn: sourceChain?.chain.can_return_from_source ?? true,
        notice: sourceChain?.chain.return_from_source_block_reason ?? sourceChain?.chain.source_chain_label,
      });
    };

    void syncDocument();

    return () => {
      isCurrent = false;
    };
  }, [documentId]);

  const config = document ? getSalesDocumentConfig(document.type) : undefined;
  const nextConvertOptions = useMemo(() => {
    if (!document || document.status !== 'ISSUED') return [];
    const allowed: Record<SalesDocumentType, SalesDocumentType[]> = {
      SALES_QUOTATION: ['SALES_ORDER', 'SALES_INVOICE'],
      SALES_ORDER: ['SALES_DELIVERY', 'SALES_INVOICE'],
      SALES_DELIVERY: ['SALES_INVOICE'],
      SALES_INVOICE: [],
    };
    return allowed[document.type];
  }, [document]);

  if (!document || !config) {
    return <div className="p-6">{t('salesDocuments.notFound')}</div>;
  }

  const invoicePayments = document.type === 'SALES_INVOICE' ? getInvoicePayments(document.id) : [];
  const activePaymentAmount = invoicePayments
    .filter((payment) => payment.status === 'ACTIVE')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const documentCurrencySnapshot = snapshotFromDocumentInput(document, undefined, document.document_date);
  const activeForeignPaymentAmount = invoicePayments
    .filter((payment) => payment.status === 'ACTIVE')
    .reduce((sum, payment) => (
      sum + Number(payment.foreign_amount ?? toDocumentCurrencyAmount(payment.amount, documentCurrencySnapshot) ?? 0)
    ), 0);
  const issuedCreditAmount = Number(returnSummary?.credit_amount || 0);
  const receivableCalculation = calculateReceivableBalance({
    invoiceTotal: Number(document.total_amount || 0),
    activePaymentAmount,
    dueDate: document.due_date,
    returnCreditAmount: issuedCreditAmount,
  });
  const balanceDue = config.behavior.hasPaymentStatus
    ? receivableCalculation.balance_due
    : Math.max(0, Number(document.total_amount || 0));
  const receivableRow: AccountsReceivableRow | undefined = document.type === 'SALES_INVOICE'
    ? {
      sales_document_id: document.id,
      document_number: document.document_number,
      contact_id: document.contact_id,
      customer_name: document.customer_name,
      document_date: document.document_date,
      due_date: document.due_date,
      currency_code: documentCurrencySnapshot.currency_code,
      currency_name: documentCurrencySnapshot.currency_name,
      currency_symbol: documentCurrencySnapshot.currency_symbol,
      base_currency_code: documentCurrencySnapshot.base_currency_code,
      exchange_rate: documentCurrencySnapshot.exchange_rate,
      exchange_rate_source: documentCurrencySnapshot.exchange_rate_source,
      exchange_rate_basis: documentCurrencySnapshot.exchange_rate_basis,
      exchange_rate_date: documentCurrencySnapshot.exchange_rate_date,
      total_amount: Number(document.total_amount || 0),
      foreign_total_amount: document.foreign_total_amount ?? toDocumentCurrencyAmount(document.total_amount, documentCurrencySnapshot),
      paid_amount: receivableCalculation.paid_amount,
      foreign_paid_amount: activeForeignPaymentAmount,
      return_credit_amount: receivableCalculation.return_credit_amount,
      foreign_return_credit_amount: toDocumentCurrencyAmount(receivableCalculation.return_credit_amount, documentCurrencySnapshot),
      balance_due: receivableCalculation.balance_due,
      foreign_balance_due: toDocumentCurrencyAmount(receivableCalculation.balance_due, documentCurrencySnapshot),
      payment_status: receivableCalculation.payment_status,
      aging_bucket: receivableCalculation.aging_bucket,
      overdue_days: receivableCalculation.overdue_days,
    }
    : undefined;
  const canEdit = document.status === 'DRAFT';
  const hasActiveInvoicePayments = invoicePayments.some((payment) => payment.status === 'ACTIVE');
  const canVoid = (document.status === 'DRAFT' || document.status === 'ISSUED') &&
    !(document.type === 'SALES_INVOICE' && (document.finance_transaction_id || hasActiveInvoicePayments));
  const canRecordPayment = Boolean(receivableRow && config.behavior.hasPaymentStatus && document.status === 'ISSUED' && receivableRow.balance_due > 0);
  const canCreateReturn = can('SALES_RETURN_MANAGE') &&
    document.status === 'ISSUED' &&
    (document.type === 'SALES_DELIVERY' || document.type === 'SALES_INVOICE') &&
    returnSourcePolicy.canReturn;
  const statusStyle = statusColor[document.status];
  const effectivePaymentStatus = config.behavior.hasPaymentStatus ? receivableCalculation.payment_status : document.payment_status;
  const paymentStyle = effectivePaymentStatus ? paymentStatusColor[effectivePaymentStatus] : undefined;
  const statusBadge = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.05em]"
      style={statusStyle}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusStyle.color }} />
      {t(salesDocumentStatusLabelKeys[document.status])}
    </span>
  );
  const paymentStatusBadge = effectivePaymentStatus && paymentStyle ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.05em]"
      style={paymentStyle}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: paymentStyle.color }} />
      {t(salesInvoicePaymentStatusLabelKeys[effectivePaymentStatus])}
    </span>
  ) : '-';
  const isForeignCurrency = !isBaseCurrency(documentCurrencySnapshot.currency_code);
  const renderMoney = (amount?: number, foreignAmount?: number, className = 'font-bold') => (
    <span className={className}>
      {formatDocumentCurrencyAmount(
        foreignAmount ?? toDocumentCurrencyAmount(amount, documentCurrencySnapshot),
        documentCurrencySnapshot,
      )}
      {isForeignCurrency && (
        <span className="block text-[11px] font-normal text-gray-500">
          Rp {formatCurrency(amount || 0)}
        </span>
      )}
    </span>
  );

  const handleVoid = () => {
    let voidReason = '';

    Modal.confirm({
      title: t('salesDocuments.voidConfirmTitle'),
      content: (
        <div className="space-y-3">
          <Text type="secondary">
            {t('salesDocuments.voidConfirmContent')}
          </Text>
          <Input.TextArea
            rows={3}
            placeholder={t('salesDocuments.voidReasonPlaceholder')}
            onChange={(event) => {
              voidReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('salesDocuments.void'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const normalizedReason = voidReason.trim();
        if (!normalizedReason) {
          throw new Error(t('salesDocuments.voidReasonRequired'));
        }

        await voidDocument({ id: document.id, reason: normalizedReason });
        await loadDocument();
      },
    });
  };

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div className="mx-auto mb-4 flex max-w-[900px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ margin: 0 }}>{document.document_number}</Title>
          <Text type="secondary">{t(config.titleKey)}</Text>
        </div>
        <Space wrap>
          {canEdit && (
            <Button
              onClick={() => navigate({
                to: '/sales/$documentType/$documentId/edit',
                params: { documentType: getSalesDocumentTypePathSegment(document.type), documentId: document.id },
              })}
            >
              {t('salesDocuments.editDraft')}
            </Button>
          )}
          {document.status === 'DRAFT' && (
            <Button type="primary" loading={isMutating} onClick={async () => {
              await issueDocument(document.id);
              await loadDocument();
            }}>
              {t('salesDocuments.issue')}
            </Button>
          )}
          {nextConvertOptions.map((targetType) => (
            <Button
              key={targetType}
              loading={isMutating}
              onClick={async () => {
                const result = await convertDocument({ sourceId: document.id, targetType });
                navigate({
                  to: '/sales/$documentType/$documentId',
                  params: {
                    documentType: getSalesDocumentTypePathSegment(result.document.type),
                    documentId: result.document.id,
                  },
                });
              }}
            >
              {t('salesDocuments.convertTo', {
                type: t(SALES_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === targetType)?.labelKey ?? 'salesDocuments.table.type'),
              })}
            </Button>
          ))}
          {canCreateReturn && (
            <Button
              icon={<RotateCcw size={16} />}
              onClick={() => navigate({
                to: '/sales/returns/new',
                search: { sourceType: document.type, sourceId: document.id },
              })}
            >
              {t('salesReturns.createFromSource')}
            </Button>
          )}
          {canVoid && (
            <Button
              danger
              icon={<AlertTriangle size={16} />}
              className="md:ml-3"
              onClick={handleVoid}
            >
              {t('salesDocuments.void')}
            </Button>
          )}
        </Space>
      </div>

      <div
        className="mx-auto max-w-[900px] overflow-hidden rounded-2xl bg-white px-5 py-7 shadow-[0_8px_40px_rgba(0,0,0,.12),0_2px_8px_rgba(0,0,0,.06)] sm:px-8 md:px-12 md:py-11"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div
              className="flex h-[62px] w-[62px] items-center justify-center rounded-full text-2xl font-extrabold text-white shadow-md"
              style={{ backgroundColor: config.theme.accent, boxShadow: `0 4px 12px ${config.theme.accentShadow}` }}
            >
              {config.numberPrefix}
            </div>
            <div className="mt-3">
              <div className="text-[15px] font-bold" style={{ color: config.theme.accent }}>
                {t(config.titleKey)}
              </div>
              <div className="mt-1 text-xs leading-6 text-gray-500">
                {document.source_document_number ? `${document.source_document_number}` : document.document_number}
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-[32px] font-extrabold uppercase leading-none tracking-[.04em]" style={{ color: config.theme.accent }}>
              {t(config.titleKey).replace(/^Sales\s+/i, '')}
            </div>
            <div className="mt-2 text-sm font-medium text-gray-700">
              <span className="text-gray-400">#</span>
              {' '}
              {document.document_number}
            </div>
            {config.behavior.hasPricing ? (
              <div className="mt-5">
                <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">
                  {config.behavior.hasPaymentStatus ? 'Balance Due' : t('salesDocuments.field.total')}
                </div>
                <div className="mt-1 text-2xl font-extrabold text-gray-950">
                  {renderMoney(
                    config.behavior.hasPaymentStatus ? balanceDue : document.total_amount || 0,
                    config.behavior.hasPaymentStatus ? receivableRow?.foreign_balance_due : document.foreign_total_amount,
                    'text-2xl font-extrabold text-gray-950',
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5">{statusBadge}</div>
            )}
          </div>
        </div>

        <div className="my-6 h-px bg-gray-200" />

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-gray-400">Bill To</div>
            <div className="mt-2 text-sm font-bold" style={{ color: config.theme.accent }}>
              {document.customer_company_name || document.customer_name}
            </div>
            <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-6 text-gray-500">
              {document.customer_name}
              {document.customer_address ? (
                <>
                  <br />
                  {document.customer_address}
                </>
              ) : null}
              {document.customer_phone ? (
                <>
                  <br />
                  {document.customer_phone}
                </>
              ) : null}
              {document.customer_email ? (
                <>
                  <br />
                  {document.customer_email}
                </>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 md:text-right">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-gray-400">
                {t('salesDocuments.table.date')}
              </div>
              <div className="mt-1 text-[13px] font-medium text-gray-700">{formatDate(document.document_date)}</div>
            </div>
            {(document.due_date || document.expired_at) && (
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-gray-400">
                  {document.due_date ? t('salesDocuments.field.dueDate') : t('salesDocuments.field.validUntil')}
                </div>
                <div className="mt-1 text-[13px] font-medium text-gray-700">
                  {formatDate(document.due_date || document.expired_at || document.document_date)}
                </div>
              </div>
            )}
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-gray-400">
                {t('salesDocuments.table.status')}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 md:justify-end">
                {statusBadge}
                {config.behavior.hasPaymentStatus && paymentStatusBadge}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {config.behavior.allowProjectPicker && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">{t('salesDocuments.field.project')}</div>
              <div className="mt-1 text-[13px] font-medium text-gray-700">{document.project_name || '-'}</div>
            </div>
          )}
          {config.behavior.allowDepartmentPicker && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">{t('salesDocuments.field.department')}</div>
              <div className="mt-1 text-[13px] font-medium text-gray-700">{document.department_name || '-'}</div>
            </div>
          )}
          {(document.warehouse_name || config.type === 'SALES_DELIVERY' || config.type === 'SALES_ORDER') && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">{t('salesDocuments.field.warehouse')}</div>
              <div className="mt-1 text-[13px] font-medium text-gray-700">{document.warehouse_name || '-'}</div>
            </div>
          )}
          {config.behavior.hasTax && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">{t('salesDocuments.field.tax')}</div>
              <div className="mt-1 text-[13px] font-medium text-gray-700">
                {document.tax_name ? `${document.tax_name} (${document.tax_rate}%)` : '-'}
              </div>
            </div>
          )}
        </div>

        {canRecordPayment && (
          <div className="mt-6 rounded-lg border border-gray-100 px-4 py-3" style={{ backgroundColor: config.theme.accentSubtle }}>
            <Space wrap className="w-full justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase text-gray-500">
                  {t('accountsReceivable.balanceDue')}
                </div>
                <div className="text-lg font-bold text-rose-700">
                  {renderMoney(receivableRow?.balance_due || 0, receivableRow?.foreign_balance_due, 'text-lg font-bold text-rose-700')}
                </div>
              </div>
              <Button
                type="primary"
                loading={isReceivableMutating}
                disabled={document.status === 'VOIDED'}
                style={{ backgroundColor: config.theme.accent, borderColor: config.theme.accent }}
                onClick={() => setIsPaymentModalOpen(true)}
              >
                {t('accountsReceivable.recordPayment')}
              </Button>
            </Space>
          </div>
        )}

        {returnSourcePolicy.notice && (
          <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] text-blue-900">
            {returnSourcePolicy.notice}
          </div>
        )}

        {config.behavior.hasPaymentStatus && (
          <div className="mt-6 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
            <div className="grid gap-2 text-[13px] text-rose-950 md:grid-cols-6">
              <div>
                <div className="text-[11px] font-semibold uppercase text-rose-400">{t('salesDocuments.field.grossInvoice')}</div>
                <div>{renderMoney(document.total_amount || 0, document.foreign_total_amount)}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase text-rose-400">{t('salesDocuments.field.paidAmount')}</div>
                <div>{renderMoney(receivableCalculation.paid_amount, activeForeignPaymentAmount)}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase text-rose-400">{t('salesReturns.summary.totalReturn')}</div>
                <div>{renderMoney(returnSummary?.total_amount || 0)}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase text-rose-400">{t('salesReturns.field.creditAmount')}</div>
                <div>{renderMoney(returnSummary?.credit_amount || 0)}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase text-rose-400">{t('salesReturns.field.refundAmount')}</div>
                <div>{renderMoney(returnSummary?.refund_amount || 0)}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase text-rose-400">{t('salesDocuments.field.netBalanceDue')}</div>
                <div>{renderMoney(balanceDue, receivableRow?.foreign_balance_due)}</div>
              </div>
            </div>
          </div>
        )}

        {config.behavior.hasPaymentStatus && (
          <div className="mt-6 rounded-lg border border-gray-100 px-4 py-3">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold text-gray-900">{t('accountsReceivable.paymentHistory')}</div>
                <div className="text-xs text-gray-500">{t('accountsReceivable.paymentHistorySubtitle')}</div>
              </div>
            </div>
            <ReceivablePaymentHistory
              payments={invoicePayments}
              loading={isReceivableMutating}
              onVoidPayment={async (paymentId, reason) => {
                await voidPayment({ paymentId, reason });
                await loadDocument();
              }}
            />
          </div>
        )}

        <div className="mt-7 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr style={{ backgroundColor: config.theme.accent }}>
                <th className="w-10 rounded-l-md px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[.06em] text-white">#</th>
                <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[.06em] text-white">
                  {t('salesDocuments.field.product')}
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white">
                  {t('salesDocuments.field.quantity')}
                </th>
                {config.type === 'SALES_DELIVERY' && (
                  <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white">
                    {t('salesDocuments.field.deliveredQuantity')}
                  </th>
                )}
                {config.behavior.hasPricing && (
                  <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white">
                    {t('salesDocuments.field.price')}
                  </th>
                )}
                <th className={`${config.behavior.hasPricing ? '' : 'rounded-r-md'} px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white`}>
                  {t('salesDocuments.field.unit')}
                </th>
                {config.behavior.hasPricing && (
                  <th className="rounded-r-md px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white">
                    {t('salesDocuments.field.subtotal')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-3 py-3 text-center align-top text-xs font-semibold text-gray-400">{index + 1}</td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-semibold text-gray-950">{item.product_name}</div>
                    <div className="mt-1 text-[11.5px] leading-5 text-gray-400">
                      {item.sku ? `${item.sku} · ` : ''}
                      {item.quantity} {item.unit}
                      {item.delivered_quantity !== undefined ? ` · ${t('salesDocuments.field.deliveredQuantity')}: ${item.delivered_quantity}` : ''}
                      {config.behavior.hasPricing ? ` · ${t('salesDocuments.field.discount')}: ${formatDocumentCurrencyAmount(toDocumentCurrencyAmount(item.discount_amount, documentCurrencySnapshot), documentCurrencySnapshot)}` : ''}
                      {config.behavior.hasTax ? ` · ${t('salesDocuments.field.tax')}: ${formatDocumentCurrencyAmount(toDocumentCurrencyAmount(item.tax_amount, documentCurrencySnapshot), documentCurrencySnapshot)}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right align-top text-gray-700">{item.quantity}</td>
                  {config.type === 'SALES_DELIVERY' && (
                    <td className="px-3 py-3 text-right align-top text-gray-700">{item.delivered_quantity ?? '-'}</td>
                  )}
                  {config.behavior.hasPricing && (
                    <td className="px-3 py-3 text-right align-top text-gray-700">
                      {renderMoney(item.price || 0, item.foreign_price, 'font-medium')}
                    </td>
                  )}
                  <td className="px-3 py-3 text-right align-top text-gray-700">{item.unit}</td>
                  {config.behavior.hasPricing && (
                    <td className="px-3 py-3 text-right align-top font-semibold text-gray-950">
                      {renderMoney(item.subtotal || 0, item.foreign_subtotal, 'font-semibold text-gray-950')}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {config.behavior.hasPricing && (
          <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-end">
            <div className="w-full max-w-[280px]">
              <div className="flex justify-between py-1.5 text-[13px]">
                <span className="text-gray-500">{t('salesDocuments.field.subtotal')}</span>
                {renderMoney(document.subtotal_amount || 0, document.foreign_subtotal_amount, 'font-medium text-gray-700')}
              </div>
              <div className="flex justify-between py-1.5 text-[13px]">
                <span className="text-gray-500">{t('salesDocuments.field.documentDiscount')}</span>
                <span className="font-medium text-gray-400">
                  {getDocumentDiscountLabel(document)} · {formatDocumentCurrencyAmount(toDocumentCurrencyAmount(document.discount_amount, documentCurrencySnapshot), documentCurrencySnapshot)}
                </span>
              </div>
              {document.discount_account_code && document.discount_account_name && (
                <div className="flex justify-between gap-4 py-1.5 text-[13px]">
                  <span className="text-gray-500">{t('salesDocuments.field.discountAccount')}</span>
                  <span className="text-right font-medium text-gray-400">
                    {document.discount_account_code} - {document.discount_account_name}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1.5 text-[13px]">
                <span className="text-gray-500">{t('salesDocuments.field.discountAmount')}</span>
                {renderMoney(document.discount_amount || 0, document.foreign_discount_amount, 'font-medium text-gray-400')}
              </div>
              {config.behavior.hasTax && (
                <div className="flex justify-between py-1.5 text-[13px]">
                  <span className="text-gray-500">{t('salesDocuments.field.tax')}</span>
                  {renderMoney(document.tax_amount || 0, document.foreign_tax_amount, 'font-medium text-gray-400')}
                </div>
              )}
              {config.behavior.hasPaymentStatus && (
                <div className="flex justify-between py-1.5 text-[13px]">
                  <span className="text-gray-500">{t('salesDocuments.field.paidAmount')}</span>
                  {renderMoney(receivableCalculation.paid_amount, activeForeignPaymentAmount, 'font-medium text-green-700')}
                </div>
              )}
              {config.behavior.hasPaymentStatus && issuedCreditAmount > 0 && (
                <div className="flex justify-between py-1.5 text-[13px]">
                  <span className="text-gray-500">{t('salesReturns.field.creditAmount')}</span>
                  {renderMoney(issuedCreditAmount, undefined, 'font-medium text-rose-700')}
                </div>
              )}
              <div className="my-2 h-px bg-gray-200" />
              <div className="flex justify-between rounded-lg px-3.5 py-3" style={{ backgroundColor: config.theme.accent }}>
                <span className="text-sm font-bold text-white/85">{t('salesDocuments.field.total')}</span>
                {renderMoney(document.total_amount || 0, document.foreign_total_amount, 'text-[17px] font-extrabold text-white')}
              </div>
            </div>
          </div>
        )}

        <div className="mt-9 flex flex-col gap-6 border-t border-gray-100 pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[.07em] text-gray-400">{t('salesDocuments.field.notes')}</div>
            <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-6 text-gray-500">{document.notes || '-'}</div>
          </div>
          <div className="text-left sm:text-right">
            {document.status === 'VOIDED' && (
              <div className="mb-3 text-[12.5px] leading-6 text-red-600">
                {document.voided_at ? formatDate(document.voided_at) : '-'}
                <br />
                {document.void_reason || '-'}
              </div>
            )}
            <div
              className="inline-block rotate-[-6deg] rounded-lg border-[3px] px-4 py-1 text-[22px] font-extrabold uppercase tracking-[.08em]"
              style={{ borderColor: statusStyle.border, color: statusStyle.color }}
            >
              {t(salesDocumentStatusLabelKeys[document.status])}
            </div>
          </div>
        </div>
      </div>

      <ReceivablePaymentModal
        open={isPaymentModalOpen}
        row={receivableRow}
        loading={isReceivableMutating}
        onCancel={() => setIsPaymentModalOpen(false)}
        onSubmit={async (input) => {
          if (!receivableRow) return;
          await recordPayment({ invoiceId: receivableRow.sales_document_id, input });
          setIsPaymentModalOpen(false);
          await loadDocument();
        }}
      />
    </div>
  );
}
