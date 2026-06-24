export type ReceiptNavigationItem = {
  monthKey: string;
};

export type ReceiptYearGroup = {
  latestReceiptIndex: number;
  receiptIndices: number[];
  year: number;
};

export function buildReceiptYearGroups(receipts: ReceiptNavigationItem[]): ReceiptYearGroup[] {
  const groupsByYear = new Map<number, number[]>();

  receipts.forEach((receipt, index) => {
    const year = receiptYear(receipt.monthKey);
    const indices = groupsByYear.get(year) || [];
    indices.push(index);
    groupsByYear.set(year, indices);
  });

  return [...groupsByYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, indices]) => {
      const receiptIndices = [...indices].sort((a, b) => (
        receiptMonth(receipts[a].monthKey) - receiptMonth(receipts[b].monthKey)
      ));

      return {
        latestReceiptIndex: receiptIndices[receiptIndices.length - 1] ?? indices[0],
        receiptIndices,
        year
      };
    });
}

export function nextReceiptIndexWithinYear(
  groups: ReceiptYearGroup[],
  selectedIndex: number,
  direction: 1 | -1
) {
  const group = groups.find((item) => item.receiptIndices.includes(selectedIndex));
  if (!group || group.receiptIndices.length < 2) {
    return selectedIndex;
  }

  const currentPosition = group.receiptIndices.indexOf(selectedIndex);
  return group.receiptIndices[
    (currentPosition + direction + group.receiptIndices.length) % group.receiptIndices.length
  ];
}

export function receiptYear(monthKey: string) {
  return Number(monthKey.slice(0, 4));
}

function receiptMonth(monthKey: string) {
  return Number(monthKey.slice(5, 7));
}
