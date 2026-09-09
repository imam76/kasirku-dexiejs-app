import { readConfig } from '../services/billing/config.ts';
import { createDatabases } from '../services/billing/db.ts';
import { createMidtrans } from '../services/billing/midtrans.ts';
import { buildApp } from '../services/billing/app.ts';

const orderId = process.argv[2];
if (!orderId || !/^FRY-[a-f0-9-]{36}$/.test(orderId))
  throw new Error('Gunakan: bun run billing:reconcile FRY-<uuid>');
const config = readConfig();
const db = createDatabases(config);
const app = buildApp(config, db, createMidtrans(config));
try {
  const checked = await app.reconcileOrder(orderId);
  const result = await db.billing.query(
    'SELECT order_id,status,amount,access_start,access_end FROM orders WHERE order_id=$1',
    [orderId],
  );
  console.log(JSON.stringify({ checked, order: result.rows[0] ?? null }));
} finally {
  await app.close();
  await Promise.all([db.billing.end(), db.leads.end()]);
}
