import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Animated,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ColorValue,
  type GestureResponderEvent
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  FLOATING_TAB_BAR_HEIGHT,
  SIDEBAR_WIDTH,
  WIDE_LAYOUT_BREAKPOINT
} from '@/src/components/layout';
import { colors, fontFamilies, theme } from '@/src/components/styles';

type IoniconName = keyof typeof Ionicons.glyphMap;
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const FLOATING_BUTTON_SIZE = 56;
const FLOATING_BUTTON_MARGIN = 20;
const TAP_MOVEMENT_THRESHOLD = PixelRatio.roundToNearestPixel(12);

type ButtonPosition = {
  x: number;
  y: number;
};

type DragState = {
  startPosition: ButtonPosition;
  startX: number;
  startY: number;
};

type DockSide = 'left' | 'right';

function tabIcon(outlineName: IoniconName, filledName: IoniconName) {
  return function Icon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons color={color} name={focused ? filledName : outlineName} size={24} />;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function DraggableAddExpenseButton() {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const isWideLayout = width >= WIDE_LAYOUT_BREAKPOINT;
  const initialPosition = {
    x: width - FLOATING_BUTTON_SIZE - FLOATING_BUTTON_MARGIN,
    y: height * 0.7 - FLOATING_BUTTON_SIZE / 2
  };
  const dragStateRef = useRef<DragState | null>(null);
  const dockSideRef = useRef<DockSide>('right');
  const initializedRef = useRef(false);
  const positionRef = useRef<ButtonPosition>(initialPosition);
  const previousWidthRef = useRef(width);
  const [position] = useState(() => new Animated.ValueXY(initialPosition));

  const bounds = useMemo(() => {
    const minX = (isWideLayout ? SIDEBAR_WIDTH : 0) + FLOATING_BUTTON_MARGIN;
    const maxX = Math.max(minX, width - FLOATING_BUTTON_SIZE - FLOATING_BUTTON_MARGIN);
    const minY = insets.top + FLOATING_BUTTON_MARGIN;
    const reservedBottom = (isWideLayout ? 0 : FLOATING_TAB_BAR_HEIGHT) + insets.bottom + FLOATING_BUTTON_MARGIN;
    const maxY = Math.max(minY, height - reservedBottom - FLOATING_BUTTON_SIZE);

    return { maxX, maxY, minX, minY };
  }, [height, insets.bottom, insets.top, isWideLayout, width]);

  useLayoutEffect(() => {
    const defaultPosition = {
      x: bounds.maxX,
      y: clamp(height * 0.7 - FLOATING_BUTTON_SIZE / 2, bounds.minY, bounds.maxY)
    };

    if (!initializedRef.current) {
      initializedRef.current = true;
      previousWidthRef.current = width;
      dockSideRef.current = 'right';
      positionRef.current = defaultPosition;
      position.stopAnimation();
      position.setValue(defaultPosition);
      return;
    }

    const widthChanged = previousWidthRef.current !== width;
    previousWidthRef.current = width;

    position.stopAnimation((value) => {
      const currentPosition = {
        x: clamp(value.x, bounds.minX, bounds.maxX),
        y: clamp(value.y, bounds.minY, bounds.maxY)
      };
      const nextPosition = widthChanged
        ? {
            x: dockSideRef.current === 'left' ? bounds.minX : bounds.maxX,
            y: currentPosition.y
          }
        : currentPosition;

      positionRef.current = nextPosition;
      position.setValue(nextPosition);
    });
  }, [bounds, height, position, width]);

  function animateToDock(releasePosition: ButtonPosition) {
    const buttonCenterX = releasePosition.x + FLOATING_BUTTON_SIZE / 2;
    const dockSide: DockSide = buttonCenterX < width / 2 ? 'left' : 'right';
    const targetPosition = {
      x: dockSide === 'left' ? bounds.minX : bounds.maxX,
      y: clamp(releasePosition.y, bounds.minY, bounds.maxY)
    };

    dockSideRef.current = dockSide;
    positionRef.current = targetPosition;
    Animated.spring(position, {
      damping: 18,
      mass: 0.8,
      restDisplacementThreshold: 0.5,
      restSpeedThreshold: 0.5,
      stiffness: 180,
      toValue: targetPosition,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        positionRef.current = targetPosition;
      }
    });
  }

  function handleResponderGrant(event: GestureResponderEvent) {
    const startX = event.nativeEvent.pageX;
    const startY = event.nativeEvent.pageY;

    position.stopAnimation((value) => {
      const currentPosition = {
        x: clamp(value.x, bounds.minX, bounds.maxX),
        y: clamp(value.y, bounds.minY, bounds.maxY)
      };

      positionRef.current = currentPosition;
      position.setValue(currentPosition);
      dragStateRef.current = {
        startPosition: currentPosition,
        startX,
        startY
      };
    });
  }

  function handleResponderMove(event: GestureResponderEvent) {
    const dragState = dragStateRef.current;

    if (!dragState) {
      return;
    }

    const dx = event.nativeEvent.pageX - dragState.startX;
    const dy = event.nativeEvent.pageY - dragState.startY;

    const nextPosition = {
      x: clamp(dragState.startPosition.x + dx, bounds.minX, bounds.maxX),
      y: clamp(dragState.startPosition.y + dy, bounds.minY, bounds.maxY)
    };

    positionRef.current = nextPosition;
    position.setValue(nextPosition);
  }

  function handleResponderRelease(event: GestureResponderEvent) {
    const dragState = dragStateRef.current;

    if (!dragState) {
      return;
    }

    const dx = event.nativeEvent.pageX - dragState.startX;
    const dy = event.nativeEvent.pageY - dragState.startY;
    const movedDistance = Math.hypot(dx, dy);

    dragStateRef.current = null;

    if (movedDistance < TAP_MOVEMENT_THRESHOLD) {
      router.push('/expenses/new');
      return;
    }

    animateToDock(positionRef.current);
  }

  return (
    <Animated.View
      accessibilityLabel="Add expense"
      accessibilityRole="button"
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleResponderGrant}
      onResponderMove={handleResponderMove}
      onResponderRelease={handleResponderRelease}
      onResponderTerminate={() => {
        dragStateRef.current = null;
        animateToDock(positionRef.current);
      }}
      onStartShouldSetResponder={() => true}
      style={[
        localStyles.floatingButton,
        {
          transform: position.getTranslateTransform()
        }
      ]}
    >
      <Ionicons color="#FFFFFF" name="add" size={34} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isWideLayout = width >= WIDE_LAYOUT_BREAKPOINT;
  const sceneStyle = useMemo(
    () => (
      isWideLayout
        ? { backgroundColor: colors.bg, paddingLeft: SIDEBAR_WIDTH }
        : { backgroundColor: colors.bg }
    ),
    [isWideLayout]
  );

  return (
    <View style={localStyles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTitleStyle: { color: colors.ink, fontFamily: fontFamilies.bold, fontWeight: '700' },
          sceneStyle,
          tabBarActiveTintColor: colors.secondary,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: {
            fontFamily: fontFamilies.semiBold,
            fontSize: 12,
            fontWeight: '600'
          },
          tabBarStyle: { display: 'none' }
        }}
        tabBar={(props) => <ResponsiveTabBar isWideLayout={isWideLayout} {...props} />}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: tabIcon('home-outline', 'home')
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: tabIcon('receipt-outline', 'receipt')
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: tabIcon('settings-outline', 'settings')
          }}
        />
      </Tabs>
      <DraggableAddExpenseButton />
    </View>
  );
}

function ResponsiveTabBar({
  descriptors,
  isWideLayout,
  navigation,
  state
}: TabBarProps & {
  isWideLayout: boolean;
}) {
  const insets = useSafeAreaInsets();
  const tabItems = useMemo(
    () => state.routes.map((route, index) => {
      const options = descriptors[route.key]?.options || {};
      const focused = state.index === index;
      const title = typeof options.title === 'string' ? options.title : route.name;
      const tabBarIcon = options.tabBarIcon as
        | ((props: { color: ColorValue; focused: boolean; size: number }) => ReactNode)
        | undefined;
      const color = focused ? colors.secondary : colors.muted;

      function onPress() {
        const event = navigation.emit({
          canPreventDefault: true,
          target: route.key,
          type: 'tabPress'
        });

        if (!focused && !event.defaultPrevented) {
          navigation.navigate(route.name);
        }
      }

      return (
        <Pressable
          accessibilityRole="button"
          key={route.key}
          onPress={onPress}
          style={({ pressed }) => [
            isWideLayout ? localStyles.sidebarItem : localStyles.bottomTabItem,
            focused && (isWideLayout ? localStyles.sidebarItemActive : localStyles.bottomTabItemActive),
            pressed && localStyles.tabItemPressed
          ]}
        >
          {tabBarIcon?.({ color, focused, size: isWideLayout ? 22 : 23 })}
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={[
              isWideLayout ? localStyles.sidebarItemText : localStyles.bottomTabItemText,
              focused && localStyles.tabItemTextActive
            ]}
          >
            {title}
          </Text>
        </Pressable>
      );
    }),
    [descriptors, isWideLayout, navigation, state.index, state.routes]
  );

  if (isWideLayout) {
    return (
      <View
        style={[
          localStyles.sidebar,
          {
            paddingBottom: insets.bottom + 14,
            paddingTop: insets.top + 14
          }
        ]}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={localStyles.sidebarMark}
        >
          <Ionicons color="#FFFFFF" name="sparkles" size={21} />
        </View>
        <View style={localStyles.sidebarItems}>{tabItems}</View>
      </View>
    );
  }

  return (
    <View
      style={[
        localStyles.bottomTabShell,
        {
          bottom: insets.bottom + 10
        }
      ]}
    >
      {tabItems}
    </View>
  );
}

const localStyles = StyleSheet.create({
  bottomTabItem: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    flex: 1,
    gap: 2,
    height: 54,
    justifyContent: 'center',
    minWidth: 0
  },
  bottomTabItemActive: {
    backgroundColor: colors.tint
  },
  bottomTabItemText: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15
  },
  bottomTabShell: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: FLOATING_TAB_BAR_HEIGHT,
    left: 20,
    padding: 8,
    position: 'absolute',
    right: 20,
    ...theme.shadow,
    zIndex: 30
  },
  container: {
    backgroundColor: colors.bg,
    flex: 1
  },
  floatingButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: FLOATING_BUTTON_SIZE / 2,
    height: FLOATING_BUTTON_SIZE,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    top: 0,
    width: FLOATING_BUTTON_SIZE,
    zIndex: 20
  },
  sidebar: {
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderRightWidth: 1,
    bottom: 0,
    gap: 22,
    left: 0,
    position: 'absolute',
    top: 0,
    width: SIDEBAR_WIDTH,
    ...theme.shadow,
    zIndex: 30
  },
  sidebarItem: {
    alignItems: 'center',
    borderRadius: 22,
    gap: 6,
    minHeight: 66,
    justifyContent: 'center',
    paddingHorizontal: 8,
    width: 72
  },
  sidebarItemActive: {
    backgroundColor: colors.tint
  },
  sidebarItemText: {
    color: colors.muted,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center'
  },
  sidebarItems: {
    gap: 8
  },
  sidebarMark: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 20,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  tabItemPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }]
  },
  tabItemTextActive: {
    color: colors.secondary
  }
});
