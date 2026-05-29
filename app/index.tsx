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
        <Text style={styles.h1}>Supabase is not configured</Text>
        <Text style={[styles.muted, { marginTop: 8, textAlign: 'center' }]}>
          Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.example.
        </Text>
      </View>
    );
  }

  if (loading || (session && ledgerLoading)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={[styles.muted, { marginTop: 10 }]}>
          {loading ? 'Checking sign-in status' : 'Loading ledger'}
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
