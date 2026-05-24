import { DatePicker, Form, Input, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { Contact, Department, Project, SalesInvoicePaymentStatus, Tax } from '@/types';

interface FieldRendererProps {
  name: string;
  label: string;
  type: 'contact' | 'text' | 'date' | 'textarea' | 'tax' | 'department' | 'project' | 'paymentStatus';
  required?: boolean;
  form: FormInstance;
  contacts: Contact[];
  taxes: Tax[];
  departments: Department[];
  projects: Project[];
}

export const FieldRenderer = ({
  name,
  label,
  type,
  required,
  form,
  contacts,
  taxes,
  departments,
  projects,
}: FieldRendererProps) => {
  const rules = required ? [{ required: true, message: `${label} wajib diisi.` }] : undefined;

  if (type === 'contact') {
    return (
      <Form.Item name={name} label={label} rules={rules}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Pilih customer"
          options={contacts.map((contact) => ({
            value: contact.id,
            label: contact.company_name ? `${contact.name} - ${contact.company_name}` : contact.name,
          }))}
          onChange={(contactId) => {
            const contact = contacts.find((candidate) => candidate.id === contactId);
            if (!contact) return;
            form.setFieldsValue({
              customer_name: contact.name,
              customer_phone: contact.phone,
              customer_email: contact.email,
              customer_address: contact.address,
              customer_company_name: contact.company_name,
              customer_tax_number: contact.tax_number,
            });
          }}
        />
      </Form.Item>
    );
  }

  if (type === 'tax') {
    return (
      <Form.Item name={name} label={label} rules={rules}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Pilih pajak"
          options={taxes.map((tax) => ({
            value: tax.id,
            label: `${tax.name} (${tax.rate}%, ${tax.calculation_mode})`,
          }))}
        />
      </Form.Item>
    );
  }

  if (type === 'department') {
    return (
      <Form.Item name={name} label={label} rules={rules}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Pilih department"
          options={departments.map((department) => ({
            value: department.id,
            label: department.code ? `${department.code} - ${department.name}` : department.name,
          }))}
        />
      </Form.Item>
    );
  }

  if (type === 'project') {
    return (
      <Form.Item name={name} label={label} rules={rules}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Pilih project"
          options={projects.map((project) => ({
            value: project.id,
            label: project.code ? `${project.code} - ${project.name}` : project.name,
          }))}
        />
      </Form.Item>
    );
  }

  if (type === 'paymentStatus') {
    const options: Array<{ value: SalesInvoicePaymentStatus; label: string }> = [
      { value: 'UNPAID', label: 'Unpaid' },
      { value: 'PARTIAL', label: 'Partial' },
      { value: 'PAID', label: 'Paid' },
    ];

    return (
      <Form.Item name={name} label={label} rules={rules}>
        <Select options={options} />
      </Form.Item>
    );
  }

  if (type === 'date') {
    return (
      <Form.Item name={name} label={label} rules={rules}>
        <DatePicker className="w-full" />
      </Form.Item>
    );
  }

  if (type === 'textarea') {
    return (
      <Form.Item name={name} label={label} rules={rules} className="md:col-span-2">
        <Input.TextArea rows={3} />
      </Form.Item>
    );
  }

  return (
    <Form.Item name={name} label={label} rules={rules}>
      <Input />
    </Form.Item>
  );
};
