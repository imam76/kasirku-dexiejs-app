import type { Contact, Department, Project, SalesDocument, Tax, Warehouse } from '@/types';
import {
  createContactFieldsSnapshot,
  createDepartmentFieldsSnapshot,
  createProjectFieldsSnapshot,
  createTaxFieldsSnapshot,
  createWarehouseFieldsSnapshot,
} from '@/utils/documentSnapshots';

export const createContactSnapshot = (contact?: Contact): Partial<SalesDocument> => {
  const snapshot = createContactFieldsSnapshot(contact);
  if (!('name' in snapshot)) return {};

  return {
    contact_id: snapshot.contact_id,
    customer_name: snapshot.name,
    customer_phone: snapshot.phone,
    customer_email: snapshot.email,
    customer_address: snapshot.address,
    customer_company_name: snapshot.company_name,
    customer_tax_number: snapshot.tax_number,
  };
};

export const createTaxSnapshot = (tax?: Tax): Partial<SalesDocument> => {
  return createTaxFieldsSnapshot(tax);
};

export const createDepartmentSnapshot = (department?: Department): Partial<SalesDocument> => {
  return createDepartmentFieldsSnapshot(department);
};

export const createProjectSnapshot = (project?: Project): Partial<SalesDocument> => {
  return createProjectFieldsSnapshot(project);
};

export const createWarehouseSnapshot = (warehouse?: Warehouse): Partial<SalesDocument> => {
  return createWarehouseFieldsSnapshot(warehouse);
};
