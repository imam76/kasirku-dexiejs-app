import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

const optionalEmail = optionalString.refine(
  (value) => !value || z.email().safeParse(value).success,
  'Format email tidak valid.',
);

const optionalNonNegativeNumber = z.number().min(0, 'Nominal tidak boleh negatif.').optional();

export const hrEmployeeSchema = z.object({
  employee_number: optionalString,
  name: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter.'),
  preferred_name: optionalString,
  photo_data_url: optionalString,
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  birth_place: optionalString,
  birth_date: optionalString,
  marital_status: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  nationality: optionalString,
  phone: optionalString,
  personal_email: optionalEmail,
  identity_address: optionalString,
  domicile_address: optionalString,
  emergency_contact_name: optionalString,
  emergency_contact_relationship: optionalString,
  emergency_contact_phone: optionalString,
  nik: optionalString,
  family_card_number: optionalString,
  tax_number: optionalString,
  health_bpjs_number: optionalString,
  employment_bpjs_number: optionalString,
  company_unit: optionalString,
  department_id: optionalString,
  job_position_id: optionalString,
  supervisor_id: optionalString,
  work_location: optionalString,
  join_date: optionalString,
  employment_status: z.enum(['PROBATION', 'CONTRACT', 'PERMANENT', 'INTERN', 'FREELANCE']),
  active_status: z.enum(['ACTIVE', 'LONG_LEAVE', 'INACTIVE', 'RESIGNED', 'TERMINATED']),
  work_schedule_type: z.enum(['FULL_TIME', 'PART_TIME', 'SHIFT']),
  contract_start_date: optionalString,
  contract_end_date: optionalString,
  permanent_date: optionalString,
  exit_date: optionalString,
  exit_reason: optionalString,
  salary_payment_method: z.enum(['BANK_TRANSFER', 'CASH']).optional(),
  bank_name: optionalString,
  bank_account_number: optionalString,
  bank_account_holder: optionalString,
  base_salary: optionalNonNegativeNumber,
  salary_currency: optionalString,
  payroll_period: z.enum(['MONTHLY', 'WEEKLY', 'DAILY']).optional(),
  is_taxable: z.boolean().optional(),
  ptkp_status: optionalString,
  is_bpjs_participant: z.boolean().optional(),
  notes: optionalString,
}).superRefine((value, context) => {
  if (
    value.contract_start_date &&
    value.contract_end_date &&
    value.contract_end_date < value.contract_start_date
  ) {
    context.addIssue({
      code: 'custom',
      path: ['contract_end_date'],
      message: 'Tanggal akhir kontrak tidak boleh lebih awal dari tanggal mulai.',
    });
  }
  if (value.join_date && value.exit_date && value.exit_date < value.join_date) {
    context.addIssue({
      code: 'custom',
      path: ['exit_date'],
      message: 'Tanggal keluar tidak boleh lebih awal dari tanggal bergabung.',
    });
  }
  if (
    value.salary_payment_method === 'BANK_TRANSFER' &&
    (!value.bank_name || !value.bank_account_number || !value.bank_account_holder)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['bank_account_number'],
      message: 'Data bank wajib lengkap untuk metode transfer.',
    });
  }
});

export const hrDepartmentSchema = z.object({
  code: z.string().trim().min(1, 'Kode departemen wajib diisi.').max(20),
  name: z.string().trim().min(2, 'Nama departemen minimal 2 karakter.'),
  head_employee_id: optionalString,
  parent_department_id: optionalString,
  description: optionalString,
  is_active: z.boolean(),
});

export const hrPositionSchema = z.object({
  code: z.string().trim().min(1, 'Kode jabatan wajib diisi.').max(20),
  name: z.string().trim().min(2, 'Nama jabatan minimal 2 karakter.'),
  department_id: z.string().trim().min(1, 'Departemen wajib dipilih.'),
  level: z.string().trim().min(1, 'Level jabatan wajib diisi.'),
  reports_to_position_id: optionalString,
  description: optionalString,
  is_active: z.boolean(),
});

export const employmentContractSchema = z.object({
  contract_number: z.string().trim().min(1, 'Nomor kontrak wajib diisi.'),
  employee_id: z.string().trim().min(1, 'Karyawan wajib dipilih.'),
  contract_type: z.enum(['PROBATION', 'FIXED_TERM', 'PERMANENT', 'INTERNSHIP', 'FREELANCE']),
  start_date: z.string().trim().min(1, 'Tanggal mulai wajib diisi.'),
  end_date: optionalString,
  job_position_id: z.string().trim().min(1, 'Jabatan wajib dipilih.'),
  department_id: z.string().trim().min(1, 'Departemen wajib dipilih.'),
  base_salary: z.number().min(0, 'Gaji pokok tidak boleh negatif.'),
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'RENEWED', 'TERMINATED']),
  notes: optionalString,
  renewed_from_contract_id: optionalString,
}).superRefine((value, context) => {
  if (value.end_date && value.end_date < value.start_date) {
    context.addIssue({
      code: 'custom',
      path: ['end_date'],
      message: 'Tanggal berakhir tidak boleh lebih awal dari tanggal mulai.',
    });
  }
});

export const salaryComponentSchema = z.object({
  code: z.string().trim().min(1, 'Kode komponen wajib diisi.').max(30),
  name: z.string().trim().min(2, 'Nama komponen minimal 2 karakter.'),
  kind: z.enum(['EARNING', 'DEDUCTION']),
  calculation: z.enum(['FIXED', 'PERCENTAGE']),
  default_value: z.number().min(0, 'Nilai default tidak boleh negatif.'),
  is_taxable: z.boolean(),
  is_active: z.boolean(),
}).superRefine((value, context) => {
  if (value.calculation === 'PERCENTAGE' && value.default_value > 100) {
    context.addIssue({
      code: 'custom',
      path: ['default_value'],
      message: 'Persentase tidak boleh lebih dari 100%.',
    });
  }
});

export const employeeSalaryComponentSchema = z.object({
  salary_component_id: z.string().trim().min(1, 'Komponen wajib dipilih.'),
  calculation: z.enum(['FIXED', 'PERCENTAGE']).optional(),
  value: z.number().min(0, 'Nilai tidak boleh negatif.'),
  is_active: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.calculation === 'PERCENTAGE' && value.value > 100) {
    context.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'Persentase tidak boleh lebih dari 100%.',
    });
  }
});

export type HrEmployeeInput = z.input<typeof hrEmployeeSchema>;
export type HrDepartmentInput = z.input<typeof hrDepartmentSchema>;
export type HrPositionInput = z.input<typeof hrPositionSchema>;
export type EmploymentContractInput = z.input<typeof employmentContractSchema>;
export type SalaryComponentInput = z.input<typeof salaryComponentSchema>;
export type EmployeeSalaryComponentInput = z.input<typeof employeeSalaryComponentSchema>;
