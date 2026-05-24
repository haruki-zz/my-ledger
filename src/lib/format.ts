export function formatYen(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(value);
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
  return value || '未命名用户';
}
