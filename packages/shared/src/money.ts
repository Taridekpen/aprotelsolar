const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export function parseNairaToKobo(value: string | number): number {
  const text = typeof value === 'number' ? value.toString() : value.trim();
  if (!MONEY_PATTERN.test(text)) {
    throw new Error('Amount must be a non-negative NGN value with at most 2 decimal places');
  }
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

export function formatKoboAsNaira(kobo: number): string {
  const negative = kobo < 0;
  const absolute = Math.abs(kobo);
  const major = Math.floor(absolute / 100);
  const minor = absolute % 100;
  return `${negative ? '-' : ''}${major}.${minor.toString().padStart(2, '0')}`;
}
