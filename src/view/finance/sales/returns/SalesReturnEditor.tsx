import { useEffect, useState } from 'react';
import { Alert, Spin, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { SalesReturnForm } from '@/components/sales-return/SalesReturnForm';
import { useI18n } from '@/hooks/useI18n';
import { useSalesReturns } from '@/hooks/useSalesReturns';
import { db } from '@/lib/db';
import type { SalesReturn, SalesReturnItem, SalesReturnSourceType } from '@/types';

const { Title, Text } = Typography;

interface SalesReturnEditorProps {
  returnId?: string;
  sourceType?: SalesReturnSourceType;
  sourceId?: string;
}

export default function SalesReturnEditor({ returnId, sourceType, sourceId }: SalesReturnEditorProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    returnableSources,
    loadSource,
    createReturn,
    updateReturn,
    isSubmitting,
  } = useSalesReturns();
  const [salesReturn, setSalesReturn] = useState<SalesReturn | undefined>();
  const [items, setItems] = useState<SalesReturnItem[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(returnId));

  useEffect(() => {
    if (!returnId) return;

    const loadReturn = async () => {
      setIsLoading(true);
      const [loadedReturn, loadedItems] = await Promise.all([
        db.salesReturns.get(returnId),
        db.salesReturnItems.where('return_id').equals(returnId).toArray(),
      ]);
      setSalesReturn(loadedReturn);
      setItems(loadedItems);
      setIsLoading(false);
    };

    void loadReturn();
  }, [returnId]);

  if (isLoading) {
    return <div className="p-6"><Spin /></div>;
  }

  if (returnId && !salesReturn) {
    return <div className="p-6"><Alert type="error" title={t('salesReturns.notFound')} /></div>;
  }

  if (salesReturn && salesReturn.status !== 'DRAFT') {
    return <div className="p-6"><Alert type="warning" title={t('salesReturns.readOnly')} /></div>;
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {salesReturn
            ? t('salesReturns.editTitle', { number: salesReturn.return_number })
            : t('salesReturns.newTitle')}
        </Title>
        <Text type="secondary">{t('salesReturns.editorSubtitle')}</Text>
      </div>
      <SalesReturnForm
        initialData={{ salesReturn, items }}
        initialSourceType={sourceType}
        initialSourceId={sourceId}
        returnableSources={returnableSources}
        loadSource={loadSource}
        submitting={isSubmitting}
        onCancel={() => {
          if (salesReturn) {
            navigate({ to: '/sales/returns/$returnId', params: { returnId: salesReturn.id } });
            return;
          }

          navigate({ to: '/sales/returns' });
        }}
        onSubmit={async (input) => {
          const result = salesReturn
            ? await updateReturn({ id: salesReturn.id, input })
            : await createReturn(input);

          navigate({ to: '/sales/returns/$returnId', params: { returnId: result.salesReturn.id } });
        }}
      />
    </div>
  );
}
