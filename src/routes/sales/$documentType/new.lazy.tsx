import { createLazyFileRoute } from '@tanstack/react-router';
import { Alert } from 'antd';
import { getSalesDocumentTypeFromPathSegment } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import SalesDocumentEditor from '@/view/sales/SalesDocumentEditor';

export const Route = createLazyFileRoute('/sales/$documentType/new')({
  component: NewSalesDocumentRoute,
});

function NewSalesDocumentRoute() {
  const { t } = useI18n();
  const { documentType } = Route.useParams();
  const resolvedDocumentType = getSalesDocumentTypeFromPathSegment(documentType);

  if (!resolvedDocumentType) {
    return <div className="p-6"><Alert type="error" title={t('salesDocuments.invalidType')} /></div>;
  }

  return <SalesDocumentEditor documentType={resolvedDocumentType} />;
}
