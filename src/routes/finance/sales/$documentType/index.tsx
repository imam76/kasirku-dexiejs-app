import { createFileRoute } from '@tanstack/react-router';
import { Alert } from 'antd';
import { getSalesDocumentTypeFromPathSegment } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { SalesDocumentTypeManagement } from '@/view/finance/sales/SalesDocumentsManagement';

export const Route = createFileRoute('/finance/sales/$documentType/')({
  component: SalesDocumentTypeRoute,
});

function SalesDocumentTypeRoute() {
  const { t } = useI18n();
  const { documentType } = Route.useParams();
  const resolvedDocumentType = getSalesDocumentTypeFromPathSegment(documentType);

  if (!resolvedDocumentType) {
    return <div className="p-6"><Alert type="error" message={t('salesDocuments.invalidType')} /></div>;
  }

  return <SalesDocumentTypeManagement documentType={resolvedDocumentType} />;
}
