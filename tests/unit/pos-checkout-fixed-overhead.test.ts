import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getAccountIndex } from '../../src/services/generalLedgerService';
import type { ChartOfAccount } from '../../src/types';

const syncQueueSource = readFileSync(
  new URL('../../src/services/syncQueueService.ts', import.meta.url),
  'utf8',
);

const buildAccounts = (count: number): ChartOfAccount[] => Array.from({ length: count }, (_, index) => ({
  id: `account-${index}`,
  code: `${1000 + index}`,
  name: `Akun ${index}`,
  type: 'ASSET',
  is_active: true,
  is_postable: true,
} as ChartOfAccount));

describe('journal account lookup index', () => {
  test('indexes one accounts array once for the several lookups of a single journal', () => {
    const accounts = buildAccounts(200);

    const first = getAccountIndex(accounts);
    const second = getAccountIndex(accounts);

    expect(second).toBe(first);
    expect(first.byId.get('account-7')).toBe(accounts[7]);
    expect(first.byCode.get('1007')).toBe(accounts[7]);
  });

  /**
   * The staleness guard: the index must be keyed on array identity, never cached
   * per table. A fresh chartOfAccounts read must never be served an older index.
   */
  test('rebuilds for a fresh read even when the contents look identical', () => {
    const accounts = buildAccounts(3);
    const reread = buildAccounts(3);

    const index = getAccountIndex(accounts);
    const rereadIndex = getAccountIndex(reread);

    expect(rereadIndex).not.toBe(index);
    expect(rereadIndex.byId.get('account-1')).toBe(reread[1]);
    expect(rereadIndex.byId.get('account-1')).not.toBe(accounts[1]);
  });

  test('reflects an edit made within the same read instead of an earlier snapshot', () => {
    const accounts = buildAccounts(2);
    getAccountIndex(accounts);

    const edited = [...accounts, { ...accounts[0], id: 'account-new', code: '9999' } as ChartOfAccount];

    expect(getAccountIndex(edited).byId.get('account-new')).toBeDefined();
    expect(getAccountIndex(accounts).byId.get('account-new')).toBeUndefined();
  });
});

describe('sync queue drain', () => {
  const drainBody = syncQueueSource.slice(
    syncQueueSource.indexOf('export const processPendingSyncQueue = async'),
    syncQueueSource.indexOf('export const enqueueActivityLogSync'),
  );

  test('recovers stale processing rows once per drain, not once per batch', () => {
    expect(drainBody).toContain('recoverStaleProcessingSyncQueueItems()');
    expect(drainBody.match(/recoverStaleProcessingSyncQueueItems\(\)/g)).toHaveLength(1);

    const recoveryAt = drainBody.indexOf('recoverStaleProcessingSyncQueueItems()');
    const loopAt = drainBody.indexOf('for (;;)');
    expect(loopAt).toBeGreaterThan(recoveryAt);
  });

  test('drains batches through the queue index without re-scanning the pending partition', () => {
    expect(drainBody).toContain('readPendingSyncQueueBatch(limit)');
    expect(drainBody).not.toContain("where('status').equals('pending')");
    expect(drainBody).not.toContain('void processPendingSyncQueue(limit)');
  });
});
