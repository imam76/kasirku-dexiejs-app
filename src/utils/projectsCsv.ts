import type { Project } from '@/types';

export const projectsToCsvRows = (projects: Project[]) => [
  ['Nama', 'Kode', 'Status', 'Contact', 'Department', 'Tanggal Mulai', 'Tanggal Selesai', 'Budget', 'Status Aktif', 'Deskripsi'],
  ...projects.map((project) => [
    project.name,
    project.code ?? '',
    project.status,
    project.contact_name ?? '',
    project.department_name ?? '',
    project.start_date ?? '',
    project.end_date ?? '',
    project.budget_amount ?? '',
    project.is_active ? 'Aktif' : 'Nonaktif',
    project.description ?? '',
  ]),
];
