import { Button, DatePicker, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeArea, CooperativeMemberStatus, Employee, EmployeeArea } from '@/types';
import { cooperativeMemberStatusOptions } from './memberOptions';

const { TextArea } = Input;

export interface CooperativeMemberFormValues {
  member_number: string;
  name: string;
  identity_number?: string;
  phone?: string;
  address?: string;
  area_id: string;
  officer_id?: string;
  join_date: Dayjs | null;
  status: CooperativeMemberStatus;
  notes?: string;
}

interface CooperativeMemberFormModalProps {
  form: FormInstance<CooperativeMemberFormValues>;
  open: boolean;
  areas: CooperativeArea[];
  employees: Employee[];
  employeeAreaAssignments: EmployeeArea[];
  isEditing: boolean;
  isSubmitting: boolean;
  isCreatingArea: boolean;
  onCancel: () => void;
  onSubmit: (values: CooperativeMemberFormValues) => void;
  onCreateArea: (areaName: string) => Promise<boolean>;
}

export default function CooperativeMemberFormModal({
  form,
  open,
  areas,
  employees,
  employeeAreaAssignments,
  isEditing,
  isSubmitting,
  isCreatingArea,
  onCancel,
  onSubmit,
  onCreateArea,
}: CooperativeMemberFormModalProps) {
  const { t } = useI18n();
  const [areaSearchText, setAreaSearchText] = useState('');
  const selectedOfficerId = Form.useWatch('officer_id', form);
  const selectedAreaId = Form.useWatch('area_id', form);
  const assignedAreaIdsByEmployee = useMemo(() => {
    const result = new Map<string, Set<string>>();
    employeeAreaAssignments.forEach((assignment) => {
      const areaIds = result.get(assignment.employee_id) ?? new Set<string>();
      areaIds.add(assignment.area_id);
      result.set(assignment.employee_id, areaIds);
    });
    return result;
  }, [employeeAreaAssignments]);
  const defaultAreaByEmployeeId = useMemo(() => {
    const areaRankById = new Map(areas.map((area, index) => [area.id, index]));
    const activeAreaIds = new Set(areas.filter((area) => area.is_active).map((area) => area.id));
    const sortedAssignments = [...employeeAreaAssignments].sort((left, right) => (
      (areaRankById.get(left.area_id) ?? Number.MAX_SAFE_INTEGER) -
      (areaRankById.get(right.area_id) ?? Number.MAX_SAFE_INTEGER)
    ));
    const defaults = new Map<string, string>();

    sortedAssignments.forEach((assignment) => {
      if (defaults.has(assignment.employee_id) || !activeAreaIds.has(assignment.area_id)) return;
      defaults.set(assignment.employee_id, assignment.area_id);
    });

    return defaults;
  }, [areas, employeeAreaAssignments]);

  const handleOfficerChange = (officerId?: string) => {
    const defaultAreaId = officerId ? defaultAreaByEmployeeId.get(officerId) : undefined;
    if (!defaultAreaId) return;

    form.setFieldsValue({ area_id: defaultAreaId });
  };

  const handleAreaChange = (areaId: string) => {
    setAreaSearchText('');
    const officerId = form.getFieldValue('officer_id');
    if (officerId && !assignedAreaIdsByEmployee.get(officerId)?.has(areaId)) {
      form.setFieldsValue({ officer_id: undefined });
    }
  };

  const areaCreateName = areaSearchText.trim();
  const hasAreaSearchMatch = areaCreateName
    ? areas.some((area) => {
      const label = area.code ? `${area.code} - ${area.name}` : area.name;
      return label.toLowerCase().includes(areaCreateName.toLowerCase());
    })
    : true;

  const handleCreateAreaFromSearch = async () => {
    if (!areaCreateName || isCreatingArea) return;

    const isCreated = await onCreateArea(areaCreateName);
    if (isCreated) setAreaSearchText('');
  };

  const areaNotFoundContent = areaCreateName ? (
    <div className="px-1 py-1">
      <Button
        type="text"
        icon={<Plus size={16} />}
        loading={isCreatingArea}
        disabled={isCreatingArea}
        className="h-auto w-full whitespace-normal text-left"
        style={{ justifyContent: 'flex-start' }}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          void handleCreateAreaFromSearch();
        }}
      >
        {t('areas.quickCreateFromSearch', { name: areaCreateName })}
      </Button>
    </div>
  ) : (
    <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
      {t('areas.empty')}
    </div>
  );

  return (
    <Modal
      title={isEditing ? t('cooperative.members.editTitle') : t('cooperative.members.addTitle')}
      open={open}
      onCancel={onCancel}
      afterOpenChange={(isOpen) => {
        if (!isOpen) setAreaSearchText('');
      }}
      onOk={() => form.submit()}
      okButtonProps={{ 'data-testid': 'koperasi-member-submit-button' }}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={780}
    >
      <Form<CooperativeMemberFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item
            name="member_number"
            label={t('cooperative.members.form.memberNumber')}
            rules={[
              { required: true, whitespace: true, message: t('cooperative.members.validation.memberNumberRequired') },
              { max: 40, message: t('cooperative.members.validation.memberNumberMax') },
            ]}
          >
            <Input
              placeholder={t('cooperative.members.form.memberNumberPlaceholder')}
              data-testid="koperasi-member-number-input"
            />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('cooperative.members.form.name')}
            rules={[{ required: true, whitespace: true, message: t('cooperative.members.validation.nameRequired') }]}
          >
            <Input
              placeholder={t('cooperative.members.form.namePlaceholder')}
              data-testid="koperasi-member-name-input"
            />
          </Form.Item>
          <Form.Item
            name="status"
            label={t('cooperative.members.form.status')}
            rules={[{ required: true, message: t('cooperative.members.validation.statusRequired') }]}
          >
            <Select options={cooperativeMemberStatusOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))} />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item
            name="join_date"
            label={t('cooperative.members.form.joinDate')}
            rules={[{ required: true, message: t('cooperative.members.validation.joinDateRequired') }]}
          >
            <DatePicker className="w-full" data-testid="koperasi-member-join-date-input" />
          </Form.Item>
          <Form.Item name="identity_number" label={t('cooperative.members.form.identityNumber')}>
            <Input
              placeholder={t('cooperative.members.form.identityNumberPlaceholder')}
              data-testid="koperasi-member-identity-input"
            />
          </Form.Item>
          <Form.Item name="phone" label={t('cooperative.members.form.phone')}>
            <Input
              placeholder={t('cooperative.members.form.phonePlaceholder')}
              data-testid="koperasi-member-phone-input"
            />
          </Form.Item>
        </div>

        <Form.Item name="officer_id" label={t('cooperative.members.form.officer')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('cooperative.members.form.officerPlaceholder')}
            data-testid="koperasi-member-officer-select"
            onChange={handleOfficerChange}
            options={employees.map((employee) => ({
              value: employee.id,
              label: employee.position ? `${employee.name} - ${employee.position}` : employee.name,
              disabled: !employee.is_active || Boolean(
                selectedAreaId &&
                !assignedAreaIdsByEmployee.get(employee.id)?.has(selectedAreaId),
              ),
            }))}
          />
        </Form.Item>

        <Form.Item
          name="area_id"
          label={t('cooperative.members.form.area')}
          rules={[{ required: true, message: t('cooperative.members.validation.areaRequired') }]}
          className="mb-6"
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={t('cooperative.members.form.areaPlaceholder')}
            data-testid="koperasi-member-area-select"
            onSearch={setAreaSearchText}
            onInputKeyDown={(event) => {
              if (event.key === 'Enter' && areaCreateName && !hasAreaSearchMatch) {
                event.preventDefault();
                void handleCreateAreaFromSearch();
              }
            }}
            onChange={handleAreaChange}
            notFoundContent={areaNotFoundContent}
            options={areas.map((area) => ({
              value: area.id,
              label: area.code ? `${area.code} - ${area.name}` : area.name,
              disabled: !area.is_active || Boolean(
                selectedOfficerId &&
                !assignedAreaIdsByEmployee.get(selectedOfficerId)?.has(area.id),
              ),
            }))}
          />
        </Form.Item>

        <Form.Item name="address" label={t('cooperative.members.form.address')}>
          <TextArea
            rows={3}
            placeholder={t('cooperative.members.form.addressPlaceholder')}
            data-testid="koperasi-member-address-input"
          />
        </Form.Item>
        <Form.Item name="notes" label={t('cooperative.members.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.members.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
