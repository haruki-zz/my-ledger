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

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { PRIMARY_CATEGORIES, categoryColor, categoryIconName } from '@/src/lib/categorySystem';
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
  const totalBudget = templates.reduce((sum, template) => sum + template.amount_yen, 0);

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

      <View style={localStyles.summary}>
        <View>
          <Text style={localStyles.summaryLabel}>Monthly category budget</Text>
          <Text style={localStyles.summaryAmount}>{formatYen(totalBudget)}</Text>
        </View>
        <View style={localStyles.summaryBadge}>
          <Ionicons color={colors.accent} name="wallet-outline" size={16} />
          <Text style={localStyles.summaryBadgeText}>{templates.length} set</Text>
        </View>
      </View>

      <View style={localStyles.list}>
        {PRIMARY_CATEGORIES.map((category) => {
          const template = templateByCategory.get(category.id);
          const draft = drafts[category.id] ?? '';
          const saving = savingCategoryId === category.id;
          return (
            <View key={category.id} style={localStyles.row}>
              <View style={localStyles.rowHeader}>
                <View style={[localStyles.iconBadge, { backgroundColor: `${categoryColor(category.id)}20` }]}>
                  <Ionicons color={categoryColor(category.id)} name={categoryIconName(category.id)} size={20} />
                </View>
                <View style={localStyles.rowTitleGroup}>
                  <Text numberOfLines={1} style={localStyles.rowTitle}>{category.label}</Text>
                  <Text style={localStyles.rowSubtitle}>{template ? 'Monthly budget set' : 'No budget set'}</Text>
                </View>
              </View>

              <View style={localStyles.editorRow}>
                <TextInput
                  accessibilityLabel={`${category.label} monthly budget`}
                  editable={!saving}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  onChangeText={(value) => updateDraft(category.id, value)}
                  placeholder="No budget"
                  placeholderTextColor={colors.subtle}
                  style={localStyles.input}
                  value={draft}
                />
                <Pressable
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
  clearButton: {
    backgroundColor: 'rgba(192,57,43,0.10)'
  },
  content: {
    gap: 14,
    padding: 20,
    paddingTop: 12
  },
  disabled: {
    opacity: 0.45
  },
  editorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    width: 46
  },
  input: {
    ...styles.input,
    flex: 1,
    fontFamily: fontFamilies.mono,
    fontSize: 17,
    minHeight: 46
  },
  list: {
    gap: 10
  },
  pressed: {
    opacity: 0.72
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    gap: 12,
    padding: 14,
    ...theme.glassShadow
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11
  },
  rowSubtitle: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18
  },
  rowTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23
  },
  rowTitleGroup: {
    flex: 1,
    minWidth: 0
  },
  saveButton: {
    backgroundColor: colors.primaryDark
  },
  summary: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
    ...theme.glassShadow
  },
  summaryAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34
  },
  summaryBadge: {
    alignItems: 'center',
    backgroundColor: colors.tint,
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  summaryBadgeText: {
    color: colors.accent,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18
  },
  summaryLabel: {
    color: colors.muted,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18
  }
});
