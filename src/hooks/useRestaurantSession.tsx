import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/hooks/useI18n';
import {
  calculateRestaurantSessionReconciliation,
  closeRestaurantSession,
  getOpenRestaurantSessionForCurrentUser,
  openRestaurantSession,
  type CloseRestaurantSessionInput,
  type OpenRestaurantSessionInput,
} from '@/services/restaurantSessionService';

export const getRestaurantSessionActiveQueryKey = (userId?: string | null) => (
  ['restaurantSession', 'active', userId ?? 'anonymous'] as const
);

export const useRestaurantSession = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { currentUser } = useAuth();
  const { t } = useI18n();
  const queryKey = getRestaurantSessionActiveQueryKey(currentUser?.id);

  const activeSessionQuery = useQuery({
    queryKey,
    queryFn: () => getOpenRestaurantSessionForCurrentUser(currentUser!.id),
    enabled: Boolean(currentUser?.id),
  });

  const invalidate = () => {
    ['restaurantSession', 'restaurantOrders', 'restaurantKitchenTickets', 'transactions-history']
      .forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  const openMutation = useMutation({
    mutationFn: (input: OpenRestaurantSessionInput) => openRestaurantSession(input),
    onSuccess: (session) => {
      queryClient.setQueryData(getRestaurantSessionActiveQueryKey(session.operator_user_id), session);
      invalidate();
      message.success(t('restaurantSession.openSuccess'));
    },
    onError: (error: Error) => {
      modal.error({ title: t('restaurantSession.openFailedTitle'), content: error.message });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (input: CloseRestaurantSessionInput) => closeRestaurantSession(input),
    onSuccess: (session) => {
      queryClient.setQueryData(getRestaurantSessionActiveQueryKey(session.operator_user_id), null);
      invalidate();
      message[session.balance_status === 'NON_BALANCED' ? 'warning' : 'success'](
        session.balance_status === 'NON_BALANCED'
          ? t('restaurantSession.closeNonBalancedSuccess')
          : t('restaurantSession.closeSuccess'),
      );
    },
    onError: (error: Error) => {
      modal.error({ title: t('restaurantSession.closeFailedTitle'), content: error.message });
    },
  });

  return {
    activeSession: activeSessionQuery.data,
    isLoadingActiveSession: activeSessionQuery.isLoading,
    openSession: openMutation.mutateAsync,
    isOpeningSession: openMutation.isPending,
    closeSession: closeMutation.mutateAsync,
    isClosingSession: closeMutation.isPending,
    calculateReconciliation: calculateRestaurantSessionReconciliation,
  };
};
