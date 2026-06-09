import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { createElement, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AndroidKeyboardDoneButton,
  KEYBOARD_DONE_ACCESSORY_ID
} from '@/src/components/KeyboardDoneAccessory';
import { KeyboardAwareScrollView } from '@/src/components/KeyboardAwareScrollView';
import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { BentoCard } from '@/src/components/ui';
import {
  DEFAULT_CATEGORY_SPLIT_RATIO,
  PRIMARY_CATEGORIES,
  categoryColor,
  categoryIconName,
  categoryLabel,
  resolveCategory,
  subcategoryPresets
} from '@/src/lib/categorySystem';
import { buildUserColorMap } from '@/src/lib/entityColors';
import { displayName, todayDateString } from '@/src/lib/format';
import { runAfterKeyboardDismiss } from '@/src/lib/keyboard';
import { saveExpense } from '@/src/lib/ledger';
import {
  activeRecurringSubcategoryKeys,
  recurringRuleSubcategoryKey
} from '@/src/lib/recurring';
import type {
  Expense,
  ExpenseOwnership,
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

type SplitTextValues = Record<string, string>;

type WebDateInputChangeEvent = {
  currentTarget?: { value?: string };
  target?: { value?: string };
};

const MIN_SAVE_BAR_HEIGHT = 86;
const numberFormatter = new Intl.NumberFormat('en-US');
const dateLabelFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});
const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short'
});

function sanitizeWholeNumber(value: string) {
  return value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
}

function formatNumberInput(value: string) {
  if (!value) {
    return '';
  }

  return numberFormatter.format(Number(value));
}

function formatYenInput(value: string) {
  return value ? `¥ ${formatNumberInput(value)}` : '¥ ';
}

function formatYenText(value: number) {
  return `¥ ${numberFormatter.format(value)}`;
}

function parsePositiveInteger(value: string) {
  const trimmedValue = sanitizeWholeNumber(value.trim());
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value: string) {
  const trimmedValue = sanitizeWholeNumber(value.trim());
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function calculateAmountsFromRatios(totalAmount: number, ratios: readonly [number, number]) {
  const firstAmount = Math.round((totalAmount * ratios[0]) / 100);
  return [firstAmount, totalAmount - firstAmount] as const;
}

function toAmountValues(members: LedgerMemberProfile[], amounts: readonly [number, number]): SplitTextValues {
  return Object.fromEntries(members.map((member, index) => [member.user_id, String(amounts[index] || 0)]));
}

function toEmptySplitValues(members: LedgerMemberProfile[]): SplitTextValues {
  return Object.fromEntries(members.map((member) => [member.user_id, '']));
}

function initialsForName(name: string) {
  return displayName(name).slice(0, 1).toUpperCase();
}

function parseDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateString(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function formatDisplayDate(dateString: string) {
  const date = parseDateString(dateString);
  if (!date) {
    return dateString || 'Choose date';
  }

  return `${dateLabelFormatter.format(date)} (${weekdayFormatter.format(date)})`;
}

function WebDateInput({
  max,
  onChange,
  value
}: {
  max: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return createElement('input', {
    'aria-label': 'Spent on date',
    max,
    onChange: (event: WebDateInputChangeEvent) => onChange(event.currentTarget?.value || event.target?.value || ''),
    style: webDateInputStyle,
    type: 'date',
    value
  });
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
  const compactLayout = width < 680;
  const sortedMembers = useMemo(() => members.slice(0, 2), [members]);
  const memberColorById = useMemo(() => (
    buildUserColorMap(sortedMembers.map((member) => member.user_id), currentUserId)
  ), [currentUserId, sortedMembers]);
  const initialCategory = useMemo(() => resolveCategory({
    categoryId: expense?.category_id,
    category: expense?.category,
    subcategory: expense?.subcategory
  }), [expense?.category, expense?.category_id, expense?.subcategory]);
  const [amount, setAmount] = useState(expense ? String(expense.amount_yen) : '');
  const [categoryId, setCategoryId] = useState<string>(expense ? initialCategory.categoryId : '');
  const [subcategory, setSubcategory] = useState(initialCategory.subcategory || '');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [paidBy, setPaidBy] = useState(expense?.paid_by || currentUserId);
  const [ownership, setOwnership] = useState<ExpenseOwnership>(expense?.ownership || 'personal');
  const [spentOn, setSpentOn] = useState(expense?.spent_on || todayDateString());
  const [note, setNote] = useState(expense?.note || '');
  const [submitting, setSubmitting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [saveBarHeight, setSaveBarHeight] = useState(MIN_SAVE_BAR_HEIGHT);
  const [nativeDatePickerOpen, setNativeDatePickerOpen] = useState(false);

  const [amountSplitValues, setAmountSplitValues] = useState<SplitTextValues>(() => {
    if (expense?.splits?.length) {
      return Object.fromEntries(expense.splits.map((split) => [split.user_id, String(split.amount_yen)]));
    }

    const amountYen = parsePositiveInteger(amount);
    if (amountYen && sortedMembers.length === 2) {
      return toAmountValues(sortedMembers, calculateAmountsFromRatios(amountYen, DEFAULT_CATEGORY_SPLIT_RATIO));
    }

    return toEmptySplitValues(sortedMembers);
  });
  const [lastEditedAmountUserId, setLastEditedAmountUserId] = useState<string | null>(null);
  const [splitValuesTouched, setSplitValuesTouched] = useState(false);

  const activeFixedSubcategoryKeys = useMemo(
    () => activeRecurringSubcategoryKeys(recurringRules),
    [recurringRules]
  );
  const currentSubcategoryPresets = useMemo(() => {
    if (!categoryId) {
      return [];
    }

    const selectedSubcategory = subcategory.trim();
    return subcategoryPresets(categoryId).filter((option) => {
      if (expense?.subcategory === option || selectedSubcategory === option) {
        return true;
      }

      return !activeFixedSubcategoryKeys.has(recurringRuleSubcategoryKey(categoryId, option));
    });
  }, [activeFixedSubcategoryKeys, categoryId, expense?.subcategory, subcategory]);

  const hasSavedSharedSplits = expense?.ownership === 'shared' && Boolean(expense.splits.length);
  const canApplyDefaultSplits = !splitValuesTouched && !hasSavedSharedSplits;
  const saveBarPaddingBottom = Math.max(insets.bottom, 12);
  const formBottomPadding = Math.max(saveBarHeight, MIN_SAVE_BAR_HEIGHT) + 24;
  const amountYen = parsePositiveInteger(amount) || 0;
  const amountDisplayValue = formatYenInput(amount);
  const today = todayDateString();
  const validationMessage = validateForm();
  const canSave = !validationMessage && !submitting;
  const selectedDate = parseDateString(spentOn) || parseDateString(today) || new Date();
  const isEditing = Boolean(expense);
  const isGeneratedExpense = Boolean(expense?.recurring_rule_id);
  const matchesActiveFixedSubcategory = useMemo(() => {
    const trimmedSubcategory = subcategory.trim();
    if (!categoryId || !trimmedSubcategory || isGeneratedExpense) {
      return false;
    }

    return activeFixedSubcategoryKeys.has(recurringRuleSubcategoryKey(categoryId, trimmedSubcategory));
  }, [activeFixedSubcategoryKeys, categoryId, isGeneratedExpense, subcategory]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

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

  function applyDefaultSplits(nextAmount = amount) {
    setLastEditedAmountUserId(null);

    const nextAmountYen = parsePositiveInteger(nextAmount);
    if (nextAmountYen) {
      setAmountSplitValues(toAmountValues(sortedMembers, calculateAmountsFromRatios(nextAmountYen, DEFAULT_CATEGORY_SPLIT_RATIO)));
    } else {
      setAmountSplitValues(toEmptySplitValues(sortedMembers));
    }
  }

  function selectCategory(nextCategoryId: string) {
    setCategoryId(nextCategoryId);
    setSubcategory('');
    setCategoryMenuOpen(false);
    if (ownership === 'shared' && canApplyDefaultSplits) {
      applyDefaultSplits();
    }
  }

  function toggleCategoryMenu() {
    setCategoryMenuOpen((current) => !current);
  }

  function handleAmountChange(value: string) {
    const nextAmount = sanitizeWholeNumber(value);
    setAmount(nextAmount);

    const nextAmountYen = parsePositiveInteger(nextAmount);
    if (!nextAmountYen) {
      if (ownership === 'shared') {
        setAmountSplitValues(toEmptySplitValues(sortedMembers));
      }
      return;
    }

    if (ownership !== 'shared') {
      return;
    }

    if (lastEditedAmountUserId) {
      syncAmountComplement(lastEditedAmountUserId, amountSplitValues[lastEditedAmountUserId] || '', nextAmountYen);
      return;
    }

    setAmountSplitValues(toAmountValues(sortedMembers, calculateAmountsFromRatios(nextAmountYen, DEFAULT_CATEGORY_SPLIT_RATIO)));
  }

  function clearAmount() {
    handleAmountChange('');
  }

  function selectOwnership(nextOwnership: ExpenseOwnership) {
    if (nextOwnership === 'shared' && ownership !== 'shared' && canApplyDefaultSplits) {
      applyDefaultSplits();
    }

    setOwnership(nextOwnership);
  }

  function setAmountSplitValue(userId: string, value: string) {
    const nextValue = sanitizeWholeNumber(value);
    setSplitValuesTouched(true);
    setLastEditedAmountUserId(userId);
    setAmountSplitValues((current) => ({ ...current, [userId]: nextValue }));

    const currentAmountYen = parsePositiveInteger(amount);
    if (currentAmountYen) {
      syncAmountComplement(userId, nextValue, currentAmountYen);
    }
  }

  function buildSplits(totalAmount: number) {
    if (ownership === 'personal') {
      return [];
    }

    if (sortedMembers.length !== 2) {
      throw new Error('Shared expenses require two ledger members');
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

  function validateForm() {
    const currentAmountYen = parsePositiveInteger(amount);
    if (!currentAmountYen) {
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

    if (ownership === 'shared') {
      try {
        buildSplits(currentAmountYen);
      } catch (splitError) {
        return splitError instanceof Error ? splitError.message : 'Check split values';
      }
    }

    return null;
  }

  function dismissForm() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/history');
    }
  }

  async function submit(skipFixedSubcategoryConfirm = false) {
    const currentAmountYen = parsePositiveInteger(amount);
    const currentValidationMessage = validateForm();
    if (!currentAmountYen || currentValidationMessage) {
      Alert.alert('Save Failed', currentValidationMessage || 'Check the form values');
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
        amountYen: currentAmountYen,
        categoryId,
        category: categoryLabel(categoryId),
        subcategory: subcategory.trim() || null,
        paidBy,
        ownership,
        spentOn,
        note,
        splits: buildSplits(currentAmountYen)
      });

      dismissForm();
    } catch (submitError) {
      Alert.alert('Save Failed', submitError instanceof Error ? submitError.message : 'Check the form values');
    } finally {
      setSubmitting(false);
    }
  }

  function handleNativeDateChange(event: DateTimePickerEvent, nextDate?: Date) {
    if (Platform.OS === 'android') {
      setNativeDatePickerOpen(false);
    }

    if (event.type === 'dismissed' || !nextDate) {
      return;
    }

    setSpentOn(formatDateString(nextDate));
  }

  function handleSaveBarLayout(event: LayoutChangeEvent) {
    setSaveBarHeight(event.nativeEvent.layout.height);
  }

  return (
    <View style={styles.page}>
      <KeyboardAwareScrollView
        style={styles.page}
        contentContainerStyle={[
          styles.content,
          localStyles.content,
          { paddingBottom: formBottomPadding }
        ]}
      >
        <BentoCard variant="form" style={localStyles.amountCard}>
          <View style={localStyles.cardHeaderRow}>
            <Text style={localStyles.inputTitle}>Amount</Text>
            {amount ? (
              <Pressable
                accessibilityLabel="Clear amount"
                onPress={clearAmount}
                style={localStyles.clearButton}
              >
                <Ionicons color={colors.muted} name="close" size={24} />
              </Pressable>
            ) : (
              <View style={localStyles.clearButtonPlaceholder} />
            )}
          </View>
          <TextInput
            accessibilityLabel="Expense amount"
            inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
            inputMode="numeric"
            keyboardType="number-pad"
            onChangeText={handleAmountChange}
            placeholder="¥ 0"
            placeholderTextColor={colors.subtle}
            returnKeyType="done"
            selection={{ end: amountDisplayValue.length, start: amountDisplayValue.length }}
            style={localStyles.amountInput}
            submitBehavior="blurAndSubmit"
            value={amountDisplayValue}
          />
        </BentoCard>

        <View style={[localStyles.sectionStack, compactLayout && localStyles.sectionStackCompact]}>
          <BentoCard variant="form" style={[localStyles.categoryCard, compactLayout && localStyles.fullWidthField]}>
            <Text style={localStyles.inputTitle}>Category</Text>
            {isGeneratedExpense ? (
              <View style={localStyles.generatedNotice}>
                <Ionicons color={colors.primaryDark} name="repeat-outline" size={18} />
                <Text style={localStyles.generatedNoticeText}>Generated from fixed monthly expense</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityLabel="Choose category"
              onPress={() => runAfterKeyboardDismiss(toggleCategoryMenu, { delayMs: 80 })}
              style={({ pressed }) => [
                localStyles.categoryTrigger,
                categoryMenuOpen && localStyles.controlActive,
                pressed && localStyles.pressed
              ]}
            >
              <View style={localStyles.categoryInputBox}>
                <View style={localStyles.categorySelectedContent}>
                  <Ionicons
                    color={categoryId ? categoryColor(categoryId) : colors.muted}
                    name={categoryId ? categoryIconName(categoryId) : 'help-circle-outline'}
                    size={22}
                  />
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={[localStyles.categoryValue, !categoryId && localStyles.categoryPlaceholder]}
                  >
                    {categoryId ? categoryLabel(categoryId) : 'Choose a category'}
                  </Text>
                </View>
                <Ionicons color={colors.ink} name={categoryMenuOpen ? 'chevron-up' : 'chevron-down'} size={22} />
              </View>
            </Pressable>
            {categoryMenuOpen ? (
              <View style={localStyles.dropdownMenu}>
                {PRIMARY_CATEGORIES.map((option) => {
                  const selected = option.id === categoryId;
                  return (
                    <Pressable
                      accessibilityLabel={`Select ${option.label}`}
                      key={option.id}
                      onPress={() => runAfterKeyboardDismiss(() => selectCategory(option.id))}
                      style={({ pressed }) => [
                        localStyles.dropdownOption,
                        selected && localStyles.dropdownOptionActive,
                        pressed && localStyles.pressed
                      ]}
                    >
                      <Ionicons color={option.color} name={option.icon} size={20} />
                      <Text style={[localStyles.dropdownOptionText, selected && localStyles.dropdownOptionTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={localStyles.subcategoryBlock}>
              <Text style={styles.upperLabel}>Subcategory</Text>
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
                style={localStyles.subcategoryScroller}
              >
                <View style={localStyles.subcategoryChipRow}>
                  {currentSubcategoryPresets.map((option) => {
                    const selected = option === subcategory.trim();
                    return (
                      <Pressable
                        key={option}
                        onPress={() => runAfterKeyboardDismiss(() => setSubcategory(selected ? '' : option))}
                        style={({ pressed }) => [
                          localStyles.subcategoryChip,
                          selected && localStyles.subcategoryChipActive,
                          pressed && localStyles.pressed
                        ]}
                      >
                        <Text style={[localStyles.subcategoryChipText, selected && localStyles.subcategoryChipTextActive]}>
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              <TextInput
                accessibilityLabel="Expense subcategory"
                inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                onChangeText={setSubcategory}
                placeholder="Optional tag"
                placeholderTextColor={colors.subtle}
                returnKeyType="done"
                style={localStyles.subcategoryInput}
                submitBehavior="blurAndSubmit"
                value={subcategory}
              />
            </View>
          </BentoCard>

          <BentoCard variant="form" style={[localStyles.paidByCard, compactLayout && localStyles.fullWidthField]}>
            <Text style={localStyles.inputTitle}>Paid By</Text>
            <View style={localStyles.memberSelector}>
              {sortedMembers.map((member) => {
                const selected = member.user_id === paidBy;
                const name = displayName(member.profile.display_name);
                const accent = memberColorById.get(member.user_id) || colors.primaryDark;
                return (
                  <Pressable
                    accessibilityLabel={`Paid by ${name}`}
                    accessibilityRole="button"
                    key={member.user_id}
                    onPress={() => runAfterKeyboardDismiss(() => setPaidBy(member.user_id))}
                    style={({ pressed }) => [
                      localStyles.memberOption,
                      selected && { borderColor: accent, backgroundColor: accent },
                      pressed && localStyles.pressed
                    ]}
                  >
                    <View style={[
                      localStyles.avatar,
                      {
                        backgroundColor: selected ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.72)',
                        borderColor: selected ? 'rgba(255,255,255,0.72)' : accent
                      }
                    ]}>
                      <Text style={[localStyles.avatarText, { color: accent }]}>
                        {initialsForName(name)}
                      </Text>
                    </View>
                    <Text ellipsizeMode="tail" numberOfLines={1} style={[localStyles.memberName, selected && localStyles.memberNameSelected]}>
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </BentoCard>
        </View>

        <BentoCard variant="form" style={localStyles.ownershipCard}>
          <View accessibilityLabel="Expense ownership" style={localStyles.ownershipSelector}>
            {[
              { label: 'Personal', value: 'personal' as const },
              { label: 'Shared', value: 'shared' as const }
            ].map((option) => {
              const selected = option.value === ownership;
              return (
                <Pressable
                  accessibilityLabel={`${option.label} expense`}
                  accessibilityRole="button"
                  key={option.value}
                  onPress={() => runAfterKeyboardDismiss(() => selectOwnership(option.value))}
                  style={({ pressed }) => [
                    localStyles.ownershipOption,
                    selected && localStyles.ownershipOptionActive,
                    pressed && localStyles.pressed
                  ]}
                >
                  <Text style={[localStyles.ownershipText, selected && localStyles.ownershipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </BentoCard>

        {ownership === 'shared' ? (
          <BentoCard variant="form" style={localStyles.splitCard}>
            <Text style={styles.upperLabel}>Split Method</Text>

            <View style={localStyles.splitRows}>
              {sortedMembers.map((member) => {
                const name = displayName(member.profile.display_name);
                const accent = memberColorById.get(member.user_id) || colors.primaryDark;
                const inputValue = formatNumberInput(amountSplitValues[member.user_id] || '');
                return (
                  <View key={member.user_id} style={localStyles.splitRow}>
                    <View style={localStyles.splitMember}>
                      <View style={[localStyles.splitAvatar, { borderColor: accent }]}>
                        <Text style={[localStyles.splitAvatarText, { color: accent }]}>{initialsForName(name)}</Text>
                      </View>
                      <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.splitName}>
                        {name}
                      </Text>
                    </View>

                    <View style={localStyles.splitInputShell}>
                      <Text style={localStyles.splitInputPrefix}>¥</Text>
                      <TextInput
                        accessibilityLabel={`${name} split amount`}
                        inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                        inputMode="numeric"
                        keyboardType="number-pad"
                        onChangeText={(value) => setAmountSplitValue(member.user_id, value)}
                        placeholder="0"
                        placeholderTextColor={colors.subtle}
                        returnKeyType="done"
                        style={[localStyles.splitInput, { color: accent }]}
                        submitBehavior="blurAndSubmit"
                        value={inputValue}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={localStyles.totalRow}>
              <Text style={localStyles.totalLabel}>Total</Text>
              <Text style={localStyles.totalAmount}>{formatYenText(amountYen)}</Text>
            </View>
          </BentoCard>
        ) : null}

        <View style={[localStyles.twoColumnRow, compactLayout && localStyles.twoColumnRowCompact]}>
          <BentoCard variant="form" style={[localStyles.fieldCard, compactLayout && localStyles.fullWidthField]}>
            <Text style={styles.upperLabel}>Spent On</Text>
            {Platform.OS === 'web' ? (
              <WebDateInput max={today} onChange={setSpentOn} value={spentOn} />
            ) : (
              <>
                <Pressable
                  accessibilityLabel="Choose spent on date"
                  onPress={() => runAfterKeyboardDismiss(() => setNativeDatePickerOpen((current) => !current))}
                  style={({ pressed }) => [localStyles.dateTrigger, pressed && localStyles.pressed]}
                >
                  <Ionicons color={colors.ink} name="calendar-outline" size={24} />
                  <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.dateText}>
                    {formatDisplayDate(spentOn)}
                  </Text>
                  <Ionicons color={colors.ink} name={nativeDatePickerOpen ? 'chevron-up' : 'chevron-down'} size={22} />
                </Pressable>
                {nativeDatePickerOpen ? (
                  <DateTimePicker
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    maximumDate={parseDateString(today) || undefined}
                    mode="date"
                    onChange={handleNativeDateChange}
                    value={selectedDate}
                  />
                ) : null}
              </>
            )}
          </BentoCard>

          <BentoCard variant="form" style={[localStyles.fieldCard, compactLayout && localStyles.fullWidthField]}>
            <Text style={styles.upperLabel}>Note (Optional)</Text>
            <TextInput
              accessibilityLabel="Expense note"
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
              multiline
              onChangeText={setNote}
              placeholder="Optional"
              placeholderTextColor={colors.subtle}
              style={localStyles.noteInput}
              value={note}
            />
          </BentoCard>
        </View>

        <AndroidKeyboardDoneButton />
      </KeyboardAwareScrollView>

      <View
        onLayout={handleSaveBarLayout}
        pointerEvents={keyboardVisible ? 'none' : 'auto'}
        style={[
          localStyles.saveBar,
          keyboardVisible && localStyles.saveBarKeyboardHidden,
          {
            bottom: 0,
            paddingBottom: saveBarPaddingBottom
          }
        ]}
      >
        <View style={localStyles.actionRow}>
          <Pressable
            accessibilityLabel="Cancel expense form"
            onPress={() => runAfterKeyboardDismiss(dismissForm)}
            style={({ pressed }) => [localStyles.cancelButton, pressed && localStyles.pressed]}
          >
            <Text style={localStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={isEditing ? 'Save changes' : 'Save expense'}
            disabled={!canSave}
            onPress={() => runAfterKeyboardDismiss(submit)}
            style={({ pressed }) => [
              localStyles.saveButton,
              !canSave && localStyles.saveButtonDisabled,
              pressed && canSave && localStyles.pressed
            ]}
          >
            <Text style={localStyles.saveButtonText}>
              {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Expense'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const webDateInputStyle = {
  backgroundColor: 'rgba(255,255,255,0.86)',
  border: `1px solid ${colors.line}`,
  borderRadius: theme.radii.control,
  color: colors.ink,
  fontFamily: `${fontFamilies.regular}, ${fontFamilies.fallback}`,
  fontSize: 16,
  minHeight: 48,
  outline: 'none',
  padding: '10px 12px',
  width: '100%'
};

const localStyles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  amountCard: {
    gap: 0,
    minHeight: 92,
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 10
  },
  amountInput: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 0,
    minHeight: 46,
    paddingVertical: 0
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  avatarText: {
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700'
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20
  },
  cancelButtonText: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    fontWeight: '600'
  },
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36
  },
  categoryCard: {
    flex: 1,
    gap: 10,
    minHeight: 104,
    minWidth: 0,
    padding: 16
  },
  categoryInputBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: colors.line,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 54,
    minWidth: 0,
    paddingHorizontal: 14
  },
  categorySelectedContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minWidth: 0
  },
  categoryTrigger: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 0,
    minHeight: 50
  },
  categoryValue: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 19,
    fontWeight: '700'
  },
  categoryPlaceholder: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontWeight: '600'
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.05)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  clearButtonPlaceholder: {
    height: 36,
    width: 36
  },
  content: {
    maxWidth: 760
  },
  controlActive: {
    borderColor: colors.primary
  },
  dateText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    fontWeight: '600'
  },
  dateTrigger: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 48
  },
  dropdownMenu: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadow
  },
  dropdownOption: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dropdownOptionActive: {
    backgroundColor: colors.tint
  },
  dropdownOptionText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 15
  },
  dropdownOptionTextActive: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontWeight: '700'
  },
  fieldCard: {
    flex: 1,
    gap: 10,
    minHeight: 96,
    minWidth: 0,
    padding: 18
  },
  fullWidthField: {
    width: '100%'
  },
  generatedNotice: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderColor: 'rgba(15,118,110,0.14)',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  generatedNoticeText: {
    color: colors.primaryDark,
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17
  },
  inputTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  memberName: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    fontWeight: '600'
  },
  memberNameSelected: {
    color: '#FFFFFF'
  },
  memberOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'transparent',
    borderRadius: theme.radii.pill,
    borderWidth: 1.5,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    minWidth: 0,
    paddingHorizontal: 9
  },
  memberSelector: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.03)',
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 3
  },
  noteInput: {
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    minHeight: 50,
    paddingVertical: 0,
    textAlignVertical: 'top'
  },
  ownershipCard: {
    padding: 12
  },
  ownershipOption: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 14
  },
  ownershipOptionActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  ownershipSelector: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,118,110,0.08)',
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4
  },
  ownershipText: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    fontWeight: '600'
  },
  ownershipTextActive: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bold,
    fontWeight: '700'
  },
  paidByCard: {
    flex: 1,
    gap: 10,
    minHeight: 104,
    minWidth: 0,
    padding: 16
  },
  subcategoryBlock: {
    gap: 8
  },
  subcategoryChip: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 11
  },
  subcategoryChipActive: {
    backgroundColor: colors.tint,
    borderColor: 'rgba(15,118,110,0.22)'
  },
  subcategoryChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4
  },
  subcategoryChipText: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600'
  },
  subcategoryChipTextActive: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontWeight: '700'
  },
  subcategoryInput: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  subcategoryScroller: {
    flexGrow: 0
  },
  pressed: {
    opacity: 0.72
  },
  saveBar: {
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderColor: colors.glassBorder,
    borderTopWidth: 1,
    left: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    position: 'absolute',
    right: 0,
    ...theme.shadow
  },
  saveBarKeyboardHidden: {
    opacity: 0,
    transform: [{ translateY: MIN_SAVE_BAR_HEIGHT + 24 }]
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryDark,
    borderRadius: theme.radii.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18
  },
  saveButtonDisabled: {
    backgroundColor: 'rgba(17,24,39,0.18)'
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    fontWeight: '600'
  },
  sectionStack: {
    flexDirection: 'row',
    gap: 18
  },
  sectionStackCompact: {
    flexDirection: 'column'
  },
  splitAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 20,
    borderWidth: 1.5,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  splitAvatarText: {
    fontFamily: fontFamilies.bold,
    fontSize: 18,
    fontWeight: '700'
  },
  splitCard: {
    gap: 12,
    padding: 18
  },
  splitInput: {
    flex: 1,
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    minHeight: 42,
    paddingVertical: 0,
    textAlign: 'right'
  },
  splitInputPrefix: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    fontWeight: '600'
  },
  splitInputShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flex: 0.72,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 190,
    minWidth: 126,
    paddingHorizontal: 12
  },
  splitMember: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0
  },
  splitName: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    fontWeight: '600'
  },
  splitRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 64,
    paddingVertical: 8
  },
  splitRows: {
    borderColor: colors.line,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 12
  },
  totalAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.semiBold,
    fontSize: 19,
    fontWeight: '600'
  },
  totalLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.regular,
    fontSize: 18
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 18
  },
  twoColumnRowCompact: {
    flexDirection: 'column'
  }
});
