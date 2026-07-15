import { db } from '@/lib/db';
import {
  getCurrentSessionUser,
  requireRolePermission,
  writeActivityLog,
} from '@/auth/authService';
import { postOpeningBalanceSourceJournal } from '@/services/generalLedgerService';
import { enqueueOpeningBalanceBundleSync } from '@/services/syncQueueService';
import { isOpeningBalanceBatchPosted } from '@/services/openingBalanceService';
import type {
  ChartOfAccount,
  JournalEntry,
  OpeningAdvanceBalanceModule,
  OpeningAdvanceBalanceRow,
  OpeningBalanceBatch,
  OpeningBalanceLine,
  OpeningBalanceLineSettlementStatus,
} from '@/types';

export interface OpeningAdvanceBalanceFilters {
  module?: OpeningAdvanceBalanceModule | 'ALL';
  search?: string;
  settlementStatus?: OpeningBalanceLineSettlementStatus | 'ALL';
}

export interface OpeningAdvanceSettlementInput {
  amount: number;
  settlement_account_id: string;
  settled_at?: string;
  notes?: string;
}

export interface OpeningAdvanceSettlementResult {
  row: OpeningAdvanceBalanceRow;
  journal_entry: JournalEntry;
}

export interface OpeningAdvanceBalanceReportSummary {
  total_count: number;
  total_base_amount: number;
  total_settled_amount: number;
  total_remaining_amount: number;
  advance_received_remaining_amount: number;
  advance_paid_remaining_amount: number;
  open_count: number;
  partial_count: number;
  paid_count: number;
}

export interface OpeningAdvanceBalanceReport {
  rows: OpeningAdvanceBalanceRow[];
  summary: OpeningAdvanceBalanceReportSummary;
}

const ADVANCE_OPENING_BALANCE_MODULES: OpeningAdvanceBalanceModule[] = [
  'ADVANCE_RECEIVED',
  'ADVANCE_PAID',
];

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getPostableAccountById = (
  accounts: ChartOfAccount[],
  accountId: string | undefined,
  label: string,
) => {
  const account = accountId ? accounts.find((item) => item.id === accountId) : undefined;
  if (!account) {
    throw new Error(`${label} tidak ditemukan.`);
  }
  if (!account.is_active || !account.is_postable) {
    throw new Error(`${label} harus aktif dan postable.`);
  }
  return account;
};

const getAdvanceSettlementSourceEvent = (module: OpeningAdvanceBalanceModule) => (
  module === 'ADVANCE_RECEIVED'
    ? 'ADVANCE_RECEIVED_OPENING_BALANCE_SETTLED'
    : 'ADVANCE_PAID_OPENING_BALANCE_SETTLED'
);

const getSettlementStatus = (
  paidAmount: number,
  baseAmount: number,
): OpeningBalanceLineSettlementStatus => {
  if (paidAmount <= 0) return 'OPEN';
  if (paidAmount >= baseAmount - 0.01) return 'PAID';
  return 'PARTIAL';
};

const toAdvanceBalanceRow = (line: OpeningBalanceLine): OpeningAdvanceBalanceRow | undefined => {
  if (line.module !== 'ADVANCE_RECEIVED' && line.module !== 'ADVANCE_PAID') return undefined;

  return {
    opening_balance_line_id: line.id,
    opening_balance_batch_id: line.batch_id,
    module: line.module,
    direction: line.module === 'ADVANCE_RECEIVED' ? 'IN' : 'OUT',
    contact_id: line.contact_id,
    party_name: line.party_name || '-',
    document_number: line.document_number,
    document_date: line.document_date || '',
    due_date: line.due_date,
    currency_code: line.currency_code,
    currency_name: line.currency_name,
    currency_symbol: line.currency_symbol,
    base_currency_code: line.base_currency_code,
    exchange_rate: line.fx_rate,
    amount: Number(line.amount ?? line.base_amount ?? 0),
    base_amount: Number(line.base_amount || 0),
    paid_amount: Number(line.paid_amount || 0),
    remaining_amount: Number(line.remaining_amount ?? line.base_amount ?? 0),
    settlement_status: line.settlement_status ?? 'OPEN',
    account_id: line.account_id,
    account_code: line.account_code,
    account_name: line.account_name,
    counter_account_id: line.counter_account_id,
    counter_account_code: line.counter_account_code,
    counter_account_name: line.counter_account_name,
    notes: line.notes,
  };
};

const filterAdvanceBalanceRows = (
  rows: OpeningAdvanceBalanceRow[],
  filters: OpeningAdvanceBalanceFilters,
) => {
  const query = filters.search?.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesModule = !filters.module || filters.module === 'ALL' || row.module === filters.module;
    const matchesSettlement = !filters.settlementStatus ||
      filters.settlementStatus === 'ALL' ||
      row.settlement_status === filters.settlementStatus;
    const matchesSearch = !query || [
      row.party_name,
      row.document_number,
      row.account_name,
    ].some((value) => value?.toLowerCase().includes(query));

    return matchesModule && matchesSettlement && matchesSearch;
  });
};

export const listOpeningAdvanceBalanceRows = async (
  filters: OpeningAdvanceBalanceFilters = {},
): Promise<OpeningAdvanceBalanceRow[]> => {
  const modules = filters.module && filters.module !== 'ALL'
    ? [filters.module]
    : ADVANCE_OPENING_BALANCE_MODULES;
  const batches = await db.openingBalanceBatches
    .where('module')
    .anyOf(modules)
    .filter(isOpeningBalanceBatchPosted)
    .toArray();
  const batchIds = batches.map((batch) => batch.id);
  const lines = batchIds.length > 0
    ? await db.openingBalanceLines.where('batch_id').anyOf(batchIds).toArray()
    : [];
  const rows = lines
    .map(toAdvanceBalanceRow)
    .filter((row): row is OpeningAdvanceBalanceRow => Boolean(row))
    .sort((left, right) => (
      left.document_date.localeCompare(right.document_date) ||
      (left.document_number || '').localeCompare(right.document_number || '') ||
      left.party_name.localeCompare(right.party_name)
    ));

  return filterAdvanceBalanceRows(rows, filters);
};

export const getOpeningAdvanceBalanceReport = async (
  filters: OpeningAdvanceBalanceFilters = {},
): Promise<OpeningAdvanceBalanceReport> => {
  const rows = await listOpeningAdvanceBalanceRows(filters);
  const summary = rows.reduce<OpeningAdvanceBalanceReportSummary>((aggregate, row) => {
    aggregate.total_count += 1;
    aggregate.total_base_amount = roundCurrency(aggregate.total_base_amount + row.base_amount);
    aggregate.total_settled_amount = roundCurrency(aggregate.total_settled_amount + row.paid_amount);
    aggregate.total_remaining_amount = roundCurrency(aggregate.total_remaining_amount + row.remaining_amount);

    if (row.module === 'ADVANCE_RECEIVED') {
      aggregate.advance_received_remaining_amount = roundCurrency(
        aggregate.advance_received_remaining_amount + row.remaining_amount,
      );
    } else {
      aggregate.advance_paid_remaining_amount = roundCurrency(
        aggregate.advance_paid_remaining_amount + row.remaining_amount,
      );
    }

    if (row.settlement_status === 'OPEN') aggregate.open_count += 1;
    if (row.settlement_status === 'PARTIAL') aggregate.partial_count += 1;
    if (row.settlement_status === 'PAID') aggregate.paid_count += 1;

    return aggregate;
  }, {
    total_count: 0,
    total_base_amount: 0,
    total_settled_amount: 0,
    total_remaining_amount: 0,
    advance_received_remaining_amount: 0,
    advance_paid_remaining_amount: 0,
    open_count: 0,
    partial_count: 0,
    paid_count: 0,
  });

  return { rows, summary };
};

export const recordOpeningAdvanceSettlement = async (
  lineId: string,
  input: OpeningAdvanceSettlementInput,
): Promise<OpeningAdvanceSettlementResult> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const line = await db.openingBalanceLines.get(lineId);
  if (!line || (line.module !== 'ADVANCE_RECEIVED' && line.module !== 'ADVANCE_PAID')) {
    throw new Error('Saldo awal uang muka tidak ditemukan.');
  }

  const batch = await db.openingBalanceBatches.get(line.batch_id);
  if (!batch || !isOpeningBalanceBatchPosted(batch)) {
    throw new Error('Saldo awal uang muka belum posted.');
  }

  const amount = roundCurrency(Number(input.amount || 0));
  const remainingAmount = roundCurrency(Number(line.remaining_amount ?? line.base_amount ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Nominal settlement uang muka harus lebih dari 0.');
  }
  if (amount > remainingAmount + 0.01) {
    throw new Error(`Settlement melebihi sisa uang muka. Maksimal ${remainingAmount}.`);
  }

  const now = new Date().toISOString();
  const settledAt = input.settled_at ?? now;
  if (settledAt.slice(0, 10) < batch.cutoff_date.slice(0, 10)) {
    throw new Error('Tanggal settlement uang muka tidak boleh sebelum cutoff saldo awal.');
  }

  const accounts = await db.chartOfAccounts.toArray();
  const module = line.module as OpeningAdvanceBalanceModule;
  const advanceAccount = getPostableAccountById(accounts, line.account_id, 'Akun uang muka');
  const settlementAccount = getPostableAccountById(accounts, input.settlement_account_id, 'Akun settlement uang muka');
  const settlementId = crypto.randomUUID();
  const nextPaidAmount = roundCurrency(Number(line.paid_amount || 0) + amount);
  const nextRemainingAmount = Math.max(0, roundCurrency(Number(line.base_amount || 0) - nextPaidAmount));
  const nextSettlementStatus = getSettlementStatus(nextPaidAmount, Number(line.base_amount || 0));
  let updatedBatch: OpeningBalanceBatch | undefined;
  let journalEntry: JournalEntry | undefined;

  await db.transaction('rw', [
    db.openingBalanceBatches,
    db.openingBalanceLines,
    db.chartOfAccounts,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    journalEntry = await postOpeningBalanceSourceJournal({
      source_id: settlementId,
      source_number: line.document_number ?? line.id,
      source_event: getAdvanceSettlementSourceEvent(module),
      entry_date: settledAt,
      description: `Settlement saldo awal uang muka ${line.document_number ?? line.party_name ?? line.id}`,
      lines: module === 'ADVANCE_RECEIVED'
        ? [
            {
              account: advanceAccount,
              debit: amount,
              description: `Settlement uang muka diterima ${line.document_number ?? ''}`.trim(),
            },
            {
              account: settlementAccount,
              credit: amount,
              description: input.notes?.trim() || 'Settlement uang muka diterima',
            },
          ]
        : [
            {
              account: settlementAccount,
              debit: amount,
              description: input.notes?.trim() || 'Settlement uang muka dibayar',
            },
            {
              account: advanceAccount,
              credit: amount,
              description: `Settlement uang muka dibayar ${line.document_number ?? ''}`.trim(),
            },
          ],
      actor: currentUser,
    });

    await db.openingBalanceLines.update(line.id, {
      paid_amount: nextPaidAmount,
      remaining_amount: nextRemainingAmount,
      settlement_status: nextSettlementStatus,
      last_paid_at: settledAt,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    });

    updatedBatch = {
      ...batch,
      version: (batch.version ?? 1) + 1,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    };
    await db.openingBalanceBatches.put(updatedBatch);

    await writeActivityLog({
      user: currentUser,
      action: 'OPENING_ADVANCE_SETTLEMENT_RECORDED',
      entity: 'openingBalanceLines',
      entity_id: line.id,
      description: `${currentUser?.name ?? 'User'} mencatat settlement saldo awal uang muka ${line.document_number ?? line.id} sebesar ${amount}.`,
    });
  });

  if (!updatedBatch || !journalEntry) {
    throw new Error('Settlement uang muka gagal dibuat.');
  }

  const openingLines = await db.openingBalanceLines
    .where('batch_id')
    .equals(updatedBatch.id)
    .toArray();
  await enqueueOpeningBalanceBundleSync(updatedBatch, openingLines, 'update');

  const updatedLine = await db.openingBalanceLines.get(line.id);
  const row = updatedLine ? toAdvanceBalanceRow(updatedLine) : undefined;
  if (!row) {
    throw new Error('Settlement uang muka berhasil, tetapi row saldo awal tidak dapat dibaca.');
  }

  return {
    row,
    journal_entry: journalEntry,
  };
};
