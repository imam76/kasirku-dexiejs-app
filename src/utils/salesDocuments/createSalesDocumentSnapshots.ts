import type { Contact, Department, Project, SalesDocument, Tax } from '@/types';

export const createContactSnapshot = (contact?: Contact): Partial<SalesDocument> => {
  if (!contact) return {};

  return {
    contact_id: contact.id,
    customer_name: contact.name,
    customer_phone: contact.phone,
    customer_email: contact.email,
    customer_address: contact.address,
    customer_company_name: contact.company_name,
    customer_tax_number: contact.tax_number,
  };
};

export const createTaxSnapshot = (tax?: Tax): Partial<SalesDocument> => {
  if (!tax) return {};

  return {
    tax_id: tax.id,
    tax_name: tax.name,
    tax_code: tax.code,
    tax_rate: tax.rate,
    tax_calculation_mode: tax.calculation_mode,
  };
};

export const createDepartmentSnapshot = (department?: Department): Partial<SalesDocument> => {
  if (!department) return {};

  return {
    department_id: department.id,
    department_code: department.code,
    department_name: department.name,
  };
};

export const createProjectSnapshot = (project?: Project): Partial<SalesDocument> => {
  if (!project) return {};

  return {
    project_id: project.id,
    project_code: project.code,
    project_name: project.name,
  };
};
