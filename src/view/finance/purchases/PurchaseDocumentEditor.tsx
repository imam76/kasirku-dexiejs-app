import { useEffect, useState } from 'react';
import { Alert, Spin, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { getPurchaseDocumentConfig, getPurchaseDocumentTypePathSegment } from '@/configs/purchase-document';
import { PurchaseDocumentForm } from '@/components/purchase-document/PurchaseDocumentForm';
import { useI18n } from '@/hooks/useI18n';
import { usePurchaseDocuments } from '@/hooks/usePurchaseDocuments';
import { db } from '@/lib/db';
import type { PurchaseDocument, PurchaseDocumentItem, PurchaseDocumentType } from '@/types';

const { Title, Text } = Typography;

interface PurchaseDocumentEditorProps {
  documentType: PurchaseDocumentType;
  documentId?: string;
}

export default function PurchaseDocumentEditor({ documentType, documentId }: PurchaseDocumentEditorProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    products,
    contacts,
    taxes,
    departments,
    projects,
    createDocument,
    updateDocument,
    isSubmitting,
  } = usePurchaseDocuments();
  const [document, setDocument] = useState<PurchaseDocument | undefined>();
  const [items, setItems] = useState<PurchaseDocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(documentId));
  const config = getPurchaseDocumentConfig(documentType);

  useEffect(() => {
    if (!documentId) return;
    const loadDocument = async () => {
      setIsLoading(true);
      const [loadedDocument, loadedItems] = await Promise.all([
        db.purchaseDocuments.get(documentId),
        db.purchaseDocumentItems.where('document_id').equals(documentId).toArray(),
      ]);
      setDocument(loadedDocument);
      setItems(loadedItems);
      setIsLoading(false);
    };

    loadDocument();
  }, [documentId]);

  if (isLoading) {
    return <div className="p-6"><Spin /></div>;
  }

  if (documentId && !document) {
    return <div className="p-6"><Alert type="error" title={t('purchaseDocuments.notFound')} /></div>;
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {document
            ? t('purchaseDocuments.editTitle', { number: document.document_number })
            : t('purchaseDocuments.newTitle', { type: t(config.titleKey) })}
        </Title>
        <Text type="secondary">{t('purchaseDocuments.editorSubtitle')}</Text>
      </div>
      <PurchaseDocumentForm
        config={config}
        initialData={{ document, items }}
        products={products}
        contacts={contacts}
        taxes={taxes}
        departments={departments}
        projects={projects}
        submitting={isSubmitting}
        onCancel={() => {
          if (!document) {
            navigate({
              to: '/finance/purchases/$documentType',
              params: { documentType: getPurchaseDocumentTypePathSegment(documentType) },
            });
            return;
          }

          navigate({
            to: '/finance/purchases/$documentType/$documentId',
            params: { documentType: getPurchaseDocumentTypePathSegment(document.type), documentId: document.id },
          });
        }}
        onSubmit={async (input) => {
          const result = document
            ? await updateDocument({ id: document.id, input })
            : await createDocument(input);
          navigate({
            to: '/finance/purchases/$documentType/$documentId',
            params: {
              documentType: getPurchaseDocumentTypePathSegment(result.document.type),
              documentId: result.document.id,
            },
          });
        }}
      />
    </div>
  );
}
