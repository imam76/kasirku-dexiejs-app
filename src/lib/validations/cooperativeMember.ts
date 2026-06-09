import { z } from 'zod';
import type { CooperativeMemberStatus } from '@/types';

export const cooperativeMemberStatusValues = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const satisfies readonly CooperativeMemberStatus[];

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const cooperativeMemberSchema = z.object({
  member_number: z.string().trim().min(1, 'Nomor anggota wajib diisi.').max(40, 'Nomor anggota maksimal 40 karakter.'),
  name: z.string().trim().min(1, 'Nama anggota wajib diisi.'),
  identity_number: optionalTrimmedString,
  phone: optionalTrimmedString,
  address: optionalTrimmedString,
  area_id: z.string().trim().min(1, 'Area anggota wajib dipilih.'),
  join_date: z.string().trim().min(1, 'Tanggal bergabung wajib diisi.'),
  status: z.enum(cooperativeMemberStatusValues, { message: 'Status anggota wajib dipilih.' }),
  notes: optionalTrimmedString,
});

export type CooperativeMemberFormData = z.infer<typeof cooperativeMemberSchema>;
