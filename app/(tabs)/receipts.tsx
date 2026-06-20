import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Svg, { Defs, LinearGradient, Pattern, Polygon, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { displayName, formatYen } from '@/src/lib/format';
import {
  addMonths,
  buildMonthlyReceipts,
  currentMonthKey,
  monthEndDateString,
  monthKeyFromDateString,
  monthStartDateString,
  type MonthlyReceiptStat,
  type ReceiptCategoryLine
} from '@/src/lib/stats';
import {
  getExpensesByMonth,
  getFirstExpenseSpentOn,
  getLedgerMembers
} from '@/src/lib/ledger';
import type { LedgerMemberProfile } from '@/src/types/database';

const RECEIPT_WIDTH = 290;
const AnimatedReceipt = Animated.createAnimatedComponent(View);

type ReceiptsLoadState = {
  error: string | null;
  loading: boolean;
  members: LedgerMemberProfile[];
  receipts: MonthlyReceiptStat[];
};

export default function ReceiptsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ month?: string | string[] }>();
  const { session } = useAuth();
  const { activeLedger, loading: ledgerLoading } = useLedgerContext();
  const activeLedgerId = activeLedger?.ledger.id || null;
  const currentUserId = session?.user.id || null;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;
  const [state, setState] = useState<ReceiptsLoadState>({
    error: null,
    loading: true,
    members: [],
    receipts: []
  });

  const selectedMonthParam = firstParam(params.month);
  const selectedReceipt = state.receipts[selectedIndex] || null;
  const selectedReceiptMonthKey = selectedReceipt?.monthKey || null;
  const currentMember = state.members.find((member) => member.user_id === currentUserId) || null;
  const otherMember = state.members.find((member) => member.user_id !== currentUserId) || null;
  const currentUserName = displayName(currentMember?.profile.display_name);
  const otherUserName = displayName(otherMember?.profile.display_name);

  const load = useCallback(async () => {
    if (ledgerLoading || !activeLedger?.ledger || !currentUserId) {
      return;
    }

    setState((current) => ({ ...current, error: null, loading: current.receipts.length === 0 }));
    try {
      const [members, firstExpenseSpentOn] = await Promise.all([
        getLedgerMembers(activeLedger.ledger.id),
        getFirstExpenseSpentOn(activeLedger.ledger.id)
      ]);
      const ledgerCreatedMonth = monthKeyFromDateString(activeLedger.ledger.created_at);
      const firstExpenseMonth = firstExpenseSpentOn ? monthKeyFromDateString(firstExpenseSpentOn) : null;
      const startMonthKey = firstExpenseMonth && firstExpenseMonth < ledgerCreatedMonth
        ? firstExpenseMonth
        : ledgerCreatedMonth;
      const rangeStartMonthKey = addMonths(startMonthKey, -1);
      const currentMonth = currentMonthKey();
      const lastClosedMonthKey = addMonths(currentMonth, -1);
      const expenses = startMonthKey <= lastClosedMonthKey
        ? await getExpensesByMonth(
          activeLedger.ledger.id,
          monthStartDateString(rangeStartMonthKey),
          monthEndDateString(lastClosedMonthKey),
          { refreshFirst: true }
        )
        : [];
      const nextReceipts = buildMonthlyReceipts({
        currentUserId,
        endBeforeMonthKey: currentMonth,
        expenses,
        otherUserId: members.find((member) => member.user_id !== currentUserId)?.user_id || null,
        startMonthKey
      });

      setState({
        error: null,
        loading: false,
        members,
        receipts: nextReceipts
      });
    } catch (loadError) {
      setState((current) => ({
        ...current,
        error: loadError instanceof Error ? loadError.message : 'Could not load receipts',
        loading: false
      }));
    }
  }, [activeLedger, currentUserId, ledgerLoading]);

  useEffect(() => {
    void load();
  }, [activeLedgerId, load]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!selectedMonthParam || state.receipts.length === 0) {
      return;
    }

    const nextIndex = state.receipts.findIndex((receipt) => receipt.monthKey === selectedMonthParam);
    if (nextIndex >= 0) {
      setSelectedIndex(nextIndex);
    }
  }, [selectedMonthParam, state.receipts]);

  useEffect(() => {
    if (reduceMotion || !selectedReceiptMonthKey) {
      translateY.setValue(0);
      return;
    }

    translateY.setValue(-10);
    Animated.timing(translateY, {
      duration: 420,
      toValue: 0,
      useNativeDriver: true
    }).start();
  }, [reduceMotion, selectedReceiptMonthKey, translateY]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  function selectReceipt(nextIndex: number) {
    const receipt = state.receipts[nextIndex];
    if (!receipt) {
      return;
    }

    setSelectedIndex(nextIndex);
    router.setParams({ month: receipt.monthKey });
  }

  const canGoOlder = selectedIndex < state.receipts.length - 1;
  const canGoNewer = selectedIndex > 0;

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={[styles.content, localStyles.content, { paddingTop: insets.top + 16 }]}
    >
      {state.error ? <Text style={styles.error}>{state.error}</Text> : null}

      {!state.loading && state.receipts.length === 0 ? (
        <View style={localStyles.emptyCard}>
          <Text style={styles.h2}>No Closed Months Yet</Text>
          <Text style={styles.muted}>Receipts print after a month closes.</Text>
        </View>
      ) : null}

      {selectedReceipt ? (
        <View style={localStyles.stage}>
          <View style={localStyles.stack}>
            <View style={[localStyles.peek, localStyles.peekBack]} />
            <View style={[localStyles.peek, localStyles.peekFront]} />
            <AnimatedReceipt style={[localStyles.receiptWrap, { transform: [{ translateY }] }]}>
              <TearEdge direction="top" />
              <ReceiptBody
                currentUserName={currentUserName}
                otherUserName={otherUserName}
                receipt={selectedReceipt}
              />
              <TearEdge direction="bottom" />
            </AnimatedReceipt>
          </View>

          <View style={localStyles.flipRow}>
            <FlipButton
              accessibilityLabel="Older month"
              disabled={!canGoOlder}
              icon="chevron-back"
              onPress={() => selectReceipt(selectedIndex + 1)}
            />
            <View style={localStyles.flipMiddle}>
              <Text numberOfLines={1} style={localStyles.flipLabel}>{selectedReceipt.label}</Text>
              <Text numberOfLines={1} style={localStyles.flipPosition}>{selectedIndex + 1} / {state.receipts.length}</Text>
            </View>
            <FlipButton
              accessibilityLabel="Newer month"
              disabled={!canGoNewer}
              icon="chevron-forward"
              onPress={() => selectReceipt(selectedIndex - 1)}
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function ReceiptBody({
  currentUserName,
  otherUserName,
  receipt
}: {
  currentUserName: string;
  otherUserName: string;
  receipt: MonthlyReceiptStat;
}) {
  const comparisonColor = receipt.comparison.direction === 'over'
    ? colors.danger
    : receipt.comparison.direction === 'under'
      ? colors.success
      : colors.muted;
  const comparisonArrow = receipt.comparison.direction === 'over' ? '▲' : receipt.comparison.direction === 'under' ? '▼' : '•';
  const comparisonWord = receipt.comparison.direction === 'over' ? 'over' : receipt.comparison.direction === 'under' ? 'under' : 'same';

  return (
    <View style={localStyles.receiptBody}>
      <Text style={localStyles.receiptMark}>MY LEDGER</Text>
      <Text style={localStyles.receiptSub}>HOUSEHOLD 2026 · JPY</Text>
      <Text style={localStyles.receiptMonth}>{receipt.label}</Text>
      <Text style={localStyles.receiptMeta}>{receipt.span} · {receipt.records} records</Text>
      <Rule />
      <View style={localStyles.receiptColumns}>
        <Text style={localStyles.columnItem}>ITEM</Text>
        <Text style={localStyles.columnMom}>MoM</Text>
        <Text style={localStyles.columnAmount}>AMOUNT</Text>
      </View>
      <View style={localStyles.itemsFrame}>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={localStyles.itemsList}>
          {receipt.lines.map((line) => <ReceiptLine key={line.categoryId} line={line} />)}
        </ScrollView>
        <View pointerEvents="none" style={localStyles.itemsFade}>
          <Svg height="18" width="100%">
            <Defs>
              <LinearGradient id="itemsFade" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor="#FFFDF7" stopOpacity="0" />
                <Stop offset="1" stopColor="#FFFDF7" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect fill="url(#itemsFade)" height="18" width="100%" />
          </Svg>
        </View>
      </View>
      <View style={localStyles.scrollCue}>
        <Ionicons color={colors.subtle} name="chevron-down" size={12} />
        <Text style={localStyles.scrollCueText}>SCROLL ALL 11 CATEGORIES</Text>
      </View>
      <Rule />
      <ReceiptKeyValue label="DAILY AVG" value={formatYen(receipt.dailyAverageYen)} />
      <ReceiptKeyValue label="CATEGORIES" value={`${receipt.activeCategoryCount} / 11 active`} />
      <Rule />
      <Text style={localStyles.splitHeader}>SPLIT 50/50 ADJUSTED</Text>
      <ReceiptKeyValue
        dotColor="#B25A3C"
        label={`${currentUserName.toUpperCase()} · ${receipt.alexPercentage}%`}
        value={formatYen(receipt.alexAmountYen)}
        valueColor="#B25A3C"
      />
      <ReceiptKeyValue
        dotColor="#3F8A86"
        label={`${otherUserName.toUpperCase()} · ${receipt.minaPercentage}%`}
        value={formatYen(receipt.minaAmountYen)}
        valueColor="#3F8A86"
      />
      <Rule double />
      <View style={localStyles.totalRow}>
        <Text style={localStyles.totalLabel}>TOTAL</Text>
        <Text style={localStyles.totalValue}>{formatYen(receipt.totalYen)}</Text>
      </View>
      <Text style={localStyles.comparisonLine}>
        <Text style={[localStyles.comparisonStrong, { color: comparisonColor }]}>
          {comparisonArrow} {formatReceiptPercentage(receipt.comparison.percentage)} {comparisonWord}
        </Text>
        {' '}vs {receipt.comparison.label}
      </Text>
      <Rule />
      <Text style={localStyles.footerText}>THANK YOU · KEEP IT FAIR</Text>
      <Barcode seed={receipt.records + receipt.totalYen} />
      <Text style={localStyles.receiptCode}>#{receipt.code} · SETTLED</Text>
    </View>
  );
}

function ReceiptLine({ line }: { line: ReceiptCategoryLine }) {
  const momColor = line.momDirection === 'up' || line.momDirection === 'new'
    ? colors.danger
    : line.momDirection === 'down'
      ? colors.success
      : colors.subtle;
  const zero = line.amountYen === 0;

  return (
    <View style={localStyles.receiptItem}>
      <View style={localStyles.itemName}>
        <View style={[localStyles.itemDot, { backgroundColor: line.color, opacity: zero ? 0.35 : 1 }]} />
        <Text numberOfLines={1} style={[localStyles.itemNameText, zero && localStyles.zeroText]}>{line.label}</Text>
      </View>
      <Text numberOfLines={1} style={[localStyles.itemMom, { color: momColor }]}>{line.momLabel}</Text>
      <Text numberOfLines={1} style={[localStyles.itemAmount, zero && localStyles.zeroText]}>{formatYen(line.amountYen)}</Text>
    </View>
  );
}

function ReceiptKeyValue({
  dotColor,
  label,
  value,
  valueColor
}: {
  dotColor?: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={localStyles.keyValueRow}>
      <View style={localStyles.keyLabelWrap}>
        {dotColor ? <View style={[localStyles.itemDot, { backgroundColor: dotColor }]} /> : null}
        <Text numberOfLines={1} style={localStyles.keyLabel}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[localStyles.keyValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

function Rule({ double }: { double?: boolean }) {
  return <View style={double ? localStyles.ruleDouble : localStyles.rule} />;
}

function TearEdge({ direction }: { direction: 'bottom' | 'top' }) {
  const points = direction === 'top' ? '0,9 6,0 12,9' : '0,0 12,0 6,9';
  return (
    <Svg height={9} width={RECEIPT_WIDTH}>
      <Defs>
        <Pattern height={9} id={`tear-${direction}`} patternUnits="userSpaceOnUse" width={12}>
          <Polygon fill="#FFFDF7" points={points} />
        </Pattern>
      </Defs>
      <Rect fill={`url(#tear-${direction})`} height={9} width={RECEIPT_WIDTH} />
    </Svg>
  );
}

function Barcode({ seed }: { seed: number }) {
  const bars = useMemo(() => Array.from({ length: 44 }, (_, index) => 1 + ((seed + index * 7) % 3)), [seed]);
  return (
    <View style={localStyles.barcode}>
      {bars.map((width, index) => (
        <View key={`${index}-${width}`} style={[localStyles.barcodeBar, { width }]} />
      ))}
    </View>
  );
}

function FlipButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress
}: {
  accessibilityLabel: string;
  disabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.flipButton,
        disabled && localStyles.disabled,
        pressed && !disabled && localStyles.pressed
      ]}
    >
      <Ionicons color={colors.primaryDark} name={icon} size={21} />
    </Pressable>
  );
}

function formatReceiptPercentage(value: number | null) {
  if (value === null) {
    return 'NEW';
  }
  return `${Math.abs(value).toFixed(1)}%`;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const localStyles = StyleSheet.create({
  barcode: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 2,
    height: 32,
    justifyContent: 'center',
    marginBottom: 6,
    marginTop: 10
  },
  barcodeBar: {
    backgroundColor: colors.primaryDark
  },
  columnAmount: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 12,
    textAlign: 'right'
  },
  columnItem: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 12,
    flex: 1
  },
  columnMom: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 12,
    textAlign: 'center',
    width: 50
  },
  comparisonLine: {
    color: colors.muted,
    fontFamily: fontFamilies.mono,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 7,
    textAlign: 'right'
  },
  comparisonStrong: {
    fontFamily: fontFamilies.monoBold,
    fontWeight: '700'
  },
  content: {
    alignItems: 'center'
  },
  disabled: {
    opacity: 0.4
  },
  emptyCard: {
    ...styles.section,
    width: '100%'
  },
  flipButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(42,39,34,0.12)',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
    ...theme.shadow
  },
  flipLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 19,
    textAlign: 'center'
  },
  flipMiddle: {
    minWidth: 136
  },
  flipPosition: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center'
  },
  flipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center'
  },
  footerText: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 2,
    lineHeight: 13,
    marginTop: 6,
    textAlign: 'center'
  },
  itemAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'right',
    width: 64
  },
  itemDot: {
    borderRadius: 2,
    height: 8,
    width: 8
  },
  itemMom: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
    width: 50
  },
  itemName: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  itemNameText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    minWidth: 0
  },
  itemsFade: {
    bottom: 0,
    height: 18,
    left: 0,
    position: 'absolute',
    right: 0
  },
  itemsFrame: {
    maxHeight: 150,
    position: 'relative'
  },
  itemsList: {
    maxHeight: 150,
    paddingRight: 6
  },
  keyLabel: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 17,
    minWidth: 0
  },
  keyLabelWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  keyValue: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'right'
  },
  keyValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingVertical: 3
  },
  peek: {
    backgroundColor: '#FFFDF7',
    borderColor: 'rgba(42,39,34,0.10)',
    borderRadius: 6,
    borderWidth: 1,
    height: 60,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  peekBack: {
    left: 8,
    right: 8,
    top: 9,
    transform: [{ rotate: '-1.4deg' }]
  },
  peekFront: {
    left: 4,
    opacity: 0.85,
    right: 4,
    top: 5,
    transform: [{ rotate: '0.9deg' }]
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.97 }]
  },
  receiptBody: {
    backgroundColor: '#FFFDF7',
    color: colors.ink,
    paddingBottom: 16,
    paddingHorizontal: 22,
    paddingTop: 22,
    width: RECEIPT_WIDTH
  },
  receiptCode: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 9.5,
    letterSpacing: 1.5,
    lineHeight: 13,
    textAlign: 'center'
  },
  receiptColumns: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 6
  },
  receiptColumnsText: {
    color: colors.subtle
  },
  receiptItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 3
  },
  receiptMark: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
    lineHeight: 23,
    textAlign: 'center'
  },
  receiptMeta: {
    color: colors.muted,
    fontFamily: fontFamilies.mono,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center'
  },
  receiptMonth: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center'
  },
  receiptSub: {
    color: colors.subtle,
    fontFamily: fontFamilies.semiBold,
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 1.5,
    lineHeight: 13,
    marginTop: 3,
    textAlign: 'center'
  },
  receiptWrap: {
    shadowColor: colors.ink,
    shadowOffset: { height: 22, width: 0 },
    shadowOpacity: 0.26,
    shadowRadius: 28
  },
  rule: {
    borderColor: 'rgba(42,39,34,0.32)',
    borderStyle: 'dashed',
    borderTopWidth: 1,
    height: 0,
    marginVertical: 11
  },
  ruleDouble: {
    borderColor: 'rgba(42,39,34,0.50)',
    borderTopWidth: 3,
    height: 0,
    marginVertical: 11
  },
  scrollCue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginTop: 5
  },
  scrollCueText: {
    color: colors.subtle,
    fontFamily: fontFamilies.bold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 12
  },
  splitHeader: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1.5,
    lineHeight: 12,
    marginBottom: 2
  },
  stack: {
    paddingTop: 6,
    width: RECEIPT_WIDTH
  },
  stage: {
    alignItems: 'center',
    gap: 18
  },
  totalLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    lineHeight: 18
  },
  totalRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  totalValue: {
    color: colors.ink,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 27
  },
  zeroText: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoSemiBold,
    fontWeight: '600'
  }
});
