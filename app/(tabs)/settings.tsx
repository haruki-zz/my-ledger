import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { BentoCard, SettingsActionRow } from '@/src/components/ui';
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

      <BentoCard variant="list">
        <SettingsActionRow
          description="管理显示名称、邮箱和登录状态。"
          icon="person-circle-outline"
          onPress={() => router.push('/settings/account')}
          title="账户信息"
        />
        <SettingsActionRow
          description="创建、加入、切换、退出或删除账本。"
          icon="albums-outline"
          onPress={() => router.push('/settings/ledgers')}
          title="账本管理"
        />
        <SettingsActionRow
          description="维护共享支出类别和默认分摊比例。"
          icon="pricetags-outline"
          onPress={() => router.push('/settings/categories')}
          title="类别管理"
        />
      </BentoCard>
    </ScrollView>
  );
}
