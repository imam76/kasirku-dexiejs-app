import type {
  AccountingPeriod,
  FixedAsset,
  FixedAssetDepreciationRunStatus,
  FixedAssetDepreciationRunLine,
  FixedAssetDerivedStatus,
  FixedAssetRegistrationType,
} from '@/types';

export const roundFixedAssetMoney = (value: number) => (
  Math.round((Number(value) + Number.EPSILON) * 100) / 100
);

const dateOnly = (value: string) => value.slice(0, 10);

const parseDate = (value: string) => {
  const [year, month, day] = dateOnly(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDate = (value: Date) => [
  value.getUTCFullYear(),
  String(value.getUTCMonth() + 1).padStart(2, '0'),
  String(value.getUTCDate()).padStart(2, '0'),
].join('-');

export const firstDayOfNextMonth = (value: string) => {
  const date = parseDate(value);
  return formatDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)));
};

export const lastDayOfMonth = (value: string) => {
  const date = parseDate(value);
  return formatDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
};

export const addMonths = (value: string, months: number) => {
  const date = parseDate(value);
  return formatDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate())));
};

export interface FixedAssetPolicyInput {
  registration_type: FixedAssetRegistrationType;
  available_for_use_date: string;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  opening_balance_date?: string;
  opening_accumulated_depreciation?: number;
  opening_remaining_useful_life_months?: number;
}

export const calculateFixedAssetPolicy = (input: FixedAssetPolicyInput) => {
  const totalDepreciableAmount = roundFixedAssetMoney(input.acquisition_cost - input.residual_value);
  const openingAccumulated = input.registration_type === 'EXISTING'
    ? roundFixedAssetMoney(input.opening_accumulated_depreciation ?? 0)
    : 0;
  const depreciableAmount = roundFixedAssetMoney(totalDepreciableAmount - openingAccumulated);
  const scheduleMonths = input.registration_type === 'EXISTING'
    ? (input.opening_remaining_useful_life_months ?? 0)
    : input.useful_life_months;
  const policyDate = input.registration_type === 'EXISTING'
    ? input.opening_balance_date
    : input.available_for_use_date;

  return {
    depreciationStartDate: policyDate ? firstDayOfNextMonth(policyDate) : '',
    depreciationEndDate: policyDate && scheduleMonths > 0
      ? lastDayOfMonth(addMonths(firstDayOfNextMonth(policyDate), scheduleMonths - 1))
      : '',
    regularDepreciationAmount: scheduleMonths > 0
      ? roundFixedAssetMoney(depreciableAmount / scheduleMonths)
      : 0,
    depreciableAmount,
  };
};

export type FixedAssetPostedLine = Pick<
  FixedAssetDepreciationRunLine,
  'asset_id' | 'depreciation_amount'
> & {
  period_id?: string;
  period_end?: string;
  run_status?: FixedAssetDepreciationRunStatus;
};

const effectivePostedLines = (
  asset: Pick<FixedAsset, 'id'>,
  postedLines: FixedAssetPostedLine[],
  asOfDate?: string,
) => postedLines.filter((line) => (
  line.asset_id === asset.id &&
  line.run_status !== 'REVERSED' &&
  (!asOfDate || !line.period_end || dateOnly(line.period_end) <= dateOnly(asOfDate))
));

export const calculateFixedAssetPosition = (
  asset: FixedAsset,
  postedLines: FixedAssetPostedLine[],
  asOfDate: string,
): {
  accumulatedDepreciation: number;
  bookValue: number;
  remainingDepreciableAmount: number;
  derivedStatus: FixedAssetDerivedStatus;
} => {
  const postedAmount = effectivePostedLines(asset, postedLines, asOfDate)
    .reduce((sum, line) => sum + line.depreciation_amount, 0);
  const maximumAccumulation = roundFixedAssetMoney(asset.acquisition_cost - asset.residual_value);
  const accumulatedDepreciation = Math.min(
    maximumAccumulation,
    roundFixedAssetMoney(asset.opening_accumulated_depreciation + postedAmount),
  );
  const bookValue = Math.max(
    asset.residual_value,
    roundFixedAssetMoney(asset.acquisition_cost - accumulatedDepreciation),
  );
  const remainingDepreciableAmount = Math.max(
    0,
    roundFixedAssetMoney(bookValue - asset.residual_value),
  );
  const derivedStatus: FixedAssetDerivedStatus = !asset.is_active
    ? 'ARCHIVED'
    : remainingDepreciableAmount <= 0
      ? 'FULLY_DEPRECIATED'
      : dateOnly(asOfDate) < dateOnly(asset.depreciation_start_date)
        ? 'NOT_STARTED'
        : 'DEPRECIATING';

  return {
    accumulatedDepreciation,
    bookValue,
    remainingDepreciableAmount,
    derivedStatus,
  };
};

export const calculateDepreciationForPeriod = (
  asset: FixedAsset,
  postedLines: FixedAssetPostedLine[],
  period: Pick<AccountingPeriod, 'id' | 'period_type' | 'start_date' | 'end_date'>,
) => {
  const linesBeforePeriod = effectivePostedLines(asset, postedLines)
    .filter((line) => !line.period_end || dateOnly(line.period_end) < dateOnly(period.start_date));
  const alreadyPosted = effectivePostedLines(asset, postedLines)
    .some((line) => line.period_id === period.id || (
      line.period_end && dateOnly(line.period_end) >= dateOnly(period.start_date) && dateOnly(line.period_end) <= dateOnly(period.end_date)
    ));
  const postedAmount = linesBeforePeriod.reduce((sum, line) => sum + line.depreciation_amount, 0);
  const maximumAccumulation = roundFixedAssetMoney(asset.acquisition_cost - asset.residual_value);
  const openingAccumulatedDepreciation = Math.min(
    maximumAccumulation,
    roundFixedAssetMoney(asset.opening_accumulated_depreciation + postedAmount),
  );
  const openingBookValue = Math.max(
    asset.residual_value,
    roundFixedAssetMoney(asset.acquisition_cost - openingAccumulatedDepreciation),
  );
  const remaining = Math.max(0, roundFixedAssetMoney(openingBookValue - asset.residual_value));
  const scheduleMonths = asset.registration_type === 'EXISTING'
    ? (asset.opening_remaining_useful_life_months ?? 0)
    : asset.useful_life_months;
  const isLastScheduledLine = linesBeforePeriod.length >= Math.max(0, scheduleMonths - 1);
  const eligible = (
    asset.is_active &&
    period.period_type === 'MONTHLY' &&
    dateOnly(period.end_date) >= dateOnly(asset.depreciation_start_date) &&
    remaining > 0 &&
    !alreadyPosted
  );
  const depreciationAmount = !eligible
    ? 0
    : isLastScheduledLine
      ? remaining
      : Math.min(asset.regular_depreciation_amount, remaining);
  const normalizedDepreciation = roundFixedAssetMoney(depreciationAmount);
  const closingAccumulatedDepreciation = roundFixedAssetMoney(
    openingAccumulatedDepreciation + normalizedDepreciation,
  );
  const closingBookValue = Math.max(
    asset.residual_value,
    roundFixedAssetMoney(asset.acquisition_cost - closingAccumulatedDepreciation),
  );

  return {
    eligible,
    depreciationAmount: normalizedDepreciation,
    openingAccumulatedDepreciation,
    openingBookValue,
    closingAccumulatedDepreciation,
    closingBookValue,
  };
};

export const buildFixedAssetDepreciationSchedule = (
  asset: FixedAsset,
  postedLines: FixedAssetPostedLine[],
) => {
  const scheduleMonths = asset.registration_type === 'EXISTING'
    ? (asset.opening_remaining_useful_life_months ?? 0)
    : asset.useful_life_months;
  const simulatedLines = [...postedLines];
  return Array.from({ length: scheduleMonths }, (_, index) => {
    const periodStart = addMonths(asset.depreciation_start_date, index);
    const periodEnd = lastDayOfMonth(periodStart);
    const periodId = `schedule:${periodStart.slice(0, 7)}`;
    const actual = postedLines.find((line) => line.asset_id === asset.id && line.period_end?.slice(0, 7) === periodStart.slice(0, 7) && line.run_status === 'POSTED');
    const calculation = calculateDepreciationForPeriod(asset, simulatedLines, {
      id: periodId,
      period_type: 'MONTHLY',
      start_date: periodStart,
      end_date: periodEnd,
    });
    const amount = actual?.depreciation_amount ?? calculation.depreciationAmount;
    const closingAccumulatedDepreciation = roundFixedAssetMoney(calculation.openingAccumulatedDepreciation + amount);
    const closingBookValue = Math.max(asset.residual_value, roundFixedAssetMoney(asset.acquisition_cost - closingAccumulatedDepreciation));
    if (!actual && amount > 0) {
      simulatedLines.push({
        asset_id: asset.id,
        depreciation_amount: amount,
        period_id: periodId,
        period_end: periodEnd,
        run_status: 'POSTED',
      });
    }
    return {
      periodStart,
      periodEnd,
      depreciationAmount: amount,
      openingBookValue: calculation.openingBookValue,
      closingAccumulatedDepreciation,
      closingBookValue,
      status: actual ? 'POSTED' as const : 'PROJECTED' as const,
    };
  });
};
