import { useCallback, useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select, Table, Tag } from 'antd';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, ClipboardList, CreditCard, FileCheck2, FileQuestion, FileText, PackageCheck, Plus, ReceiptText, RotateCcw, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import {
  getPurchaseDocumentConfig,
  getPurchaseDocumentTypePathSegment,
} from '@/configs/purchase-document';
import type { TranslationKey } from '@/i18n/messages';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePurchaseDocuments } from '@/hooks/usePurchaseDocuments';
import type { PurchaseCostStatus, PurchaseDocument, PurchaseDocumentStatus, PurchaseDocumentType } from '@/types';
import {
  formatBaseCurrencyAmount,
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { formatDate } from '@/utils/formatters';
import { purchaseDocumentStatusLabelKeys, purchaseInvoicePaymentStatusLabelKeys } from '@/utils/purchaseDocuments/i18n';
import { canAccessPath } from '@/auth/routePermissions';
import { useAuth } from '@/auth/useAuth';
import { GlobalBreadcrumb } from '@/components/GlobalBreadcrumb';
import ManagementListCard from '@/components/ManagementListCard';
import { RecordActionMenu, RecordContextMenu } from '@/components/RecordActionMenu';
import { MobileCrudPageHeader, ResponsiveCrudCollection } from '@/components/mobile-crud';
import { usePurchaseDocumentActions } from '@/components/purchase-document/PurchaseDocumentActions';
import type { RecordContextMenuPosition } from '@/utils/recordActions';
import dayjs from '@/lib/dayjs';

const statusColor: Record<PurchaseDocumentStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'blue',
  CONVERTED: 'green',
  VOIDED: 'red',
};

const costStatusColor: Record<PurchaseCostStatus, string> = {
  FINAL: 'green',
  ESTIMATED: 'gold',
  PENDING: 'red',
};

const costStatusLabel: Record<PurchaseCostStatus, string> = {
  FINAL: 'Harga Final',
  ESTIMATED: 'Harga Sementara',
  PENDING: 'Belum Ada Harga',
};

const renderDocumentTotal = (document: PurchaseDocument) => {
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

type PurchaseDocumentMenuItem = {
  type: PurchaseDocumentType;
  code: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: LucideIcon;
  color: string;
  iconBackground: string;
};

const purchaseDocumentMenuItems: PurchaseDocumentMenuItem[] = [
  {
    type: 'PURCHASE_REQUEST',
    code: 'PR',
    labelKey: 'purchaseDocuments.type.purchaseRequest',
    descKey: 'purchaseDocuments.menu.purchaseRequestDesc',
    icon: FileQuestion,
    color: 'text-teal-600',
    iconBackground: 'bg-teal-50',
  },
  {
    type: 'REQUEST_FOR_QUOTATION',
    code: 'RFQ',
    labelKey: 'purchaseDocuments.type.requestForQuotation',
    descKey: 'purchaseDocuments.menu.requestForQuotationDesc',
    icon: FileText,
    color: 'text-blue-600',
    iconBackground: 'bg-blue-50',
  },
  {
    type: 'PURCHASE_ORDER',
    code: 'PO',
    labelKey: 'purchaseDocuments.type.purchaseOrder',
    descKey: 'purchaseDocuments.menu.purchaseOrderDesc',
    icon: ClipboardList,
    color: 'text-violet-600',
    iconBackground: 'bg-violet-50',
  },
  {
    type: 'PURCHASE_RECEIPT',
    code: 'GR',
    labelKey: 'purchaseDocuments.type.purchaseReceipt',
    descKey: 'purchaseDocuments.menu.purchaseReceiptDesc',
    icon: PackageCheck,
    color: 'text-amber-600',
    iconBackground: 'bg-amber-50',
  },
  {
    type: 'PURCHASE_INVOICE',
    code: 'PI',
    labelKey: 'purchaseDocuments.type.purchaseInvoice',
    descKey: 'purchaseDocuments.menu.purchaseInvoiceDesc',
    icon: ReceiptText,
    color: 'text-rose-600',
    iconBackground: 'bg-rose-50',
  },
  {
    type: 'PURCHASE_RETURN',
    code: 'PRT',
    labelKey: 'purchaseDocuments.type.purchaseReturn',
    descKey: 'purchaseDocuments.menu.purchaseReturnDesc',
    icon: RotateCcw,
    color: 'text-orange-700',
    iconBackground: 'bg-orange-50',
  },
];

const hasPaymentStatus = (document: Pick<PurchaseDocument, 'type'>) => (
  getPurchaseDocumentConfig(document.type).behavior.hasPaymentStatus
);

const hasPricing = (document: Pick<PurchaseDocument, 'type'>) => (
  getPurchaseDocumentConfig(document.type).behavior.hasPricing
);

type PurchaseHomeMenuItem = {
  key: string;
  to: string;
  params?: Record<string, string>;
  code?: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  iconBackground: string;
};

function PurchaseMenuGrid() {
  const { t } = useI18n();
  const { currentUser, currentRole, permissionSet } = useAuth();
  const canAccess = (path: string) => canAccessPath(
    currentUser ?? undefined,
    path,
    { currentRole, permissionSet },
  );

  const items: PurchaseHomeMenuItem[] = [
    ...purchaseDocumentMenuItems
      .filter((item) => canAccess(`/purchases/${getPurchaseDocumentTypePathSegment(item.type)}`))
      .map((item): PurchaseHomeMenuItem => ({
        key: item.type,
        to: '/purchases/$documentType',
        params: { documentType: getPurchaseDocumentTypePathSegment(item.type) },
        code: item.code,
        label: t(item.labelKey),
        desc: t(item.descKey),
        icon: item.icon,
        color: item.color,
        iconBackground: item.iconBackground,
      })),
    ...(canAccess('/purchases/pending-costs') ? [{
      key: 'pending-costs',
      to: '/purchases/pending-costs',
      label: 'Harga Belum Final',
      desc: 'Daftar Purchase Receipt dengan HPP sementara.',
      icon: FileCheck2,
      color: 'text-amber-700',
      iconBackground: 'bg-amber-50',
    }] : []),
    ...(canAccess('/finance/payables') ? [{
      key: 'payables',
      to: '/finance/payables',
      label: t('accountsPayable.title'),
      desc: t('accountsPayable.shortDesc'),
      icon: CreditCard,
      color: 'text-emerald-700',
      iconBackground: 'bg-emerald-50',
    }] : []),
  ];

  return (
    <div className="app-menu-grid">
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          params={item.params}
          className="app-menu-card"
        >
          <div className="app-menu-card__body flex flex-col items-center justify-center">
            <div className={`app-menu-card__icon ${item.iconBackground}`}>
              <item.icon className={`app-menu-card__icon-svg ${item.color}`} />
            </div>
            {item.code && (
              <div className={`app-menu-card__code ${item.color}`}>
                {item.code}
              </div>
            )}
            <h2 className="app-menu-card__title">
              {item.label}
            </h2>
            <p className="app-menu-card__brief mt-1 line-clamp-2 text-center text-[10px] leading-[1.45] text-gray-400 sm:text-[11px] sm:leading-[1.55] lg:hidden">
              {item.desc}
            </p>
            <div className="mt-2 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400 sm:mt-3">
              <span>{t('purchaseDocuments.menu.open')}</span>
              <ArrowRight size={12} />
            </div>
          </div>
          <div className="app-menu-card__detail flex-col text-center">
            <p className="text-[12px] leading-[1.55] text-gray-500">
              {item.desc}
            </p>
            <div className="mt-3 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400">
              <span>{t('purchaseDocuments.menu.open')}</span>
              <ArrowRight size={12} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function PurchaseDocumentsManagement() {
  const { t } = useI18n();

  return (
    <div className="px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-[38px]">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-7 text-center sm:mb-9 lg:mb-12">
          <h1 className="mb-2 text-[20px] font-medium leading-[1.3] tracking-tight text-gray-900 sm:mb-[10px] sm:text-[26px] lg:mb-[14px] lg:text-[34px] lg:leading-[1.2]">
            {t('purchaseDocuments.title')}
          </h1>
          <p className="px-2 text-[12px] leading-[1.618] text-gray-400 sm:mx-auto sm:max-w-[420px] sm:px-0 sm:text-sm lg:max-w-[560px] lg:text-base lg:font-light">
            {t('purchaseDocuments.subtitle')}
          </p>
        </div>

        <PurchaseMenuGrid />
      </div>
    </div>
  );
}

export function PurchaseDocumentTypeManagement({ documentType }: { documentType: PurchaseDocumentType }) {
  const { t } = useI18n();
  const { documents } = usePurchaseDocuments();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<PurchaseDocumentStatus | 'ALL'>('ALL');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const getDocumentActions = usePurchaseDocumentActions();
  const [contextMenu, setContextMenu] = useState<{
    document: PurchaseDocument;
    position: RecordContextMenuPosition;
  } | null>(null);
  const config = getPurchaseDocumentConfig(documentType);
  const menuItem = purchaseDocumentMenuItems.find((item) => item.type === documentType);
  const documentPathSegment = getPurchaseDocumentTypePathSegment(documentType);

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
        document.supplier_name,
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
  const showCostColumn = documentType === 'PURCHASE_RECEIPT';

  const columns: ColumnsType<PurchaseDocument> = [
    {
      title: t('purchaseDocuments.table.documentNumber'),
      dataIndex: 'document_number',
      render: (value: string, record) => (
        <Link
          to="/purchases/$documentType/$documentId"
          params={{ documentType: getPurchaseDocumentTypePathSegment(record.type), documentId: record.id }}
        >
          {value}
        </Link>
      ),
    },
    {
      title: t('purchaseDocuments.table.supplier'),
      dataIndex: 'supplier_name',
      render: (value?: string) => value || '-',
    },
    {
      title: t('purchaseDocuments.table.date'),
      dataIndex: 'document_date',
      render: (value: string) => formatDate(value),
      width: 130,
    },
    {
      title: t('purchaseDocuments.table.status'),
      dataIndex: 'status',
      render: (value: PurchaseDocumentStatus) => <Tag color={statusColor[value]}>{t(purchaseDocumentStatusLabelKeys[value])}</Tag>,
      width: 120,
    },
    ...(showPaymentColumn ? [{
      title: t('purchaseDocuments.table.payment'),
      dataIndex: 'payment_status',
      render: (value: PurchaseDocument['payment_status'], record: PurchaseDocument) => (
        hasPaymentStatus(record) && value ? <Tag>{t(purchaseInvoicePaymentStatusLabelKeys[value])}</Tag> : '-'
      ),
      width: 110,
    }] : []),
    ...(showCostColumn ? [{
      title: 'Status Harga',
      dataIndex: 'cost_status',
      render: (value: PurchaseDocument['cost_status']) => {
        const status = value ?? 'FINAL';
        return <Tag color={costStatusColor[status]}>{costStatusLabel[status]}</Tag>;
      },
      width: 150,
    }] : []),
    ...(showTotalColumn ? [{
      title: t('purchaseDocuments.table.total'),
      dataIndex: 'total_amount',
      align: 'right' as const,
      render: (value: number | undefined, record: PurchaseDocument) => (
        hasPricing(record) && value !== undefined ? renderDocumentTotal(record) : '-'
      ),
      width: 150,
    }] : []),
    {
      title: t('common.actions'),
      key: 'action',
      fixed: 'right',
      width: 64,
      render: (_, record) => (
        <RecordActionMenu
          actions={getDocumentActions(record, 'list-menu')}
          ariaLabel={`${t('common.actions')} ${record.document_number}`}
          testId={`purchase-document-more-${record.id}`}
        />
      ),
    },
  ];

  const statusFilterOptions = [
    { value: 'ALL' as const, label: t('common.allStatuses') },
    { value: 'DRAFT' as const, label: t(purchaseDocumentStatusLabelKeys.DRAFT) },
    { value: 'ISSUED' as const, label: t(purchaseDocumentStatusLabelKeys.ISSUED) },
    { value: 'CONVERTED' as const, label: t(purchaseDocumentStatusLabelKeys.CONVERTED) },
    { value: 'VOIDED' as const, label: t(purchaseDocumentStatusLabelKeys.VOIDED) },
  ];

  const resetFilters = () => {
    setSearchText('');
    setStatusFilter('ALL');
    setDateRange(null);
  };

  const activeFilterCount = (statusFilter !== 'ALL' ? 1 : 0) + (dateRange ? 1 : 0);
  const activeSearchAndFilterCount = activeFilterCount + (searchText.trim() ? 1 : 0);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const contextMenuActions = contextMenu
    ? getDocumentActions(contextMenu.document, 'context-menu')
    : [];

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

      <ResponsiveCrudCollection<PurchaseDocument>
        desktop={(
          <ManagementListCard
            title={menuItem ? `${menuItem.code} - ${t(config.titleKey)}` : t(config.titleKey)}
            icon={menuItem
              ? <menuItem.icon className={`h-5 w-5 ${menuItem.color}`} />
              : <FileText className="h-5 w-5" />}
            actions={(
              <div className="flex flex-wrap justify-end gap-2">
                <Link to="/purchases">
                  <Button icon={<ArrowLeft size={16} />}>
                    {t('purchaseDocuments.backToPurchasesMenu')}
                  </Button>
                </Link>
                <Link
                  to="/purchases/$documentType/new"
                  params={{ documentType: documentPathSegment }}
                >
                  <Button type="primary" icon={<Plus size={16} />}>
                    {t('purchaseDocuments.menu.new')}
                  </Button>
                </Link>
              </div>
            )}
            toolbar={(
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_280px_auto]">
                <Input.Search
                  allowClear
                  placeholder={t('purchaseDocuments.searchPlaceholder')}
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
                <Select<PurchaseDocumentStatus | 'ALL'>
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
            <>
              <Table
                rowKey="id"
                columns={columns}
                dataSource={filteredDocuments}
                scroll={{ x: 1100 }}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                onRow={(record) => ({
                  onContextMenu: (event) => {
                    event.preventDefault();
                    setContextMenu({
                      document: record,
                      position: { x: event.clientX, y: event.clientY },
                    });
                  },
                })}
              />
              <RecordContextMenu
                position={contextMenu?.position ?? null}
                actions={contextMenuActions}
                onClose={closeContextMenu}
              />
            </>
          </ManagementListCard>
        )}
        mobileFilter={{
          open: isFilterDrawerOpen,
          title: t('purchaseDocuments.mobile.filterTitle'),
          onClose: () => setIsFilterDrawerOpen(false),
          onReset: resetFilters,
          resetLabel: t('common.reset'),
          applyLabel: t('purchaseDocuments.mobile.applyFilter'),
          resetDisabled: !searchText.trim() && activeFilterCount === 0,
          children: (
            <>
              <Input.Search
                size="large"
                allowClear
                autoFocus
                aria-label={t('purchaseDocuments.searchPlaceholder')}
                placeholder={t('purchaseDocuments.searchPlaceholder')}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <Select<PurchaseDocumentStatus | 'ALL'>
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
          resultSummary: t('purchaseDocuments.mobile.resultSummary', {
            shown: filteredDocuments.length,
            total: documentsOfType.length,
          }),
          emptyText: searchText.trim() || activeFilterCount > 0
            ? t('purchaseDocuments.mobile.noFilteredDocuments')
            : t('purchaseDocuments.mobile.noDocuments'),
          emptyAction: !searchText.trim() && activeFilterCount === 0 ? (
            <Link to="/purchases/$documentType/new" params={{ documentType: documentPathSegment }}>
              <Button type="primary" size="large" icon={<Plus size={18} />}>
                {t('purchaseDocuments.menu.new')}
              </Button>
            </Link>
          ) : undefined,
          loadMoreLabel: (remaining) => t('purchaseDocuments.mobile.loadMoreDocuments', { count: remaining }),
          getItemAriaLabel: (document) => t('purchaseDocuments.mobile.detailAria', { number: document.document_number }),
          getActionsAriaLabel: (document) => `${t('common.actions')} ${document.document_number}`,
          getActionSheetTitle: (document) => document.document_number,
          getActions: (document) => getDocumentActions(document, 'list-menu').map((action) => ({
            key: action.id,
            label: action.label,
            icon: action.icon,
            danger: action.group === 'danger',
            disabled: action.disabled,
            onSelect: () => action.run(),
          })),
          onItemClick: (document) => {
            void navigate({
              to: '/purchases/$documentType/$documentId',
              params: {
                documentType: getPurchaseDocumentTypePathSegment(document.type),
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
                  {t(purchaseDocumentStatusLabelKeys[document.status])}
                </Tag>
              </div>
              <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {document.supplier_name || '-'}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-gray-400">{formatDate(document.document_date)}</span>
                {hasPaymentStatus(document) && document.payment_status ? (
                  <Tag className="m-0">{t(purchaseInvoicePaymentStatusLabelKeys[document.payment_status])}</Tag>
                ) : null}
              </div>
              {document.type === 'PURCHASE_RECEIPT' ? (
                <div className="mt-2">
                  <Tag className="m-0" color={costStatusColor[document.cost_status ?? 'FINAL']}>
                    {costStatusLabel[document.cost_status ?? 'FINAL']}
                  </Tag>
                </div>
              ) : null}
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
              label: t('purchaseDocuments.menu.new'),
              onClick: () => {
                void navigate({ to: '/purchases/$documentType/new', params: { documentType: documentPathSegment } });
              },
            },
            {
              key: 'filter',
              icon: <SlidersHorizontal size={22} />,
              label: t('purchaseDocuments.mobile.filterTitle'),
              badge: { count: activeSearchAndFilterCount, color: '#fa8c16' },
              onClick: () => setIsFilterDrawerOpen(true),
            },
          ],
        }}
      />
    </>
  );
}
