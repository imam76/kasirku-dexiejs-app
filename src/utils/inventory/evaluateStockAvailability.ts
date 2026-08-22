const STOCK_EPSILON = 1e-9;

export interface StockAvailabilityInput {
  availableQuantity: number;
  requestedQuantity: number;
}

export interface StockAvailabilityResult {
  availableQuantity: number;
  requestedQuantity: number;
  shortageQuantity: number;
  isSufficient: boolean;
}

const normalizeAvailableQuantity = (value: number) => (
  Number.isFinite(value) ? value : 0
);

const normalizeRequestedQuantity = (value: number) => (
  Number.isFinite(value) ? Math.max(0, value) : 0
);

/** Shared stock-unit rule for cart previews and authoritative checkout checks. */
export const evaluateStockAvailability = ({
  availableQuantity,
  requestedQuantity,
}: StockAvailabilityInput): StockAvailabilityResult => {
  const available = normalizeAvailableQuantity(availableQuantity);
  const requested = normalizeRequestedQuantity(requestedQuantity);
  const rawShortage = requested - available;
  const shortage = rawShortage > STOCK_EPSILON ? rawShortage : 0;

  return {
    availableQuantity: available,
    requestedQuantity: requested,
    shortageQuantity: shortage,
    isSufficient: shortage === 0,
  };
};
