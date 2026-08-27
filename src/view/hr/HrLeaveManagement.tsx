import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/auth/useAuth';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import {
  approveLeaveAsHr,
  approveLeaveAsSupervisor,
  cancelLeaveRequest,
  createLeaveRequest,
  grantAnnualLeave,
  rejectLeaveRequest,
  saveLeaveType,
  submitLeaveRequest,
} from '@/services/workforceService';
import type { LeaveRequest, LeaveRequestStatus } from '@/types';

const { Title, Text } = Typography;
const STATUS: Record<LeaveRequestStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'default' },
  PENDING_SUPERVISOR: { label: 'Menunggu Atasan', color: 'gold' },
  PENDING_HR: { label: 'Menunggu HR', color: 'blue' },
  APPROVED: { label: 'Disetujui', color: 'green' },
  REJECTED: { label: 'Ditolak', color: 'red' },
  CANCELLED: { label: 'Dibatalkan', color: 'default' },
};

type RequestForm = {
  employee_id: string;
  leave_type_id: string;
  period: [Dayjs, Dayjs];
  reason: string;
};

type PolicyForm = {
  code: string;
  name: string;
  annual_quota_days: number;
  is_paid: boolean;
  requires_balance: boolean;
};

type GrantForm = {
  employee_id: string;
  leave_type_id: string;
  year: number;
  days?: number;
};

export default function HrLeaveManagement() {
  const { message } = App.useApp();
  const { currentUser, can } = useAuth();
  const [requestForm] = Form.useForm<RequestForm>();
  const [policyForm] = Form.useForm<PolicyForm>();
  const [grantForm] = Form.useForm<GrantForm>();
  const [dialog, setDialog] = useState<'request' | 'policy' | 'grant'>();
  const [decision, setDecision] = useState<{ request: LeaveRequest; action: 'reject' | 'cancel' }>();
  const [decisionNotes, setDecisionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const canHrApprove = can('hr.leave.hr_approve');
  const canSupervisorApprove = can('hr.leave.supervisor_approve');
  const canPolicy = can('hr.leave.policy.manage');

  const data = useLiveQuery(async () => {
    const [requests, types, employees, ledger, actions] = await Promise.all([
      db.leaveRequests.orderBy('updated_at').reverse().toArray(),
      db.leaveTypes.orderBy('name').toArray(),
      db.employees.orderBy('name').toArray(),
      db.leaveBalanceLedger.toArray(),
      db.leaveRequestActions.orderBy('created_at').reverse().toArray(),
    ]);
    return {
      requests,
      types,
      employees: employees.filter((row) => row.is_active),
      ledger,
      actions,
    };
  }, []);

  const visibleRequests = useMemo(() => {
    if (canHrApprove || canSupervisorApprove) return data?.requests ?? [];
    return (data?.requests ?? []).filter((row) => row.employee_id === currentUser?.employee_id);
  }, [canHrApprove, canSupervisorApprove, currentUser?.employee_id, data?.requests]);

  const balances = useMemo(() => {
    const rows = new Map<string, { employee_id: string; leave_type_id: string; year: number; available: number; reserved: number; used: number }>();
    (data?.ledger ?? []).forEach((entry) => {
      const key = `${entry.employee_id}:${entry.leave_type_id}:${entry.year}`;
      const current = rows.get(key) ?? {
        employee_id: entry.employee_id,
        leave_type_id: entry.leave_type_id,
        year: entry.year,
        available: 0,
        reserved: 0,
        used: 0,
      };
      current.available += entry.available_delta;
      current.reserved += entry.reserved_delta;
      current.used += entry.used_delta;
      rows.set(key, current);
    });
    return Array.from(rows.values());
  }, [data?.ledger]);
  const employeeById = new Map((data?.employees ?? []).map((row) => [row.id, row]));
  const typeById = new Map((data?.types ?? []).map((row) => [row.id, row]));

  const execute = async (operation: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await operation();
      message.success(success);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Operasi cuti gagal.');
    } finally {
      setSaving(false);
    }
  };

  const saveRequest = async () => {
    const values = await requestForm.validateFields();
    await execute(async () => {
      await createLeaveRequest({
        employee_id: values.employee_id,
        leave_type_id: values.leave_type_id,
        start_date: values.period[0].format('YYYY-MM-DD'),
        end_date: values.period[1].format('YYYY-MM-DD'),
        reason: values.reason,
      });
      setDialog(undefined);
      requestForm.resetFields();
    }, 'Draft pengajuan cuti dibuat.');
  };

  const savePolicy = async () => {
    const values = await policyForm.validateFields();
    await execute(async () => {
      await saveLeaveType({ ...values, is_active: true });
      setDialog(undefined);
      policyForm.resetFields();
    }, 'Kebijakan cuti disimpan.');
  };

  const saveGrant = async () => {
    const values = await grantForm.validateFields();
    await execute(async () => {
      await grantAnnualLeave(values.employee_id, values.leave_type_id, values.year, values.days);
      setDialog(undefined);
      grantForm.resetFields();
    }, 'Kuota cuti diberikan.');
  };

  const finishDecision = async () => {
    if (!decisionNotes.trim()) {
      message.error('Alasan wajib diisi.');
      return;
    }
    const current = decision;
    if (!current) return;
    await execute(
      () => current.action === 'reject'
        ? rejectLeaveRequest(current.request.id, decisionNotes)
        : cancelLeaveRequest(current.request.id, decisionNotes),
      current.action === 'reject' ? 'Pengajuan ditolak.' : 'Pengajuan dibatalkan.',
    );
    setDecision(undefined);
    setDecisionNotes('');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <Space direction="vertical" size={4} className="mb-5">
          <Title level={2} className="!mb-0">Cuti & Ketersediaan</Title>
          <Text type="secondary">Saldo, approval berjenjang, dan dampak otomatis ke worklist penagihan.</Text>
        </Space>
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="Approval final HR wajib online. Draft dan pembacaan data tetap tersedia offline."
        />
        <Tabs
          items={[
            {
              key: 'requests',
              label: 'Pengajuan',
              children: (
                <Card extra={currentUser?.employee_id || canHrApprove ? (
                  <Button
                    type="primary"
                    onClick={() => {
                      requestForm.setFieldsValue({ employee_id: currentUser?.employee_id });
                      setDialog('request');
                    }}
                  >
                    Ajukan Cuti
                  </Button>
                ) : undefined}
                >
                  <Table<LeaveRequest>
                    rowKey="id"
                    dataSource={visibleRequests}
                    expandable={{
                      expandedRowRender: (row) => (
                        <Space direction="vertical">
                          {(data?.actions ?? []).filter((action) => action.leave_request_id === row.id).map((action) => (
                            <Text key={action.id} type="secondary">
                              {dayjs(action.created_at).format('DD/MM/YYYY HH:mm')} · {action.action} · {action.actor_name ?? 'Sistem'}
                              {action.notes ? ` — ${action.notes}` : ''}
                            </Text>
                          ))}
                        </Space>
                      ),
                    }}
                    columns={[
                      { title: 'Karyawan', dataIndex: 'employee_name' },
                      { title: 'Tipe', dataIndex: 'leave_type_name' },
                      { title: 'Periode', render: (_, row) => `${row.start_date} s.d. ${row.end_date}` },
                      { title: 'Hari', dataIndex: 'day_count' },
                      { title: 'Status', render: (_, row) => <Tag color={STATUS[row.status].color}>{STATUS[row.status].label}</Tag> },
                      {
                        title: 'Aksi',
                        render: (_, row) => (
                          <Space wrap>
                            {row.status === 'DRAFT' && (
                              <Button size="small" loading={saving} onClick={() => execute(() => submitLeaveRequest(row.id), 'Pengajuan dikirim.')}>Submit</Button>
                            )}
                            {row.status === 'PENDING_SUPERVISOR' && canSupervisorApprove && (
                              <Button size="small" type="primary" loading={saving} onClick={() => execute(() => approveLeaveAsSupervisor(row.id), 'Disetujui atasan.')}>Setujui Atasan</Button>
                            )}
                            {row.status === 'PENDING_HR' && canHrApprove && (
                              <Button size="small" type="primary" loading={saving} onClick={() => execute(() => approveLeaveAsHr(row.id), 'Approval final berhasil.')}>Setujui HR</Button>
                            )}
                            {(['PENDING_SUPERVISOR', 'PENDING_HR'] as LeaveRequestStatus[]).includes(row.status) && (canHrApprove || canSupervisorApprove) && (
                              <Button size="small" danger onClick={() => setDecision({ request: row, action: 'reject' })}>Tolak</Button>
                            )}
                            {!['REJECTED', 'CANCELLED'].includes(row.status) && (row.employee_id === currentUser?.employee_id || canHrApprove) && (
                              <Button size="small" onClick={() => setDecision({ request: row, action: 'cancel' })}>Batalkan</Button>
                            )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'balances',
              label: 'Saldo',
              children: (
                <Card extra={canPolicy ? <Button type="primary" onClick={() => setDialog('grant')}>Berikan Kuota</Button> : undefined}>
                  <Table
                    rowKey={(row) => `${row.employee_id}:${row.leave_type_id}:${row.year}`}
                    dataSource={balances.filter((row) => canHrApprove || row.employee_id === currentUser?.employee_id)}
                    columns={[
                      { title: 'Karyawan', render: (_, row) => employeeById.get(row.employee_id)?.name ?? row.employee_id },
                      { title: 'Tipe', render: (_, row) => typeById.get(row.leave_type_id)?.name ?? row.leave_type_id },
                      { title: 'Tahun', dataIndex: 'year' },
                      { title: 'Tersedia', dataIndex: 'available' },
                      { title: 'Direservasi', dataIndex: 'reserved' },
                      { title: 'Terpakai', dataIndex: 'used' },
                    ]}
                  />
                </Card>
              ),
            },
            ...(canPolicy ? [{
              key: 'policy',
              label: 'Kebijakan',
              children: (
                <Card extra={<Button type="primary" onClick={() => setDialog('policy')}>Tipe Cuti Baru</Button>}>
                  <Table
                    rowKey="id"
                    dataSource={data?.types ?? []}
                    columns={[
                      { title: 'Kode', dataIndex: 'code' },
                      { title: 'Nama', dataIndex: 'name' },
                      { title: 'Kuota/Tahun', dataIndex: 'annual_quota_days' },
                      { title: 'Pembayaran', render: (_, row) => <Tag color={row.is_paid ? 'green' : 'orange'}>{row.is_paid ? 'Paid' : 'Unpaid'}</Tag> },
                      { title: 'Saldo', render: (_, row) => row.requires_balance ? 'Wajib saldo' : 'Tanpa saldo' },
                    ]}
                  />
                </Card>
              ),
            }] : []),
          ]}
        />
      </div>

      <Modal title="Pengajuan Cuti" open={dialog === 'request'} onCancel={() => setDialog(undefined)} onOk={saveRequest} confirmLoading={saving} destroyOnHidden>
        <Form form={requestForm} layout="vertical">
          <Form.Item name="employee_id" label="Karyawan" rules={[{ required: true }]}>
            <Select
              disabled={!canHrApprove}
              options={(data?.employees ?? []).map((row) => ({ value: row.id, label: row.name }))}
            />
          </Form.Item>
          <Form.Item name="leave_type_id" label="Tipe cuti" rules={[{ required: true }]}>
            <Select options={(data?.types ?? []).filter((row) => row.is_active).map((row) => ({ value: row.id, label: row.name }))} />
          </Form.Item>
          <Form.Item name="period" label="Periode" rules={[{ required: true }]}><DatePicker.RangePicker className="w-full" /></Form.Item>
          <Form.Item name="reason" label="Alasan" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Tipe Cuti" open={dialog === 'policy'} onCancel={() => setDialog(undefined)} onOk={savePolicy} confirmLoading={saving} destroyOnHidden>
        <Form form={policyForm} layout="vertical" initialValues={{ annual_quota_days: 12, is_paid: true, requires_balance: true }}>
          <Form.Item name="code" label="Kode" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="Nama" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="annual_quota_days" label="Kuota tahunan" rules={[{ required: true }]}><InputNumber min={0} className="w-full" /></Form.Item>
          <Form.Item name="is_paid" valuePropName="checked"><Checkbox>Paid leave</Checkbox></Form.Item>
          <Form.Item name="requires_balance" valuePropName="checked"><Checkbox>Wajib memiliki saldo</Checkbox></Form.Item>
        </Form>
      </Modal>

      <Modal title="Berikan Kuota Tahunan" open={dialog === 'grant'} onCancel={() => setDialog(undefined)} onOk={saveGrant} confirmLoading={saving} destroyOnHidden>
        <Form form={grantForm} layout="vertical" initialValues={{ year: dayjs().year() }}>
          <Form.Item name="employee_id" label="Karyawan" rules={[{ required: true }]}><Select options={(data?.employees ?? []).map((row) => ({ value: row.id, label: row.name }))} /></Form.Item>
          <Form.Item name="leave_type_id" label="Tipe cuti" rules={[{ required: true }]}><Select options={(data?.types ?? []).filter((row) => row.requires_balance).map((row) => ({ value: row.id, label: row.name }))} /></Form.Item>
          <Form.Item name="year" label="Tahun" rules={[{ required: true }]}><InputNumber min={2020} max={2100} className="w-full" /></Form.Item>
          <Form.Item name="days" label="Hari (kosong = kuota default)"><InputNumber min={0} className="w-full" /></Form.Item>
        </Form>
      </Modal>

      <Modal title={decision?.action === 'reject' ? 'Tolak Pengajuan' : 'Batalkan Pengajuan'} open={Boolean(decision)} onCancel={() => setDecision(undefined)} onOk={finishDecision} confirmLoading={saving}>
        <Input.TextArea value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} rows={4} placeholder="Alasan wajib diisi" />
      </Modal>
    </div>
  );
}
