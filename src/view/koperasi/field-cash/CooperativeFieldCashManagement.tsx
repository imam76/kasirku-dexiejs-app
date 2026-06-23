import { useMemo, useState } from 'react';
import { App, Alert, Button, Card, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { Banknote, Download, Upload } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useCooperativeFieldCash } from '@/hooks/useCooperativeFieldCash';
import dayjs from '@/lib/dayjs';
import type { CooperativeFieldCashReportRow } from '@/services/cooperativeFieldCashReportService';
import type { CooperativeFieldCashSession, Employee } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import CooperativeFieldCashReportTable from './CooperativeFieldCashReportTable';

const { TextArea } = Input;

interface TransferFormValues {
  employee_id: string;
  finance_cash_account_id: string;
  amount: number;
  transfer_date?: Dayjs;
  notes?: string;
}

interface OpenSessionFormValues {
  opening_cash_amount: number;
  opening_note?: string;
}

interface CloseSessionFormValues {
  closing_cash_amount: number;
  closing_note?: string;
}

type TransferMode = 'DROPPING' | 'DEPOSIT';

const money = (amount: number) => `Rp ${formatCurrency(amount)}`;

export default function CooperativeFieldCashManagement() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canManage = can('COOPERATIVE_FIELD_CASH_MANAGE');
  const [transferForm] = Form.useForm<TransferFormValues>();
  const [openSessionForm] = Form.useForm<OpenSessionFormValues>();
  const [closeSessionForm] = Form.useForm<CloseSessionFormValues>();
  const [transferMode, setTransferMode] = useState<TransferMode | null>(null);
  const [openSessionEmployeeId, setOpenSessionEmployeeId] = useState<string | null>(null);
  const [closingSession, setClosingSession] = useState<CooperativeFieldCashSession | null>(null);
  const {
    fieldCashEmployees,
    canViewAllFieldCash,
    financeAccounts,
    balances,
    openSessions,
    reportRows,
    reportFilters,
    setReportFilters,
    isReportLoading,
    recordDropping,
    recordDeposit,
    openSession,
    closeSession,
    previewReconciliation,
    isMutating,
  } = useCooperativeFieldCash();
  const selectedTransferEmployeeId = Form.useWatch('employee_id', transferForm);
  const openingCashAmount = Form.useWatch('opening_cash_amount', openSessionForm);
  const closingCashAmount = Form.useWatch('closing_cash_amount', closeSessionForm);

  const openSessionEmployee = openSessionEmployeeId ? fieldCashEmployees.find((employee) => employee.id === openSessionEmployeeId) : undefined;
  const openSessionExpected = openSessionEmployee?.field_cash_account_id
    ? Number(balances.get(openSessionEmployee.field_cash_account_id) || 0)
    : 0;
  const openSessionDifference = Number(openingCashAmount || 0) - openSessionExpected;

  const reconciliationQuery = useQuery({
    queryKey: ['cooperativeFieldCashReconciliation', closingSession?.id],
    queryFn: () => previewReconciliation(closingSession!.id),
    enabled: Boolean(closingSession?.id),
  });
  const reconciliation = reconciliationQuery.data;
  const remainingCash = Number(reconciliation?.expected_closing_cash_amount || 0);
  const mustDepositFirst = remainingCash > 0.01;
  const closingDifference = Number(closingCashAmount || 0) - remainingCash;

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
  // Ringkasan ikut lingkup sesi aktif (sama seperti tabel), bukan saldo lifetime.
  const totalCollectorBalance = useMemo(() => (
    reportRows.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0)
  ), [reportRows]);
  const collectorsWithBalance = useMemo(() => (
    reportRows.filter((row) => Math.abs(Number(row.balance_amount || 0)) > 0.01).length
  ), [reportRows]);

  const openTransferModal = (mode: TransferMode, employee?: Employee) => {
    const balance = employee?.field_cash_account_id
      ? Number(balances.get(employee.field_cash_account_id) || 0)
      : undefined;

    transferForm.resetFields();
    transferForm.setFieldsValue({
      employee_id: employee?.id,
      amount: mode === 'DEPOSIT' && balance && balance > 0 ? balance : undefined,
      transfer_date: dayjs(),
    });
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
      if (transferMode === 'DROPPING') {
        await recordDropping(input);
        message.success('Dropping kas ke kolektor berhasil dicatat.');
      } else {
        await recordDeposit(input);
        message.success('Setoran kolektor ke kas/bank berhasil dicatat.');
      }
      closeTransferModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Transfer setoran kolektor gagal dicatat.');
    }
  };

  const openOpenSessionModal = (row: CooperativeFieldCashReportRow) => {
    openSessionForm.resetFields();
    openSessionForm.setFieldsValue({ opening_cash_amount: 0 });
    setOpenSessionEmployeeId(row.employee_id);
  };

  const closeOpenSessionModal = () => {
    setOpenSessionEmployeeId(null);
    openSessionForm.resetFields();
  };

  const handleOpenSession = async (values: OpenSessionFormValues) => {
    if (!openSessionEmployeeId) return;

    try {
      await openSession({
        employee_id: openSessionEmployeeId,
        opening_cash_amount: Number(values.opening_cash_amount || 0),
        opening_note: values.opening_note,
      });
      message.success('Sesi kas kolektor berhasil dibuka.');
      closeOpenSessionModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Sesi kas kolektor gagal dibuka.');
    }
  };

  const openCloseSessionModal = (row: CooperativeFieldCashReportRow) => {
    const session = openSessions.get(row.employee_id);
    if (!session) {
      message.error('Sesi kas kolektor tidak ditemukan.');
      return;
    }
    closeSessionForm.resetFields();
    closeSessionForm.setFieldsValue({ closing_cash_amount: 0 });
    setClosingSession(session);
  };

  const closeCloseSessionModal = () => {
    setClosingSession(null);
    closeSessionForm.resetFields();
  };

  const handleDepositRemaining = () => {
    if (!closingSession) return;
    const employee = employeeById.get(closingSession.employee_id);
    if (!employee?.field_cash_account_id) {
      message.error('Kolektor belum memiliki akun kas petugas.');
      return;
    }
    transferForm.resetFields();
    transferForm.setFieldsValue({
      employee_id: employee.id,
      amount: remainingCash,
      transfer_date: dayjs(),
    });
    setTransferMode('DEPOSIT');
  };

  const handleCloseSession = async (values: CloseSessionFormValues) => {
    if (!closingSession) return;

    try {
      await closeSession({
        session_id: closingSession.id,
        closing_cash_amount: Number(values.closing_cash_amount || 0),
        closing_note: values.closing_note,
      });
      message.success('Sesi kas kolektor berhasil ditutup.');
      closeCloseSessionModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Sesi kas kolektor gagal ditutup.');
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

      {canViewAllFieldCash && (
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,320px)]">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Semua kolektor"
            value={reportFilters.employeeId}
            onChange={(employeeId) => setReportFilters({ ...reportFilters, employeeId })}
            options={employeeOptions}
          />
        </div>
      )}

      <CooperativeFieldCashReportTable
        rows={reportRows}
        loading={isReportLoading || isMutating}
        canManage={canManage}
        openSessions={openSessions}
        onDropping={(row) => openTransferModal('DROPPING', employeeById.get(row.employee_id))}
        onDeposit={(row) => openTransferModal('DEPOSIT', employeeById.get(row.employee_id))}
        onOpenSession={openOpenSessionModal}
        onCloseSession={openCloseSessionModal}
      />

      <Modal
        title={transferMode === 'DROPPING' ? 'Dropping Kas ke Kolektor' : 'Setoran Kolektor ke Kas/Bank'}
        open={Boolean(transferMode)}
        onCancel={closeTransferModal}
        onOk={() => transferForm.submit()}
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
          <Form.Item
            name="amount"
            label="Nominal"
            rules={[{ required: true, type: 'number', min: 1, message: 'Nominal wajib lebih dari 0.' }]}
          >
            <InputNumber<number>
              min={1}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
            />
          </Form.Item>
          <Form.Item name="notes" label="Catatan">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Buka Sesi Kas Kolektor"
        open={Boolean(openSessionEmployeeId)}
        onCancel={closeOpenSessionModal}
        onOk={() => openSessionForm.submit()}
        confirmLoading={isMutating}
        destroyOnHidden
        forceRender
        width={520}
      >
        {openSessionEmployee && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Tag>{openSessionEmployee.field_cash_account_code}</Tag>
            <span className="text-sm text-gray-600">{openSessionEmployee.name}</span>
            <span className="text-sm font-medium text-gray-800">Saldo sistem {money(openSessionExpected)}</span>
          </div>
        )}
        <Form<OpenSessionFormValues>
          form={openSessionForm}
          layout="vertical"
          onFinish={handleOpenSession}
          requiredMark={false}
          className="mt-2"
        >
          <Form.Item
            name="opening_cash_amount"
            label="Uang Fisik Awal"
            rules={[{ required: true, type: 'number', min: 0, message: 'Uang fisik awal tidak boleh negatif.' }]}
          >
            <InputNumber<number>
              min={0}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
            />
          </Form.Item>
          {Math.abs(openSessionDifference) > 0.01 && (
            <Alert
              type="warning"
              showIcon
              className="mb-4"
              message={`Selisih ${money(openSessionDifference)} dari saldo sistem. Catatan wajib diisi.`}
            />
          )}
          <Form.Item
            name="opening_note"
            label="Catatan"
            rules={Math.abs(openSessionDifference) > 0.01
              ? [{ required: true, message: 'Catatan wajib diisi jika ada selisih.' }]
              : undefined}
          >
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Tutup Sesi Kas Kolektor"
        open={Boolean(closingSession)}
        onCancel={closeCloseSessionModal}
        onOk={() => closeSessionForm.submit()}
        okText="Tutup Sesi"
        okButtonProps={{ danger: true, disabled: mustDepositFirst || reconciliationQuery.isLoading }}
        confirmLoading={isMutating}
        destroyOnHidden
        forceRender
        width={620}
      >
        {closingSession && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Tag color="blue">{closingSession.session_number}</Tag>
            <span className="text-sm text-gray-600">{closingSession.employee_name}</span>
          </div>
        )}
        <Descriptions
          bordered
          size="small"
          column={1}
          className="mb-4"
        >
          <Descriptions.Item label="Kas Awal">{money(Number(closingSession?.opening_cash_amount || 0))}</Descriptions.Item>
          <Descriptions.Item label="Dropping dari Finance">{money(Number(reconciliation?.dropping_from_finance_amount || 0))}</Descriptions.Item>
          <Descriptions.Item label="Storting Angsuran">{money(Number(reconciliation?.storting_loan_payment_amount || 0))}</Descriptions.Item>
          <Descriptions.Item label="Storting Simpanan">{money(Number(reconciliation?.storting_saving_deposit_amount || 0))}</Descriptions.Item>
          <Descriptions.Item label="Pencairan Pinjaman">{money(-Number(reconciliation?.loan_disbursement_amount || 0))}</Descriptions.Item>
          <Descriptions.Item label="Penarikan Simpanan">{money(-Number(reconciliation?.saving_withdrawal_amount || 0))}</Descriptions.Item>
          <Descriptions.Item label="IPTW">{money(-Number(reconciliation?.iptw_payout_amount || 0))}</Descriptions.Item>
          <Descriptions.Item label="Sudah Setor ke Finance">{money(-Number(reconciliation?.deposit_to_finance_amount || 0))}</Descriptions.Item>
          <Descriptions.Item label="Sisa Kas (harus disetor)">
            <span className="font-semibold">{money(remainingCash)}</span>
          </Descriptions.Item>
        </Descriptions>

        {mustDepositFirst ? (
          <Alert
            type="warning"
            showIcon
            className="mb-4"
            message={`Sisa kas ${money(remainingCash)} harus disetor ke finance dulu sebelum sesi ditutup.`}
            action={(
              <Button size="small" type="primary" icon={<Upload size={14} />} onClick={handleDepositRemaining}>
                Setor Sisa
              </Button>
            )}
          />
        ) : (
          <Form<CloseSessionFormValues>
            form={closeSessionForm}
            layout="vertical"
            onFinish={handleCloseSession}
            requiredMark={false}
          >
            <Form.Item
              name="closing_cash_amount"
              label="Uang Fisik Akhir"
              rules={[{ required: true, type: 'number', min: 0, message: 'Uang fisik akhir tidak boleh negatif.' }]}
            >
              <InputNumber<number>
                min={0}
                className="w-full"
                formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              />
            </Form.Item>
            {Math.abs(closingDifference) > 0.01 && (
              <Alert
                type="warning"
                showIcon
                className="mb-4"
                message={`Selisih ${money(closingDifference)} dari saldo sistem. Catatan wajib diisi.`}
              />
            )}
            <Form.Item
              name="closing_note"
              label="Catatan"
              rules={Math.abs(closingDifference) > 0.01
                ? [{ required: true, message: 'Catatan wajib diisi jika ada selisih.' }]
                : undefined}
            >
              <TextArea rows={3} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Card>
  );
}
