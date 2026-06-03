export function formatYen(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(value);
}

export function formatCompactYen(value: number) {
  const rounded = Math.round(value);
  if (rounded >= 1_000_000) {
    return `¥${formatCompactValue(rounded / 1_000_000)}M`;
  }

  if (rounded >= 1000) {
    return `¥${formatCompactValue(rounded / 1000)}K`;
  }

  return `¥${rounded}`;
}

function formatCompactValue(value: number) {
  return String(Math.round(value * 10) / 10);
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

export function todayDateString() {
  const date = new Date();
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate())
  ].join('-');
}

export function currentMonthPrefix() {
  const date = new Date();
  return [date.getFullYear(), padDatePart(date.getMonth() + 1)].join('-');
}

export function displayName(name: string | null | undefined) {
  const value = name?.trim();
  return value || 'Unnamed user';
}
