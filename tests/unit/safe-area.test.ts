import { expect, test } from 'bun:test';
import { initializeSafeAreaInsets } from '@/platform/safeAreaInsets';

test('safe-area initialization is a no-op outside Tauri', async () => {
  const result = await initializeSafeAreaInsets();
  expect(result).toBeUndefined();
});
