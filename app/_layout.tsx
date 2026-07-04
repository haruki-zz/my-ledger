import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold
} from '@expo-google-fonts/hanken-grotesk';
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
import { Pressable, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
    JetBrainsMono_800ExtraBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  function dismissSettingsDetail() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/settings');
  }

  if (!fontsLoaded && !fontError) {
    return null;
  }

  const resolvedRegularFont = fontError ? fontFamilies.fallback : fontFamilies.regular;
  const resolvedHeaderFont = fontError ? fontFamilies.fallback : fontFamilies.bold;
  function BackButton({ onPress }: { onPress: () => void }) {
    return (
      <Pressable accessibilityLabel="Go back" onPress={onPress} style={({ pressed }) => [localStyles.backButton, pressed && localStyles.pressed]}>
        <Ionicons color={colors.ink} name="arrow-back" size={28} />
      </Pressable>
    );
  }

  const settingsHeaderLeft = () => (
    <BackButton onPress={dismissSettingsDetail} />
  );
  return (
    <GestureHandlerRootView style={localStyles.gestureRoot}>
      <AuthProvider>
        <SyncProvider>
          <LedgerProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerShadowVisible: false,
                headerBackButtonDisplayMode: 'minimal',
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
              <Stack.Screen name="ledger" options={{ title: 'Ledger' }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              {/* Settings detail screens */}
              <Stack.Screen name="settings/ledgers" options={{ headerLeft: settingsHeaderLeft, title: 'Ledgers' }} />
              <Stack.Screen
                name="settings/recurring"
                options={{
                  headerLeft: settingsHeaderLeft,
                  headerTitleAlign: 'center',
                  title: 'Fixed Expense'
                }}
              />
              <Stack.Screen name="settings/sync" options={{ headerLeft: settingsHeaderLeft, title: 'Sync Status' }} />
              {/* Expense detail screens */}
              <Stack.Screen
                name="expenses/new"
                options={{
                  contentStyle: { backgroundColor: 'transparent' },
                  gestureEnabled: false,
                  headerShown: false,
                  presentation: 'transparentModal',
                  title: 'Add Expense'
                }}
              />
              <Stack.Screen
                name="expenses/[id]"
                options={{
                  contentStyle: { backgroundColor: 'transparent' },
                  gestureEnabled: false,
                  headerShown: false,
                  presentation: 'transparentModal',
                  title: 'Edit Expense'
                }}
              />
            </Stack>
          </LedgerProvider>
        </SyncProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const localStyles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    marginLeft: -4,
    width: 40
  },
  gestureRoot: {
    flex: 1
  },
  pressed: {
    opacity: 0.76
  }
});
