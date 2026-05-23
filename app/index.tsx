import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { isSupabaseConfigured } from '@/src/lib/supabase';

export default function HomeScreen() {
  const { session, loading } = useAuth();

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={[styles.muted, { marginTop: 10 }]}>正在读取登录状态</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/auth" />;
  }

  return <Redirect href="/ledger" />;
}
