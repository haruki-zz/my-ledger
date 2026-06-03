import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AndroidKeyboardDoneButton,
  KEYBOARD_DONE_ACCESSORY_ID
} from '@/src/components/KeyboardDoneAccessory';
import { KeyboardAwareScrollView } from '@/src/components/KeyboardAwareScrollView';
import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { BentoCard, PillTabs } from '@/src/components/ui';
import {
  DEFAULT_EXPENSE_CATEGORY_SPLIT_RATIO,
  EXPENSE_CATEGORIES,
  getExpenseCategorySplitRatio
} from '@/src/lib/categories';
import { displayName, todayDateString } from '@/src/lib/format';
import { runAfterKeyboardDismiss } from '@/src/lib/keyboard';
import { saveExpense } from '@/src/lib/ledger';
import type {
  Expense,
  ExpenseOwnership,
  Ledger,
  LedgerCategory,
  LedgerMemberProfile,
  Profile
} from '@/src/types/database';

type Props = {
  ledger: Ledger;
  members: LedgerMemberProfile[];
  currentUserId: string;
  currentProfile?: Profile;
  expense?: Expense;
  profilesById: Record<string, Profile>;
  categories?: LedgerCategory[];
};

type SplitMode = 'amount' | 'ratio';
type SplitTextValues = Record<string, string>;
const MIN_SAVE_BAR_HEIGHT = 92;

function formatSplitNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function parsePositiveInteger(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseRatio(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function calculateAmountsFromRatios(totalAmount: number, ratios: readonly [number, number]) {
  const firstAmount = Math.round((totalAmount * ratios[0]) / 100);
  return [firstAmount, totalAmount - firstAmount] as const;
}

function toRatioValues(members: LedgerMemberProfile[], ratios: readonly [number, number]): SplitTextValues {
  return Object.fromEntries(members.map((member, index) => [member.user_id, formatSplitNumber(ratios[index] || 0)]));
}

function toAmountValues(members: LedgerMemberProfile[], amounts: readonly [number, number]): SplitTextValues {
  return Object.fromEntries(members.map((member, index) => [member.user_id, String(amounts[index] || 0)]));
}

function toEmptySplitValues(members: LedgerMemberProfile[]): SplitTextValues {
  return Object.fromEntries(members.map((member) => [member.user_id, '']));
}

export function ExpenseForm({
  ledger,
  members,
  currentUserId,
  currentProfile,
  expense,
  profilesById,
  categories
}: Props) {
  const insets = useSafeAreaInsets();
  const sortedMembers = useMemo(() => members.slice(0, 2), [members]);
  const categoryRatiosByName = useMemo(
    () => new Map(categories?.map((item) => [
      item.category_name,
      [item.split_ratio_a, item.split_ratio_b] as const
    ]) || []),
    [categories]
  );

  const getPresetSplitRatios = useCallback((nextCategory: string): readonly [number, number] => {
    const categoryConfig = categoryRatiosByName.get(nextCategory);
    if (categoryConfig) {
      return categoryConfig;
    }

    if (categories) {
      return DEFAULT_EXPENSE_CATEGORY_SPLIT_RATIO;
    }

    return getExpenseCategorySplitRatio(nextCategory);
  }, [categories, categoryRatiosByName]);

  const [amount, setAmount] = useState(expense ? String(expense.amount_yen) : '');
  const [category, setCategory] = useState(expense?.category.trim() || '');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [paidBy, setPaidBy] = useState(expense?.paid_by || currentUserId);
  const [ownership, setOwnership] = useState<ExpenseOwnership>(expense?.ownership || 'personal');
  const [spentOn, setSpentOn] = useState(expense?.spent_on || todayDateString());
  const [note, setNote] = useState(expense?.note || '');
  const [splitMode, setSplitMode] = useState<SplitMode>('amount');
  const [submitting, setSubmitting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [saveBarHeight, setSaveBarHeight] = useState(MIN_SAVE_BAR_HEIGHT);

  const [amountSplitValues, setAmountSplitValues] = useState<SplitTextValues>(() => {
    if (expense?.splits?.length) {
      return Object.fromEntries(expense.splits.map((split) => [split.user_id, String(split.amount_yen)]));
    }

    const amountYen = parsePositiveInteger(amount);
    if (amountYen && sortedMembers.length === 2) {
      return toAmountValues(sortedMembers, calculateAmountsFromRatios(amountYen, getPresetSplitRatios(category)));
    }

    return toEmptySplitValues(sortedMembers);
  });
  const [ratioValues, setRatioValues] = useState<SplitTextValues>(() => {
    if (expense?.splits?.length && expense.amount_yen > 0 && sortedMembers.length === 2) {
      const firstSplit = expense.splits.find((split) => split.user_id === sortedMembers[0].user_id);
      const firstRatio = firstSplit ? (firstSplit.amount_yen / expense.amount_yen) * 100 : 50;
      return toRatioValues(sortedMembers, [firstRatio, 100 - firstRatio]);
    }

    return toRatioValues(sortedMembers, getPresetSplitRatios(category));
  });
  const [lastEditedAmountUserId, setLastEditedAmountUserId] = useState<string | null>(null);
  const [splitValuesTouched, setSplitValuesTouched] = useState(false);

  const categoryOptions = useMemo(() => {
    const configuredOptions = categories === undefined
      ? [...EXPENSE_CATEGORIES]
      : categories.map((item) => item.category_name);
    const existingCategory = expense?.category.trim();
    if (existingCategory && !configuredOptions.includes(existingCategory)) {
      return [...configuredOptions, existingCategory];
    }

    return configuredOptions;
  }, [categories, expense?.category]);

  const recordedByName = displayName(
    expense ? profilesById[expense.recorded_by]?.display_name : currentProfile?.display_name
  );
  const hasSavedSharedSplits = expense?.ownership === 'shared' && Boolean(expense.splits.length);
  const canApplyPresetSplits = !splitValuesTouched && !hasSavedSharedSplits;
  const saveBarBottom = Platform.OS === 'web' ? 0 : keyboardHeight;
  const saveBarPaddingBottom = Math.max(insets.bottom, 12);
  const formBottomPadding = Math.max(saveBarHeight, MIN_SAVE_BAR_HEIGHT) + 24;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  function currentRatios() {
    if (sortedMembers.length !== 2) {
      return null;
    }

    const firstRatio = parseRatio(ratioValues[sortedMembers[0].user_id] || '');
    const secondRatio = parseRatio(ratioValues[sortedMembers[1].user_id] || '');
    if (firstRatio !== null && secondRatio !== null && Math.abs(firstRatio + secondRatio - 100) < 0.0001) {
      return [firstRatio, secondRatio] as const;
    }

    return null;
  }

  function syncAmountValuesFromRatios(totalAmount: number, ratios: readonly [number, number]) {
    if (sortedMembers.length !== 2) {
      return;
    }

    setAmountSplitValues(toAmountValues(sortedMembers, calculateAmountsFromRatios(totalAmount, ratios)));
  }

  function syncAmountComplement(userId: string, value: string, totalAmount: number) {
    if (sortedMembers.length !== 2) {
      return;
    }

    const enteredAmount = parseNonNegativeInteger(value);
    if (enteredAmount === null) {
      return;
    }

    const otherMember = sortedMembers.find((member) => member.user_id !== userId);
    if (!otherMember) {
      return;
    }

    const boundedAmount = Math.min(enteredAmount, totalAmount);
    setAmountSplitValues((current) => ({
      ...current,
      [userId]: String(boundedAmount),
      [otherMember.user_id]: String(totalAmount - boundedAmount)
    }));
  }

  function applyPresetSplits(nextCategory: string, nextAmount = amount) {
    const presetRatios = getPresetSplitRatios(nextCategory);
    setRatioValues(toRatioValues(sortedMembers, presetRatios));
    setLastEditedAmountUserId(null);

    const amountYen = parsePositiveInteger(nextAmount);
    if (amountYen) {
      setAmountSplitValues(toAmountValues(sortedMembers, calculateAmountsFromRatios(amountYen, presetRatios)));
    } else {
      setAmountSplitValues(toEmptySplitValues(sortedMembers));
    }
  }

  function selectCategory(option: string) {
    setCategory(option);
    setCategoryMenuOpen(false);
    if (ownership === 'shared' && canApplyPresetSplits) {
      applyPresetSplits(option);
    }
  }

  function toggleCategoryMenu() {
    setCategoryMenuOpen((current) => !current);
  }

  function handleAmountChange(value: string) {
    setAmount(value);

    const amountYen = parsePositiveInteger(value);
    if (!amountYen || ownership !== 'shared') {
      return;
    }

    if (lastEditedAmountUserId) {
      syncAmountComplement(lastEditedAmountUserId, amountSplitValues[lastEditedAmountUserId] || '', amountYen);
      return;
    }

    const ratios = currentRatios();
    if (ratios) {
      syncAmountValuesFromRatios(amountYen, ratios);
    }
  }

  function selectOwnership(nextOwnership: ExpenseOwnership) {
    if (nextOwnership === 'shared' && ownership !== 'shared' && canApplyPresetSplits) {
      applyPresetSplits(category);
    }

    setOwnership(nextOwnership);
  }

  function selectSplitMode(nextMode: SplitMode) {
    if (nextMode === splitMode) {
      return;
    }

    const amountYen = parsePositiveInteger(amount);
    if (nextMode === 'ratio' && amountYen && sortedMembers.length === 2) {
      const firstAmount = parseNonNegativeInteger(amountSplitValues[sortedMembers[0].user_id] || '');
      const secondAmount = parseNonNegativeInteger(amountSplitValues[sortedMembers[1].user_id] || '');
      if (firstAmount !== null && secondAmount !== null && firstAmount + secondAmount === amountYen) {
        const firstRatio = (firstAmount / amountYen) * 100;
        setRatioValues(toRatioValues(sortedMembers, [firstRatio, 100 - firstRatio]));
      } else {
        setRatioValues(toRatioValues(sortedMembers, getPresetSplitRatios(category)));
      }
    }

    if (nextMode === 'amount' && amountYen) {
      syncAmountValuesFromRatios(amountYen, currentRatios() || getPresetSplitRatios(category));
      setLastEditedAmountUserId(null);
    }

    setSplitMode(nextMode);
  }

  function setRatioValue(userId: string, value: string) {
    if (sortedMembers.length !== 2) {
      setRatioValues((current) => ({ ...current, [userId]: value }));
      return;
    }

    const otherMember = sortedMembers.find((member) => member.user_id !== userId);
    const parsedRatio = parseRatio(value);
    const nextValues = { ...ratioValues, [userId]: value };

    if (otherMember && parsedRatio !== null) {
      nextValues[otherMember.user_id] = formatSplitNumber(100 - parsedRatio);
    }

    setSplitValuesTouched(true);
    setRatioValues(nextValues);
    setLastEditedAmountUserId(null);

    const amountYen = parsePositiveInteger(amount);
    if (amountYen && otherMember && parsedRatio !== null) {
      const firstRatio = parseRatio(nextValues[sortedMembers[0].user_id] || '') || 0;
      const secondRatio = parseRatio(nextValues[sortedMembers[1].user_id] || '') || 0;
      syncAmountValuesFromRatios(amountYen, [firstRatio, secondRatio]);
    }
  }

  function setAmountSplitValue(userId: string, value: string) {
    setSplitValuesTouched(true);
    setLastEditedAmountUserId(userId);
    setAmountSplitValues((current) => ({ ...current, [userId]: value }));

    const amountYen = parsePositiveInteger(amount);
    if (amountYen) {
      syncAmountComplement(userId, value, amountYen);
    }
  }

  function buildSplits(totalAmount: number) {
    if (ownership === 'personal') {
      return [];
    }

    if (sortedMembers.length !== 2) {
      throw new Error('Shared expenses require two ledger members');
    }

    if (splitMode === 'ratio') {
      const ratios = sortedMembers.map((member) => parseRatio(ratioValues[member.user_id] || ''));
      if (ratios.some((ratio) => ratio === null)) {
        throw new Error('Ratios must be numbers from 0 to 100');
      }

      const firstRatio = ratios[0] || 0;
      const secondRatio = ratios[1] || 0;
      if (Math.abs(firstRatio + secondRatio - 100) >= 0.0001) {
        throw new Error('Both responsibility ratios must add up to 100%');
      }

      const [firstAmount, secondAmount] = calculateAmountsFromRatios(totalAmount, [firstRatio, secondRatio]);
      return [
        { user_id: sortedMembers[0].user_id, amount_yen: firstAmount },
        { user_id: sortedMembers[1].user_id, amount_yen: secondAmount }
      ];
    }

    const splitAmounts = sortedMembers.map((member) => parseNonNegativeInteger(amountSplitValues[member.user_id] || ''));
    if (splitAmounts.some((splitAmount) => splitAmount === null)) {
      throw new Error('Split amounts must be non-negative whole yen values');
    }

    const splits = sortedMembers.map((member, index) => ({
      user_id: member.user_id,
      amount_yen: splitAmounts[index] || 0
    }));

    const splitTotal = splits.reduce((sum, split) => sum + split.amount_yen, 0);
    if (splitTotal !== totalAmount) {
      throw new Error('Split amounts must add up to the total amount');
    }

    return splits;
  }

  async function submit() {
    setSubmitting(true);

    try {
      const amountYen = Number(amount);
      if (!Number.isInteger(amountYen) || amountYen <= 0) {
        throw new Error('Amount must be a whole yen value greater than 0');
      }

      if (!category.trim()) {
        throw new Error('Choose a category');
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) {
        throw new Error('Date format must be YYYY-MM-DD');
      }

      await saveExpense({
        id: expense?.id,
        ledgerId: ledger.id,
        amountYen,
        category: category.trim(),
        paidBy,
        ownership,
        spentOn,
        note,
        splits: buildSplits(amountYen)
      });

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/history');
      }
    } catch (submitError) {
      Alert.alert('Save Failed', submitError instanceof Error ? submitError.message : 'Check the form values');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSaveBarLayout(event: LayoutChangeEvent) {
    setSaveBarHeight(event.nativeEvent.layout.height);
  }

  return (
    <View style={styles.page}>
      <KeyboardAwareScrollView
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingBottom: formBottomPadding }]}
      >
      <BentoCard variant="form" style={localStyles.formCard}>
        <Text style={styles.upperLabel}>Amount (JPY)</Text>
        <TextInput
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          inputMode="numeric"
          keyboardType="number-pad"
          onChangeText={handleAmountChange}
          placeholder="¥0"
          returnKeyType="done"
          style={[styles.input, localStyles.amountInput]}
          submitBehavior="blurAndSubmit"
          value={amount}
        />

        <Text style={styles.upperLabel}>Category</Text>
        <View style={styles.dropdown}>
          <Pressable
            onPress={() => runAfterKeyboardDismiss(toggleCategoryMenu, { delayMs: 80 })}
            style={[styles.dropdownTrigger, categoryMenuOpen && styles.dropdownTriggerActive]}
          >
            <Text style={category ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {category || 'Choose a category'}
            </Text>
            <Text style={styles.dropdownIndicator}>{categoryMenuOpen ? '⌃' : '⌄'}</Text>
          </Pressable>
          {categoryMenuOpen ? (
            <View style={styles.dropdownMenu}>
              {categoryOptions.length === 0 ? (
                <View style={styles.dropdownOption}>
                  <Text style={styles.muted}>No categories yet. Add one in Settings first.</Text>
                </View>
              ) : null}
              {categoryOptions.map((option) => {
                const selected = option === category;
                return (
                  <Pressable
                    key={option}
                    onPress={() => runAfterKeyboardDismiss(() => selectCategory(option))}
                    style={[styles.dropdownOption, selected && styles.dropdownOptionActive]}
                  >
                    <Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextActive]}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <Text style={styles.upperLabel}>Paid By</Text>
        <PillTabs
          accessibilityLabel="Paid by"
          onChange={(nextPaidBy) => runAfterKeyboardDismiss(() => setPaidBy(nextPaidBy))}
          options={sortedMembers.map((member) => ({
            label: displayName(member.profile.display_name),
            value: member.user_id
          }))}
          value={paidBy}
        />

        <Text style={styles.upperLabel}>Recorded By</Text>
        <View style={[styles.input, { justifyContent: 'center' }]}>
          <Text style={styles.body}>{recordedByName}</Text>
        </View>

        <Text style={styles.upperLabel}>Ownership</Text>
        <PillTabs
          accessibilityLabel="Expense ownership"
          onChange={(nextOwnership) => runAfterKeyboardDismiss(() => selectOwnership(nextOwnership))}
          options={[
            { label: 'Personal', value: 'personal' },
            { label: 'Shared', value: 'shared' }
          ]}
          value={ownership}
        />

        {ownership === 'shared' ? (
          <View style={{ gap: 12 }}>
            <Text style={styles.upperLabel}>Split</Text>
            <PillTabs
              accessibilityLabel="Split method"
              onChange={(nextMode) => runAfterKeyboardDismiss(() => selectSplitMode(nextMode))}
              options={[
                { label: 'Amount', value: 'amount' },
                { label: 'Ratio', value: 'ratio' }
              ]}
              value={splitMode}
            />

            {sortedMembers.map((member) => (
              <View key={member.user_id} style={localStyles.splitRow}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.splitName}>
                  {displayName(member.profile.display_name)}
                </Text>
                <TextInput
                  inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                  inputMode="numeric"
                  keyboardType={splitMode === 'amount' ? 'number-pad' : 'decimal-pad'}
                  onChangeText={(value) =>
                    splitMode === 'amount'
                      ? setAmountSplitValue(member.user_id, value)
                      : setRatioValue(member.user_id, value)
                  }
                  placeholder={splitMode === 'amount' ? 'Example: 600' : 'Example: 50'}
                  returnKeyType="done"
                  style={[styles.input, localStyles.splitInput]}
                  submitBehavior="blurAndSubmit"
                  value={
                    splitMode === 'amount'
                      ? amountSplitValues[member.user_id] || ''
                      : ratioValues[member.user_id] || ''
                  }
                />
              </View>
            ))}
          </View>
        ) : null}

        <AndroidKeyboardDoneButton />

        <Text style={styles.upperLabel}>Date</Text>
        <TextInput
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          onChangeText={setSpentOn}
          placeholder="YYYY-MM-DD"
          returnKeyType="done"
          style={styles.input}
          submitBehavior="blurAndSubmit"
          value={spentOn}
        />

        <Text style={styles.upperLabel}>Note</Text>
        <TextInput
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          multiline
          onChangeText={setNote}
          placeholder="Optional"
          style={[styles.input, { minHeight: 84, textAlignVertical: 'top' }]}
          value={note}
        />
      </BentoCard>

      <Text style={[styles.muted, { color: colors.muted }]}>Data is written directly to Supabase. Editing does not change the original recorder.</Text>
      </KeyboardAwareScrollView>

      <View
        onLayout={handleSaveBarLayout}
        style={[
          localStyles.saveBar,
          {
            bottom: saveBarBottom,
            paddingBottom: saveBarPaddingBottom
          }
        ]}
      >
        <Pressable
          disabled={submitting}
          onPress={() => runAfterKeyboardDismiss(submit)}
          style={[styles.button, localStyles.saveButton]}
        >
          <Text style={styles.buttonText}>{submitting ? 'Saving...' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  amountInput: {
    fontFamily: fontFamilies.bold,
    fontSize: 28,
    fontWeight: '700',
    minHeight: 96,
    textAlign: 'center'
  },
  formCard: {
    gap: 18,
    padding: 20
  },
  saveBar: {
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderTopWidth: 1,
    left: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
    ...theme.shadow
  },
  saveButton: {
    minHeight: 56
  },
  splitInput: {
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontWeight: '700',
    textAlign: 'right'
  },
  splitName: {
    color: colors.ink,
    flex: 0.45,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: '700'
  },
  splitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  }
});
