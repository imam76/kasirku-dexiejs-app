export const demoOwner = {
  name: 'Owner KSU Madu Kenjacana',
  pin: '123456',
};

export const demoOpeningBalance = [
  { accountCode: '1010', accountName: 'Kas Tunai', debit: '5000000', credit: '0' },
  { accountCode: '1020', accountName: 'Bank / Non Tunai', debit: '10000000', credit: '0' },
  { accountCode: '3000', accountName: 'Modal Pemilik', debit: '0', credit: '15000000' },
] as const;

export const demoMembers = {
  siti: {
    memberNumber: 'KSU-001',
    name: 'Siti Aminah',
    identityNumber: '3271010101010001',
    phone: '081234567001',
    address: 'Alamat demo Siti Aminah',
  },
  budi: {
    memberNumber: 'KSU-002',
    name: 'Budi Hartono',
    identityNumber: '3271010101010002',
    phone: '081234567002',
    address: 'Alamat demo Budi Hartono',
  },
} as const;

