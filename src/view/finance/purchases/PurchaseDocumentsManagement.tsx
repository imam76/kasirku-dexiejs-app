import { useMemo, useState } from 'react';
import { Button, Card, Input, Table, Tag, Typography } from 'antd';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, ClipboardList, Eye, FileQuestion, FileText, PackageCheck, Plus, ReceiptText, type LucideIcon } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import {
  getPurchaseDocumentConfig,
  getPurchaseDocumentTypePathSegment,
} from '@/configs/purchase-document';
import type { TranslationKey } from '@/i18n/messages';
import { useI18n } from '@/hooks/useI18n';
import { usePurchaseDocuments } from '@/hooks/usePurchaseDocuments';
import type { PurchaseDocument, PurchaseDocumentStatus, PurchaseDocumentType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { purchaseDocumentStatusLabelKeys, purchaseInvoicePaymentStatusLabelKeys } from '@/utils/purchaseDocuments/i18n';

const { Title, Text } = Typography;

const statusColor: Record<PurchaseDocumentStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'blue',
  CONVERTED: 'green',
  VOIDED: 'red',
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

export const purchaseDocumentMenuItems: PurchaseDocumentMenuItem[] = [
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
];

const hasPaymentStatus = (document: Pick<PurchaseDocument, 'type'>) => (
  getPurchaseDocumentConfig(document.type).behavior.hasPaymentStatus
);

const hasPricing = (document: Pick<PurchaseDocument, 'type'>) => (
  getPurchaseDocumentConfig(document.type).behavior.hasPricing
);

const getDocumentCountByType = (documents: PurchaseDocument[]) => (
  purchaseDocumentMenuItems.reduce((counts, item) => {
    counts[item.type] = documents.filter((document) => document.type === item.type).length;
    return counts;
  }, {} as Record<PurchaseDocumentType, number>)
);

function PurchaseDocumentMenuGrid({ documents }: { documents: PurchaseDocument[] }) {
  const { t } = useI18n();
  const documentCountByType = useMemo(() => getDocumentCountByType(documents), [documents]);

  return (
    <div className="grid grid-cols-2 gap-[10px] sm:gap-[14px] lg:grid-cols-5 lg:gap-[18px]">
      {purchaseDocumentMenuItems.map((item) => (
        <Link
          key={item.type}
          to="/finance/purchases/$documentType"
          params={{ documentType: getPurchaseDocumentTypePathSegment(item.type) }}
          className="
            relative flex min-h-[168px] flex-col items-center justify-center overflow-hidden
            rounded-[10px] border border-gray-100 bg-white p-3 text-center
            transition-all duration-200 ease-out
            hover:-translate-y-[1px] hover:border-gray-200 hover:shadow-[0_2px_12px_rgba(0,0,0,0.07)]
            sm:min-h-[188px] sm:rounded-[12px] sm:p-[18px]
            lg:h-[192px] lg:rounded-[14px] lg:p-[18px]
          "
        >
          <span className="absolute right-3 top-3 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium leading-[1.3] text-gray-500 sm:right-4 sm:top-4 sm:text-[11px]">
            {documentCountByType[item.type]} {t('purchaseDocuments.menu.documents')}
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
            <span>{t('purchaseDocuments.menu.open')}</span>
            <ArrowRight size={12} />
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function PurchaseDocumentsManagement() {
  const { t } = useI18n();
  const { documents } = usePurchaseDocuments();

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div>
        <Title level={2} style={{ margin: 0 }}>{t('purchaseDocuments.title')}</Title>
        <Text type="secondary">{t('purchaseDocuments.subtitle')}</Text>
      </div>

      <PurchaseDocumentMenuGrid documents={documents} />
    </div>
  );
}

export function PurchaseDocumentTypeManagement({ documentType }: { documentType: PurchaseDocumentType }) {
  const { t } = useI18n();
  const { documents } = usePurchaseDocuments();
  const [searchText, setSearchText] = useState('');
  const config = getPurchaseDocumentConfig(documentType);
  const menuItem = purchaseDocumentMenuItems.find((item) => item.type === documentType);
  const documentPathSegment = getPurchaseDocumentTypePathSegment(documentType);

  const filteredDocuments = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesType = document.type === documentType;
      const matchesSearch = !query || [
        document.document_number,
        document.supplier_name,
        document.project_name,
        document.department_name,
      ].some((value) => value?.toLowerCase().includes(query));

      return matchesType && matchesSearch;
    });
  }, [documents, documentType, searchText]);

  const showPaymentColumn = filteredDocuments.some(hasPaymentStatus) || config.behavior.hasPaymentStatus;
  const showTotalColumn = filteredDocuments.some(hasPricing) || config.behavior.hasPricing;

  const columns: ColumnsType<PurchaseDocument> = [
    {
      title: t('purchaseDocuments.table.documentNumber'),
      dataIndex: 'document_number',
      render: (value: string, record) => (
        <Link
          to="/finance/purchases/$documentType/$documentId"
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
    ...(showTotalColumn ? [{
      title: t('purchaseDocuments.table.total'),
      dataIndex: 'total_amount',
      align: 'right' as const,
      render: (value: number | undefined, record: PurchaseDocument) => (
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
          to="/finance/purchases/$documentType/$documentId"
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
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} style={{ margin: 0 }}>
            {menuItem ? `${menuItem.code} - ${t(config.titleKey)}` : t(config.titleKey)}
          </Title>
          <Text type="secondary">{t('purchaseDocuments.typePageSubtitle', { type: t(config.titleKey) })}</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/finance/purchases">
            <Button icon={<ArrowLeft size={16} />}>
              {t('purchaseDocuments.backToPurchasesMenu')}
            </Button>
          </Link>
          <Link
            to="/finance/purchases/$documentType/new"
            params={{ documentType: documentPathSegment }}
          >
            <Button type="primary" icon={<Plus size={16} />}>
              {t('purchaseDocuments.menu.new')}
            </Button>
          </Link>
        </div>
      </div>

      <Card size="small">
        <Input
          allowClear
          placeholder={t('purchaseDocuments.searchPlaceholder')}
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
