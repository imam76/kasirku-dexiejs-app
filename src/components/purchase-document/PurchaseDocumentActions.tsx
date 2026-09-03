/* eslint-disable react-refresh/only-export-components -- the action hook is intentionally paired with its button renderer. */
import { Button, Input, Modal, Typography } from 'antd';
import {
  AlertTriangle,
  ArrowRightLeft,
  Eye,
  FileCheck2,
  Pencil,
  Tags,
  Wrench,
} from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  getPurchaseDocumentTypePathSegment,
  PURCHASE_DOCUMENT_TYPE_OPTIONS,
} from '@/configs/purchase-document';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { usePurchaseDocuments } from '@/hooks/usePurchaseDocuments';
import type { PurchaseDocument } from '@/types';
import {
  getPurchaseDocumentActionsForSurface,
  type PurchaseDocumentActionId,
  type PurchaseDocumentActionSurface,
} from '@/utils/purchaseDocuments/actions';
import type { RecordAction } from '@/utils/recordActions';

const { Text } = Typography;

export interface PurchaseDocumentAction extends RecordAction {
  id: PurchaseDocumentActionId;
}

interface UsePurchaseDocumentActionsOptions {
  onDocumentChanged?: (document: PurchaseDocument) => void | Promise<void>;
}

/**
 * Menyatukan label, icon, handler, permission, dan aturan status action.
 * Surface hanya mengubah tempat action tampil, bukan aturan bisnisnya.
 */
export const usePurchaseDocumentActions = ({
  onDocumentChanged,
}: UsePurchaseDocumentActionsOptions = {}) => {
  const { t } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();
  const {
    issueDocument,
    voidDocument,
    convertDocument,
    correctDocument,
    isMutating,
  } = usePurchaseDocuments();

  const handleVoid = useCallback((document: PurchaseDocument) => {
    let voidReason = '';

    Modal.confirm({
      title: t('purchaseDocuments.voidConfirmTitle'),
      content: (
        <div className="space-y-3">
          <Text type="secondary">{t('purchaseDocuments.voidConfirmContent')}</Text>
          <Input.TextArea
            rows={3}
            placeholder={t('purchaseDocuments.voidReasonPlaceholder')}
            onChange={(event) => {
              voidReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('purchaseDocuments.void'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const normalizedReason = voidReason.trim();
        if (!normalizedReason) {
          throw new Error(t('purchaseDocuments.voidReasonRequired'));
        }

        await voidDocument({ id: document.id, reason: normalizedReason });
        await onDocumentChanged?.(document);
      },
    });
  }, [onDocumentChanged, t, voidDocument]);

  const handleCorrect = useCallback((document: PurchaseDocument) => {
    let correctReason = '';

    Modal.confirm({
      title: t('purchaseDocuments.correctConfirmTitle'),
      content: (
        <div className="space-y-3">
          <Text type="secondary">{t('purchaseDocuments.correctConfirmContent')}</Text>
          <Input.TextArea
            rows={3}
            placeholder={t('purchaseDocuments.correctReasonPlaceholder')}
            onChange={(event) => {
              correctReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('purchaseDocuments.correct'),
      onOk: async () => {
        const normalizedReason = correctReason.trim();
        if (!normalizedReason) {
          throw new Error(t('purchaseDocuments.correctReasonRequired'));
        }

        const result = await correctDocument({ id: document.id, reason: normalizedReason });
        await navigate({
          to: '/purchases/$documentType/$documentId/edit',
          params: {
            documentType: getPurchaseDocumentTypePathSegment(result.draftDocument.type),
            documentId: result.draftDocument.id,
          },
        });
      },
    });
  }, [correctDocument, navigate, t]);

  return useCallback((document: PurchaseDocument, surface: PurchaseDocumentActionSurface) => (
    getPurchaseDocumentActionsForSurface({ document, can }, surface).map((definition): PurchaseDocumentAction => {
      const isBusy = isMutating;

      switch (definition.id) {
        case 'view':
          return {
            ...definition,
            label: t('purchaseDocuments.detail'),
            icon: <Eye size={16} />,
            disabled: isBusy,
            run: () => navigate({
              to: '/purchases/$documentType/$documentId',
              params: {
                documentType: getPurchaseDocumentTypePathSegment(document.type),
                documentId: document.id,
              },
            }),
          };
        case 'edit':
          return {
            ...definition,
            label: t('purchaseDocuments.editDraft'),
            icon: <Pencil size={16} />,
            disabled: isBusy,
            run: () => navigate({
              to: '/purchases/$documentType/$documentId/edit',
              params: {
                documentType: getPurchaseDocumentTypePathSegment(document.type),
                documentId: document.id,
              },
            }),
          };
        case 'issue':
          return {
            ...definition,
            label: t('purchaseDocuments.issue'),
            icon: <FileCheck2 size={16} />,
            disabled: isBusy,
            run: async () => {
              await issueDocument(document.id);
              await onDocumentChanged?.(document);
            },
          };
        case 'reconcile-cost':
          return {
            ...definition,
            label: 'Rekonsiliasi HPP',
            icon: <FileCheck2 size={16} />,
            disabled: isBusy,
            run: () => navigate({
              to: '/purchases/$documentType/$documentId/reconcile',
              params: {
                documentType: getPurchaseDocumentTypePathSegment(document.type),
                documentId: document.id,
              },
            }),
          };
        case 'update-sell-prices':
          return {
            ...definition,
            label: 'Update Harga Jual',
            icon: <Tags size={16} />,
            disabled: isBusy,
            run: () => navigate({
              to: '/purchases/$documentType/$documentId/update-sell-prices',
              params: {
                documentType: getPurchaseDocumentTypePathSegment(document.type),
                documentId: document.id,
              },
            }),
          };
        case 'correct':
          return {
            ...definition,
            label: t('purchaseDocuments.correct'),
            icon: <Wrench size={16} />,
            disabled: isBusy,
            run: () => handleCorrect(document),
          };
        case 'void':
          return {
            ...definition,
            label: t('purchaseDocuments.void'),
            icon: <AlertTriangle size={16} />,
            disabled: isBusy,
            run: () => handleVoid(document),
          };
        default: {
          const targetType = definition.targetType;
          if (!targetType) {
            throw new Error(`Action ${definition.id} membutuhkan target document type.`);
          }

          return {
            ...definition,
            label: t('purchaseDocuments.convertTo', {
              type: t(PURCHASE_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === targetType)?.labelKey
                ?? 'purchaseDocuments.table.type'),
            }),
            icon: <ArrowRightLeft size={16} />,
            disabled: isBusy,
            run: async () => {
              const result = await convertDocument({ sourceId: document.id, targetType });
              await navigate({
                to: '/purchases/$documentType/$documentId',
                params: {
                  documentType: getPurchaseDocumentTypePathSegment(result.document.type),
                  documentId: result.document.id,
                },
              });
            },
          };
        }
      }
    })
  ), [can, convertDocument, handleCorrect, handleVoid, isMutating, issueDocument, navigate, onDocumentChanged, t]);
};

interface PurchaseDocumentActionButtonProps {
  action: PurchaseDocumentAction;
}

export function PurchaseDocumentActionButton({ action }: PurchaseDocumentActionButtonProps) {
  return (
    <Button
      type={action.id === 'issue' ? 'primary' : 'default'}
      danger={action.group === 'danger'}
      icon={action.icon}
      disabled={action.disabled}
      onClick={() => void action.run()}
      data-testid={`purchase-document-action-${action.id}`}
    >
      {action.label}
    </Button>
  );
}
