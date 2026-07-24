import { z } from 'zod';
import { lastDayOfMonth } from '@/utils/fixedAssets/calculateDepreciation';

const optionalText = z.string().trim().optional().transform((value) => value || undefined);
const money = z.coerce.number().finite();

export const fixedAssetInputSchema = z.object({
  asset_code: z.string().trim().min(1, 'Kode aset wajib diisi.'),
  name: z.string().trim().min(1, 'Nama aset wajib diisi.'),
  category: z.enum(['BUILDING', 'VEHICLE', 'MACHINERY_EQUIPMENT', 'OFFICE_EQUIPMENT', 'FURNITURE', 'OTHER']),
  location: optionalText,
  description: optionalText,
  registration_type: z.enum(['NEW', 'EXISTING']),
  acquisition_date: z.iso.date('Tanggal perolehan tidak valid.'),
  available_for_use_date: z.iso.date('Tanggal siap digunakan tidak valid.'),
  acquisition_cost: money.positive('Biaya perolehan harus lebih besar dari nol.'),
  residual_value: money.min(0, 'Nilai residu tidak boleh negatif.'),
  useful_life_months: z.coerce.number().int().positive('Umur manfaat harus bilangan bulat positif.'),
  opening_balance_date: z.iso.date().optional().or(z.literal('')).transform((value) => value || undefined),
  opening_accumulated_depreciation: money.default(0),
  opening_remaining_useful_life_months: z.coerce.number().int().min(0).optional(),
  asset_account_id: z.string().min(1, 'Akun aset tetap wajib dipilih.'),
  accumulated_depreciation_account_id: z.string().min(1, 'Akun akumulasi penyusutan wajib dipilih.'),
  depreciation_expense_account_id: z.string().min(1, 'Akun beban penyusutan wajib dipilih.'),
  department_id: optionalText,
  project_id: optionalText,
  is_active: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.residual_value >= value.acquisition_cost) {
    context.addIssue({ code: 'custom', path: ['residual_value'], message: 'Nilai residu harus lebih kecil dari biaya perolehan.' });
  }
  if (value.available_for_use_date < value.acquisition_date) {
    context.addIssue({ code: 'custom', path: ['available_for_use_date'], message: 'Tanggal siap digunakan tidak boleh sebelum tanggal perolehan.' });
  }

  const depreciable = value.acquisition_cost - value.residual_value;
  if (value.registration_type === 'NEW') {
    if (value.opening_balance_date || value.opening_accumulated_depreciation !== 0 || value.opening_remaining_useful_life_months !== undefined) {
      context.addIssue({ code: 'custom', path: ['registration_type'], message: 'Aset baru tidak boleh memiliki saldo awal.' });
    }
    return;
  }

  if (!value.opening_balance_date) {
    context.addIssue({ code: 'custom', path: ['opening_balance_date'], message: 'Tanggal saldo awal wajib diisi.' });
  } else if (lastDayOfMonth(value.opening_balance_date) !== value.opening_balance_date) {
    context.addIssue({ code: 'custom', path: ['opening_balance_date'], message: 'Tanggal saldo awal harus merupakan akhir bulan.' });
  }
  if (value.opening_accumulated_depreciation < 0 || value.opening_accumulated_depreciation > depreciable) {
    context.addIssue({ code: 'custom', path: ['opening_accumulated_depreciation'], message: 'Akumulasi penyusutan awal harus berada antara nol dan nilai tersusutkan.' });
  }
  const remainingLife = value.opening_remaining_useful_life_months;
  if (value.opening_accumulated_depreciation === depreciable) {
    if (remainingLife !== 0) {
      context.addIssue({ code: 'custom', path: ['opening_remaining_useful_life_months'], message: 'Sisa umur harus nol untuk aset yang telah disusutkan penuh.' });
    }
  } else if (remainingLife === undefined || remainingLife < 1 || remainingLife > value.useful_life_months) {
    context.addIssue({ code: 'custom', path: ['opening_remaining_useful_life_months'], message: 'Sisa umur manfaat harus antara 1 dan umur manfaat aset.' });
  }
});

export type FixedAssetInput = z.input<typeof fixedAssetInputSchema>;
export type ParsedFixedAssetInput = z.output<typeof fixedAssetInputSchema>;
