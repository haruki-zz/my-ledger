import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PixelRatio,
  StyleSheet,
  View,
  useWindowDimensions,
  type ColorValue,
  type GestureResponderEvent
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/src/components/styles';

type IoniconName = keyof typeof Ionicons.glyphMap;

const FLOATING_BUTTON_SIZE = 56;
const FLOATING_BUTTON_MARGIN = 20;
const TAB_BAR_HEIGHT = 64;
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
    const minX = FLOATING_BUTTON_MARGIN;
    const maxX = Math.max(minX, width - FLOATING_BUTTON_SIZE - FLOATING_BUTTON_MARGIN);
    const minY = insets.top + FLOATING_BUTTON_MARGIN;
    const reservedBottom = TAB_BAR_HEIGHT + insets.bottom + FLOATING_BUTTON_MARGIN;
    const maxY = Math.max(minY, height - reservedBottom - FLOATING_BUTTON_SIZE);

    return { maxX, maxY, minX, minY };
  }, [height, insets.bottom, insets.top, width]);

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
      accessibilityLabel="记账"
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
  return (
    <View style={localStyles.container}>
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
            height: TAB_BAR_HEIGHT,
            paddingBottom: 8,
            paddingTop: 6
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
      <DraggableAddExpenseButton />
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
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
    shadowOpacity: 0.16,
    shadowRadius: 10,
    top: 0,
    width: FLOATING_BUTTON_SIZE,
    zIndex: 20
  }
});
