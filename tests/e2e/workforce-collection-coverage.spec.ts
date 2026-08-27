import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';

test('workforce onboarding, leave reservation, member default, and coverage resolver stay integrated', async ({ page }) => {
  await loginAsBootstrappedOwner(page);

  const result = await page.evaluate(async () => {
    const [
      { db },
      dayjsModule,
      hr,
      access,
      areaService,
      assignments,
      members,
      workforce,
      coverage,
    ] = await Promise.all([
      import('/src/lib/db.ts'),
      import('/src/lib/dayjs.ts'),
      import('/src/services/hrService.ts'),
      import('/src/services/employeeAccessService.ts'),
      import('/src/services/cooperativeAreaService.ts'),
      import('/src/services/collectionAssignmentService.ts'),
      import('/src/services/cooperativeMemberService.ts'),
      import('/src/services/workforceService.ts'),
      import('/src/services/collectionCoverageService.ts'),
    ]);
    const dayjs = dayjsModule.default;
    let collectionDay = dayjs().tz().add(35, 'day').startOf('day');
    while (collectionDay.day() !== 1) collectionDay = collectionDay.add(1, 'day');
    const collectionDate = collectionDay.format('YYYY-MM-DD');
    const rescheduledDate = collectionDay.add(1, 'day').format('YYYY-MM-DD');
    const now = new Date().toISOString();

    const original = await hr.createHrEmployee({
      name: 'Petugas Asal Coverage E2E',
      personal_email: 'collector.original@example.test',
      join_date: collectionDay.subtract(1, 'year').format('YYYY-MM-DD'),
      employment_status: 'PERMANENT',
      active_status: 'ACTIVE',
      work_schedule_type: 'FULL_TIME',
      salary_payment_method: 'CASH',
      base_salary: 4_000_000,
      salary_currency: 'IDR',
      payroll_period: 'MONTHLY',
      is_taxable: false,
      is_bpjs_participant: false,
    });
    const substitute = await hr.createHrEmployee({
      name: 'Petugas Pengganti Coverage E2E',
      personal_email: 'collector.substitute@example.test',
      join_date: collectionDay.subtract(1, 'year').format('YYYY-MM-DD'),
      employment_status: 'PERMANENT',
      active_status: 'ACTIVE',
      work_schedule_type: 'FULL_TIME',
      salary_payment_method: 'CASH',
      base_salary: 4_000_000,
      salary_currency: 'IDR',
      payroll_period: 'MONTHLY',
      is_taxable: false,
      is_bpjs_participant: false,
    });

    const adminRole = await db.roles.where('code').equals('ADMIN').first();
    if (!adminRole) throw new Error('Role ADMIN tidak tersedia.');
    const linkedUser = await access.createOrLinkEmployeeUser({
      employee_id: original.id,
      email: 'collector.original@example.test',
      role_id: adminRole.id,
      pin: '654321',
    });
    const accessSummary = await access.getEmployeeAccessSummary(original.id);

    const template = await workforce.saveWorkScheduleTemplate({
      code: 'E2E-WEEKDAY',
      name: 'Weekday Coverage E2E',
      days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday: weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        is_working_day: weekday <= 5,
        start_time: weekday <= 5 ? '08:00' : undefined,
        end_time: weekday <= 5 ? '17:00' : undefined,
      })),
    });
    await workforce.assignEmployeeWorkSchedule({
      employee_id: original.id,
      template_id: template.id,
      effective_from: collectionDay.subtract(1, 'year').format('YYYY-MM-DD'),
    });

    const area = await areaService.createCooperativeArea({
      code: 'E2E-COV',
      name: 'Area Coverage E2E',
      is_active: true,
    });
    await assignments.assignEmployeeArea({
      employee_id: original.id,
      area_id: area.id,
      effective_from: collectionDay.subtract(1, 'year').format('YYYY-MM-DD'),
      is_primary: true,
    });
    await assignments.assignEmployeeArea({
      employee_id: substitute.id,
      area_id: area.id,
      effective_from: collectionDay.subtract(1, 'year').format('YYYY-MM-DD'),
    });
    const schedule = await assignments.saveCollectionSchedule({
      employee_id: original.id,
      area_id: area.id,
      weekday: 1,
      effective_from: collectionDay.subtract(1, 'year').format('YYYY-MM-DD'),
      is_default_for_new_members: true,
    });
    const member = await members.createCooperativeMember({
      name: 'Anggota Default Coverage E2E',
      area_id: area.id,
      join_date: collectionDay.subtract(2, 'day').format('YYYY-MM-DD'),
      status: 'ACTIVE',
    });

    let leaveType = await db.leaveTypes.where('code').equals('ANNUAL').first();
    if (!leaveType) {
      leaveType = await workforce.saveLeaveType({
        code: 'ANNUAL',
        name: 'Cuti Tahunan',
        is_paid: true,
        requires_balance: true,
        annual_quota_days: 12,
      });
    }
    await workforce.grantAnnualLeave(original.id, leaveType.id, collectionDay.year(), 12);
    const draft = await workforce.createLeaveRequest({
      employee_id: original.id,
      leave_type_id: leaveType.id,
      start_date: collectionDate,
      end_date: collectionDate,
      reason: 'Cuti untuk pengujian coverage',
    });
    const submitted = await workforce.submitLeaveRequest(draft.id);
    const balanceAfterSubmit = await workforce.getLeaveBalance(
      original.id,
      leaveType.id,
      collectionDay.year(),
    );
    let offlineApprovalMessage = '';
    try {
      await workforce.approveLeaveAsHr(draft.id);
    } catch (error) {
      offlineApprovalMessage = error instanceof Error ? error.message : String(error);
    }

    await db.transaction(
      'rw',
      [db.leaveRequests, db.employeeAvailabilityExceptions, db.collectionCoverageExceptions],
      async () => {
        await db.leaveRequests.update(draft.id, {
          status: 'APPROVED',
          hr_decided_at: now,
          updated_at: now,
        });
        await db.employeeAvailabilityExceptions.put({
          id: `${draft.id}:${collectionDate}`,
          employee_id: original.id,
          date: collectionDate,
          source_type: 'LEAVE',
          source_id: draft.id,
          reason: draft.reason,
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
        await db.collectionCoverageExceptions.put({
          id: `${schedule.id}:${collectionDate}`,
          collection_schedule_id: schedule.id,
          area_id: area.id,
          area_name: area.name,
          original_employee_id: original.id,
          original_employee_name: original.name,
          collection_date: collectionDate,
          source_leave_request_id: draft.id,
          status: 'OPEN',
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
      },
    );

    const blockedWorklist = await coverage.getCollectionWorklist(collectionDate);
    let originalCollectorMessage = '';
    try {
      await coverage.assertCollectorCanCollect(member.id, collectionDate, original.id);
    } catch (error) {
      originalCollectorMessage = error instanceof Error ? error.message : String(error);
    }

    await db.collectionCoverageExceptions.update(`${schedule.id}:${collectionDate}`, {
      status: 'RESOLVED',
      resolution_type: 'SUBSTITUTE',
      replacement_employee_id: substitute.id,
      replacement_employee_name: substitute.name,
      resolved_at: now,
      resolved_by: linkedUser.id,
      resolved_by_name: linkedUser.name,
      updated_at: now,
    });
    const substituteWorklist = await coverage.getCollectionWorklist(collectionDate);
    await coverage.assertCollectorCanCollect(member.id, collectionDate, substitute.id);

    const memberDuringLeave = await members.createCooperativeMember({
      name: 'Anggota Baru Saat Cuti E2E',
      area_id: area.id,
      join_date: collectionDate,
      status: 'ACTIVE',
    });
    const worklistWithNewMember = await coverage.getCollectionWorklist(collectionDate);

    await db.collectionCoverageExceptions.update(`${schedule.id}:${collectionDate}`, {
      resolution_type: 'RESCHEDULE',
      replacement_employee_id: undefined,
      replacement_employee_name: undefined,
      rescheduled_date: rescheduledDate,
      updated_at: new Date().toISOString(),
    });
    const originalDateAfterReschedule = await coverage.getCollectionWorklist(collectionDate);
    const rescheduledWorklist = await coverage.getCollectionWorklist(rescheduledDate);

    const workflowQueue = await db.syncQueue
      .filter((item) => item.entity === 'leaveWorkflows' && item.entity_id === draft.id)
      .toArray();

    return {
      accessLinked: accessSummary.user?.id === linkedUser.id && accessSummary.is_login_enabled,
      employeeCredentialStillEmpty: !original.pin_hash && !original.pin_salt,
      scheduleId: schedule.id,
      memberScheduleId: member.collection_schedule_id,
      memberOfficerId: member.officer_id,
      submittedStatus: submitted.status,
      balanceAfterSubmit,
      offlineApprovalMessage,
      blockedRows: blockedWorklist.length,
      allBlocked: blockedWorklist.every((row) => row.is_blocked && !row.effective_employee_id),
      originalCollectorMessage,
      substituteRows: substituteWorklist.length,
      substituteCollectorIds: Array.from(new Set(substituteWorklist.map((row) => row.effective_employee_id))),
      newMemberScheduleId: memberDuringLeave.collection_schedule_id,
      newMemberEffectiveCollector: worklistWithNewMember.find((row) => row.member_id === memberDuringLeave.id)?.effective_employee_id,
      originalDateAfterReschedule: originalDateAfterReschedule.length,
      rescheduledRows: rescheduledWorklist.length,
      rescheduledCollectorIds: Array.from(new Set(rescheduledWorklist.map((row) => row.effective_employee_id))),
      workflowQueueCount: workflowQueue.length,
    };
  });

  expect(result).toMatchObject({
    accessLinked: true,
    employeeCredentialStillEmpty: true,
    memberScheduleId: result.scheduleId,
    memberOfficerId: expect.any(String),
    submittedStatus: 'PENDING_HR',
    balanceAfterSubmit: {
      available: 11,
      reserved: 1,
      used: 0,
    },
    blockedRows: 1,
    allBlocked: true,
    substituteRows: 1,
    substituteCollectorIds: [expect.any(String)],
    newMemberScheduleId: result.scheduleId,
    newMemberEffectiveCollector: result.substituteCollectorIds[0],
    originalDateAfterReschedule: 0,
    rescheduledRows: 2,
    rescheduledCollectorIds: [result.memberOfficerId],
  });
  expect(result.offlineApprovalMessage).toContain('PostgreSQL');
  expect(result.originalCollectorMessage).toContain('coverage');
  expect(result.workflowQueueCount).toBeGreaterThanOrEqual(2);

  const pages = [
    ['/hr/work-schedules', 'Jadwal Kerja'],
    ['/hr/leave', 'Cuti & Ketersediaan'],
    ['/koperasi/collection-assignments', 'Penugasan Penagihan'],
    ['/koperasi/coverage-conflicts', 'Konflik Coverage'],
  ] as const;
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText(/gagal dimuat/i)).toHaveCount(0);
  }
});
