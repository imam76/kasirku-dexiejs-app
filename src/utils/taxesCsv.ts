import type { Tax } from '@/types';

export const taxesToCsvRows = (taxes: Tax[]) => [
  ['Nama', 'Kode', 'Rate', 'Mode', 'Default', 'Aktif', 'Efektif Mulai', 'Efektif Hingga', 'Deskripsi'],
  ...taxes.map((tax) => [
    tax.name,
    tax.code ?? '',
    `${tax.rate}%`,
    tax.calculation_mode,
    tax.is_default ? 'Ya' : 'Tidak',
    tax.is_active ? 'Aktif' : 'Nonaktif',
    tax.effective_from ?? '',
    tax.effective_to ?? '',
    tax.description ?? '',
  ]),
];
