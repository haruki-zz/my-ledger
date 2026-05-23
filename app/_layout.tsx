import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/src/context/AuthContext';

export default function RootLayout() {
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
        <Stack.Screen name="expenses/index" options={{ title: '支出明细' }} />
        <Stack.Screen name="expenses/new" options={{ title: '记一笔' }} />
        <Stack.Screen name="expenses/[id]" options={{ title: '编辑支出' }} />
      </Stack>
    </AuthProvider>
  );
}
