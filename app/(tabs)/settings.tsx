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
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.muted}>Account, ledgers, and shared categories</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BentoCard variant="list">
        <SettingsActionRow
          description="Manage display name, email, and sign-in status."
          icon="person-circle-outline"
          onPress={() => router.push('/settings/account')}
          title="Account"
        />
        <SettingsActionRow
          description="Create, join, switch, leave, or delete ledgers."
          icon="albums-outline"
          onPress={() => router.push('/settings/ledgers')}
          title="Ledgers"
        />
        <SettingsActionRow
          description="Maintain shared expense categories and default split ratios."
          icon="pricetags-outline"
          onPress={() => router.push('/settings/categories')}
          title="Categories"
        />
      </BentoCard>
    </ScrollView>
  );
}
