import { createLazyFileRoute } from '@tanstack/react-router';
import { Alert } from 'antd';
import { salesDocumentConfigs } from '@/configs/sales-document';
import SalesDocumentEditor from '@/view/finance/sales/SalesDocumentEditor';
import type { SalesDocumentType } from '@/types';

export const Route = createLazyFileRoute('/finance/sales/$documentType/$documentId_/edit')({
  component: EditSalesDocumentRoute,
});

function EditSalesDocumentRoute() {
  const { documentType, documentId } = Route.useParams();

  if (!(documentType in salesDocumentConfigs)) {
    return <div className="p-6"><Alert type="error" message="Tipe dokumen tidak valid." /></div>;
  }

  return <SalesDocumentEditor documentType={documentType as SalesDocumentType} documentId={documentId} />;
}
