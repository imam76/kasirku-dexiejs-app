import type { Contact, Department, Project, Tax } from '@/types';

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

export const createTaxFieldsSnapshot = (tax?: Tax) => {
  if (!tax) return {};

  return {
    tax_id: tax.id,
    tax_name: tax.name,
    tax_code: tax.code,
    tax_rate: tax.rate,
    tax_calculation_mode: tax.calculation_mode,
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
