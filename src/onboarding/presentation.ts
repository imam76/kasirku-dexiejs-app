import { SETUP_MODULE_GROUPS } from '@/constants/setupModules';
export const rupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
export const moduleName = (code: string) =>
  SETUP_MODULE_GROUPS.flatMap((g) => g.modules).find((m) => m.code === code)
    ?.label ?? code;
