import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Card } from 'antd';
import { ChevronRight } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import type { Control, FieldErrors, UseFormSetValue } from 'react-hook-form';
import dayjs from '@/lib/dayjs';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { DocumentCurrencyFields } from '@/components/DocumentCurrencyFields';
import { DocumentTotalsSummary } from '@/components/document-line-items/DocumentTotalsSummary';
import { ResponsiveCrudEditor } from '@/components/mobile-crud';
import type {
  Contact,
  Currency,
  CurrencyRate,
  Department,
  Product,
  Project,
  PromoType,
  SalesDocumentItem,
  Tax,
  Warehouse,
} from '@/types';
import {
  formatDocumentCurrencyAmount,
  toDocumentCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import type { DocumentTotalResult } from '@/utils/salesDocuments/calculateDocumentTotal';
import { splitHeaderFieldsByGroup } from '@/utils/salesDocuments/headerFieldGroups';
import { DocumentHeader } from './DocumentHeader';
import { DocumentLineItems } from './DocumentLineItems';
import type { SalesDocumentFormValues } from './SalesDocumentForm';

interface Option {
  value: string;
  label: string;
}

interface SalesDocumentMobileComposerProps {
  config: SalesDocumentConfig;
  control: Control<SalesDocumentFormValues>;
  errors: FieldErrors<SalesDocumentFormValues>;
  setValue: UseFormSetValue<SalesDocumentFormValues>;
  contacts: Contact[];
  taxes: Tax[];
  departments: Department[];
  projects: Project[];
  warehouses: Warehouse[];
  products: Product[];
  currencies: Currency[];
  latestRateByCurrency: Record<string, CurrencyRate>;
  documentId: string;
  items: SalesDocumentItem[];
  calculatedItems: SalesDocumentItem[];
  filledItemCount: number;
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  total: DocumentTotalResult;
  discountType: PromoType;
  discountValue: number;
  summaryTaxOptions: Option[];
  submitting?: boolean;
  onCancel?: () => void;
  onItemsChange: (items: SalesDocumentItem[]) => void;
  onCreateProductRequest: (lineId: string, search: string) => void;
  onEditProductRequest: (lineId: string, productId: string) => void;
  onCurrencySnapshotChange: (snapshot: DocumentCurrencySnapshot, previousCurrencyCode?: string) => void;
  onDiscountTypeChange: (value: PromoType) => void;
  onDiscountValueChange: (value: number) => void;
  onTaxChange: (taxId?: string) => void;
}

type SpokeKey = 'core' | 'items' | 'totals' | 'advanced';

const SpokeRow = ({ label, value, onClick }: { label: string; value?: ReactNode; onClick: () => void }) => (
  <button
    type="button"
    className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left shadow-sm transition active:scale-[0.995] dark:border-gray-700 dark:bg-gray-900"
    onClick={onClick}
  >
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold">{label}</span>
      {value ? <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{value}</span> : null}
    </span>
    <ChevronRight aria-hidden size={18} className="shrink-0 text-gray-400" />
  </button>
);

const formatWatchedDate = (value: unknown) => (dayjs.isDayjs(value) ? value.format('DD MMM YYYY') : undefined);

export const SalesDocumentMobileComposer = ({
  config,
  control,
  errors,
  setValue,
  contacts,
  taxes,
  departments,
  projects,
  warehouses,
  products,
  currencies,
  latestRateByCurrency,
  documentId,
  items,
  calculatedItems,
  filledItemCount,
  documentCurrencySnapshot,
  total,
  discountType,
  discountValue,
  summaryTaxOptions,
  submitting,
  onCancel,
  onItemsChange,
  onCreateProductRequest,
  onEditProductRequest,
  onCurrencySnapshotChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onTaxChange,
}: SalesDocumentMobileComposerProps) => {
  const { t } = useI18n();
  const [openSpoke, setOpenSpoke] = useState<SpokeKey | null>(null);
  const customerName = useWatch({ control, name: 'customer_name' }) as string | undefined;
  const documentDateValue = useWatch({ control, name: 'document_date' });
  const dueDateValue = useWatch({ control, name: 'due_date' });
  const closeSpoke = () => setOpenSpoke(null);

  const { core: coreFields, advanced: advancedFields } = useMemo(
    () => splitHeaderFieldsByGroup(config.headerFields),
    [config.headerFields],
  );

  const formattedTotal = formatDocumentCurrencyAmount(
    toDocumentCurrencyAmount(total.total_amount, documentCurrencySnapshot),
    documentCurrencySnapshot,
  );
  const formattedSubtotal = formatDocumentCurrencyAmount(
    toDocumentCurrencyAmount(total.subtotal_amount, documentCurrencySnapshot),
    documentCurrencySnapshot,
  );

  return (
    <div className="space-y-3">
      <Card size="small">
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">{t('salesDocuments.field.customerName')}</span>
            <span className="min-w-0 max-w-[65%] truncate text-right font-medium">{customerName || '-'}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">{t('salesDocuments.field.documentDate')}</span>
            <span className="font-medium">{formatWatchedDate(documentDateValue) || '-'}</span>
          </div>
          {config.behavior.hasDueDate ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500">{t('salesDocuments.field.dueDate')}</span>
              <span className="font-medium">{formatWatchedDate(dueDateValue) || '-'}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">{t('documentLineItems.itemCountLabel')}</span>
            <span className="font-medium">{filledItemCount}</span>
          </div>
          {config.behavior.hasPricing ? (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-1.5 dark:border-gray-700">
              <span className="font-medium">{t('salesDocuments.field.total')}</span>
              <span className="text-base font-semibold">{formattedTotal}</span>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="space-y-2">
        <SpokeRow
          label={t('salesDocuments.mobile.spoke.customerDate')}
          value={customerName || undefined}
          onClick={() => setOpenSpoke('core')}
        />
        <SpokeRow
          label={t('salesDocuments.mobile.spoke.items', { count: filledItemCount })}
          value={config.behavior.hasPricing ? formattedSubtotal : undefined}
          onClick={() => setOpenSpoke('items')}
        />
        {config.behavior.hasPricing ? (
          <SpokeRow
            label={t('salesDocuments.mobile.spoke.totals')}
            value={formattedTotal}
            onClick={() => setOpenSpoke('totals')}
          />
        ) : null}
        {advancedFields.length > 0 ? (
          <SpokeRow
            label={t('salesDocuments.mobile.spoke.advanced')}
            onClick={() => setOpenSpoke('advanced')}
          />
        ) : null}
      </div>

      <div className="flex gap-2">
        {onCancel ? (
          <Button block size="large" className="h-12" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
        <Button block type="primary" size="large" className="h-12" htmlType="submit" loading={submitting}>
          {t('salesDocuments.saveDraft')}
        </Button>
      </div>

      <ResponsiveCrudEditor
        open={openSpoke === 'core'}
        title={t('salesDocuments.mobile.spoke.customerDate')}
        onClose={closeSpoke}
        showCloseButton
      >
        <DocumentHeader
          config={{ ...config, headerFields: coreFields }}
          control={control}
          errors={errors}
          setValue={setValue}
          contacts={contacts}
          taxes={taxes}
          departments={departments}
          projects={projects}
          warehouses={warehouses}
        />
      </ResponsiveCrudEditor>

      <ResponsiveCrudEditor
        open={openSpoke === 'items'}
        title={t('salesDocuments.mobile.spoke.items', { count: filledItemCount })}
        onClose={closeSpoke}
        showCloseButton
      >
        <DocumentLineItems
          config={config}
          documentId={documentId}
          items={items}
          calculatedItems={calculatedItems}
          products={products}
          taxes={taxes}
          documentCurrencySnapshot={documentCurrencySnapshot}
          onChange={onItemsChange}
          onCreateProductRequest={onCreateProductRequest}
          onEditProductRequest={onEditProductRequest}
        />
      </ResponsiveCrudEditor>

      {config.behavior.hasPricing ? (
        <ResponsiveCrudEditor
          open={openSpoke === 'totals'}
          title={t('salesDocuments.mobile.spoke.totals')}
          onClose={closeSpoke}
          showCloseButton
        >
          <div className="space-y-4">
            <DocumentCurrencyFields
              control={control}
              setValue={setValue}
              currencies={currencies}
              latestRateByCurrency={latestRateByCurrency}
              documentDate={documentDateValue}
              onSnapshotChange={onCurrencySnapshotChange}
            />
            <DocumentTotalsSummary
              i18nPrefix="salesDocuments"
              discountPurpose="sales"
              discountAccountType="CONTRA_REVENUE"
              control={control}
              total={total}
              filledItemCount={filledItemCount}
              documentCurrencySnapshot={documentCurrencySnapshot}
              taxOptions={summaryTaxOptions}
              hasTax={config.behavior.hasTax}
              discountType={discountType}
              discountValue={discountValue}
              onDiscountTypeChange={onDiscountTypeChange}
              onDiscountValueChange={onDiscountValueChange}
              onTaxChange={onTaxChange}
            />
          </div>
        </ResponsiveCrudEditor>
      ) : null}

      {advancedFields.length > 0 ? (
        <ResponsiveCrudEditor
          open={openSpoke === 'advanced'}
          title={t('salesDocuments.mobile.spoke.advanced')}
          onClose={closeSpoke}
          showCloseButton
        >
          <DocumentHeader
            config={{ ...config, headerFields: advancedFields }}
            control={control}
            errors={errors}
            setValue={setValue}
            contacts={contacts}
            taxes={taxes}
            departments={departments}
            projects={projects}
            warehouses={warehouses}
          />
        </ResponsiveCrudEditor>
      ) : null}
    </div>
  );
};
