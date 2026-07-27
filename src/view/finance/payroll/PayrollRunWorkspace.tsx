import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dayjs } from 'dayjs';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Statistic,
  Steps,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { TableColumnsType, UploadProps } from 'antd';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  ListChecks,
  RefreshCw,
  Save,
  UploadCloud,
  Users,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import { calculateLeaveWorkingDates } from '@/services/workforceService';
import type {
  Employee,
  EmployeePayrollPeriod,
  EmployeeSalaryComponent,
  EmploymentContract,
  SalaryComponent,
} from '@/types';
import { exportXlsx } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import {
  buildPayrollWorkspaceItems,
  buildPayrollWorkspaceItemsFromRun,
  calculatePayrollWorkspacePreview,
  comparePayrollItemWithPrevious,
  findPayrollOverlapByEmployee,
  findPreviousPayrollRun,
  getPayrollWorkspaceIssues,
  mergePayrollRunItems,
  roundPayrollWorkspaceCurrency,
  type PayrollWorkspaceComparison,
  type PayrollWorkspaceIssue,
  type PayrollWorkspaceItem,
  type PayrollWorkspacePreview,
  type PayrollWorkspaceRunLike,
} from './payrollWorkspace';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

export interface PayrollRunWorkspaceValues {
  period: [Dayjs, Dayjs];
  payroll_period: EmployeePayrollPeriod;
  salary_currency: string;
  notes?: string;
  items: PayrollWorkspaceItem[];
}

interface PayrollRunWorkspaceProps {
  autosaveOwnerId: string;
  employees: Employee[];
  baseCurrencyCode: string;
  baseCurrencySymbol: string;
  salaryComponents: SalaryComponent[];
  employeeSalaryComponents: EmployeeSalaryComponent[];
  employmentContracts: EmploymentContract[];
  cashAdvanceAvailableByEmployee: Record<string, number>;
  payrollRuns: PayrollWorkspaceRunLike[];
  editingRun?: PayrollWorkspaceRunLike | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: PayrollRunWorkspaceValues) => Promise<void>;
}

interface WorkspaceSetup {
  periodStart: string;
  periodEnd: string;
  payrollPeriod: EmployeePayrollPeriod;
  salaryCurrency: string;
  notes: string;
}

interface WorkspaceSnapshot {
  version: 1;
  sourceUpdatedAt?: string;
  savedAt: string;
  step: number;
  setup: WorkspaceSetup;
  items: PayrollWorkspaceItem[];
  selectedEmployeeIds: string[];
}

interface WorkspaceRow {
  item: PayrollWorkspaceItem;
  preview: PayrollWorkspacePreview;
  issues: PayrollWorkspaceIssue[];
  comparison?: PayrollWorkspaceComparison;
}

type RosterStatusFilter = 'ALL' | 'READY' | 'WARNING' | 'BLOCKED';
type PaymentMethodFilter = 'ALL' | 'BANK_TRANSFER' | 'CASH';
type BulkField = 'allowance_amount' | 'bonus_amount' | 'other_deduction_amount';
type BulkMode = 'SET' | 'ADD';

const payrollPeriodOptions: Array<{ value: EmployeePayrollPeriod; label: string }> = [
  { value: 'MONTHLY', label: 'Bulanan' },
  { value: 'WEEKLY', label: 'Mingguan' },
  { value: 'DAILY', label: 'Harian' },
];

const bulkFieldOptions: Array<{ value: BulkField; label: string }> = [
  { value: 'allowance_amount', label: 'Tunjangan' },
  { value: 'bonus_amount', label: 'Bonus/Lembur' },
  { value: 'other_deduction_amount', label: 'Potongan Lain' },
];

const currencyFormatter = (value: string | number | undefined, symbol: string) => (
  `${symbol} ${value ?? 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
);

const currencyParser = (value: string | undefined) => (
  Number(
    value
      ?.replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.') || 0,
  )
);

const normalizeImportHeader = (value: string) => (
  value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
);

const parseImportedAmount = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;

  const normalized = value
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readSnapshot = (
  storageKey: string,
  editingRun?: PayrollWorkspaceRunLike | null,
): WorkspaceSnapshot | undefined => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;

    const snapshot = JSON.parse(raw) as WorkspaceSnapshot;
    if (
      snapshot.version !== 1
      || !snapshot.setup?.periodStart
      || !snapshot.setup?.periodEnd
      || !Array.isArray(snapshot.items)
      || !Array.isArray(snapshot.selectedEmployeeIds)
    ) {
      return undefined;
    }
    if (editingRun && snapshot.sourceUpdatedAt !== editingRun.updated_at) {
      return undefined;
    }
    return snapshot;
  } catch {
    return undefined;
  }
};

const getRowStatus = (issues: PayrollWorkspaceIssue[]) => {
  if (issues.some((issue) => issue.severity === 'ERROR')) return 'BLOCKED' as const;
  if (issues.some((issue) => issue.severity === 'WARNING')) return 'WARNING' as const;
  return 'READY' as const;
};

const renderStatus = (issues: PayrollWorkspaceIssue[]) => {
  const status = getRowStatus(issues);
  if (status === 'BLOCKED') return <Tag color="red">Diblokir</Tag>;
  if (status === 'WARNING') return <Tag color="gold">Perlu dicek</Tag>;
  return <Tag color="green">Siap</Tag>;
};

const getSetupRosterSignature = (setup: WorkspaceSetup) => (
  [
    setup.periodStart,
    setup.periodEnd,
    setup.payrollPeriod,
    setup.salaryCurrency,
  ].join('|')
);

export default function PayrollRunWorkspace({
  autosaveOwnerId,
  employees,
  baseCurrencyCode,
  baseCurrencySymbol,
  salaryComponents,
  employeeSalaryComponents,
  employmentContracts,
  cashAdvanceAvailableByEmployee,
  payrollRuns,
  editingRun,
  submitting,
  onCancel,
  onSubmit,
}: PayrollRunWorkspaceProps) {
  const { message } = App.useApp();
  const storageKey = `kasirku:payroll-workspace:${autosaveOwnerId}:${editingRun?.id ?? 'create'}`;
  const initialRef = useRef<{
    snapshot?: WorkspaceSnapshot;
    setup: WorkspaceSetup;
    items: PayrollWorkspaceItem[];
    selectedEmployeeIds: string[];
    step: number;
    needsHydration: boolean;
  } | null>(null);

  if (!initialRef.current) {
    const snapshot = readSnapshot(storageKey, editingRun);
    const defaultSetup: WorkspaceSetup = editingRun
      ? {
        periodStart: editingRun.period_start,
        periodEnd: editingRun.period_end,
        payrollPeriod: editingRun.payroll_period ?? editingRun.items[0]?.payroll_period ?? 'MONTHLY',
        salaryCurrency: editingRun.salary_currency ?? editingRun.items[0]?.salary_currency ?? baseCurrencyCode,
        notes: editingRun.notes ?? '',
      }
      : {
        periodStart: dayjs().tz().startOf('month').format('YYYY-MM-DD'),
        periodEnd: dayjs().tz().endOf('month').format('YYYY-MM-DD'),
        payrollPeriod: 'MONTHLY',
        salaryCurrency: baseCurrencyCode,
        notes: '',
      };
    const setup = snapshot?.setup ?? defaultSetup;
    const defaults = buildPayrollWorkspaceItems({
      employees,
      assignments: employeeSalaryComponents,
      salaryComponents,
      contracts: employmentContracts,
      periodStart: setup.periodStart,
      periodEnd: setup.periodEnd,
      payrollPeriod: setup.payrollPeriod,
      salaryCurrency: setup.salaryCurrency,
    });
    const persistedItemByEmployeeId = new Map(
      (snapshot?.items ?? []).map((item) => [item.employee_id, item]),
    );
    const fallbackItems = snapshot?.items
      ?? (editingRun ? buildPayrollWorkspaceItemsFromRun(editingRun.items) : []);
    const items = defaults.length === 0 && fallbackItems.length > 0
      ? fallbackItems
      : editingRun
        ? mergePayrollRunItems(defaults, editingRun.items)
        : defaults.map((item) => ({
          ...item,
          ...persistedItemByEmployeeId.get(item.employee_id),
        }));
    const overlapByEmployee = findPayrollOverlapByEmployee({
      runs: payrollRuns,
      periodStart: setup.periodStart,
      periodEnd: setup.periodEnd,
      excludeRunId: editingRun?.id,
    });
    const defaultSelectedEmployeeIds = editingRun
      ? editingRun.items.map((item) => item.employee_id)
      : items
        .filter((item) => !overlapByEmployee.has(item.employee_id))
        .map((item) => item.employee_id);

    initialRef.current = {
      snapshot,
      setup,
      items,
      selectedEmployeeIds: snapshot?.selectedEmployeeIds ?? defaultSelectedEmployeeIds,
      step: snapshot?.step ?? 0,
      needsHydration: defaults.length === 0 && fallbackItems.length > 0,
    };
  }

  const initial = initialRef.current;
  const builtSetupSignatureRef = useRef(getSetupRosterSignature(initial.setup));
  const needsHydrationRef = useRef(initial.needsHydration);
  const [step, setStep] = useState(Math.min(initial.step, 2));
  const [setup, setSetup] = useState<WorkspaceSetup>(initial.setup);
  const [items, setItems] = useState<PayrollWorkspaceItem[]>(initial.items);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(
    initial.selectedEmployeeIds,
  );
  const [rosterSearch, setRosterSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethodFilter>('ALL');
  const [rosterStatusFilter, setRosterStatusFilter] = useState<RosterStatusFilter>('ALL');
  const [bulkSelectedEmployeeIds, setBulkSelectedEmployeeIds] = useState<string[]>([]);
  const [bulkField, setBulkField] = useState<BulkField>('bonus_amount');
  const [bulkMode, setBulkMode] = useState<BulkMode>('SET');
  const [bulkAmount, setBulkAmount] = useState<number>(0);
  const [drawerEmployeeId, setDrawerEmployeeId] = useState<string>();
  const [autosavedAt, setAutosavedAt] = useState(initial.snapshot?.savedAt);
  const leaveImpactByEmployee = useLiveQuery(async () => {
    const [requests, leaveTypes] = await Promise.all([
      db.leaveRequests.where('status').equals('APPROVED').toArray(),
      db.leaveTypes.toArray(),
    ]);
    const leaveTypeById = new Map(leaveTypes.map((row) => [row.id, row]));
    const impact = new Map<string, { paid: number; unpaid: number }>();
    await Promise.all(requests
      .filter((request) => (
        request.start_date <= setup.periodEnd && request.end_date >= setup.periodStart
      ))
      .map(async (request) => {
        const dates = await calculateLeaveWorkingDates(
          request.employee_id,
          request.start_date < setup.periodStart ? setup.periodStart : request.start_date,
          request.end_date > setup.periodEnd ? setup.periodEnd : request.end_date,
        );
        const current = impact.get(request.employee_id) ?? { paid: 0, unpaid: 0 };
        if (leaveTypeById.get(request.leave_type_id)?.is_paid) current.paid += dates.length;
        else current.unpaid += dates.length;
        impact.set(request.employee_id, current);
      }));
    return impact;
  }, [setup.periodStart, setup.periodEnd], new Map<string, { paid: number; unpaid: number }>());

  const buildItemsForSetup = useCallback((nextSetup: WorkspaceSetup, preserveChanges: boolean) => {
    const defaults = buildPayrollWorkspaceItems({
      employees,
      assignments: employeeSalaryComponents,
      salaryComponents,
      contracts: employmentContracts,
      periodStart: nextSetup.periodStart,
      periodEnd: nextSetup.periodEnd,
      payrollPeriod: nextSetup.payrollPeriod,
      salaryCurrency: nextSetup.salaryCurrency,
    });
    const currentByEmployeeId = new Map(items.map((item) => [item.employee_id, item]));
    const nextItems = defaults.map((item) => (
      preserveChanges && currentByEmployeeId.has(item.employee_id)
        ? { ...item, ...currentByEmployeeId.get(item.employee_id) }
        : item
    ));
    const overlapByEmployee = findPayrollOverlapByEmployee({
      runs: payrollRuns,
      periodStart: nextSetup.periodStart,
      periodEnd: nextSetup.periodEnd,
      excludeRunId: editingRun?.id,
    });
    const nextItemIdSet = new Set(nextItems.map((item) => item.employee_id));
    const retainedSelected = selectedEmployeeIds.filter((id) => nextItemIdSet.has(id));
    const nextSelected = editingRun
      ? retainedSelected
      : nextItems
        .filter((item) => !overlapByEmployee.has(item.employee_id))
        .map((item) => item.employee_id);

    setItems(nextItems);
    setSelectedEmployeeIds(nextSelected);
    setBulkSelectedEmployeeIds([]);
  }, [
    editingRun,
    employeeSalaryComponents,
    employees,
    employmentContracts,
    items,
    payrollRuns,
    salaryComponents,
    selectedEmployeeIds,
  ]);

  useEffect(() => {
    if (employees.length === 0) return;
    if (items.length > 0 && !needsHydrationRef.current) return;
    buildItemsForSetup(setup, Boolean(initial.snapshot || editingRun));
    needsHydrationRef.current = false;
  }, [buildItemsForSetup, editingRun, employees.length, initial.snapshot, items.length, setup]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const snapshot: WorkspaceSnapshot = {
        version: 1,
        sourceUpdatedAt: editingRun?.updated_at,
        savedAt,
        step,
        setup,
        items,
        selectedEmployeeIds,
      };

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
        setAutosavedAt(savedAt);
      } catch {
        // A failed browser draft should not block the persisted payroll draft flow.
      }
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [editingRun?.updated_at, items, selectedEmployeeIds, setup, step, storageKey]);

  const overlapByEmployee = useMemo(() => findPayrollOverlapByEmployee({
    runs: payrollRuns,
    periodStart: setup.periodStart,
    periodEnd: setup.periodEnd,
    excludeRunId: editingRun?.id,
  }), [editingRun?.id, payrollRuns, setup.periodEnd, setup.periodStart]);

  const previousRun = useMemo(() => findPreviousPayrollRun({
    runs: payrollRuns,
    periodStart: setup.periodStart,
    payrollPeriod: setup.payrollPeriod,
    salaryCurrency: setup.salaryCurrency,
    excludeRunId: editingRun?.id,
  }), [editingRun?.id, payrollRuns, setup.payrollPeriod, setup.periodStart, setup.salaryCurrency]);

  const previousItemByEmployeeId = useMemo(() => new Map(
    (previousRun?.items ?? []).map((item) => [item.employee_id, item]),
  ), [previousRun]);

  const rows = useMemo<WorkspaceRow[]>(() => items.map((item) => {
    const preview = calculatePayrollWorkspacePreview(item, cashAdvanceAvailableByEmployee);
    return {
      item,
      preview,
      issues: getPayrollWorkspaceIssues({
        item,
        preview,
        overlappingRun: overlapByEmployee.get(item.employee_id),
      }),
      comparison: comparePayrollItemWithPrevious(
        preview,
        previousItemByEmployeeId.get(item.employee_id),
      ),
    };
  }), [
    cashAdvanceAvailableByEmployee,
    items,
    overlapByEmployee,
    previousItemByEmployeeId,
  ]);

  const rowByEmployeeId = useMemo(() => new Map(
    rows.map((row) => [row.item.employee_id, row]),
  ), [rows]);
  const selectedIdSet = useMemo(() => new Set(selectedEmployeeIds), [selectedEmployeeIds]);
  const selectedRows = useMemo(() => (
    rows.filter((row) => selectedIdSet.has(row.item.employee_id))
  ), [rows, selectedIdSet]);

  const summary = useMemo(() => selectedRows.reduce((result, row) => ({
    employeeCount: result.employeeCount + 1,
    gross: roundPayrollWorkspaceCurrency(result.gross + row.preview.gross),
    deduction: roundPayrollWorkspaceCurrency(result.deduction + row.preview.deduction),
    net: roundPayrollWorkspaceCurrency(result.net + row.preview.net),
    warningCount: result.warningCount + row.issues.filter((issue) => issue.severity === 'WARNING').length,
    errorCount: result.errorCount + row.issues.filter((issue) => issue.severity === 'ERROR').length,
    largeChangeCount: result.largeChangeCount
      + (Math.abs(row.comparison?.percentDelta ?? 0) >= 20 ? 1 : 0),
  }), {
    employeeCount: 0,
    gross: 0,
    deduction: 0,
    net: 0,
    warningCount: 0,
    errorCount: 0,
    largeChangeCount: 0,
  }), [selectedRows]);

  const departmentOptions = useMemo(() => (
    Array.from(new Set(items.map((item) => item.employee_department).filter(Boolean)))
      .sort((left, right) => String(left).localeCompare(String(right)))
      .map((department) => ({ value: department as string, label: department as string }))
  ), [items]);

  const filteredRosterRows = useMemo(() => {
    const query = rosterSearch.trim().toLowerCase();
    return rows.filter((row) => {
      const status = getRowStatus(row.issues);
      const matchesQuery = !query || [
        row.item.employee_number,
        row.item.employee_name,
        row.item.employee_position,
        row.item.employee_department,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesDepartment = departmentFilter === 'ALL'
        || row.item.employee_department === departmentFilter;
      const matchesPayment = paymentMethodFilter === 'ALL'
        || (row.item.salary_payment_method ?? 'CASH') === paymentMethodFilter;
      const matchesStatus = rosterStatusFilter === 'ALL' || status === rosterStatusFilter;
      return matchesQuery && matchesDepartment && matchesPayment && matchesStatus;
    });
  }, [departmentFilter, paymentMethodFilter, rosterSearch, rosterStatusFilter, rows]);

  const updateItem = useCallback((
    employeeId: string,
    patch: Partial<PayrollWorkspaceItem>,
  ) => {
    setItems((current) => current.map((item) => (
      item.employee_id === employeeId ? { ...item, ...patch } : item
    )));
  }, []);

  const handleSelectAllFiltered = () => {
    const nextIds = new Set(selectedEmployeeIds);
    filteredRosterRows.forEach((row) => {
      if (getRowStatus(row.issues) !== 'BLOCKED') {
        nextIds.add(row.item.employee_id);
      }
    });
    setSelectedEmployeeIds(Array.from(nextIds));
  };

  const handleApplyBulk = () => {
    if (bulkSelectedEmployeeIds.length === 0) {
      message.warning('Pilih minimal satu karyawan pada tabel penyesuaian.');
      return;
    }
    const targetIds = new Set(bulkSelectedEmployeeIds);
    setItems((current) => current.map((item) => {
      if (!targetIds.has(item.employee_id)) return item;
      const nextValue = bulkMode === 'ADD'
        ? Number(item[bulkField] || 0) + Number(bulkAmount || 0)
        : Number(bulkAmount || 0);
      return {
        ...item,
        [bulkField]: roundPayrollWorkspaceCurrency(Math.max(0, nextValue)),
      };
    }));
    message.success(`${bulkFieldOptions.find((option) => option.value === bulkField)?.label} diperbarui untuk ${targetIds.size} karyawan.`);
  };

  const handleResetFromHris = () => {
    buildItemsForSetup(setup, false);
    builtSetupSignatureRef.current = getSetupRosterSignature(setup);
    message.success('Angka payroll dimuat ulang dari konfigurasi HRIS.');
  };

  const handleExportTemplate = async () => {
    const templateRows = selectedRows.length > 0 ? selectedRows : rows;
    const exported = await exportXlsx({
      filename: `template-payroll-${setup.periodStart}-${setup.periodEnd}.xlsx`,
      sheets: [{
        name: 'Penyesuaian Payroll',
        rows: [
          [
            'Nomor Karyawan',
            'Nama Karyawan',
            'Gaji Pokok',
            'Tunjangan',
            'Bonus Lembur',
            'Potongan Lain',
            'Catatan',
          ],
          ...templateRows.map(({ item }) => [
            item.employee_number ?? '',
            item.employee_name,
            item.base_salary,
            item.allowance_amount,
            item.bonus_amount,
            item.other_deduction_amount,
            item.notes ?? '',
          ]),
        ],
      }],
    });
    if (exported) message.success('Template penyesuaian payroll berhasil dibuat.');
  };

  const handleImportFile: UploadProps['beforeUpload'] = async (file) => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('File tidak memiliki worksheet.');
      const importedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const itemByNumber = new Map(
        items
          .filter((item) => item.employee_number)
          .map((item) => [item.employee_number!.trim().toLowerCase(), item]),
      );
      const itemByName = new Map(
        items.map((item) => [item.employee_name.trim().toLowerCase(), item]),
      );
      const patches = new Map<string, Partial<PayrollWorkspaceItem>>();
      let unmatched = 0;

      importedRows.forEach((rawRow) => {
        const normalized = Object.fromEntries(
          Object.entries(rawRow).map(([key, value]) => [normalizeImportHeader(key), value]),
        );
        const employeeNumber = String(
          normalized.nomorkaryawan ?? normalized.employeenumber ?? '',
        ).trim().toLowerCase();
        const employeeName = String(
          normalized.namakaryawan ?? normalized.employeename ?? '',
        ).trim().toLowerCase();
        const item = (employeeNumber ? itemByNumber.get(employeeNumber) : undefined)
          ?? (employeeName ? itemByName.get(employeeName) : undefined);
        if (!item) {
          unmatched += 1;
          return;
        }

        const patch: Partial<PayrollWorkspaceItem> = {};
        const amountMappings: Array<[keyof PayrollWorkspaceItem, unknown]> = [
          ['base_salary', normalized.gajipokok ?? normalized.basesalary],
          ['allowance_amount', normalized.tunjangan ?? normalized.allowance],
          ['bonus_amount', normalized.bonuslembur ?? normalized.bonus ?? normalized.overtime],
          ['other_deduction_amount', normalized.potonganlain ?? normalized.deduction],
        ];
        amountMappings.forEach(([field, value]) => {
          const parsed = parseImportedAmount(value);
          if (parsed !== undefined) {
            (patch as Record<string, unknown>)[field] = Math.max(0, parsed);
          }
        });
        const notes = normalized.catatan ?? normalized.notes;
        if (typeof notes === 'string' && notes.trim()) patch.notes = notes.trim();
        patches.set(item.employee_id, patch);
      });

      if (patches.size === 0) {
        throw new Error('Tidak ada karyawan pada file yang cocok dengan roster payroll.');
      }
      setItems((current) => current.map((item) => (
        patches.has(item.employee_id)
          ? { ...item, ...patches.get(item.employee_id) }
          : item
      )));
      setSelectedEmployeeIds((current) => {
        const next = new Set(current);
        patches.forEach((_, employeeId) => {
          if (!overlapByEmployee.has(employeeId)) next.add(employeeId);
        });
        return Array.from(next);
      });
      message.success(
        `${patches.size} karyawan diperbarui dari Excel${unmatched > 0 ? `; ${unmatched} baris tidak ditemukan` : ''}.`,
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal membaca file Excel.');
    }
    return Upload.LIST_IGNORE;
  };

  const handleSubmit = async () => {
    if (selectedRows.length === 0) {
      message.warning('Pilih minimal satu karyawan.');
      return;
    }
    if (summary.errorCount > 0) {
      message.error('Selesaikan semua masalah yang memblokir sebelum menyimpan draft.');
      return;
    }

    await onSubmit({
      period: [dayjs(setup.periodStart).tz(), dayjs(setup.periodEnd).tz()],
      payroll_period: setup.payrollPeriod,
      salary_currency: setup.salaryCurrency,
      notes: setup.notes.trim() || undefined,
      items: selectedRows.map((row) => row.item),
    });
    window.localStorage.removeItem(storageKey);
  };

  const rosterColumns: TableColumnsType<WorkspaceRow> = [
    {
      title: 'Karyawan',
      key: 'employee',
      width: 270,
      fixed: 'left',
      render: (_, row) => (
        <div>
          <div className="font-medium text-gray-900">
            {row.item.employee_number ? `${row.item.employee_number} - ` : ''}{row.item.employee_name}
          </div>
          <div className="text-xs text-gray-500">
            {[row.item.employee_position, row.item.employee_department].filter(Boolean).join(' • ') || '-'}
          </div>
        </div>
      ),
    },
    {
      title: 'Pembayaran',
      key: 'payment',
      width: 150,
      render: (_, row) => (
        <Tag color={row.item.salary_payment_method === 'BANK_TRANSFER' ? 'blue' : 'default'}>
          {row.item.salary_payment_method === 'BANK_TRANSFER' ? 'Transfer' : 'Tunai'}
        </Tag>
      ),
    },
    {
      title: 'Cuti',
      key: 'leave',
      width: 150,
      render: (_, row) => {
        const impact = leaveImpactByEmployee.get(row.item.employee_id);
        if (!impact || (!impact.paid && !impact.unpaid)) return '-';
        return (
          <Space size={4} wrap>
            {impact.paid > 0 && <Tag color="blue">{impact.paid} paid</Tag>}
            {impact.unpaid > 0 && <Tag color="orange">{impact.unpaid} unpaid</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Gaji Pokok',
      key: 'base',
      width: 150,
      align: 'right',
      render: (_, row) => `${baseCurrencySymbol} ${formatCurrency(row.item.base_salary)}`,
    },
    {
      title: 'Estimasi Net',
      key: 'net',
      width: 160,
      align: 'right',
      render: (_, row) => (
        <span className="font-semibold">{baseCurrencySymbol} {formatCurrency(row.preview.net)}</span>
      ),
    },
    {
      title: 'Vs periode lalu',
      key: 'comparison',
      width: 160,
      render: (_, row) => row.comparison ? (
        <span className={row.comparison.amountDelta < 0 ? 'text-red-600' : 'text-green-700'}>
          {row.comparison.amountDelta >= 0 ? '+' : ''}{baseCurrencySymbol} {formatCurrency(row.comparison.amountDelta)}
          {row.comparison.percentDelta !== undefined && (
            <span className="ml-1 text-xs">({row.comparison.percentDelta >= 0 ? '+' : ''}{row.comparison.percentDelta}%)</span>
          )}
        </span>
      ) : <Text type="secondary">Baru</Text>,
    },
    {
      title: 'Status',
      key: 'status',
      width: 230,
      fixed: 'right',
      render: (_, row) => (
        <div>
          {renderStatus(row.issues)}
          {row.issues[0] && <div className="mt-1 text-xs text-gray-500">{row.issues[0].message}</div>}
        </div>
      ),
    },
  ];

  const reviewColumns: TableColumnsType<WorkspaceRow> = [
    {
      title: 'Karyawan',
      key: 'employee',
      width: 270,
      fixed: 'left',
      render: (_, row) => (
        <div>
          <div className="font-medium">
            {row.item.employee_number ? `${row.item.employee_number} - ` : ''}{row.item.employee_name}
          </div>
          <div className="text-xs text-gray-500">{row.item.employee_department || '-'}</div>
        </div>
      ),
    },
    {
      title: 'Gaji Pokok',
      key: 'base',
      width: 150,
      align: 'right',
      render: (_, row) => `${baseCurrencySymbol} ${formatCurrency(row.item.base_salary)}`,
    },
    {
      title: 'Cuti',
      key: 'leave',
      width: 150,
      render: (_, row) => {
        const impact = leaveImpactByEmployee.get(row.item.employee_id);
        if (!impact || (!impact.paid && !impact.unpaid)) return '-';
        return `${impact.paid} paid / ${impact.unpaid} unpaid`;
      },
    },
    {
      title: 'Pendapatan',
      key: 'earnings',
      width: 160,
      align: 'right',
      render: (_, row) => (
        <div>
          <div>{baseCurrencySymbol} {formatCurrency(row.item.allowance_amount + row.item.bonus_amount)}</div>
          <div className="text-xs text-gray-400">Tunjangan + bonus</div>
        </div>
      ),
    },
    {
      title: 'Potongan',
      key: 'deduction',
      width: 160,
      align: 'right',
      render: (_, row) => (
        <div className="text-red-600">
          <div>{baseCurrencySymbol} {formatCurrency(row.preview.deduction)}</div>
          {row.preview.cashAdvanceDeduction > 0 && (
            <div className="text-xs">Kasbon {baseCurrencySymbol} {formatCurrency(row.preview.cashAdvanceDeduction)}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Net',
      key: 'net',
      width: 160,
      align: 'right',
      render: (_, row) => (
        <span className="font-semibold text-green-700">
          {baseCurrencySymbol} {formatCurrency(row.preview.net)}
        </span>
      ),
    },
    {
      title: 'Perubahan',
      key: 'comparison',
      width: 130,
      render: (_, row) => row.comparison?.percentDelta !== undefined ? (
        <Tag color={Math.abs(row.comparison.percentDelta) >= 20 ? 'gold' : 'default'}>
          {row.comparison.percentDelta >= 0 ? '+' : ''}{row.comparison.percentDelta}%
        </Tag>
      ) : <Text type="secondary">Baru</Text>,
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      render: (_, row) => renderStatus(row.issues),
    },
    {
      title: '',
      key: 'detail',
      width: 80,
      fixed: 'right',
      render: (_, row) => (
        <Button
          type="text"
          icon={<Eye size={16} />}
          onClick={() => setDrawerEmployeeId(row.item.employee_id)}
          aria-label={`Detail ${row.item.employee_name}`}
        >
          Detail
        </Button>
      ),
    },
  ];

  const drawerRow = drawerEmployeeId ? rowByEmployeeId.get(drawerEmployeeId) : undefined;

  const setupContent = (
    <Card title="Tentukan kelompok payroll" className="shadow-sm">
      <Alert
        className="mb-5"
        type="info"
        showIcon
        message="Satu workspace untuk satu kelompok penggajian"
        description="Setelah periode ditentukan, sistem menyiapkan roster dari status kerja, periode gaji, mata uang, kontrak, dan komponen HRIS."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <Text strong>Periode Gaji</Text>
          <RangePicker
            className="mt-2 w-full"
            format="DD MMM YYYY"
            value={[dayjs(setup.periodStart).tz(), dayjs(setup.periodEnd).tz()]}
            onChange={(value) => {
              if (!value?.[0] || !value?.[1]) return;
              setSetup((current) => ({
                ...current,
                periodStart: value[0]!.format('YYYY-MM-DD'),
                periodEnd: value[1]!.format('YYYY-MM-DD'),
              }));
            }}
          />
        </div>
        <div>
          <Text strong>Kelompok Penggajian</Text>
          <Select
            className="mt-2 w-full"
            value={setup.payrollPeriod}
            disabled={Boolean(editingRun)}
            options={payrollPeriodOptions}
            onChange={(payrollPeriod) => setSetup((current) => ({ ...current, payrollPeriod }))}
          />
        </div>
        <div>
          <Text strong>Mata Uang</Text>
          <Select
            className="mt-2 w-full"
            value={setup.salaryCurrency}
            disabled={Boolean(editingRun)}
            options={[{ value: baseCurrencyCode, label: `${baseCurrencySymbol} (mata uang dasar)` }]}
            onChange={(salaryCurrency) => setSetup((current) => ({ ...current, salaryCurrency }))}
          />
        </div>
        <div>
          <Text strong>Catatan Run</Text>
          <Input
            className="mt-2"
            value={setup.notes}
            placeholder="Contoh: Payroll reguler bulan ini"
            onChange={(event) => setSetup((current) => ({ ...current, notes: event.target.value }))}
          />
        </div>
      </div>
      {previousRun && (
        <Alert
          className="mt-5"
          type="success"
          showIcon
          message={`Pembanding ditemukan: ${previousRun.payroll_number}`}
          description={`Periode ${dayjs(previousRun.period_start).format('DD MMM YYYY')}–${dayjs(previousRun.period_end).format('DD MMM YYYY')} akan dipakai untuk mendeteksi perubahan tidak biasa.`}
        />
      )}
    </Card>
  );

  const rosterContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card size="small"><Statistic title="Memenuhi Kriteria" value={rows.length} /></Card>
        <Card size="small"><Statistic title="Dipilih" value={selectedEmployeeIds.length} valueStyle={{ color: '#1677ff' }} /></Card>
        <Card size="small"><Statistic title="Siap" value={rows.filter((row) => getRowStatus(row.issues) === 'READY').length} valueStyle={{ color: '#15803d' }} /></Card>
        <Card size="small"><Statistic title="Perlu Dicek" value={rows.filter((row) => getRowStatus(row.issues) === 'WARNING').length} valueStyle={{ color: '#b45309' }} /></Card>
        <Card size="small"><Statistic title="Diblokir" value={rows.filter((row) => getRowStatus(row.issues) === 'BLOCKED').length} valueStyle={{ color: '#dc2626' }} /></Card>
      </div>

      <Card
        className="shadow-sm"
        title={<Space><Users size={18} /><span>Pilih Karyawan</span></Space>}
        extra={<Text type="secondary">{selectedEmployeeIds.length} dipilih</Text>}
      >
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_170px_170px_auto]">
          <Input.Search
            allowClear
            value={rosterSearch}
            placeholder="Cari nama, nomor, jabatan, departemen..."
            onChange={(event) => setRosterSearch(event.target.value)}
          />
          <Select
            value={departmentFilter}
            options={[{ value: 'ALL', label: 'Semua departemen' }, ...departmentOptions]}
            onChange={setDepartmentFilter}
          />
          <Select<PaymentMethodFilter>
            value={paymentMethodFilter}
            options={[
              { value: 'ALL', label: 'Semua pembayaran' },
              { value: 'BANK_TRANSFER', label: 'Transfer bank' },
              { value: 'CASH', label: 'Tunai' },
            ]}
            onChange={setPaymentMethodFilter}
          />
          <Select<RosterStatusFilter>
            value={rosterStatusFilter}
            options={[
              { value: 'ALL', label: 'Semua status' },
              { value: 'READY', label: 'Siap' },
              { value: 'WARNING', label: 'Perlu dicek' },
              { value: 'BLOCKED', label: 'Diblokir' },
            ]}
            onChange={setRosterStatusFilter}
          />
          <Space>
            <Button onClick={handleSelectAllFiltered}>Pilih hasil filter</Button>
            <Button onClick={() => setSelectedEmployeeIds([])}>Kosongkan</Button>
          </Space>
        </div>

        <Table<WorkspaceRow>
          rowKey={(row) => row.item.employee_id}
          dataSource={filteredRosterRows}
          columns={rosterColumns}
          pagination={false}
          virtual={filteredRosterRows.length > 40}
          scroll={{ x: 1120, y: 500 }}
          rowSelection={{
            preserveSelectedRowKeys: true,
            selectedRowKeys: selectedEmployeeIds,
            onChange: (keys) => setSelectedEmployeeIds(keys.map(String)),
            getCheckboxProps: (row) => ({
              disabled: getRowStatus(row.issues) === 'BLOCKED',
              name: row.item.employee_name,
            }),
          }}
          locale={{ emptyText: <Empty description="Tidak ada karyawan yang cocok dengan filter." /> }}
        />
      </Card>
    </div>
  );

  const reviewContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card size="small"><Statistic title="Karyawan" value={summary.employeeCount} /></Card>
        <Card size="small"><Statistic title="Gross" value={`${baseCurrencySymbol} ${formatCurrency(summary.gross)}`} /></Card>
        <Card size="small"><Statistic title="Potongan" value={`${baseCurrencySymbol} ${formatCurrency(summary.deduction)}`} valueStyle={{ color: '#dc2626' }} /></Card>
        <Card size="small"><Statistic title="Net Dibayar" value={`${baseCurrencySymbol} ${formatCurrency(summary.net)}`} valueStyle={{ color: '#15803d' }} /></Card>
        <Card size="small"><Statistic title="Perubahan ≥20%" value={summary.largeChangeCount} valueStyle={{ color: summary.largeChangeCount ? '#b45309' : undefined }} /></Card>
      </div>

      {(summary.errorCount > 0 || summary.warningCount > 0) && (
        <Alert
          type={summary.errorCount > 0 ? 'error' : 'warning'}
          showIcon
          message={`${summary.errorCount} masalah memblokir dan ${summary.warningCount} peringatan`}
          description="Gunakan status atau tombol Detail untuk memeriksa karyawan yang perlu diperbaiki."
        />
      )}

      <Card
        className="shadow-sm"
        title={<Space><ListChecks size={18} /><span>Review & Penyesuaian</span></Space>}
        extra={<Text type="secondary">{bulkSelectedEmployeeIds.length} baris dipilih untuk bulk action</Text>}
      >
        <div className="mb-4 flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
          <div>
            <Text strong>Bulk update</Text>
            <div className="mt-2 flex flex-wrap gap-2">
              <Select<BulkField>
                className="w-44"
                value={bulkField}
                options={bulkFieldOptions}
                onChange={setBulkField}
              />
              <Select<BulkMode>
                className="w-28"
                value={bulkMode}
                options={[
                  { value: 'SET', label: 'Set nilai' },
                  { value: 'ADD', label: 'Tambah' },
                ]}
                onChange={setBulkMode}
              />
              <InputNumber
                min={0}
                controls={false}
                value={bulkAmount}
                formatter={(value) => currencyFormatter(value, baseCurrencySymbol)}
                parser={currencyParser}
                onChange={(value) => setBulkAmount(Number(value || 0))}
                className="w-48"
              />
              <Button type="primary" onClick={handleApplyBulk}>Terapkan</Button>
            </div>
          </div>
          <Space wrap>
            <Button icon={<RefreshCw size={16} />} onClick={handleResetFromHris}>
              Muat ulang HRIS
            </Button>
            <Button icon={<Download size={16} />} onClick={() => void handleExportTemplate()}>
              Unduh Template
            </Button>
            <Upload
              accept=".xlsx,.xls"
              maxCount={1}
              showUploadList={false}
              beforeUpload={handleImportFile}
            >
              <Button icon={<UploadCloud size={16} />}>Import Excel</Button>
            </Upload>
          </Space>
        </div>

        <Table<WorkspaceRow>
          rowKey={(row) => row.item.employee_id}
          dataSource={selectedRows}
          columns={reviewColumns}
          pagination={false}
          virtual={selectedRows.length > 40}
          scroll={{ x: 1230, y: 520 }}
          rowSelection={{
            selectedRowKeys: bulkSelectedEmployeeIds,
            onChange: (keys) => setBulkSelectedEmployeeIds(keys.map(String)),
          }}
          locale={{ emptyText: <Empty description="Belum ada karyawan yang dipilih." /> }}
        />
      </Card>
    </div>
  );

  return (
    <div className="min-h-full space-y-4 p-3 sm:p-4 md:p-6" data-testid="payroll-workspace">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div className="flex items-start gap-3">
          <Button
            type="text"
            icon={<ArrowLeft size={18} />}
            onClick={onCancel}
            aria-label="Kembali ke daftar payroll"
          />
          <div>
            <Title level={2} style={{ margin: 0 }}>
              {editingRun ? `Edit ${editingRun.payroll_number}` : 'Buat Payroll'}
            </Title>
            <Text type="secondary">
              {dayjs(setup.periodStart).format('DD MMM YYYY')}–{dayjs(setup.periodEnd).format('DD MMM YYYY')}
              {' • '}{payrollPeriodOptions.find((option) => option.value === setup.payrollPeriod)?.label}
            </Text>
          </div>
        </div>
        <Space wrap>
          {initial.snapshot && <Tag color="blue">Draft browser dipulihkan</Tag>}
          <Text type="secondary" className="text-xs">
            {autosavedAt
              ? `Tersimpan otomatis ${dayjs(autosavedAt).tz().format('HH:mm:ss')}`
              : 'Menyiapkan autosave...'}
          </Text>
        </Space>
      </div>

      <Card className="shadow-sm">
        <Steps
          current={step}
          items={[
            { title: 'Periode', description: 'Atur kelompok payroll' },
            { title: 'Karyawan', description: 'Pilih dan validasi roster' },
            { title: 'Review', description: 'Sesuaikan dan simpan draft' },
          ]}
        />
      </Card>

      {step === 0 && setupContent}
      {step === 1 && rosterContent}
      {step === 2 && reviewContent}

      <div className="sticky bottom-0 z-20 flex flex-col justify-between gap-3 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur md:flex-row md:items-center">
        <Space>
          {step > 0 && (
            <Button icon={<ArrowLeft size={16} />} onClick={() => setStep((current) => current - 1)}>
              Sebelumnya
            </Button>
          )}
          <Text type="secondary">
            {selectedEmployeeIds.length} karyawan • Net {baseCurrencySymbol} {formatCurrency(summary.net)}
          </Text>
        </Space>
        <Space>
          <Button onClick={onCancel}>Kembali ke Daftar</Button>
          {step < 2 ? (
            <Button
              type="primary"
              icon={<ArrowRight size={16} />}
              onClick={() => {
                if (step === 0) {
                  const nextSignature = getSetupRosterSignature(setup);
                  buildItemsForSetup(
                    setup,
                    nextSignature === builtSetupSignatureRef.current,
                  );
                  builtSetupSignatureRef.current = nextSignature;
                }
                if (step === 1 && selectedEmployeeIds.length === 0) {
                  message.warning('Pilih minimal satu karyawan untuk melanjutkan.');
                  return;
                }
                setStep((current) => current + 1);
                if (step === 1) setBulkSelectedEmployeeIds([]);
              }}
            >
              Lanjut
            </Button>
          ) : (
            <Button
              type="primary"
              icon={summary.errorCount > 0 ? <CheckCircle2 size={16} /> : <Save size={16} />}
              loading={submitting}
              disabled={summary.employeeCount === 0 || summary.errorCount > 0}
              onClick={() => void handleSubmit()}
            >
              Simpan Draft
            </Button>
          )}
        </Space>
      </div>

      <Drawer
        title={drawerRow ? `Detail Payroll — ${drawerRow.item.employee_name}` : 'Detail Payroll'}
        open={Boolean(drawerRow)}
        width={520}
        onClose={() => setDrawerEmployeeId(undefined)}
      >
        {drawerRow && (
          <div className="space-y-5">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{drawerRow.item.employee_name}</div>
                  <div className="text-sm text-gray-500">
                    {[drawerRow.item.employee_number, drawerRow.item.employee_position, drawerRow.item.employee_department]
                      .filter(Boolean).join(' • ')}
                  </div>
                </div>
                {renderStatus(drawerRow.issues)}
              </div>
              {drawerRow.issues.length > 0 && (
                <ul className="mb-0 mt-3 pl-5 text-sm text-gray-600">
                  {drawerRow.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}
                </ul>
              )}
            </div>
            {(() => {
              const impact = leaveImpactByEmployee.get(drawerRow.item.employee_id);
              if (!impact || (!impact.paid && !impact.unpaid)) return null;
              return (
                <Alert
                  type={impact.unpaid > 0 ? 'warning' : 'info'}
                  showIcon
                  message={`Cuti periode ini: ${impact.paid} hari paid, ${impact.unpaid} hari unpaid`}
                  description="Dampak ditampilkan untuk review. Potongan nominal unpaid leave belum dihitung otomatis."
                />
              );
            })()}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Text strong>Gaji Pokok</Text>
                <InputNumber
                  className="mt-2 w-full"
                  min={0}
                  controls={false}
                  value={drawerRow.item.base_salary}
                  formatter={(value) => currencyFormatter(value, baseCurrencySymbol)}
                  parser={currencyParser}
                  onChange={(value) => updateItem(drawerRow.item.employee_id, { base_salary: Number(value || 0) })}
                />
                <div className="mt-1 text-xs text-gray-400">
                  Sumber: {drawerRow.item.base_salary_source === 'CONTRACT'
                    ? 'Kontrak aktif'
                    : drawerRow.item.base_salary_source === 'COMPONENT'
                      ? 'Komponen gaji'
                      : 'Profil karyawan'}
                </div>
              </div>
              <div>
                <Text strong>Tunjangan</Text>
                <InputNumber
                  className="mt-2 w-full"
                  min={0}
                  controls={false}
                  value={drawerRow.item.allowance_amount}
                  formatter={(value) => currencyFormatter(value, baseCurrencySymbol)}
                  parser={currencyParser}
                  onChange={(value) => updateItem(drawerRow.item.employee_id, { allowance_amount: Number(value || 0) })}
                />
              </div>
              <div>
                <Text strong>Bonus/Lembur</Text>
                <InputNumber
                  className="mt-2 w-full"
                  min={0}
                  controls={false}
                  value={drawerRow.item.bonus_amount}
                  formatter={(value) => currencyFormatter(value, baseCurrencySymbol)}
                  parser={currencyParser}
                  onChange={(value) => updateItem(drawerRow.item.employee_id, { bonus_amount: Number(value || 0) })}
                />
              </div>
              <div>
                <Text strong>Potongan Lain</Text>
                <InputNumber
                  className="mt-2 w-full"
                  min={0}
                  controls={false}
                  value={drawerRow.item.other_deduction_amount}
                  formatter={(value) => currencyFormatter(value, baseCurrencySymbol)}
                  parser={currencyParser}
                  onChange={(value) => updateItem(drawerRow.item.employee_id, { other_deduction_amount: Number(value || 0) })}
                />
              </div>
            </div>

            <Card size="small" title="Komponen dari HRIS">
              {drawerRow.item.component_previews?.length ? (
                <Space size={[4, 6]} wrap>
                  {drawerRow.item.component_previews.map((component) => (
                    <Tag
                      key={component.assignment_id}
                      color={component.kind === 'EARNING' ? 'green' : 'red'}
                    >
                      {component.component_name}: {component.calculation === 'PERCENTAGE'
                        ? `${component.configured_value}% = ${baseCurrencySymbol} ${formatCurrency(component.amount)}`
                        : `${baseCurrencySymbol} ${formatCurrency(component.amount)}`}
                    </Tag>
                  ))}
                </Space>
              ) : <Text type="secondary">Belum ada komponen tambahan.</Text>}
            </Card>

            <Card size="small" title="Pembayaran & Kasbon">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500">Metode</div>
                  <div>{drawerRow.item.salary_payment_method === 'BANK_TRANSFER' ? 'Transfer Bank' : 'Tunai'}</div>
                </div>
                <div>
                  <div className="text-gray-500">Rekening</div>
                  <div>{[drawerRow.item.bank_name, drawerRow.item.bank_account_number].filter(Boolean).join(' • ') || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">Potongan Kasbon</div>
                  <div className="text-red-600">{baseCurrencySymbol} {formatCurrency(drawerRow.preview.cashAdvanceDeduction)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Net Dibayar</div>
                  <div className="font-semibold text-green-700">{baseCurrencySymbol} {formatCurrency(drawerRow.preview.net)}</div>
                </div>
              </div>
            </Card>

            {drawerRow.comparison && (
              <Alert
                type={Math.abs(drawerRow.comparison.percentDelta ?? 0) >= 20 ? 'warning' : 'info'}
                showIcon
                icon={<FileSpreadsheet size={16} />}
                message="Perbandingan periode sebelumnya"
                description={`Net sebelumnya ${baseCurrencySymbol} ${formatCurrency(drawerRow.comparison.previousNet)}; perubahan ${drawerRow.comparison.amountDelta >= 0 ? '+' : ''}${baseCurrencySymbol} ${formatCurrency(drawerRow.comparison.amountDelta)}${drawerRow.comparison.percentDelta !== undefined ? ` (${drawerRow.comparison.percentDelta >= 0 ? '+' : ''}${drawerRow.comparison.percentDelta}%)` : ''}.`}
              />
            )}

            <div>
              <Text strong>Catatan Karyawan</Text>
              <Input.TextArea
                className="mt-2"
                rows={3}
                value={drawerRow.item.notes}
                placeholder="Catatan khusus untuk slip/payroll karyawan"
                onChange={(event) => updateItem(drawerRow.item.employee_id, { notes: event.target.value })}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
