import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { BentoCard } from '@/src/components/ui';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { PRIMARY_CATEGORIES, categoryColor, categoryIconName, categoryLabel, subcategoryPresets } from '@/src/lib/categorySystem';
import { displayName, formatYen } from '@/src/lib/format';
import { runAfterKeyboardDismiss } from '@/src/lib/keyboard';
import {
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
  ratioA: string;
  ratioB: string;
  generateDay: string;
  startMonth: string;
  endMonth: string;
  isActive: boolean;
};

type LoadMode = 'background' | 'initial' | 'refresh';

function sanitizeWholeNumber(value: string) {
  return value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
}

function parsePositiveInteger(value: string) {
  const parsed = Number(sanitizeWholeNumber(value.trim()));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function dateForGenerateDay(day: string) {
  const parsedDay = Math.min(31, Math.max(1, Number(sanitizeWholeNumber(day) || 1)));
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), parsedDay);
}

function dateInputValue(day: string) {
  const date = dateForGenerateDay(day);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatGenerateDayLabel(day: string) {
  const date = dateForGenerateDay(day);
  return `Day ${date.getDate()} of each month`;
}

const GENERATE_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);

type WebDateInputChangeEvent = {
  currentTarget?: { value?: string };
  target?: { value?: string };
};

function GenerateDayInput({ onChange, value }: { onChange: (day: string) => void; value: string }) {
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <input
      aria-label="Monthly generation date"
      onChange={(event: WebDateInputChangeEvent) => {
        const nextValue = event.currentTarget?.value || event.target?.value || '';
        const [, , day] = nextValue.split('-');
        if (day) {
          onChange(String(Number(day)));
        }
      }}
      style={webDateInputStyle}
      type="date"
      value={dateInputValue(value)}
    />
  );
}

function emptyDraft(members: LedgerMemberProfile[]): Draft {
  const currentMonth = dateStringToMonthKey(currentMonthStartDate());
  return {
    id: null,
    name: '',
    categoryId: 'housing',
    subcategory: 'Rent',
    amount: '',
    paidBy: members[0]?.user_id || '',
    ownership: 'shared',
    ratioA: '50',
    ratioB: '50',
    generateDay: '1',
    startMonth: currentMonth,
    endMonth: '',
    isActive: true
  };
}

function draftFromRule(rule: RecurringExpenseRule): Draft {
  return {
    id: rule.id,
    name: rule.name,
    categoryId: rule.category_id,
    subcategory: rule.subcategory || '',
    amount: String(rule.amount_yen),
    paidBy: rule.paid_by,
    ownership: rule.ownership || 'shared',
    ratioA: String(rule.split_ratio_a),
    ratioB: String(rule.split_ratio_b),
    generateDay: String(rule.generate_day),
    startMonth: dateStringToMonthKey(rule.start_month),
    endMonth: rule.end_month ? dateStringToMonthKey(rule.end_month) : '',
    isActive: rule.is_active
  };
}

export default function RecurringExpenseRulesScreen() {
  const { error: ledgerError, ledger, loading: ledgerLoading, reloadLedger } = useRequiredLedger();
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [rules, setRules] = useState<RecurringExpenseRule[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft([]));
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [nativeGenerateDatePickerOpen, setNativeGenerateDatePickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ledgerId = ledger?.id;

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
        getRecurringExpenseRules(currentLedger.id)
      ]);
      setMembers(nextMembers);
      setRules(nextRules);
      setDraft((current) => (current.paidBy ? current : emptyDraft(nextMembers)));
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
  }, [ledger]);

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

  const memberNameById = useMemo(
    () => new Map(members.map((member) => [member.user_id, displayName(member.profile.display_name)])),
    [members]
  );
  const amountDisplayValue = formatYenInput(draft.amount);

  const currentSubcategoryPresets = useMemo(() => subcategoryPresets(draft.categoryId), [draft.categoryId]);

  async function refresh() {
    const nextLedger = await reloadLedger();
    await load(nextLedger || ledger, 'refresh');
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function startCreate() {
    setDraft(emptyDraft(members));
    setCategoryMenuOpen(false);
    setNativeGenerateDatePickerOpen(false);
  }

  function startEdit(rule: RecurringExpenseRule) {
    setDraft(draftFromRule(rule));
    setCategoryMenuOpen(false);
    setNativeGenerateDatePickerOpen(false);
  }

  async function toggleRule(rule: RecurringExpenseRule) {
    await saveRule(draftFromRule({ ...rule, is_active: !rule.is_active }));
  }

  function validateDraft() {
    if (!ledger) {
      return 'No active ledger';
    }
    if (draft.ownership === 'shared' && members.length !== 2) {
      return 'Fixed monthly expenses require two ledger members';
    }
    if (!draft.name.trim()) {
      return 'Enter a rule name';
    }
    const amountYen = parsePositiveInteger(draft.amount);
    if (!amountYen) {
      return 'Enter an amount greater than 0';
    }
    if (!draft.paidBy || !members.some((member) => member.user_id === draft.paidBy)) {
      return 'Choose a payer from this ledger';
    }
    const ratioA = parseRatio(draft.ratioA);
    const ratioB = parseRatio(draft.ratioB);
    if (ratioA === null || ratioB === null || ratioA + ratioB !== 100) {
      return 'Split ratios must be whole numbers that add up to 100';
    }
    const generateDay = parsePositiveInteger(draft.generateDay);
    if (!generateDay || generateDay > 31) {
      return 'Generate day must be between 1 and 31';
    }
    if (!isValidMonthKey(draft.startMonth)) {
      return 'Start month must use YYYY-MM';
    }
    if (draft.endMonth && !isValidMonthKey(draft.endMonth)) {
      return 'End month must use YYYY-MM';
    }
    if (draft.endMonth && draft.endMonth < draft.startMonth) {
      return 'End month cannot be before start month';
    }
    return null;
  }

  async function saveRule(nextDraft = draft) {
    if (!ledger) {
      return;
    }
    const validationMessage = nextDraft === draft ? validateDraft() : null;
    if (validationMessage) {
      Alert.alert('Save Failed', validationMessage);
      return;
    }

    const amountYen = parsePositiveInteger(nextDraft.amount);
    const ratioA = parseRatio(nextDraft.ratioA);
    const ratioB = parseRatio(nextDraft.ratioB);
    const generateDay = parsePositiveInteger(nextDraft.generateDay);
    if (!amountYen || ratioA === null || ratioB === null || !generateDay) {
      return;
    }

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
        generateDay,
        startMonth: monthKeyToStartDate(nextDraft.startMonth),
        endMonth: nextDraft.endMonth ? monthKeyToStartDate(nextDraft.endMonth) : null,
        timezone: 'Asia/Tokyo',
        isActive: nextDraft.isActive
      });
      await generateRecurringExpenses(ledger.id, currentMonthStartDate()).catch(() => []);
      await load(ledger, 'background');
      if (nextDraft === draft) {
        startCreate();
      }
    } catch (saveError) {
      Alert.alert('Save Failed', getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if ((ledgerLoading || loading) && !ledger) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  function clearAmount() {
    updateDraft({ amount: '' });
  }

  function selectOwnership(nextOwnership: ExpenseOwnership) {
    if (nextOwnership === 'personal') {
      updateDraft({
        ownership: nextOwnership,
        ratioA: '100',
        ratioB: '0'
      });
      return;
    }

    updateDraft({
      ownership: nextOwnership,
      ratioA: draft.ratioA === '100' && draft.ratioB === '0' ? '50' : draft.ratioA,
      ratioB: draft.ratioA === '100' && draft.ratioB === '0' ? '50' : draft.ratioB
    });
  }

  function selectGenerateDay(day: number) {
    updateDraft({ generateDay: String(day) });
    setNativeGenerateDatePickerOpen(false);
  }

  return (
    <KeyboardAwareScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      {ledgerError || error ? <Text style={styles.error}>{ledgerError || error}</Text> : null}

      <BentoCard variant="form" style={localStyles.amountCard}>
        <View style={localStyles.cardHeaderRow}>
          <Text style={localStyles.inputTitle}>Amount</Text>
          {draft.amount ? (
            <Pressable accessibilityLabel="Clear amount" onPress={clearAmount} style={localStyles.clearButton}>
              <Ionicons color={colors.muted} name="close" size={24} />
            </Pressable>
          ) : (
            <View style={localStyles.clearButtonPlaceholder} />
          )}
        </View>
        <TextInput
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          inputMode="numeric"
          keyboardType="number-pad"
          onChangeText={(value) => updateDraft({ amount: sanitizeWholeNumber(value) })}
          placeholder="¥ 0"
          placeholderTextColor={colors.subtle}
          selection={{ start: amountDisplayValue.length, end: amountDisplayValue.length }}
          style={localStyles.amountInput}
          value={amountDisplayValue}
        />
      </BentoCard>

      <BentoCard variant="form" style={localStyles.formCard}>
        <View style={localStyles.headerRow}>
          <Text style={styles.h2}>{draft.id ? 'Edit Rule' : 'New Rule'}</Text>
          {draft.id ? (
            <Pressable onPress={startCreate} style={[styles.button, styles.secondaryButton, localStyles.compactButton]}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>New</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          onChangeText={(name) => updateDraft({ name })}
          placeholder="Name"
          placeholderTextColor={colors.subtle}
          style={styles.input}
          value={draft.name}
        />

        <BentoCard variant="form" style={localStyles.inlineFieldCard}>
          <Text style={styles.upperLabel}>Bill Date</Text>
          {Platform.OS === 'web' ? (
            <GenerateDayInput
              onChange={(day) => updateDraft({ generateDay: day })}
              value={draft.generateDay}
            />
          ) : (
            <Pressable
              onPress={() => runAfterKeyboardDismiss(() => setNativeGenerateDatePickerOpen((current) => !current))}
              style={({ pressed }) => [localStyles.dateTrigger, pressed && localStyles.pressed]}
            >
              <Ionicons color={colors.ink} name="calendar-outline" size={22} />
              <Text style={localStyles.dateText}>{formatGenerateDayLabel(draft.generateDay)}</Text>
              <Ionicons color={colors.ink} name="chevron-forward" size={20} />
            </Pressable>
          )}
        </BentoCard>

        <BentoCard variant="form" style={localStyles.inlineFieldCard}>
          <View accessibilityLabel="Fixed expense ownership" style={localStyles.ownershipSelector}>
            {[
              { label: 'Personal', value: 'personal' as const },
              { label: 'Shared', value: 'shared' as const }
            ].map((option) => {
              const selected = option.value === draft.ownership;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => selectOwnership(option.value)}
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

        {draft.ownership === 'shared' ? (
          <View style={localStyles.categoryBlock}>
            <Text style={styles.upperLabel}>Split</Text>
            <View style={localStyles.row}>
              <TextInput
                inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={(ratioA) => updateDraft({ ratioA: sanitizeWholeNumber(ratioA), ratioB: String(100 - Math.min(100, Number(sanitizeWholeNumber(ratioA) || 0))) })}
                placeholder={memberNames[0]}
                placeholderTextColor={colors.subtle}
                style={[styles.input, localStyles.flexInput]}
                value={draft.ratioA}
              />
              <TextInput
                inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={(ratioB) => updateDraft({ ratioB: sanitizeWholeNumber(ratioB), ratioA: String(100 - Math.min(100, Number(sanitizeWholeNumber(ratioB) || 0))) })}
                placeholder={memberNames[1]}
                placeholderTextColor={colors.subtle}
                style={[styles.input, localStyles.flexInput]}
                value={draft.ratioB}
              />
            </View>
          </View>
        ) : null}

        <View style={localStyles.categoryBlock}>
          <Text style={styles.upperLabel}>Category</Text>
          <Pressable
            onPress={() => runAfterKeyboardDismiss(() => setCategoryMenuOpen((current) => !current))}
            style={localStyles.categoryTrigger}
          >
            <View style={localStyles.categorySelected}>
              <Ionicons color={categoryColor(draft.categoryId)} name={categoryIconName(draft.categoryId)} size={20} />
              <Text style={localStyles.categoryText}>{categoryLabel(draft.categoryId)}</Text>
            </View>
            <Ionicons color={colors.ink} name={categoryMenuOpen ? 'chevron-up' : 'chevron-down'} size={20} />
          </Pressable>
          {categoryMenuOpen ? (
            <View style={localStyles.categoryMenu}>
              {PRIMARY_CATEGORIES.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => {
                    updateDraft({ categoryId: category.id, subcategory: '' });
                    setCategoryMenuOpen(false);
                  }}
                  style={localStyles.categoryOption}
                >
                  <Ionicons color={category.color} name={category.icon} size={18} />
                  <Text style={localStyles.categoryText}>{category.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={localStyles.categoryBlock}>
          <Text style={styles.upperLabel}>Subcategory</Text>
          <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
            <View style={localStyles.chipRow}>
              {currentSubcategoryPresets.map((option) => {
                const selected = option === draft.subcategory.trim();
                return (
                  <Pressable
                    key={option}
                    onPress={() => updateDraft({ subcategory: selected ? '' : option })}
                    style={[localStyles.chip, selected && localStyles.chipActive]}
                  >
                    <Text style={[localStyles.chipText, selected && localStyles.chipTextActive]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <TextInput
            inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
            onChangeText={(subcategory) => updateDraft({ subcategory })}
            placeholder="Optional tag"
            placeholderTextColor={colors.subtle}
            style={styles.input}
            value={draft.subcategory}
          />
        </View>

        <View style={localStyles.categoryBlock}>
          <Text style={styles.upperLabel}>Paid By</Text>
          <View style={localStyles.chipRow}>
            {members.slice(0, 2).map((member) => {
              const selected = member.user_id === draft.paidBy;
              return (
                <Pressable
                  key={member.user_id}
                  onPress={() => updateDraft({ paidBy: member.user_id })}
                  style={[localStyles.memberChip, selected && localStyles.memberChipActive]}
                >
                  <Text style={[localStyles.memberChipText, selected && localStyles.memberChipTextActive]}>
                    {displayName(member.profile.display_name)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={localStyles.helpText}>Each month is paid by this member. Edit the generated expense if one month differs.</Text>
        </View>

        <View style={localStyles.row}>
          <TextInput
            inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
            onChangeText={(startMonth) => updateDraft({ startMonth })}
            placeholder="Start YYYY-MM"
            placeholderTextColor={colors.subtle}
            style={[styles.input, localStyles.flexInput]}
            value={draft.startMonth}
          />
          <TextInput
            inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
            onChangeText={(endMonth) => updateDraft({ endMonth })}
            placeholder="End YYYY-MM"
            placeholderTextColor={colors.subtle}
            style={[styles.input, localStyles.flexInput]}
            value={draft.endMonth}
          />
        </View>

        <Pressable
          onPress={() => updateDraft({ isActive: !draft.isActive })}
          style={[localStyles.activeToggle, draft.isActive && localStyles.activeToggleOn]}
        >
          <Ionicons color={draft.isActive ? '#FFFFFF' : colors.muted} name={draft.isActive ? 'toggle' : 'toggle-outline'} size={22} />
          <Text style={[localStyles.activeToggleText, draft.isActive && localStyles.activeToggleTextOn]}>
            {draft.isActive ? 'Active' : 'Inactive'}
          </Text>
        </Pressable>

        <Pressable disabled={saving} onPress={() => void saveRule()} style={[styles.button, saving && localStyles.disabled]}>
          <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Rule'}</Text>
        </Pressable>
      </BentoCard>

      <BentoCard variant="list" style={localStyles.rulesCard}>
        <Text style={styles.h2}>Rules</Text>
        <View style={localStyles.rulesList}>
          {rules.length === 0 ? (
            <Text style={styles.muted}>No fixed monthly expenses yet.</Text>
          ) : rules.map((rule) => (
            <View key={rule.id} style={localStyles.ruleRow}>
              <View style={localStyles.ruleIcon}>
                <Ionicons color={categoryColor(rule.category_id)} name={categoryIconName(rule.category_id)} size={20} />
              </View>
              <View style={localStyles.ruleBody}>
                <Text style={localStyles.ruleTitle}>{rule.name}</Text>
                <Text style={localStyles.ruleMeta}>
                  {categoryLabel(rule.category_id)}{rule.subcategory ? ` · ${rule.subcategory}` : ''} · {formatYen(rule.amount_yen)}
                </Text>
                <Text style={localStyles.ruleMeta}>
                  {rule.ownership === 'personal' ? 'Personal' : 'Shared'} · Day {rule.generate_day} · {memberNameById.get(rule.paid_by) || 'Unknown payer'} pays{rule.ownership === 'shared' ? ` · ${rule.split_ratio_a}/${rule.split_ratio_b}` : ''}
                </Text>
              </View>
              <View style={localStyles.ruleActions}>
                <Pressable onPress={() => startEdit(rule)} style={[styles.button, styles.secondaryButton, localStyles.compactButton]}>
                  <Text style={[styles.buttonText, styles.secondaryButtonText]}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => void toggleRule(rule)} style={[localStyles.statusPill, rule.is_active && localStyles.statusPillActive]}>
                  <Text style={[localStyles.statusPillText, rule.is_active && localStyles.statusPillTextActive]}>
                    {rule.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </BentoCard>

      {Platform.OS !== 'web' ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setNativeGenerateDatePickerOpen(false)}
          presentationStyle="overFullScreen"
          transparent
          visible={nativeGenerateDatePickerOpen}
        >
          <View style={localStyles.modalOverlay}>
            <Pressable onPress={() => setNativeGenerateDatePickerOpen(false)} style={localStyles.modalBackdrop} />
            <View style={localStyles.modalSheet}>
              <View style={localStyles.modalHeader}>
                <Text style={styles.h2}>Bill Date</Text>
                <Pressable
                  onPress={() => setNativeGenerateDatePickerOpen(false)}
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
            </View>
          </View>
        </Modal>
      ) : null}

      <AndroidKeyboardDoneButton />
    </KeyboardAwareScrollView>
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
  activeToggle: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  activeToggleOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  activeToggleText: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700'
  },
  activeToggleTextOn: {
    color: '#FFFFFF'
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
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36
  },
  categoryBlock: {
    gap: 8
  },
  categoryMenu: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden'
  },
  categoryOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.68)',
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12
  },
  categorySelected: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  categoryText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    fontWeight: '600'
  },
  categoryTrigger: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 12
  },
  chip: {
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chipText: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700'
  },
  chipTextActive: {
    color: '#FFFFFF'
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
  compactButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8
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
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  dayOptionText: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700'
  },
  dayOptionTextActive: {
    color: '#FFFFFF'
  },
  disabled: {
    opacity: 0.6
  },
  flexInput: {
    flex: 1,
    minWidth: 126
  },
  formCard: {
    gap: 14,
    padding: 18
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  helpText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  },
  inlineFieldCard: {
    gap: 10,
    padding: 16
  },
  inputTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  memberChip: {
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flex: 1,
    minHeight: 42,
    minWidth: 130,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  memberChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  memberChipText: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  memberChipTextActive: {
    color: '#FFFFFF'
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  modalOverlay: {
    backgroundColor: 'rgba(15,23,42,0.24)',
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
  ownershipOption: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14
  },
  ownershipOptionActive: {
    backgroundColor: colors.surface,
    ...theme.shadow
  },
  ownershipSelector: {
    backgroundColor: 'rgba(15,118,110,0.08)',
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  ruleActions: {
    alignItems: 'flex-end',
    gap: 8
  },
  ruleBody: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  ruleIcon: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  ruleMeta: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  },
  ruleRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 12
  },
  ruleTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  rulesCard: {
    gap: 12
  },
  rulesList: {
    gap: 10
  },
  statusPill: {
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusPillActive: {
    backgroundColor: colors.tint,
    borderColor: 'rgba(15,118,110,0.18)'
  },
  statusPillText: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    fontWeight: '700'
  },
  statusPillTextActive: {
    color: colors.primaryDark
  }
});
