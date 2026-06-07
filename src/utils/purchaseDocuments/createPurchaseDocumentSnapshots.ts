import type { Contact, Department, Project, PurchaseDocument, Tax, Warehouse } from '@/types';
import {
  createContactFieldsSnapshot,
  createDepartmentFieldsSnapshot,
  createProjectFieldsSnapshot,
  createTaxFieldsSnapshot,
  createWarehouseFieldsSnapshot,
} from '@/utils/documentSnapshots';

export const createSupplierSnapshot = (contact?: Contact): Partial<PurchaseDocument> => {
  const snapshot = createContactFieldsSnapshot(contact);
  if (!('name' in snapshot)) return {};

  return {
    contact_id: snapshot.contact_id,
    supplier_name: snapshot.name,
    supplier_phone: snapshot.phone,
    supplier_email: snapshot.email,
    supplier_address: snapshot.address,
    supplier_company_name: snapshot.company_name,
    supplier_tax_number: snapshot.tax_number,
  };
};

export const createPurchaseTaxSnapshot = (tax?: Tax): Partial<PurchaseDocument> => {
  return createTaxFieldsSnapshot(tax);
};

export const createPurchaseDepartmentSnapshot = (department?: Department): Partial<PurchaseDocument> => {
  return createDepartmentFieldsSnapshot(department);
};

export const createPurchaseProjectSnapshot = (project?: Project): Partial<PurchaseDocument> => {
  return createProjectFieldsSnapshot(project);
};

export const createPurchaseWarehouseSnapshot = (warehouse?: Warehouse): Partial<PurchaseDocument> => {
  return createWarehouseFieldsSnapshot(warehouse);
};
