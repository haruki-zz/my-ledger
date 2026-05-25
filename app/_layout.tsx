import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text } from 'react-native';

import { colors } from '@/src/components/styles';
import { AuthProvider } from '@/src/context/AuthContext';

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
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#F5F7FA' },
          headerShadowVisible: false,
          headerTitleStyle: { color: '#17202A', fontWeight: '800' }
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ title: '登录' }} />
        <Stack.Screen name="ledger" options={{ title: '共享账本' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Settings detail screens */}
        <Stack.Screen name="settings/account" options={{ headerBackTitle: '设置', title: '账户信息' }} />
        <Stack.Screen name="settings/categories" options={{ headerBackTitle: '设置', title: '类别管理' }} />
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
    </AuthProvider>
  );
}
