import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import {
  assertAccountingPeriodOpen,
  postOpeningBalanceSourceJournal,
} from '@/services/generalLedgerService';
import {
  getOpeningBalanceBatchId,
  isOpeningBalanceBatchPosted,
  markOpeningBalanceModuleSkipped,
  OPENING_BALANCE_EQUITY_CANDIDATE,
} from '@/services/openingBalanceService';
import {
  buildProductSyncQueueItem,
  enqueueInventoryOpeningBalancePostingSync,
  enqueueOpeningBalanceBundleSync,
  enqueuePendingProductsForSync,
  processPendingSyncQueue,
} from '@/services/syncQueueService';
import type {
  ChartOfAccount,
  GeneralLedgerSetting,
  InventoryLot,
  OpeningBalanceBatch,
  OpeningBalanceLine,
  Product,
} from '@/types';

const INVENTORY_ACCOUNT_CANDIDATE = {
  ids: ['inventory', 'template-inventory'],
  codes: ['1200'],
};
const INVENTORY_OPENING_BALANCE_SOURCE_EVENT = 'INVENTORY_OPENING_BALANCE_POSTED';
const QUANTITY_DECIMALS = 6;
const UNIT_COST_DECIMALS = 6;
const STOCK_TOLERANCE = 0.000001;

export interface InventoryOpeningBalanceLineInput {
  product_id: string;
  opening_quantity: number;
  cost_per_unit: number;
  notes?: string;
}

export interface InventoryOpeningBalancePreviewLine {
  product_id: string;
  product_sku?: string;
  product_name: string;
  stock_unit: Product['purchase_unit'];
  opening_quantity: number;
  cost_per_unit: number;
  total_value: number;
  notes?: string;
}

export interface InventoryOpeningBalancePreview {
  cutoffDate: string;
  productCount: number;
  totalQuantity: number;
  totalValue: number;
  inventoryAccount: Pick<ChartOfAccount, 'id' | 'code' | 'name'>;
  equityAccount: Pick<ChartOfAccount, 'id' | 'code' | 'name'>;
  lines: InventoryOpeningBalancePreviewLine[];
}

interface InventoryOpeningBalanceCommand {
  lines: InventoryOpeningBalanceLineInput[];
  notes?: string;
  idempotencyKey?: string;
}

interface OpeningInventoryContext {
  cutoffDate: string;
  accountingStartDate?: string;
  companyId: string;
  companyName?: string;
  inventoryAccount: ChartOfAccount;
  equityAccount: ChartOfAccount;
  products: Product[];
}

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const roundCurrency = (value: number) => roundTo(value, 2);
const roundQuantity = (value: number) => roundTo(value, QUANTITY_DECIMALS);
const roundUnitCost = (value: number) => roundTo(value, UNIT_COST_DECIMALS);
const toDateOnly = (value: string) => value.slice(0, 10);
const toCutoffTimestamp = (value: string) => (
  value.includes('T') ? value : `${toDateOnly(value)}T23:59:59.999`
);

const isAfterCutoff = (timestamp: string | undefined, cutoffDate: string) => (
  Boolean(timestamp && toDateOnly(timestamp) > toDateOnly(cutoffDate))
);

const findAccountCandidate = (
  accounts: ChartOfAccount[],
  candidate: { ids: string[]; codes: string[] },
) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));

  return candidate.ids
    .map((id) => accountById.get(id))
    .find(Boolean) ?? candidate.codes
    .map((code) => accountByCode.get(code))
    .find(Boolean);
};

const requirePostableAccount = (
  accounts: ChartOfAccount[],
  candidate: { ids: string[]; codes: string[] },
  label: string,
) => {
  const account = findAccountCandidate(accounts, candidate);
  if (!account) {
    throw new Error(`Akun ${label} belum tersedia di Daftar Akun.`);
  }
  if (!account.is_active || !account.is_postable) {
    throw new Error(`Akun ${account.code} - ${account.name} harus aktif dan postable.`);
  }
  return account;
};

const getOpeningInventoryContext = async ({
  enforcePostingPolicy,
}: {
  enforcePostingPolicy: boolean;
}): Promise<OpeningInventoryContext> => {
  const [setup, ledgerSetting, company, accounts, products] = await Promise.all([
    db.accountingInitialSetupSetting.get('default'),
    db.generalLedgerSetting.get('default'),
    db.companyProfileSetting.get('default'),
    db.chartOfAccounts.toArray(),
    db.products.toArray(),
  ]);
  const cutoffDate = setup?.cutoff_date ?? ledgerSetting?.cutoff_date;

  if (!cutoffDate) {
    throw new Error('Tanggal cutoff belum tersedia. Selesaikan setup akuntansi terlebih dahulu.');
  }

  const inventoryPolicy = setup?.inventory_policy ?? ledgerSetting?.inventory_policy;
  if (enforcePostingPolicy && inventoryPolicy !== 'PERPETUAL_INVENTORY') {
    throw new Error('Saldo awal persediaan hanya dapat diposting dengan kebijakan Perpetual Inventory.');
  }

  if (enforcePostingPolicy) {
    await assertAccountingPeriodOpen(cutoffDate);
  }

  const inventoryAccount = requirePostableAccount(
    accounts,
    INVENTORY_ACCOUNT_CANDIDATE,
    'Persediaan',
  );
  const equityAccount = requirePostableAccount(
    accounts,
    OPENING_BALANCE_EQUITY_CANDIDATE,
    'Ekuitas Saldo Awal',
  );

  return {
    cutoffDate,
    accountingStartDate: setup?.current_period_start,
    companyId: company?.id ?? 'default',
    companyName: company?.company_name,
    inventoryAccount,
    equityAccount,
    products,
  };
};

const normalizeInventoryOpeningLines = (
  lines: InventoryOpeningBalanceLineInput[],
  products: Product[],
): InventoryOpeningBalancePreviewLine[] => {
  const productById = new Map(products.map((product) => [product.id, product]));
  const seenProductIds = new Set<string>();
  const normalized: InventoryOpeningBalancePreviewLine[] = [];

  for (const [index, input] of lines.entries()) {
    const productId = input.product_id?.trim();
    const quantityValue = Number(input.opening_quantity);
    const unitCostValue = Number(input.cost_per_unit);

    if (!productId) {
      throw new Error(`Baris ${index + 1}: product_id wajib diisi.`);
    }
    if (!Number.isFinite(quantityValue) || quantityValue < 0) {
      throw new Error(`Baris ${index + 1}: qty saldo awal harus berupa angka dan tidak boleh negatif.`);
    }
    if (!Number.isFinite(unitCostValue) || unitCostValue < 0) {
      throw new Error(`Baris ${index + 1}: HPP per unit harus berupa angka dan tidak boleh negatif.`);
    }

    const quantity = roundQuantity(quantityValue);
    if (quantity === 0) continue;
    if (roundUnitCost(unitCostValue) <= 0) {
      throw new Error(`Baris ${index + 1}: HPP per unit harus lebih dari 0 ketika qty saldo awal lebih dari 0.`);
    }
    if (seenProductIds.has(productId)) {
      throw new Error(`Produk ${productId} muncul lebih dari satu kali.`);
    }

    const product = productById.get(productId);
    if (!product) {
      throw new Error(`Produk ${productId} tidak ditemukan.`);
    }

    const costPerUnit = roundUnitCost(unitCostValue);
    const totalValue = roundCurrency(quantity * costPerUnit);
    if (!Number.isFinite(totalValue)) {
      throw new Error(`Nilai saldo awal produk ${product.name} terlalu besar.`);
    }
    if (totalValue <= 0) {
      throw new Error(
        `Nilai saldo awal produk ${product.name} terlalu kecil untuk dibukukan dalam mata uang dasar.`,
      );
    }

    seenProductIds.add(productId);
    normalized.push({
      product_id: product.id,
      product_sku: product.sku,
      product_name: product.name,
      stock_unit: product.purchase_unit,
      opening_quantity: quantity,
      cost_per_unit: costPerUnit,
      total_value: totalValue,
      notes: input.notes?.trim() || undefined,
    });
  }

  return normalized.sort((left, right) => (
    left.product_name.localeCompare(right.product_name, 'id')
      || left.product_id.localeCompare(right.product_id)
  ));
};

const getInventoryPreviewFromContext = (
  context: OpeningInventoryContext,
  lines: InventoryOpeningBalanceLineInput[],
): InventoryOpeningBalancePreview => {
  const normalizedLines = normalizeInventoryOpeningLines(lines, context.products);
  const totalQuantity = roundQuantity(
    normalizedLines.reduce((sum, line) => sum + line.opening_quantity, 0),
  );
  const totalValue = roundCurrency(
    normalizedLines.reduce((sum, line) => sum + line.total_value, 0),
  );

  return {
    cutoffDate: context.cutoffDate,
    productCount: normalizedLines.length,
    totalQuantity,
    totalValue,
    inventoryAccount: context.inventoryAccount,
    equityAccount: context.equityAccount,
    lines: normalizedLines,
  };
};

const assertInventoryAccountNotPostedInAccountModule = async (
  cutoffDate: string,
  inventoryAccount: ChartOfAccount,
) => {
  const accountBatch = await db.openingBalanceBatches.get(
    getOpeningBalanceBatchId('ACCOUNT', cutoffDate),
  );
  if (!accountBatch || !isOpeningBalanceBatchPosted(accountBatch)) return;

  const accountLines = await db.openingBalanceLines
    .where('batch_id')
    .equals(accountBatch.id)
    .toArray();
  const conflictingLine = accountLines.find((line) => (
    (line.account_id === inventoryAccount.id || line.account_code === inventoryAccount.code)
    && (Math.abs(Number(line.debit || 0)) > 0 || Math.abs(Number(line.credit || 0)) > 0)
  ));

  if (conflictingLine) {
    throw new Error(
      `Akun ${inventoryAccount.code} - ${inventoryAccount.name} sudah diposting melalui Saldo Awal Akun. Lakukan koreksi/reversal akun tersebut sebelum memposting saldo awal persediaan.`,
    );
  }
};

const buildInventoryOpeningBalanceLines = ({
  batchId,
  preview,
  now,
}: {
  batchId: string;
  preview: InventoryOpeningBalancePreview;
  now: string;
}): OpeningBalanceLine[] => preview.lines.map((line, index) => {
  const lineId = `${batchId}:product:${line.product_id}`;
  return {
    id: lineId,
    batch_id: batchId,
    module: 'INVENTORY',
    line_number: index + 1,
    product_id: line.product_id,
    product_sku: line.product_sku,
    product_name: line.product_name,
    quantity: line.opening_quantity,
    unit: line.stock_unit,
    unit_cost: line.cost_per_unit,
    inventory_lot_id: `${batchId}:lot:${line.product_id}`,
    base_amount: line.total_value,
    account_id: preview.inventoryAccount.id,
    account_code: preview.inventoryAccount.code,
    account_name: preview.inventoryAccount.name,
    counter_account_id: preview.equityAccount.id,
    counter_account_code: preview.equityAccount.code,
    counter_account_name: preview.equityAccount.name,
    debit: line.total_value,
    credit: 0,
    notes: line.notes,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
});

const buildInventoryBatch = ({
  existingBatch,
  context,
  preview,
  status,
  notes,
  now,
  currentUser,
}: {
  existingBatch?: OpeningBalanceBatch;
  context: OpeningInventoryContext;
  preview: InventoryOpeningBalancePreview;
  status: 'DRAFT' | 'POSTED';
  notes?: string;
  now: string;
  currentUser: Awaited<ReturnType<typeof getCurrentSessionUser>>;
}): OpeningBalanceBatch => {
  const batchId = getOpeningBalanceBatchId('INVENTORY', context.cutoffDate);
  const revisionNumber = existingBatch?.revision_number ?? 1;

  return {
    id: batchId,
    batch_number: existingBatch?.batch_number
      ?? `OB-${toDateOnly(context.cutoffDate).replace(/-/g, '')}-INVENTORY-R${revisionNumber}`,
    company_id: existingBatch?.company_id ?? context.companyId,
    company_name: existingBatch?.company_name ?? context.companyName,
    module: 'INVENTORY',
    cutoff_date: context.cutoffDate,
    accounting_start_date: existingBatch?.accounting_start_date ?? context.accountingStartDate,
    status,
    revision_number: revisionNumber,
    previous_batch_id: existingBatch?.previous_batch_id,
    total_debit: preview.totalValue,
    total_credit: preview.totalValue,
    notes,
    version: (existingBatch?.version ?? 0) + 1,
    created_by: existingBatch?.created_by ?? currentUser?.id,
    created_by_name: existingBatch?.created_by_name ?? currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
    created_at: existingBatch?.created_at ?? now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
};

const getOpeningLineSignature = (
  lines: Array<Pick<OpeningBalanceLine, 'product_id' | 'quantity' | 'unit_cost'>>,
) => lines
  .filter((line) => line.product_id)
  .map((line) => [
    line.product_id,
    roundQuantity(Number(line.quantity || 0)),
    roundUnitCost(Number(line.unit_cost || 0)),
  ].join(':'))
  .sort()
  .join('|');

const getPreviewLineSignature = (preview: InventoryOpeningBalancePreview) => (
  preview.lines
    .map((line) => [
      line.product_id,
      line.opening_quantity,
      line.cost_per_unit,
    ].join(':'))
    .sort()
    .join('|')
);

const assertAllExistingStockIsRepresented = (
  products: Product[],
  preview: InventoryOpeningBalancePreview,
) => {
  const representedProductIds = new Set(
    preview.lines.map((line) => line.product_id),
  );
  const omittedProductsWithStock = products.filter((product) => (
    !representedProductIds.has(product.id)
    && Math.abs(Number(product.stock || 0)) > STOCK_TOLERANCE
  ));
  if (omittedProductsWithStock.length === 0) return;

  const sample = omittedProductsWithStock
    .slice(0, 3)
    .map((product) => product.name)
    .join(', ');
  const remaining = omittedProductsWithStock.length - Math.min(3, omittedProductsWithStock.length);
  throw new Error(
    `Masih ada ${omittedProductsWithStock.length} produk bersaldo stok yang belum dimasukkan (${sample}${remaining > 0 ? `, dan ${remaining} lainnya` : ''}). Sertakan seluruh produk bersaldo dengan qty cutoff yang benar. Jika qty cutoff memang nol, rekonsiliasi stok produk tersebut terlebih dahulu agar nilai stok dan jurnal tidak berbeda.`,
  );
};

const assertNoPostCutoffInventoryActivity = async (
  products: Product[],
  cutoffDate: string,
  representedProductIds: Set<string>,
) => {
  const productIds = new Set(products.map((product) => product.id));
  const [lots, consumptions, transactionItems, stockPurchases] = await Promise.all([
    db.inventoryLots.toArray(),
    db.inventoryLotConsumptions.toArray(),
    db.transactionItems.toArray(),
    db.stockPurchases.toArray(),
  ]);

  const laterLot = lots.find((lot) => (
    productIds.has(lot.product_id) && isAfterCutoff(lot.received_at, cutoffDate)
  ));
  const laterConsumption = consumptions.find((consumption) => (
    productIds.has(consumption.product_id) && isAfterCutoff(consumption.created_at, cutoffDate)
  ));
  const laterSale = transactionItems.find((item) => (
    productIds.has(item.product_id) && isAfterCutoff(item.created_at, cutoffDate)
  ));
  const laterPurchase = stockPurchases.find((purchase) => (
    productIds.has(purchase.product_id) && isAfterCutoff(purchase.created_at, cutoffDate)
  ));

  if (laterLot || laterConsumption || laterSale || laterPurchase) {
    const productId = laterLot?.product_id
      ?? laterConsumption?.product_id
      ?? laterSale?.product_id
      ?? laterPurchase?.product_id;
    const product = productId ? products.find((item) => item.id === productId) : undefined;
    throw new Error(
      `Ada pergerakan stok ${product?.name ?? productId ?? ''} setelah tanggal cutoff. Saldo awal tidak boleh menimpa transaksi berjalan; gunakan penyesuaian stok atau ubah cutoff terlebih dahulu.`,
    );
  }

  const lotBalanceByProductId = new Map<string, number>();
  for (const lot of lots) {
    if (!productIds.has(lot.product_id)) continue;
    lotBalanceByProductId.set(
      lot.product_id,
      (lotBalanceByProductId.get(lot.product_id) ?? 0)
        + Number(lot.quantity_remaining || 0),
    );
  }

  for (const product of products) {
    const currentStock = Number(product.stock || 0);
    if (!Number.isFinite(currentStock) || currentStock < -STOCK_TOLERANCE) {
      throw new Error(`Stok ${product.name} negatif atau tidak valid. Koreksi stok sebelum posting saldo awal.`);
    }

    if (!lotBalanceByProductId.has(product.id)) continue;

    const lotBalance = roundQuantity(lotBalanceByProductId.get(product.id) ?? 0);
    if (
      !representedProductIds.has(product.id)
      && Math.abs(lotBalance - roundQuantity(currentStock)) > STOCK_TOLERANCE
    ) {
      throw new Error(
        `Produk ${product.name} belum dimasukkan, tetapi saldo lot (${lotBalance}) tidak sama dengan stok produk (${roundQuantity(currentStock)}). Sertakan produk ini dalam saldo awal atau rekonsiliasi persediaan terlebih dahulu.`,
      );
    }
  }
};

export const getInventoryOpeningBalancePreview = async ({
  lines,
}: Pick<InventoryOpeningBalanceCommand, 'lines'>) => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const context = await getOpeningInventoryContext({ enforcePostingPolicy: true });
  const preview = getInventoryPreviewFromContext(context, lines);
  if (preview.lines.length === 0) {
    throw new Error('Minimal satu produk dengan qty saldo awal dan HPP lebih dari 0 wajib diisi.');
  }
  if (preview.totalValue <= 0) {
    throw new Error('Total nilai saldo awal persediaan harus lebih dari 0.');
  }
  await assertInventoryAccountNotPostedInAccountModule(
    context.cutoffDate,
    context.inventoryAccount,
  );
  assertAllExistingStockIsRepresented(context.products, preview);
  return preview;
};

export const saveInventoryOpeningBalanceDraft = async ({
  lines,
  notes,
}: InventoryOpeningBalanceCommand) => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const context = await getOpeningInventoryContext({ enforcePostingPolicy: false });
  const preview = getInventoryPreviewFromContext(context, lines);
  const batchId = getOpeningBalanceBatchId('INVENTORY', context.cutoffDate);
  const existingBatch = await db.openingBalanceBatches.get(batchId);

  if (existingBatch && isOpeningBalanceBatchPosted(existingBatch)) {
    throw new Error('Saldo awal persediaan sudah diposting dan tidak dapat diubah.');
  }
  if (existingBatch && existingBatch.status !== 'DRAFT' && existingBatch.status !== 'VALIDATED') {
    throw new Error('Saldo awal persediaan sudah terkunci dan tidak dapat diubah.');
  }

  const now = new Date().toISOString();
  const batch = buildInventoryBatch({
    existingBatch,
    context,
    preview,
    status: 'DRAFT',
    notes,
    now,
    currentUser,
  });
  const openingLines = buildInventoryOpeningBalanceLines({ batchId, preview, now });

  await db.transaction(
    'rw',
    [db.openingBalanceBatches, db.openingBalanceLines, db.activityLogs],
    async () => {
      const currentBatch = await db.openingBalanceBatches.get(batchId);
      if (currentBatch && isOpeningBalanceBatchPosted(currentBatch)) {
        throw new Error('Saldo awal persediaan sudah diposting dan tidak dapat diubah.');
      }
      if (currentBatch && currentBatch.status !== 'DRAFT' && currentBatch.status !== 'VALIDATED') {
        throw new Error('Saldo awal persediaan sudah terkunci dan tidak dapat diubah.');
      }

      await db.openingBalanceBatches.put(batch);
      await db.openingBalanceLines.where('batch_id').equals(batchId).delete();
      if (openingLines.length > 0) {
        await db.openingBalanceLines.bulkPut(openingLines);
      }

      await writeActivityLog({
        user: currentUser,
        action: 'INVENTORY_OPENING_BALANCE_DRAFT_SAVED',
        entity: 'openingBalanceBatches',
        entity_id: batchId,
        description: `${currentUser?.name ?? 'User'} menyimpan draft saldo awal persediaan per ${toDateOnly(context.cutoffDate)}.`,
      });
    },
  );

  await enqueueOpeningBalanceBundleSync(
    batch,
    openingLines,
    existingBatch ? 'update' : 'create',
  );
  return batch;
};

export const skipInventoryOpeningBalance = async (notes?: string) => (
  markOpeningBalanceModuleSkipped('INVENTORY', notes)
);

export const postInventoryOpeningBalance = async ({
  lines,
  notes,
  idempotencyKey,
}: InventoryOpeningBalanceCommand) => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const context = await getOpeningInventoryContext({ enforcePostingPolicy: true });
  const preview = getInventoryPreviewFromContext(context, lines);
  if (preview.lines.length === 0 || preview.totalValue <= 0) {
    throw new Error('Minimal satu produk dengan qty saldo awal dan HPP lebih dari 0 wajib diisi.');
  }

  const batchId = getOpeningBalanceBatchId('INVENTORY', context.cutoffDate);
  const existingBatch = await db.openingBalanceBatches.get(batchId);
  if (existingBatch && isOpeningBalanceBatchPosted(existingBatch)) {
    const existingLines = await db.openingBalanceLines
      .where('batch_id')
      .equals(existingBatch.id)
      .toArray();
    if (getOpeningLineSignature(existingLines) !== getPreviewLineSignature(preview)) {
      throw new Error('Saldo awal persediaan sudah diposting dengan data berbeda dan tidak dapat ditimpa.');
    }
    await enqueuePendingProductsForSync(
      new Set(
        existingLines
          .map((line) => line.product_id)
          .filter((productId): productId is string => Boolean(productId)),
      ),
      { deferProcessing: true, preserveStock: true },
    );
    await enqueueInventoryOpeningBalancePostingSync(
      existingBatch,
      existingLines,
      { deferProcessing: true },
    );
    void processPendingSyncQueue();
    return existingBatch;
  }
  if (existingBatch && existingBatch.status !== 'DRAFT' && existingBatch.status !== 'VALIDATED') {
    throw new Error('Saldo awal persediaan sudah terkunci dan tidak dapat diposting.');
  }

  await assertInventoryAccountNotPostedInAccountModule(
    context.cutoffDate,
    context.inventoryAccount,
  );
  const targetByProductId = new Map(
    preview.lines.map((line) => [line.product_id, line]),
  );
  assertAllExistingStockIsRepresented(context.products, preview);
  await assertNoPostCutoffInventoryActivity(
    context.products,
    context.cutoffDate,
    new Set(targetByProductId.keys()),
  );

  const now = new Date().toISOString();
  const cutoffTimestamp = toCutoffTimestamp(context.cutoffDate);
  const openingLines = buildInventoryOpeningBalanceLines({ batchId, preview, now });
  const openingLineByProductId = new Map(
    openingLines
      .filter((line) => line.product_id)
      .map((line) => [line.product_id as string, line]),
  );
  const productsForSync: Product[] = [];
  let postedBatch: OpeningBalanceBatch | undefined;
  let updatedGeneralLedger: GeneralLedgerSetting | undefined;

  await db.transaction(
    'rw',
    [
      db.accountingPeriods,
      db.accountingInitialSetupSetting,
      db.generalLedgerSetting,
      db.companyProfileSetting,
      db.chartOfAccounts,
      db.products,
      db.inventoryLots,
      db.inventoryLotConsumptions,
      db.transactionItems,
      db.stockPurchases,
      db.openingBalanceBatches,
      db.openingBalanceLines,
      db.journalEntries,
      db.journalEntryLines,
      db.syncQueue,
      db.activityLogs,
    ],
    async () => {
      await assertAccountingPeriodOpen(context.cutoffDate);
      await assertInventoryAccountNotPostedInAccountModule(
        context.cutoffDate,
        context.inventoryAccount,
      );

      const [currentBatch, currentProducts] = await Promise.all([
        db.openingBalanceBatches.get(batchId),
        db.products.toArray(),
      ]);
      if (currentBatch && isOpeningBalanceBatchPosted(currentBatch)) {
        const currentLines = await db.openingBalanceLines
          .where('batch_id')
          .equals(batchId)
          .toArray();
        if (getOpeningLineSignature(currentLines) !== getPreviewLineSignature(preview)) {
          throw new Error('Saldo awal persediaan sudah diposting dengan data berbeda dan tidak dapat ditimpa.');
        }
        postedBatch = currentBatch;
        await enqueuePendingProductsForSync(
          new Set(
            currentLines
              .map((line) => line.product_id)
              .filter((productId): productId is string => Boolean(productId)),
          ),
          { deferProcessing: true, preserveStock: true },
        );
        await enqueueInventoryOpeningBalancePostingSync(
          currentBatch,
          currentLines,
          { deferProcessing: true },
        );
        return;
      }
      if (currentBatch && currentBatch.status !== 'DRAFT' && currentBatch.status !== 'VALIDATED') {
        throw new Error('Saldo awal persediaan sudah terkunci dan tidak dapat diposting.');
      }

      const currentPreview = getInventoryPreviewFromContext(
        { ...context, products: currentProducts },
        lines,
      );
      if (getPreviewLineSignature(currentPreview) !== getPreviewLineSignature(preview)) {
        throw new Error('Master produk berubah saat proses posting. Muat ulang halaman lalu coba kembali.');
      }
      assertAllExistingStockIsRepresented(currentProducts, currentPreview);
      const currentTargetProducts = currentProducts.filter((product) => (
        targetByProductId.has(product.id)
      ));
      await assertNoPostCutoffInventoryActivity(
        currentProducts,
        context.cutoffDate,
        new Set(targetByProductId.keys()),
      );

      const currentProductIds = new Set(
        currentTargetProducts.map((product) => product.id),
      );
      const existingLots = (await db.inventoryLots.toArray())
        .filter((lot) => currentProductIds.has(lot.product_id));
      if (existingLots.length > 0) {
        await db.inventoryLots.bulkPut(existingLots.map((lot) => ({
          ...lot,
          quantity_remaining: 0,
          updated_at: now,
        })));
      }

      const lotsToCreate: InventoryLot[] = [];
      for (const product of currentTargetProducts) {
        const target = targetByProductId.get(product.id);
        if (!target) {
          throw new Error(`Produk ${product.name} tidak ditemukan dalam rencana saldo awal.`);
        }
        const targetQuantity = target.opening_quantity;
        const updatedProduct: Product = {
          ...product,
          stock: targetQuantity,
          purchase_price: target.cost_per_unit,
          updated_at: now,
          sync_status: 'pending',
          sync_error: undefined,
        };

        productsForSync.push(updatedProduct);

        const line = openingLineByProductId.get(product.id);
        lotsToCreate.push({
          id: `${batchId}:lot:${product.id}`,
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          source_type: 'OPENING',
          source_id: batchId,
          source_line_id: line?.id,
          quantity_received: targetQuantity,
          quantity_remaining: targetQuantity,
          cost_per_unit: target.cost_per_unit,
          cost_status: 'FINAL',
          final_cost_per_unit: target.cost_per_unit,
          cost_finalized_at: now,
          received_at: cutoffTimestamp,
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
          sync_error: undefined,
        });
      }

      if (productsForSync.length > 0) {
        await db.products.bulkPut(productsForSync);
      }
      if (lotsToCreate.length > 0) {
        await db.inventoryLots.bulkPut(lotsToCreate);
      }

      const journalEntry = await postOpeningBalanceSourceJournal({
        entry_id: `${batchId}:journal`,
        source_id: batchId,
        source_number: 'INVENTORY',
        source_event: INVENTORY_OPENING_BALANCE_SOURCE_EVENT,
        entry_date: context.cutoffDate,
        description: `Saldo awal persediaan per ${toDateOnly(context.cutoffDate)}`,
        lines: [
          {
            account: context.inventoryAccount,
            debit: preview.totalValue,
            description: 'Saldo awal persediaan',
          },
          {
            account: context.equityAccount,
            credit: preview.totalValue,
            description: 'Ekuitas saldo awal persediaan',
          },
        ],
        actor: currentUser,
        scheduleSync: false,
      });

      const finalizedBatch: OpeningBalanceBatch = {
        ...buildInventoryBatch({
          existingBatch: currentBatch ?? existingBatch,
          context,
          preview,
          status: 'POSTED',
          notes,
          now,
          currentUser,
        }),
        total_debit: journalEntry.total_debit,
        total_credit: journalEntry.total_credit,
        journal_entry_id: journalEntry.id,
        posting_idempotency_key: idempotencyKey?.trim()
          || `${batchId}:INVENTORY:${toDateOnly(context.cutoffDate)}:post`,
        posted_at: journalEntry.posted_at,
        posted_by: currentUser?.id,
        posted_by_name: currentUser?.name,
        locked_at: journalEntry.posted_at ?? now,
      };
      postedBatch = finalizedBatch;

      await db.openingBalanceBatches.put(finalizedBatch);
      await db.openingBalanceLines.where('batch_id').equals(batchId).delete();
      await db.openingBalanceLines.bulkPut(openingLines);

      const accountBatch = await db.openingBalanceBatches.get(
        getOpeningBalanceBatchId('ACCOUNT', context.cutoffDate),
      );
      if (
        isOpeningBalanceBatchPosted(accountBatch)
        || accountBatch?.status === 'SKIPPED'
      ) {
        const currentLedger = await db.generalLedgerSetting.get('default');
        updatedGeneralLedger = {
          id: 'default',
          is_ready: true,
          cutoff_date: context.cutoffDate.includes('T')
            ? context.cutoffDate
            : `${toDateOnly(context.cutoffDate)}T00:00:00.000`,
          inventory_policy: 'PERPETUAL_INVENTORY',
          opening_balance_journal_id: currentLedger?.opening_balance_journal_id
            ?? accountBatch?.journal_entry_id,
          activated_at: currentLedger?.activated_at ?? now,
          created_at: currentLedger?.created_at ?? now,
          updated_at: now,
          sync_status: 'pending',
          sync_error: undefined,
        };
        await db.generalLedgerSetting.put(updatedGeneralLedger);
      }

      const finalLotBalanceByProductId = new Map<string, number>();
      for (const lot of await db.inventoryLots.toArray()) {
        if (!currentProductIds.has(lot.product_id)) continue;
        finalLotBalanceByProductId.set(
          lot.product_id,
          (finalLotBalanceByProductId.get(lot.product_id) ?? 0)
            + Number(lot.quantity_remaining || 0),
        );
      }
      for (const product of currentTargetProducts) {
        const expectedStock = targetByProductId.get(product.id)?.opening_quantity ?? 0;
        const lotBalance = roundQuantity(finalLotBalanceByProductId.get(product.id) ?? 0);
        if (Math.abs(lotBalance - expectedStock) > STOCK_TOLERANCE) {
          throw new Error(`Invariant lot persediaan gagal untuk ${product.name}. Posting dibatalkan.`);
        }
      }

      await writeActivityLog({
        user: currentUser,
        action: 'INVENTORY_OPENING_BALANCE_POSTED',
        entity: 'openingBalanceBatches',
        entity_id: batchId,
        description: `${currentUser?.name ?? 'User'} memposting saldo awal ${preview.productCount} produk senilai ${preview.totalValue} per ${toDateOnly(context.cutoffDate)}.`,
      });

      if (productsForSync.length > 0) {
        await db.syncQueue.bulkAdd(
          productsForSync.map((product) => buildProductSyncQueueItem(
            product,
            'update',
            { preserveStock: true, createdAt: now },
          )),
        );
      }
      const journalLines = await db.journalEntryLines
        .where('journal_entry_id')
        .equals(journalEntry.id)
        .toArray();
      await enqueueInventoryOpeningBalancePostingSync(
        finalizedBatch,
        openingLines,
        {
          journalEntry,
          journalLines,
          generalLedgerSetting: updatedGeneralLedger,
          deferProcessing: true,
        },
      );
    },
  );

  if (!postedBatch) {
    throw new Error('Batch saldo awal persediaan gagal dibuat.');
  }

  void processPendingSyncQueue();

  return postedBatch;
};
