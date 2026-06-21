import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { isReportDateInRange } from '@/hooks/useReports';
import type { CashierSession } from '@/types';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';

export interface DepositReportData {
  sessions: CashierSession[];
  totalDeposit: number;
  uniqueCashiers: Array<{ id: string; name: string }>;
}

export const useDepositReport = (
  startDate?: string,
  endDate?: string,
  cashierUserId?: string
) => {
  return useQuery({
    queryKey: ['depositReport', startDate, endDate, cashierUserId],
    queryFn: async (): Promise<DepositReportData> => {
      await requireUserPermission(await getCurrentSessionUser(), 'REPORT_DEPOSIT_VIEW');
      // 1. Get all closed cashier sessions
      let sessions = await db.cashierSessions
        .where('status')
        .equals('CLOSED')
        .toArray();

      // Sort sessions descending by closed_at (or created_at if closed_at is missing)
      sessions.sort((a, b) => {
        const dateA = a.closed_at || a.created_at;
        const dateB = b.closed_at || b.created_at;
        return dateB.localeCompare(dateA);
      });

      // 2. Fetch unique list of cashiers from ALL closed sessions for filter dropdown options
      const cashierMap = new Map<string, string>();
      sessions.forEach(s => {
        if (s.cashier_user_id && s.cashier_user_name) {
          cashierMap.set(s.cashier_user_id, s.cashier_user_name);
        }
      });
      const uniqueCashiers = Array.from(cashierMap.entries()).map(([id, name]) => ({
        id,
        name
      }));

      // 3. Filter sessions by date range using isReportDateInRange
      sessions = sessions.filter(s => {
        const dateToUse = s.closed_at || s.created_at;
        return isReportDateInRange(dateToUse, startDate, endDate);
      });

      // 4. Filter sessions by cashierUserId if specific cashier is selected (not 'SEMUA')
      if (cashierUserId && cashierUserId !== 'SEMUA') {
        sessions = sessions.filter(s => s.cashier_user_id === cashierUserId);
      }

      // 5. Calculate total deposits (sum of closing_cash_amount)
      const totalDeposit = sessions.reduce((sum, s) => sum + (s.closing_cash_amount || 0), 0);

      return {
        sessions,
        totalDeposit,
        uniqueCashiers
      };
    }
  });
};
