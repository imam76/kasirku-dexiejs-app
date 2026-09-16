export const KEYBOARD_BARCODE_MAX_INTERVAL_MS = 100;
export const KEYBOARD_BARCODE_MIN_LENGTH = 3;

export interface KeyboardBarcodeBuffer {
  value: string;
  lastKeyAt: number;
}

export const isKeyboardBarcodeBufferActive = (
  buffer: KeyboardBarcodeBuffer | null,
  keyAt: number,
  maxIntervalMs = KEYBOARD_BARCODE_MAX_INTERVAL_MS,
) => Boolean(
  buffer
  && keyAt >= buffer.lastKeyAt
  && keyAt - buffer.lastKeyAt <= maxIntervalMs,
);

export const appendKeyboardBarcodeCharacter = (
  buffer: KeyboardBarcodeBuffer | null,
  character: string,
  keyAt: number,
  maxIntervalMs = KEYBOARD_BARCODE_MAX_INTERVAL_MS,
): KeyboardBarcodeBuffer => {
  const shouldStartNewBuffer = !isKeyboardBarcodeBufferActive(buffer, keyAt, maxIntervalMs);

  return {
    value: shouldStartNewBuffer ? character : `${buffer?.value ?? ''}${character}`,
    lastKeyAt: keyAt,
  };
};

export const finishKeyboardBarcodeScan = (
  buffer: KeyboardBarcodeBuffer | null,
  terminatorAt: number,
  minLength = KEYBOARD_BARCODE_MIN_LENGTH,
  maxIntervalMs = KEYBOARD_BARCODE_MAX_INTERVAL_MS,
) => {
  if (
    !isKeyboardBarcodeBufferActive(buffer, terminatorAt, maxIntervalMs)
    || !buffer
    || buffer.value.length < minLength
  ) {
    return undefined;
  }

  const normalizedCode = buffer.value.trim();
  return normalizedCode.length >= minLength ? normalizedCode : undefined;
};

const QUANTITY_LIKE_CHARACTERS = /^[0-9.,]+$/;

/**
 * Quantity fields need a stricter barcode heuristic than the global POS
 * listener. A cashier can reasonably type a short number very quickly, so a
 * numeric sequence is only treated as a scan once it reaches six digits.
 * Alphanumeric SKUs can be recognized from the normal scanner minimum.
 */
export const isLikelyBarcodeWhileEditingQuantity = (value: string) => {
  const normalizedValue = value.trim();
  if (normalizedValue.length < KEYBOARD_BARCODE_MIN_LENGTH) return false;

  return !QUANTITY_LIKE_CHARACTERS.test(normalizedValue)
    || normalizedValue.replace(/[.,]/g, '').length >= 6;
};
