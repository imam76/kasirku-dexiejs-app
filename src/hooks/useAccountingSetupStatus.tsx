import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  getAccountingSetupLockSignals,
  type AccountingSetupLockSignalResult,
} from '@/services/accountingSetupLockService';
import type { AccountingInitialSetupSetting } from '@/types';

interface AccountingSetupStatus {
  setup?: AccountingInitialSetupSetting;
  lockSignals: AccountingSetupLockSignalResult;
}

const EMPTY_LOCK_SIGNALS: AccountingSetupLockSignalResult = {
  hasSignal: false,
  labels: [],
};

export const useAccountingSetupStatus = () => {
  const status = useLiveQuery(
    async (): Promise<AccountingSetupStatus> => {
      const [setup, lockSignals] = await Promise.all([
        db.accountingInitialSetupSetting.get('default'),
        getAccountingSetupLockSignals(),
      ]);

      return {
        setup,
        lockSignals,
      };
    },
    [],
  );

  const setup = status?.setup;

  return {
    setup,
    lockSignals: status?.lockSignals ?? EMPTY_LOCK_SIGNALS,
    isSetupComplete: Boolean(setup?.setup_completed_at),
    isLoading: status === undefined,
  };
};
