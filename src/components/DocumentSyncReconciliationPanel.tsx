import { useState } from 'react';
import { Alert, App, Button, Table, Tag } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useI18n } from '@/hooks/useI18n';
import { isTauriRuntime } from '@/services/postgresAdapter';
import { reconcileSalesPurchaseDocuments } from '@/services/documentSyncReconciliationService';
import { PURCHASE_DOCUMENT_QUERY_KEYS, SALES_DOCUMENT_QUERY_KEYS } from '@/services/realtimeSyncTableMap';
import { exportJson } from '@/utils/export';
import type { DocumentSyncEntity, DocumentSyncIssue } from '@/types/documentSync';

export function DocumentSyncReconciliationPanel() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [isChecking, setIsChecking] = useState(false);
  const [page, setPage] = useState(1);
  const check = useLiveQuery(() => db.documentSyncChecks.get('sales-purchase'));
  const openCount = useLiveQuery(() => db.documentSyncIssues.where('state').equals('open').count()) ?? 0;
  const issues = useLiveQuery(() => db.documentSyncIssues.where('state').equals('open')
    .offset((page - 1) * 10).limit(10).toArray(), [page]) ?? [];

  const handleCheck = async () => {
    setIsChecking(true);
    try {
      const result = await reconcileSalesPurchaseDocuments();
      const text = t('syncDb.documents.result', { checked: result.checked, repaired: result.repaired, issues: result.issues });
      if (result.issues > 0) message.warning(text);
      else message.success(text);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsChecking(false);
      [...PURCHASE_DOCUMENT_QUERY_KEYS, ...SALES_DOCUMENT_QUERY_KEYS].forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: [key] });
      });
    }
  };

  const handleExport = async () => {
    try {
      await exportJson({
        filename: `document-sync-${new Date().toISOString().slice(0, 10)}.json`,
        data: { check, records: await db.documentSyncIssues.toArray() },
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#141829]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('syncDb.documents.title')}</h2>
          <p className="max-w-3xl text-sm text-slate-500">{t('syncDb.documents.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExport} disabled={!check}>{t('syncDb.documents.export')}</Button>
          <Button onClick={handleCheck} loading={isChecking} disabled={!isTauriRuntime()}>
            {t('syncDb.documents.check')}
          </Button>
        </div>
      </div>
      {check && (
        <Alert showIcon type={check.status === 'failed' ? 'error' : openCount > 0 ? 'warning' : 'info'}
          message={t(`syncDb.documents.${check.status}`)}
          description={(
            <div>
              <div>{t('syncDb.documents.result', { checked: check.checked, repaired: check.repaired, issues: check.issues })}</div>
              <div>{new Date(check.completed_at ?? check.started_at).toLocaleString()}</div>
              {check.error && <div>{check.error}</div>}
            </div>
          )}
        />
      )}
      {openCount > 0 && (
        <>
          <p className="text-sm text-slate-500">{t('syncDb.documents.review')}</p>
          <Table<DocumentSyncIssue> rowKey="id" size="small" dataSource={issues} scroll={{ x: 620 }}
            pagination={{ current: page, pageSize: 10, total: openCount, onChange: setPage, showSizeChanger: false }}
            columns={[
              { title: t('syncDb.table.entity'), dataIndex: 'entity', render: (entity: DocumentSyncEntity) => t(`syncDb.documents.${entity}`) },
              { title: t('syncDb.documents.document'), dataIndex: 'document_number', render: (value: string, row) => (
                <div>{value}<div className="text-xs text-slate-500">{row.document_id}</div></div>
              ) },
              { title: t('syncDb.table.status'), dataIndex: 'kind', render: (kind: DocumentSyncIssue['kind']) => <Tag color="orange">{kind === 'repaired' ? t('syncDb.documents.completed') : t(`syncDb.documents.${kind}`)}</Tag> },
            ]}
          />
        </>
      )}
    </section>
  );
}
