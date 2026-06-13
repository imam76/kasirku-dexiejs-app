const pad = (value: number) => String(value).padStart(2, '0');

export const createStockOpnameNumber = (date = new Date()) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `OPN-${year}${month}${day}-${hour}${minute}${second}`;
};
