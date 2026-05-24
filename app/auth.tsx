import { router, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { styles } from '@/src/components/styles';
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
              display_name: displayName.trim() || email.trim().split('@')[0] || '用户'
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

        Alert.alert('注册完成', '如果 Supabase 开启了邮箱确认，请先完成邮箱验证后再登录。');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={[styles.muted, { marginTop: 10 }]}>正在读取登录状态</Text>
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
          <Text style={styles.title}>两人共享记账</Text>
          <Text style={styles.muted}>用 Supabase 同步你们的日常支出。</Text>
        </View>

        <View style={styles.row}>
          <Pressable
            onPress={() => setMode('signIn')}
            style={[styles.chip, mode === 'signIn' && styles.chipActive]}
          >
            <Text style={styles.chipText}>登录</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('signUp')}
            style={[styles.chip, mode === 'signUp' && styles.chipActive]}
          >
            <Text style={styles.chipText}>注册</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          {mode === 'signUp' ? (
            <>
              <Text style={styles.label}>显示名称</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setDisplayName}
                placeholder="例如：小林"
                style={styles.input}
                value={displayName}
              />
            </>
          ) : null}

          <Text style={styles.label}>邮箱</Text>
          <TextInput
            autoCapitalize="none"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>密码</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="至少 6 位"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable disabled={submitting} onPress={submit} style={styles.button}>
            <Text style={styles.buttonText}>{submitting ? '提交中...' : mode === 'signIn' ? '登录' : '注册'}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
