import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { ColorValue } from 'react-native';

import { colors } from '@/src/components/styles';

type IoniconName = keyof typeof Ionicons.glyphMap;

function tabIcon(outlineName: IoniconName, filledName: IoniconName) {
  return function Icon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons color={color} name={focused ? filledName : outlineName} size={24} />;
  };
}

function AddExpenseButton() {
  return (
    <Pressable
      accessibilityLabel="记账"
      onPress={() => router.push('/expenses/new')}
      style={({ pressed }) => ({
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1
      })}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.primary,
          borderRadius: 28,
          height: 56,
          justifyContent: 'center',
          marginTop: -18,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.16,
          shadowRadius: 10,
          width: 56
        }}
      >
        <Ionicons color="#FFFFFF" name="add" size={34} />
      </View>
      <Text style={{ color: colors.primaryDark, fontSize: 12, fontWeight: '700', marginTop: 2 }}>记账</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.ink, fontWeight: '800' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 82,
          paddingBottom: 12,
          paddingTop: 8
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700'
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: tabIcon('home-outline', 'home')
        }}
      />
      <Tabs.Screen
        name="new"
        options={{
          title: '记账',
          tabBarButton: AddExpenseButton
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push('/expenses/new');
          }
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '明细',
          tabBarIcon: tabIcon('receipt-outline', 'receipt')
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: tabIcon('settings-outline', 'settings')
        }}
      />
    </Tabs>
  );
}
