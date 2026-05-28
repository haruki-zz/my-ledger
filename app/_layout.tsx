import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text } from 'react-native';

import { colors } from '@/src/components/styles';
import { AuthProvider } from '@/src/context/AuthContext';
import { LedgerProvider } from '@/src/context/LedgerContext';

export default function RootLayout() {
  function dismissNewExpense() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/history');
  }

  return (
    <AuthProvider>
      <LedgerProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            headerTitleStyle: { color: colors.ink, fontWeight: '800' }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ title: '登录' }} />
          <Stack.Screen name="ledger" options={{ title: '共享账本' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* Settings detail screens */}
          <Stack.Screen name="settings/account" options={{ headerBackTitle: '设置', title: '账户信息' }} />
          <Stack.Screen name="settings/categories" options={{ headerBackTitle: '设置', title: '类别管理' }} />
          <Stack.Screen name="settings/ledgers" options={{ headerBackTitle: '设置', title: '账本管理' }} />
          <Stack.Screen name="settings/ledger/[id]" options={{ headerBackTitle: '账本管理', title: '账本详情' }} />
          {/* Expense detail screens */}
          <Stack.Screen
            name="expenses/new"
            options={{
              headerLeft: () => (
                <Pressable onPress={dismissNewExpense}>
                  <Text style={{ color: colors.primaryDark, fontSize: 16, fontWeight: '700' }}>取消</Text>
                </Pressable>
              ),
              presentation: 'modal',
              title: '记一笔'
            }}
          />
          <Stack.Screen name="expenses/[id]" options={{ headerBackTitle: '明细', title: '编辑支出' }} />
        </Stack>
      </LedgerProvider>
    </AuthProvider>
  );
}
