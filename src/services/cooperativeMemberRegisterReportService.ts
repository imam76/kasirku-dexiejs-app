import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { CooperativeMember, Employee } from '@/types';

export const COOPERATIVE_MEMBER_REGISTER_UNASSIGNED_OFFICER = '__UNASSIGNED__';

export interface CooperativeMemberRegisterReportFilters {
  startDate?: string;
  endDate?: string;
  officerId?: string;
}

export interface CooperativeMemberRegisterReportRow {
  id: string;
  join_date: string;
  code: string;
  name: string;
  address?: string;
}

export interface CooperativeMemberRegisterReportGroup {
  key: string;
  officer_id?: string;
  officer_name?: string;
  officer_position?: string;
  member_count: number;
  rows: CooperativeMemberRegisterReportRow[];
}

export interface CooperativeMemberRegisterOfficerOption {
  id: string;
  name: string;
  position?: string;
}

export interface CooperativeMemberRegisterReportData {
  groups: CooperativeMemberRegisterReportGroup[];
  officerOptions: CooperativeMemberRegisterOfficerOption[];
  total_member_count: number;
}

const getDateKey = (value: string) => dayjs(value).tz().format('YYYY-MM-DD');

const isDateKeyInRange = (value: string, startDate?: string, endDate?: string) => {
  const dateKey = getDateKey(value);
  const startKey = startDate ? getDateKey(startDate) : undefined;
  const endKey = endDate ? getDateKey(endDate) : undefined;

  return (!startKey || dateKey >= startKey) && (!endKey || dateKey <= endKey);
};

const compareText = (left?: string, right?: string) => (
  (left ?? '').localeCompare(right ?? '', undefined, { numeric: true })
);

const compareRows = (
  left: CooperativeMemberRegisterReportRow,
  right: CooperativeMemberRegisterReportRow,
) => {
  const dateCompare = getDateKey(left.join_date).localeCompare(getDateKey(right.join_date));
  if (dateCompare !== 0) return dateCompare;

  return compareText(left.code, right.code);
};

const getOfficerKey = (member: CooperativeMember) => (
  member.officer_id || COOPERATIVE_MEMBER_REGISTER_UNASSIGNED_OFFICER
);

const getOfficerOptionLabel = (option: CooperativeMemberRegisterOfficerOption) => (
  option.position ? `${option.name} - ${option.position}` : option.name
);

const buildOfficerOptions = (
  employees: Employee[],
  members: CooperativeMember[],
): CooperativeMemberRegisterOfficerOption[] => {
  const optionById = new Map<string, CooperativeMemberRegisterOfficerOption>();

  employees.forEach((employee) => {
    optionById.set(employee.id, {
      id: employee.id,
      name: employee.name,
      position: employee.position,
    });
  });

  members.forEach((member) => {
    if (!member.officer_id || optionById.has(member.officer_id)) return;
    if (!member.officer_name) return;

    optionById.set(member.officer_id, {
      id: member.officer_id,
      name: member.officer_name,
      position: member.officer_position,
    });
  });

  return Array.from(optionById.values())
    .sort((left, right) => compareText(getOfficerOptionLabel(left), getOfficerOptionLabel(right)));
};

export const getCooperativeMemberRegisterReportData = async (
  filters: CooperativeMemberRegisterReportFilters = {},
): Promise<CooperativeMemberRegisterReportData> => {
  const [members, employees] = await Promise.all([
    db.cooperativeMembers.orderBy('member_number').toArray(),
    db.employees.orderBy('name').toArray(),
  ]);

  const filteredMembers = members
    .filter((member) => isDateKeyInRange(member.join_date, filters.startDate, filters.endDate))
    .filter((member) => {
      if (!filters.officerId) return true;
      if (filters.officerId === COOPERATIVE_MEMBER_REGISTER_UNASSIGNED_OFFICER) {
        return !member.officer_id;
      }

      return member.officer_id === filters.officerId;
    });

  const groupByOfficer = new Map<string, CooperativeMemberRegisterReportGroup>();

  filteredMembers.forEach((member) => {
    const key = getOfficerKey(member);
    const current = groupByOfficer.get(key) ?? {
      key,
      officer_id: member.officer_id,
      officer_name: member.officer_name,
      officer_position: member.officer_position,
      member_count: 0,
      rows: [],
    };

    current.rows.push({
      id: member.id,
      join_date: member.join_date,
      code: member.member_number,
      name: member.name,
      address: member.address,
    });
    current.member_count += 1;
    groupByOfficer.set(key, current);
  });

  const groups = Array.from(groupByOfficer.values())
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(compareRows),
    }))
    .sort((left, right) => {
      if (!left.officer_id && right.officer_id) return 1;
      if (left.officer_id && !right.officer_id) return -1;

      return compareText(left.officer_name, right.officer_name);
    });

  return {
    groups,
    officerOptions: buildOfficerOptions(employees, members),
    total_member_count: filteredMembers.length,
  };
};
