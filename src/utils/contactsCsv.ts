import type { Contact } from '@/types';

export const contactsToCsvRows = (contacts: Contact[]) => [
  ['Nama', 'Tipe', 'Telepon', 'Email', 'Company', 'Alamat', 'Tax Number', 'Status', 'Catatan'],
  ...contacts.map((contact) => [
    contact.name,
    contact.contact_type,
    contact.phone ?? '',
    contact.email ?? '',
    contact.company_name ?? '',
    contact.address ?? '',
    contact.tax_number ?? '',
    contact.is_active ? 'Aktif' : 'Nonaktif',
    contact.notes ?? '',
  ]),
];
