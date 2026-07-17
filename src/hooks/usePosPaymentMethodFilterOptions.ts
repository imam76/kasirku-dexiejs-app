import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { buildPosPaymentMethodFilterOptions } from '@/utils/posPaymentMethodFilter';

export const usePosPaymentMethodFilterOptions = () => {
  const methods = useLiveQuery(() => db.paymentMethods.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const payments = useLiveQuery(() => db.posTransactionPayments.toArray());

  const options = useMemo(() => buildPosPaymentMethodFilterOptions(
    methods ?? [],
    transactions ?? [],
    payments ?? [],
  ), [methods, payments, transactions]);

  return {
    options,
    isLoading: methods === undefined || transactions === undefined || payments === undefined,
  };
};
