import { createLazyFileRoute } from '@tanstack/react-router';
import { Alert } from 'antd';
import { getPurchaseDocumentTypeFromPathSegment } from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import PurchaseDocumentEditor from '@/view/purchases/PurchaseDocumentEditor';

export const Route = createLazyFileRoute('/finance/purchases/$documentType/$documentId_/edit')({
  component: EditPurchaseDocumentRoute,
});

function EditPurchaseDocumentRoute() {
  const { t } = useI18n();
  const { documentType, documentId } = Route.useParams();
  const resolvedDocumentType = getPurchaseDocumentTypeFromPathSegment(documentType);

  if (!resolvedDocumentType) {
    return <div className="p-6"><Alert type="error" title={t('purchaseDocuments.invalidType')} /></div>;
  }

  return <PurchaseDocumentEditor documentType={resolvedDocumentType} documentId={documentId} />;
}
