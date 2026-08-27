import { describe, expect, test } from 'bun:test';
import { splitHeaderFieldsByGroup } from '../../src/utils/salesDocuments/headerFieldGroups';
import { salesInvoiceConfig } from '../../src/configs/sales-document/salesInvoice.config';
import { salesQuotationConfig } from '../../src/configs/sales-document/salesQuotation.config';
import { salesOrderConfig } from '../../src/configs/sales-document/salesOrder.config';
import { salesDeliveryConfig } from '../../src/configs/sales-document/salesDelivery.config';
import type { SalesDocumentFieldConfig } from '../../src/configs/sales-document';

describe('sales document header field groups', () => {
  test('field tanpa group dianggap core', () => {
    const fields: SalesDocumentFieldConfig[] = [
      { name: 'contact_id', labelKey: 'salesDocuments.field.customer', type: 'contact' },
      { name: 'department_id', labelKey: 'salesDocuments.field.department', type: 'department', group: 'advanced' },
    ];
    const { core, advanced } = splitHeaderFieldsByGroup(fields);
    expect(core.map((field) => field.name)).toEqual(['contact_id']);
    expect(advanced.map((field) => field.name)).toEqual(['department_id']);
  });

  test('explicit group core diperlakukan sama dengan tanpa group', () => {
    const fields: SalesDocumentFieldConfig[] = [
      { name: 'notes', labelKey: 'salesDocuments.field.notes', type: 'textarea', group: 'core' },
    ];
    const { core, advanced } = splitHeaderFieldsByGroup(fields);
    expect(core.map((field) => field.name)).toEqual(['notes']);
    expect(advanced).toEqual([]);
  });

  for (const config of [salesInvoiceConfig, salesQuotationConfig, salesOrderConfig, salesDeliveryConfig]) {
    test(`${config.type}: department & project masuk advanced, tidak hilang dari headerFields`, () => {
      const { core, advanced } = splitHeaderFieldsByGroup(config.headerFields);
      expect(advanced.map((field) => field.name).sort()).toEqual(['department_id', 'project_id']);
      expect(core.length + advanced.length).toBe(config.headerFields.length);
      expect(core.some((field) => field.name === 'department_id')).toBe(false);
    });
  }
});
