import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCompanyProfileSetting,
  saveCompanyProfileSetting,
  type CompanyProfileSettingInput,
} from '@/services/companyProfileSettingService';

const COMPANY_PROFILE_SETTING_QUERY_KEY = ['companyProfileSetting'];

export const useCompanyProfileSetting = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: COMPANY_PROFILE_SETTING_QUERY_KEY,
    queryFn: getCompanyProfileSetting,
  });

  const saveMutation = useMutation({
    mutationFn: (input: CompanyProfileSettingInput) => saveCompanyProfileSetting(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(COMPANY_PROFILE_SETTING_QUERY_KEY, profile);
    },
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    saveProfile: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
};
