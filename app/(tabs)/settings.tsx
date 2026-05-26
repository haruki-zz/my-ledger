import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { useRequiredLedger } from '@/src/hooks/useRequiredLedger';

export default function SettingsScreen() {
  const { error, ledger, loading } = useRequiredLedger();

  if (loading && !ledger) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.title}>设置</Text>
        <Text style={styles.muted}>账户、账本和共享类别</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.h2}>账户信息</Text>
        <Text style={styles.muted}>管理显示名称、邮箱和登录状态。</Text>
        <Pressable onPress={() => router.push('/settings/account')} style={styles.button}>
          <Text style={styles.buttonText}>进入账户信息</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>账本管理</Text>
        <Text style={styles.muted}>创建、加入、切换、退出或删除账本。</Text>
        <Pressable onPress={() => router.push('/settings/ledgers')} style={styles.button}>
          <Text style={styles.buttonText}>进入账本管理</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>类别管理</Text>
        <Text style={styles.muted}>维护共享支出类别和默认分摊比例。</Text>
        <Pressable onPress={() => router.push('/settings/categories')} style={styles.button}>
          <Text style={styles.buttonText}>进入类别管理</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
