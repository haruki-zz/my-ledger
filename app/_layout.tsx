import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
  useFonts
} from '@expo-google-fonts/jetbrains-mono';
import { Ionicons } from '@expo/vector-icons';
import { SplashScreen, Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable } from 'react-native';

import { colors, fontFamilies } from '@/src/components/styles';
import { AuthProvider } from '@/src/context/AuthContext';
import { LedgerProvider } from '@/src/context/LedgerContext';
import { SyncProvider } from '@/src/context/SyncContext';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
    JetBrainsMono_800ExtraBold
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  function dismissExpense() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/history');
  }

  if (!fontsLoaded && !fontError) {
    return null;
  }

  const resolvedRegularFont = fontError ? fontFamilies.fallback : fontFamilies.regular;
  const resolvedHeaderFont = fontError ? fontFamilies.fallback : fontFamilies.bold;
  const expenseHeaderLeft = () => (
    <Pressable accessibilityLabel="Go back" onPress={dismissExpense}>
      <Ionicons color={colors.ink} name="arrow-back" size={30} />
    </Pressable>
  );

  return (
    <AuthProvider>
      <SyncProvider>
        <LedgerProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerShadowVisible: false,
              headerTitleStyle: {
                color: colors.ink,
                fontFamily: resolvedHeaderFont,
                fontWeight: '700'
              },
              headerBackTitleStyle: {
                fontFamily: resolvedRegularFont
              }
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ title: 'Sign In' }} />
            <Stack.Screen name="ledger" options={{ title: 'Shared Ledger' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* Settings detail screens */}
            <Stack.Screen name="settings/account" options={{ headerBackTitle: 'Settings', title: 'Account' }} />
            <Stack.Screen name="settings/categories" options={{ headerBackTitle: 'Settings', title: 'Categories' }} />
            <Stack.Screen name="settings/ledgers" options={{ headerBackTitle: 'Settings', title: 'Ledgers' }} />
            <Stack.Screen name="settings/sync" options={{ headerBackTitle: 'Settings', title: 'Sync Status' }} />
            <Stack.Screen name="settings/ledger/[id]" options={{ headerBackTitle: 'Ledgers', title: 'Ledger Details' }} />
            {/* Expense detail screens */}
            <Stack.Screen
              name="expenses/new"
              options={{
                headerLeft: expenseHeaderLeft,
                headerRight: () => null,
                headerTitleAlign: 'center',
                presentation: 'modal',
                title: 'Add Expense'
              }}
            />
            <Stack.Screen
              name="expenses/[id]"
              options={{
                headerBackTitle: 'History',
                headerLeft: expenseHeaderLeft,
                headerRight: () => null,
                headerTitleAlign: 'center',
                title: 'Edit Expense'
              }}
            />
          </Stack>
        </LedgerProvider>
      </SyncProvider>
    </AuthProvider>
  );
}
