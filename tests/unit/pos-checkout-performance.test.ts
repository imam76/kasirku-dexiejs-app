import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const checkoutSource = readFileSync(
  new URL('../../src/services/checkoutService.ts', import.meta.url),
  'utf8',
);
const syncQueueSource = readFileSync(
  new URL('../../src/services/syncQueueService.ts', import.meta.url),
  'utf8',
);

describe('POS checkout performance architecture', () => {
  test('does not run global inventory sync recovery sweeps before returning checkout', () => {
    const checkoutBody = checkoutSource.slice(
      checkoutSource.indexOf('export const checkout = async'),
      checkoutSource.indexOf('export const recordPosExpense = async'),
    );

    expect(checkoutBody).not.toContain('enqueuePendingInventoryLotsForSync');
    expect(checkoutBody).not.toContain('enqueuePendingInventoryLotConsumptionsForSync');
    expect(checkoutBody).toContain('buildInventoryLotConsumptionOutboxItem');
  });

  test('loads only touched products and ignores historical synced queue rows', () => {
    const enqueueProductsBody = syncQueueSource.slice(
      syncQueueSource.indexOf('export const enqueuePendingProductsForSync'),
      syncQueueSource.indexOf('export const enqueueSalesDocumentBundleSync'),
    );

    expect(enqueueProductsBody).toContain('db.products.bulkGet([...productIds])');
    expect(enqueueProductsBody).toContain(".anyOf('pending', 'processing', 'failed')");
  });
});
