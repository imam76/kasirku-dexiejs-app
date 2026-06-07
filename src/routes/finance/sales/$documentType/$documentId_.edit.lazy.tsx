import { createLazyFileRoute } from '@tanstack/react-router';
import { Alert } from 'antd';
import { getSalesDocumentTypeFromPathSegment } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import SalesDocumentEditor from '@/view/sales/SalesDocumentEditor';

export const Route = createLazyFileRoute('/finance/sales/$documentType/$documentId_/edit')({
  component: EditSalesDocumentRoute,
});

function EditSalesDocumentRoute() {
  const { t } = useI18n();
  const { documentType, documentId } = Route.useParams();
  const resolvedDocumentType = getSalesDocumentTypeFromPathSegment(documentType);

  if (!resolvedDocumentType) {
    return <div className="p-6"><Alert type="error" title={t('salesDocuments.invalidType')} /></div>;
  }

  return <SalesDocumentEditor documentType={resolvedDocumentType} documentId={documentId} />;
}
