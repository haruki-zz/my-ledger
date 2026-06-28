import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderInstance
} from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KEYBOARD_DONE_ACCESSORY_ID, KeyboardDoneAccessory } from '@/src/components/KeyboardDoneAccessory';
import { colors, fontFamilies, theme } from '@/src/components/styles';
import {
  DEFAULT_CATEGORY_SPLIT_RATIO,
  PRIMARY_CATEGORIES,
  categoryColor,
  categoryIconName,
  categoryLabel,
  resolveCategory,
  subcategoryPresets,
  type PrimaryCategoryId
} from '@/src/lib/categorySystem';
import { buildUserColorMap, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import {
  buildWeekStrip,
  calculateSplitAmounts,
  complementShareAmounts,
  dateSummary,
  deriveSplitBackfill,
  parseDateString,
  sanitizeWholeNumber,
  updateKeypadBuffer,
  wrapIndex,
  type KeypadKey
} from '@/src/lib/expenseFormHelpers';
import { displayName, todayDateString } from '@/src/lib/format';
import { saveExpense } from '@/src/lib/ledger';
import {
  activeRecurringSubcategoryKeys,
  recurringRuleSubcategoryKey
} from '@/src/lib/recurring';
import type {
  Expense,
  Ledger,
  LedgerMemberProfile,
  Profile,
  RecurringExpenseRule
} from '@/src/types/database';

type Props = {
  ledger: Ledger;
  members: LedgerMemberProfile[];
  currentUserId: string;
  currentProfile?: Profile;
  expense?: Expense;
  profilesById: Record<string, Profile>;
  recurringRules?: RecurringExpenseRule[];
};

type Step = 0 | 1 | 2 | 3 | 4;
type FocusedInput = 'total' | string;
type SplitMode = 'ratio' | 'amount';

type Shares = {
  total: number;
  byUserId: Record<string, number>;
};

const numberFormatter = new Intl.NumberFormat('en-US');
const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];
const WHEEL_ROW_HEIGHT = 46;
const WHEEL_REPEAT_COUNT = 21;
const WHEEL_MIDDLE_REPEAT = Math.floor(WHEEL_REPEAT_COUNT / 2);
const WHEEL_CENTER_INSET = 92;
const PROGRESS_DOT_CONFIG = {
  duration: 240,
  easing: Easing.out(Easing.cubic)
};
const SPLIT_CAPSULES = 20;

function parsePositiveInteger(value: string) {
  const parsed = Number(sanitizeWholeNumber(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatYenText(value: number) {
  return `¥${numberFormatter.format(Math.max(0, Math.round(value)))}`;
}

function splitPctFromShares(shares: Shares, firstMemberId: string | undefined) {
  if (!firstMemberId || shares.total <= 0) {
    return DEFAULT_CATEGORY_SPLIT_RATIO[0];
  }

  return ((shares.byUserId[firstMemberId] || 0) / shares.total) * 100;
}

function ProgressDot({ active }: { active: boolean }) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, PROGRESS_DOT_CONFIG);
  }, [active, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(42,39,34,0.16)', ACCENT]
    ),
    width: 5 + progress.value * 17
  }));

  return <Animated.View style={[localStyles.progressDot, animatedStyle]} />;
}

export function ExpenseForm({
  ledger,
  members,
  currentUserId,
  expense,
  recurringRules = []
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compactLayout = width < 390;
  const pagePaddingTop = Math.max(insets.top - 24, 0);
  const pagePaddingBottom = Math.max(insets.bottom, 10);
  const scrollRef = useRef<ScrollView>(null);
  const wheelScrollRef = useRef<ScrollView>(null);
  const [splitBarResponder, setSplitBarResponder] = useState<PanResponderInstance | null>(null);
  const selectedCategoryIndexRef = useRef(0);
  const stepRef = useRef<Step>(0);
  const barRef = useRef<View>(null);
  const barLeftRef = useRef(0);
  const splitBarWidthRef = useRef(0);
  const ratioFromPageXRef = useRef<(pageX: number) => void>(() => undefined);

  const sortedMembers = useMemo(() => members.slice(0, 2), [members]);
  const memberIds = useMemo(() => sortedMembers.map((member) => member.user_id), [sortedMembers]);
  const firstMemberId = memberIds[0];
  const secondMemberId = memberIds[1];
  const memberColorById = useMemo(() => (
    buildUserColorMap(memberIds, currentUserId)
  ), [currentUserId, memberIds]);

  const initialCategory = useMemo(() => resolveCategory({
    categoryId: expense?.category_id,
    category: expense?.category,
    subcategory: expense?.subcategory
  }), [expense?.category, expense?.category_id, expense?.subcategory]);
  const defaultCategoryId = (expense ? initialCategory.categoryId : PRIMARY_CATEGORIES[0].id) as PrimaryCategoryId;
  const defaultSubcategory = initialCategory.subcategory || subcategoryPresets(defaultCategoryId)[0] || '';
  const initialAmount = expense ? String(expense.amount_yen) : '';
  const initialTotal = parsePositiveInteger(initialAmount) || 0;
  const initialSplit = deriveSplitBackfill({
    memberIds,
    ownership: expense?.ownership,
    paidBy: expense?.paid_by || currentUserId,
    splits: expense?.splits,
    totalAmount: initialTotal
  });

  const [step, setStep] = useState<Step>(0);
  const [amountBuffer, setAmountBuffer] = useState(initialAmount);
  const [spentOn, setSpentOn] = useState(expense?.spent_on || todayDateString());
  const [weekOffset, setWeekOffset] = useState(0);
  const [categoryId, setCategoryId] = useState<PrimaryCategoryId>(defaultCategoryId);
  const [subcategory, setSubcategory] = useState(defaultSubcategory);
  const [splitMode, setSplitMode] = useState<SplitMode>('ratio');
  const [splitPct, setSplitPct] = useState(initialTotal > 0 ? initialSplit.splitPct : DEFAULT_CATEGORY_SPLIT_RATIO[0]);
  const [focusedInput, setFocusedInput] = useState<FocusedInput>('total');
  const [manualShareUserId, setManualShareUserId] = useState<string | null>(null);
  const [shareBuffer, setShareBuffer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [splitBarWidth, setSplitBarWidth] = useState(0);

  const today = todayDateString();
  const amountYen = parsePositiveInteger(amountBuffer) || 0;
  const selectedCategoryIndex = Math.max(0, PRIMARY_CATEGORIES.findIndex((category) => category.id === categoryId));
  const selectedCategory = PRIMARY_CATEGORIES[selectedCategoryIndex] || PRIMARY_CATEGORIES[0];
  const wheelRows = useMemo(() => (
    Array.from({ length: WHEEL_REPEAT_COUNT * PRIMARY_CATEGORIES.length }, (_, absoluteIndex) => ({
      absoluteIndex,
      category: PRIMARY_CATEGORIES[absoluteIndex % PRIMARY_CATEGORIES.length]
    }))
  ), []);
  const activeFixedSubcategoryKeys = useMemo(
    () => activeRecurringSubcategoryKeys(recurringRules),
    [recurringRules]
  );
  const currentSubcategoryPresets = useMemo(() => {
    const selectedSubcategory = subcategory.trim();
    return subcategoryPresets(categoryId).filter((option) => {
      if (expense?.subcategory === option || selectedSubcategory === option) {
        return true;
      }

      return !activeFixedSubcategoryKeys.has(recurringRuleSubcategoryKey(categoryId, option));
    });
  }, [activeFixedSubcategoryKeys, categoryId, expense?.subcategory, subcategory]);
  const matchesActiveFixedSubcategory = useMemo(() => {
    const trimmedSubcategory = subcategory.trim();
    if (!categoryId || !trimmedSubcategory || expense?.recurring_rule_id) {
      return false;
    }

    return activeFixedSubcategoryKeys.has(recurringRuleSubcategoryKey(categoryId, trimmedSubcategory));
  }, [activeFixedSubcategoryKeys, categoryId, expense?.recurring_rule_id, subcategory]);
  const weekStrip = useMemo(() => buildWeekStrip({
    selectedDateString: spentOn,
    todayDateString: today,
    weekOffset
  }), [spentOn, today, weekOffset]);
  const shares = currentShares();
  const effectiveSplitPct = splitPctFromShares(shares, firstMemberId);
  const keypadVisible = step === 0 || (step === 4 && splitMode === 'amount' && focusedInput !== 'total');
  const canContinue = step !== 0 || amountYen > 0;
  const isEditing = Boolean(expense);
  const footerLabel = submitting ? 'Saving...' : step === 4 ? 'Save record' : 'Continue';

  useEffect(() => {
    if (step === 2) {
      const targetIndex = WHEEL_MIDDLE_REPEAT * PRIMARY_CATEGORIES.length + selectedCategoryIndexRef.current;
      requestAnimationFrame(() => {
        wheelScrollRef.current?.scrollTo({
          animated: false,
          y: targetIndex * WHEEL_ROW_HEIGHT
        });
      });
    }
  }, [step]);

  useEffect(() => {
    setSplitBarResponder(PanResponder.create({
      onStartShouldSetPanResponder: () => stepRef.current === 4,
      onStartShouldSetPanResponderCapture: () => stepRef.current === 4,
      onMoveShouldSetPanResponder: (_, gestureState) => (
        stepRef.current === 4 &&
        Math.abs(gestureState.dx) > 3 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      ),
      onMoveShouldSetPanResponderCapture: (_, gestureState) => (
        stepRef.current === 4 &&
        Math.abs(gestureState.dx) > 3 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      ),
      onPanResponderGrant: (event) => {
        barRef.current?.measureInWindow((x) => {
          barLeftRef.current = x;
          ratioFromPageXRef.current(event.nativeEvent.pageX);
        });
      },
      onPanResponderMove: (event) => {
        ratioFromPageXRef.current(event.nativeEvent.pageX);
      },
      onPanResponderRelease: (event) => {
        ratioFromPageXRef.current(event.nativeEvent.pageX);
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true
    }));
  }, []);

  function currentShares(): Shares {
    const empty = Object.fromEntries(memberIds.map((memberId) => [memberId, 0]));
    if (!firstMemberId || !secondMemberId || amountYen <= 0) {
      return { total: amountYen, byUserId: empty };
    }

    if (splitMode === 'amount' && manualShareUserId) {
      return {
        total: amountYen,
        byUserId: {
          ...empty,
          ...complementShareAmounts({
            memberIds,
            totalAmount: amountYen,
            userId: manualShareUserId,
            value: shareBuffer
          })
        }
      };
    }

    const [firstAmount, secondAmount] = calculateSplitAmounts(amountYen, splitPct);
    return {
      total: amountYen,
      byUserId: {
        ...empty,
        [firstMemberId]: firstAmount,
        [secondMemberId]: secondAmount
      }
    };
  }

  function dismissForm() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/history');
  }

  function goStep(nextStep: Step) {
    setStep(nextStep);
    if (nextStep === 0) {
      setFocusedInput('total');
      scrollRef.current?.scrollTo({ animated: true, y: 0 });
    }
  }

  function pressKey(key: KeypadKey) {
    if (submitting) {
      return;
    }

    if (step === 4 && splitMode === 'amount' && focusedInput !== 'total') {
      setShareBuffer((current) => {
        const nextValue = updateKeypadBuffer(current, key);
        const boundedValue = Math.min(Number(nextValue || 0), amountYen);
        return nextValue ? String(boundedValue) : '';
      });
      return;
    }

    setAmountBuffer((current) => updateKeypadBuffer(current, key));
  }

  function selectCategoryByIndex(index: number) {
    const nextCategory = PRIMARY_CATEGORIES[wrapIndex(index, PRIMARY_CATEGORIES.length)];
    setCategoryId(nextCategory.id);
    setSubcategory(nextCategory.subcategories[0] || '');
  }

  function confirmCategory() {
    setStep(3);
  }

  function syncWheelSelection(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const absoluteIndex = Math.round(event.nativeEvent.contentOffset.y / WHEEL_ROW_HEIGHT);
    const categoryIndex = wrapIndex(absoluteIndex, PRIMARY_CATEGORIES.length);
    selectCategoryByIndex(categoryIndex);

    const middleIndex = WHEEL_MIDDLE_REPEAT * PRIMARY_CATEGORIES.length + categoryIndex;
    if (Math.abs(absoluteIndex - middleIndex) > PRIMARY_CATEGORIES.length * 2) {
      requestAnimationFrame(() => {
        wheelScrollRef.current?.scrollTo({
          animated: false,
          y: middleIndex * WHEEL_ROW_HEIGHT
        });
      });
    }
  }

  function setRatio(nextPct: number) {
    setSplitMode('ratio');
    setFocusedInput('total');
    setManualShareUserId(null);
    setSplitPct(Math.max(0, Math.min(100, nextPct)));
  }

  function focusShare(userId: string) {
    const currentAmount = shares.byUserId[userId] || 0;
    setStep(4);
    setSplitMode('amount');
    setFocusedInput(userId);
    setManualShareUserId(userId);
    setShareBuffer(String(currentAmount));
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
  }

  function revealCustomTagInput() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 260);
  }

  function selectDay(dateString: string, isFuture: boolean) {
    if (isFuture) {
      return;
    }

    setSpentOn(dateString);
    setStep(2);
  }

  function handleContinue() {
    if (submitting || !canContinue) {
      return;
    }

    if (step === 0) {
      setStep(2);
      return;
    }

    if (step === 4) {
      void submit();
      return;
    }

    setStep((current) => Math.min(4, current + 1) as Step);
  }

  function buildSplits() {
    if (!firstMemberId || !secondMemberId) {
      throw new Error('Shared expenses require two ledger members');
    }

    const splits = sortedMembers.map((member) => ({
      user_id: member.user_id,
      amount_yen: shares.byUserId[member.user_id] || 0
    }));
    const splitTotal = splits.reduce((sum, split) => sum + split.amount_yen, 0);
    if (splitTotal !== amountYen) {
      throw new Error('Split amounts must add up to the total amount');
    }

    return splits;
  }

  function validateForm() {
    if (!amountYen) {
      return 'Enter an amount greater than 0';
    }

    if (!categoryId) {
      return 'Choose a category';
    }

    if (!parseDateString(spentOn)) {
      return 'Choose a valid date';
    }

    if (spentOn > today) {
      return 'Future dates are not allowed';
    }

    try {
      buildSplits();
    } catch (splitError) {
      return splitError instanceof Error ? splitError.message : 'Check split values';
    }

    return null;
  }

  async function submit(skipFixedSubcategoryConfirm = false) {
    const validationMessage = validateForm();
    if (validationMessage) {
      Alert.alert('Save Failed', validationMessage);
      return;
    }

    if (!skipFixedSubcategoryConfirm && matchesActiveFixedSubcategory) {
      Alert.alert(
        'Save as regular expense?',
        'This subcategory is already configured as a fixed monthly expense. Save this as an additional regular expense?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save Anyway',
            onPress: () => {
              void submit(true);
            }
          }
        ]
      );
      return;
    }

    setSubmitting(true);
    try {
      await saveExpense({
        id: expense?.id,
        ledgerId: ledger.id,
        amountYen,
        categoryId,
        category: categoryLabel(categoryId),
        subcategory: subcategory.trim() || null,
        paidBy: expense?.paid_by || currentUserId,
        ownership: 'shared',
        spentOn,
        note: expense ? expense.note : '',
        splits: buildSplits()
      });

      dismissForm();
    } catch (submitError) {
      Alert.alert('Save Failed', submitError instanceof Error ? submitError.message : 'Check the form values');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSplitBarLayout(event: LayoutChangeEvent) {
    setSplitBarWidth(event.nativeEvent.layout.width);
  }

  function ratioFromPageX(pageX: number) {
    const currentBarWidth = splitBarWidthRef.current;
    if (currentBarWidth <= 0) {
      return;
    }

    const progress = Math.max(0, Math.min(1, (pageX - barLeftRef.current) / currentBarWidth));
    setRatio(Math.round(progress * SPLIT_CAPSULES) * 5);
  }

  useEffect(() => {
    stepRef.current = step;
    selectedCategoryIndexRef.current = selectedCategoryIndex;
    splitBarWidthRef.current = splitBarWidth;
    ratioFromPageXRef.current = ratioFromPageX;
  });

  if (sortedMembers.length < 2) {
    return (
      <View style={[localStyles.page, { paddingBottom: insets.bottom, paddingTop: insets.top }]}>
        <View style={localStyles.header}>
          <Pressable accessibilityLabel="Close expense form" onPress={dismissForm} style={localStyles.iconButton}>
            <Ionicons color={colors.muted} name="close" size={22} />
          </Pressable>
        </View>
        <View style={localStyles.center}>
          <Text selectable style={localStyles.errorText}>Shared expenses require two ledger members.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[localStyles.page, { paddingBottom: pagePaddingBottom, paddingTop: pagePaddingTop }]}>
      {renderHeader()}
      <ScrollView
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        ref={scrollRef}
        contentContainerStyle={[
          localStyles.stack,
          compactLayout && localStyles.stackCompact,
          { paddingBottom: keypadVisible ? 10 : 18 }
        ]}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={step !== 2}
        showsVerticalScrollIndicator={false}
      >
        {renderAmountCard()}
        {renderDateCard()}
        {renderCategoryCard()}
        {renderDetailCard()}
        {renderSplitCard()}
      </ScrollView>
      {keypadVisible ? renderKeypad() : null}
      {renderFooter()}
      <KeyboardDoneAccessory />
    </View>
  );

  function renderHeader() {
    return (
      <View style={localStyles.header}>
        <Pressable accessibilityLabel="Close expense form" onPress={dismissForm} style={({ pressed }) => [localStyles.iconButton, pressed && localStyles.pressed]}>
          <Ionicons color={colors.muted} name="close" size={22} />
        </Pressable>
        <View style={localStyles.headerTitleBlock}>
          <Text style={localStyles.titleKicker}>{isEditing ? 'EDIT RECORD' : 'NEW RECORD'}</Text>
          <View style={localStyles.progressRow}>
            {[0, 1, 2, 3, 4].map((item) => (
              <ProgressDot active={step === item} key={item} />
            ))}
          </View>
        </View>
        <View style={localStyles.headerSpacer} />
      </View>
    );
  }

  function renderAccordionCard(cardStep: Step, children: React.ReactNode) {
    const onCategory = step === 2;
    return (
      <View
        style={[
          localStyles.card,
          step === cardStep && localStyles.cardActive,
          onCategory && cardStep !== 2 && localStyles.cardDimmed,
          onCategory && cardStep === 2 && localStyles.cardBare
        ]}
      >
        {children}
      </View>
    );
  }

  function renderCollapsedRow(cardStep: Step, label: string, value: React.ReactNode) {
    return (
      <Pressable accessibilityRole="button" onPress={() => goStep(cardStep)} style={({ pressed }) => [localStyles.row, pressed && localStyles.rowPressed]}>
        <View style={localStyles.rowLeft}>
          <View style={[localStyles.sideBar, step === cardStep && localStyles.sideBarActive]} />
          <Text style={[localStyles.rowLabel, step === cardStep && localStyles.rowLabelActive]}>{label}</Text>
        </View>
        <View style={localStyles.rowRight}>
          {value}
          <Ionicons color={step === cardStep ? ACCENT : '#C7BDAE'} name={step === cardStep ? 'chevron-up' : 'chevron-down'} size={15} />
        </View>
      </Pressable>
    );
  }

  function renderAmountCard() {
    return renderAccordionCard(0, (
      <Pressable accessibilityLabel="Edit amount" accessibilityRole="button" onPress={() => goStep(0)} style={({ pressed }) => [localStyles.amountRow, pressed && localStyles.rowPressed]}>
        <View style={localStyles.rowLeft}>
          <View style={[localStyles.sideBar, step === 0 && localStyles.sideBarActive]} />
          <Text style={[localStyles.rowLabel, step === 0 && localStyles.rowLabelActive]}>AMOUNT</Text>
        </View>
        <View style={localStyles.amountValue}>
          <Text style={[localStyles.amountYen, amountYen <= 0 && localStyles.amountValueEmpty]}>¥</Text>
          <Text style={[localStyles.amountNumber, amountYen <= 0 && localStyles.amountValueEmpty]}>
            {amountYen > 0 ? numberFormatter.format(amountYen) : '0'}
          </Text>
        </View>
      </Pressable>
    ));
  }

  function renderDateCard() {
    return renderAccordionCard(1, (
      <>
        {renderCollapsedRow(1, 'DATE', <Text style={localStyles.rowValue}>{dateSummary(spentOn, today)}</Text>)}
        {step === 1 ? (
          <View style={localStyles.cardBody}>
            <View style={localStyles.weekHeader}>
              <Text style={localStyles.bodyHint}>Pick a day</Text>
              <View style={localStyles.weekNav}>
                <Pressable accessibilityLabel="Previous week" onPress={() => setWeekOffset((current) => current + 1)} style={localStyles.weekNavButton}>
                  <Ionicons color={colors.muted} name="chevron-back" size={16} />
                </Pressable>
                <Text style={localStyles.weekLabel}>{weekStrip.weekLabel}</Text>
                <Pressable accessibilityLabel="Next week" onPress={() => setWeekOffset((current) => Math.max(0, current - 1))} style={[localStyles.weekNavButton, weekOffset === 0 && localStyles.weekNavButtonDisabled]}>
                  <Ionicons color={weekOffset === 0 ? '#C7BDAE' : colors.muted} name="chevron-forward" size={16} />
                </Pressable>
              </View>
            </View>
            <View style={localStyles.weekGrid}>
              {weekStrip.days.map((day) => (
                <Pressable
                  accessibilityLabel={`${day.dateString}${day.isFuture ? ', future date disabled' : ''}`}
                  accessibilityRole="button"
                  disabled={day.isFuture}
                  key={day.dateString}
                  onPress={() => selectDay(day.dateString, day.isFuture)}
                  style={({ pressed }) => [
                    localStyles.dayChip,
                    day.isToday && localStyles.dayChipToday,
                    day.isSelected && localStyles.dayChipSelected,
                    day.isFuture && localStyles.dayChipDisabled,
                    pressed && !day.isFuture && localStyles.pressed
                  ]}
                >
                  <Text style={[localStyles.dayWeekday, day.isSelected && localStyles.dayTextSelected]}>{day.weekdayInitial}</Text>
                  <Text style={[localStyles.dayNumber, day.isSelected && localStyles.dayNumberSelected]}>{day.dayNumber}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </>
    ));
  }

  function renderCategoryCard() {
    if (step !== 2) {
      return renderAccordionCard(2, renderCollapsedRow(2, 'CATEGORY', (
        <>
          <Ionicons color={categoryColor(categoryId)} name={categoryIconName(categoryId)} size={17} />
          <Text numberOfLines={1} style={localStyles.rowValue}>{categoryLabel(categoryId)}</Text>
        </>
      )));
    }

    const wheelContent = (
      <View
        accessibilityLabel={`Category picker, selected ${selectedCategory.label}`}
        accessibilityRole="adjustable"
        style={localStyles.wheel}
      >
        <View style={localStyles.wheelBand} />
        <ScrollView
          bounces={false}
          contentContainerStyle={localStyles.wheelScrollContent}
          decelerationRate="fast"
          disableIntervalMomentum
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onMomentumScrollEnd={syncWheelSelection}
          ref={wheelScrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={WHEEL_ROW_HEIGHT}
          style={localStyles.wheelScroller}
        >
          <View>
            {wheelRows.map(({ absoluteIndex, category }) => {
              const categoryIndex = absoluteIndex % PRIMARY_CATEGORIES.length;
              return (
                <Pressable
                  accessibilityLabel={`Select ${category.label}`}
                  accessibilityRole="button"
                  key={absoluteIndex}
                  onPress={() => {
                    if (categoryIndex === selectedCategoryIndex) {
                      confirmCategory();
                      return;
                    }

                    selectCategoryByIndex(categoryIndex);
                    wheelScrollRef.current?.scrollTo({
                      animated: true,
                      y: absoluteIndex * WHEEL_ROW_HEIGHT
                    });
                  }}
                  style={({ pressed }) => [localStyles.wheelOption, pressed && localStyles.pressed]}
                >
                  <View style={[localStyles.categoryIconBubble, { backgroundColor: `${category.color}20` }]}>
                    <Ionicons color={category.color} name={category.icon} size={18} />
                  </View>
                  <Text numberOfLines={1} style={localStyles.wheelOptionText}>
                    {category.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View pointerEvents="none" style={[localStyles.wheelFade, localStyles.wheelFadeTop]} />
        <View pointerEvents="none" style={[localStyles.wheelFade, localStyles.wheelFadeBottom]} />
      </View>
    );

    return renderAccordionCard(2, (
      <View style={localStyles.wheelWrap}>
        <View style={localStyles.wheelLabel}>
          <View style={[localStyles.sideBar, localStyles.sideBarActive]} />
          <Text style={[localStyles.rowLabel, localStyles.rowLabelActive]}>CATEGORY</Text>
        </View>
        {wheelContent}
      </View>
    ));
  }

  function renderDetailCard() {
    return renderAccordionCard(3, (
      <>
        {renderCollapsedRow(3, 'DETAIL', <Text numberOfLines={1} style={localStyles.rowValue}>{subcategory || 'Choose detail'}</Text>)}
        {step === 3 ? (
          <View style={localStyles.cardBody}>
            <View style={localStyles.detailHeader}>
              <View style={[localStyles.detailTick, { backgroundColor: selectedCategory.color }]} />
              <Text style={[localStyles.detailCategory, { color: selectedCategory.color }]}>{selectedCategory.label.toUpperCase()}</Text>
              <Text style={localStyles.detailCaption}>DETAIL</Text>
            </View>
            <View style={localStyles.tagWrap}>
              {currentSubcategoryPresets.map((option) => {
                const selected = option === subcategory.trim();
                return (
                  <Pressable
                    accessibilityLabel={`Select ${option}`}
                    accessibilityRole="button"
                    key={option}
                    onPress={() => {
                      setSubcategory(option);
                      setStep(4);
                    }}
                    style={({ pressed }) => [
                      localStyles.tagChip,
                      selected && { backgroundColor: selectedCategory.color, borderColor: selectedCategory.color },
                      pressed && localStyles.pressed
                    ]}
                  >
                    <Text style={[localStyles.tagText, selected && localStyles.tagTextSelected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={localStyles.customTagField}>
              <Text style={localStyles.customTagLabel}>CUSTOM DETAIL</Text>
              <TextInput
                accessibilityLabel="Custom detail tag"
                autoCapitalize="words"
                autoCorrect={false}
                inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                maxLength={36}
                onChangeText={setSubcategory}
                onFocus={revealCustomTagInput}
                onSubmitEditing={(event) => {
                  if (event.nativeEvent.text.trim()) {
                    setStep(4);
                  }
                }}
                placeholder="Enter a custom tag"
                placeholderTextColor="#B8AEA0"
                returnKeyType="next"
                style={localStyles.customTagInput}
                value={subcategory}
              />
            </View>
          </View>
        ) : null}
      </>
    ));
  }

  function renderSplitCard() {
    const firstMember = sortedMembers[0];
    const secondMember = sortedMembers[1];
    const firstColor = memberColorById.get(firstMember.user_id) || DEFAULT_USER_COLOR;
    const secondColor = memberColorById.get(secondMember.user_id) || DEFAULT_USER_COLOR;
    const firstAmount = shares.byUserId[firstMember.user_id] || 0;
    const secondAmount = shares.byUserId[secondMember.user_id] || 0;
    const firstPct = shares.total > 0 ? Math.round((firstAmount / shares.total) * 100) : Math.round(effectiveSplitPct);
    const secondPct = Math.max(0, 100 - firstPct);
    const splitSummary = firstAmount === shares.total && shares.total > 0
      ? `${displayName(firstMember.profile.display_name)}'s expense`
      : secondAmount === shares.total && shares.total > 0
        ? `${displayName(secondMember.profile.display_name)}'s expense`
        : `${formatYenText(firstAmount)} · ${formatYenText(secondAmount)}`;

    return renderAccordionCard(4, (
      <>
        {renderCollapsedRow(4, 'SPLIT', <Text numberOfLines={1} style={localStyles.rowValue}>{splitSummary}</Text>)}
        {step === 4 ? (
          <View style={localStyles.cardBody}>
            <View style={localStyles.splitReadout}>
              {renderReadoutMember(firstMember, firstColor, firstPct, 'left')}
              {renderReadoutMember(secondMember, secondColor, secondPct, 'right')}
            </View>
            <View
              ref={barRef}
              onLayout={handleSplitBarLayout}
              style={localStyles.capBar}
              {...(splitBarResponder?.panHandlers || {})}
            >
              {Array.from({ length: SPLIT_CAPSULES }, (_, index) => {
                const activeFirst = index < Math.round(effectiveSplitPct / 5);
                return (
                  <View
                    key={index}
                    style={[
                      localStyles.cap,
                      {
                        backgroundColor: activeFirst ? firstColor : secondColor,
                        opacity: activeFirst ? 0.96 : 0.9
                      }
                    ]}
                  />
                );
              })}
            </View>
            {renderSplitScale()}
            <View style={[localStyles.memberCards, compactLayout && localStyles.memberCardsCompact]}>
              {renderMemberShareCard(firstMember, firstColor, firstAmount, firstPct)}
              {renderMemberShareCard(secondMember, secondColor, secondAmount, secondPct)}
            </View>
          </View>
        ) : null}
      </>
    ));
  }

  function renderReadoutMember(member: LedgerMemberProfile, accent: string, pct: number, side: 'left' | 'right') {
    const name = displayName(member.profile.display_name);
    return (
      <View style={localStyles.readoutMember}>
        {side === 'left' ? <View style={[localStyles.readoutDot, { backgroundColor: accent }]} /> : null}
        {side === 'left' ? <Text numberOfLines={1} style={localStyles.readoutName}>{name}</Text> : null}
        <Text style={localStyles.readoutPct}>{pct}%</Text>
        {side === 'right' ? <Text numberOfLines={1} style={localStyles.readoutName}>{name}</Text> : null}
        {side === 'right' ? <View style={[localStyles.readoutDot, { backgroundColor: accent }]} /> : null}
      </View>
    );
  }

  function renderSplitScale() {
    return (
      <View accessibilityLabel="Split scale with minor ticks every 2 percent and major ticks every 10 percent" style={localStyles.splitScale}>
        <View style={localStyles.splitScaleTicks}>
          {Array.from({ length: 51 }, (_, index) => {
            const isMajor = index % 5 === 0;
            return (
              <View
                key={index}
                style={[
                  localStyles.splitScaleTick,
                  isMajor && localStyles.splitScaleTickMajor
                ]}
              />
            );
          })}
        </View>
        <View style={localStyles.splitScaleLabels}>
          {Array.from({ length: 11 }, (_, index) => (
            <Text key={index} style={localStyles.splitScaleLabel}>
              {index * 10}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  function renderMemberShareCard(member: LedgerMemberProfile, accent: string, amount: number, pct: number) {
    const name = displayName(member.profile.display_name);
    const focused = splitMode === 'amount' && focusedInput === member.user_id;
    const full = shares.total > 0 && amount === shares.total;
    const zero = shares.total > 0 && amount === 0;
    const tag = full ? 'Covers the full bill' : zero ? 'Owes nothing' : `${pct}% of the bill`;

    return (
      <Pressable
        accessibilityLabel={`Edit ${name} share amount`}
        accessibilityRole="button"
        onPress={() => focusShare(member.user_id)}
        style={({ pressed }) => [
          localStyles.memberCard,
          focused && localStyles.memberCardFocused,
          full && { backgroundColor: accent, borderColor: accent },
          zero && localStyles.memberCardZero,
          pressed && localStyles.pressed
        ]}
      >
        <View style={localStyles.memberCardHeader}>
          <View style={[localStyles.memberDot, { backgroundColor: full ? '#FFFDF7' : accent }]} />
          <Text numberOfLines={1} style={[localStyles.memberName, full && localStyles.memberNameFull]}>{name}</Text>
          <Text style={[localStyles.keyingCue, focused && localStyles.keyingCueActive]}>KEYING</Text>
        </View>
        <View style={localStyles.memberAmountRow}>
          <Text style={[localStyles.memberYen, full && localStyles.memberTextFull, zero && localStyles.memberTextZero]}>¥</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[localStyles.memberAmount, full && localStyles.memberTextFull, zero && localStyles.memberTextZero]}>
            {numberFormatter.format(amount)}
          </Text>
        </View>
        <Text numberOfLines={1} style={[localStyles.memberTag, full && localStyles.memberTagFull]}>{tag}</Text>
      </Pressable>
    );
  }

  function renderKeypad() {
    const target = step === 0
      ? 'ENTERING TOTAL'
      : `ENTERING ${displayName(sortedMembers.find((member) => member.user_id === focusedInput)?.profile.display_name).toUpperCase()}'S SHARE`;

    return (
      <View style={localStyles.keypad}>
        <Text style={localStyles.keypadTarget}>{target}</Text>
        <View style={localStyles.keys}>
          {KEYS.map((key) => (
            <Pressable
              accessibilityLabel={key === 'del' ? 'Delete digit' : `Input ${key}`}
              accessibilityRole="button"
              key={key}
              onPress={() => pressKey(key)}
              style={({ pressed }) => [
                localStyles.key,
                key === 'del' && localStyles.keyDelete,
                pressed && localStyles.keyPressed
              ]}
            >
              <Text style={[localStyles.keyText, key === 'del' && localStyles.keyDeleteText]}>
                {key === 'del' ? '⌫' : key}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  function renderFooter() {
    return (
      <View style={localStyles.footer}>
        <Pressable
          accessibilityLabel={step === 4 ? 'Save record' : 'Continue'}
          accessibilityRole="button"
          disabled={!canContinue || submitting}
          onPress={handleContinue}
          style={({ pressed }) => [
            localStyles.footerButton,
            (!canContinue || submitting) && localStyles.footerButtonDisabled,
            pressed && canContinue && !submitting && localStyles.pressed
          ]}
        >
          {step === 4 ? <Ionicons color="#FFFDF7" name="checkmark" size={18} /> : null}
          <Text style={localStyles.footerButtonText}>{footerLabel}</Text>
          {step !== 4 ? <Ionicons color="#FFFDF7" name="arrow-forward" size={18} /> : null}
        </Pressable>
      </View>
    );
  }
}

const PAPER = '#EFE9DF';
const ACCENT = '#C0892E';
const HERO = '#3A322A';
const INK = '#2A2722';
const MUTED = '#9A8F80';
const HAIRLINE = 'rgba(42,39,34,0.07)';

const localStyles = StyleSheet.create({
  amountNumber: {
    color: INK,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 30
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 58,
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  amountValue: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 2
  },
  amountValueEmpty: {
    color: 'rgba(42,39,34,0.28)'
  },
  amountYen: {
    color: INK,
    fontFamily: fontFamilies.monoBold,
    fontSize: 18,
    fontWeight: '700'
  },
  bodyHint: {
    color: MUTED,
    fontFamily: fontFamilies.regular,
    fontSize: 12.5
  },
  cap: {
    borderRadius: 5,
    flex: 1,
    height: 32,
    minWidth: 8
  },
  capBar: {
    flexDirection: 'row',
    gap: 3,
    paddingBottom: 8,
    paddingTop: 10
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: HAIRLINE,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden'
  },
  cardActive: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(42,39,34,0.05)',
    boxShadow: '0 16px 36px -18px rgba(42,39,34,0.30)'
  },
  cardBare: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    boxShadow: 'none'
  },
  cardBody: {
    borderTopColor: 'rgba(42,39,34,0.06)',
    borderTopWidth: 1,
    padding: 16,
    paddingTop: 12
  },
  cardDimmed: {
    filter: [{ blur: 3 }],
    opacity: 0.5
  },
  categoryIconBubble: {
    alignItems: 'center',
    borderRadius: 11,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24
  },
  dayChip: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: HAIRLINE,
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 54,
    paddingVertical: 8
  },
  dayChipDisabled: {
    opacity: 0.34
  },
  dayChipSelected: {
    backgroundColor: HERO,
    borderColor: HERO
  },
  dayChipToday: {
    backgroundColor: 'rgba(192,137,46,0.16)',
    borderColor: 'rgba(192,137,46,0.4)'
  },
  dayNumber: {
    color: INK,
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18
  },
  dayNumberSelected: {
    color: '#FFFDF7'
  },
  dayTextSelected: {
    color: 'rgba(255,253,247,0.55)'
  },
  dayWeekday: {
    color: '#A89E90',
    fontFamily: fontFamilies.monoBold,
    fontSize: 8,
    fontWeight: '700'
  },
  customTagField: {
    backgroundColor: 'rgba(42,39,34,0.035)',
    borderColor: 'rgba(42,39,34,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 10
  },
  customTagInput: {
    color: INK,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    minHeight: 24,
    padding: 0
  },
  customTagLabel: {
    color: '#B0A698',
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1
  },
  detailCaption: {
    color: '#C0B9AC',
    fontFamily: fontFamilies.monoBold,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1
  },
  detailCategory: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1
  },
  detailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 11
  },
  detailTick: {
    borderRadius: 99,
    height: 14,
    width: 5
  },
  errorText: {
    color: colors.danger,
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  footer: {
    backgroundColor: PAPER,
    paddingHorizontal: 16,
    paddingTop: 11
  },
  footerButton: {
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderRadius: 16,
    boxShadow: '0 14px 28px -10px rgba(192,137,46,0.6)',
    flexDirection: 'row',
    gap: 9,
    height: 54,
    justifyContent: 'center',
    width: '100%'
  },
  footerButtonDisabled: {
    backgroundColor: 'rgba(42,39,34,0.10)',
    boxShadow: 'none'
  },
  footerButtonText: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.extraBold,
    fontSize: 16,
    fontWeight: '800'
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    paddingHorizontal: 18,
    paddingTop: 0
  },
  headerSpacer: {
    height: 34,
    width: 34
  },
  headerTitleBlock: {
    alignItems: 'center'
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.06)',
    borderRadius: 11,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  key: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    boxShadow: '0 1px 2px rgba(42,39,34,0.06)',
    flexBasis: '31%',
    flexGrow: 1,
    height: 44,
    justifyContent: 'center'
  },
  keyDelete: {
    backgroundColor: 'rgba(42,39,34,0.04)',
    boxShadow: 'none'
  },
  keyDeleteText: {
    color: MUTED
  },
  keyPressed: {
    backgroundColor: 'rgba(42,39,34,0.10)'
  },
  keyText: {
    color: INK,
    fontFamily: fontFamilies.monoBold,
    fontSize: 19,
    fontWeight: '700'
  },
  keypad: {
    backgroundColor: PAPER,
    borderTopColor: 'rgba(42,39,34,0.07)',
    borderTopWidth: 1,
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 9
  },
  keypadTarget: {
    color: '#A89E90',
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
    paddingBottom: 8,
    textAlign: 'center'
  },
  keyingCue: {
    color: ACCENT,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginLeft: 'auto',
    opacity: 0
  },
  keyingCueActive: {
    opacity: 1
  },
  keys: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  memberAmount: {
    color: INK,
    flex: 1,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 28
  },
  memberAmountRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 1,
    marginTop: 8
  },
  memberCard: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(42,39,34,0.10)',
    borderRadius: 15,
    borderWidth: 1.5,
    flex: 1,
    minWidth: 0,
    padding: 13,
    paddingTop: 12
  },
  memberCardFocused: {
    borderColor: ACCENT,
    boxShadow: '0 8px 18px -8px rgba(192,137,46,0.55)'
  },
  memberCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  memberCardZero: {
    backgroundColor: 'rgba(42,39,34,0.035)',
    borderColor: 'transparent'
  },
  memberCards: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 13
  },
  memberCardsCompact: {
    flexDirection: 'column'
  },
  memberDot: {
    borderRadius: 3,
    height: 9,
    width: 9
  },
  memberName: {
    color: colors.muted,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 12.5,
    fontWeight: '700'
  },
  memberNameFull: {
    color: '#FFFDF7'
  },
  memberTag: {
    color: '#B9AF9F',
    fontFamily: fontFamilies.semiBold,
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 6
  },
  memberTagFull: {
    color: 'rgba(255,253,247,0.82)'
  },
  memberTextFull: {
    color: '#FFFDF7'
  },
  memberTextZero: {
    color: '#C2B9AB'
  },
  memberYen: {
    color: MUTED,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700'
  },
  page: {
    backgroundColor: PAPER,
    flex: 1
  },
  pressed: {
    opacity: 0.72
  },
  progressDot: {
    backgroundColor: 'rgba(42,39,34,0.16)',
    borderRadius: 3,
    height: 5,
    width: 5
  },
  progressRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 7
  },
  readoutDot: {
    borderRadius: 3,
    height: 9,
    width: 9
  },
  readoutMember: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    maxWidth: '48%',
    minWidth: 0
  },
  readoutName: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700'
  },
  readoutPct: {
    color: INK,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 12,
    fontWeight: '800'
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 50,
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  rowLabel: {
    color: MUTED,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.5
  },
  rowLabelActive: {
    color: ACCENT
  },
  rowLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11
  },
  rowPressed: {
    backgroundColor: 'rgba(42,39,34,0.02)'
  },
  rowRight: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 8,
    justifyContent: 'flex-end',
    minWidth: 0
  },
  rowValue: {
    color: INK,
    flexShrink: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 14.5,
    fontWeight: '700'
  },
  sideBar: {
    backgroundColor: '#D8CEBF',
    borderRadius: 99,
    height: 13,
    width: 5
  },
  sideBarActive: {
    backgroundColor: ACCENT,
    height: 20
  },
  splitReadout: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9
  },
  splitScale: {
    marginTop: 6,
    paddingHorizontal: 1
  },
  splitScaleLabel: {
    color: '#B0A698',
    flex: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    textAlign: 'center'
  },
  splitScaleLabels: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -11,
    marginTop: 2
  },
  splitScaleTick: {
    backgroundColor: 'rgba(42,39,34,0.18)',
    borderRadius: 1,
    height: 5,
    width: 1
  },
  splitScaleTickMajor: {
    backgroundColor: 'rgba(42,39,34,0.34)',
    height: 11,
    width: 1.5
  },
  splitScaleTicks: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 11
  },
  stack: {
    alignSelf: 'center',
    gap: 9,
    maxWidth: 480,
    paddingHorizontal: 16,
    paddingTop: 2,
    width: '100%'
  },
  stackCompact: {
    paddingHorizontal: 12
  },
  tagChip: {
    alignItems: 'center',
    borderColor: 'rgba(42,39,34,0.16)',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: 15,
    paddingVertical: 8
  },
  tagText: {
    color: '#7A7064',
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    fontWeight: '600'
  },
  tagTextSelected: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bold,
    fontWeight: '700'
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  titleKicker: {
    color: INK,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1.1,
    lineHeight: 20
  },
  weekGrid: {
    flexDirection: 'row',
    gap: 5
  },
  weekHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11
  },
  weekLabel: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    minWidth: 62,
    textAlign: 'center'
  },
  weekNav: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  weekNavButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.05)',
    borderRadius: 8,
    height: 26,
    justifyContent: 'center',
    width: 26
  },
  weekNavButtonDisabled: {
    opacity: 0.45
  },
  wheel: {
    flex: 1,
    height: 230,
    overflow: 'hidden',
    position: 'relative'
  },
  wheelBand: {
    backgroundColor: 'rgba(42,39,34,0.05)',
    borderRadius: 12,
    height: 46,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 92
  },
  wheelFade: {
    height: WHEEL_CENTER_INSET,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 2
  },
  wheelFadeBottom: {
    backgroundColor: 'rgba(239,233,223,0.90)',
    bottom: 0,
    opacity: 0.8
  },
  wheelFadeTop: {
    backgroundColor: 'rgba(239,233,223,0.90)',
    opacity: 0.8,
    top: 0
  },
  wheelLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    width: 116
  },
  wheelOption: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    height: 46,
    paddingLeft: 12,
    paddingRight: 8
  },
  wheelOptionText: {
    color: '#8A8073',
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    fontWeight: '600'
  },
  wheelScrollContent: {
    paddingBottom: WHEEL_CENTER_INSET,
    paddingTop: WHEEL_CENTER_INSET
  },
  wheelScroller: {
    flex: 1
  },
  wheelWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8
  }
});
