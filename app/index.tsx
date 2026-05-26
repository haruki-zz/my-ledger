import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { useLedgerContext } from '@/src/context/LedgerContext';
import { isSupabaseConfigured } from '@/src/lib/supabase';

export default function HomeScreen() {
  const { session, loading } = useAuth();
  const { activeLedger, error, loading: ledgerLoading } = useLedgerContext();

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.center}>
        <Text style={styles.h1}>Supabase 尚未配置</Text>
        <Text style={[styles.muted, { marginTop: 8, textAlign: 'center' }]}>
          请根据 .env.example 配置 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_ANON_KEY。
        </Text>
      </View>
    );
  }

  if (loading || (session && ledgerLoading)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={[styles.muted, { marginTop: 10 }]}>
          {loading ? '正在读取登录状态' : '正在读取账本'}
        </Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/auth" />;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!activeLedger) {
    return <Redirect href="/ledger" />;
  }

  return <Redirect href="/(tabs)" />;
}
