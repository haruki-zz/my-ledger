export type KeypadKey = '00' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'del';

export type WeekDayItem = {
  dateString: string;
  dayNumber: number;
  isFuture: boolean;
  isSelected: boolean;
  isToday: boolean;
  weekdayInitial: string;
};

export type SplitBackfillInput = {
  memberIds: readonly string[];
  ownership?: 'personal' | 'shared';
  paidBy?: string | null;
  splits?: readonly { user_id: string; amount_yen: number }[];
  totalAmount: number;
};

export type SplitBackfillResult = {
  amountByUserId: Record<string, number>;
  splitPct: number;
};

const MAX_BUFFER_DIGITS = 9;
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

export function sanitizeWholeNumber(value: string) {
  return value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_BUFFER_DIGITS);
}

export function updateKeypadBuffer(buffer: string, key: KeypadKey) {
  if (key === 'del') {
    return buffer.slice(0, -1);
  }

  if (key === '00' && !buffer) {
    return '';
  }

  return sanitizeWholeNumber(`${buffer}${key}`);
}

export function parseDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function formatDateString(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

export function buildWeekStrip(input: {
  selectedDateString: string;
  todayDateString: string;
  weekOffset: number;
}) {
  const today = parseDateString(input.todayDateString) || new Date();
  const selectedDateString = parseDateString(input.selectedDateString)
    ? input.selectedDateString
    : formatDateString(today);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - Math.max(0, input.weekOffset) * 7);

  const days: WeekDayItem[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateString = formatDateString(date);

    return {
      dateString,
      dayNumber: date.getDate(),
      isFuture: dateString > input.todayDateString,
      isSelected: dateString === selectedDateString,
      isToday: dateString === input.todayDateString,
      weekdayInitial: WEEKDAY_INITIALS[date.getDay()]
    };
  });

  return {
    days,
    weekLabel: `${MONTH_LABELS[start.getMonth()]} ${start.getDate()}`
  };
}

export function dateSummary(dateString: string, todayString: string) {
  const date = parseDateString(dateString);
  const today = parseDateString(todayString);
  if (!date || !today) {
    return dateString || 'Today';
  }

  if (dateString === todayString) {
    return 'Today';
  }

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dateString === formatDateString(yesterday)) {
    return 'Yesterday';
  }

  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
  return `${weekday} ${date.getDate()}`;
}

export function wrapIndex(index: number, length: number) {
  if (length <= 0) {
    return 0;
  }

  return ((index % length) + length) % length;
}

export function nextStepAfterAmount(isEditing: boolean): 2 | 4 {
  return isEditing ? 2 : 4;
}

export function nextStepAfterDateSelection(input: {
  amountYen: number;
  isEditing: boolean;
}): 2 | 4 {
  return !input.isEditing && input.amountYen > 0 ? 4 : 2;
}

export function calculateSplitAmounts(totalAmount: number, splitPct: number) {
  const boundedPct = Math.max(0, Math.min(100, splitPct));
  const firstAmount = Math.round((totalAmount * boundedPct) / 100);
  return [firstAmount, totalAmount - firstAmount] as const;
}

export function deriveSplitBackfill(input: SplitBackfillInput): SplitBackfillResult {
  const [firstMemberId, secondMemberId] = input.memberIds;
  const emptyAmounts = Object.fromEntries(input.memberIds.map((memberId) => [memberId, 0]));
  if (!firstMemberId || !secondMemberId || input.totalAmount <= 0) {
    return { amountByUserId: emptyAmounts, splitPct: 50 };
  }

  if (input.ownership === 'shared' && input.splits?.length) {
    const amountByUserId = { ...emptyAmounts };
    for (const split of input.splits) {
      if (split.user_id in amountByUserId) {
        amountByUserId[split.user_id] = Math.max(0, split.amount_yen);
      }
    }

    return {
      amountByUserId,
      splitPct: (amountByUserId[firstMemberId] / input.totalAmount) * 100
    };
  }

  const firstAmount = input.paidBy === secondMemberId ? 0 : input.totalAmount;
  return {
    amountByUserId: {
      ...emptyAmounts,
      [firstMemberId]: firstAmount,
      [secondMemberId]: input.totalAmount - firstAmount
    },
    splitPct: (firstAmount / input.totalAmount) * 100
  };
}

export function complementShareAmounts(input: {
  memberIds: readonly string[];
  totalAmount: number;
  userId: string;
  value: string;
}) {
  const [firstMemberId, secondMemberId] = input.memberIds;
  if (!firstMemberId || !secondMemberId) {
    return {};
  }

  const boundedAmount = Math.min(Number(sanitizeWholeNumber(input.value) || 0), Math.max(0, input.totalAmount));
  const otherMemberId = input.userId === firstMemberId ? secondMemberId : firstMemberId;

  return {
    [input.userId]: boundedAmount,
    [otherMemberId]: Math.max(0, input.totalAmount - boundedAmount)
  };
}
