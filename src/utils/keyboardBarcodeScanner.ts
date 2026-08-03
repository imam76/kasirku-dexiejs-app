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
