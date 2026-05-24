import type { Control, FieldErrors, UseFormSetValue } from 'react-hook-form';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import type { Contact, Department, Project, Tax } from '@/types';
import type { SalesDocumentFormValues } from './SalesDocumentForm';
import { FieldRenderer } from './FieldRenderer';

interface DocumentHeaderProps {
  config: SalesDocumentConfig;
  control: Control<SalesDocumentFormValues>;
  errors: FieldErrors<SalesDocumentFormValues>;
  setValue: UseFormSetValue<SalesDocumentFormValues>;
  contacts: Contact[];
  taxes: Tax[];
  departments: Department[];
  projects: Project[];
}

export const DocumentHeader = ({
  config,
  control,
  errors,
  setValue,
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
        control={control}
        errors={errors}
        setValue={setValue}
        contacts={contacts}
        taxes={taxes}
        departments={departments}
        projects={projects}
      />
    ))}
  </div>
);
