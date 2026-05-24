import dayjs from '@/lib/dayjs';
import type { Contact, Department, Project } from '@/types';

export const getContactLabel = (contact: Contact) => {
  return contact.company_name ? `${contact.name} (${contact.company_name})` : contact.name;
};

export const getDepartmentLabel = (department: Department) => {
  return department.code ? `${department.name} (${department.code})` : department.name;
};

export const getProjectPeriodLabel = (project: Project) => {
  if (!project.start_date && !project.end_date) return '-';

  const startDate = project.start_date ? dayjs(project.start_date).format('DD MMM YYYY') : '-';
  const endDate = project.end_date ? dayjs(project.end_date).format('DD MMM YYYY') : '-';

  return `${startDate} - ${endDate}`;
};
