import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { useAuth } from '@/src/context/AuthContext';
import { getMyLedger } from '@/src/lib/ledger';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import type { Ledger } from '@/src/types/database';

export default function HomeScreen() {
  const { session, loading } = useAuth();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [checkingLedger, setCheckingLedger] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadLedger() {
      if (!session) {
        setLedger(null);
        setCheckingLedger(false);
        return;
      }

      setCheckingLedger(true);
      setError(null);

      try {
        const nextLedger = await getMyLedger();
        if (active) {
          setLedger(nextLedger);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : '读取账本失败');
        }
      } finally {
        if (active) {
          setCheckingLedger(false);
        }
      }
    }

    loadLedger();

    return () => {
      active = false;
    };
  }, [session]);

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

  if (loading || checkingLedger) {
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

  if (!ledger) {
    return <Redirect href="/ledger" />;
  }

  return <Redirect href="/(tabs)" />;
}
