import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Space, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, FileCheck2 } from 'lucide-react';
import { PayablePaymentHistory } from '@/components/accounts-payable/PayablePaymentHistory';
import {
  getPurchaseDocumentConfig,
  getPurchaseDocumentTypePathSegment,
  PURCHASE_DOCUMENT_TYPE_OPTIONS,
} from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import { useAccountsPayable } from '@/hooks/useAccountsPayable';
import { usePurchaseDocuments } from '@/hooks/usePurchaseDocuments';
import { db } from '@/lib/db';
import type {
  PurchaseDocument,
  PurchaseDocumentItem,
  PurchaseDocumentStatus,
  PurchaseDocumentType,
  PurchaseCostStatus,
  PurchaseInvoicePaymentStatus,
} from '@/types';
import {
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  snapshotFromDocumentInput,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { purchaseDocumentStatusLabelKeys, purchaseInvoicePaymentStatusLabelKeys } from '@/utils/purchaseDocuments/i18n';

const { Title, Text } = Typography;

const statusColor: Record<PurchaseDocumentStatus, { background: string; color: string; border: string }> = {
  DRAFT: { background: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  ISSUED: { background: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' },
  CONVERTED: { background: '#DCFCE7', color: '#166534', border: '#BBF7D0' },
  VOIDED: { background: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
};

const paymentStatusColor: Record<PurchaseInvoicePaymentStatus, { background: string; color: string; border: string }> = {
  UNPAID: { background: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  PARTIAL: { background: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  PAID: { background: '#DCFCE7', color: '#166534', border: '#BBF7D0' },
};

const costStatusColor: Record<PurchaseCostStatus, { background: string; color: string; border: string }> = {
  FINAL: { background: '#DCFCE7', color: '#166534', border: '#BBF7D0' },
  ESTIMATED: { background: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  PENDING: { background: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
};

const costStatusLabel: Record<PurchaseCostStatus, string> = {
  FINAL: 'Harga Final',
  ESTIMATED: 'Harga Sementara',
  PENDING: 'Belum Ada Harga',
};

const getDocumentDiscountLabel = (document: PurchaseDocument) => {
  const discountType = document.discount_type ?? 'fixed';
  const discountValue = Number(document.discount_value ?? document.discount_amount ?? 0);

  if (discountType === 'percent') {
    return `${formatCurrency(discountValue)}%`;
  }

  return formatDocumentCurrencyAmount(toDocumentCurrencyAmount(discountValue, document), document);
};

interface PurchaseDocumentDetailProps {
  documentId: string;
}

export default function PurchaseDocumentDetail({ documentId }: PurchaseDocumentDetailProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { issueDocument, voidDocument, convertDocument, isMutating } = usePurchaseDocuments();
  const {
    getInvoicePayments,
    voidPayment,
    isMutating: isPayableMutating,
  } = useAccountsPayable();
  const [document, setDocument] = useState<PurchaseDocument | undefined>();
  const [items, setItems] = useState<PurchaseDocumentItem[]>([]);

  const loadDocument = useCallback(async () => {
    const [loadedDocument, loadedItems] = await Promise.all([
      db.purchaseDocuments.get(documentId),
      db.purchaseDocumentItems.where('document_id').equals(documentId).toArray(),
    ]);
    setDocument(loadedDocument);
    setItems(loadedItems);
  }, [documentId]);

  useEffect(() => {
    let isCurrent = true;

    const syncDocument = async () => {
      const [loadedDocument, loadedItems] = await Promise.all([
        db.purchaseDocuments.get(documentId),
        db.purchaseDocumentItems.where('document_id').equals(documentId).toArray(),
      ]);
      if (!isCurrent) return;

      setDocument(loadedDocument);
      setItems(loadedItems);
    };

    void syncDocument();

    return () => {
      isCurrent = false;
    };
  }, [documentId]);

  const config = document ? getPurchaseDocumentConfig(document.type) : undefined;
  const invoicePayments = document?.type === 'PURCHASE_INVOICE' ? getInvoicePayments(document.id) : [];
  const nextConvertOptions = useMemo(() => {
    if (!document || document.status !== 'ISSUED') return [];
    const allowed: Record<PurchaseDocumentType, PurchaseDocumentType[]> = {
      PURCHASE_REQUEST: ['REQUEST_FOR_QUOTATION', 'PURCHASE_ORDER'],
      REQUEST_FOR_QUOTATION: ['PURCHASE_ORDER'],
      PURCHASE_ORDER: ['PURCHASE_RECEIPT'],
      PURCHASE_RECEIPT: ['PURCHASE_INVOICE', 'PURCHASE_RETURN'],
      PURCHASE_INVOICE: ['PURCHASE_RETURN'],
      PURCHASE_RETURN: [],
    };
    return allowed[document.type];
  }, [document]);

  if (!document || !config) {
    return <div className="p-6">{t('purchaseDocuments.notFound')}</div>;
  }

  const canEdit = document.status === 'DRAFT';
  const canVoid = (document.status === 'DRAFT' || document.status === 'ISSUED') &&
    !(document.type === 'PURCHASE_INVOICE' && (document.finance_transaction_id || Number(document.paid_amount || 0) > 0));
  const canReconcileCost = document.type === 'PURCHASE_RECEIPT' &&
    document.status === 'ISSUED' &&
    (document.cost_status ?? 'FINAL') !== 'FINAL';
  const statusStyle = statusColor[document.status];
  const costStatus = document.cost_status ?? 'FINAL';
  const costStyle = costStatusColor[costStatus];
  const paymentStyle = document.payment_status ? paymentStatusColor[document.payment_status] : undefined;
  const statusBadge = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.05em]"
      style={statusStyle}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusStyle.color }} />
      {t(purchaseDocumentStatusLabelKeys[document.status])}
    </span>
  );
  const paymentStatusBadge = document.payment_status && paymentStyle ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.05em]"
      style={paymentStyle}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: paymentStyle.color }} />
      {t(purchaseInvoicePaymentStatusLabelKeys[document.payment_status])}
    </span>
  ) : '-';
  const costStatusBadge = document.type === 'PURCHASE_RECEIPT' ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.05em]"
      style={costStyle}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: costStyle.color }} />
      {costStatusLabel[costStatus]}
    </span>
  ) : null;
  const documentCurrencySnapshot = snapshotFromDocumentInput(document, undefined, document.document_date);
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
      title: t('purchaseDocuments.voidConfirmTitle'),
      content: (
        <div className="space-y-3">
          <Text type="secondary">
            {t('purchaseDocuments.voidConfirmContent')}
          </Text>
          <Input.TextArea
            rows={3}
            placeholder={t('purchaseDocuments.voidReasonPlaceholder')}
            onChange={(event) => {
              voidReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('purchaseDocuments.void'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const normalizedReason = voidReason.trim();
        if (!normalizedReason) {
          throw new Error(t('purchaseDocuments.voidReasonRequired'));
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
                to: '/purchases/$documentType/$documentId/edit',
                params: { documentType: getPurchaseDocumentTypePathSegment(document.type), documentId: document.id },
              })}
            >
              {t('purchaseDocuments.editDraft')}
            </Button>
          )}
          {document.status === 'DRAFT' && (
            <Button type="primary" loading={isMutating} onClick={async () => {
              await issueDocument(document.id);
              await loadDocument();
            }}>
              {t('purchaseDocuments.issue')}
            </Button>
          )}
          {canReconcileCost && (
            <Button
              icon={<FileCheck2 size={16} />}
              onClick={() => navigate({
                to: '/purchases/$documentType/$documentId/reconcile',
                params: { documentType: getPurchaseDocumentTypePathSegment(document.type), documentId: document.id },
              })}
            >
              Rekonsiliasi HPP
            </Button>
          )}
          {nextConvertOptions.map((targetType) => (
            <Button
              key={targetType}
              loading={isMutating}
              onClick={async () => {
                const result = await convertDocument({ sourceId: document.id, targetType });
                navigate({
                  to: '/purchases/$documentType/$documentId',
                  params: {
                    documentType: getPurchaseDocumentTypePathSegment(result.document.type),
                    documentId: result.document.id,
                  },
                });
              }}
            >
              {t('purchaseDocuments.convertTo', {
                type: t(PURCHASE_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === targetType)?.labelKey ?? 'purchaseDocuments.table.type'),
              })}
            </Button>
          ))}
          {canVoid && (
            <Button danger icon={<AlertTriangle size={16} />} onClick={handleVoid}>
              {t('purchaseDocuments.void')}
            </Button>
          )}
        </Space>
      </div>

      <div className="mx-auto max-w-[900px] overflow-hidden rounded-2xl bg-white px-5 py-7 shadow-[0_8px_40px_rgba(0,0,0,.12),0_2px_8px_rgba(0,0,0,.06)] sm:px-8 md:px-12 md:py-11">
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
                {document.source_document_number || document.document_number}
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-[32px] font-extrabold uppercase leading-none tracking-[.04em]" style={{ color: config.theme.accent }}>
              {config.numberPrefix}
            </div>
            <div className="mt-2 text-sm font-medium text-gray-700">
              <span className="text-gray-400">#</span> {document.document_number}
            </div>
            {config.behavior.hasPricing ? (
              <div className="mt-5">
                <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">
                  {t('purchaseDocuments.field.total')}
                </div>
                <div className="mt-1 text-2xl font-extrabold text-gray-950">
                  {renderMoney(document.total_amount || 0, document.foreign_total_amount, 'text-2xl font-extrabold text-gray-950')}
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
            <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-gray-400">{t('purchaseDocuments.field.supplier')}</div>
            <div className="mt-2 text-sm font-bold" style={{ color: config.theme.accent }}>
              {document.supplier_company_name || document.supplier_name || '-'}
            </div>
            <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-6 text-gray-500">
              {document.supplier_name || '-'}
              {document.supplier_address ? (
                <>
                  <br />
                  {document.supplier_address}
                </>
              ) : null}
              {document.supplier_phone ? (
                <>
                  <br />
                  {document.supplier_phone}
                </>
              ) : null}
              {document.supplier_email ? (
                <>
                  <br />
                  {document.supplier_email}
                </>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 md:text-right">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-gray-400">
                {t('purchaseDocuments.table.date')}
              </div>
              <div className="mt-1 text-[13px] font-medium text-gray-700">{formatDate(document.document_date)}</div>
            </div>
            {(document.required_date || document.quotation_due_date || document.due_date) && (
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-gray-400">
                  {document.required_date
                    ? t('purchaseDocuments.field.requiredDate')
                    : document.quotation_due_date
                      ? t('purchaseDocuments.field.quotationDueDate')
                      : t('purchaseDocuments.field.dueDate')}
                </div>
                <div className="mt-1 text-[13px] font-medium text-gray-700">
                  {formatDate(document.required_date || document.quotation_due_date || document.due_date || document.document_date)}
                </div>
              </div>
            )}
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-gray-400">
                {t('purchaseDocuments.table.status')}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 md:justify-end">
                {statusBadge}
                {config.behavior.hasPaymentStatus && paymentStatusBadge}
                {costStatusBadge}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">{t('purchaseDocuments.field.project')}</div>
            <div className="mt-1 text-[13px] font-medium text-gray-700">{document.project_name || '-'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">{t('purchaseDocuments.field.department')}</div>
            <div className="mt-1 text-[13px] font-medium text-gray-700">{document.department_name || '-'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">{t('purchaseDocuments.field.warehouse')}</div>
            <div className="mt-1 text-[13px] font-medium text-gray-700">{document.warehouse_name || '-'}</div>
          </div>
          {config.behavior.hasTax && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">{t('purchaseDocuments.field.tax')}</div>
              <div className="mt-1 text-[13px] font-medium text-gray-700">
                {document.tax_name ? `${document.tax_name} (${document.tax_rate}%)` : '-'}
              </div>
            </div>
          )}
          {document.type === 'PURCHASE_RECEIPT' && (
            <>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">Nomor Surat Jalan</div>
                <div className="mt-1 text-[13px] font-medium text-gray-700">{document.delivery_note_number || '-'}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">Tanggal Surat Jalan</div>
                <div className="mt-1 text-[13px] font-medium text-gray-700">
                  {document.delivery_note_date ? formatDate(document.delivery_note_date) : '-'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[.07em] text-gray-400">Invoice Supplier</div>
                <div className="mt-1 text-[13px] font-medium text-gray-700">{document.supplier_invoice_number || '-'}</div>
              </div>
            </>
          )}
        </div>

        <div className="mt-7 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr style={{ backgroundColor: config.theme.accent }}>
                <th className="w-10 rounded-l-md px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[.06em] text-white">#</th>
                <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[.06em] text-white">
                  {t('purchaseDocuments.field.product')}
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white">
                  {t('purchaseDocuments.field.quantity')}
                </th>
                {config.type === 'PURCHASE_RECEIPT' && (
                  <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white">
                    {t('purchaseDocuments.field.receivedQuantity')}
                  </th>
                )}
                {config.behavior.hasPricing && (
                  <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white">
                    {t('purchaseDocuments.field.price')}
                  </th>
                )}
                <th className={`${config.behavior.hasPricing ? '' : 'rounded-r-md'} px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white`}>
                  {t('purchaseDocuments.field.unit')}
                </th>
                {config.behavior.hasPricing && (
                  <th className="rounded-r-md px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[.06em] text-white">
                    {t('purchaseDocuments.field.subtotal')}
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
                      {item.received_quantity !== undefined ? ` · ${t('purchaseDocuments.field.receivedQuantity')}: ${item.received_quantity}` : ''}
                      {config.type === 'PURCHASE_RECEIPT' ? ` · ${costStatusLabel[item.cost_status ?? document.cost_status ?? 'FINAL']}` : ''}
                      {config.behavior.hasPricing ? ` · ${t('purchaseDocuments.field.discount')}: ${formatDocumentCurrencyAmount(toDocumentCurrencyAmount(item.discount_amount, documentCurrencySnapshot), documentCurrencySnapshot)}` : ''}
                      {config.behavior.hasTax ? ` · ${t('purchaseDocuments.field.tax')}: ${formatDocumentCurrencyAmount(toDocumentCurrencyAmount(item.tax_amount, documentCurrencySnapshot), documentCurrencySnapshot)}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right align-top text-gray-700">{item.quantity}</td>
                  {config.type === 'PURCHASE_RECEIPT' && (
                    <td className="px-3 py-3 text-right align-top text-gray-700">{item.received_quantity ?? '-'}</td>
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
                <span className="text-gray-500">{t('purchaseDocuments.field.subtotal')}</span>
                {renderMoney(document.subtotal_amount || 0, document.foreign_subtotal_amount, 'font-medium text-gray-700')}
              </div>
              <div className="flex justify-between py-1.5 text-[13px]">
                <span className="text-gray-500">{t('purchaseDocuments.field.documentDiscount')}</span>
                <span className="font-medium text-gray-400">{getDocumentDiscountLabel(document)}</span>
              </div>
              {document.discount_account_code && document.discount_account_name && (
                <div className="flex justify-between gap-4 py-1.5 text-[13px]">
                  <span className="text-gray-500">{t('purchaseDocuments.field.discountAccount')}</span>
                  <span className="text-right font-medium text-gray-400">
                    {document.discount_account_code} - {document.discount_account_name}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1.5 text-[13px]">
                <span className="text-gray-500">{t('purchaseDocuments.field.discountAmount')}</span>
                {renderMoney(document.discount_amount || 0, document.foreign_discount_amount, 'font-medium text-gray-400')}
              </div>
              {config.behavior.hasTax && (
                <div className="flex justify-between py-1.5 text-[13px]">
                  <span className="text-gray-500">{t('purchaseDocuments.field.tax')}</span>
                  {renderMoney(document.tax_amount || 0, document.foreign_tax_amount, 'font-medium text-gray-400')}
                </div>
              )}
              <div className="my-2 h-px bg-gray-200" />
              <div className="flex justify-between rounded-lg px-3.5 py-3" style={{ backgroundColor: config.theme.accent }}>
                <span className="text-sm font-bold text-white/85">{t('purchaseDocuments.field.total')}</span>
                {renderMoney(document.total_amount || 0, document.foreign_total_amount, 'text-[17px] font-extrabold text-white')}
              </div>
            </div>
          </div>
        )}

        {config.behavior.hasPaymentStatus && (
          <div className="mt-6 rounded-lg border border-gray-100 px-4 py-3">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold text-gray-900">{t('accountsPayable.paymentHistory')}</div>
                <div className="text-xs text-gray-500">{t('accountsPayable.paymentHistorySubtitle')}</div>
              </div>
            </div>
            <PayablePaymentHistory
              payments={invoicePayments}
              loading={isPayableMutating}
              onVoidPayment={async (paymentId, reason) => {
                await voidPayment({ paymentId, reason });
                await loadDocument();
              }}
            />
          </div>
        )}

        <div className="mt-9 flex flex-col gap-6 border-t border-gray-100 pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[.07em] text-gray-400">{t('purchaseDocuments.field.notes')}</div>
            <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-6 text-gray-500">{document.notes || '-'}</div>
          </div>
          {(document.voided_at || document.void_reason) && (
            <div className="text-left sm:text-right">
              <div className="text-[10.5px] font-bold uppercase tracking-[.07em] text-gray-400">{t('purchaseDocuments.field.voidReason')}</div>
              <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-6 text-gray-500">{document.void_reason || '-'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
