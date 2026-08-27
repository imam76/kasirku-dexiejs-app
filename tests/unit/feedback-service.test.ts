import { expect, test } from 'bun:test';
import { isNativeFeedbackRuntime } from '@/services/feedbackService';

test('detects a regular web runtime as non-native', () => {
  expect(isNativeFeedbackRuntime()).toBe(false);
});
