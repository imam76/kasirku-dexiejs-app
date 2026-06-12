import { useMemo, useState } from 'react';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Tabs, Tag } from 'antd';
import type { Dayjs } from 'dayjs';
import { Banknote, Download, Plus, Upload } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useCooperativeFieldCash } from '@/hooks/useCooperativeFieldCash';
import dayjs from '@/lib/dayjs';
import type { CooperativeFieldCashSession } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import CooperativeFieldCashReportTable from './CooperativeFieldCashReportTable';
import CooperativeFieldCashSessionTable from './CooperativeFieldCashSessionTable';

const { TextArea } = Input;

interface OpenSessionFormValues {
  employee_id: string;
  opening_cash_amount: number;
  opening_note?: string;
}

interface TransferFormValues {
  employee_id: string;
  finance_cash_account_id: string;
  amount: number;
  transfer_date?: Dayjs;
  notes?: string;
}

interface CloseSessionFormValues {
  session_id: string;
  closing_cash_amount: number;
  closing_note?: string;
}

type TransferMode = 'DROPPING' | 'DEPOSIT';

export default function CooperativeFieldCashManagement() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const canManage = can('COOPERATIVE_FIELD_CASH_MANAGE');
  const [openForm] = Form.useForm<OpenSessionFormValues>();
  const [transferForm] = Form.useForm<TransferFormValues>();
  const [closeForm] = Form.useForm<CloseSessionFormValues>();
  const [isOpenModalVisible, setIsOpenModalVisible] = useState(false);
  const [transferMode, setTransferMode] = useState<TransferMode | null>(null);
  const [isCloseModalVisible, setIsCloseModalVisible] = useState(false);
  const {
    fieldCashEmployees,
    sessions,
    activeSessions,
    financeAccounts,
    balances,
    reportRows,
    reportFilters,
    setReportFilters,
    isReportLoading,
    openSession,
    closeSession,
    recordDropping,
    recordDeposit,
    isMutating,
  } = useCooperativeFieldCash();
  const selectedOpenEmployeeId = Form.useWatch('employee_id', openForm);
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
  const selectedOpenEmployee = selectedOpenEmployeeId ? employeeById.get(selectedOpenEmployeeId) : undefined;
  const selectedTransferEmployee = selectedTransferEmployeeId ? employeeById.get(selectedTransferEmployeeId) : undefined;
  const selectedOpenBalance = selectedOpenEmployee?.field_cash_account_id
    ? balances.get(selectedOpenEmployee.field_cash_account_id)
    : undefined;
  const selectedTransferBalance = selectedTransferEmployee?.field_cash_account_id
    ? balances.get(selectedTransferEmployee.field_cash_account_id)
    : undefined;

  const closeOpenModal = () => {
    setIsOpenModalVisible(false);
    openForm.resetFields();
  };

  const openOpenModal = () => {
    openForm.resetFields();
    openForm.setFieldsValue({ opening_cash_amount: 0 });
    setIsOpenModalVisible(true);
  };

  const openTransferModal = (mode: TransferMode, session?: CooperativeFieldCashSession) => {
    transferForm.resetFields();
    transferForm.setFieldsValue({
      employee_id: session?.employee_id,
      transfer_date: dayjs(),
    });
    setTransferMode(mode);
  };

  const closeTransferModal = () => {
    setTransferMode(null);
    transferForm.resetFields();
  };

  const openCloseModal = (session: CooperativeFieldCashSession) => {
    closeForm.resetFields();
    closeForm.setFieldsValue({
      session_id: session.id,
      closing_cash_amount: balances.get(session.cash_account_id) ?? 0,
    });
    setIsCloseModalVisible(true);
  };

  const closeCloseModal = () => {
    setIsCloseModalVisible(false);
    closeForm.resetFields();
  };

  const handleOpenSession = async (values: OpenSessionFormValues) => {
    try {
      await openSession({
        employee_id: values.employee_id,
        opening_cash_amount: Number(values.opening_cash_amount || 0),
        opening_note: values.opening_note,
      });
      message.success('Sesi setoran kolektor berhasil dibuka.');
      closeOpenModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal membuka sesi setoran kolektor.');
    }
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

  const handleCloseSession = async (values: CloseSessionFormValues) => {
    try {
      await closeSession({
        session_id: values.session_id,
        closing_cash_amount: Number(values.closing_cash_amount || 0),
        closing_note: values.closing_note,
      });
      message.success('Sesi setoran kolektor berhasil ditutup.');
      closeCloseModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menutup sesi setoran kolektor.');
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
          <Button icon={<Upload size={16} />} onClick={() => openTransferModal('DEPOSIT')}>
            Setor Kas/Bank
          </Button>
          <Button type="primary" icon={<Plus size={16} />} onClick={openOpenModal}>
            Buka Sesi
          </Button>
        </Space>
      ) : null}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Sesi Aktif</p>
          <p className="text-xl font-semibold text-gray-800">{activeSessions.length}</p>
        </div>
        <div className="rounded-md border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Kolektor Aktif</p>
          <p className="text-xl font-semibold text-gray-800">{fieldCashEmployees.length}</p>
        </div>
        <div className="rounded-md border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Akun Kas/Bank</p>
          <p className="text-xl font-semibold text-gray-800">{financeAccounts.length}</p>
        </div>
      </div>

      <Tabs
        items={[
          {
            key: 'sessions',
            label: 'Sesi Setoran',
            children: (
              <CooperativeFieldCashSessionTable
                sessions={sessions}
                loading={isMutating}
                canManage={canManage}
                onDropping={(session) => openTransferModal('DROPPING', session)}
                onDeposit={(session) => openTransferModal('DEPOSIT', session)}
                onClose={openCloseModal}
              />
            ),
          },
          {
            key: 'report',
            label: 'Rekap Setoran',
            children: (
              <>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,280px)_160px]">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Semua kolektor"
                    value={reportFilters.employeeId}
                    onChange={(employeeId) => setReportFilters({ ...reportFilters, employeeId })}
                    options={employeeOptions}
                  />
                  <Select
                    value={reportFilters.status ?? 'ALL'}
                    onChange={(status) => setReportFilters({ ...reportFilters, status })}
                    options={[
                      { value: 'ALL', label: 'Semua status' },
                      { value: 'OPEN', label: 'OPEN' },
                      { value: 'CLOSED', label: 'CLOSED' },
                    ]}
                  />
                </div>
                <CooperativeFieldCashReportTable rows={reportRows} loading={isReportLoading} />
              </>
            ),
          },
        ]}
      />

      <Modal
        title="Buka Sesi Setoran Kolektor"
        open={isOpenModalVisible}
        onCancel={closeOpenModal}
        onOk={() => openForm.submit()}
        confirmLoading={isMutating}
        destroyOnHidden
        forceRender
        width={620}
      >
        <Form<OpenSessionFormValues>
          form={openForm}
          layout="vertical"
          onFinish={handleOpenSession}
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
          {selectedOpenEmployee && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Tag>{selectedOpenEmployee.field_cash_account_code}</Tag>
              <span className="text-sm text-gray-600">{selectedOpenEmployee.field_cash_account_name}</span>
              <span className="text-sm font-medium text-gray-800">
                Saldo sistem Rp {formatCurrency(Number(selectedOpenBalance || 0))}
              </span>
            </div>
          )}
          <Form.Item
            name="opening_cash_amount"
            label="Uang Fisik Awal Kolektor"
            rules={[{ required: true, type: 'number', min: 0, message: 'Uang fisik awal wajib diisi.' }]}
          >
            <InputNumber<number>
              min={0}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
            />
          </Form.Item>
          <Form.Item name="opening_note" label="Catatan">
            <TextArea rows={3} placeholder="Wajib jika uang fisik berbeda dari saldo sistem" />
          </Form.Item>
        </Form>
      </Modal>

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
                Saldo Rp {formatCurrency(Number(selectedTransferBalance || 0))}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="finance_cash_account_id"
              label="Akun Kas/Bank"
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
        title="Tutup Sesi Setoran Kolektor"
        open={isCloseModalVisible}
        onCancel={closeCloseModal}
        onOk={() => closeForm.submit()}
        confirmLoading={isMutating}
        destroyOnHidden
        forceRender
        width={560}
      >
        <Form<CloseSessionFormValues>
          form={closeForm}
          layout="vertical"
          onFinish={handleCloseSession}
          requiredMark={false}
          className="mt-4"
        >
          <Form.Item name="session_id" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="closing_cash_amount"
            label="Uang Fisik Akhir Kolektor"
            rules={[{ required: true, type: 'number', min: 0, message: 'Uang fisik akhir wajib diisi.' }]}
          >
            <InputNumber<number>
              min={0}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
            />
          </Form.Item>
          <Form.Item name="closing_note" label="Catatan">
            <TextArea rows={3} placeholder="Wajib jika uang fisik akhir berbeda dari saldo akhir sistem" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
