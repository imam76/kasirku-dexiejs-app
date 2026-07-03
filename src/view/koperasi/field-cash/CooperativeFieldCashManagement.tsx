import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Tag } from 'antd';
import type { Dayjs } from 'dayjs';
import { Banknote, Download, Upload } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { buildDailyFieldCashReportFilters, useCooperativeFieldCash } from '@/hooks/useCooperativeFieldCash';
import dayjs from '@/lib/dayjs';
import type { Employee } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import CooperativeFieldCashCashDetailTable from './CooperativeFieldCashCashDetailTable';
import CooperativeFieldCashReportTable from './CooperativeFieldCashReportTable';

const { TextArea } = Input;

interface TransferFormValues {
  employee_id: string;
  finance_cash_account_id: string;
  amount: number;
  transfer_date?: Dayjs;
  notes?: string;
}

type TransferMode = 'DROPPING' | 'DEPOSIT';

const REMEMBERED_FINANCE_ACCOUNT_ID_KEY = 'kasirku.koperasi.fieldCash.rememberedFinanceAccountId';

const money = (amount: number) => `Rp ${formatCurrency(amount)}`;

const getRememberedFinanceAccountId = () => (
  typeof window === 'undefined'
    ? undefined
    : window.localStorage.getItem(REMEMBERED_FINANCE_ACCOUNT_ID_KEY) || undefined
);

const saveRememberedFinanceAccountId = (accountId?: string) => {
  if (typeof window === 'undefined') return;

  if (accountId) {
    window.localStorage.setItem(REMEMBERED_FINANCE_ACCOUNT_ID_KEY, accountId);
  } else {
    window.localStorage.removeItem(REMEMBERED_FINANCE_ACCOUNT_ID_KEY);
  }
};

export default function CooperativeFieldCashManagement() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canManage = can('COOPERATIVE_FIELD_CASH_MANAGE');
  const [transferForm] = Form.useForm<TransferFormValues>();
  const [transferMode, setTransferMode] = useState<TransferMode | null>(null);
  const [rememberFinanceAccount, setRememberFinanceAccount] = useState(() => Boolean(getRememberedFinanceAccountId()));
  const {
    fieldCashEmployees,
    canViewAllFieldCash,
    financeAccounts,
    balances,
    reportRows,
    reportFilters,
    setReportFilters,
    isReportLoading,
    cashDetailDate,
    setCashDetailDate,
    cashDetailEmployees,
    isCashDetailLoading,
    cashDetailError,
    recordDropping,
    closeBook,
    isMutating,
  } = useCooperativeFieldCash();
  const selectedTransferEmployeeId = Form.useWatch('employee_id', transferForm);

  const employeeById = useMemo(() => new Map(fieldCashEmployees.map((employee) => [employee.id, employee])), [fieldCashEmployees]);
  const employeeOptions = useMemo(() => fieldCashEmployees.map((employee) => ({
    value: employee.id,
    label: `${employee.name} - ${employee.field_cash_account_code ?? '-'} ${employee.field_cash_account_name ?? ''}`,
  })), [fieldCashEmployees]);
  const financeAccountOptions = useMemo(() => financeAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [financeAccounts]);
  const selectedTransferEmployee = selectedTransferEmployeeId ? employeeById.get(selectedTransferEmployeeId) : undefined;
  const selectedTransferBalance = selectedTransferEmployee?.field_cash_account_id
    ? balances.get(selectedTransferEmployee.field_cash_account_id)
    : undefined;
  const cashDetailEmployeesById = useMemo(() => (
    new Map(cashDetailEmployees.map((employee) => [employee.employee_id, employee]))
  ), [cashDetailEmployees]);
  const selectedTransferCashDetail = selectedTransferEmployeeId
    ? cashDetailEmployeesById.get(selectedTransferEmployeeId)
    : undefined;
  const reportDate = useMemo(() => (
    reportFilters.fromDate ? dayjs(reportFilters.fromDate).tz().startOf('day') : dayjs.tz().startOf('day')
  ), [reportFilters.fromDate]);
  const cashDetailDateText = cashDetailDate.format('DD MMMM YYYY');
  const totalCollectorBalance = useMemo(() => (
    fieldCashEmployees.reduce((sum, employee) => (
      sum + Number(employee.field_cash_account_id ? balances.get(employee.field_cash_account_id) || 0 : 0)
    ), 0)
  ), [balances, fieldCashEmployees]);
  const collectorsWithBalance = useMemo(() => (
    fieldCashEmployees.filter((employee) => (
      Math.abs(Number(employee.field_cash_account_id ? balances.get(employee.field_cash_account_id) || 0 : 0)) > 0.01
    )).length
  ), [balances, fieldCashEmployees]);

  const setDailyReportDate = (date: Dayjs, employeeId = reportFilters.employeeId) => {
    setReportFilters(buildDailyFieldCashReportFilters(date, employeeId));
  };

  useEffect(() => {
    if (transferMode !== 'DEPOSIT') return;

    const balance = Number(selectedTransferBalance || 0);
    transferForm.setFieldsValue({ amount: balance > 0 ? balance : 0 });
  }, [selectedTransferBalance, transferForm, transferMode]);

  const openTransferModal = (mode: TransferMode, employee?: Employee) => {
    const balance = employee?.field_cash_account_id
      ? Number(balances.get(employee.field_cash_account_id) || 0)
      : undefined;
    const rememberedFinanceAccountId = getRememberedFinanceAccountId();
    const rememberedAccountIsAvailable = Boolean(
      rememberedFinanceAccountId &&
      (
        financeAccounts.length === 0 ||
        financeAccounts.some((account) => account.id === rememberedFinanceAccountId)
      )
    );

    if (rememberedFinanceAccountId && financeAccounts.length > 0 && !rememberedAccountIsAvailable) {
      saveRememberedFinanceAccountId();
    }

    transferForm.resetFields();
    transferForm.setFieldsValue({
      employee_id: employee?.id,
      finance_cash_account_id: rememberedAccountIsAvailable ? rememberedFinanceAccountId : undefined,
      amount: mode === 'DEPOSIT' && balance && balance > 0 ? balance : undefined,
      transfer_date: dayjs(),
    });
    if (mode === 'DEPOSIT') {
      setCashDetailDate(reportDate);
    }
    setRememberFinanceAccount(rememberedAccountIsAvailable);
    setTransferMode(mode);
  };

  const closeTransferModal = () => {
    setTransferMode(null);
    transferForm.resetFields();
  };

  const handleTransfer = async (values: TransferFormValues) => {
    if (!transferMode) return;

    const employee = employeeById.get(values.employee_id);
    if (!employee?.field_cash_account_id) {
      message.error('Kolektor belum memiliki akun kas petugas.');
      return;
    }

    const input = {
      employee_id: employee.id,
      cash_account_id: employee.field_cash_account_id,
      finance_cash_account_id: values.finance_cash_account_id,
      amount: Number(values.amount || 0),
      transfer_date: values.transfer_date?.toISOString(),
      notes: values.notes,
    };

    try {
      if (rememberFinanceAccount) {
        saveRememberedFinanceAccountId(values.finance_cash_account_id);
      }

      if (transferMode === 'DROPPING') {
        await recordDropping(input);
        message.success('Dropping kas ke kolektor berhasil dicatat.');
      } else {
        await closeBook({
          employee_id: input.employee_id,
          cash_account_id: input.cash_account_id,
          finance_cash_account_id: input.finance_cash_account_id,
          transfer_date: input.transfer_date,
          notes: input.notes,
        });
        setDailyReportDate((values.transfer_date ?? dayjs()).tz().add(1, 'day').startOf('day'));
        message.success('Tutup buku setoran kolektor selesai. Saldo siap 0 untuk besok pagi.');
      }
      closeTransferModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Transfer setoran kolektor gagal dicatat.');
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          Setoran Kolektor
        </div>
      )}
      extra={canManage ? (
        <Space wrap>
          <Button icon={<Download size={16} />} onClick={() => openTransferModal('DROPPING')}>
            Dropping Kas
          </Button>
          <Button type="primary" icon={<Upload size={16} />} onClick={() => openTransferModal('DEPOSIT')}>
            Setor Kas/Bank
          </Button>
        </Space>
      ) : null}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-md border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Saldo Belum Disetor</p>
          <p className="text-xl font-semibold text-gray-800">{money(totalCollectorBalance)}</p>
        </div>
        <div className="rounded-md border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Kolektor Belum Nol</p>
          <p className="text-xl font-semibold text-gray-800">{collectorsWithBalance}</p>
        </div>
        <div className="rounded-md border border-gray-100 p-3">
          <p className="text-xs text-gray-500">{canViewAllFieldCash ? 'Kolektor Aktif' : 'Akun Kolektor'}</p>
          <p className="text-xl font-semibold text-gray-800">{fieldCashEmployees.length}</p>
        </div>
        <div className="rounded-md border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Akun Kas/Bank</p>
          <p className="text-xl font-semibold text-gray-800">{financeAccounts.length}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,260px)_minmax(220px,320px)]">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Tanggal Rekap</p>
          <DatePicker
            className="w-full"
            value={reportDate}
            format="DD MMMM YYYY"
            onChange={(value) => setDailyReportDate(value?.startOf('day') ?? dayjs.tz().startOf('day'))}
          />
        </div>
        {canViewAllFieldCash && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Kolektor</p>
            <Select
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Semua kolektor"
              value={reportFilters.employeeId}
              onChange={(employeeId) => setDailyReportDate(reportDate, employeeId)}
              options={employeeOptions}
            />
          </div>
        )}
      </div>

      <CooperativeFieldCashReportTable
        rows={reportRows}
        loading={isReportLoading || isMutating}
        canManage={canManage}
        onDropping={(row) => openTransferModal('DROPPING', employeeById.get(row.employee_id))}
        onDeposit={(row) => openTransferModal('DEPOSIT', employeeById.get(row.employee_id))}
      />

      <Modal
        title={transferMode === 'DROPPING' ? 'Dropping Kas ke Kolektor' : 'Setoran Kolektor ke Kas/Bank'}
        open={Boolean(transferMode)}
        onCancel={closeTransferModal}
        onOk={() => transferForm.submit()}
        okText={transferMode === 'DEPOSIT' ? 'Tutup Buku' : 'OK'}
        confirmLoading={isMutating}
        destroyOnHidden
        forceRender
        width={620}
      >
        <Form<TransferFormValues>
          form={transferForm}
          layout="vertical"
          onFinish={handleTransfer}
          requiredMark={false}
          className="mt-4"
        >
          <Form.Item
            name="employee_id"
            label="Kolektor"
            rules={[{ required: true, message: 'Kolektor wajib dipilih.' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Pilih kolektor"
              options={employeeOptions}
            />
          </Form.Item>
          {selectedTransferEmployee && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Tag>{selectedTransferEmployee.field_cash_account_code}</Tag>
              <span className="text-sm text-gray-600">{selectedTransferEmployee.field_cash_account_name}</span>
              <span className="text-sm font-medium text-gray-800">
                Saldo {money(Number(selectedTransferBalance || 0))}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="finance_cash_account_id"
              label={transferMode === 'DROPPING' ? 'Dari Akun Kas/Bank' : 'Ke Akun Kas/Bank'}
              rules={[{ required: true, message: 'Akun kas/bank wajib dipilih.' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Pilih akun kas/bank"
                options={financeAccountOptions}
                onChange={(accountId) => {
                  if (rememberFinanceAccount) {
                    saveRememberedFinanceAccountId(accountId);
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name="transfer_date"
              label="Tanggal"
              rules={[{ required: true, message: 'Tanggal wajib diisi.' }]}
            >
              <DatePicker showTime className="w-full" />
            </Form.Item>
          </div>
          <Checkbox
            checked={rememberFinanceAccount}
            onChange={(event) => {
              const checked = event.target.checked;
              const selectedAccountId = transferForm.getFieldValue('finance_cash_account_id');

              setRememberFinanceAccount(checked);
              saveRememberedFinanceAccountId(checked ? selectedAccountId : undefined);
            }}
          >
            Ingat akun kas/bank
          </Checkbox>
          <Form.Item
            name="amount"
            label={transferMode === 'DEPOSIT' ? 'Nominal Tutup Buku' : 'Nominal'}
            rules={[{
              required: true,
              type: 'number',
              min: 1,
              message: transferMode === 'DEPOSIT'
                ? 'Saldo tutup buku wajib lebih dari 0.'
                : 'Nominal wajib lebih dari 0.',
            }]}
          >
            <InputNumber<number>
              min={transferMode === 'DEPOSIT' ? 0 : 1}
              disabled={transferMode === 'DEPOSIT'}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
            />
          </Form.Item>
          <Form.Item name="notes" label="Catatan">
            <TextArea rows={3} />
          </Form.Item>
          {transferMode === 'DEPOSIT' ? (
            <div className="space-y-3">
              <div className="max-w-[260px]">
                <p className="mb-2 text-sm font-medium text-gray-700">Tanggal Laporan Tunai</p>
                <DatePicker
                  className="w-full"
                  value={cashDetailDate}
                  format="DD MMMM YYYY"
                  onChange={(value) => setCashDetailDate(value?.startOf('day') ?? dayjs.tz().startOf('day'))}
                />
              </div>
              <CooperativeFieldCashCashDetailTable
                compact
                employees={selectedTransferCashDetail ? [selectedTransferCashDetail] : []}
                loading={isCashDetailLoading}
                title="Rincian Laporan Tunai"
                subtitle={cashDetailDateText}
                emptyText="Belum ada rincian tunai untuk kolektor dan tanggal ini."
                error={cashDetailError}
              />
            </div>
          ) : null}
        </Form>
      </Modal>
    </Card>
  );
}
