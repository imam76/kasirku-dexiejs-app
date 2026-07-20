import { useMemo, useState } from 'react';
import { Button, Card, Input, Table, Tag, Typography } from 'antd';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Eye,
  FileText,
  Plus,
  ReceiptText,
  RotateCcw,
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

const { Title, Text } = Typography;

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
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div>
        <Title level={2} style={{ margin: 0 }}>{t('salesDocuments.title')}</Title>
        <Text type="secondary">{t('salesDocuments.subtitle')}</Text>
      </div>

      <SalesDocumentMenuGrid />
    </div>
  );
}

export function SalesDocumentTypeManagement({ documentType }: { documentType: SalesDocumentType }) {
  const { t } = useI18n();
  const { documents } = useSalesDocuments();
  const [searchText, setSearchText] = useState('');
  const config = getSalesDocumentConfig(documentType);
  const menuItem = salesDocumentMenuItems.find((item) => item.type === documentType);
  const documentPathSegment = getSalesDocumentTypePathSegment(documentType);

  const filteredDocuments = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesType = document.type === documentType;
      const matchesSearch = !query || [
        document.document_number,
        document.customer_name,
        document.project_name,
        document.department_name,
      ].some((value) => value?.toLowerCase().includes(query));

      return matchesType && matchesSearch;
    });
  }, [documents, documentType, searchText]);

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
      title: '',
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

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <Title level={2} style={{ margin: 0 }}>
            {menuItem ? `${menuItem.code} - ${t(config.titleKey)}` : t(config.titleKey)}
          </Title>
          <Text type="secondary">{t('salesDocuments.typePageSubtitle', { type: t(config.titleKey) })}</Text>
        </div>
        <div className="flex flex-wrap gap-2">
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
      </div>

      <Card size="small">
        <Input
          allowClear
          placeholder={t('salesDocuments.searchPlaceholder')}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredDocuments}
        scroll={{ x: true }}
      />
    </div>
  );
}
