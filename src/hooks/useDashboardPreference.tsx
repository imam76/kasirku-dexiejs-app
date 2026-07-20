import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDashboardPreference,
  resetDashboardPreference,
  saveDashboardPreference,
} from '@/services/dashboardPreferenceService';
import type { DashboardPreference } from '@/types';

export const useDashboardPreference = (userId?: string) => {
  const queryClient = useQueryClient();
  const queryKey = ['dashboardPreference', userId];
  const preferenceQuery = useQuery({
    queryKey,
    queryFn: () => {
      if (!userId) {
        throw new Error('User belum tersedia.');
      }
      return getDashboardPreference(userId);
    },
    enabled: Boolean(userId),
  });

  const saveMutation = useMutation({
    mutationFn: (preference: DashboardPreference) => {
      if (!userId) {
        throw new Error('User belum tersedia.');
      }
      return saveDashboardPreference(userId, preference);
    },
    onSuccess: (preference) => {
      queryClient.setQueryData(queryKey, preference);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => {
      if (!userId) {
        throw new Error('User belum tersedia.');
      }
      return resetDashboardPreference(userId);
    },
    onSuccess: (preference) => {
      queryClient.setQueryData(queryKey, preference);
    },
  });

  return {
    preference: preferenceQuery.data,
    isLoading: preferenceQuery.isLoading,
    isSaving: saveMutation.isPending,
    isResetting: resetMutation.isPending,
    savePreference: saveMutation.mutateAsync,
    resetPreference: resetMutation.mutateAsync,
  };
};
