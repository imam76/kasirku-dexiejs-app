import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  archiveEmployee,
  createEmployee,
  restoreEmployee,
  updateEmployee,
  type EmployeeUpsertInput,
} from '@/services/employeeService';
import type {
  AuthUser,
  ChartOfAccount,
  CooperativeArea,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
  Role,
} from '@/types';

export type EmployeeStatusFilter = 'active' | 'inactive' | 'all';

export interface EmployeeWithAreas extends Employee {
  area_assignments: EmployeeArea[];
  area_names: string[];
  collection_schedules: EmployeeCollectionSchedule[];
}

export const useEmployees = () => {
  const queryClient = useQueryClient();
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithAreas | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmployeeStatusFilter>('active');

  const areas = useLiveQuery(
    () => db.cooperativeAreas.orderBy('name').toArray(),
    [],
    [] as CooperativeArea[],
  );
  const authUsers = useLiveQuery(
    () => db.authUsers.orderBy('name').toArray(),
    [],
    [] as AuthUser[],
  );
  const roles = useLiveQuery(
    () => db.roles.filter((role) => role.is_active).toArray(),
    [],
    [] as Role[],
  );
  const fieldCashAccounts = useLiveQuery(
    () => db.chartOfAccounts
      .where('type')
      .equals('ASSET')
      .filter((account) => account.is_active && account.is_postable)
      .toArray(),
    [],
    [] as ChartOfAccount[],
  );
  const employees = useLiveQuery(
    async () => {
      const [employeeRows, assignments, collectionSchedules] = await Promise.all([
        db.employees.orderBy('name').toArray(),
        db.employeeAreas.toArray(),
        db.employeeCollectionSchedules.toArray(),
      ]);
      const assignmentsByEmployee = assignments.reduce<Record<string, EmployeeArea[]>>((acc, assignment) => {
        acc[assignment.employee_id] = [...(acc[assignment.employee_id] ?? []), assignment];
        return acc;
      }, {});
      const schedulesByEmployee = collectionSchedules.reduce<Record<string, EmployeeCollectionSchedule[]>>(
        (acc, schedule) => {
          acc[schedule.employee_id] = [...(acc[schedule.employee_id] ?? []), schedule];
          return acc;
        },
        {},
      );

      return employeeRows.map<EmployeeWithAreas>((employee) => {
        const employeeAssignments = assignmentsByEmployee[employee.id] ?? [];

        return {
          ...employee,
          area_assignments: employeeAssignments,
          area_names: employeeAssignments.map((assignment) => assignment.area_name),
          collection_schedules: (schedulesByEmployee[employee.id] ?? []).sort((left, right) => {
            const areaCompare = left.area_name.localeCompare(right.area_name);
            if (areaCompare !== 0) return areaCompare;
            return left.weekday - right.weekday;
          }),
        };
      });
    },
    [],
    [] as EmployeeWithAreas[],
  );

  const filteredEmployees = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesSearch = !query || [
        employee.name,
        employee.phone,
        employee.email,
        employee.position,
        employee.user_name,
        ...employee.area_names,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? employee.is_active : !employee.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [employees, searchText, statusFilter]);

  const invalidateEmployees = () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
  };

  const createMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: invalidateEmployees,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: EmployeeUpsertInput }) => updateEmployee(id, input),
    onSuccess: invalidateEmployees,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveEmployee,
    onSuccess: invalidateEmployees,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreEmployee,
    onSuccess: invalidateEmployees,
  });

  const resetForm = () => setEditingEmployee(null);
  const handleEdit = (employee: EmployeeWithAreas) => setEditingEmployee(employee);
  const submitForm = async (input: EmployeeUpsertInput) => {
    if (editingEmployee) {
      return updateMutation.mutateAsync({ id: editingEmployee.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    areas,
    authUsers,
    roles,
    fieldCashAccounts,
    employees,
    filteredEmployees,
    editingEmployee,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveEmployee: archiveMutation.mutateAsync,
    restoreEmployee: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
};
