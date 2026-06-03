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
import {
  deleteLedgerCategory,
  getErrorMessage,
  getLedgerCategories,
  getLedgerMembers,
  seedDefaultLedgerCategories,
  saveLedgerCategory
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
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
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

  function beginEditCategory(category: LedgerCategory) {
    setEditingCategoryName(category.category_name);
    setEditingRatioA(String(category.split_ratio_a));
    setEditingRatioB(String(category.split_ratio_b));
  }

  async function saveCategory(category: LedgerCategory) {
    if (!ledger) {
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
      await saveLedgerCategory({
        ledgerId: ledger.id,
        categoryName: category.category_name,
        splitRatioA: ratioA,
        splitRatioB: ratioB,
        sortOrder: category.sort_order
      });
      setEditingCategoryName(null);
      await refresh();
    } catch (saveError) {
      Alert.alert('Save Failed', saveError instanceof Error ? saveError.message : 'Please try again later');
    } finally {
      setSavingCategory(false);
    }
  }

  async function addCategory() {
    if (!ledger) {
      return;
    }

    const categoryName = newCategoryName.trim();
    if (!categoryName) {
      Alert.alert('Category name cannot be empty');
      return;
    }

    setSavingCategory(true);
    try {
      const nextSortOrder = Math.max(0, ...categories.map((category) => category.sort_order)) + 10;
      await saveLedgerCategory({
        ledgerId: ledger.id,
        categoryName,
        splitRatioA: 50,
        splitRatioB: 50,
        sortOrder: nextSortOrder
      });
      setNewCategoryName('');
      await refresh();
    } catch (saveError) {
      Alert.alert('Add Failed', saveError instanceof Error ? saveError.message : 'Please try again later');
    } finally {
      setSavingCategory(false);
    }
  }

  function confirmDeleteCategory(category: LedgerCategory) {
    if (!ledger) {
      return;
    }

    if (categories.length <= 1) {
      Alert.alert('Cannot Delete', 'Keep at least one expense category.');
      return;
    }

    Alert.alert('Delete Category', `After deleting "${category.category_name}", historical expenses will keep this category name.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLedgerCategory(ledger.id, category.category_name);
            await refresh();
          } catch (deleteError) {
            Alert.alert('Delete Failed', deleteError instanceof Error ? deleteError.message : 'Please try again later');
          }
        }
      }
    ]);
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
        <Text style={styles.title}>Categories</Text>
        <Text style={styles.muted}>Shared expense categories and default split ratios</Text>
      </View>

      {ledgerError || error ? <Text style={styles.error}>{ledgerError || error}</Text> : null}

      <BentoCard variant="list">
        <Text style={styles.h2}>Current Categories</Text>
        <View style={{ gap: 12 }}>
          {categories.map((category) => {
            const isEditing = editingCategoryName === category.category_name;

            return (
              <View
                key={category.id}
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
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h2}>{category.category_name}</Text>
                    <Text style={styles.muted}>
                      {memberNames[0]} {category.split_ratio_a}% · {memberNames[1]} {category.split_ratio_b}%
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => runAfterKeyboardDismiss(() => beginEditCategory(category))}
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
                        onPress={() => runAfterKeyboardDismiss(() => saveCategory(category))}
                        style={[styles.button, { flex: 1 }]}
                      >
                        <Text style={styles.buttonText}>{savingCategory ? 'Saving...' : 'Save'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => runAfterKeyboardDismiss(() => setEditingCategoryName(null))}
                        style={[styles.button, styles.secondaryButton, { flex: 1 }]}
                      >
                        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                <Pressable
                  onPress={() => runAfterKeyboardDismiss(() => confirmDeleteCategory(category))}
                  style={[styles.button, styles.dangerButton]}
                >
                  <Text style={styles.buttonText}>Delete</Text>
                </Pressable>
              </View>
            );
          })}

          {categories.length === 0 ? <Text style={styles.muted}>No categories yet.</Text> : null}
        </View>

        <View style={{ gap: 10 }}>
          <Text style={styles.label}>New Category</Text>
          <TextInput
            inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
            onChangeText={setNewCategoryName}
            placeholder="Example: Coffee"
            returnKeyType="done"
            style={styles.input}
            submitBehavior="blurAndSubmit"
            value={newCategoryName}
          />
          <Pressable disabled={savingCategory} onPress={() => runAfterKeyboardDismiss(addCategory)} style={styles.button}>
            <Text style={styles.buttonText}>{savingCategory ? 'Adding...' : 'Add'}</Text>
          </Pressable>
        </View>
      </BentoCard>
    </KeyboardAwareScrollView>
  );
}
