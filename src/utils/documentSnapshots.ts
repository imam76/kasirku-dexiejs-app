import type { Contact, Department, Project, Tax, Warehouse } from '@/types';

export const createContactFieldsSnapshot = (contact?: Contact) => {
  if (!contact) return {};

  return {
    contact_id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    address: contact.address,
    company_name: contact.company_name,
    tax_number: contact.tax_number,
  };
};

export const createTaxFieldsSnapshot = (tax?: Tax, context?: 'sales' | 'purchase') => {
  if (!tax) return {};

  const account = context === 'sales'
    ? {
      id: tax.sales_tax_account_id,
      code: tax.sales_tax_account_code,
      name: tax.sales_tax_account_name,
      type: tax.sales_tax_account_type,
    }
    : context === 'purchase'
      ? {
        id: tax.purchase_tax_account_id,
        code: tax.purchase_tax_account_code,
        name: tax.purchase_tax_account_name,
        type: tax.purchase_tax_account_type,
      }
      : undefined;

  return {
    tax_id: tax.id,
    tax_name: tax.name,
    tax_code: tax.code,
    tax_rate: tax.rate,
    tax_calculation_mode: tax.calculation_mode,
    tax_flow: tax.tax_flow ?? 'ADDITIVE',
    tax_account_id: account?.id,
    tax_account_code: account?.code,
    tax_account_name: account?.name,
    tax_account_type: account?.type,
  };
};

export const createDepartmentFieldsSnapshot = (department?: Department) => {
  if (!department) return {};

  return {
    department_id: department.id,
    department_code: department.code,
    department_name: department.name,
  };
};

export const createProjectFieldsSnapshot = (project?: Project) => {
  if (!project) return {};

  return {
    project_id: project.id,
    project_code: project.code,
    project_name: project.name,
  };
};

export const createWarehouseFieldsSnapshot = (warehouse?: Warehouse) => {
  if (!warehouse) return {};

  return {
    warehouse_id: warehouse.id,
    warehouse_code: warehouse.code,
    warehouse_name: warehouse.name,
  };
};
