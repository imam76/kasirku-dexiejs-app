import { expect, test } from '@playwright/test';

test('ledger period query does not materialize unrelated historical rows', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { getJournalEntriesWithLines } = await import('/src/services/generalLedgerService.ts');
    const oldDate = '2020-01-01T00:00:00.000Z';
    const rangeDate = '2026-09-15T03:00:00.000Z';
    const accountId = 'ledger-growth-account';
    const oldEntries = Array.from({ length: 500 }, (_, index) => ({
      id: `ledger-growth-old-entry-${index}`,
      entry_number: `OLD-${String(index).padStart(4, '0')}`,
      entry_date: oldDate,
      status: 'POSTED' as const,
      source_type: 'MANUAL_JOURNAL' as const,
      description: 'Historical noise',
      total_debit: 1,
      total_credit: 1,
      created_at: oldDate,
      updated_at: oldDate,
    }));
    const rangeEntry = {
      id: 'ledger-growth-range-entry',
      entry_number: 'RANGE-0001',
      entry_date: rangeDate,
      status: 'POSTED' as const,
      source_type: 'MANUAL_JOURNAL' as const,
      description: 'Expected range entry',
      total_debit: 10,
      total_credit: 10,
      created_at: rangeDate,
      updated_at: rangeDate,
    };
    const oldLines = oldEntries.map((entry, index) => ({
      id: `ledger-growth-old-line-${index}`,
      journal_entry_id: entry.id,
      entry_date: oldDate,
      account_id: accountId,
      account_code: '1010',
      account_name: 'Kas',
      account_type: 'ASSET' as const,
      debit: 1,
      credit: 0,
      created_at: oldDate,
    }));
    const rangeLine = {
      id: 'ledger-growth-range-line',
      journal_entry_id: rangeEntry.id,
      entry_date: rangeDate,
      account_id: accountId,
      account_code: '1010',
      account_name: 'Kas',
      account_type: 'ASSET' as const,
      debit: 10,
      credit: 0,
      created_at: rangeDate,
    };

    await db.transaction('rw', db.journalEntries, db.journalEntryLines, async () => {
      await db.journalEntries.bulkPut([...oldEntries, rangeEntry]);
      await db.journalEntryLines.bulkPut([...oldLines, rangeLine]);
    });

    let entryReads = 0;
    let lineReads = 0;
    const trackEntry = <T>(entry: T) => {
      entryReads += 1;
      return entry;
    };
    const trackLine = <T>(line: T) => {
      lineReads += 1;
      return line;
    };
    db.journalEntries.hook('reading', trackEntry);
    db.journalEntryLines.hook('reading', trackLine);

    try {
      const rows = await getJournalEntriesWithLines({
        startDate: '2026-09-15T00:00:00.000Z',
        endDate: '2026-09-15T23:59:59.999Z',
        accountId,
      });
      return {
        ids: rows.map((entry) => entry.id),
        lineIds: rows.flatMap((entry) => entry.lines.map((line) => line.id)),
        entryReads,
        lineReads,
      };
    } finally {
      db.journalEntries.hook('reading').unsubscribe(trackEntry);
      db.journalEntryLines.hook('reading').unsubscribe(trackLine);
    }
  });

  expect(result.ids).toEqual(['ledger-growth-range-entry']);
  expect(result.lineIds).toEqual(['ledger-growth-range-line']);
  expect(result.entryReads).toBeLessThan(10);
  expect(result.lineReads).toBeLessThan(10);
});
