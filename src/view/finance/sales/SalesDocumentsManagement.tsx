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
import { formatCurrency, formatDate } from '@/utils/formatters';
import { salesDocumentStatusLabelKeys, salesInvoicePaymentStatusLabelKeys } from '@/utils/salesDocuments/i18n';

const { Title, Text } = Typography;

const statusColor: Record<SalesDocumentStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'blue',
  CONVERTED: 'green',
  VOIDED: 'red',
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

const getDocumentCountByType = (documents: SalesDocument[]) => (
  salesDocumentMenuItems.reduce((counts, item) => {
    counts[item.type] = documents.filter((document) => document.type === item.type).length;
    return counts;
  }, {} as Record<SalesDocumentType, number>)
);

function SalesDocumentMenuGrid({ documents }: { documents: SalesDocument[] }) {
  const { t } = useI18n();
  const documentCountByType = useMemo(() => getDocumentCountByType(documents), [documents]);

  return (
    <div className="grid grid-cols-2 gap-[10px] sm:gap-[14px] lg:grid-cols-4 lg:gap-[22px]">
      {salesDocumentMenuItems.map((item) => (
        <Link
          key={item.type}
          to="/finance/sales/$documentType"
          params={{ documentType: getSalesDocumentTypePathSegment(item.type) }}
          className="
            relative flex min-h-[168px] flex-col items-center justify-center overflow-hidden
            rounded-[10px] border border-gray-100 bg-white p-3 text-center
            transition-all duration-200 ease-out
            hover:-translate-y-[1px] hover:border-gray-200 hover:shadow-[0_2px_12px_rgba(0,0,0,0.07)]
            sm:min-h-[188px] sm:rounded-[12px] sm:p-[18px]
            lg:h-[192px] lg:rounded-[14px] lg:p-[22px]
          "
        >
          <span className="absolute right-3 top-3 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium leading-[1.3] text-gray-500 sm:right-4 sm:top-4 sm:text-[11px]">
            {documentCountByType[item.type]} {t('salesDocuments.menu.documents')}
          </span>

          <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-[10px] ${item.iconBackground} sm:h-11 sm:w-11 lg:h-12 lg:w-12`}>
            <item.icon className={`${item.color} h-5 w-5 sm:h-6 sm:w-6`} />
          </div>

          <div className={`text-[28px] font-semibold leading-none ${item.color} sm:text-[34px] lg:text-[38px]`}>
            {item.code}
          </div>

          <h2 className="mt-2 text-[12px] font-medium leading-[1.3] text-gray-800 sm:text-[14px] lg:text-[15px]">
            {t(item.labelKey)}
          </h2>

          <p className="mt-1 hidden text-[11px] leading-[1.55] text-gray-400 sm:line-clamp-2 sm:block lg:text-[12px]">
            {t(item.descKey)}
          </p>

          <div className="mt-2 flex items-center gap-1 text-[11px] font-medium leading-none text-gray-400 sm:mt-3">
            <span>{t('salesDocuments.menu.open')}</span>
            <ArrowRight size={12} />
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function SalesDocumentsManagement() {
  const { t } = useI18n();
  const { documents } = useSalesDocuments();

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div>
        <Title level={2} style={{ margin: 0 }}>{t('salesDocuments.title')}</Title>
        <Text type="secondary">{t('salesDocuments.subtitle')}</Text>
      </div>

      <SalesDocumentMenuGrid documents={documents} />
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
          to="/finance/sales/$documentType/$documentId"
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
        hasPricing(record) && value !== undefined ? `Rp ${formatCurrency(value)}` : '-'
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
          to="/finance/sales/$documentType/$documentId"
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
          <Link to="/finance/sales">
            <Button icon={<ArrowLeft size={16} />}>
              {t('salesDocuments.backToSalesMenu')}
            </Button>
          </Link>
          <Link
            to="/finance/sales/$documentType/new"
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
