import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { getPurchaseDocumentPermission } from '@/auth/documentPermissions';
import { useAuth } from '@/auth/useAuth';
import {
  getPurchaseDocumentConfig,
  getPurchaseDocumentTypePathSegment,
} from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import { setPurchaseDraftLines } from '@/store/purchaseDraftStore';
import type { Product } from '@/types';
import { buildPurchaseDraftLines } from '@/utils/purchaseDocuments/buildPurchaseDraftItems';
import { PURCHASE_DRAFT_TARGET_TYPES } from '@/utils/purchaseDocuments/purchaseDraftTargets';

export interface PurchaseFromProductsAction {
  key: string;
  label: string;
  onSelect: (products: Product[]) => void;
}

/**
 * Satu daftar opsi untuk dua tampilan: dropdown di desktop dan action sheet di
 * ponsel. Tipe yang tidak diizinkan langsung hilang dari daftarnya.
 */
export const usePurchaseFromProductsActions = (): PurchaseFromProductsAction[] => {
  const { t } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();

  return useMemo(() => PURCHASE_DRAFT_TARGET_TYPES
    .filter((type) => can(getPurchaseDocumentPermission(type)))
    .map((type) => ({
      key: type,
      label: t(getPurchaseDocumentConfig(type).titleKey),
      onSelect: (products: Product[]) => {
        setPurchaseDraftLines(buildPurchaseDraftLines(products));
        navigate({
          to: '/purchases/$documentType/new',
          params: { documentType: getPurchaseDocumentTypePathSegment(type) },
        });
      },
    })), [can, navigate, t]);
};
