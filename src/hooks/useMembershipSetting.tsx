import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMembershipSetting,
  saveMembershipSetting,
  type MembershipSettingInput,
} from '@/services/membershipService';

export const MEMBERSHIP_SETTING_QUERY_KEY = ['membershipSetting'];

export const useMembershipSetting = () => {
  const queryClient = useQueryClient();
  const settingQuery = useQuery({
    queryKey: MEMBERSHIP_SETTING_QUERY_KEY,
    queryFn: getMembershipSetting,
  });
  const saveMutation = useMutation({
    mutationFn: (input: MembershipSettingInput) => saveMembershipSetting(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBERSHIP_SETTING_QUERY_KEY });
    },
  });

  return {
    setting: settingQuery.data,
    isLoading: settingQuery.isLoading,
    isSaving: saveMutation.isPending,
    saveSetting: saveMutation.mutateAsync,
  };
};
