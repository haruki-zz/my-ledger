import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, styles } from '@/src/components/styles';
import { EXPENSE_CATEGORIES, getExpenseCategorySplitRatio } from '@/src/lib/categories';
import { displayName, todayDateString } from '@/src/lib/format';
import { saveExpense } from '@/src/lib/ledger';
import type { Expense, ExpenseOwnership, Ledger, LedgerMemberProfile, Profile } from '@/src/types/database';

type Props = {
  ledger: Ledger;
  members: LedgerMemberProfile[];
  currentUserId: string;
  currentProfile?: Profile;
  expense?: Expense;
  profilesById: Record<string, Profile>;
};

type SplitMode = 'amount' | 'ratio';
type SplitTextValues = Record<string, string>;

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
  profilesById
}: Props) {
  const sortedMembers = useMemo(() => members.slice(0, 2), [members]);
  const [amount, setAmount] = useState(expense ? String(expense.amount_yen) : '');
  const [category, setCategory] = useState(expense?.category.trim() || '');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [paidBy, setPaidBy] = useState(expense?.paid_by || currentUserId);
  const [ownership, setOwnership] = useState<ExpenseOwnership>(expense?.ownership || 'personal');
  const [spentOn, setSpentOn] = useState(expense?.spent_on || todayDateString());
  const [note, setNote] = useState(expense?.note || '');
  const [splitMode, setSplitMode] = useState<SplitMode>('amount');
  const [submitting, setSubmitting] = useState(false);

  const [amountSplitValues, setAmountSplitValues] = useState<SplitTextValues>(() => {
    if (expense?.splits?.length) {
      return Object.fromEntries(expense.splits.map((split) => [split.user_id, String(split.amount_yen)]));
    }

    const amountYen = parsePositiveInteger(amount);
    if (amountYen && sortedMembers.length === 2) {
      return toAmountValues(sortedMembers, calculateAmountsFromRatios(amountYen, getExpenseCategorySplitRatio(category)));
    }

    return toEmptySplitValues(sortedMembers);
  });
  const [ratioValues, setRatioValues] = useState<SplitTextValues>(() => {
    if (expense?.splits?.length && expense.amount_yen > 0 && sortedMembers.length === 2) {
      const firstSplit = expense.splits.find((split) => split.user_id === sortedMembers[0].user_id);
      const firstRatio = firstSplit ? (firstSplit.amount_yen / expense.amount_yen) * 100 : 50;
      return toRatioValues(sortedMembers, [firstRatio, 100 - firstRatio]);
    }

    return toRatioValues(sortedMembers, getExpenseCategorySplitRatio(category));
  });
  const [lastEditedAmountUserId, setLastEditedAmountUserId] = useState<string | null>(null);
  const [splitValuesTouched, setSplitValuesTouched] = useState(false);

  const categoryOptions = useMemo(() => {
    const existingCategory = expense?.category.trim();
    if (existingCategory && !EXPENSE_CATEGORIES.includes(existingCategory as (typeof EXPENSE_CATEGORIES)[number])) {
      return [...EXPENSE_CATEGORIES, existingCategory];
    }

    return EXPENSE_CATEGORIES;
  }, [expense?.category]);

  const recordedByName = displayName(
    expense ? profilesById[expense.recorded_by]?.display_name : currentProfile?.display_name
  );
  const hasSavedSharedSplits = expense?.ownership === 'shared' && Boolean(expense.splits.length);
  const canApplyPresetSplits = !splitValuesTouched && !hasSavedSharedSplits;

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
    const presetRatios = getExpenseCategorySplitRatio(nextCategory);
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
        setRatioValues(toRatioValues(sortedMembers, getExpenseCategorySplitRatio(category)));
      }
    }

    if (nextMode === 'amount' && amountYen) {
      syncAmountValuesFromRatios(amountYen, currentRatios() || getExpenseCategorySplitRatio(category));
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
      throw new Error('共同支出需要账本内已有两名成员');
    }

    if (splitMode === 'ratio') {
      const ratios = sortedMembers.map((member) => parseRatio(ratioValues[member.user_id] || ''));
      if (ratios.some((ratio) => ratio === null)) {
        throw new Error('比例必须是 0 到 100 之间的数字');
      }

      const firstRatio = ratios[0] || 0;
      const secondRatio = ratios[1] || 0;
      if (Math.abs(firstRatio + secondRatio - 100) >= 0.0001) {
        throw new Error('双方承担比例之和必须等于 100%');
      }

      const [firstAmount, secondAmount] = calculateAmountsFromRatios(totalAmount, [firstRatio, secondRatio]);
      return [
        { user_id: sortedMembers[0].user_id, amount_yen: firstAmount },
        { user_id: sortedMembers[1].user_id, amount_yen: secondAmount }
      ];
    }

    const splitAmounts = sortedMembers.map((member) => parseNonNegativeInteger(amountSplitValues[member.user_id] || ''));
    if (splitAmounts.some((splitAmount) => splitAmount === null)) {
      throw new Error('承担金额必须是非负日元整数');
    }

    const splits = sortedMembers.map((member, index) => ({
      user_id: member.user_id,
      amount_yen: splitAmounts[index] || 0
    }));

    const splitTotal = splits.reduce((sum, split) => sum + split.amount_yen, 0);
    if (splitTotal !== totalAmount) {
      throw new Error('双方承担金额之和必须等于总金额');
    }

    return splits;
  }

  async function submit() {
    setSubmitting(true);

    try {
      const amountYen = Number(amount);
      if (!Number.isInteger(amountYen) || amountYen <= 0) {
        throw new Error('金额必须是大于 0 的日元整数');
      }

      if (!category.trim()) {
        throw new Error('请选择类别');
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) {
        throw new Error('日期格式必须为 YYYY-MM-DD');
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
        router.replace('/expenses');
      }
    } catch (submitError) {
      Alert.alert('保存失败', submitError instanceof Error ? submitError.message : '请检查输入内容');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.label}>金额（日元）</Text>
        <TextInput
          inputMode="numeric"
          onChangeText={handleAmountChange}
          placeholder="例如：1200"
          style={styles.input}
          value={amount}
        />

        <Text style={styles.label}>类别</Text>
        <View style={styles.dropdown}>
          <Pressable
            onPress={() => setCategoryMenuOpen((current) => !current)}
            style={[styles.dropdownTrigger, categoryMenuOpen && styles.dropdownTriggerActive]}
          >
            <Text style={category ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {category || '请选择类别'}
            </Text>
            <Text style={styles.dropdownIndicator}>{categoryMenuOpen ? '⌃' : '⌄'}</Text>
          </Pressable>
          {categoryMenuOpen ? (
            <View style={styles.dropdownMenu}>
              {categoryOptions.map((option) => {
                const selected = option === category;
                return (
                  <Pressable
                    key={option}
                    onPress={() => selectCategory(option)}
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

        <Text style={styles.label}>支付人</Text>
        <View style={styles.row}>
          {sortedMembers.map((member) => (
            <Pressable
              key={member.user_id}
              onPress={() => setPaidBy(member.user_id)}
              style={[styles.chip, paidBy === member.user_id && styles.chipActive]}
            >
              <Text style={styles.chipText}>{displayName(member.profile.display_name)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>记录人</Text>
        <View style={[styles.input, { justifyContent: 'center' }]}>
          <Text style={styles.body}>{recordedByName}</Text>
        </View>

        <Text style={styles.label}>归属</Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => selectOwnership('personal')}
            style={[styles.chip, ownership === 'personal' && styles.chipActive]}
          >
            <Text style={styles.chipText}>个人</Text>
          </Pressable>
          <Pressable
            onPress={() => selectOwnership('shared')}
            style={[styles.chip, ownership === 'shared' && styles.chipActive]}
          >
            <Text style={styles.chipText}>共同</Text>
          </Pressable>
        </View>

        {ownership === 'shared' ? (
          <View style={{ gap: 12 }}>
            <Text style={styles.label}>分摊方式</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() => selectSplitMode('amount')}
                style={[styles.chip, splitMode === 'amount' && styles.chipActive]}
              >
                <Text style={styles.chipText}>金额</Text>
              </Pressable>
              <Pressable
                onPress={() => selectSplitMode('ratio')}
                style={[styles.chip, splitMode === 'ratio' && styles.chipActive]}
              >
                <Text style={styles.chipText}>比例</Text>
              </Pressable>
            </View>

            {sortedMembers.map((member) => (
              <View key={member.user_id} style={{ gap: 6 }}>
                <Text style={styles.label}>
                  {displayName(member.profile.display_name)}承担{splitMode === 'amount' ? '金额' : '比例（%）'}
                </Text>
                <TextInput
                  inputMode="numeric"
                  onChangeText={(value) =>
                    splitMode === 'amount'
                      ? setAmountSplitValue(member.user_id, value)
                      : setRatioValue(member.user_id, value)
                  }
                  placeholder={splitMode === 'amount' ? '例如：600' : '例如：50'}
                  style={styles.input}
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

        <Text style={styles.label}>日期</Text>
        <TextInput onChangeText={setSpentOn} placeholder="YYYY-MM-DD" style={styles.input} value={spentOn} />

        <Text style={styles.label}>备注</Text>
        <TextInput
          multiline
          onChangeText={setNote}
          placeholder="可选"
          style={[styles.input, { minHeight: 84, textAlignVertical: 'top' }]}
          value={note}
        />

        <Pressable disabled={submitting} onPress={submit} style={styles.button}>
          <Text style={styles.buttonText}>{submitting ? '保存中...' : '保存'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.muted, { color: colors.muted }]}>数据会直接写入 Supabase。编辑时不会改变原始记录人。</Text>
    </ScrollView>
  );
}
