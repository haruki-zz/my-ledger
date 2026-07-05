import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import {
  AndroidKeyboardDoneButton,
  KEYBOARD_DONE_ACCESSORY_ID
} from '@/src/components/KeyboardDoneAccessory';
import { KeyboardAwareScrollView } from '@/src/components/KeyboardAwareScrollView';
import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { BentoCard, ToggleSwitch } from '@/src/components/ui';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { PRIMARY_CATEGORIES, categoryColor, categoryIconName, categoryLabel, subcategoryPresets } from '@/src/lib/categorySystem';
import { tintFromAccent } from '@/src/lib/color';
import { DEFAULT_PARTNER_COLOR, DEFAULT_USER_COLOR } from '@/src/lib/entityColors';
import { displayName, formatYen } from '@/src/lib/format';
import { runAfterKeyboardDismiss } from '@/src/lib/keyboard';
import {
  deleteRecurringExpenseRule,
  deleteRecurringGeneratedExpense,
  generateRecurringExpenses,
  getErrorMessage,
  getLedgerMembers,
  getRecurringExpenseRules,
  saveRecurringExpenseRule
} from '@/src/lib/ledger';
import { subscribeToLedgerData } from '@/src/lib/localEvents';
import { currentMonthStartDate, dateStringToMonthKey, isValidMonthKey, monthKeyToStartDate } from '@/src/lib/recurring';
import type { ExpenseOwnership, LedgerMemberProfile, RecurringExpenseRule } from '@/src/types/database';

type Draft = {
  id: string | null;
  name: string;
  categoryId: string;
  subcategory: string;
  amount: string;
  paidBy: string;
  ownership: ExpenseOwnership;
  splitAmountA: string;
  splitAmountB: string;
  generateDay: string;
  startMonth: string;
  endMonth: string;
  isActive: boolean;
};

type LoadMode = 'background' | 'initial' | 'refresh';

const MEMBER_COLORS = [DEFAULT_USER_COLOR, DEFAULT_PARTNER_COLOR] as const;
const RULE_NOT_FOUND_MESSAGE = 'Fixed expense rule was not found';
const SHEET_DISMISS_DRAG_DISTANCE = 70;
const SHEET_DISMISS_DRAG_VELOCITY = 0.85;

function sanitizeWholeNumber(value: string) {
  return value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
}

function parsePositiveInteger(value: string) {
  const parsed = Number(sanitizeWholeNumber(value.trim()));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value: string) {
  const sanitized = sanitizeWholeNumber(value.trim());
  if (!sanitized) {
    return null;
  }

  const parsed = Number(sanitized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function formatNumberInput(value: string) {
  if (!value) {
    return '';
  }

  return new Intl.NumberFormat('en-US').format(Number(value));
}

function formatYenInput(value: string) {
  return value ? `¥ ${formatNumberInput(value)}` : '¥ ';
}

function parseRatio(value: string) {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function splitAmountsFromRatio(amountYen: number, ratioA: number) {
  const splitAmountA = Math.round((amountYen * ratioA) / 100);
  return [splitAmountA, amountYen - splitAmountA] as const;
}

function evenSplitAmounts(amountYen: number) {
  if (amountYen <= 0) {
    return ['', ''] as const;
  }

  const splitAmountA = Math.round(amountYen / 2);
  return [String(splitAmountA), String(amountYen - splitAmountA)] as const;
}

function isEvenSplit(amountYen: number, splitAmountA: string, splitAmountB: string) {
  if (amountYen <= 0) {
    return !splitAmountA && !splitAmountB;
  }

  const [evenA, evenB] = evenSplitAmounts(amountYen);
  return splitAmountA === evenA && splitAmountB === evenB;
}

function ratioFromSplitAmount(amountYen: number, splitAmountA: number) {
  if (amountYen <= 0) {
    return 0;
  }

  return Math.round((splitAmountA / amountYen) * 100);
}

const GENERATE_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);

function emptyDraft(members: LedgerMemberProfile[]): Draft {
  const currentMonth = dateStringToMonthKey(currentMonthStartDate());
  const ownership: ExpenseOwnership = members.length === 2 ? 'shared' : 'personal';
  return {
    id: null,
    name: '',
    categoryId: 'housing',
    subcategory: 'Rent',
    amount: '',
    paidBy: members[0]?.user_id || '',
    ownership,
    splitAmountA: '',
    splitAmountB: '',
    generateDay: '1',
    startMonth: currentMonth,
    endMonth: '',
    isActive: true
  };
}

function draftFromRule(rule: RecurringExpenseRule): Draft {
  const ratioA = parseRatio(String(rule.split_ratio_a)) ?? 50;
  const [fallbackSplitA, fallbackSplitB] = splitAmountsFromRatio(rule.amount_yen, ratioA);
  const splitAmountA = rule.split_amount_a ?? fallbackSplitA;
  const splitAmountB = rule.split_amount_b ?? fallbackSplitB;

  return {
    id: rule.id,
    name: rule.name,
    categoryId: rule.category_id,
    subcategory: rule.subcategory || '',
    amount: String(rule.amount_yen),
    paidBy: rule.paid_by,
    ownership: rule.ownership || 'shared',
    splitAmountA: rule.ownership === 'shared' ? String(splitAmountA) : '',
    splitAmountB: rule.ownership === 'shared' ? String(splitAmountB) : '',
    generateDay: String(rule.generate_day),
    startMonth: dateStringToMonthKey(rule.start_month),
    endMonth: rule.end_month ? dateStringToMonthKey(rule.end_month) : '',
    isActive: rule.is_active
  };
}

export default function RecurringExpenseRulesScreen() {
  const params = useLocalSearchParams<{ mode?: string | string[]; ruleId?: string | string[] }>();
  const { error: ledgerError, ledger, loading: ledgerLoading, reloadLedger } = useRequiredLedger();
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [rules, setRules] = useState<RecurringExpenseRule[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft([]));
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [nativeGenerateDatePickerOpen, setNativeGenerateDatePickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingRuleIds, setTogglingRuleIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [generateDatePickerDragY] = useState(() => new Animated.Value(0));
  const initializedRuleIdRef = useRef<string | null>(null);

  const ledgerId = ledger?.id;
  const ruleIdParam = Array.isArray(params.ruleId) ? params.ruleId[0] : params.ruleId;
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const editingRuleId = ruleIdParam || null;
  const addingRule = modeParam === 'add';
  const showingList = !editingRuleId && !addingRule;
  const hasTwoMembers = members.length === 2;
  const orphanSharedRule = Boolean(editingRuleId && draft.id && draft.ownership === 'shared' && !hasTwoMembers);
  const formLocked = orphanSharedRule;

  const load = useCallback(async (currentLedger = ledger, mode: LoadMode = 'background') => {
    if (!currentLedger) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError(null);
    if (mode === 'initial') {
      setLoading(true);
    }
    if (mode === 'refresh') {
      setRefreshing(true);
    }
    try {
      const [nextMembers, nextRules] = await Promise.all([
        getLedgerMembers(currentLedger.id),
        getRecurringExpenseRules(currentLedger.id, { refreshFirst: mode !== 'background' })
      ]);
      setMembers(nextMembers);
      setRules(nextRules);
      if (editingRuleId) {
        const selectedRule = nextRules.find((rule) => rule.id === editingRuleId);
        if (!selectedRule) {
          setError(RULE_NOT_FOUND_MESSAGE);
          setDraft((current) => (current.paidBy ? current : emptyDraft(nextMembers)));
          return;
        }
        if (initializedRuleIdRef.current !== editingRuleId) {
          setDraft(draftFromRule(selectedRule));
          initializedRuleIdRef.current = editingRuleId;
        }
        return;
      }

      initializedRuleIdRef.current = null;
      if (addingRule) {
        setDraft((current) => (current.paidBy ? current : emptyDraft(nextMembers)));
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      }
      if (mode === 'refresh') {
        setRefreshing(false);
      }
    }
  }, [addingRule, editingRuleId, ledger]);

  useEffect(() => {
    setCategoryMenuOpen(false);
    setNativeGenerateDatePickerOpen(false);
    if (editingRuleId) {
      if (initializedRuleIdRef.current && initializedRuleIdRef.current !== editingRuleId) {
        initializedRuleIdRef.current = null;
      }
      return;
    }

    if (!addingRule) {
      return;
    }

    const previousEditingRuleId = initializedRuleIdRef.current;
    initializedRuleIdRef.current = null;
    setDraft((current) => (
      !current.paidBy || (previousEditingRuleId && current.id === previousEditingRuleId)
        ? emptyDraft(members)
        : current
    ));
  }, [addingRule, editingRuleId, members]);

  useEffect(() => {
    void load(undefined, 'initial');
  }, [load]);

  useEffect(() => {
    if (!ledgerId) {
      return undefined;
    }

    return subscribeToLedgerData(ledgerId, () => {
      void load(undefined, 'background');
    });
  }, [ledgerId, load]);

  const memberNames = useMemo(() => {
    const firstName = displayName(members[0]?.profile.display_name || 'Member A');
    const secondName = displayName(members[1]?.profile.display_name || 'Member B');
    return [firstName, secondName] as const;
  }, [members]);

  const amountDisplayValue = formatYenInput(draft.amount);

  const currentSubcategoryPresets = useMemo(() => subcategoryPresets(draft.categoryId), [draft.categoryId]);
  const closeNativeGenerateDatePicker = useCallback((preserveDrag = false) => {
    if (!preserveDrag) {
      generateDatePickerDragY.setValue(0);
    }
    setNativeGenerateDatePickerOpen(false);
  }, [generateDatePickerDragY]);
  const dismissNativeGenerateDatePicker = useCallback(() => {
    closeNativeGenerateDatePicker();
  }, [closeNativeGenerateDatePicker]);
  const generateDatePickerBackdropOpacity = useMemo(() => (
    generateDatePickerDragY.interpolate({
      extrapolate: 'clamp',
      inputRange: [0, 280],
      outputRange: [1, 0]
    })
  ), [generateDatePickerDragY]);
  const generateDatePickerHandlePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gestureState) => (
      gestureState.dy > 4 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
    ),
    onMoveShouldSetPanResponder: (_, gestureState) => (
      gestureState.dy > 4 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
    ),
    onPanResponderGrant: () => {
      generateDatePickerDragY.stopAnimation();
      generateDatePickerDragY.setValue(0);
    },
    onPanResponderMove: (_, gestureState) => {
      generateDatePickerDragY.setValue(Math.max(0, gestureState.dy));
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > SHEET_DISMISS_DRAG_DISTANCE || (gestureState.dy > 24 && gestureState.vy > SHEET_DISMISS_DRAG_VELOCITY)) {
        closeNativeGenerateDatePicker(true);
        return;
      }

      Animated.spring(generateDatePickerDragY, {
        damping: 18,
        mass: 0.7,
        stiffness: 180,
        toValue: 0,
        useNativeDriver: true
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(generateDatePickerDragY, {
        damping: 18,
        mass: 0.7,
        stiffness: 180,
        toValue: 0,
        useNativeDriver: true
      }).start();
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true
  }), [closeNativeGenerateDatePicker, generateDatePickerDragY]);

  useEffect(() => {
    if (nativeGenerateDatePickerOpen) {
      generateDatePickerDragY.setValue(0);
    }
  }, [generateDatePickerDragY, nativeGenerateDatePickerOpen]);

  async function refresh() {
    const nextLedger = await reloadLedger();
    await load(nextLedger || ledger, 'refresh');
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleDraftActive() {
    if (saving) {
      return;
    }
    if (orphanSharedRule && !draft.isActive) {
      return;
    }

    const nextDraft = { ...draft, isActive: !draft.isActive };
    updateDraft({ isActive: nextDraft.isActive });
    if (nextDraft.id) {
      void saveRule(nextDraft);
    }
  }

  function validateDraft(nextDraft: Draft = draft) {
    if (!ledger) {
      return 'No active ledger';
    }
    if (nextDraft.ownership === 'shared' && members.length !== 2 && !(orphanSharedRule && !nextDraft.isActive)) {
      return 'Fixed monthly expenses require two ledger members';
    }
    if (!nextDraft.name.trim()) {
      return 'Enter a rule name';
    }
    const amountYen = parsePositiveInteger(nextDraft.amount);
    if (!amountYen) {
      return 'Enter an amount greater than 0';
    }
    if (!nextDraft.paidBy || !members.some((member) => member.user_id === nextDraft.paidBy)) {
      return 'Choose a payer from this ledger';
    }
    if (nextDraft.ownership === 'shared') {
      const splitAmountA = parseNonNegativeInteger(nextDraft.splitAmountA);
      const splitAmountB = parseNonNegativeInteger(nextDraft.splitAmountB);
      if (splitAmountA === null || splitAmountB === null) {
        return 'Split amounts must be whole yen values';
      }
      if (splitAmountA + splitAmountB !== amountYen) {
        return 'Split amounts must add up to the total amount';
      }
    }
    const generateDay = parsePositiveInteger(nextDraft.generateDay);
    if (!generateDay || generateDay > 31) {
      return 'Generate day must be between 1 and 31';
    }
    if (!isValidMonthKey(nextDraft.startMonth)) {
      return 'Start month must use YYYY-MM';
    }
    if (nextDraft.endMonth && !isValidMonthKey(nextDraft.endMonth)) {
      return 'End month must use YYYY-MM';
    }
    if (nextDraft.endMonth && nextDraft.endMonth < nextDraft.startMonth) {
      return 'End month cannot be before start month';
    }
    return null;
  }

  async function saveRule(nextDraft = draft) {
    if (!ledger) {
      return;
    }
    const validationMessage = validateDraft(nextDraft);
    if (validationMessage) {
      Alert.alert('Save Failed', validationMessage);
      return;
    }

    const amountYen = parsePositiveInteger(nextDraft.amount);
    const splitAmountA = nextDraft.ownership === 'shared' ? parseNonNegativeInteger(nextDraft.splitAmountA) : null;
    const splitAmountB = nextDraft.ownership === 'shared' ? parseNonNegativeInteger(nextDraft.splitAmountB) : null;
    const generateDay = parsePositiveInteger(nextDraft.generateDay);
    if (!amountYen || !generateDay) {
      return;
    }
    if (nextDraft.ownership === 'shared' && (splitAmountA === null || splitAmountB === null || splitAmountA + splitAmountB !== amountYen)) {
      return;
    }
    const ratioA = nextDraft.ownership === 'shared' && splitAmountA !== null
      ? ratioFromSplitAmount(amountYen, splitAmountA)
      : 100;
    const ratioB = 100 - ratioA;

    setSaving(true);
    try {
      await saveRecurringExpenseRule({
        id: nextDraft.id,
        ledgerId: ledger.id,
        name: nextDraft.name,
        categoryId: nextDraft.categoryId,
        subcategory: nextDraft.subcategory.trim() || null,
        amountYen,
        paidBy: nextDraft.paidBy,
        ownership: nextDraft.ownership,
        splitRatioA: ratioA,
        splitRatioB: ratioB,
        splitAmountA,
        splitAmountB,
        generateDay,
        startMonth: monthKeyToStartDate(nextDraft.startMonth),
        endMonth: nextDraft.endMonth ? monthKeyToStartDate(nextDraft.endMonth) : null,
        timezone: 'Asia/Tokyo',
        isActive: nextDraft.isActive
      });
      if (nextDraft.isActive) {
        await generateRecurringExpenses(ledger.id, currentMonthStartDate());
      } else if (nextDraft.id) {
        await deleteRecurringGeneratedExpense(ledger.id, nextDraft.id);
      }
      await load(ledger, 'background');
      if (!editingRuleId) {
        router.back();
      }
    } catch (saveError) {
      Alert.alert('Save Failed', getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteRule() {
    if (!ledger || !draft.id || deleting || saving) {
      return;
    }

    Alert.alert('Delete Fixed Expense', 'This fixed monthly expense will be removed. The generated item for the current month will also be deleted if it exists.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteRule();
        }
      }
    ]);
  }

  async function deleteRule() {
    if (!ledger || !draft.id) {
      return;
    }

    setDeleting(true);
    try {
      await deleteRecurringGeneratedExpense(ledger.id, draft.id);
      await deleteRecurringExpenseRule(ledger.id, draft.id);
      router.back();
    } catch (deleteError) {
      Alert.alert('Delete Failed', getErrorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  async function toggleExistingRule(rule: RecurringExpenseRule) {
    if (!ledger || togglingRuleIds.has(rule.id)) {
      return;
    }

    const nextIsActive = !rule.is_active;
    const previousRules = rules;
    setTogglingRuleIds((current) => new Set(current).add(rule.id));
    setRules((current) => current.map((item) => (
      item.id === rule.id ? { ...item, is_active: nextIsActive } : item
    )));

    try {
      await saveRecurringExpenseRule({
        id: rule.id,
        ledgerId: rule.ledger_id || ledger.id,
        name: rule.name,
        categoryId: rule.category_id,
        subcategory: rule.subcategory,
        amountYen: rule.amount_yen,
        paidBy: rule.paid_by,
        ownership: rule.ownership || 'shared',
        splitRatioA: rule.split_ratio_a,
        splitRatioB: rule.split_ratio_b,
        splitAmountA: rule.split_amount_a,
        splitAmountB: rule.split_amount_b,
        generateDay: rule.generate_day,
        startMonth: rule.start_month,
        endMonth: rule.end_month,
        timezone: rule.timezone,
        isActive: nextIsActive
      });
      if (nextIsActive) {
        await generateRecurringExpenses(rule.ledger_id || ledger.id, currentMonthStartDate());
      } else {
        await deleteRecurringGeneratedExpense(rule.ledger_id || ledger.id, rule.id);
      }
      await load(ledger, 'background');
    } catch (toggleError) {
      setRules(previousRules);
      Alert.alert('Update Failed', getErrorMessage(toggleError));
    } finally {
      setTogglingRuleIds((current) => {
        const next = new Set(current);
        next.delete(rule.id);
        return next;
      });
    }
  }

  if ((ledgerLoading || loading) && (!ledger || (editingRuleId && draft.id !== editingRuleId))) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (editingRuleId && error === RULE_NOT_FOUND_MESSAGE && draft.id !== editingRuleId) {
    return (
      <View style={[styles.center, localStyles.notFoundState]}>
        <Ionicons color={colors.muted} name="alert-circle-outline" size={30} />
        <Text style={styles.error}>{RULE_NOT_FOUND_MESSAGE}</Text>
        <Pressable onPress={() => router.back()} style={[styles.button, styles.secondaryButton, localStyles.compactButton]}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (showingList) {
    const activeRules = rules.filter((rule) => rule.is_active);
    const pausedCount = rules.length - activeRules.length;
    const activeTotal = activeRules.reduce((sum, rule) => sum + rule.amount_yen, 0);
    const memberNameById = new Map(members.map((member) => [member.user_id, displayName(member.profile.display_name)]));

    return (
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        style={styles.page}
        contentContainerStyle={localStyles.listContent}
      >
        {ledgerError || error ? <Text selectable style={styles.error}>{ledgerError || error}</Text> : null}
        <Text style={localStyles.ledgerSubtitle}>{ledger?.name || 'Current ledger'}</Text>

        <View style={localStyles.fixedSummaryCard}>
          <View>
            <Text style={localStyles.fixedSummaryLabel}>ACTIVE MONTHLY TOTAL</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.fixedSummaryAmount}>{formatYen(activeTotal)}</Text>
          </View>
          <View style={localStyles.fixedSummaryPills}>
            <CountPill color={colors.primaryDark} label={`${activeRules.length} active`} />
            <CountPill color={pausedCount > 0 ? colors.muted : colors.primaryDark} label={`${pausedCount} paused`} />
          </View>
        </View>

        <View style={localStyles.ruleListCard}>
          {rules.length > 0 ? rules.map((rule, index) => (
            <FixedExpenseListRow
              key={rule.id}
              memberName={memberNameById.get(rule.paid_by) || 'Unknown payer'}
              onOpen={() => router.push({ pathname: '/settings/recurring', params: { ruleId: rule.id } })}
              onToggle={() => {
                void toggleExistingRule(rule);
              }}
              rule={rule}
              showDivider={index > 0}
              toggling={togglingRuleIds.has(rule.id)}
            />
          )) : (
            <View style={localStyles.emptyRules}>
              <Ionicons color={colors.muted} name="repeat-outline" size={24} />
              <Text style={localStyles.emptyRulesTitle}>No fixed expenses</Text>
              <Text style={localStyles.emptyRulesText}>Add rent, subscriptions, utilities, or other monthly rules.</Text>
            </View>
          )}
        </View>

        <Pressable
          onPress={() => router.push({ pathname: '/settings/recurring', params: { mode: 'add' } })}
          style={({ pressed }) => [localStyles.addRuleButton, pressed && localStyles.pressed]}
        >
          <Ionicons color="#FFFFFF" name="add" size={18} />
          <Text style={localStyles.addRuleText}>Add fixed expense</Text>
        </Pressable>

        {loading ? <ActivityIndicator /> : null}
      </ScrollView>
    );
  }

  function clearAmount() {
    updateDraft({ amount: '', splitAmountA: '', splitAmountB: '' });
  }

  function updateAmount(value: string) {
    if (formLocked) {
      return;
    }

    const nextAmount = sanitizeWholeNumber(value);
    const currentAmountYen = parsePositiveInteger(draft.amount) || 0;
    const nextAmountYen = parsePositiveInteger(nextAmount) || 0;
    if (draft.ownership !== 'shared' || !isEvenSplit(currentAmountYen, draft.splitAmountA, draft.splitAmountB)) {
      updateDraft({ amount: nextAmount });
      return;
    }

    const [splitAmountA, splitAmountB] = evenSplitAmounts(nextAmountYen);
    updateDraft({ amount: nextAmount, splitAmountA, splitAmountB });
  }

  function selectOwnership(nextOwnership: ExpenseOwnership) {
    if (formLocked || (nextOwnership === 'shared' && !hasTwoMembers)) {
      return;
    }

    if (nextOwnership === 'personal') {
      updateDraft({
        ownership: nextOwnership,
        splitAmountA: '',
        splitAmountB: ''
      });
      return;
    }

    const amountYen = parsePositiveInteger(draft.amount) || 0;
    const [splitAmountA, splitAmountB] = evenSplitAmounts(amountYen);
    updateDraft({
      ownership: nextOwnership,
      splitAmountA: draft.splitAmountA || splitAmountA,
      splitAmountB: draft.splitAmountB || splitAmountB
    });
  }

  function selectGenerateDay(day: number) {
    if (formLocked) {
      return;
    }

    updateDraft({ generateDay: String(day) });
    closeNativeGenerateDatePicker();
  }

  const draftAmountYen = parsePositiveInteger(draft.amount) || 0;
  const selectedCategoryColor = categoryColor(draft.categoryId);
  const selectedCategoryIcon = categoryIconName(draft.categoryId);
  const selectedCategoryLabel = categoryLabel(draft.categoryId);
  const shareA = parseNonNegativeInteger(draft.splitAmountA) ?? 0;
  const shareB = parseNonNegativeInteger(draft.splitAmountB) ?? 0;
  const splitBalanceValid = draft.ownership === 'personal' || (shareA + shareB === draftAmountYen && draftAmountYen > 0);
  const splitEvenlySelected = isEvenSplit(draftAmountYen, draft.splitAmountA, draft.splitAmountB);

  function updateSharedAmount(memberIndex: 0 | 1, value: string) {
    if (formLocked) {
      return;
    }

    const amountYen = parsePositiveInteger(draft.amount);
    const sanitizedValue = sanitizeWholeNumber(value);
    if (!sanitizedValue) {
      updateDraft(memberIndex === 0 ? { splitAmountA: '' } : { splitAmountB: '' });
      return;
    }

    const shareYen = Number(sanitizedValue);
    if (!amountYen || !Number.isFinite(shareYen)) {
      updateDraft(memberIndex === 0 ? { splitAmountA: sanitizedValue } : { splitAmountB: sanitizedValue });
      return;
    }
    const clampedShare = Math.min(amountYen, Math.max(0, shareYen));
    if (memberIndex === 0) {
      updateDraft({ splitAmountA: String(clampedShare), splitAmountB: String(amountYen - clampedShare) });
      return;
    }

    updateDraft({ splitAmountA: String(amountYen - clampedShare), splitAmountB: String(clampedShare) });
  }

  function splitEvenly() {
    if (formLocked) {
      return;
    }

    const [splitAmountA, splitAmountB] = evenSplitAmounts(draftAmountYen);
    updateDraft({ splitAmountA, splitAmountB });
  }

  function clearSplit() {
    if (formLocked) {
      return;
    }

    updateDraft({ splitAmountA: '', splitAmountB: '' });
  }

  return (
    <KeyboardAwareScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      {ledgerError || error ? <Text style={styles.error}>{ledgerError || error}</Text> : null}
      <Text style={localStyles.ledgerSubtitle}>{ledger?.name || 'Current ledger'}</Text>
      {orphanSharedRule ? (
        <Text selectable style={styles.error}>
          This shared fixed expense needs two ledger members to edit. You can turn it off or delete it.
        </Text>
      ) : null}

      <BentoCard variant="form" style={localStyles.groupCard}>
        <GroupHead icon="pricetag-outline" label="What" />
        <View style={localStyles.fieldGroup}>
          <TextInput
            editable={!formLocked}
            inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
            onChangeText={(name) => updateDraft({ name })}
            placeholder="Name"
            placeholderTextColor={colors.subtle}
            style={localStyles.textInput}
            value={draft.name}
          />
          <View style={localStyles.amountCategoryRow}>
            <View style={localStyles.amountInputWrap}>
              <TextInput
                inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={updateAmount}
                placeholder="¥ 0"
                placeholderTextColor={colors.subtle}
                selection={{ start: amountDisplayValue.length, end: amountDisplayValue.length }}
                style={localStyles.amountInput}
                value={amountDisplayValue}
              />
              {draft.amount ? (
                <Pressable accessibilityLabel="Clear amount" onPress={clearAmount} style={localStyles.clearInlineButton}>
                  <Ionicons color={colors.muted} name="close" size={18} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              disabled={formLocked}
              onPress={() => runAfterKeyboardDismiss(() => setCategoryMenuOpen((current) => !current))}
              style={({ pressed }) => [localStyles.categoryTrigger, formLocked && localStyles.disabled, pressed && !formLocked && localStyles.pressed]}
            >
              <View style={localStyles.categorySelected}>
                <Ionicons color={selectedCategoryColor} name={selectedCategoryIcon} size={18} />
                <Text numberOfLines={1} style={localStyles.categoryText}>{selectedCategoryLabel}</Text>
              </View>
              <Ionicons color={colors.ink} name={categoryMenuOpen ? 'chevron-up' : 'chevron-down'} size={18} />
            </Pressable>
          </View>
          {categoryMenuOpen ? (
            <View style={localStyles.categoryMenu}>
              {PRIMARY_CATEGORIES.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => {
                    if (formLocked) {
                      return;
                    }
                    updateDraft({ categoryId: category.id, subcategory: '' });
                    setCategoryMenuOpen(false);
                  }}
                  style={({ pressed }) => [localStyles.categoryOption, pressed && localStyles.pressed]}
                >
                  <View style={[localStyles.optionIcon, { backgroundColor: tintFromAccent(category.color) }]}>
                    <Ionicons color={category.color} name={category.icon} size={16} />
                  </View>
                  <Text style={localStyles.categoryText}>{category.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
            <View style={localStyles.subcategoryRail}>
              {currentSubcategoryPresets.map((option) => {
                const selected = option === draft.subcategory.trim();
                return (
                  <Pressable
                    key={option}
                    disabled={formLocked}
                    onPress={() => updateDraft({ subcategory: selected ? '' : option })}
                    style={({ pressed }) => [
                      localStyles.subcategoryChip,
                      selected && localStyles.subcategoryChipActive,
                      pressed && localStyles.pressed
                    ]}
                  >
                    <Text style={[localStyles.subcategoryChipText, selected && localStyles.subcategoryChipTextActive]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <TextInput
            editable={!formLocked}
            inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
            onChangeText={(subcategory) => updateDraft({ subcategory })}
            placeholder="Optional tag"
            placeholderTextColor={colors.subtle}
            style={localStyles.textInput}
            value={draft.subcategory}
          />
        </View>
      </BentoCard>

      <BentoCard variant="form" style={localStyles.groupCard}>
        <GroupHead icon="disc-outline" label="When · charge day" />
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={localStyles.dayRail}>
          <View style={localStyles.dayRailTrack}>
            {GENERATE_DAY_OPTIONS.map((day) => {
              const selected = Number(draft.generateDay) === day;
              return (
                <Pressable
                  disabled={formLocked}
                  key={day}
                  onPress={() => selectGenerateDay(day)}
                  style={({ pressed }) => [
                    localStyles.dayRailItem,
                    selected && localStyles.dayRailItemActive,
                    pressed && localStyles.pressed
                  ]}
                >
                  <Text style={[localStyles.dayRailText, selected && localStyles.dayRailTextActive]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </BentoCard>

      <BentoCard variant="form" style={localStyles.groupCard}>
        <GroupHead icon="people-outline" label="Who" />
        {hasTwoMembers || draft.ownership === 'shared' ? (
          <View accessibilityLabel="Fixed expense ownership" style={localStyles.ownershipSelector}>
            {[
              { label: 'Personal', value: 'personal' as const },
              { label: 'Shared', value: 'shared' as const }
            ].map((option) => {
              const selected = option.value === draft.ownership;
              const disabled = formLocked || (option.value === 'shared' && !hasTwoMembers);
              return (
                <Pressable
                  disabled={disabled}
                  key={option.value}
                  onPress={() => selectOwnership(option.value)}
                  style={({ pressed }) => [
                    localStyles.ownershipOption,
                    selected && localStyles.ownershipOptionActive,
                    disabled && localStyles.disabled,
                    pressed && !disabled && localStyles.pressed
                  ]}
                >
                  <Text style={[localStyles.ownershipText, selected && localStyles.ownershipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={localStyles.fieldGroup}>
          <Text style={localStyles.fieldLabel}>{draft.ownership === 'personal' ? 'Belongs to' : 'Paid by'}</Text>
          <View style={localStyles.memberOptionRow}>
            {members.slice(0, 2).map((member, index) => {
              const selected = member.user_id === draft.paidBy;
              const accent = MEMBER_COLORS[index] || DEFAULT_PARTNER_COLOR;
              return (
                <MemberOption
                  accent={accent}
                  disabled={formLocked}
                  key={member.user_id}
                  label={displayName(member.profile.display_name)}
                  onPress={() => updateDraft({ paidBy: member.user_id })}
                  selected={selected}
                />
              );
            })}
          </View>
        </View>

        {draft.ownership === 'shared' ? (
          <View style={localStyles.fieldGroup}>
            <View style={localStyles.shareHeaderRow}>
              <Text style={localStyles.fieldLabel}>Each person&apos;s share</Text>
              <View style={localStyles.splitQuickRow}>
                <Pressable disabled={formLocked} onPress={splitEvenly} style={[localStyles.splitQuick, splitEvenlySelected && localStyles.splitQuickActive, formLocked && localStyles.disabled]}>
                  <Ionicons color={splitEvenlySelected ? colors.secondary : colors.muted} name="checkmark" size={13} />
                  <Text style={[localStyles.splitQuickText, splitEvenlySelected && localStyles.splitQuickTextActive]}>Split evenly</Text>
                </Pressable>
                <Pressable disabled={formLocked} onPress={clearSplit} style={[localStyles.splitQuick, formLocked && localStyles.disabled]}>
                  <Text style={localStyles.splitQuickText}>Clear</Text>
                </Pressable>
              </View>
            </View>
            <ShareAmountRow
              accent={MEMBER_COLORS[0]}
              label={memberNames[0]}
              onChange={(value) => updateSharedAmount(0, value)}
              disabled={formLocked}
              value={draft.splitAmountA}
            />
            <ShareAmountRow
              accent={MEMBER_COLORS[1]}
              label={memberNames[1]}
              onChange={(value) => updateSharedAmount(1, value)}
              disabled={formLocked}
              value={draft.splitAmountB}
            />
            <View style={localStyles.divider} />
            <View style={localStyles.balanceRow}>
              <View style={localStyles.balanceTextRow}>
                <Ionicons
                  color={splitBalanceValid ? colors.primaryDark : colors.danger}
                  name={splitBalanceValid ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  size={16}
                />
                <Text style={[localStyles.balanceText, !splitBalanceValid && localStyles.balanceTextError]}>
                  {splitBalanceValid ? 'Adds up to total' : 'Check split total'}
                </Text>
              </View>
              <Text style={localStyles.balanceAmount}>{draftAmountYen > 0 ? formatYen(draftAmountYen) : '¥0'}</Text>
            </View>
          </View>
        ) : null}
      </BentoCard>

      <View style={localStyles.activeSaveArea}>
        <Pressable
          disabled={orphanSharedRule && !draft.isActive}
          onPress={toggleDraftActive}
          style={({ pressed }) => [
            localStyles.activeRow,
            orphanSharedRule && !draft.isActive && localStyles.disabled,
            pressed && !(orphanSharedRule && !draft.isActive) && localStyles.pressed
          ]}
        >
          <Text style={localStyles.fieldLabel}>Active immediately</Text>
          <ToggleSwitch active={draft.isActive} />
        </Pressable>

        <Pressable disabled={saving || formLocked} onPress={() => void saveRule()} style={({ pressed }) => [localStyles.saveButton, (saving || formLocked) && localStyles.disabled, pressed && !saving && !formLocked && localStyles.pressed]}>
          <Ionicons color="#FFFFFF" name="checkmark" size={18} />
          <Text style={localStyles.saveButtonText}>{saving ? 'Saving...' : 'Save Rule'}</Text>
        </Pressable>

        {draft.id ? (
          <Pressable
            disabled={deleting || saving}
            onPress={confirmDeleteRule}
            style={({ pressed }) => [
              styles.button,
              styles.dangerButton,
              localStyles.deleteButton,
              (deleting || saving) && localStyles.disabled,
              pressed && !deleting && !saving && localStyles.pressed
            ]}
          >
            <Ionicons color="#FFFFFF" name="trash-outline" size={18} />
            <Text style={styles.buttonText}>{deleting ? 'Deleting...' : 'Delete Fixed Expense'}</Text>
          </Pressable>
        ) : null}
      </View>

      {Platform.OS !== 'web' ? (
        <Modal
          animationType="fade"
          onRequestClose={dismissNativeGenerateDatePicker}
          presentationStyle="overFullScreen"
          transparent
          visible={nativeGenerateDatePickerOpen}
        >
          <View style={localStyles.modalOverlay}>
            <Animated.View
              pointerEvents="none"
              style={[localStyles.modalBackdropVisual, { opacity: generateDatePickerBackdropOpacity }]}
            />
            <Pressable onPress={dismissNativeGenerateDatePicker} style={localStyles.modalBackdrop} />
            <Animated.View style={[localStyles.modalSheet, { transform: [{ translateY: generateDatePickerDragY }] }]}>
              <View
                accessible
                accessibilityLabel="Drag down to close bill date"
                style={localStyles.modalGrabberHitArea}
                {...generateDatePickerHandlePanResponder.panHandlers}
              >
                <View style={localStyles.modalGrabber} />
              </View>
              <View style={localStyles.modalHeader}>
                <Text style={styles.h2}>Bill Date</Text>
                <Pressable
                  onPress={dismissNativeGenerateDatePicker}
                  style={[styles.button, styles.secondaryButton, localStyles.compactButton]}
                >
                  <Text style={[styles.buttonText, styles.secondaryButtonText]}>Done</Text>
                </Pressable>
              </View>
              <Text style={localStyles.helpText}>Select the day of month to generate this expense.</Text>
              <View style={localStyles.dayGrid}>
                {GENERATE_DAY_OPTIONS.map((day) => {
                  const selected = Number(draft.generateDay) === day;
                  return (
                    <Pressable
                      key={day}
                      onPress={() => selectGenerateDay(day)}
                      style={({ pressed }) => [
                        localStyles.dayOption,
                        selected && localStyles.dayOptionActive,
                        pressed && localStyles.pressed
                      ]}
                    >
                      <Text style={[localStyles.dayOptionText, selected && localStyles.dayOptionTextActive]}>
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          </View>
        </Modal>
      ) : null}

      <AndroidKeyboardDoneButton />
    </KeyboardAwareScrollView>
  );
}

function FixedExpenseListRow({
  memberName,
  onOpen,
  onToggle,
  rule,
  showDivider,
  toggling
}: {
  memberName: string;
  onOpen: () => void;
  onToggle: () => void;
  rule: RecurringExpenseRule;
  showDivider: boolean;
  toggling: boolean;
}) {
  const accent = categoryColor(rule.category_id);
  return (
    <View style={!rule.is_active && localStyles.rulePaused}>
      {showDivider ? <View style={localStyles.listInsetDivider} /> : null}
      <View style={localStyles.ruleListRow}>
        <Pressable onPress={onOpen} style={({ pressed }) => [localStyles.ruleListMain, pressed && localStyles.pressed]}>
          <View style={[localStyles.ruleIcon, { backgroundColor: tintFromAccent(accent) }]}>
            <Ionicons color={accent} name={categoryIconName(rule.category_id)} size={18} />
          </View>
          <View style={localStyles.ruleListBody}>
            <View style={localStyles.ruleListTitleRow}>
              <Text numberOfLines={1} style={localStyles.ruleListTitle}>{rule.name}</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.ruleListAmount}>{formatYen(rule.amount_yen)}</Text>
            </View>
            <View style={localStyles.ruleMetaLine}>
              <View style={[localStyles.ruleDot, { backgroundColor: accent }]} />
              <Text numberOfLines={1} style={localStyles.ruleMetaText}>
                {categoryLabel(rule.category_id)} / Day {rule.generate_day} / {memberName}
              </Text>
            </View>
          </View>
        </Pressable>
        {toggling ? (
          <ActivityIndicator size="small" />
        ) : (
          <ToggleSwitch
            accessibilityLabel={rule.is_active ? 'Pause fixed expense' : 'Activate fixed expense'}
            active={rule.is_active}
            onPress={onToggle}
          />
        )}
      </View>
    </View>
  );
}

function CountPill({ color, label }: { color: string; label: string }) {
  return (
    <View style={localStyles.countPill}>
      <View style={[localStyles.countPillDot, { backgroundColor: color }]} />
      <Text style={localStyles.countPillText}>{label}</Text>
    </View>
  );
}

function GroupHead({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={localStyles.groupHead}>
      <View style={localStyles.groupHeadIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={16} />
      </View>
      <Text style={localStyles.groupHeadLabel}>{label}</Text>
    </View>
  );
}

function MemberOption({
  accent,
  disabled,
  label,
  onPress,
  selected
}: {
  accent: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.memberOption,
        selected && { backgroundColor: accent, borderColor: accent },
        disabled && localStyles.disabled,
        pressed && !disabled && localStyles.pressed
      ]}
    >
      <View style={[
        localStyles.memberAvatar,
        selected
          ? { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(255,255,255,0.72)' }
          : { borderColor: accent }
      ]}>
        <Text style={[localStyles.memberAvatarText, { color: accent }]}>{initialFor(label)}</Text>
      </View>
      <Text numberOfLines={1} style={[localStyles.memberOptionText, selected && localStyles.memberOptionTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ShareAmountRow({
  accent,
  disabled,
  label,
  onChange,
  value
}: {
  accent: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const displayValue = formatYenInput(value);

  return (
    <View style={localStyles.shareAmountRow}>
      <View style={[localStyles.shareAvatar, { borderColor: accent }]}>
        <Text style={[localStyles.shareAvatarText, { color: accent }]}>{initialFor(label)}</Text>
      </View>
      <View style={localStyles.shareBody}>
        <Text numberOfLines={1} style={localStyles.shareName}>{label}</Text>
        <TextInput
          editable={!disabled}
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          inputMode="numeric"
          keyboardType="number-pad"
          onChangeText={onChange}
          placeholder="¥ 0"
          placeholderTextColor={colors.subtle}
          selection={{ start: displayValue.length, end: displayValue.length }}
          style={[localStyles.shareInput, { color: accent }, disabled && localStyles.disabled]}
          value={displayValue}
        />
      </View>
    </View>
  );
}

function initialFor(label: string) {
  return (label.trim()[0] || '?').toUpperCase();
}

const localStyles = StyleSheet.create({
  addRuleButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 48
  },
  addRuleText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.extraBold,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  activeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 4
  },
  activeSaveArea: {
    gap: 12
  },
  amountCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  amountInput: {
    color: colors.primaryDark,
    flex: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 18,
    fontWeight: '700',
    minHeight: 48,
    minWidth: 0,
    paddingVertical: 0
  },
  amountInputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 48,
    minWidth: 170,
    paddingLeft: 12,
    paddingRight: 8
  },
  countPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,247,0.13)',
    borderColor: 'rgba(255,253,247,0.18)',
    borderWidth: 1,
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  countPillDot: {
    borderRadius: 2.5,
    height: 5,
    width: 5
  },
  countPillText: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13
  },
  balanceAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  balanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  balanceText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16
  },
  balanceTextError: {
    color: colors.danger
  },
  balanceTextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  categoryMenu: {
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    overflow: 'hidden'
  },
  categoryOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  categorySelected: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0
  },
  categoryText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 0
  },
  categoryTrigger: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 48,
    minWidth: 148,
    paddingHorizontal: 12
  },
  clearInlineButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.05)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  compactButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  dayOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  dayOptionActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary
  },
  dayOptionText: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700'
  },
  dayOptionTextActive: {
    color: '#FFFFFF'
  },
  deleteButton: {
    flexDirection: 'row',
    gap: 8
  },
  dayRail: {
    marginHorizontal: -2
  },
  dayRailItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  dayRailItemActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary
  },
  dayRailText: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700'
  },
  dayRailTextActive: {
    color: '#FFFFFF'
  },
  dayRailTrack: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2
  },
  disabled: {
    opacity: 0.6
  },
  divider: {
    backgroundColor: colors.line,
    height: 1
  },
  emptyRules: {
    alignItems: 'center',
    gap: 7,
    minHeight: 132,
    padding: 20
  },
  emptyRulesText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center'
  },
  emptyRulesTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  fieldGroup: {
    gap: 10
  },
  fieldLabel: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 15
  },
  fixedSummaryAmount: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36
  },
  fixedSummaryCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    gap: 12,
    padding: 18
  },
  fixedSummaryLabel: {
    color: 'rgba(255,253,247,0.58)',
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.4,
    lineHeight: 13
  },
  fixedSummaryPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  groupCard: {
    gap: 14,
    padding: 16
  },
  groupHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9
  },
  groupHeadIcon: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  groupHeadLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19
  },
  helpText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  },
  ledgerSubtitle: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 15,
    paddingHorizontal: 4,
    textTransform: 'uppercase'
  },
  listContent: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 720,
    padding: 18,
    paddingBottom: 44,
    width: '100%'
  },
  listInsetDivider: {
    backgroundColor: 'rgba(42,39,34,0.08)',
    height: StyleSheet.hairlineWidth,
    marginLeft: 66
  },
  memberAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 15,
    borderWidth: 1.5,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  memberAvatarText: {
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700'
  },
  memberOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    minWidth: 130,
    paddingHorizontal: 10
  },
  memberOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  memberOptionText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 0
  },
  memberOptionTextSelected: {
    color: '#FFFFFF'
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill
  },
  modalBackdropVisual: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(42,39,34,0.24)'
  },
  modalGrabber: {
    backgroundColor: colors.line,
    borderRadius: theme.radii.pill,
    height: 5,
    width: 38
  },
  modalGrabberHitArea: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: 24,
    width: 142
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 18
  },
  notFoundState: {
    gap: 12,
    padding: 24
  },
  optionIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  ownershipOption: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14
  },
  ownershipOptionActive: {
    backgroundColor: colors.surface,
    shadowColor: '#2A2722',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2
  },
  ownershipSelector: {
    backgroundColor: colors.tint,
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 48,
    padding: 4
  },
  ownershipText: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center'
  },
  ownershipTextActive: {
    color: colors.ink
  },
  pressed: {
    opacity: 0.76
  },
  ruleDot: {
    borderRadius: 2.5,
    height: 5,
    width: 5
  },
  ruleIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  ruleListAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    maxWidth: 100
  },
  ruleListBody: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  ruleListCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#2A2722',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 22
  },
  ruleListMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minWidth: 0
  },
  ruleListRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  ruleListTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    minWidth: 0
  },
  ruleListTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0
  },
  ruleMetaLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minWidth: 0
  },
  ruleMetaText: {
    color: colors.subtle,
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    minWidth: 0
  },
  rulePaused: {
    opacity: 0.48
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: theme.radii.control,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: colors.primary,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 3
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700'
  },
  shareAmountRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  shareAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 17,
    borderWidth: 1.5,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  shareAvatarText: {
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700'
  },
  shareHeaderRow: {
    gap: 8
  },
  shareBody: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0
  },
  shareInput: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 17,
    fontWeight: '700',
    minHeight: 36,
    minWidth: 118,
    paddingVertical: 0,
    textAlign: 'right'
  },
  shareName: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 0
  },
  splitQuick: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 9
  },
  splitQuickActive: {
    backgroundColor: colors.tint,
    borderColor: colors.secondary
  },
  splitQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  splitQuickText: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700'
  },
  splitQuickTextActive: {
    color: colors.secondary
  },
  subcategoryChip: {
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  subcategoryChipActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary
  },
  subcategoryChipText: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700'
  },
  subcategoryChipTextActive: {
    color: '#FFFFFF'
  },
  subcategoryRail: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
});
