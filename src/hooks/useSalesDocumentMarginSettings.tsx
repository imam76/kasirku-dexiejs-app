import { useCallback, useState } from 'react';
import type { SalesDocumentMarginBasis } from '@/types';

export const DEFAULT_SALES_DOCUMENT_MARGIN_BASIS: SalesDocumentMarginBasis = 'BEFORE_TAX';

const SALES_DOCUMENT_MARGIN_BASIS_STORAGE_KEY = 'salesDocumentMarginBasis';

const isSalesDocumentMarginBasis = (value: string | null): value is SalesDocumentMarginBasis => (
  value === 'BEFORE_TAX' || value === 'AFTER_TAX'
);

const getStoredMarginBasis = (): SalesDocumentMarginBasis => {
  if (typeof window === 'undefined') return DEFAULT_SALES_DOCUMENT_MARGIN_BASIS;

  const storedValue = window.localStorage.getItem(SALES_DOCUMENT_MARGIN_BASIS_STORAGE_KEY);
  return isSalesDocumentMarginBasis(storedValue) ? storedValue : DEFAULT_SALES_DOCUMENT_MARGIN_BASIS;
};

export const useSalesDocumentMarginSettings = () => {
  const [marginBasis, setMarginBasisState] = useState<SalesDocumentMarginBasis>(getStoredMarginBasis);

  const setMarginBasis = useCallback((nextBasis: SalesDocumentMarginBasis) => {
    setMarginBasisState(nextBasis);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SALES_DOCUMENT_MARGIN_BASIS_STORAGE_KEY, nextBasis);
    }
  }, []);

  return {
    marginBasis,
    setMarginBasis,
    isBeforeTax: marginBasis === 'BEFORE_TAX',
    isAfterTax: marginBasis === 'AFTER_TAX',
  };
};
