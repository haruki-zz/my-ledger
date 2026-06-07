import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import {
  AndroidKeyboardDoneButton,
  KEYBOARD_DONE_ACCESSORY_ID
} from '@/src/components/KeyboardDoneAccessory';
import { KeyboardAwareScrollView } from '@/src/components/KeyboardAwareScrollView';
import { colors, styles } from '@/src/components/styles';
import { BentoCard } from '@/src/components/ui';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';
import { runAfterKeyboardDismiss } from '@/src/lib/keyboard';
import { PRIMARY_CATEGORIES, resolveCategory } from '@/src/lib/categorySystem';
import {
  getErrorMessage,
  getLedgerCategories,
  getLedgerMembers,
  seedDefaultLedgerCategories,
  saveLedgerCategorySetting
} from '@/src/lib/ledger';
import { subscribeToLedgerData } from '@/src/lib/localEvents';
import type { LedgerCategory, LedgerMemberProfile } from '@/src/types/database';

function parseRatio(value: string) {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export default function CategorySettingsScreen() {
  const {
    error: ledgerError,
    ledger,
    loading: ledgerLoading,
    reloadLedger
  } = useRequiredLedger();
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[]>([]);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingRatioA, setEditingRatioA] = useState('50');
  const [editingRatioB, setEditingRatioB] = useState('50');
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryLoadSequenceRef = useRef(0);
  const legacySeedPromisesRef = useRef(new Map<string, Promise<void>>());

  async function seedLegacyCategories(ledgerId: string) {
    const existingPromise = legacySeedPromisesRef.current.get(ledgerId);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    const promise = seedDefaultLedgerCategories(ledgerId).finally(() => {
      legacySeedPromisesRef.current.delete(ledgerId);
    });

    legacySeedPromisesRef.current.set(ledgerId, promise);
    await promise;
  }

  const loadCategoryData = useCallback(async (currentLedger = ledger) => {
    const loadSequence = ++categoryLoadSequenceRef.current;

    if (!currentLedger) {
      if (loadSequence === categoryLoadSequenceRef.current) {
        setLoading(false);
      }
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const [nextMembers, loadedCategories] = await Promise.all([
        getLedgerMembers(currentLedger.id),
        getLedgerCategories(currentLedger.id)
      ]);
      let nextCategories = loadedCategories;

      if (nextCategories.length === 0) {
        await seedLegacyCategories(currentLedger.id);
        nextCategories = await getLedgerCategories(currentLedger.id);
      }

      if (loadSequence === categoryLoadSequenceRef.current) {
        setMembers(nextMembers);
        setCategories(nextCategories);
      }
    } catch (loadError) {
      if (loadSequence === categoryLoadSequenceRef.current) {
        setError(getErrorMessage(loadError));
      }
    } finally {
      if (loadSequence === categoryLoadSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [ledger]);

  const refresh = useCallback(async () => {
    const nextLedger = await reloadLedger();
    await loadCategoryData(nextLedger);
  }, [loadCategoryData, reloadLedger]);

  useEffect(() => {
    loadCategoryData();
  }, [loadCategoryData]);

  const ledgerId = ledger?.id;

  useEffect(() => {
    if (!ledgerId) {
      return undefined;
    }

    return subscribeToLedgerData(ledgerId, () => {
      void loadCategoryData();
    });
  }, [ledgerId, loadCategoryData]);

  const memberNames = useMemo(() => {
    const firstName = members[0]?.profile.display_name || 'Member A';
    const secondName = members[1]?.profile.display_name || 'Member B';
    return [firstName, secondName] as const;
  }, [members]);

  const categorySettingById = useMemo(() => new Map(
    categories.map((category) => [
      category.category_id || resolveCategory({ category: category.category_name }).categoryId,
      category
    ])
  ), [categories]);

  function beginEditCategory(categoryId: string, category: LedgerCategory | undefined) {
    const categoryDefinition = PRIMARY_CATEGORIES.find((item) => item.id === categoryId);
    setEditingCategoryId(categoryId);
    setEditingRatioA(String(category?.split_ratio_a ?? categoryDefinition?.splitRatio[0] ?? 50));
    setEditingRatioB(String(category?.split_ratio_b ?? categoryDefinition?.splitRatio[1] ?? 50));
  }

  async function saveCategory(categoryId: string, category: LedgerCategory | undefined) {
    if (!ledger) {
      return;
    }
    const categoryDefinition = PRIMARY_CATEGORIES.find((item) => item.id === categoryId);
    if (!categoryDefinition) {
      return;
    }

    const ratioA = parseRatio(editingRatioA);
    const ratioB = parseRatio(editingRatioB);
    if (ratioA === null || ratioB === null || ratioA + ratioB !== 100) {
      Alert.alert('Invalid Ratio', 'Both ratios must be integers from 0 to 100 and add up to 100.');
      return;
    }

    setSavingCategory(true);
    try {
      await saveLedgerCategorySetting({
        ledgerId: ledger.id,
        categoryId,
        categoryName: categoryDefinition.label,
        splitRatioA: ratioA,
        splitRatioB: ratioB,
        sortOrder: category?.sort_order ?? categoryDefinition.sortOrder
      });
      setEditingCategoryId(null);
      await refresh();
    } catch (saveError) {
      Alert.alert('Save Failed', saveError instanceof Error ? saveError.message : 'Please try again later');
    } finally {
      setSavingCategory(false);
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
    <KeyboardAwareScrollView
      refreshControl={<RefreshControl refreshing={ledgerLoading || loading} onRefresh={refresh} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>Category Rules</Text>
        <Text style={styles.muted}>Categories are built in; this ledger can only customize split ratios.</Text>
      </View>

      {ledgerError || error ? <Text style={styles.error}>{ledgerError || error}</Text> : null}

      <BentoCard variant="list">
        <Text style={styles.h2}>Default Split Ratios</Text>
        <View style={{ gap: 12 }}>
          {PRIMARY_CATEGORIES.map((categoryDefinition) => {
            const category = categorySettingById.get(categoryDefinition.id);
            const splitRatioA = category?.split_ratio_a ?? categoryDefinition.splitRatio[0];
            const splitRatioB = category?.split_ratio_b ?? categoryDefinition.splitRatio[1];
            const isEditing = editingCategoryId === categoryDefinition.id;

            return (
              <View
                key={categoryDefinition.id}
                style={{
                  borderColor: colors.line,
                  backgroundColor: 'rgba(255,255,255,0.58)',
                  borderRadius: 16,
                  borderWidth: 1,
                  gap: 10,
                  padding: 12
                }}
              >
                <View style={styles.between}>
                  <View style={{ alignItems: 'center', flexDirection: 'row', flex: 1, gap: 10, minWidth: 0 }}>
                    <View style={{
                      alignItems: 'center',
                      backgroundColor: 'rgba(15,118,110,0.10)',
                      borderRadius: 14,
                      height: 40,
                      justifyContent: 'center',
                      width: 40
                    }}>
                      <Ionicons color={categoryDefinition.color} name={categoryDefinition.icon} size={22} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.h2}>{categoryDefinition.label}</Text>
                      <Text style={styles.muted}>
                        {memberNames[0]} {splitRatioA}% · {memberNames[1]} {splitRatioB}%
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => runAfterKeyboardDismiss(() => beginEditCategory(categoryDefinition.id, category))}
                    style={[styles.button, { minHeight: 40 }]}
                  >
                    <Text style={styles.buttonText}>Edit</Text>
                  </Pressable>
                </View>

                {isEditing ? (
                  <View style={{ gap: 10 }}>
                    <View style={styles.row}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.label}>{memberNames[0]} Ratio</Text>
                        <TextInput
                          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                          inputMode="numeric"
                          keyboardType="number-pad"
                          onChangeText={(value) => {
                            setEditingRatioA(value);
                            const ratioA = parseRatio(value);
                            if (ratioA !== null) {
                              setEditingRatioB(String(100 - ratioA));
                            }
                          }}
                          returnKeyType="done"
                          style={styles.input}
                          submitBehavior="blurAndSubmit"
                          value={editingRatioA}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.label}>{memberNames[1]} Ratio</Text>
                        <TextInput
                          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
                          inputMode="numeric"
                          keyboardType="number-pad"
                          onChangeText={(value) => {
                            setEditingRatioB(value);
                            const ratioB = parseRatio(value);
                            if (ratioB !== null) {
                              setEditingRatioA(String(100 - ratioB));
                            }
                          }}
                          returnKeyType="done"
                          style={styles.input}
                          submitBehavior="blurAndSubmit"
                          value={editingRatioB}
                        />
                      </View>
                    </View>

                    <AndroidKeyboardDoneButton />

                    <View style={styles.row}>
                        <Pressable
                        disabled={savingCategory}
                        onPress={() => runAfterKeyboardDismiss(() => saveCategory(categoryDefinition.id, category))}
                        style={[styles.button, { flex: 1 }]}
                      >
                        <Text style={styles.buttonText}>{savingCategory ? 'Saving...' : 'Save'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => runAfterKeyboardDismiss(() => setEditingCategoryId(null))}
                        style={[styles.button, styles.secondaryButton, { flex: 1 }]}
                      >
                        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

              </View>
            );
          })}

          {categories.length === 0 ? <Text style={styles.muted}>Using built-in default ratios until this ledger is customized.</Text> : null}
        </View>
      </BentoCard>
    </KeyboardAwareScrollView>
  );
}
