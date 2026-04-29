export const PRODUCT_CATEGORIES = [
  { value: 'bumbu', label: 'Bumbu & Bahan Masak' },
  { value: 'sembako', label: 'Sembako Inti' },
  { value: 'makanan_instan', label: 'Makanan Instan' },
  { value: 'snack', label: 'Snack & Makanan Ringan' },
  { value: 'minuman', label: 'Minuman' },
  { value: 'household_cleaning', label: 'Household Cleaning' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'personal_care', label: 'Personal Care' },
  { value: 'non_consumable', label: 'Non-consumable / General Goods' },
  { value: 'lainnya', label: 'Lain-lain' },
];

export type ProductCategoryValue = typeof PRODUCT_CATEGORIES[number]['value'];
