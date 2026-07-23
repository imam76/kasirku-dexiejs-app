import { useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select, Table, Tag, Typography } from 'antd';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, ClipboardList, CreditCard, Eye, FileCheck2, FileQuestion, FileText, PackageCheck, Plus, ReceiptText, RotateCcw, type LucideIcon } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import {
  getPurchaseDocumentConfig,
  getPurchaseDocumentTypePathSegment,
} from '@/configs/purchase-document';
import type { TranslationKey } from '@/i18n/messages';
import { useI18n } from '@/hooks/useI18n';
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
import ManagementListCard from '@/components/ManagementListCard';
import dayjs from '@/lib/dayjs';

const { Title, Text } = Typography;

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

function PurchaseDocumentMenuGrid() {
  const { t } = useI18n();
  const { currentUser, currentRole, permissionSet } = useAuth();
  const visibleMenuItems = purchaseDocumentMenuItems.filter((item) => canAccessPath(
    currentUser ?? undefined,
    `/purchases/${getPurchaseDocumentTypePathSegment(item.type)}`,
    { currentRole, permissionSet },
  ));

  return (
    <div className="app-menu-grid">
      {visibleMenuItems.map((item) => (
        <Link
          key={item.type}
          to="/purchases/$documentType"
          params={{ documentType: getPurchaseDocumentTypePathSegment(item.type) }}
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
              <span>{t('purchaseDocuments.menu.open')}</span>
              <ArrowRight size={12} />
            </div>
          </div>
          <div className="app-menu-card__detail flex-col text-center">
            <p className="text-[12px] leading-[1.55] text-gray-500">
              {t(item.descKey)}
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

function PurchaseFinanceActionGrid() {
  const { t } = useI18n();
  const { currentUser, currentRole, permissionSet } = useAuth();
  const canAccess = (path: string) => canAccessPath(
    currentUser ?? undefined,
    path,
    { currentRole, permissionSet },
  );
  const canAccessPendingCosts = canAccess('/purchases/pending-costs');
  const canAccessPayables = canAccess('/finance/payables');

  return (
    <div className="app-menu-grid">
      {canAccessPendingCosts && <Link
        to="/purchases/pending-costs"
        className="app-menu-card"
      >
        <span className="app-menu-card__body flex flex-col items-center justify-center">
          <span className="app-menu-card__icon bg-amber-50">
            <FileCheck2 className="app-menu-card__icon-svg text-amber-700" />
          </span>
          <span className="app-menu-card__title">Harga Belum Final</span>
          <span className="app-menu-card__brief mt-1 line-clamp-2 text-center text-[10px] leading-[1.45] text-gray-400 sm:text-[11px] sm:leading-[1.55] lg:hidden">
            Daftar Purchase Receipt dengan HPP sementara.
          </span>
          <span className="mt-2 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400 sm:mt-3">
            <span>{t('purchaseDocuments.menu.open')}</span>
            <ArrowRight size={12} />
          </span>
        </span>
        <span className="app-menu-card__detail flex-col text-center">
          <span className="text-xs leading-5 text-gray-500">Daftar Purchase Receipt dengan HPP sementara.</span>
          <span className="mt-3 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400">
            <span>{t('purchaseDocuments.menu.open')}</span>
            <ArrowRight size={12} />
          </span>
        </span>
      </Link>}
      {canAccessPayables && <Link
        to="/finance/payables"
        className="app-menu-card"
      >
        <span className="app-menu-card__body flex flex-col items-center justify-center">
          <span className="app-menu-card__icon bg-emerald-50">
            <CreditCard className="app-menu-card__icon-svg text-emerald-700" />
          </span>
          <span className="app-menu-card__title">{t('accountsPayable.title')}</span>
          <span className="app-menu-card__brief mt-1 line-clamp-2 text-center text-[10px] leading-[1.45] text-gray-400 sm:text-[11px] sm:leading-[1.55] lg:hidden">
            {t('accountsPayable.shortDesc')}
          </span>
          <span className="mt-2 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400 sm:mt-3">
            <span>{t('purchaseDocuments.menu.open')}</span>
            <ArrowRight size={12} />
          </span>
        </span>
        <span className="app-menu-card__detail flex-col text-center">
          <span className="text-xs leading-5 text-gray-500">{t('accountsPayable.shortDesc')}</span>
          <span className="mt-3 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400">
            <span>{t('purchaseDocuments.menu.open')}</span>
            <ArrowRight size={12} />
          </span>
        </span>
      </Link>}
    </div>
  );
}

export default function PurchaseDocumentsManagement() {
  const { t } = useI18n();

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div>
        <Title level={2} style={{ margin: 0 }}>{t('purchaseDocuments.title')}</Title>
        <Text type="secondary">{t('purchaseDocuments.subtitle')}</Text>
      </div>

      <PurchaseDocumentMenuGrid />
      <PurchaseFinanceActionGrid />
    </div>
  );
}

export function PurchaseDocumentTypeManagement({ documentType }: { documentType: PurchaseDocumentType }) {
  const { t } = useI18n();
  const { documents } = usePurchaseDocuments();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<PurchaseDocumentStatus | 'ALL'>('ALL');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const config = getPurchaseDocumentConfig(documentType);
  const menuItem = purchaseDocumentMenuItems.find((item) => item.type === documentType);
  const documentPathSegment = getPurchaseDocumentTypePathSegment(documentType);

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
      width: 110,
      render: (_, record) => (
        <Link
          to="/purchases/$documentType/$documentId"
          params={{ documentType: getPurchaseDocumentTypePathSegment(record.type), documentId: record.id }}
        >
          <Button size="small" icon={<Eye size={14} />}>
            {t('purchaseDocuments.detail')}
          </Button>
        </Link>
      ),
    },
  ];

  return (
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
            options={[
              { value: 'ALL', label: t('common.allStatuses') },
              { value: 'DRAFT', label: t(purchaseDocumentStatusLabelKeys.DRAFT) },
              { value: 'ISSUED', label: t(purchaseDocumentStatusLabelKeys.ISSUED) },
              { value: 'CONVERTED', label: t(purchaseDocumentStatusLabelKeys.CONVERTED) },
              { value: 'VOIDED', label: t(purchaseDocumentStatusLabelKeys.VOIDED) },
            ]}
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
            onClick={() => {
              setSearchText('');
              setStatusFilter('ALL');
              setDateRange(null);
            }}
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
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />
    </ManagementListCard>
  );
}
