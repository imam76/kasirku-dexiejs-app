export const AUTH_PIN_LENGTH = 6;
export const AUTH_PIN_PATTERN = /^\d{6}$/;
export const AUTH_PIN_VALIDATION_MESSAGE = 'PIN harus berupa 6 digit angka.';

export const isValidAuthPin = (pin: string) => AUTH_PIN_PATTERN.test(pin);
