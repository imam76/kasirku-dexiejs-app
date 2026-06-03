import { createFileRoute } from '@tanstack/react-router';
import { Alert } from 'antd';
import { getPurchaseDocumentTypeFromPathSegment } from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import { PurchaseDocumentTypeManagement } from '@/view/finance/purchases/PurchaseDocumentsManagement';

export const Route = createFileRoute('/purchases/$documentType/')({
  component: PurchaseDocumentTypeRoute,
});

function PurchaseDocumentTypeRoute() {
  const { t } = useI18n();
  const { documentType } = Route.useParams();
  const resolvedDocumentType = getPurchaseDocumentTypeFromPathSegment(documentType);

  if (!resolvedDocumentType) {
    return <div className="p-6"><Alert type="error" title={t('purchaseDocuments.invalidType')} /></div>;
  }

  return <PurchaseDocumentTypeManagement documentType={resolvedDocumentType} />;
}
