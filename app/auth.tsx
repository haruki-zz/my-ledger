import { router, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { KEYBOARD_DONE_ACCESSORY_ID } from '@/src/components/KeyboardDoneAccessory';
import { KeyboardAwareScrollView } from '@/src/components/KeyboardAwareScrollView';
import { styles } from '@/src/components/styles';
import { BentoCard, PillTabs } from '@/src/components/ui';
import { useAuth } from '@/src/context/AuthContext';
import { runAfterKeyboardDismiss } from '@/src/lib/keyboard';
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
    <KeyboardAwareScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.title}>Shared Expense Ledger</Text>
        <Text style={styles.muted}>Sync daily expenses with Supabase.</Text>
      </View>

      <PillTabs
        accessibilityLabel="Auth mode"
        onChange={(nextMode) => runAfterKeyboardDismiss(() => setMode(nextMode))}
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
              inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
              onChangeText={setDisplayName}
              placeholder="Example: Alex"
              returnKeyType="done"
              style={styles.input}
              submitBehavior="blurAndSubmit"
              value={displayName}
            />
          </>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          inputMode="email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          returnKeyType="done"
          style={styles.input}
          submitBehavior="blurAndSubmit"
          value={email}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          inputAccessoryViewID={KEYBOARD_DONE_ACCESSORY_ID}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          returnKeyType="done"
          secureTextEntry
          style={styles.input}
          submitBehavior="blurAndSubmit"
          value={password}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable disabled={submitting} onPress={() => runAfterKeyboardDismiss(submit)} style={styles.button}>
          <Text style={styles.buttonText}>{submitting ? 'Submitting...' : mode === 'signIn' ? 'Sign In' : 'Sign Up'}</Text>
        </Pressable>
      </BentoCard>
    </KeyboardAwareScrollView>
  );
}
