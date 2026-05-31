import { db } from '@/lib/db';
import { createDocumentNumber } from '@/utils/documentNumbers';

export const createSalesDocumentNumber = async (prefix: string, date = new Date()) => {
  return createDocumentNumber(prefix, date, db.salesDocuments);
};
