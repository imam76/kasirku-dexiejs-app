import { createLazyFileRoute } from '@tanstack/react-router';
import { Alert } from 'antd';
import { getPurchaseDocumentTypeFromPathSegment } from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import PurchaseDocumentEditor from '@/view/finance/purchases/PurchaseDocumentEditor';

export const Route = createLazyFileRoute('/purchases/$documentType/new')({
  component: NewPurchaseDocumentRoute,
});

function NewPurchaseDocumentRoute() {
  const { t } = useI18n();
  const { documentType } = Route.useParams();
  const resolvedDocumentType = getPurchaseDocumentTypeFromPathSegment(documentType);

  if (!resolvedDocumentType) {
    return <div className="p-6"><Alert type="error" title={t('purchaseDocuments.invalidType')} /></div>;
  }

  return <PurchaseDocumentEditor documentType={resolvedDocumentType} />;
}
