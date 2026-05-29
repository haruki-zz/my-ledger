import { router, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { styles } from '@/src/components/styles';
import { BentoCard, PillTabs } from '@/src/components/ui';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';

export default function AuthScreen() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'signIn') {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (authError) {
          throw authError;
        }

        router.replace('/');
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim() || email.trim().split('@')[0] || 'User'
            }
          }
        });
        if (authError) {
          throw authError;
        }

        if (data.session) {
          router.replace('/');
          return;
        }

        Alert.alert('Sign-up complete', 'If email confirmation is enabled in Supabase, confirm your email before signing in.');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={[styles.muted, { marginTop: 10 }]}>Checking sign-in status</Text>
      </View>
    );
  }

  if (session) {
    return <Redirect href="/" />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.page}
    >
      <View style={styles.content}>
        <View>
          <Text style={styles.title}>Shared Expense Ledger</Text>
          <Text style={styles.muted}>Sync daily expenses with Supabase.</Text>
        </View>

        <PillTabs
          accessibilityLabel="Auth mode"
          onChange={setMode}
          options={[
            { label: 'Sign In', value: 'signIn' },
            { label: 'Sign Up', value: 'signUp' }
          ]}
          value={mode}
        />

        <BentoCard variant="form">
          {mode === 'signUp' ? (
            <>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setDisplayName}
                placeholder="Example: Alex"
                style={styles.input}
                value={displayName}
              />
            </>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable disabled={submitting} onPress={submit} style={styles.button}>
            <Text style={styles.buttonText}>{submitting ? 'Submitting...' : mode === 'signIn' ? 'Sign In' : 'Sign Up'}</Text>
          </Pressable>
        </BentoCard>
      </View>
    </KeyboardAvoidingView>
  );
}
