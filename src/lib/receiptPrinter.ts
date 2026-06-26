import AsyncStorage from '@react-native-async-storage/async-storage';

import { formatYen } from './format';
import { compareMonthKeys, type MonthlyReceiptStat, type ReceiptCategoryLine } from './stats';

const STORAGE_PREFIX = 'my-ledger.receiptPrinter.lastShown';
const INK = '#2A2722';
const MUTED = '#5C544A';
const SUBTLE = '#9A8F80';
const DANGER = '#C0392B';
const SUCCESS = '#3D8A5E';
const YOU = '#B25A3C';
const PARTNER = '#3F8A86';

export type ReceiptPrinterTextKind =
  | 'amount'
  | 'category'
  | 'comparison'
  | 'heading'
  | 'label'
  | 'meta'
  | 'mom'
  | 'total';

export type ReceiptPrinterTypedRun = {
  color?: string;
  id: string;
  kind: ReceiptPrinterTextKind;
  length: number;
  offset: number;
  text: string;
};

export type ReceiptPrinterNode =
  | {
      children: ReceiptPrinterNode[];
      id: string;
      role: 'header' | 'items' | 'settlement';
      start: number;
      type: 'section';
    }
  | {
      children: ReceiptPrinterNode[];
      id: string;
      role: 'category' | 'columns' | 'comparison' | 'header' | 'kv' | 'member' | 'metaGroup' | 'total';
      start: number;
      type: 'row';
    }
  | {
      color?: string;
      id: string;
      opacity?: number;
      type: 'dot';
    }
  | ReceiptPrinterTypedRun & {
      type: 'text';
    }
  | {
      id: string;
      start: number;
      type: 'rule';
      variant: 'compact' | 'settlement' | 'standard';
    }
  | {
      bars: { color: string; width: number }[];
      id: string;
      start: number;
      type: 'barcode';
    }
  | {
      direction: 'bottom' | 'top';
      id: string;
      start: number;
      type: 'tear';
    };

export type ReceiptPrinterModel = {
  nodes: ReceiptPrinterNode[];
  runs: ReceiptPrinterTypedRun[];
  stream: string;
  totalChars: number;
};

export function getReceiptPrinterStorageKey(ledgerId: string, userId: string) {
  return `${STORAGE_PREFIX}.${ledgerId}.${userId}`;
}

export async function getLastShownReceiptPrinterMonthKey(ledgerId: string, userId: string) {
  return AsyncStorage.getItem(getReceiptPrinterStorageKey(ledgerId, userId));
}

export async function markReceiptPrinterShown(ledgerId: string, userId: string, monthKey: string) {
  await AsyncStorage.setItem(getReceiptPrinterStorageKey(ledgerId, userId), monthKey);
}

export function shouldShowReceiptPrinter(input: {
  lastShownMonthKey: string | null;
  latestReceipt: Pick<MonthlyReceiptStat, 'monthKey' | 'records' | 'totalYen'> | null | undefined;
}) {
  const { lastShownMonthKey, latestReceipt } = input;
  if (!latestReceipt || latestReceipt.records <= 0 || latestReceipt.totalYen <= 0) {
    return false;
  }

  if (!lastShownMonthKey) {
    return true;
  }

  return compareMonthKeys(latestReceipt.monthKey, lastShownMonthKey) > 0;
}

export function buildReceiptPrinterModel(input: {
  currentUserName: string;
  otherUserName: string;
  receipt: MonthlyReceiptStat;
}): ReceiptPrinterModel {
  const builder = createModelBuilder();
  const { currentUserName, otherUserName, receipt } = input;
  const comparison = receiptComparison(receipt);

  builder.section('header', 'header', [
    builder.row('receipt-header', 'header', [
      builder.text('month', receipt.label, 'heading', INK),
      builder.row('header-meta', 'metaGroup', [
        builder.text('records', `${receipt.records} records`, 'meta', MUTED),
        builder.text('daily-average', `daily avg ${formatYen(receipt.dailyAverageYen)}`, 'meta', MUTED)
      ])
    ])
  ]);
  builder.rule('header-rule');
  builder.row('columns', 'columns', [
    builder.text('column-item', 'ITEM', 'label', SUBTLE),
    builder.text('column-mom', 'MoM', 'label', SUBTLE),
    builder.text('column-amount', 'AMOUNT', 'label', SUBTLE)
  ]);
  builder.section('items', 'items', receipt.lines.map((line) => buildCategoryRow(builder, line)));
  builder.rule('items-rule', 'compact');
  builder.barcode('barcode', receipt.lines);
  builder.rule('barcode-rule', 'compact');
  builder.section('settlement', 'settlement', [
    builder.row('split-label', 'kv', [
      builder.text('split-title', 'SPLIT ADJUSTED', 'label', SUBTLE)
    ]),
    builder.row('current-member', 'member', [
      builder.dot('current-dot', YOU),
      builder.text('current-label', currentUserName.toUpperCase(), 'label', INK),
      builder.text('current-amount', formatYen(receipt.alexAmountYen), 'amount', YOU)
    ]),
    builder.row('other-member', 'member', [
      builder.dot('other-dot', PARTNER),
      builder.text('other-label', otherUserName.toUpperCase(), 'label', INK),
      builder.text('other-amount', formatYen(receipt.minaAmountYen), 'amount', PARTNER)
    ]),
    builder.ruleNode('settlement-rule', 'settlement'),
    builder.row('total', 'total', [
      builder.text('total-label', 'TOTAL', 'total', INK),
      builder.text('total-value', formatYen(receipt.totalYen), 'total', INK)
    ]),
    builder.row('comparison', 'comparison', [
      builder.text('comparison-strong', comparison.strong, 'comparison', comparison.color),
      builder.text('comparison-rest', ` vs ${receipt.comparison.label}`, 'comparison', MUTED)
    ])
  ]);
  return builder.model();
}

export function activeReceiptPrinterRun(model: ReceiptPrinterModel, typed: number) {
  return model.runs.find((run) => typed >= run.offset && typed < run.offset + run.length) || null;
}

function buildCategoryRow(
  builder: ReturnType<typeof createModelBuilder>,
  line: ReceiptCategoryLine
): ReceiptPrinterNode {
  const zero = line.amountYen === 0;
  const textColor = zero ? SUBTLE : INK;

  return builder.row(`category-${line.categoryId}`, 'category', [
    builder.dot(`category-${line.categoryId}-dot`, line.color, zero ? 0.35 : 1),
    builder.text(`category-${line.categoryId}-label`, line.label, 'category', textColor),
    builder.text(`category-${line.categoryId}-mom`, line.momLabel, 'mom', momColor(line)),
    builder.text(`category-${line.categoryId}-amount`, formatYen(line.amountYen), 'amount', textColor)
  ]);
}

function createModelBuilder() {
  let offset = 0;
  let stream = '';
  const nodes: ReceiptPrinterNode[] = [];
  const runs: ReceiptPrinterTypedRun[] = [];

  function text(
    id: string,
    value: string,
    kind: ReceiptPrinterTextKind,
    color?: string
  ): ReceiptPrinterNode {
    const run = {
      color,
      id,
      kind,
      length: value.length,
      offset,
      text: value
    };
    offset += value.length;
    stream += value;
    runs.push(run);
    return { ...run, type: 'text' };
  }

  function startFor(children: ReceiptPrinterNode[]) {
    return children.reduce((start, child) => {
      if ('start' in child) {
        return Math.min(start, child.start);
      }
      if (child.type === 'text') {
        return Math.min(start, child.offset);
      }
      return start;
    }, offset);
  }

  function ruleNode(
    id: string,
    variant: Extract<ReceiptPrinterNode, { type: 'rule' }>['variant'] = 'standard'
  ): ReceiptPrinterNode {
    return {
      id,
      start: offset,
      type: 'rule',
      variant
    };
  }

  return {
    barcode(id: string, lines: ReceiptCategoryLine[]) {
      nodes.push({
        bars: buildBarcodeBars(lines),
        id,
        start: offset,
        type: 'barcode'
      });
    },
    dot(id: string, color: string, opacity = 1): ReceiptPrinterNode {
      return { color, id, opacity, type: 'dot' };
    },
    model(): ReceiptPrinterModel {
      return {
        nodes,
        runs,
        stream,
        totalChars: offset
      };
    },
    row(
      id: string,
      role: Extract<ReceiptPrinterNode, { type: 'row' }>['role'],
      children: ReceiptPrinterNode[]
    ): ReceiptPrinterNode {
      return {
        children,
        id,
        role,
        start: startFor(children),
        type: 'row'
      };
    },
    rule(id: string, variant: Extract<ReceiptPrinterNode, { type: 'rule' }>['variant'] = 'standard') {
      nodes.push(ruleNode(id, variant));
    },
    ruleNode,
    section(
      id: string,
      role: Extract<ReceiptPrinterNode, { type: 'section' }>['role'],
      children: ReceiptPrinterNode[]
    ) {
      nodes.push({
        children,
        id,
        role,
        start: startFor(children),
        type: 'section'
      });
    },
    tear(id: string, direction: 'bottom' | 'top') {
      nodes.push({
        direction,
        id,
        start: offset,
        type: 'tear'
      });
    },
    text
  };
}

function momColor(line: ReceiptCategoryLine) {
  if (line.momDirection === 'up' || line.momDirection === 'new') {
    return DANGER;
  }
  if (line.momDirection === 'down') {
    return SUCCESS;
  }
  return SUBTLE;
}

function receiptComparison(receipt: MonthlyReceiptStat) {
  if (receipt.comparison.percentage === null) {
    return {
      color: '#C0892E',
      strong: '+ NEW'
    };
  }

  const formatted = `${Math.abs(receipt.comparison.percentage).toFixed(1)}%`;
  if (receipt.comparison.direction === 'over') {
    return {
      color: DANGER,
      strong: `↑ ${formatted} over`
    };
  }
  if (receipt.comparison.direction === 'under') {
    return {
      color: SUCCESS,
      strong: `↓ ${formatted} under`
    };
  }
  return {
    color: MUTED,
    strong: `- ${formatted} flat`
  };
}

function buildBarcodeBars(lines: ReceiptCategoryLine[]) {
  const widths = Array.from({ length: 46 }, (_, index) => 1 + ((index * 5 + 2) % 3));
  const activeLines = lines.filter((line) => line.amountYen > 0);
  const totalYen = activeLines.reduce((sum, line) => sum + line.amountYen, 0);

  if (totalYen <= 0) {
    return widths.map((width) => ({ color: 'rgba(42,39,34,0.22)', width }));
  }

  let runningShare = 0;
  const segments = activeLines.map((line) => {
    runningShare += line.amountYen / totalYen;
    return {
      color: line.color,
      end: runningShare
    };
  });
  const totalUnits = widths.reduce((sum, width) => sum + width, 0);
  let usedUnits = 0;
  let segmentIndex = 0;

  return widths.map((width) => {
    const center = (usedUnits + width / 2) / totalUnits;
    usedUnits += width;
    while (segmentIndex < segments.length - 1 && center > segments[segmentIndex].end) {
      segmentIndex += 1;
    }
    return {
      color: segments[segmentIndex]?.color || INK,
      width
    };
  });
}
