export function formatJpy(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`;
}

export function parseJpyInput(value: string): number | null {
  const normalized = value.replace(/[^\d]/g, '');
  if (normalized.length === 0) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function monthKeyFromDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
