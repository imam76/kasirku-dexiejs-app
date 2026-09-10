import { readConfig } from './config.ts';
import { createDatabases, migrate } from './db.ts';
import { createMidtrans } from './midtrans.ts';
import { buildApp } from './app.ts';

const config = readConfig();
const db = createDatabases(config);
try {
  await migrate(db, config);
  const app = buildApp(config, db, createMidtrans(config));
  app.addHook('onClose', async () => {
    await Promise.all([db.billing.end(), db.leads.end()]);
  });
  await app.listen({ host: config.BILLING_HOST, port: config.BILLING_PORT });
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.once(signal, () => {
      void app.close();
    });
} catch {
  console.error(
    'Billing gagal dimulai. Periksa env dan koneksi database/schema billing serta leads.',
  );
  await Promise.all([db.billing.end(), db.leads.end()]);
  process.exitCode = 1;
}
