import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, styles } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { PRIMARY_CATEGORIES, categoryColor } from '@/src/lib/categorySystem';
import { formatYen } from '@/src/lib/format';
import {
  deleteBudgetTemplate,
  getBudgetTemplates,
  getErrorMessage,
  saveBudgetTemplate
} from '@/src/lib/ledger';
import type { BudgetTemplate } from '@/src/types/database';

type DraftByCategory = Record<string, string>;

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { error: ledgerError, ledger, loading: ledgerLoading } = useRequiredLedger();
  const ledgerId = ledger?.id || null;
  const currentUserId = session?.user.id || null;
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [drafts, setDrafts] = useState<DraftByCategory>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const templateByCategory = useMemo(() => (
    new Map(templates
      .filter((template) => template.scope === 'category' && template.category_id)
      .map((template) => [template.category_id as string, template]))
  ), [templates]);
  const liveTotalBudget = PRIMARY_CATEGORIES.reduce((sum, category) => sum + Number(drafts[category.id] || 0), 0);
  const liveCategoryCount = PRIMARY_CATEGORIES.filter((category) => Number(drafts[category.id] || 0) > 0).length;

  const loadBudgets = useCallback(async (options?: { userInitiated?: boolean }) => {
    if (!ledgerId || !currentUserId) {
      setTemplates([]);
      setDrafts({});
      setLoading(false);
      return;
    }

    setDetailsError(null);
    setLoading((current) => current && !options?.userInitiated);
    setRefreshing(Boolean(options?.userInitiated));

    try {
      const nextTemplates = await getBudgetTemplates(ledgerId, currentUserId, { refreshFirst: true });
      setTemplates(nextTemplates);
      setDrafts(Object.fromEntries(nextTemplates
        .filter((template) => template.scope === 'category' && template.category_id)
        .map((template) => [template.category_id as string, String(template.amount_yen)])));
    } catch (loadError) {
      setDetailsError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId, ledgerId]);

  useFocusEffect(useCallback(() => {
    void loadBudgets();
  }, [loadBudgets]));

  async function refresh() {
    await loadBudgets({ userInitiated: true });
  }

  function updateDraft(categoryId: string, value: string) {
    setDrafts((current) => ({
      ...current,
      [categoryId]: value.replace(/[^\d]/g, '')
    }));
  }

  async function saveCategory(categoryId: string) {
    if (!ledgerId || !currentUserId || savingCategoryId) {
      return;
    }

    const draft = drafts[categoryId] ?? '';
    if (draft.trim() === '') {
      Alert.alert('Budget Required', 'Enter a monthly budget amount, or clear the existing budget.');
      return;
    }

    const amountYen = Number(draft);
    if (!Number.isSafeInteger(amountYen) || amountYen < 0) {
      Alert.alert('Invalid Budget', 'Enter a valid whole-yen amount.');
      return;
    }

    const existing = templateByCategory.get(categoryId);
    setSavingCategoryId(categoryId);
    try {
      const saved = await saveBudgetTemplate({
        id: existing?.id,
        ledgerId,
        memberId: currentUserId,
        categoryId,
        amountYen
      });
      setTemplates((current) => upsertTemplate(current, saved));
      setDrafts((current) => ({ ...current, [categoryId]: String(saved.amount_yen) }));
    } catch (saveError) {
      Alert.alert('Save Failed', getErrorMessage(saveError));
    } finally {
      setSavingCategoryId(null);
    }
  }

  async function clearCategory(categoryId: string) {
    if (!ledgerId || savingCategoryId) {
      return;
    }

    const existing = templateByCategory.get(categoryId);
    if (!existing) {
      setDrafts((current) => ({ ...current, [categoryId]: '' }));
      return;
    }

    setSavingCategoryId(categoryId);
    try {
      await deleteBudgetTemplate(ledgerId, existing.id);
      setTemplates((current) => current.filter((template) => template.id !== existing.id));
      setDrafts((current) => ({ ...current, [categoryId]: '' }));
    } catch (clearError) {
      Alert.alert('Clear Failed', getErrorMessage(clearError));
    } finally {
      setSavingCategoryId(null);
    }
  }

  if ((ledgerLoading || loading) && !ledger) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[localStyles.content, { paddingBottom: 36 + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      style={styles.page}
    >
      {ledgerError || detailsError ? <Text selectable style={styles.error}>{ledgerError || detailsError}</Text> : null}

      <Text style={localStyles.ledgerSubtitle}>{ledger?.name || 'Current ledger'}</Text>

      <View style={localStyles.summary}>
        <Text style={localStyles.summaryLabel}>MONTHLY BUDGET</Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.summaryAmount}>
          {formatYen(liveTotalBudget)}
        </Text>
        <Text style={localStyles.summaryMeta}>
          across {liveCategoryCount} of {PRIMARY_CATEGORIES.length} categories
        </Text>
      </View>

      <View style={localStyles.list}>
        {PRIMARY_CATEGORIES.map((category, index) => {
          const template = templateByCategory.get(category.id);
          const draft = drafts[category.id] ?? '';
          const saving = savingCategoryId === category.id;
          const accent = categoryColor(category.id);
          return (
            <View key={category.id}>
              {index > 0 ? <View style={localStyles.insetDivider} /> : null}
              <View style={localStyles.row}>
                <View style={localStyles.rowHeader}>
                  <View style={[localStyles.categorySwatch, { backgroundColor: accent }]} />
                  <View style={localStyles.rowTitleGroup}>
                    <Text numberOfLines={1} style={localStyles.rowTitle}>{category.label}</Text>
                    <Text style={localStyles.rowSubtitle}>{template ? 'Monthly budget set' : 'No budget set'}</Text>
                  </View>
                </View>

                <View style={localStyles.editorRow}>
                  <View style={localStyles.amountField}>
                    <Text style={localStyles.yenPrefix}>¥</Text>
                    <TextInput
                      accessibilityLabel={`${category.label} monthly budget`}
                      editable={!saving}
                      inputMode="numeric"
                      keyboardType="number-pad"
                      onChangeText={(value) => updateDraft(category.id, value)}
                      placeholder="0"
                      placeholderTextColor={colors.subtle}
                      style={localStyles.input}
                      value={draft}
                    />
                  </View>
                  <Pressable
                    accessibilityLabel={`Save ${category.label} budget`}
                    disabled={saving || draft === ''}
                    onPress={() => {
                      void saveCategory(category.id);
                    }}
                    style={({ pressed }) => [
                      localStyles.iconButton,
                      localStyles.saveButton,
                      (saving || draft === '') && localStyles.disabled,
                      pressed && !saving && draft !== '' && localStyles.pressed
                    ]}
                  >
                    {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons color="#FFFFFF" name="checkmark" size={18} />}
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Clear ${category.label} budget`}
                    disabled={saving || (!template && draft === '')}
                    onPress={() => {
                      void clearCategory(category.id);
                    }}
                    style={({ pressed }) => [
                      localStyles.iconButton,
                      localStyles.clearButton,
                      (saving || (!template && draft === '')) && localStyles.disabled,
                      pressed && !saving && localStyles.pressed
                    ]}
                  >
                    <Ionicons color={colors.danger} name="trash-outline" size={17} />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function upsertTemplate(templates: BudgetTemplate[], nextTemplate: BudgetTemplate) {
  const exists = templates.some((template) => template.id === nextTemplate.id);
  if (!exists) {
    return [...templates, nextTemplate];
  }
  return templates.map((template) => template.id === nextTemplate.id ? nextTemplate : template);
}

const localStyles = StyleSheet.create({
  amountField: {
    alignItems: 'center',
    backgroundColor: 'rgba(42,39,34,0.04)',
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 42,
    minWidth: 0,
    paddingHorizontal: 10
  },
  categorySwatch: {
    borderRadius: 6,
    height: 34,
    width: 8
  },
  clearButton: {
    backgroundColor: 'rgba(192,57,43,0.10)'
  },
  content: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 720,
    padding: 18,
    width: '100%'
  },
  disabled: {
    opacity: 0.45
  },
  editorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 15,
    fontWeight: '800',
    minWidth: 0,
    padding: 0
  },
  insetDivider: {
    backgroundColor: 'rgba(42,39,34,0.08)',
    height: StyleSheet.hairlineWidth,
    marginLeft: 58
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
  list: {
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
  pressed: {
    opacity: 0.72
  },
  row: {
    gap: 12,
    padding: 14
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11
  },
  rowSubtitle: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  },
  rowTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  rowTitleGroup: {
    flex: 1,
    minWidth: 0
  },
  saveButton: {
    backgroundColor: colors.primary
  },
  summary: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    gap: 4,
    padding: 18
  },
  summaryAmount: {
    color: '#FFFDF7',
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38
  },
  summaryLabel: {
    color: 'rgba(255,253,247,0.58)',
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.4,
    lineHeight: 13
  },
  summaryMeta: {
    color: 'rgba(255,253,247,0.58)',
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17
  },
  yenPrefix: {
    color: colors.muted,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
    marginRight: 4
  }
});
