import { describe, expect, test } from 'bun:test';
import { isEffectiveDateRangeOverlapping } from '@/services/collectionAssignmentService';
import { buildEffectiveCollectorResolution } from '@/services/collectionCoverageService';
import type { CollectionCoverageException, EmployeeCollectionSchedule } from '@/types';

const schedule: EmployeeCollectionSchedule = {
  id: 'schedule-1',
  employee_id: 'collector-original',
  employee_name: 'Petugas Asal',
  area_id: 'area-1',
  area_name: 'Area Satu',
  weekday: 1,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const conflict = (
  patch: Partial<CollectionCoverageException> = {},
): CollectionCoverageException => ({
  id: 'coverage-1',
  collection_schedule_id: schedule.id,
  area_id: schedule.area_id,
  area_name: schedule.area_name,
  original_employee_id: schedule.employee_id,
  original_employee_name: schedule.employee_name,
  collection_date: '2026-07-27',
  status: 'OPEN',
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  ...patch,
});

describe('collection coverage resolver', () => {
  test('blocks the original route while a leave conflict is unresolved', () => {
    const result = buildEffectiveCollectorResolution({
      schedule,
      date: '2026-07-27',
      directCoverage: conflict(),
      originalEmployeeAvailable: false,
    });

    expect(result.is_blocked).toBe(true);
    expect(result.effective_employee_id).toBeUndefined();
  });

  test('moves the whole route to a valid substitute without changing its base schedule', () => {
    const result = buildEffectiveCollectorResolution({
      schedule,
      date: '2026-07-27',
      directCoverage: conflict({
        status: 'RESOLVED',
        resolution_type: 'SUBSTITUTE',
        replacement_employee_id: 'collector-replacement',
        replacement_employee_name: 'Petugas Pengganti',
      }),
      originalEmployeeAvailable: false,
    });

    expect(result.schedule.id).toBe(schedule.id);
    expect(result.operational_date).toBe('2026-07-27');
    expect(result.effective_employee_id).toBe('collector-replacement');
    expect(result.is_blocked).toBe(false);
  });

  test('moves only the operational worklist date for a reschedule', () => {
    const direct = buildEffectiveCollectorResolution({
      schedule,
      date: '2026-07-27',
      directCoverage: conflict({
        status: 'RESOLVED',
        resolution_type: 'RESCHEDULE',
        rescheduled_date: '2026-07-28',
      }),
      originalEmployeeAvailable: false,
    });
    const moved = buildEffectiveCollectorResolution({
      schedule,
      date: '2026-07-28',
      rescheduledCoverage: conflict({
        status: 'RESOLVED',
        resolution_type: 'RESCHEDULE',
        rescheduled_date: '2026-07-28',
      }),
      originalEmployeeAvailable: true,
    });

    expect(direct.operational_date).toBe('2026-07-28');
    expect(moved.effective_employee_id).toBe(schedule.employee_id);
    expect(moved.schedule.id).toBe(schedule.id);
  });
});

describe('effective period overlap', () => {
  test('treats open periods and touching inclusive dates as overlaps', () => {
    expect(isEffectiveDateRangeOverlapping(
      '2026-01-01',
      undefined,
      '2026-07-01',
      '2026-07-31',
    )).toBe(true);
    expect(isEffectiveDateRangeOverlapping(
      '2026-01-01',
      '2026-01-31',
      '2026-01-31',
      '2026-02-28',
    )).toBe(true);
    expect(isEffectiveDateRangeOverlapping(
      '2026-01-01',
      '2026-01-30',
      '2026-01-31',
      undefined,
    )).toBe(false);
  });
});
