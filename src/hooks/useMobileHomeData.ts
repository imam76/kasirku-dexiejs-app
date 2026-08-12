import { useLiveQuery } from 'dexie-react-hooks';
import { getMobileHomeData, type MobileHomeData } from '@/services/mobileHomeService';

type MobileHomeDataResult = {
  data?: MobileHomeData;
  error?: string;
  loadedAt?: string;
};

interface UseMobileHomeDataInput {
  date: string;
  enabled: boolean;
  refreshKey: number;
}

export const useMobileHomeData = ({
  date,
  enabled,
  refreshKey,
}: UseMobileHomeDataInput) => {
  const result = useLiveQuery(
    async (): Promise<MobileHomeDataResult> => {
      if (!enabled) return {};

      try {
        const data = await getMobileHomeData(date);

        return {
          data,
          loadedAt: new Date().toISOString(),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          loadedAt: new Date().toISOString(),
        };
      }
    },
    [date, enabled, refreshKey],
  );

  return {
    data: result?.data,
    error: result?.error,
    loadedAt: result?.loadedAt,
    isError: enabled && Boolean(result?.error),
    isLoading: enabled && result === undefined,
  };
};
