import type { FormInstance } from 'antd';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import type { Contact, Department, Project, Tax } from '@/types';
import { FieldRenderer } from './FieldRenderer';

interface DocumentHeaderProps {
  config: SalesDocumentConfig;
  form: FormInstance;
  contacts: Contact[];
  taxes: Tax[];
  departments: Department[];
  projects: Project[];
}

export const DocumentHeader = ({
  config,
  form,
  contacts,
  taxes,
  departments,
  projects,
}: DocumentHeaderProps) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
    {config.headerFields.map((field) => (
      <FieldRenderer
        key={field.name}
        {...field}
        form={form}
        contacts={contacts}
        taxes={taxes}
        departments={departments}
        projects={projects}
      />
    ))}
  </div>
);
