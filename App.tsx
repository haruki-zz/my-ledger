import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import {isSupabaseConfigured, supabase} from './src/config/supabase';
import {demoSnapshot} from './src/data/demoData';
import {formatJpy, monthKeyFromDate, parseJpyInput, todayIsoDate} from './src/domain/money';
import {calculateSettlementSummary} from './src/domain/settlement';
import {calculateShareAmounts} from './src/domain/splitting';
import {
  createLedger,
  fetchLedgerSnapshot,
  insertTransaction,
  joinLedger,
  sendLoginCode,
  subscribeLedger,
} from './src/services/supabaseRepository';
import {
  Category,
  ExpenseScope,
  LedgerMember,
  LedgerSnapshot,
  SplitMode,
  SplitRule,
  Transaction,
} from './src/types';

type TabKey = 'home' | 'record' | 'details' | 'stats' | 'settings';

const tabs: Array<{key: TabKey; label: string}> = [
  {key: 'home', label: 'ホーム'},
  {key: 'record', label: '記録'},
  {key: 'details', label: '明細'},
  {key: 'stats', label: '統計'},
  {key: 'settings', label: '設定'},
];

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <LedgerApp />
    </SafeAreaProvider>
  );
}

function LedgerApp() {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot>(demoSnapshot);
  const [tab, setTab] = useState<TabKey>('home');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(
    isSupabaseConfigured ? null : 'user-a',
  );
  const [setupMode, setSetupMode] = useState<'create' | 'join'>('create');

  const loadCloudSnapshot = async () => {
    if (!isSupabaseConfigured) {
      return;
    }

    setLoading(true);
    try {
      const {data} = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
      const cloudSnapshot = await fetchLedgerSnapshot();
      if (cloudSnapshot) {
        setSnapshot(cloudSnapshot);
      }
    } catch (error) {
      Alert.alert('同期エラー', messageFromError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    loadCloudSnapshot();
    const authSubscription = supabase.auth.onAuthStateChange(() => {
      loadCloudSnapshot();
    });

    return () => {
      authSubscription.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !snapshot.ledger.id) {
      return;
    }

    const channel = subscribeLedger(snapshot.ledger.id, loadCloudSnapshot);
    return () => {
      supabase.removeChannel(channel);
    };
  }, [snapshot.ledger.id]);

  const currentMember = useMemo(
    () =>
      snapshot.ledger.members.find(member => member.userId === userId) ??
      snapshot.ledger.members[0],
    [snapshot.ledger.members, userId],
  );
  const partnerMember = useMemo(
    () =>
      snapshot.ledger.members.find(member => member.id !== currentMember.id) ??
      snapshot.ledger.members[1],
    [snapshot.ledger.members, currentMember.id],
  );

  const saveTransaction = async (transaction: Transaction) => {
    const nextSnapshot = {
      ...snapshot,
      transactions: [transaction, ...snapshot.transactions],
    };

    if (isSupabaseConfigured && userId) {
      setLoading(true);
      try {
        await insertTransaction(withoutTransactionId(transaction));
        await loadCloudSnapshot();
        return;
      } catch (error) {
        Alert.alert('保存できませんでした', messageFromError(error));
      } finally {
        setLoading(false);
      }
    }

    setSnapshot(nextSnapshot);
    setTab('home');
  };

  const needsCloudSetup =
    isSupabaseConfigured && !snapshot.ledger.members.some(member => member.userId === userId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.appShell}>
        <Header loading={loading} />
        {!isSupabaseConfigured ? <SetupBanner /> : null}
        {isSupabaseConfigured && !userId ? <LoginCard /> : null}
        {needsCloudSetup ? (
          <OnboardingCard
            mode={setupMode}
            setMode={setSetupMode}
            onDone={loadCloudSnapshot}
          />
        ) : (
          <View style={styles.content}>
            {tab === 'home' ? (
              <HomeScreen
                snapshot={snapshot}
                currentMember={currentMember}
                partnerMember={partnerMember}
                onRecord={() => setTab('record')}
              />
            ) : null}
            {tab === 'record' ? (
              <RecordScreen
                snapshot={snapshot}
                currentMember={currentMember}
                partnerMember={partnerMember}
                onSave={saveTransaction}
              />
            ) : null}
            {tab === 'details' ? (
              <DetailsScreen
                snapshot={snapshot}
                currentMember={currentMember}
                partnerMember={partnerMember}
              />
            ) : null}
            {tab === 'stats' ? <StatsScreen snapshot={snapshot} /> : null}
            {tab === 'settings' ? (
              <SettingsScreen snapshot={snapshot} currentMember={currentMember} />
            ) : null}
          </View>
        )}
        <TabBar active={tab} setActive={setTab} />
      </View>
    </SafeAreaView>
  );
}

function Header({loading}: {loading: boolean}) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>ふたりで管理する</Text>
        <Text style={styles.title}>共有家計簿</Text>
      </View>
      <View style={styles.syncBadge}>
        <Text style={styles.syncBadgeText}>
          {loading ? '同期中' : isSupabaseConfigured ? 'オンライン' : 'デモ'}
        </Text>
      </View>
    </View>
  );
}

function SetupBanner() {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerTitle}>Supabase は未設定です</Text>
      <Text style={styles.bannerText}>
        `src/config/supabase.ts` に URL と anon key を設定すると、ログイン・招待・同期が実データで動きます。
      </Text>
    </View>
  );
}

function LoginCard() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('メールアドレスを入力してください。');

  const submit = async () => {
    try {
      await sendLoginCode(email);
      setMessage('認証メールを送信しました。メール内のリンクからログインしてください。');
    } catch (error) {
      setMessage(messageFromError(error));
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>ログイン</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="mail@example.com"
        style={styles.input}
      />
      <Pressable style={styles.primaryButton} onPress={submit}>
        <Text style={styles.primaryButtonText}>認証メールを送る</Text>
      </Pressable>
      <Text style={styles.helpText}>{message}</Text>
    </View>
  );
}

function OnboardingCard({
  mode,
  setMode,
  onDone,
}: {
  mode: 'create' | 'join';
  setMode: (mode: 'create' | 'join') => void;
  onDone: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [ledgerName, setLedgerName] = useState('ふたりの家計簿');
  const [inviteCode, setInviteCode] = useState('');

  const submit = async () => {
    try {
      if (mode === 'create') {
        await createLedger(ledgerName, displayName);
      } else {
        await joinLedger(inviteCode, displayName);
      }
      await onDone();
    } catch (error) {
      Alert.alert('設定できませんでした', messageFromError(error));
    }
  };

  return (
    <View style={styles.content}>
      <View style={styles.segment}>
        <SegmentButton selected={mode === 'create'} onPress={() => setMode('create')} label="作成" />
        <SegmentButton selected={mode === 'join'} onPress={() => setMode('join')} label="参加" />
      </View>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="あなたの表示名"
        style={styles.input}
      />
      {mode === 'create' ? (
        <TextInput
          value={ledgerName}
          onChangeText={setLedgerName}
          placeholder="家計簿名"
          style={styles.input}
        />
      ) : (
        <TextInput
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="characters"
          placeholder="招待コード"
          style={styles.input}
        />
      )}
      <Pressable style={styles.primaryButton} onPress={submit}>
        <Text style={styles.primaryButtonText}>
          {mode === 'create' ? '家計簿を作成' : '家計簿に参加'}
        </Text>
      </Pressable>
    </View>
  );
}

function HomeScreen({
  snapshot,
  currentMember,
  partnerMember,
  onRecord,
}: {
  snapshot: LedgerSnapshot;
  currentMember: LedgerMember;
  partnerMember: LedgerMember;
  onRecord: () => void;
}) {
  const month = monthKeyFromDate(new Date('2026-05-21'));
  const summary = calculateSettlementSummary(
    snapshot.transactions,
    snapshot.ledger.members,
    month,
  );
  const currentIsA = currentMember.slot === 'member_a';
  const currentPays =
    (summary.direction === 'member_a_pays_member_b' && currentIsA) ||
    (summary.direction === 'member_b_pays_member_a' && !currentIsA);
  const settlementText =
    summary.direction === 'settled'
      ? '精算はありません'
      : `${currentPays ? 'あなたが支払う' : '相手から受け取る'} ${formatJpy(summary.amountJpy)}`;
  const pending = snapshot.transactions.filter(
    tx => tx.scope === 'shared' && tx.status === 'pending_amount',
  );

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.heroPanel}>
        <Text style={styles.heroLabel}>今月の精算</Text>
        <Text style={styles.heroAmount}>{settlementText}</Text>
        <Text style={styles.heroSub}>
          共有支出 {formatJpy(summary.sharedTotalJpy)} ・ 未入力 {summary.pendingSharedCount} 件
        </Text>
      </View>

      <View style={styles.grid}>
        <MetricCard
          label="自分の個人支出"
          value={formatJpy(currentIsA ? summary.memberAPersonalJpy : summary.memberBPersonalJpy)}
        />
        <MetricCard
          label="相手の個人支出"
          value={formatJpy(currentIsA ? summary.memberBPersonalJpy : summary.memberAPersonalJpy)}
        />
        <MetricCard
          label="自分の負担額"
          value={formatJpy(currentIsA ? summary.memberAShareJpy : summary.memberBShareJpy)}
        />
        <MetricCard
          label="相手の負担額"
          value={formatJpy(currentIsA ? summary.memberBShareJpy : summary.memberAShareJpy)}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>未入力の定期支出</Text>
        <Pressable onPress={onRecord}>
          <Text style={styles.linkText}>記録する</Text>
        </Pressable>
      </View>
      {pending.length === 0 ? (
        <Text style={styles.emptyText}>未入力の定期支出はありません。</Text>
      ) : (
        pending.map(transaction => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            categories={snapshot.categories}
            currentMember={currentMember}
            partnerMember={partnerMember}
          />
        ))
      )}
    </ScrollView>
  );
}

function RecordScreen({
  snapshot,
  currentMember,
  partnerMember,
  onSave,
}: {
  snapshot: LedgerSnapshot;
  currentMember: LedgerMember;
  partnerMember: LedgerMember;
  onSave: (transaction: Transaction) => void;
}) {
  const [amountText, setAmountText] = useState('');
  const [scope, setScope] = useState<ExpenseScope>('shared');
  const [categoryId, setCategoryId] = useState(snapshot.categories[0]?.id ?? '');
  const [paidBy, setPaidBy] = useState(currentMember.id);
  const [owner, setOwner] = useState(currentMember.id);
  const [splitMode, setSplitMode] = useState<SplitMode>('ratio');
  const [memberARatio, setMemberARatio] = useState('50');
  const [memberBRatio, setMemberBRatio] = useState('50');
  const [memberAAmount, setMemberAAmount] = useState('');
  const [memberBAmount, setMemberBAmount] = useState('');
  const [note, setNote] = useState('');

  const submit = () => {
    const amount = parseJpyInput(amountText);
    if (amount === null) {
      Alert.alert('金額を入力してください');
      return;
    }

    const splitRule: SplitRule =
      splitMode === 'ratio'
        ? {
            mode: 'ratio',
            memberAShareRatio: Number(memberARatio) || 0,
            memberBShareRatio: Number(memberBRatio) || 0,
          }
        : {
            mode: 'amount',
            memberAShareAmountJpy: parseJpyInput(memberAAmount) ?? 0,
            memberBShareAmountJpy: parseJpyInput(memberBAmount) ?? 0,
          };
    let shares = {memberAShareAmountJpy: 0, memberBShareAmountJpy: 0};
    try {
      shares =
        scope === 'shared'
          ? calculateShareAmounts(amount, splitRule, paidBy, snapshot.ledger.members)
          : shares;
    } catch (error) {
      Alert.alert('分割を確認してください', messageFromError(error));
      return;
    }

    onSave({
      id: `local-${Date.now()}`,
      ledgerId: snapshot.ledger.id,
      amountJpy: amount,
      scope,
      status: 'confirmed',
      categoryId,
      paidByMemberId: paidBy,
      ownerMemberId: scope === 'personal' ? owner : null,
      occurredOn: todayIsoDate(),
      billingMonth: null,
      note: note.trim() || null,
      splitMode: scope === 'shared' ? splitMode : null,
      memberAShareAmountJpy: shares.memberAShareAmountJpy,
      memberBShareAmountJpy: shares.memberBShareAmountJpy,
      recurringTemplateId: null,
      createdByMemberId: currentMember.id,
    });

    setAmountText('');
    setNote('');
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>クイック記録</Text>
      <TextInput
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="number-pad"
        placeholder="金額（円）"
        style={styles.amountInput}
      />
      <View style={styles.segment}>
        <SegmentButton selected={scope === 'shared'} onPress={() => setScope('shared')} label="共有" />
        <SegmentButton selected={scope === 'personal'} onPress={() => setScope('personal')} label="個人" />
      </View>
      <Text style={styles.fieldLabel}>カテゴリ</Text>
      <View style={styles.chipWrap}>
        {snapshot.categories.map(category => (
          <Chip
            key={category.id}
            selected={category.id === categoryId}
            label={category.name}
            onPress={() => setCategoryId(category.id)}
          />
        ))}
      </View>
      <Text style={styles.fieldLabel}>支払者</Text>
      <MemberPicker
        currentMember={currentMember}
        partnerMember={partnerMember}
        value={paidBy}
        onChange={setPaidBy}
      />
      {scope === 'personal' ? (
        <>
          <Text style={styles.fieldLabel}>誰の支出</Text>
          <MemberPicker
            currentMember={currentMember}
            partnerMember={partnerMember}
            value={owner}
            onChange={setOwner}
          />
        </>
      ) : (
        <>
          <Text style={styles.fieldLabel}>分割方式</Text>
          <View style={styles.segment}>
            <SegmentButton selected={splitMode === 'ratio'} onPress={() => setSplitMode('ratio')} label="割合" />
            <SegmentButton selected={splitMode === 'amount'} onPress={() => setSplitMode('amount')} label="金額" />
          </View>
          {splitMode === 'ratio' ? (
            <View style={styles.inputRow}>
              <TextInput value={memberARatio} onChangeText={setMemberARatio} keyboardType="number-pad" style={styles.input} />
              <TextInput value={memberBRatio} onChangeText={setMemberBRatio} keyboardType="number-pad" style={styles.input} />
            </View>
          ) : (
            <View style={styles.inputRow}>
              <TextInput value={memberAAmount} onChangeText={setMemberAAmount} keyboardType="number-pad" placeholder="自分の負担額" style={styles.input} />
              <TextInput value={memberBAmount} onChangeText={setMemberBAmount} keyboardType="number-pad" placeholder="相手の負担額" style={styles.input} />
            </View>
          )}
        </>
      )}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="メモ（任意）"
        style={styles.input}
      />
      <Pressable style={styles.primaryButton} onPress={submit}>
        <Text style={styles.primaryButtonText}>保存</Text>
      </Pressable>
    </ScrollView>
  );
}

function DetailsScreen({
  snapshot,
  currentMember,
  partnerMember,
}: {
  snapshot: LedgerSnapshot;
  currentMember: LedgerMember;
  partnerMember: LedgerMember;
}) {
  const [filter, setFilter] = useState<'all' | 'mine' | 'partner' | 'shared'>('all');
  const filtered = snapshot.transactions.filter(transaction => {
    if (filter === 'all') {
      return true;
    }
    if (filter === 'shared') {
      return transaction.scope === 'shared';
    }
    if (filter === 'mine') {
      return transaction.ownerMemberId === currentMember.id;
    }
    return transaction.ownerMemberId === partnerMember.id;
  });

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>明細</Text>
      <View style={styles.chipWrap}>
        <Chip selected={filter === 'all'} label="すべて" onPress={() => setFilter('all')} />
        <Chip selected={filter === 'mine'} label="自分" onPress={() => setFilter('mine')} />
        <Chip selected={filter === 'partner'} label="相手" onPress={() => setFilter('partner')} />
        <Chip selected={filter === 'shared'} label="共有" onPress={() => setFilter('shared')} />
      </View>
      {filtered.map(transaction => (
        <TransactionRow
          key={transaction.id}
          transaction={transaction}
          categories={snapshot.categories}
          currentMember={currentMember}
          partnerMember={partnerMember}
        />
      ))}
    </ScrollView>
  );
}

function StatsScreen({snapshot}: {snapshot: LedgerSnapshot}) {
  const confirmed = snapshot.transactions.filter(
    transaction => transaction.status === 'confirmed' && transaction.amountJpy,
  );
  const max = Math.max(...confirmed.map(transaction => transaction.amountJpy ?? 0), 1);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>統計</Text>
      <Text style={styles.helpText}>カテゴリ別支出</Text>
      {snapshot.categories.map(category => {
        const total = confirmed
          .filter(transaction => transaction.categoryId === category.id)
          .reduce((sum, transaction) => sum + (transaction.amountJpy ?? 0), 0);
        if (total === 0) {
          return null;
        }

        return (
          <View key={category.id} style={styles.statRow}>
            <Text style={styles.statLabel}>{category.name}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, {width: `${Math.max((total / max) * 100, 6)}%`, backgroundColor: category.color}]} />
            </View>
            <Text style={styles.statValue}>{formatJpy(total)}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function SettingsScreen({
  snapshot,
  currentMember,
}: {
  snapshot: LedgerSnapshot;
  currentMember: LedgerMember;
}) {
  const split = snapshot.ledger.defaultSplitRule;
  const splitLabel =
    split.mode === 'ratio'
      ? `${split.memberAShareRatio}:${split.memberBShareRatio}`
      : `${formatJpy(split.memberAShareAmountJpy)} / ${formatJpy(split.memberBShareAmountJpy)}`;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>設定</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>家計簿名</Text>
        <Text style={styles.valueText}>{snapshot.ledger.name}</Text>
        <Text style={styles.fieldLabel}>あなた</Text>
        <Text style={styles.valueText}>{currentMember.displayName}</Text>
        <Text style={styles.fieldLabel}>招待コード</Text>
        <Text style={styles.inviteCode}>{snapshot.ledger.inviteCode}</Text>
        <Text style={styles.fieldLabel}>既定の共有分割</Text>
        <Text style={styles.valueText}>{splitLabel}</Text>
      </View>
      <Text style={styles.sectionTitle}>定期支出テンプレート</Text>
      {snapshot.recurringTemplates.map(template => (
        <View key={template.id} style={styles.card}>
          <Text style={styles.cardTitle}>{template.name}</Text>
          <Text style={styles.helpText}>
            {template.templateKind === 'fixed' ? '固定金額' : '変動金額'} ・ 毎月 {template.generationDay} 日
          </Text>
          <Text style={styles.valueText}>
            {template.amountJpy ? formatJpy(template.amountJpy) : '金額は未入力で生成'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function TransactionRow({
  transaction,
  categories,
  currentMember,
  partnerMember,
}: {
  transaction: Transaction;
  categories: Category[];
  currentMember: LedgerMember;
  partnerMember: LedgerMember;
}) {
  const category = categories.find(item => item.id === transaction.categoryId);
  const isPartnerPersonal =
    transaction.scope === 'personal' &&
    transaction.ownerMemberId === partnerMember.id;
  const note = isPartnerPersonal ? null : transaction.note;
  const amount =
    transaction.status === 'pending_amount'
      ? '未入力'
      : formatJpy(transaction.amountJpy ?? 0);

  return (
    <View style={styles.transactionRow}>
      <View style={[styles.categoryDot, {backgroundColor: category?.color ?? '#94a3b8'}]} />
      <View style={styles.transactionMain}>
        <Text style={styles.transactionTitle}>
          {category?.name ?? 'その他'} ・ {transaction.scope === 'shared' ? '共有' : transaction.ownerMemberId === currentMember.id ? '自分' : '相手'}
        </Text>
        <Text style={styles.transactionMeta}>
          {transaction.occurredOn}
          {note ? ` ・ ${note}` : ''}
        </Text>
      </View>
      <Text style={transaction.status === 'pending_amount' ? styles.pendingAmount : styles.transactionAmount}>
        {amount}
      </Text>
    </View>
  );
}

function MetricCard({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function MemberPicker({
  currentMember,
  partnerMember,
  value,
  onChange,
}: {
  currentMember: LedgerMember;
  partnerMember: LedgerMember;
  value: string;
  onChange: (memberId: string) => void;
}) {
  return (
    <View style={styles.segment}>
      <SegmentButton selected={value === currentMember.id} onPress={() => onChange(currentMember.id)} label="自分" />
      <SegmentButton selected={value === partnerMember.id} onPress={() => onChange(partnerMember.id)} label="相手" />
    </View>
  );
}

function SegmentButton({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.segmentButton, selected && styles.segmentButtonActive]} onPress={onPress}>
      <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Chip({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TabBar({
  active,
  setActive,
}: {
  active: TabKey;
  setActive: (tab: TabKey) => void;
}) {
  return (
    <View style={styles.tabBar}>
      {tabs.map(tab => (
        <Pressable key={tab.key} onPress={() => setActive(tab.key)} style={styles.tabItem}>
          <Text style={[styles.tabLabel, active === tab.key && styles.tabLabelActive]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '不明なエラーが発生しました。';
}

function withoutTransactionId(transaction: Transaction): Omit<Transaction, 'id'> {
  const input = {...transaction};
  delete (input as Partial<Transaction>).id;
  return input as Omit<Transaction, 'id'>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  appShell: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '800',
  },
  syncBadge: {
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  syncBadgeText: {
    color: '#075985',
    fontSize: 12,
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 112,
    gap: 14,
  },
  banner: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  bannerTitle: {
    color: '#92400e',
    fontSize: 14,
    fontWeight: '800',
  },
  bannerText: {
    color: '#92400e',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  heroPanel: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 20,
  },
  heroLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  heroAmount: {
    color: '#ffffff',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 8,
  },
  heroSub: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  linkText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    paddingVertical: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  amountInput: {
    height: 68,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldLabel: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  valueText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  helpText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    height: 50,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#ffffff',
  },
  segmentButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
  },
  segmentButtonTextActive: {
    color: '#0f172a',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#93c5fd',
  },
  chipText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  chipTextActive: {
    color: '#1d4ed8',
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 10,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  transactionMain: {
    flex: 1,
  },
  transactionTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
  transactionMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  transactionAmount: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  pendingAmount: {
    color: '#b45309',
    fontSize: 15,
    fontWeight: '900',
  },
  statRow: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 8,
  },
  statLabel: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
  statValue: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 999,
  },
  inviteCode: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 8},
    elevation: 6,
  },
  tabItem: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
  },
  tabLabelActive: {
    color: '#2563eb',
  },
});

export default App;
