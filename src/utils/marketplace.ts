export const formatMarketplaceMoney = (value?: string | null, currency = 'IDR') => {
  if (!value) return '-';
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer = '0', decimal = ''] = unsigned.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const trimmedDecimal = decimal.replace(/0+$/, '');
  return `${currency} ${negative ? '-' : ''}${grouped}${trimmedDecimal ? `,${trimmedDecimal}` : ''}`;
};
