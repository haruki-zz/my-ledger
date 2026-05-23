export function formatYen(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(value);
}

export function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function displayName(name: string | null | undefined) {
  const value = name?.trim();
  return value || '未命名用户';
}
