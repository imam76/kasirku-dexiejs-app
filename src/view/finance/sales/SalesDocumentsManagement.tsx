import { useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select, Table, Tag } from 'antd';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Eye,
  FileText,
  Plus,
  ReceiptText,
  RotateCcw,
  SlidersHorizontal,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import {
  getSalesDocumentConfig,
  getSalesDocumentTypePathSegment,
} from '@/configs/sales-document';
import type { TranslationKey } from '@/i18n/messages';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSalesDocuments } from '@/hooks/useSalesDocuments';
import type { SalesDocument, SalesDocumentStatus, SalesDocumentType } from '@/types';
import {
  formatBaseCurrencyAmount,
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { formatDate } from '@/utils/formatters';
import { salesDocumentStatusLabelKeys, salesInvoicePaymentStatusLabelKeys } from '@/utils/salesDocuments/i18n';
import { canAccessPath } from '@/auth/routePermissions';
import { useAuth } from '@/auth/useAuth';
import { GlobalBreadcrumb } from '@/components/GlobalBreadcrumb';
import ManagementListCard from '@/components/ManagementListCard';
import { MobileCrudPageHeader, ResponsiveCrudCollection } from '@/components/mobile-crud';
import dayjs from '@/lib/dayjs';

const statusColor: Record<SalesDocumentStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'blue',
  CONVERTED: 'green',
  VOIDED: 'red',
};

const renderDocumentTotal = (document: SalesDocument) => {
  const displayValue = document.foreign_total_amount ?? toDocumentCurrencyAmount(document.total_amount, document);
  const isForeign = !isBaseCurrency(document.currency_code, document.base_currency_code);

  return (
    <span>
      {formatDocumentCurrencyAmount(displayValue, document)}
      {isForeign && (
        <span className="block text-xs text-gray-500">
          {formatBaseCurrencyAmount(document.total_amount || 0, document)}
        </span>
      )}
    </span>
  );
};

type SalesDocumentMenuItem = {
  type: SalesDocumentType;
  code: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: LucideIcon;
  color: string;
  iconBackground: string;
};

const salesDocumentMenuItems: SalesDocumentMenuItem[] = [
  {
    type: 'SALES_QUOTATION',
    code: 'SQ',
    labelKey: 'salesDocuments.type.salesQuotation',
    descKey: 'salesDocuments.menu.salesQuotationDesc',
    icon: FileText,
    color: 'text-blue-600',
    iconBackground: 'bg-blue-50',
  },
  {
    type: 'SALES_ORDER',
    code: 'SO',
    labelKey: 'salesDocuments.type.salesOrder',
    descKey: 'salesDocuments.menu.salesOrderDesc',
    icon: ClipboardList,
    color: 'text-emerald-600',
    iconBackground: 'bg-emerald-50',
  },
  {
    type: 'SALES_DELIVERY',
    code: 'SD',
    labelKey: 'salesDocuments.type.salesDelivery',
    descKey: 'salesDocuments.menu.salesDeliveryDesc',
    icon: Truck,
    color: 'text-amber-600',
    iconBackground: 'bg-amber-50',
  },
  {
    type: 'SALES_INVOICE',
    code: 'SI',
    labelKey: 'salesDocuments.type.salesInvoice',
    descKey: 'salesDocuments.menu.salesInvoiceDesc',
    icon: ReceiptText,
    color: 'text-violet-600',
    iconBackground: 'bg-violet-50',
  },
];

const hasPaymentStatus = (document: Pick<SalesDocument, 'type'>) => (
  getSalesDocumentConfig(document.type).behavior.hasPaymentStatus
);

const hasPricing = (document: Pick<SalesDocument, 'type'>) => (
  getSalesDocumentConfig(document.type).behavior.hasPricing
);

function SalesDocumentMenuGrid() {
  const { t } = useI18n();
  const { currentUser, currentRole, permissionSet } = useAuth();
  const canAccess = (path: string) => canAccessPath(
    currentUser ?? undefined,
    path,
    { currentRole, permissionSet },
  );
  const visibleMenuItems = salesDocumentMenuItems.filter((item) => (
    canAccess(`/sales/${getSalesDocumentTypePathSegment(item.type)}`)
  ));
  const canAccessReturns = canAccess('/sales/returns');

  return (
    <div className="app-menu-grid">
      {visibleMenuItems.map((item) => (
        <Link
          key={item.type}
          to="/sales/$documentType"
          params={{ documentType: getSalesDocumentTypePathSegment(item.type) }}
          className="app-menu-card"
        >
          <div className="app-menu-card__body flex flex-col items-center justify-center">
            <div className={`app-menu-card__icon ${item.iconBackground}`}>
              <item.icon className={`app-menu-card__icon-svg ${item.color}`} />
            </div>

            <div className={`app-menu-card__code ${item.color}`}>
              {item.code}
            </div>

            <h2 className="app-menu-card__title">
              {t(item.labelKey)}
            </h2>

            <p className="app-menu-card__brief mt-1 line-clamp-2 text-center text-[10px] leading-[1.45] text-gray-400 sm:text-[11px] sm:leading-[1.55] lg:hidden">
              {t(item.descKey)}
            </p>

            <div className="mt-2 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400 sm:mt-3">
              <span>{t('salesDocuments.menu.open')}</span>
              <ArrowRight size={12} />
            </div>
          </div>

          <div className="app-menu-card__detail flex-col text-center">
            <p className="text-[12px] leading-[1.55] text-gray-500">
              {t(item.descKey)}
            </p>
            <div className="mt-3 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400">
              <span>{t('salesDocuments.menu.open')}</span>
              <ArrowRight size={12} />
            </div>
          </div>
        </Link>
      ))}
      {canAccessReturns && (
        <Link
          to="/sales/returns"
          className="app-menu-card"
        >
          <div className="app-menu-card__body flex flex-col items-center justify-center">
            <div className="app-menu-card__icon bg-rose-50">
              <RotateCcw className="app-menu-card__icon-svg text-rose-600" />
            </div>
            <div className="app-menu-card__code text-rose-600">
              SR
            </div>
            <h2 className="app-menu-card__title">
              {t('salesReturns.menu.title')}
            </h2>
            <p className="app-menu-card__brief mt-1 line-clamp-2 text-center text-[10px] leading-[1.45] text-gray-400 sm:text-[11px] sm:leading-[1.55] lg:hidden">
              {t('salesReturns.menu.desc')}
            </p>
            <div className="mt-2 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400 sm:mt-3">
              <span>{t('salesDocuments.menu.open')}</span>
              <ArrowRight size={12} />
            </div>
          </div>
          <div className="app-menu-card__detail flex-col text-center">
            <p className="text-[12px] leading-[1.55] text-gray-500">
              {t('salesReturns.menu.desc')}
            </p>
            <div className="mt-3 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400">
              <span>{t('salesDocuments.menu.open')}</span>
              <ArrowRight size={12} />
            </div>
          </div>
        </Link>
      )}
    </div>
  );
}

export default function SalesDocumentsManagement() {
  const { t } = useI18n();

  return (
    <div className="px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-[38px]">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-7 text-center sm:mb-9 lg:mb-12">
          <h1 className="mb-2 text-[20px] font-medium leading-[1.3] tracking-tight text-gray-900 sm:mb-[10px] sm:text-[26px] lg:mb-[14px] lg:text-[34px] lg:leading-[1.2]">
            {t('salesDocuments.title')}
          </h1>
          <p className="px-2 text-[12px] leading-[1.618] text-gray-400 sm:mx-auto sm:max-w-[420px] sm:px-0 sm:text-sm lg:max-w-[560px] lg:text-base lg:font-light">
            {t('salesDocuments.subtitle')}
          </p>
        </div>

        <SalesDocumentMenuGrid />
      </div>
    </div>
  );
}

export function SalesDocumentTypeManagement({ documentType }: { documentType: SalesDocumentType }) {
  const { t } = useI18n();
  const { documents } = useSalesDocuments();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<SalesDocumentStatus | 'ALL'>('ALL');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const config = getSalesDocumentConfig(documentType);
  const menuItem = salesDocumentMenuItems.find((item) => item.type === documentType);
  const documentPathSegment = getSalesDocumentTypePathSegment(documentType);

  const documentsOfType = useMemo(
    () => documents.filter((document) => document.type === documentType),
    [documents, documentType],
  );

  const filteredDocuments = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesType = document.type === documentType;
      const matchesStatus = statusFilter === 'ALL' || document.status === statusFilter;
      const matchesSearch = !query || [
        document.document_number,
        document.customer_name,
        document.project_name,
        document.department_name,
      ].some((value) => value?.toLowerCase().includes(query));
      const documentDate = dayjs(document.document_date);
      const matchesDate = !dateRange || (
        !documentDate.isBefore(dateRange[0], 'day')
        && !documentDate.isAfter(dateRange[1], 'day')
      );

      return matchesType && matchesStatus && matchesSearch && matchesDate;
    });
  }, [dateRange, documents, documentType, searchText, statusFilter]);

  const showPaymentColumn = filteredDocuments.some(hasPaymentStatus) || config.behavior.hasPaymentStatus;
  const showTotalColumn = filteredDocuments.some(hasPricing) || config.behavior.hasPricing;

  const columns: ColumnsType<SalesDocument> = [
    {
      title: t('salesDocuments.table.documentNumber'),
      dataIndex: 'document_number',
      render: (value: string, record) => (
        <Link
          to="/sales/$documentType/$documentId"
          params={{ documentType: getSalesDocumentTypePathSegment(record.type), documentId: record.id }}
        >
          {value}
        </Link>
      ),
    },
    {
      title: t('salesDocuments.table.customer'),
      dataIndex: 'customer_name',
    },
    {
      title: t('salesDocuments.table.date'),
      dataIndex: 'document_date',
      render: (value: string) => formatDate(value),
      width: 130,
    },
    {
      title: t('salesDocuments.table.status'),
      dataIndex: 'status',
      render: (value: SalesDocumentStatus) => <Tag color={statusColor[value]}>{t(salesDocumentStatusLabelKeys[value])}</Tag>,
      width: 120,
    },
    ...(showPaymentColumn ? [{
      title: t('salesDocuments.table.payment'),
      dataIndex: 'payment_status',
      render: (value: SalesDocument['payment_status'], record: SalesDocument) => (
        hasPaymentStatus(record) && value ? <Tag>{t(salesInvoicePaymentStatusLabelKeys[value])}</Tag> : '-'
      ),
      width: 110,
    }] : []),
    ...(showTotalColumn ? [{
      title: t('salesDocuments.table.total'),
      dataIndex: 'total_amount',
      align: 'right' as const,
      render: (value: number | undefined, record: SalesDocument) => (
        hasPricing(record) && value !== undefined ? renderDocumentTotal(record) : '-'
      ),
      width: 150,
    }] : []),
    {
      title: t('common.actions'),
      key: 'action',
      fixed: 'right',
      width: 110,
      render: (_, record) => (
        <Link
          to="/sales/$documentType/$documentId"
          params={{ documentType: getSalesDocumentTypePathSegment(record.type), documentId: record.id }}
        >
          <Button size="small" icon={<Eye size={14} />}>
            {t('salesDocuments.detail')}
          </Button>
        </Link>
      ),
    },
  ];

  const statusFilterOptions = [
    { value: 'ALL' as const, label: t('common.allStatuses') },
    { value: 'DRAFT' as const, label: t(salesDocumentStatusLabelKeys.DRAFT) },
    { value: 'ISSUED' as const, label: t(salesDocumentStatusLabelKeys.ISSUED) },
    { value: 'CONVERTED' as const, label: t(salesDocumentStatusLabelKeys.CONVERTED) },
    { value: 'VOIDED' as const, label: t(salesDocumentStatusLabelKeys.VOIDED) },
  ];

  const resetFilters = () => {
    setSearchText('');
    setStatusFilter('ALL');
    setDateRange(null);
  };

  const activeFilterCount = (statusFilter !== 'ALL' ? 1 : 0) + (dateRange ? 1 : 0);
  const activeSearchAndFilterCount = activeFilterCount + (searchText.trim() ? 1 : 0);

  return (
    <>
      {isMobile ? (
        <MobileCrudPageHeader
          title={menuItem ? `${menuItem.code} - ${t(config.titleKey)}` : t(config.titleKey)}
          icon={menuItem
            ? <menuItem.icon className={`h-5 w-5 ${menuItem.color}`} />
            : <FileText className="h-5 w-5" />}
          breadcrumb={<GlobalBreadcrumb pathname={location.pathname} compact />}
        />
      ) : null}

      <ResponsiveCrudCollection<SalesDocument>
        desktop={(
          <ManagementListCard
            title={menuItem ? `${menuItem.code} - ${t(config.titleKey)}` : t(config.titleKey)}
            icon={menuItem
              ? <menuItem.icon className={`h-5 w-5 ${menuItem.color}`} />
              : <FileText className="h-5 w-5" />}
            actions={(
              <div className="flex flex-wrap justify-end gap-2">
                <Link to="/sales">
                  <Button icon={<ArrowLeft size={16} />}>
                    {t('salesDocuments.backToSalesMenu')}
                  </Button>
                </Link>
                <Link
                  to="/sales/$documentType/new"
                  params={{ documentType: documentPathSegment }}
                >
                  <Button type="primary" icon={<Plus size={16} />}>
                    {t('salesDocuments.menu.new')}
                  </Button>
                </Link>
              </div>
            )}
            toolbar={(
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_280px_auto]">
                <Input.Search
                  allowClear
                  placeholder={t('salesDocuments.searchPlaceholder')}
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
                <Select<SalesDocumentStatus | 'ALL'>
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusFilterOptions}
                />
                <DatePicker.RangePicker
                  value={dateRange}
                  allowClear
                  format="DD MMM YYYY"
                  onChange={(value) => {
                    if (value?.[0] && value[1]) {
                      setDateRange([value[0], value[1]]);
                      return;
                    }
                    setDateRange(null);
                  }}
                />
                <Button
                  icon={<RotateCcw size={16} />}
                  onClick={resetFilters}
                >
                  {t('common.reset')}
                </Button>
              </div>
            )}
          >
            <Table
              rowKey="id"
              columns={columns}
              dataSource={filteredDocuments}
              scroll={{ x: 1000 }}
              pagination={{ pageSize: 20, showSizeChanger: true }}
            />
          </ManagementListCard>
        )}
        mobileFilter={{
          open: isFilterDrawerOpen,
          title: t('salesDocuments.mobile.filterTitle'),
          onClose: () => setIsFilterDrawerOpen(false),
          onReset: resetFilters,
          resetLabel: t('common.reset'),
          applyLabel: t('salesDocuments.mobile.applyFilter'),
          resetDisabled: !searchText.trim() && activeFilterCount === 0,
          children: (
            <>
              <Input.Search
                size="large"
                allowClear
                autoFocus
                aria-label={t('salesDocuments.searchPlaceholder')}
                placeholder={t('salesDocuments.searchPlaceholder')}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <Select<SalesDocumentStatus | 'ALL'>
                size="large"
                className="w-full"
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusFilterOptions}
              />
              <DatePicker.RangePicker
                size="large"
                className="w-full"
                value={dateRange}
                allowClear
                format="DD MMM YYYY"
                onChange={(value) => {
                  if (value?.[0] && value[1]) {
                    setDateRange([value[0], value[1]]);
                    return;
                  }
                  setDateRange(null);
                }}
              />
            </>
          ),
        }}
        mobileList={{
          items: filteredDocuments,
          getKey: (document) => document.id,
          resetKey: JSON.stringify([
            searchText,
            statusFilter,
            dateRange?.[0]?.valueOf() ?? null,
            dateRange?.[1]?.valueOf() ?? null,
          ]),
          resultSummary: t('salesDocuments.mobile.resultSummary', {
            shown: filteredDocuments.length,
            total: documentsOfType.length,
          }),
          emptyText: searchText.trim() || activeFilterCount > 0
            ? t('salesDocuments.mobile.noFilteredDocuments')
            : t('salesDocuments.mobile.noDocuments'),
          emptyAction: !searchText.trim() && activeFilterCount === 0 ? (
            <Link to="/sales/$documentType/new" params={{ documentType: documentPathSegment }}>
              <Button type="primary" size="large" icon={<Plus size={18} />}>
                {t('salesDocuments.menu.new')}
              </Button>
            </Link>
          ) : undefined,
          loadMoreLabel: (remaining) => t('salesDocuments.mobile.loadMoreDocuments', { count: remaining }),
          getItemAriaLabel: (document) => t('salesDocuments.mobile.detailAria', { number: document.document_number }),
          onItemClick: (document) => {
            void navigate({
              to: '/sales/$documentType/$documentId',
              params: {
                documentType: getSalesDocumentTypePathSegment(document.type),
                documentId: document.id,
              },
            });
          },
          renderItem: (document) => (
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-gray-900 dark:text-gray-100">
                  {document.document_number}
                </span>
                <Tag className="m-0 shrink-0" color={statusColor[document.status]}>
                  {t(salesDocumentStatusLabelKeys[document.status])}
                </Tag>
              </div>
              <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {document.customer_name || '-'}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-gray-400">{formatDate(document.document_date)}</span>
                {hasPaymentStatus(document) && document.payment_status ? (
                  <Tag className="m-0">{t(salesInvoicePaymentStatusLabelKeys[document.payment_status])}</Tag>
                ) : null}
              </div>
              {hasPricing(document) && document.total_amount !== undefined ? (
                <div className="mt-2 text-right text-sm font-bold text-gray-900 dark:text-gray-100">
                  {renderDocumentTotal(document)}
                </div>
              ) : null}
            </div>
          ),
        }}
        mobileFloatingActions={{
          actions: [
            {
              key: 'add',
              type: 'primary',
              icon: <Plus size={24} />,
              label: t('salesDocuments.menu.new'),
              onClick: () => {
                void navigate({ to: '/sales/$documentType/new', params: { documentType: documentPathSegment } });
              },
            },
            {
              key: 'filter',
              icon: <SlidersHorizontal size={22} />,
              label: t('salesDocuments.mobile.filterTitle'),
              badge: { count: activeSearchAndFilterCount, color: '#fa8c16' },
              onClick: () => setIsFilterDrawerOpen(true),
            },
          ],
        }}
      />
    </>
  );
}
