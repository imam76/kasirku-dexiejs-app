import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import {
  calculateCashierSessionReconciliation,
  closeCashierSession,
  getOpenCashierSessionForCurrentUser,
  openCashierSession,
  type CloseCashierSessionInput,
  type OpenCashierSessionInput,
} from '@/services/cashierSessionService';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/auth/useAuth';

export const getCashierSessionActiveQueryKey = (userId?: string | null) => (
  ['cashierSession', 'active', userId ?? 'anonymous'] as const
);

const RELATED_QUERY_KEYS = [
  'cashierSession',
  'cashierSessions',
  'transactions-history',
  'posSalesReport',
  'transactionDetailReport',
];

export const useCashierSession = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const activeSessionQueryKey = getCashierSessionActiveQueryKey(currentUser?.id);

  const activeSessionQuery = useQuery({
    queryKey: activeSessionQueryKey,
    queryFn: () => getOpenCashierSessionForCurrentUser(currentUser!.id),
    enabled: Boolean(currentUser?.id),
  });

  const invalidate = () => {
    RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const openMutation = useMutation({
    mutationFn: (input: OpenCashierSessionInput) => openCashierSession(input),
    onSuccess: (session) => {
      queryClient.setQueryData(getCashierSessionActiveQueryKey(session.cashier_user_id), session);
      invalidate();
      message.success(t('cashierSession.openSuccess'));
    },
    onError: (error: Error) => {
      modal.error({
        title: t('cashierSession.openFailedTitle'),
        content: error.message,
      });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (input: CloseCashierSessionInput) => closeCashierSession(input),
    onSuccess: (session) => {
      queryClient.setQueryData(getCashierSessionActiveQueryKey(session.cashier_user_id), null);
      invalidate();
      if (session.balance_status === 'NON_BALANCED') {
        message.warning(t('cashierSession.closeNonBalancedSuccess'));
        return;
      }

      message.success(t('cashierSession.closeSuccess'));
    },
    onError: (error: Error) => {
      modal.error({
        title: t('cashierSession.closeFailedTitle'),
        content: error.message,
      });
    },
  });

  return {
    activeSession: activeSessionQuery.data,
    isLoadingActiveSession: activeSessionQuery.isLoading,
    refetchActiveSession: activeSessionQuery.refetch,
    openSession: openMutation.mutateAsync,
    isOpeningSession: openMutation.isPending,
    closeSession: closeMutation.mutateAsync,
    isClosingSession: closeMutation.isPending,
    calculateReconciliation: calculateCashierSessionReconciliation,
  };
};
