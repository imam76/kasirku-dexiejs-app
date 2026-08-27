import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import type { Lottery } from '@/types';
import { enqueueLotterySync } from '@/services/syncQueueService';

export interface LotteryFormInput {
  name: string;
  min_total: number;
  max_total?: number | null;
  start_at?: string | null;
  end_at?: string | null;
  active: boolean;
}

export interface LotteryEvaluationResult {
  lottery_number?: string;
  lottery_id?: string;
  lottery_name?: string;
}

const pad = (value: number, length: number) => String(value).padStart(length, '0');

const getCashierInitials = (cashierName?: string) => {
  const trimmed = (cashierName ?? '').trim();
  if (!trimmed) return 'XX';

  const initials = trimmed
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return initials.slice(0, 3) || 'XX';
};

export const buildLotteryNumber = (now: Date, cashierName?: string) => {
  const initials = getCashierInitials(cashierName);
  const datePart = `${pad(now.getFullYear() % 100, 2)}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
  const timePart = `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
  const msPart = pad(now.getMilliseconds(), 3);

  return `UND-${initials}-${datePart}-${timePart}-${msPart}`;
};

const isLotteryInDateRange = (lottery: Lottery, now: Date) => {
  const nowTime = now.getTime();
  const startTime = lottery.start_at ? new Date(lottery.start_at).getTime() : null;
  const endTime = lottery.end_at ? new Date(lottery.end_at).getTime() : null;

  if (startTime !== null && (!Number.isFinite(startTime) || nowTime < startTime)) return false;
  if (endTime !== null && (!Number.isFinite(endTime) || nowTime > endTime)) return false;

  return true;
};

const isLotteryEligible = (lottery: Lottery, totalAmount: number) => {
  if (totalAmount < lottery.min_total) return false;
  if (lottery.max_total != null && totalAmount > lottery.max_total) return false;

  return true;
};

const sanitizeLotteryInput = (input: LotteryFormInput): LotteryFormInput => {
  const name = input.name.trim();
  const minTotal = Number(input.min_total);
  const maxTotal = input.max_total == null || input.max_total === undefined
    ? null
    : Number(input.max_total);
  const startAt = input.start_at || null;
  const endAt = input.end_at || null;

  if (!name) {
    throw new Error('Nama undian wajib diisi.');
  }

  if (!Number.isFinite(minTotal) || minTotal <= 0) {
    throw new Error('Minimal pembelian harus lebih besar dari 0.');
  }

  if (maxTotal !== null) {
    if (!Number.isFinite(maxTotal) || maxTotal <= minTotal) {
      throw new Error('Maksimal pembelian harus lebih besar dari minimal pembelian.');
    }
  }

  if (startAt && endAt && new Date(startAt).getTime() > new Date(endAt).getTime()) {
    throw new Error('Tanggal mulai undian tidak boleh melewati tanggal selesai.');
  }

  return {
    name,
    min_total: minTotal,
    max_total: maxTotal,
    start_at: startAt,
    end_at: endAt,
    active: Boolean(input.active),
  };
};

export const getActiveLotteries = async (now: Date = new Date()): Promise<Lottery[]> => {
  const lotteries = await db.lotteries.toArray();
  return lotteries.filter((lottery) => lottery.active && isLotteryInDateRange(lottery, now));
};

export const evaluateLotteryForTransaction = ({
  totalAmount,
  lotteries,
  now = new Date(),
  cashierName,
}: {
  totalAmount: number;
  lotteries: Lottery[];
  now?: Date;
  cashierName?: string;
}): LotteryEvaluationResult => {
  const eligibleLotteries = lotteries
    .filter((lottery) => lottery.active)
    .filter((lottery) => isLotteryInDateRange(lottery, now))
    .filter((lottery) => isLotteryEligible(lottery, totalAmount))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  const bestLottery = eligibleLotteries[0];
  if (!bestLottery) return {};

  return {
    lottery_number: buildLotteryNumber(now, cashierName),
    lottery_id: bestLottery.id,
    lottery_name: bestLottery.name,
  };
};

export const createLottery = async (input: LotteryFormInput): Promise<Lottery> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'LOTTERY_MANAGE');

  const now = new Date().toISOString();
  const lottery: Lottery = {
    id: crypto.randomUUID(),
    ...sanitizeLotteryInput(input),
    created_by: currentUser?.id,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
  };

  await db.lotteries.add(lottery);
  await writeActivityLog({
    user: currentUser,
    action: 'LOTTERY_CREATED',
    entity: 'lotteries',
    entity_id: lottery.id,
    description: `${currentUser?.name ?? 'User'} membuat undian ${lottery.name}.`,
  });
  await enqueueLotterySync(lottery, 'create');

  return lottery;
};

export const updateLottery = async (lotteryId: string, input: LotteryFormInput): Promise<Lottery> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'LOTTERY_MANAGE');

  const existingLottery = await db.lotteries.get(lotteryId);
  if (!existingLottery) {
    throw new Error('Undian tidak ditemukan.');
  }

  const updatedLottery: Lottery = {
    ...existingLottery,
    ...sanitizeLotteryInput(input),
    updated_at: new Date().toISOString(),
    sync_status: 'pending',
    sync_error: undefined,
  };

  await db.lotteries.put(updatedLottery);
  await writeActivityLog({
    user: currentUser,
    action: 'LOTTERY_UPDATED',
    entity: 'lotteries',
    entity_id: lotteryId,
    description: `${currentUser?.name ?? 'User'} memperbarui undian ${updatedLottery.name}.`,
  });
  await enqueueLotterySync(updatedLottery, 'update');

  return updatedLottery;
};

export const deleteLottery = async (lotteryId: string): Promise<void> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'LOTTERY_MANAGE');

  const lottery = await db.lotteries.get(lotteryId);
  if (!lottery) {
    throw new Error('Undian tidak ditemukan.');
  }

  await db.lotteries.delete(lotteryId);
  await writeActivityLog({
    user: currentUser,
    action: 'LOTTERY_DELETED',
    entity: 'lotteries',
    entity_id: lotteryId,
    description: `${currentUser?.name ?? 'User'} menghapus undian ${lottery.name}.`,
  });
  await enqueueLotterySync(lottery, 'delete');
};
