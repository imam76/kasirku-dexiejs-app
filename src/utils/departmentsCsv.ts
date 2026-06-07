import type { Department } from '@/types';

export const departmentsToCsvRows = (departments: Department[]) => [
  ['Nama', 'Kode', 'Deskripsi', 'Status'],
  ...departments.map((department) => [
    department.name,
    department.code ?? '',
    department.description ?? '',
    department.is_active ? 'Aktif' : 'Nonaktif',
  ]),
];
