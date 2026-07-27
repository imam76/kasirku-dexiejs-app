import { useEffect, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Edit3,
  Plus,
  ReceiptText,
  RefreshCw,
  UserRoundCheck,
  Users,
  XCircle,
} from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { useAuth } from '@/auth/useAuth';
import dayjs from '@/lib/dayjs';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useEmployeeCashAdvances, type EmployeeCashAdvanceStatusFilter, type EmployeeCashAdvanceWithRepayments } from '@/hooks/useEmployeeCashAdvances';
import { usePayroll, type PayrollRunWithItems, type PayrollStatusFilter } from '@/hooks/usePayroll';
import { getCurrencySymbol } from '@/services/baseCurrencyService';
import type { ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import type { PayrollComponentPreview } from '@/utils/payrollDefaults';
import { exportPayrollEmployeeSlipPdf, exportPayrollRunSlipsPdf } from '@/utils/payrollSlipPdf';
import PayrollRunWorkspace, { type PayrollRunWorkspaceValues } from './PayrollRunWorkspace';
import {
  buildPayrollWorkspaceItems,
  calculatePayrollWorkspacePreview,
  type PayrollWorkspaceItem,
} from './payrollWorkspace';
import type {
  ChartOfAccount,
  Employee,
  EmployeeCashAdvanceRepayment,
  EmployeeCashAdvanceRepaymentStatus,
  EmployeeCashAdvanceStatus,
  EmployeePayrollPeriod,
  EmployeeSalaryComponent,
  EmploymentContract,
  PaymentMethod,
  PayrollRunItem,
  PayrollRunStatus,
  SalaryComponent,
} from '@/types';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;
const payrollCurrencySymbol = (currencyCode?: string) => getCurrencySymbol(currencyCode ?? 'IDR');
const formatPayrollMoney = (value: number, currencyCode?: string) => (
  `${payrollCurrencySymbol(currencyCode)} ${formatCurrency(value)}`
);

type PayrollItemFormValue = PayrollWorkspaceItem & {
  deduction_amount?: number;
};

interface LegacyPayrollRunFormValues {
  period: [Dayjs, Dayjs];
  payroll_period: EmployeePayrollPeriod;
  salary_currency: string;
  notes?: string;
  items: PayrollItemFormValue[];
}

interface PayrollPaymentFormValues {
  paid_at?: Dayjs;
  payment_method: PaymentMethod;
  payment_channel?: string;
  cash_account_id: string;
}

interface EmployeeCashAdvanceFormValues {
  employee_id: string;
  amount: number;
  disbursed_at?: Dayjs;
  payment_method: PaymentMethod;
  payment_channel?: string;
  cash_account_id: string;
  notes?: string;
}

type PayrollFormListField = {
  key: number;
  name: number;
};

const statusMeta: Record<PayrollRunStatus, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: 'Draft' },
  APPROVED: { color: 'blue', label: 'Approved' },
  PAID: { color: 'green', label: 'Paid' },
  VOIDED: { color: 'red', label: 'Void' },
};

const cashAdvanceStatusMeta: Record<EmployeeCashAdvanceStatus, { color: string; label: string }> = {
  ACTIVE: { color: 'blue', label: 'Aktif' },
  PAID: { color: 'green', label: 'Lunas' },
  VOIDED: { color: 'red', label: 'Void' },
};

const repaymentStatusMeta: Record<EmployeeCashAdvanceRepaymentStatus, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: 'Draft' },
  RESERVED: { color: 'blue', label: 'Reserved' },
  POSTED: { color: 'green', label: 'Posted' },
  VOIDED: { color: 'red', label: 'Void' },
};

const currencyFormatter = (value: string | number | undefined, symbol = 'Rp') => (
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

const formatDateOnly = (value: string) => dayjs(value).tz().format('DD MMM YYYY');
const formatDateTime = (value: string) => dayjs(value).tz().format('DD MMM YYYY HH:mm');

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getDefaultCashAccountId = (accounts: ChartOfAccount[], paymentMethod: PaymentMethod) => {
  const preferredId = paymentMethod === 'NON_TUNAI' ? 'bank' : 'cash';
  const preferredCode = paymentMethod === 'NON_TUNAI' ? '1020' : '1010';
  return accounts.find((account) => account.id === preferredId || account.code === preferredCode)?.id
    ?? accounts[0]?.id;
};

const payrollPeriodMeta: Record<EmployeePayrollPeriod, { label: string; shortLabel: string }> = {
  MONTHLY: { label: 'Bulanan', shortLabel: 'Bulanan' },
  WEEKLY: { label: 'Mingguan', shortLabel: 'Mingguan' },
  DAILY: { label: 'Harian', shortLabel: 'Harian' },
};

const baseSalarySourceLabel: Record<NonNullable<PayrollItemFormValue['base_salary_source']>, string> = {
  EMPLOYEE: 'Profil karyawan',
  CONTRACT: 'Kontrak aktif',
  COMPONENT: 'Komponen gaji pokok',
};

const buildItemsFromEmployees = buildPayrollWorkspaceItems;

const buildItemsFromRun = (items: PayrollRunItem[]): PayrollItemFormValue[] => (
  items.map((item) => ({
    employee_id: item.employee_id,
    employee_name: item.employee_name,
    employee_number: item.employee_number,
    employee_position: item.employee_position,
    employee_department: item.employee_department,
    payroll_period: item.payroll_period,
    salary_currency: item.salary_currency,
    salary_payment_method: item.salary_payment_method,
    base_salary: item.base_salary,
    allowance_amount: item.allowance_amount,
    bonus_amount: item.bonus_amount,
    other_deduction_amount: item.other_deduction_amount ?? item.deduction_amount ?? 0,
    cash_advance_deduction_amount: item.cash_advance_deduction_amount ?? 0,
    deduction_amount: item.deduction_amount,
    notes: item.notes,
  }))
);

const calculatePayrollPreview = calculatePayrollWorkspacePreview;

export function LegacyPayrollRunFormModal({
  open,
  employees,
  baseCurrencyCode,
  baseCurrencySymbol,
  salaryComponents,
  employeeSalaryComponents,
  employmentContracts,
  cashAdvanceAvailableByEmployee,
  editingRun,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  employees: Employee[];
  baseCurrencyCode: string;
  baseCurrencySymbol: string;
  salaryComponents: SalaryComponent[];
  employeeSalaryComponents: EmployeeSalaryComponent[];
  employmentContracts: EmploymentContract[];
  cashAdvanceAvailableByEmployee: Record<string, number>;
  editingRun?: PayrollRunWithItems | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: LegacyPayrollRunFormValues) => Promise<void>;
}) {
  const [form] = Form.useForm<LegacyPayrollRunFormValues>();
  const watchedItems = Form.useWatch('items', form);
  const currencyOptions = useMemo(() => [{
    value: baseCurrencyCode,
    label: `${baseCurrencySymbol} (mata uang dasar)`,
  }], [baseCurrencyCode, baseCurrencySymbol]);
  const summary = useMemo(() => (
    (watchedItems ?? []).reduce((acc, item) => {
      const preview = calculatePayrollPreview(item, cashAdvanceAvailableByEmployee);

      return {
        gross: roundCurrency(acc.gross + preview.gross),
        otherDeduction: roundCurrency(acc.otherDeduction + preview.otherDeduction),
        cashAdvanceDeduction: roundCurrency(acc.cashAdvanceDeduction + preview.cashAdvanceDeduction),
        deduction: roundCurrency(acc.deduction + preview.deduction),
        net: roundCurrency(acc.net + preview.net),
      };
    }, { gross: 0, otherDeduction: 0, cashAdvanceDeduction: 0, deduction: 0, net: 0 })
  ), [cashAdvanceAvailableByEmployee, watchedItems]);

  const loadHrDefaults = ({
    period,
    payrollPeriod,
    salaryCurrency,
  }: {
    period?: [Dayjs, Dayjs] | null;
    payrollPeriod?: EmployeePayrollPeriod;
    salaryCurrency?: string;
  } = {}) => {
    const currentValues = form.getFieldsValue();
    const resolvedPeriod = period ?? currentValues.period;
    const resolvedPayrollPeriod = payrollPeriod ?? currentValues.payroll_period ?? 'MONTHLY';
    const resolvedSalaryCurrency = salaryCurrency ?? currentValues.salary_currency ?? baseCurrencyCode;
    if (!resolvedPeriod?.[0] || !resolvedPeriod?.[1]) {
      form.setFieldValue('items', []);
      return;
    }

    form.setFieldValue('items', buildItemsFromEmployees({
      employees,
      assignments: employeeSalaryComponents,
      salaryComponents,
      contracts: employmentContracts,
      periodStart: resolvedPeriod[0].format('YYYY-MM-DD'),
      periodEnd: resolvedPeriod[1].format('YYYY-MM-DD'),
      payrollPeriod: resolvedPayrollPeriod,
      salaryCurrency: resolvedSalaryCurrency,
    }));
  };

  useEffect(() => {
    if (!open) return;

    if (editingRun) {
      form.setFieldsValue({
        period: [dayjs(editingRun.period_start).tz(), dayjs(editingRun.period_end).tz()],
        payroll_period: editingRun.payroll_period ?? editingRun.items[0]?.payroll_period ?? 'MONTHLY',
        salary_currency: editingRun.salary_currency
          ?? editingRun.items[0]?.salary_currency
          ?? baseCurrencyCode,
        notes: editingRun.notes,
        items: buildItemsFromRun(editingRun.items),
      });
      return;
    }

    const period: [Dayjs, Dayjs] = [dayjs().tz().startOf('month'), dayjs().tz().endOf('month')];
    form.setFieldsValue({
      period,
      payroll_period: 'MONTHLY',
      salary_currency: baseCurrencyCode,
      notes: undefined,
      items: buildItemsFromEmployees({
        employees,
        assignments: employeeSalaryComponents,
        salaryComponents,
        contracts: employmentContracts,
        periodStart: period[0].format('YYYY-MM-DD'),
        periodEnd: period[1].format('YYYY-MM-DD'),
        payrollPeriod: 'MONTHLY',
        salaryCurrency: baseCurrencyCode,
      }),
    });
  }, [
    editingRun,
    employeeSalaryComponents,
    employees,
    employmentContracts,
    form,
    open,
    salaryComponents,
    baseCurrencyCode,
  ]);

  const handleFinish = async (values: LegacyPayrollRunFormValues) => {
    await onSubmit(values);
    form.resetFields();
  };

  const columns = [
    {
      title: 'Karyawan',
      key: 'employee',
      width: 260,
      render: (_: unknown, field: PayrollFormListField) => (
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => {
            const item = getFieldValue(['items', field.name]) as PayrollItemFormValue | undefined;
            return (
              <div>
                <div className="font-medium text-gray-900">
                  {item?.employee_number ? `${item.employee_number} - ` : ''}{item?.employee_name}
                </div>
                <div className="text-xs text-gray-500">
                  {[item?.employee_position, item?.employee_department].filter(Boolean).join(' • ') || '-'}
                </div>
                <Space size={[4, 4]} wrap className="mt-1">
                  <Tag className="!mr-0">{item?.payroll_period ? payrollPeriodMeta[item.payroll_period].shortLabel : 'Legacy'}</Tag>
                  <Tag className="!mr-0">{payrollCurrencySymbol(item?.salary_currency)}</Tag>
                  <Tag color={item?.salary_payment_method === 'BANK_TRANSFER' ? 'blue' : 'default'} className="!mr-0">
                    {item?.salary_payment_method === 'BANK_TRANSFER' ? 'Transfer' : 'Tunai'}
                  </Tag>
                </Space>
                <Form.Item name={[field.name, 'employee_id']} hidden>
                  <Input />
                </Form.Item>
                <Form.Item name={[field.name, 'employee_name']} hidden>
                  <Input />
                </Form.Item>
                <Form.Item name={[field.name, 'employee_position']} hidden>
                  <Input />
                </Form.Item>
              </div>
            );
          }}
        </Form.Item>
      ),
    },
    {
      title: 'Gaji Pokok',
      key: 'base_salary',
      width: 160,
      render: (_: unknown, field: PayrollFormListField) => (
        <div>
          <Form.Item
            name={[field.name, 'base_salary']}
            rules={[{ required: true, message: 'Wajib diisi.' }]}
            className="mb-0"
          >
            <InputNumber
              min={0}
              controls={false}
              formatter={(value) => currencyFormatter(value, baseCurrencySymbol)}
              parser={currencyParser}
              className="w-full"
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const source = getFieldValue(['items', field.name, 'base_salary_source']) as PayrollItemFormValue['base_salary_source'];
              return source ? <div className="mt-1 text-[11px] text-gray-400">{baseSalarySourceLabel[source]}</div> : null;
            }}
          </Form.Item>
        </div>
      ),
    },
    {
      title: 'Komponen HRIS',
      key: 'salary_components',
      width: 240,
      render: (_: unknown, field: PayrollFormListField) => (
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => {
            const components = (getFieldValue(
              ['items', field.name, 'component_previews'],
            ) ?? []) as PayrollComponentPreview[];
            if (components.length === 0) {
              return <Text type="secondary" className="text-xs">Belum dikonfigurasi</Text>;
            }
            return (
              <Space size={[4, 4]} wrap>
                {components.map((component) => (
                  <Tag
                    key={component.assignment_id}
                    color={component.kind === 'EARNING' ? 'green' : 'red'}
                    className="!mr-0"
                  >
                    {component.component_name}: {component.calculation === 'PERCENTAGE'
                      ? `${component.configured_value}% = ${baseCurrencySymbol} ${formatCurrency(component.amount)}`
                      : `${baseCurrencySymbol} ${formatCurrency(component.amount)}`}
                  </Tag>
                ))}
              </Space>
            );
          }}
        </Form.Item>
      ),
    },
    {
      title: 'Tunjangan',
      key: 'allowance_amount',
      width: 150,
      render: (_: unknown, field: PayrollFormListField) => (
        <Form.Item name={[field.name, 'allowance_amount']} className="mb-0">
          <InputNumber min={0} controls={false} formatter={(value) => currencyFormatter(value, baseCurrencySymbol)} parser={currencyParser} className="w-full" />
        </Form.Item>
      ),
    },
    {
      title: 'Bonus/Lembur',
      key: 'bonus_amount',
      width: 150,
      render: (_: unknown, field: PayrollFormListField) => (
        <Form.Item name={[field.name, 'bonus_amount']} className="mb-0">
          <InputNumber min={0} controls={false} formatter={(value) => currencyFormatter(value, baseCurrencySymbol)} parser={currencyParser} className="w-full" />
        </Form.Item>
      ),
    },
    {
      title: 'Potongan Lain',
      key: 'other_deduction_amount',
      width: 150,
      render: (_: unknown, field: PayrollFormListField) => (
        <Form.Item name={[field.name, 'other_deduction_amount']} className="mb-0">
          <InputNumber min={0} controls={false} formatter={(value) => currencyFormatter(value, baseCurrencySymbol)} parser={currencyParser} className="w-full" />
        </Form.Item>
      ),
    },
    {
      title: 'Kasbon',
      key: 'cash_advance_deduction_amount',
      width: 150,
      render: (_: unknown, field: PayrollFormListField) => (
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => {
            const item = getFieldValue(['items', field.name]) as PayrollItemFormValue | undefined;
            const preview = calculatePayrollPreview(item, cashAdvanceAvailableByEmployee);
            return (
              <div>
                <Text className="text-red-600">{baseCurrencySymbol} {formatCurrency(preview.cashAdvanceDeduction)}</Text>
                <div className="text-[11px] text-gray-400">
                  Sisa {baseCurrencySymbol} {formatCurrency(Math.max(0, (item?.employee_id ? cashAdvanceAvailableByEmployee[item.employee_id] ?? 0 : 0) - preview.cashAdvanceDeduction))}
                </div>
              </div>
            );
          }}
        </Form.Item>
      ),
    },
    {
      title: 'Total Potongan',
      key: 'deduction_amount',
      width: 150,
      render: (_: unknown, field: PayrollFormListField) => (
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => {
            const item = getFieldValue(['items', field.name]) as PayrollItemFormValue | undefined;
            const preview = calculatePayrollPreview(item, cashAdvanceAvailableByEmployee);
            return <Text className="text-red-600">{baseCurrencySymbol} {formatCurrency(preview.deduction)}</Text>;
          }}
        </Form.Item>
      ),
    },
    {
      title: 'Net',
      key: 'net',
      width: 130,
      render: (_: unknown, field: PayrollFormListField) => (
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => {
            const item = getFieldValue(['items', field.name]) as PayrollItemFormValue | undefined;
            const preview = calculatePayrollPreview(item, cashAdvanceAvailableByEmployee);
            return <Text strong className={preview.net < 0 ? 'text-red-600' : 'text-gray-900'}>{baseCurrencySymbol} {formatCurrency(preview.net)}</Text>;
          }}
        </Form.Item>
      ),
    },
    {
      title: 'Catatan',
      key: 'notes',
      width: 220,
      render: (_: unknown, field: PayrollFormListField) => (
        <Form.Item name={[field.name, 'notes']} className="mb-0">
          <Input placeholder="Opsional" />
        </Form.Item>
      ),
    },
  ];

  return (
    <Modal
      title={editingRun ? `Edit Payroll ${editingRun.payroll_number}` : 'Buat Payroll Karyawan'}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={1120}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish} className="mt-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Form.Item
            name="period"
            label="Periode Gaji"
            rules={[{ required: true, message: 'Periode gaji wajib dipilih.' }]}
          >
            <RangePicker
              className="w-full"
              format="DD MMM YYYY"
              onChange={(value) => {
                if (!editingRun && value?.[0] && value?.[1]) {
                  loadHrDefaults({ period: [value[0], value[1]] });
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="payroll_period"
            label="Kelompok Penggajian"
            rules={[{ required: true, message: 'Kelompok wajib dipilih.' }]}
          >
            <Select
              disabled={Boolean(editingRun)}
              options={Object.entries(payrollPeriodMeta).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
              onChange={(value: EmployeePayrollPeriod) => loadHrDefaults({ payrollPeriod: value })}
            />
          </Form.Item>
          <Form.Item
            name="salary_currency"
            label="Mata Uang"
            rules={[{ required: true, message: 'Mata uang wajib dipilih.' }]}
          >
            <Select
              showSearch
              disabled={Boolean(editingRun)}
              options={currencyOptions}
              onChange={(value: string) => loadHrDefaults({ salaryCurrency: value })}
            />
          </Form.Item>
          <Form.Item name="notes" label="Catatan Run">
            <Input placeholder="Contoh: Payroll reguler bulan ini" />
          </Form.Item>
        </div>

        {!editingRun && (
          <Alert
            className="mb-3"
            type="info"
            showIcon
            message="Draft diisi dari konfigurasi HRIS"
            description={(
              <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
                <span>
                  Karyawan dipilih menurut status, periode penggajian, mata uang, dan tanggal kerja.
                  Gaji pokok memakai kontrak yang berlaku lalu profil karyawan; komponen tetap dan persentase dihitung otomatis.
                </span>
                <Button
                  size="small"
                  icon={<RefreshCw size={14} />}
                  onClick={() => loadHrDefaults()}
                >
                  Muat ulang HRIS
                </Button>
              </div>
            )}
          />
        )}

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs text-gray-500">Gross</div>
            <div className="font-semibold text-gray-900">{baseCurrencySymbol} {formatCurrency(summary.gross)}</div>
          </div>
          <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs text-gray-500">Potongan Lain</div>
            <div className="font-semibold text-red-600">{baseCurrencySymbol} {formatCurrency(summary.otherDeduction)}</div>
          </div>
          <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs text-gray-500">Potongan Kasbon</div>
            <div className="font-semibold text-red-600">{baseCurrencySymbol} {formatCurrency(summary.cashAdvanceDeduction)}</div>
          </div>
          <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs text-gray-500">Net Dibayar</div>
            <div className="font-semibold text-green-700">{baseCurrencySymbol} {formatCurrency(summary.net)}</div>
          </div>
        </div>

        <Form.List name="items">
          {(fields) => (
            fields.length > 0 ? (
              <Table<PayrollFormListField>
                rowKey="key"
                size="small"
                pagination={false}
                dataSource={fields}
                columns={columns}
                scroll={{ x: 1700, y: 420 }}
              />
            ) : (
              <Empty description="Tidak ada karyawan yang sesuai status, periode, mata uang, dan rentang tanggal ini." />
            )
          )}
        </Form.List>

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Batal</Button>
          <Button type="primary" htmlType="submit" loading={submitting} disabled={employees.length === 0 && !editingRun}>
            Simpan Draft
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

function PayrollPaymentModal({
  open,
  run,
  accounts,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  run?: PayrollRunWithItems | null;
  accounts: ChartOfAccount[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: PayrollPaymentFormValues) => Promise<void>;
}) {
  const [form] = Form.useForm<PayrollPaymentFormValues>();
  const employeePaymentSummary = useMemo(() => (
    (run?.items ?? []).reduce((summary, item) => {
      if (item.salary_payment_method === 'BANK_TRANSFER') summary.bankTransfer += 1;
      else summary.cash += 1;
      return summary;
    }, { bankTransfer: 0, cash: 0 })
  ), [run]);

  useEffect(() => {
    if (!open) return;

    const paymentMethod: PaymentMethod = employeePaymentSummary.bankTransfer > 0
      ? 'NON_TUNAI'
      : 'TUNAI';
    form.setFieldsValue({
      paid_at: dayjs().tz(),
      payment_method: paymentMethod,
      cash_account_id: getDefaultCashAccountId(accounts, paymentMethod),
      payment_channel: undefined,
    });
  }, [accounts, employeePaymentSummary.bankTransfer, form, open]);

  const handlePaymentMethodChange = (paymentMethod: PaymentMethod) => {
    form.setFieldsValue({
      cash_account_id: getDefaultCashAccountId(accounts, paymentMethod),
    });
  };

  const handleFinish = async (values: PayrollPaymentFormValues) => {
    await onSubmit(values);
    form.resetFields();
  };

  return (
    <Modal
      title={run ? `Bayar Payroll ${run.payroll_number}` : 'Bayar Payroll'}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      {run && (
        <div className="mb-4 rounded-md border border-green-100 bg-green-50 p-3">
          <div className="text-xs text-green-700">Total net dibayar</div>
          <div className="text-lg font-semibold text-green-900">
            {formatPayrollMoney(run.net_amount, run.salary_currency)}
          </div>
        </div>
      )}
      {run && (
        <Alert
          className="mb-4"
          type={employeePaymentSummary.bankTransfer > 0 && employeePaymentSummary.cash > 0 ? 'warning' : 'info'}
          showIcon
          message="Metode pembayaran dari profil HR"
          description={(
            <span>
              {employeePaymentSummary.bankTransfer} transfer bank dan {employeePaymentSummary.cash} tunai.
              Akun di bawah mencatat sumber pembayaran run; instruksi per karyawan tetap tercantum pada detail/slip.
            </span>
          )}
        />
      )}

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="paid_at"
          label="Tanggal Bayar"
          rules={[{ required: true, message: 'Tanggal bayar wajib diisi.' }]}
        >
          <DatePicker showTime className="w-full" format="DD MMM YYYY HH:mm" />
        </Form.Item>

        <Form.Item
          name="payment_method"
          label="Metode"
          rules={[{ required: true, message: 'Metode pembayaran wajib dipilih.' }]}
        >
          <Select
            onChange={handlePaymentMethodChange}
            options={[
              { value: 'TUNAI', label: 'Tunai' },
              { value: 'NON_TUNAI', label: 'Non Tunai' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="cash_account_id"
          label="Akun Kas/Bank"
          rules={[{ required: true, message: 'Akun kas/bank wajib dipilih.' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Pilih akun kas/bank"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.code} - ${account.name}`,
            }))}
          />
        </Form.Item>

        <Form.Item name="payment_channel" label="Channel Pembayaran">
          <Input placeholder="Contoh: Kas kantor, Transfer BCA, Payroll bank" />
        </Form.Item>

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Batal</Button>
          <Button type="primary" htmlType="submit" loading={submitting} icon={<CreditCard size={16} />}>
            Bayar Payroll
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

function EmployeeCashAdvanceFormModal({
  open,
  employees,
  accounts,
  baseCurrencySymbol,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  employees: Employee[];
  accounts: ChartOfAccount[];
  baseCurrencySymbol: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: EmployeeCashAdvanceFormValues) => Promise<void>;
}) {
  const [form] = Form.useForm<EmployeeCashAdvanceFormValues>();

  useEffect(() => {
    if (!open) return;

    form.setFieldsValue({
      disbursed_at: dayjs().tz(),
      payment_method: 'TUNAI',
      cash_account_id: getDefaultCashAccountId(accounts, 'TUNAI'),
      payment_channel: undefined,
      notes: undefined,
    });
  }, [accounts, form, open]);

  const handlePaymentMethodChange = (paymentMethod: PaymentMethod) => {
    form.setFieldsValue({
      cash_account_id: getDefaultCashAccountId(accounts, paymentMethod),
    });
  };

  const handleFinish = async (values: EmployeeCashAdvanceFormValues) => {
    await onSubmit(values);
    form.resetFields();
  };

  return (
    <Modal
      title="Cairkan Kasbon Karyawan"
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish} className="mt-4">
        <Form.Item
          name="employee_id"
          label="Karyawan"
          rules={[{ required: true, message: 'Karyawan wajib dipilih.' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Pilih karyawan"
            options={employees.map((employee) => ({
              value: employee.id,
              label: employee.position ? `${employee.name} - ${employee.position}` : employee.name,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="amount"
          label="Nominal Kasbon"
          rules={[{ required: true, message: 'Nominal kasbon wajib diisi.' }]}
        >
          <InputNumber
            min={1}
            controls={false}
            formatter={(value) => currencyFormatter(value, baseCurrencySymbol)}
            parser={currencyParser}
            className="w-full"
          />
        </Form.Item>

        <Form.Item
          name="disbursed_at"
          label="Tanggal Cair"
          rules={[{ required: true, message: 'Tanggal cair wajib diisi.' }]}
        >
          <DatePicker showTime className="w-full" format="DD MMM YYYY HH:mm" />
        </Form.Item>

        <Form.Item
          name="payment_method"
          label="Metode"
          rules={[{ required: true, message: 'Metode pembayaran wajib dipilih.' }]}
        >
          <Select
            onChange={handlePaymentMethodChange}
            options={[
              { value: 'TUNAI', label: 'Tunai' },
              { value: 'NON_TUNAI', label: 'Non Tunai' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="cash_account_id"
          label="Akun Kas/Bank"
          rules={[{ required: true, message: 'Akun kas/bank wajib dipilih.' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Pilih akun kas/bank"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.code} - ${account.name}`,
            }))}
          />
        </Form.Item>

        <Form.Item name="payment_channel" label="Channel Pembayaran">
          <Input placeholder="Contoh: Kas kantor, Transfer BCA" />
        </Form.Item>

        <Form.Item name="notes" label="Catatan">
          <Input.TextArea rows={3} placeholder="Opsional" />
        </Form.Item>

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Batal</Button>
          <Button type="primary" htmlType="submit" loading={submitting} icon={<Banknote size={16} />}>
            Cairkan Kasbon
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

export default function PayrollManagement() {
  const { message, modal } = App.useApp();
  const { can, currentUser } = useAuth();
  const canManagePayroll = can('hr.payroll.manage');
  const [activeTab, setActiveTab] = useState('payroll');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCashAdvanceFormOpen, setIsCashAdvanceFormOpen] = useState(false);
  const [editingRun, setEditingRun] = useState<PayrollRunWithItems | null>(null);
  const [payingRun, setPayingRun] = useState<PayrollRunWithItems | null>(null);
  const [exportingSlipKey, setExportingSlipKey] = useState<string | null>(null);
  const { profile } = useCompanyProfileSetting();
  const { baseCurrencyCode, baseCurrencySymbol } = useBaseCurrency();
  const {
    employees,
    salaryComponents,
    employeeSalaryComponents,
    employmentContracts,
    cashBankAccounts,
    payrollRuns,
    filteredPayrollRuns,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    createPayrollRun,
    updatePayrollRun,
    approvePayrollRun,
    payPayrollRun,
    voidPayrollRun,
    isSubmitting,
    isApproving,
    isPaying,
    isVoiding,
  } = usePayroll();
  const {
    employees: cashAdvanceEmployees,
    cashBankAccounts: cashAdvanceCashBankAccounts,
    cashAdvances,
    filteredCashAdvances,
    summary: cashAdvanceSummary,
    searchText: cashAdvanceSearchText,
    setSearchText: setCashAdvanceSearchText,
    statusFilter: cashAdvanceStatusFilter,
    setStatusFilter: setCashAdvanceStatusFilter,
    createCashAdvance,
    voidCashAdvance,
    isCreating: isCreatingCashAdvance,
    isVoiding: isVoidingCashAdvance,
  } = useEmployeeCashAdvances();

  const cashAdvanceAvailableByEmployee = useMemo(() => (
    cashAdvances.reduce<Record<string, number>>((acc, advance) => {
      if (advance.status !== 'ACTIVE') return acc;

      acc[advance.employee_id] = roundCurrency(
        (acc[advance.employee_id] ?? 0) + Math.max(0, advance.outstanding_amount - advance.reserved_amount),
      );
      return acc;
    }, {})
  ), [cashAdvances]);

  const summary = useMemo(() => payrollRuns.reduce((acc, run) => {
    if (run.status === 'VOIDED') return acc;
    acc.totalRuns += 1;
    acc.totalNet += run.net_amount;
    if (run.status === 'DRAFT') acc.draft += 1;
    if (run.status === 'APPROVED') acc.approvedNet += run.net_amount;
    if (run.status === 'PAID') acc.paidNet += run.net_amount;
    return acc;
  }, { totalRuns: 0, totalNet: 0, draft: 0, approvedNet: 0, paidNet: 0 }), [payrollRuns]);

  const closeCashAdvanceForm = () => {
    setIsCashAdvanceFormOpen(false);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingRun(null);
  };

  const openCreateForm = () => {
    setEditingRun(null);
    setIsFormOpen(true);
  };

  const openEditForm = (run: PayrollRunWithItems) => {
    setEditingRun(run);
    setIsFormOpen(true);
  };

  const handleSubmitRun = async (values: PayrollRunWorkspaceValues) => {
    const payload = {
      period_start: values.period[0].format('YYYY-MM-DD'),
      period_end: values.period[1].format('YYYY-MM-DD'),
      payroll_period: values.payroll_period,
      salary_currency: values.salary_currency,
      notes: values.notes,
      items: values.items.map((item) => ({
        employee_id: item.employee_id,
        base_salary: Number(item.base_salary || 0),
        allowance_amount: Number(item.allowance_amount || 0),
        bonus_amount: Number(item.bonus_amount || 0),
        other_deduction_amount: Number(item.other_deduction_amount || 0),
        notes: item.notes,
      })),
    };

    if (editingRun) {
      await updatePayrollRun({ id: editingRun.id, input: payload });
    } else {
      await createPayrollRun(payload);
    }
    closeForm();
  };

  const handleApprove = (run: PayrollRunWithItems) => {
    modal.confirm({
      title: `Approve ${run.payroll_number}?`,
      content: 'Payroll yang sudah approved tidak bisa diedit lagi. Lanjutkan jika angka slip sudah benar.',
      okText: 'Approve',
      cancelText: 'Batal',
      onOk: () => approvePayrollRun(run.id),
    });
  };

  const handleVoid = (run: PayrollRunWithItems) => {
    modal.confirm({
      title: `Batalkan ${run.payroll_number}?`,
      content: 'Payroll akan ditandai void dan tidak masuk pembayaran.',
      okText: 'Batalkan Payroll',
      okType: 'danger',
      cancelText: 'Kembali',
      onOk: () => voidPayrollRun(run.id),
    });
  };

  const handlePay = async (values: PayrollPaymentFormValues) => {
    if (!payingRun) return;

    await payPayrollRun({
      id: payingRun.id,
      input: {
        paid_at: values.paid_at?.toISOString(),
        payment_method: values.payment_method,
        payment_channel: values.payment_channel,
        cash_account_id: values.cash_account_id,
      },
    });
    setPayingRun(null);
  };

  const handleExportPayrollRunSlips = async (run: PayrollRunWithItems, target: ExportTarget = 'auto') => {
    if (exportingSlipKey) return;

    const exportKey = `run:${run.id}`;
    setExportingSlipKey(exportKey);
    try {
      const exported = await exportPayrollRunSlipsPdf({
        run,
        items: run.items,
        profile,
        target,
      });

      if (exported) {
        message.success(`Slip gabungan ${run.payroll_number} berhasil dibuat.`);
      }
    } catch (error) {
      console.error('Failed to export payroll slips PDF:', error);
      message.error(error instanceof Error ? error.message : 'Gagal membuat slip gaji.');
    } finally {
      setExportingSlipKey(null);
    }
  };

  const handleExportPayrollEmployeeSlip = async (
    run: PayrollRunWithItems,
    item: PayrollRunItem,
    target: ExportTarget = 'auto',
  ) => {
    if (exportingSlipKey) return;

    const exportKey = `item:${item.id}`;
    setExportingSlipKey(exportKey);
    try {
      const exported = await exportPayrollEmployeeSlipPdf({
        run,
        item,
        profile,
        target,
      });

      if (exported) {
        message.success(`Slip gaji ${item.employee_name} berhasil dibuat.`);
      }
    } catch (error) {
      console.error('Failed to export payroll employee slip PDF:', error);
      message.error(error instanceof Error ? error.message : 'Gagal membuat slip gaji karyawan.');
    } finally {
      setExportingSlipKey(null);
    }
  };

  const handleSubmitCashAdvance = async (values: EmployeeCashAdvanceFormValues) => {
    await createCashAdvance({
      employee_id: values.employee_id,
      amount: Number(values.amount || 0),
      disbursed_at: values.disbursed_at?.toISOString(),
      payment_method: values.payment_method,
      payment_channel: values.payment_channel,
      cash_account_id: values.cash_account_id,
      notes: values.notes,
    });
    closeCashAdvanceForm();
  };

  const handleVoidCashAdvance = (advance: EmployeeCashAdvanceWithRepayments) => {
    let voidReason = '';
    modal.confirm({
      title: `Batalkan kasbon ${advance.advance_number}?`,
      content: (
        <div className="space-y-3">
          <Text type="secondary">Saldo kas/bank akan dikembalikan dan kasbon ditandai void.</Text>
          <Input.TextArea
            rows={3}
            placeholder="Alasan pembatalan"
            onChange={(event) => {
              voidReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: 'Batalkan Kasbon',
      okType: 'danger',
      cancelText: 'Kembali',
      onOk: async () => {
        const reason = voidReason.trim();
        if (!reason) {
          throw new Error('Alasan pembatalan wajib diisi.');
        }
        await voidCashAdvance({ id: advance.id, reason });
      },
    });
  };

  const columns = [
    {
      title: 'Nomor',
      dataIndex: 'payroll_number',
      key: 'payroll_number',
      render: (value: string, run: PayrollRunWithItems) => (
        <div>
          <div className="font-semibold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500">{formatDateOnly(run.period_start)} - {formatDateOnly(run.period_end)}</div>
          <Space size={4} className="mt-1">
            <Tag className="!mr-0">{payrollPeriodMeta[run.payroll_period ?? 'MONTHLY'].shortLabel}</Tag>
            <Tag className="!mr-0">{payrollCurrencySymbol(run.salary_currency)}</Tag>
          </Space>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: PayrollRunStatus) => (
        <Tag color={statusMeta[status].color}>{statusMeta[status].label}</Tag>
      ),
    },
    {
      title: 'Karyawan',
      dataIndex: 'employee_count',
      key: 'employee_count',
      width: 110,
      render: (value: number) => `${value} orang`,
    },
    {
      title: 'Gross',
      dataIndex: 'gross_amount',
      key: 'gross_amount',
      width: 150,
      render: (value: number, run: PayrollRunWithItems) => formatPayrollMoney(value, run.salary_currency),
    },
    {
      title: 'Potongan',
      dataIndex: 'deduction_amount',
      key: 'deduction_amount',
      width: 180,
      render: (value: number, run: PayrollRunWithItems) => (
        <div className="text-xs">
          <div className="font-medium text-red-600">{formatPayrollMoney(value, run.salary_currency)}</div>
          <div className="text-gray-500">Lain {formatPayrollMoney(run.other_deduction_amount || 0, run.salary_currency)}</div>
          <div className="text-gray-500">Kasbon {formatPayrollMoney(run.cash_advance_deduction_amount || 0, run.salary_currency)}</div>
        </div>
      ),
    },
    {
      title: 'Net',
      dataIndex: 'net_amount',
      key: 'net_amount',
      width: 160,
      render: (value: number, run: PayrollRunWithItems) => (
        <span className="font-semibold text-green-700">{formatPayrollMoney(value, run.salary_currency)}</span>
      ),
    },
    {
      title: 'Pembayaran',
      key: 'payment',
      width: 220,
      render: (_: unknown, run: PayrollRunWithItems) => (
        run.status === 'PAID' ? (
          <div className="text-xs">
            <div className="font-medium text-gray-800">{run.cash_account_code} - {run.cash_account_name}</div>
            <div className="text-gray-500">{run.paid_at ? formatDateOnly(run.paid_at) : '-'}</div>
          </div>
        ) : (
          <Text type="secondary">Belum dibayar</Text>
        )
      ),
    },
    {
      title: 'Aksi',
      key: 'actions',
      width: 340,
      render: (_: unknown, run: PayrollRunWithItems) => (
        <Space wrap>
          {canManagePayroll && run.status === 'DRAFT' && (
            <>
              <Button size="small" icon={<Edit3 size={14} />} onClick={() => openEditForm(run)}>
                Edit
              </Button>
              <Button size="small" type="primary" icon={<CheckCircle2 size={14} />} onClick={() => handleApprove(run)} loading={isApproving}>
                Approve
              </Button>
            </>
          )}
          {canManagePayroll && run.status === 'APPROVED' && (
            <Button size="small" type="primary" icon={<CreditCard size={14} />} onClick={() => setPayingRun(run)} loading={isPaying}>
              Bayar
            </Button>
          )}
          {run.status === 'PAID' && (
            <ExportActions
              label="Slip Gabungan"
              buttonType="default"
              buttonSize="small"
              flattenSingleFormatTargets
              testId={`payroll-slip-all-${run.id}`}
              disabled={Boolean(exportingSlipKey && exportingSlipKey !== `run:${run.id}`)}
              formats={[
                {
                  key: 'pdf',
                  label: 'PDF',
                  icon: <ReceiptText size={14} />,
                  onExport: (target) => handleExportPayrollRunSlips(run, target),
                },
              ]}
            />
          )}
          {canManagePayroll && (run.status === 'DRAFT' || run.status === 'APPROVED') && (
            <Button size="small" danger icon={<XCircle size={14} />} onClick={() => handleVoid(run)} loading={isVoiding}>
              Void
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const buildItemColumns = (run: PayrollRunWithItems) => [
    {
      title: 'Karyawan',
      key: 'employee',
      render: (_: unknown, item: PayrollRunItem) => (
        <div>
          <div className="font-medium">
            {item.employee_number ? `${item.employee_number} - ` : ''}{item.employee_name}
          </div>
          <div className="text-xs text-gray-500">
            {[item.employee_position, item.employee_department].filter(Boolean).join(' • ') || '-'}
          </div>
        </div>
      ),
    },
    {
      title: 'Gaji Pokok',
      dataIndex: 'base_salary',
      key: 'base_salary',
      render: (value: number, item: PayrollRunItem) => formatPayrollMoney(value, item.salary_currency ?? run.salary_currency),
    },
    {
      title: 'Tunjangan',
      dataIndex: 'allowance_amount',
      key: 'allowance_amount',
      render: (value: number, item: PayrollRunItem) => formatPayrollMoney(value, item.salary_currency ?? run.salary_currency),
    },
    {
      title: 'Bonus/Lembur',
      dataIndex: 'bonus_amount',
      key: 'bonus_amount',
      render: (value: number, item: PayrollRunItem) => formatPayrollMoney(value, item.salary_currency ?? run.salary_currency),
    },
    {
      title: 'Potongan Lain',
      dataIndex: 'other_deduction_amount',
      key: 'other_deduction_amount',
      render: (value: number, item: PayrollRunItem) => <span className="text-red-600">{formatPayrollMoney(value || 0, item.salary_currency ?? run.salary_currency)}</span>,
    },
    {
      title: 'Kasbon',
      dataIndex: 'cash_advance_deduction_amount',
      key: 'cash_advance_deduction_amount',
      render: (value: number, item: PayrollRunItem) => <span className="text-red-600">{formatPayrollMoney(value || 0, item.salary_currency ?? run.salary_currency)}</span>,
    },
    {
      title: 'Total Potongan',
      dataIndex: 'deduction_amount',
      key: 'deduction_amount',
      render: (value: number, item: PayrollRunItem) => <span className="text-red-600">{formatPayrollMoney(value || 0, item.salary_currency ?? run.salary_currency)}</span>,
    },
    {
      title: 'Net',
      dataIndex: 'net_amount',
      key: 'net_amount',
      render: (value: number, item: PayrollRunItem) => <span className="font-semibold">{formatPayrollMoney(value, item.salary_currency ?? run.salary_currency)}</span>,
    },
    {
      title: 'Catatan',
      dataIndex: 'notes',
      key: 'notes',
      render: (value?: string) => value || '-',
    },
    ...(run.status === 'PAID' ? [{
      title: 'Slip',
      key: 'slip',
      width: 140,
      render: (_: unknown, item: PayrollRunItem) => (
        <ExportActions
          label="Slip"
          buttonType="default"
          buttonSize="small"
          flattenSingleFormatTargets
          testId={`payroll-slip-item-${run.id}-${item.employee_id}`}
          disabled={Boolean(exportingSlipKey && exportingSlipKey !== `item:${item.id}`)}
          formats={[
            {
              key: 'pdf',
              label: 'PDF',
              icon: <ReceiptText size={14} />,
              onExport: (target) => handleExportPayrollEmployeeSlip(run, item, target),
            },
          ]}
        />
      ),
    }] : []),
  ];

  const cashAdvanceColumns = [
    {
      title: 'Kasbon',
      dataIndex: 'advance_number',
      key: 'advance_number',
      render: (value: string, advance: EmployeeCashAdvanceWithRepayments) => (
        <div>
          <div className="font-semibold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500">{advance.employee_name}</div>
          <div className="text-xs text-gray-400">{formatDateTime(advance.disbursed_at)}</div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: EmployeeCashAdvanceStatus) => (
        <Tag color={cashAdvanceStatusMeta[status].color}>{cashAdvanceStatusMeta[status].label}</Tag>
      ),
    },
    {
      title: 'Nominal',
      dataIndex: 'amount',
      key: 'amount',
      width: 150,
      render: (value: number) => `${baseCurrencySymbol} ${formatCurrency(value)}`,
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstanding_amount',
      key: 'outstanding_amount',
      width: 180,
      render: (value: number, advance: EmployeeCashAdvanceWithRepayments) => (
        <div className="text-xs">
          <div className="font-semibold text-blue-700">{baseCurrencySymbol} {formatCurrency(value)}</div>
          <div className="text-gray-500">Reserved {baseCurrencySymbol} {formatCurrency(advance.reserved_amount)}</div>
          <div className="text-gray-500">Terpotong {baseCurrencySymbol} {formatCurrency(advance.posted_amount)}</div>
        </div>
      ),
    },
    {
      title: 'Akun Cair',
      key: 'cash_account',
      width: 210,
      render: (_: unknown, advance: EmployeeCashAdvanceWithRepayments) => (
        <div className="text-xs">
          <div className="font-medium text-gray-800">{advance.cash_account_code} - {advance.cash_account_name}</div>
          <div className="text-gray-500">{advance.payment_method === 'NON_TUNAI' ? 'Non Tunai' : 'Tunai'}</div>
          {advance.payment_channel && <div className="text-gray-500">{advance.payment_channel}</div>}
        </div>
      ),
    },
    {
      title: 'Catatan',
      dataIndex: 'notes',
      key: 'notes',
      width: 220,
      render: (value?: string, advance?: EmployeeCashAdvanceWithRepayments) => (
        <div className="text-xs">
          <div>{value || '-'}</div>
          {advance?.void_reason && <div className="mt-1 text-red-500">{advance.void_reason}</div>}
        </div>
      ),
    },
    {
      title: 'Aksi',
      key: 'actions',
      width: 150,
      render: (_: unknown, advance: EmployeeCashAdvanceWithRepayments) => {
        const hasLockedRepayment = advance.repayments.some((repayment) => (
          repayment.status === 'RESERVED' || repayment.status === 'POSTED'
        ));

        return canManagePayroll && advance.status === 'ACTIVE' ? (
          <Button
            size="small"
            danger
            icon={<XCircle size={14} />}
            disabled={hasLockedRepayment}
            loading={isVoidingCashAdvance}
            onClick={() => handleVoidCashAdvance(advance)}
          >
            Void
          </Button>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
  ];

  const cashAdvanceRepaymentColumns = [
    {
      title: 'Payroll',
      dataIndex: 'payroll_number',
      key: 'payroll_number',
      render: (value: string | undefined) => value || '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: EmployeeCashAdvanceRepaymentStatus) => (
        <Tag color={repaymentStatusMeta[status].color}>{repaymentStatusMeta[status].label}</Tag>
      ),
    },
    {
      title: 'Nominal',
      dataIndex: 'amount',
      key: 'amount',
      render: (value: number) => `${baseCurrencySymbol} ${formatCurrency(value)}`,
    },
    {
      title: 'Dialokasikan',
      dataIndex: 'allocated_at',
      key: 'allocated_at',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'Posted',
      dataIndex: 'posted_at',
      key: 'posted_at',
      render: (value?: string) => value ? formatDateTime(value) : '-',
    },
  ];

  if (isFormOpen) {
    return (
      <PayrollRunWorkspace
        autosaveOwnerId={currentUser?.id ?? 'anonymous'}
        employees={employees}
        baseCurrencyCode={baseCurrencyCode}
        baseCurrencySymbol={baseCurrencySymbol}
        salaryComponents={salaryComponents}
        employeeSalaryComponents={employeeSalaryComponents}
        employmentContracts={employmentContracts}
        cashAdvanceAvailableByEmployee={cashAdvanceAvailableByEmployee}
        payrollRuns={payrollRuns}
        editingRun={editingRun}
        submitting={isSubmitting}
        onCancel={closeForm}
        onSubmit={handleSubmitRun}
      />
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <Title level={2} style={{ margin: 0 }}>Payroll Karyawan</Title>
          <Text type="secondary">Kelola run gaji karyawan dan posting pembayaran ke Cash & Bank.</Text>
        </div>
        {canManagePayroll && (
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={activeTab === 'payroll' ? openCreateForm : () => setIsCashAdvanceFormOpen(true)}
          >
            {activeTab === 'payroll' ? 'Buat Payroll' : 'Cairkan Kasbon'}
          </Button>
        )}
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'payroll',
            label: 'Run Payroll',
            children: (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Card className="border-l-4 border-l-sky-500 shadow-sm">
                    <Statistic title="Run Aktif" value={summary.totalRuns} prefix={<ReceiptText size={18} />} />
                  </Card>
                  <Card className="border-l-4 border-l-gray-500 shadow-sm">
                    <Statistic title="Draft" value={summary.draft} prefix={<Edit3 size={18} />} />
                  </Card>
                  <Card className="border-l-4 border-l-blue-500 shadow-sm">
                    <Statistic
                      title="Menunggu Bayar"
                      value={summary.approvedNet}
                      formatter={(value) => `${baseCurrencySymbol} ${formatCurrency(Number(value))}`}
                      prefix={<UserRoundCheck size={18} />}
                    />
                  </Card>
                  <Card className="border-l-4 border-l-green-500 shadow-sm">
                    <Statistic
                      title="Sudah Dibayar"
                      value={summary.paidNet}
                      formatter={(value) => `${baseCurrencySymbol} ${formatCurrency(Number(value))}`}
                      prefix={<Banknote size={18} />}
                    />
                  </Card>
                </div>

                <Card
                  className="shadow-sm"
                  title={(
                    <div className="flex items-center gap-2">
                      <Users size={18} />
                      <span>Daftar Payroll</span>
                    </div>
                  )}
                >
                  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_200px]">
                    <Input.Search
                      allowClear
                      value={searchText}
                      placeholder="Cari nomor payroll, periode, akun bayar, atau nama karyawan..."
                      onChange={(event) => setSearchText(event.target.value)}
                    />
                    <Select<PayrollStatusFilter>
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: 'ALL', label: 'Semua status' },
                        { value: 'DRAFT', label: 'Draft' },
                        { value: 'APPROVED', label: 'Approved' },
                        { value: 'PAID', label: 'Paid' },
                        { value: 'VOIDED', label: 'Void' },
                      ]}
                    />
                  </div>

                  <Table<PayrollRunWithItems>
                    rowKey="id"
                    dataSource={filteredPayrollRuns}
                    columns={columns}
                    scroll={{ x: 1220 }}
                    expandable={{
                      expandedRowRender: (run) => (
                        <Table<PayrollRunItem>
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={run.items}
                          columns={buildItemColumns(run)}
                          scroll={{ x: run.status === 'PAID' ? 1200 : 1080 }}
                        />
                      ),
                    }}
                    locale={{ emptyText: <Empty description="Belum ada payroll karyawan." /> }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'cash-advance',
            label: 'Kasbon',
            children: (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Card className="border-l-4 border-l-blue-500 shadow-sm">
                    <Statistic title="Kasbon Aktif" value={cashAdvanceSummary.activeCount} prefix={<ReceiptText size={18} />} />
                  </Card>
                  <Card className="border-l-4 border-l-sky-500 shadow-sm">
                    <Statistic
                      title="Outstanding"
                      value={cashAdvanceSummary.outstandingAmount}
                      formatter={(value) => `${baseCurrencySymbol} ${formatCurrency(Number(value))}`}
                      prefix={<Banknote size={18} />}
                    />
                  </Card>
                  <Card className="border-l-4 border-l-amber-500 shadow-sm">
                    <Statistic
                      title="Reserved Payroll"
                      value={cashAdvanceSummary.reservedAmount}
                      formatter={(value) => `${baseCurrencySymbol} ${formatCurrency(Number(value))}`}
                      prefix={<UserRoundCheck size={18} />}
                    />
                  </Card>
                  <Card className="border-l-4 border-l-green-500 shadow-sm">
                    <Statistic title="Kasbon Lunas" value={cashAdvanceSummary.paidCount} prefix={<CheckCircle2 size={18} />} />
                  </Card>
                </div>

                <Card
                  className="shadow-sm"
                  title={(
                    <div className="flex items-center gap-2">
                      <Banknote size={18} />
                      <span>Daftar Kasbon</span>
                    </div>
                  )}
                >
                  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_200px]">
                    <Input.Search
                      allowClear
                      value={cashAdvanceSearchText}
                      placeholder="Cari nomor kasbon, karyawan, akun, atau payroll..."
                      onChange={(event) => setCashAdvanceSearchText(event.target.value)}
                    />
                    <Select<EmployeeCashAdvanceStatusFilter>
                      value={cashAdvanceStatusFilter}
                      onChange={setCashAdvanceStatusFilter}
                      options={[
                        { value: 'ALL', label: 'Semua status' },
                        { value: 'ACTIVE', label: 'Aktif' },
                        { value: 'PAID', label: 'Lunas' },
                        { value: 'VOIDED', label: 'Void' },
                      ]}
                    />
                  </div>

                  <Table<EmployeeCashAdvanceWithRepayments>
                    rowKey="id"
                    dataSource={filteredCashAdvances}
                    columns={cashAdvanceColumns}
                    scroll={{ x: 1220 }}
                    expandable={{
                      expandedRowRender: (advance) => (
                        advance.repayments.length > 0 ? (
                          <Table<EmployeeCashAdvanceRepayment>
                            rowKey="id"
                            size="small"
                            pagination={false}
                            dataSource={advance.repayments}
                            columns={cashAdvanceRepaymentColumns}
                            scroll={{ x: 760 }}
                          />
                        ) : (
                          <Empty description="Belum ada potongan payroll untuk kasbon ini." />
                        )
                      ),
                    }}
                    locale={{ emptyText: <Empty description="Belum ada kasbon karyawan." /> }}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />

      <PayrollPaymentModal
        open={Boolean(payingRun)}
        run={payingRun}
        accounts={cashBankAccounts}
        submitting={isPaying}
        onCancel={() => setPayingRun(null)}
        onSubmit={handlePay}
      />

      <EmployeeCashAdvanceFormModal
        open={isCashAdvanceFormOpen}
        employees={cashAdvanceEmployees}
        accounts={cashAdvanceCashBankAccounts}
        baseCurrencySymbol={baseCurrencySymbol}
        submitting={isCreatingCashAdvance}
        onCancel={closeCashAdvanceForm}
        onSubmit={handleSubmitCashAdvance}
      />
    </div>
  );
}
