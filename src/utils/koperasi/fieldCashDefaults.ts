import type { ChartOfAccount, CooperativeMember, Employee } from '@/types';

type PaymentAccountRef = Pick<ChartOfAccount, 'id'>;
type MemberOfficerRef = Pick<CooperativeMember, 'officer_id'> | undefined;
type FieldCashEmployeeRef = Pick<Employee, 'id' | 'is_active' | 'field_cash_account_id'>;

const hasAvailablePaymentAccount = (
  cashAccountId: string | undefined,
  paymentAccounts: PaymentAccountRef[],
) => (
  Boolean(cashAccountId) &&
  (paymentAccounts.length === 0 || paymentAccounts.some((account) => account.id === cashAccountId))
);

export const getResponsibleFieldCashEmployee = (
  member: MemberOfficerRef,
  employees: FieldCashEmployeeRef[],
) => {
  if (!member?.officer_id) return undefined;

  return employees.find((employee) => (
    employee.id === member.officer_id &&
    employee.is_active &&
    Boolean(employee.field_cash_account_id)
  ));
};

export const getResponsibleFieldCashAccountId = (
  member: MemberOfficerRef,
  employees: FieldCashEmployeeRef[],
  paymentAccounts: PaymentAccountRef[],
) => {
  const cashAccountId = getResponsibleFieldCashEmployee(member, employees)?.field_cash_account_id;

  return hasAvailablePaymentAccount(cashAccountId, paymentAccounts)
    ? cashAccountId
    : undefined;
};

export const getResponsibleFieldCashAccountFields = (
  member: MemberOfficerRef,
  employees: FieldCashEmployeeRef[],
  paymentAccounts: PaymentAccountRef[],
) => {
  const cashAccountId = getResponsibleFieldCashAccountId(member, employees, paymentAccounts);

  return cashAccountId ? { cash_account_id: cashAccountId } : {};
};
