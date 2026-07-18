export function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined).format(value);
}

export function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 6,
  }).format(value);
}
