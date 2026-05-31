import { DatePicker, Input, Select } from 'antd';
import type { ReactNode } from 'react';
import type { Dayjs } from 'dayjs';
import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, FieldPath, UseFormSetValue } from 'react-hook-form';
import type { Contact, Department, Project, SalesInvoicePaymentStatus, Tax, Warehouse } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import { salesInvoicePaymentStatusLabelKeys, taxCalculationModeLabelKeys } from '@/utils/salesDocuments/i18n';
import type { SalesDocumentFormValues } from './SalesDocumentForm';

interface FieldContainerProps {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}

const FieldContainer = ({ label, required, error, className, children }: FieldContainerProps) => (
  <div className={className ?? 'mb-4'}>
    <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
      <span>{label}</span>
      {required ? <span className="text-sm font-bold leading-none text-red-500">*</span> : null}
    </label>
    {children}
    {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
  </div>
);

interface FieldRendererProps {
  name: string;
  label: string;
  type: 'contact' | 'text' | 'date' | 'textarea' | 'tax' | 'department' | 'project' | 'warehouse' | 'paymentStatus';
  required?: boolean;
  control: Control<SalesDocumentFormValues>;
  errors: FieldErrors<SalesDocumentFormValues>;
  setValue: UseFormSetValue<SalesDocumentFormValues>;
  contacts: Contact[];
  taxes: Tax[];
  departments: Department[];
  projects: Project[];
  warehouses: Warehouse[];
}

export const FieldRenderer = ({
  name,
  label,
  type,
  required,
  control,
  errors,
  setValue,
  contacts,
  taxes,
  departments,
  projects,
  warehouses,
}: FieldRendererProps) => {
  const { t } = useI18n();
  const fieldName = name as FieldPath<SalesDocumentFormValues>;
  const fieldError = errors[name as keyof SalesDocumentFormValues];
  const error = fieldError?.message ? String(fieldError.message) : undefined;
  const rules = required ? { required: t('salesDocuments.validation.required', { field: label }) } : undefined;

  if (type === 'contact') {
    return (
      <FieldContainer label={label} required={required} error={error}>
        <Controller
          name={fieldName}
          control={control}
          rules={rules}
          render={({ field }) => (
            <Select
              style={{ width: '100%' }}
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={t('salesDocuments.placeholder.customer')}
              value={field.value as string | undefined}
              onBlur={field.onBlur}
              options={contacts.map((contact) => ({
                value: contact.id,
                label: contact.company_name ? `${contact.name} - ${contact.company_name}` : contact.name,
              }))}
              onChange={(contactId) => {
                field.onChange(contactId);
                const contact = contacts.find((candidate) => candidate.id === contactId);
                if (!contact) return;

                setValue('customer_name', contact.name, { shouldDirty: true, shouldValidate: true });
                setValue('customer_phone', contact.phone, { shouldDirty: true });
                setValue('customer_email', contact.email, { shouldDirty: true });
                setValue('customer_address', contact.address, { shouldDirty: true });
                setValue('customer_company_name', contact.company_name, { shouldDirty: true });
                setValue('customer_tax_number', contact.tax_number, { shouldDirty: true });
              }}
            />
          )}
        />
      </FieldContainer>
    );
  }

  if (type === 'tax') {
    return (
      <FieldContainer label={label} required={required} error={error}>
        <Controller
          name={fieldName}
          control={control}
          rules={rules}
          render={({ field }) => (
            <Select
              style={{ width: '100%' }}
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={t('salesDocuments.placeholder.tax')}
              value={field.value as string | undefined}
              onBlur={field.onBlur}
              options={taxes.map((tax) => ({
                value: tax.id,
                label: `${tax.name} (${tax.rate}%, ${t(taxCalculationModeLabelKeys[tax.calculation_mode])})`,
              }))}
              onChange={field.onChange}
            />
          )}
        />
      </FieldContainer>
    );
  }

  if (type === 'department') {
    return (
      <FieldContainer label={label} required={required} error={error}>
        <Controller
          name={fieldName}
          control={control}
          rules={rules}
          render={({ field }) => (
            <Select
              style={{ width: '100%' }}
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={t('salesDocuments.placeholder.department')}
              value={field.value as string | undefined}
              onBlur={field.onBlur}
              options={departments.map((department) => ({
                value: department.id,
                label: department.code ? `${department.code} - ${department.name}` : department.name,
              }))}
              onChange={field.onChange}
            />
          )}
        />
      </FieldContainer>
    );
  }

  if (type === 'project') {
    return (
      <FieldContainer label={label} required={required} error={error}>
        <Controller
          name={fieldName}
          control={control}
          rules={rules}
          render={({ field }) => (
            <Select
              style={{ width: '100%' }}
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={t('salesDocuments.placeholder.project')}
              value={field.value as string | undefined}
              onBlur={field.onBlur}
              options={projects.map((project) => ({
                value: project.id,
                label: project.code ? `${project.code} - ${project.name}` : project.name,
              }))}
              onChange={field.onChange}
            />
          )}
        />
      </FieldContainer>
    );
  }

  if (type === 'warehouse') {
    return (
      <FieldContainer label={label} required={required} error={error}>
        <Controller
          name={fieldName}
          control={control}
          rules={rules}
          render={({ field }) => (
            <Select
              style={{ width: '100%' }}
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={t('salesDocuments.placeholder.warehouse')}
              value={field.value as string | undefined}
              onBlur={field.onBlur}
              options={warehouses.map((warehouse) => ({
                value: warehouse.id,
                label: warehouse.code ? `${warehouse.code} - ${warehouse.name}` : warehouse.name,
              }))}
              onChange={(warehouseId) => {
                field.onChange(warehouseId);
                const warehouse = warehouses.find((candidate) => candidate.id === warehouseId);
                setValue('warehouse_name', warehouse?.name, { shouldDirty: true });
                setValue('warehouse_code', warehouse?.code, { shouldDirty: true });
              }}
            />
          )}
        />
      </FieldContainer>
    );
  }

  if (type === 'paymentStatus') {
    const options: Array<{ value: SalesInvoicePaymentStatus; label: string }> = [
      { value: 'UNPAID', label: t(salesInvoicePaymentStatusLabelKeys.UNPAID) },
      { value: 'PARTIAL', label: t(salesInvoicePaymentStatusLabelKeys.PARTIAL) },
      { value: 'PAID', label: t(salesInvoicePaymentStatusLabelKeys.PAID) },
    ];

    return (
      <FieldContainer label={label} required={required} error={error}>
        <Controller
          name={fieldName}
          control={control}
          rules={rules}
          render={({ field }) => (
            <Select
              style={{ width: '100%' }}
              value={field.value as SalesInvoicePaymentStatus | undefined}
              onBlur={field.onBlur}
              options={options}
              onChange={field.onChange}
            />
          )}
        />
      </FieldContainer>
    );
  }

  if (type === 'date') {
    return (
      <FieldContainer label={label} required={required} error={error}>
        <Controller
          name={fieldName}
          control={control}
          rules={rules}
          render={({ field }) => (
            <DatePicker
              style={{ width: '100%' }}
              value={(field.value as Dayjs | undefined) ?? null}
              onBlur={field.onBlur}
              onChange={field.onChange}
            />
          )}
        />
      </FieldContainer>
    );
  }

  if (type === 'textarea') {
    return (
      <FieldContainer label={label} required={required} error={error} className="mb-4 md:col-span-2">
        <Controller
          name={fieldName}
          control={control}
          rules={rules}
          render={({ field }) => <Input.TextArea {...field} rows={3} value={String(field.value ?? '')} />}
        />
      </FieldContainer>
    );
  }

  return (
    <FieldContainer label={label} required={required} error={error}>
      <Controller
        name={fieldName}
        control={control}
        rules={rules}
        render={({ field }) => <Input {...field} value={String(field.value ?? '')} />}
      />
    </FieldContainer>
  );
};
