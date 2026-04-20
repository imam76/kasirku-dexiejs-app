export const PRODUCT_CATEGORIES = [
  { value: 'bumbu', label: 'Bumbu Dapur' },
  { value: 'sembako', label: 'Sembako' },
  { value: 'lainnya', label: 'Lain-lain' },
];

export type ProductCategoryValue = typeof PRODUCT_CATEGORIES[number]['value'];
