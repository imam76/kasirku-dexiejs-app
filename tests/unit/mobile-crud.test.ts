import { describe, expect, test } from 'bun:test';
import {
  getMobileCrudRemainingCount,
  getNextMobileCrudVisibleCount,
} from '../../src/utils/mobileCrud';

describe('mobile CRUD progressive disclosure', () => {
  test('menambah window secara bertahap dan berhenti tepat di total item', () => {
    expect(getNextMobileCrudVisibleCount(45, 20, 20)).toBe(40);
    expect(getNextMobileCrudVisibleCount(45, 40, 20)).toBe(45);
    expect(getNextMobileCrudVisibleCount(45, 45, 20)).toBe(45);
  });

  test('remaining count tidak pernah negatif', () => {
    expect(getMobileCrudRemainingCount(45, 20)).toBe(25);
    expect(getMobileCrudRemainingCount(45, 60)).toBe(0);
  });

  test('input defensif tetap deterministik dan tidak membuat window mundur', () => {
    expect(getNextMobileCrudVisibleCount(10, -2, 0)).toBe(1);
    expect(getMobileCrudRemainingCount(-10, -2)).toBe(0);
  });
});
