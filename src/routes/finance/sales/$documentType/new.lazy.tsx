import { createLazyFileRoute } from '@tanstack/react-router';
import { Alert } from 'antd';
import { salesDocumentConfigs } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import SalesDocumentEditor from '@/view/finance/sales/SalesDocumentEditor';
import type { SalesDocumentType } from '@/types';

export const Route = createLazyFileRoute('/finance/sales/$documentType/new')({
  component: NewSalesDocumentRoute,
});

function NewSalesDocumentRoute() {
  const { t } = useI18n();
  const { documentType } = Route.useParams();

  if (!(documentType in salesDocumentConfigs)) {
    return <div className="p-6"><Alert type="error" message={t('salesDocuments.invalidType')} /></div>;
  }

  return <SalesDocumentEditor documentType={documentType as SalesDocumentType} />;
}
