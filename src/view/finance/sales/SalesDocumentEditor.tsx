import { useEffect, useState } from 'react';
import { Alert, Spin, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { getSalesDocumentConfig } from '@/configs/sales-document';
import { SalesDocumentForm } from '@/components/sales-document/SalesDocumentForm';
import { useSalesDocuments } from '@/hooks/useSalesDocuments';
import { db } from '@/lib/db';
import type { SalesDocument, SalesDocumentItem, SalesDocumentType } from '@/types';

const { Title, Text } = Typography;

interface SalesDocumentEditorProps {
  documentType: SalesDocumentType;
  documentId?: string;
}

export default function SalesDocumentEditor({ documentType, documentId }: SalesDocumentEditorProps) {
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
  } = useSalesDocuments();
  const [document, setDocument] = useState<SalesDocument | undefined>();
  const [items, setItems] = useState<SalesDocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(documentId));
  const config = getSalesDocumentConfig(documentType);

  useEffect(() => {
    if (!documentId) return;
    const loadDocument = async () => {
      setIsLoading(true);
      const [loadedDocument, loadedItems] = await Promise.all([
        db.salesDocuments.get(documentId),
        db.salesDocumentItems.where('document_id').equals(documentId).toArray(),
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
    return <div className="p-6"><Alert type="error" message="Dokumen tidak ditemukan." /></div>;
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div>
        <Title level={2} style={{ margin: 0 }}>{document ? `Edit ${document.document_number}` : `New ${config.title}`}</Title>
        <Text type="secondary">Simpan sebagai draft dulu, lalu terbitkan dari halaman detail.</Text>
      </div>
      <SalesDocumentForm
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
            navigate({ to: '/finance/sales' });
            return;
          }

          navigate({
            to: '/finance/sales/$documentType/$documentId',
            params: { documentType: document.type, documentId: document.id },
          });
        }}
        onSubmit={async (input) => {
          const result = document
            ? await updateDocument({ id: document.id, input })
            : await createDocument(input);
          navigate({
            to: '/finance/sales/$documentType/$documentId',
            params: { documentType: result.document.type, documentId: result.document.id },
          });
        }}
      />
    </div>
  );
}
