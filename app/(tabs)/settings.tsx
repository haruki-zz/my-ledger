import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, styles } from '@/src/components/styles';
import {
  deleteLedgerCategory,
  getErrorMessage,
  getLedgerCategories,
  getLedgerMembers,
  getMyLedger,
  saveLedgerCategory,
  updateMyProfile
} from '@/src/lib/ledger';
import { supabase } from '@/src/lib/supabase';
import type { Ledger, LedgerCategory, LedgerMemberProfile } from '@/src/types/database';

let realtimeSubscriptionSequence = 0;

function parseRatio(value: string) {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export default function SettingsScreen() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMemberProfile[]>([]);
  const [categories, setCategories] = useState<LedgerCategory[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
  const [editingRatioA, setEditingRatioA] = useState('50');
  const [editingRatioB, setEditingRatioB] = useState('50');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }

      if (!userData.user) {
        router.replace('/auth');
        return;
      }

      const currentLedger = await getMyLedger();
      if (!currentLedger) {
        router.replace('/ledger');
        return;
      }

      const [nextMembers, nextCategories] = await Promise.all([
        getLedgerMembers(currentLedger.id),
        getLedgerCategories(currentLedger.id)
      ]);
      const currentMember = nextMembers.find((member) => member.user_id === userData.user?.id);

      setCurrentUserId(userData.user.id);
      setEmail(userData.user.email || '');
      setDisplayNameInput(currentMember?.profile.display_name || '用户');
      setLedger(currentLedger);
      setMembers(nextMembers);
      setCategories(nextCategories);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ledgerId = ledger?.id;

  useEffect(() => {
    if (!ledgerId) {
      return undefined;
    }

    const subscriptionId = ++realtimeSubscriptionSequence;
    const channel = supabase
      .channel(`ledger-categories-${ledgerId}-${subscriptionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ledger_categories',
          filter: `ledger_id=eq.${ledgerId}`
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ledgerId, load]);

  const memberNames = useMemo(() => {
    const firstName = members[0]?.profile.display_name || '成员 A';
    const secondName = members[1]?.profile.display_name || '成员 B';
    return [firstName, secondName] as const;
  }, [members]);

  function beginEditCategory(category: LedgerCategory) {
    setEditingCategoryName(category.category_name);
    setEditingRatioA(String(category.split_ratio_a));
    setEditingRatioB(String(category.split_ratio_b));
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await updateMyProfile(displayNameInput);
      await load();
    } catch (saveError) {
      Alert.alert('保存失败', saveError instanceof Error ? saveError.message : '请稍后重试');
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveCategory(category: LedgerCategory) {
    if (!ledger) {
      return;
    }

    const ratioA = parseRatio(editingRatioA);
    const ratioB = parseRatio(editingRatioB);
    if (ratioA === null || ratioB === null || ratioA + ratioB !== 100) {
      Alert.alert('比例无效', '双方比例必须是 0 到 100 的整数，且相加等于 100。');
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
      await load();
    } catch (saveError) {
      Alert.alert('保存失败', saveError instanceof Error ? saveError.message : '请稍后重试');
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
      Alert.alert('类别名称不能为空');
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
      await load();
    } catch (saveError) {
      Alert.alert('添加失败', saveError instanceof Error ? saveError.message : '请稍后重试');
    } finally {
      setSavingCategory(false);
    }
  }

  function confirmDeleteCategory(category: LedgerCategory) {
    if (!ledger) {
      return;
    }

    if (categories.length <= 1) {
      Alert.alert('无法删除', '至少需要保留一个支出类别。');
      return;
    }

    Alert.alert('删除类别', `删除“${category.category_name}”后，历史支出仍会保留该类别名称。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLedgerCategory(ledger.id, category.category_name);
            await load();
          } catch (deleteError) {
            Alert.alert('删除失败', deleteError instanceof Error ? deleteError.message : '请稍后重试');
          }
        }
      }
    ]);
  }

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      Alert.alert('退出失败', signOutError.message);
      return;
    }

    router.replace('/auth');
  }

  if (loading && !ledger) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      style={styles.page}
      contentContainerStyle={styles.content}
    >
      <View>
        <Text style={styles.title}>设置</Text>
        <Text style={styles.muted}>账户、账本和共享类别</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.h2}>账户信息</Text>
        <Text style={styles.label}>显示名称</Text>
        <TextInput onChangeText={setDisplayNameInput} style={styles.input} value={displayNameInput} />
        <Pressable disabled={savingProfile} onPress={saveProfile} style={styles.button}>
          <Text style={styles.buttonText}>{savingProfile ? '保存中...' : '保存名称'}</Text>
        </Pressable>

        <Text style={styles.label}>邮箱</Text>
        <View style={[styles.input, { justifyContent: 'center' }]}>
          <Text style={styles.body}>{email || '未设置'}</Text>
        </View>

        <Pressable onPress={signOut} style={[styles.button, styles.secondaryButton]}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>退出登录</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>账本信息</Text>
        <Text style={styles.label}>账本名称</Text>
        <Text style={styles.body}>{ledger?.name || '共享账本'}</Text>
        <Text style={styles.label}>邀请码</Text>
        <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '900' }}>{ledger?.invite_code || '-'}</Text>
        <Text style={styles.label}>成员</Text>
        <View style={{ gap: 8 }}>
          {members.map((member) => (
            <Text key={member.user_id} style={styles.body}>
              {member.profile.display_name}{member.user_id === currentUserId ? '（我）' : ''}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>类别管理</Text>
        <View style={{ gap: 12 }}>
          {categories.map((category) => {
            const isEditing = editingCategoryName === category.category_name;

            return (
              <View
                key={category.id}
                style={{
                  borderColor: colors.line,
                  borderRadius: 8,
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
                  <Pressable onPress={() => beginEditCategory(category)} style={[styles.button, { minHeight: 40 }]}>
                    <Text style={styles.buttonText}>编辑</Text>
                  </Pressable>
                </View>

                {isEditing ? (
                  <View style={{ gap: 10 }}>
                    <View style={styles.row}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.label}>{memberNames[0]}比例</Text>
                        <TextInput
                          inputMode="numeric"
                          onChangeText={(value) => {
                            setEditingRatioA(value);
                            const ratioA = parseRatio(value);
                            if (ratioA !== null) {
                              setEditingRatioB(String(100 - ratioA));
                            }
                          }}
                          style={styles.input}
                          value={editingRatioA}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.label}>{memberNames[1]}比例</Text>
                        <TextInput
                          inputMode="numeric"
                          onChangeText={(value) => {
                            setEditingRatioB(value);
                            const ratioB = parseRatio(value);
                            if (ratioB !== null) {
                              setEditingRatioA(String(100 - ratioB));
                            }
                          }}
                          style={styles.input}
                          value={editingRatioB}
                        />
                      </View>
                    </View>

                    <View style={styles.row}>
                      <Pressable
                        disabled={savingCategory}
                        onPress={() => saveCategory(category)}
                        style={[styles.button, { flex: 1 }]}
                      >
                        <Text style={styles.buttonText}>{savingCategory ? '保存中...' : '保存'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setEditingCategoryName(null)}
                        style={[styles.button, styles.secondaryButton, { flex: 1 }]}
                      >
                        <Text style={[styles.buttonText, styles.secondaryButtonText]}>取消</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                <Pressable onPress={() => confirmDeleteCategory(category)} style={[styles.button, styles.dangerButton]}>
                  <Text style={styles.buttonText}>删除</Text>
                </Pressable>
              </View>
            );
          })}

          {categories.length === 0 ? <Text style={styles.muted}>暂无类别。</Text> : null}
        </View>

        <View style={{ gap: 10 }}>
          <Text style={styles.label}>新增类别</Text>
          <TextInput
            onChangeText={setNewCategoryName}
            placeholder="例如：咖啡"
            style={styles.input}
            value={newCategoryName}
          />
          <Pressable disabled={savingCategory} onPress={addCategory} style={styles.button}>
            <Text style={styles.buttonText}>{savingCategory ? '添加中...' : '添加'}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
