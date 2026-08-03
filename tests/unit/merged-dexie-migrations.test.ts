import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const readMigration = (version: number) => readFileSync(
  new URL(`../../src/lib/database/migrations/versions/v${version}.ts`, import.meta.url),
  'utf8',
);

describe('merged Dexie migration order', () => {
  test('keeps accounting v106 and moves restaurant migrations to unique later versions', () => {
    const migration106 = readMigration(106);
    const migration107 = readMigration(107);
    const migration108 = readMigration(108);
    const migration109 = readMigration(109);

    expect(migration106).toContain('db.version(106)');
    expect(migration106).toContain('applyLegacyInventoryOpeningBalanceCompatibility');
    expect(migration107).toContain('db.version(107)');
    expect(migration107).toContain('restaurantSessions');
    expect(migration108).toContain('db.version(108)');
    expect(migration108).toContain('restaurantTables');
    expect(migration109).toContain('db.version(109)');
    expect(migration109).toContain('product_type');
  });
});
