import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/auth/useAuth';
import { db } from '@/lib/db';

export interface CooperativeAreaScope {
  isScoped: boolean;
  areaIds: string[];
  employeeId?: string;
  employeeName?: string;
}

const unrestrictedScope: CooperativeAreaScope = {
  isScoped: false,
  areaIds: [],
};

export const useCooperativeAreaScope = () => {
  const { currentUser } = useAuth();
  const defaultScope: CooperativeAreaScope = currentUser?.role && currentUser.role !== 'OWNER'
    ? { isScoped: true, areaIds: [] }
    : unrestrictedScope;

  return useLiveQuery(
    async () => {
      if (!currentUser?.id || currentUser.role === 'OWNER') {
        return unrestrictedScope;
      }

      const employee = await db.employees
        .where('user_id')
        .equals(currentUser.id)
        .and((item) => item.is_active)
        .first();

      if (!employee) {
        return unrestrictedScope;
      }

      const assignments = await db.employeeAreas
        .where('employee_id')
        .equals(employee.id)
        .toArray();

      return {
        isScoped: true,
        areaIds: assignments.map((assignment) => assignment.area_id),
        employeeId: employee.id,
        employeeName: employee.name,
      };
    },
    [currentUser?.id, currentUser?.role],
    defaultScope,
  );
};
