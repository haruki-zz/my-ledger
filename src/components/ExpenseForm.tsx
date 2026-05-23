import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, styles } from '@/src/components/styles';
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

export function ExpenseForm({
  ledger,
  members,
  currentUserId,
  currentProfile,
  expense,
  profilesById
}: Props) {
  const [amount, setAmount] = useState(expense ? String(expense.amount_yen) : '');
  const [category, setCategory] = useState(expense?.category || '');
  const [paidBy, setPaidBy] = useState(expense?.paid_by || currentUserId);
  const [ownership, setOwnership] = useState<ExpenseOwnership>(expense?.ownership || 'personal');
  const [spentOn, setSpentOn] = useState(expense?.spent_on || todayDateString());
  const [note, setNote] = useState(expense?.note || '');
  const [splitMode, setSplitMode] = useState<SplitMode>('amount');
  const [submitting, setSubmitting] = useState(false);

  const sortedMembers = useMemo(() => members.slice(0, 2), [members]);
  const initialSplitValues = useMemo(() => {
    if (expense?.splits?.length) {
      return Object.fromEntries(expense.splits.map((split) => [split.user_id, String(split.amount_yen)]));
    }

    return Object.fromEntries(sortedMembers.map((member) => [member.user_id, '']));
  }, [expense?.splits, sortedMembers]);
  const [splitValues, setSplitValues] = useState<Record<string, string>>(initialSplitValues);

  const recordedByName = displayName(
    expense ? profilesById[expense.recorded_by]?.display_name : currentProfile?.display_name
  );

  function setSplitValue(userId: string, value: string) {
    setSplitValues((current) => ({ ...current, [userId]: value }));
  }

  function buildSplits(totalAmount: number) {
    if (ownership === 'personal') {
      return [];
    }

    if (sortedMembers.length !== 2) {
      throw new Error('共同支出需要账本内已有两名成员');
    }

    if (splitMode === 'ratio') {
      const ratios = sortedMembers.map((member) => Number(splitValues[member.user_id] || 0));
      const totalRatio = ratios.reduce((sum, value) => sum + value, 0);
      if (totalRatio <= 0) {
        throw new Error('比例总和必须大于 0');
      }

      const firstAmount = Math.floor((totalAmount * ratios[0]) / totalRatio);
      return [
        { user_id: sortedMembers[0].user_id, amount_yen: firstAmount },
        { user_id: sortedMembers[1].user_id, amount_yen: totalAmount - firstAmount }
      ];
    }

    const splits = sortedMembers.map((member) => ({
      user_id: member.user_id,
      amount_yen: Number(splitValues[member.user_id] || 0)
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
        throw new Error('请输入类别');
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) {
        throw new Error('日期格式必须为 YYYY-MM-DD');
      }

      await saveExpense({
        id: expense?.id,
        ledgerId: ledger.id,
        amountYen,
        category,
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
          onChangeText={setAmount}
          placeholder="例如：1200"
          style={styles.input}
          value={amount}
        />

        <Text style={styles.label}>类别</Text>
        <TextInput onChangeText={setCategory} placeholder="例如：餐饮、房租、日用品" style={styles.input} value={category} />

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
            onPress={() => setOwnership('personal')}
            style={[styles.chip, ownership === 'personal' && styles.chipActive]}
          >
            <Text style={styles.chipText}>个人</Text>
          </Pressable>
          <Pressable
            onPress={() => setOwnership('shared')}
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
                onPress={() => setSplitMode('amount')}
                style={[styles.chip, splitMode === 'amount' && styles.chipActive]}
              >
                <Text style={styles.chipText}>金额</Text>
              </Pressable>
              <Pressable
                onPress={() => setSplitMode('ratio')}
                style={[styles.chip, splitMode === 'ratio' && styles.chipActive]}
              >
                <Text style={styles.chipText}>比例</Text>
              </Pressable>
            </View>

            {sortedMembers.map((member) => (
              <View key={member.user_id} style={{ gap: 6 }}>
                <Text style={styles.label}>
                  {displayName(member.profile.display_name)}承担{splitMode === 'amount' ? '金额' : '比例'}
                </Text>
                <TextInput
                  inputMode="numeric"
                  onChangeText={(value) => setSplitValue(member.user_id, value)}
                  placeholder={splitMode === 'amount' ? '例如：600' : '例如：50'}
                  style={styles.input}
                  value={splitValues[member.user_id] || ''}
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
