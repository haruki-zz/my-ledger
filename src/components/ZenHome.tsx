import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Easing,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
  type PanResponderInstance
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamilies } from '@/src/components/styles';

export type ZenHomeData = {
  budgetedMonthYen: number;
  budgetedTodayYen: number;
  budgetRemainingYen: number;
  budgetUsedPercent: number;
  budgetYen: number;
  daysRemaining: number;
  hasBudget: boolean;
  leftPerDayYen: number;
  monthLabel: string;
  unbudgetedVariableYen: number;
};

type Props = {
  data: ZenHomeData;
  interactionEnabled: boolean;
  translateY: RNAnimated.Value;
  onOpenDashboard: () => void;
  onOpenAddEntry: () => void;
};

const ZEN_COACH_STORAGE_KEY = 'my-ledger:zen-home-coach-seen:v1';
const HOLD_DURATION_MS = 430;
const HOLD_CANCEL_RADIUS = 30;
const DASHBOARD_SWEEP_TEXT = 'sweep to dashboard';
const DASHBOARD_SWEEP_COMMIT_DISTANCE = 86;
const DASHBOARD_SWEEP_COMMIT_VELOCITY = 0.52;
const DASHBOARD_SWEEP_DIRECTION_RATIO = 1.5;
const DASHBOARD_SWEEP_CHARS = Array.from(DASHBOARD_SWEEP_TEXT);
const USE_NATIVE_ANIMATION_DRIVER = Platform.OS !== 'web';

const zenColors = {
  paper: '#F1ECE3',
  ink: '#2A2722',
  inkSoft: '#5C544A',
  inkFaint: '#9A8F80',
  inkGhost: '#B7AD9E',
  ochre: '#C0892E',
  danger: '#C0392B',
  hairlineTrack: 'rgba(42,39,34,0.12)'
} as const;

type RippleState = {
  visible: boolean;
  x: number;
  y: number;
};

function formatZenYen(value: number) {
  return `¥${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
}

function resolveZenBudget(data: ZenHomeData) {
  const spentMonth = Math.max(0, Math.round(data.budgetedMonthYen));
  const daysRemaining = Math.max(0, Math.round(data.daysRemaining));
  const budgetRemaining = Math.round(data.budgetRemainingYen);
  const overBudget = budgetRemaining < 0;
  const leftPerDay = Math.max(0, Math.round(data.leftPerDayYen));
  const budgetPct = data.hasBudget ? Math.round(data.budgetUsedPercent) : 0;
  const captionAmount = overBudget
    ? `${formatZenYen(Math.abs(budgetRemaining))} over`
    : `${formatZenYen(budgetRemaining)} left`;

  return {
    budgetPct,
    budgetRemaining,
    budgetTone: overBudget ? zenColors.danger : zenColors.ink,
    caption: `${captionAmount} · ${daysRemaining} days to go`,
    daysRemaining,
    leftPerDay,
    leftPerDayTone: overBudget ? zenColors.danger : zenColors.ink,
    lineFillPct: `${Math.min(100, Math.max(0, budgetPct))}%` as `${number}%`,
    overBudget,
    spentMonth
  };
}

export function ZenHome({
  data,
  interactionEnabled,
  translateY,
  onOpenDashboard,
  onOpenAddEntry,
}: Props) {
  const insets = useSafeAreaInsets();
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef({ x: 0, y: 0 });
  const triggeredLongPressRef = useRef(false);
  const [coachHidden, setCoachHidden] = useState(true);
  const [panResponder, setPanResponder] = useState<PanResponderInstance | null>(null);
  const [ripple, setRipple] = useState<RippleState>({ visible: false, x: 0, y: 0 });
  const [cursorOpacity] = useState(() => new RNAnimated.Value(1));
  const [coachOpacity] = useState(() => new RNAnimated.Value(0.6));
  const [rippleRingOpacity] = useState(() => new RNAnimated.Value(0));
  const [rippleRingScale] = useState(() => new RNAnimated.Value(0.6));
  const [rippleFillOpacity] = useState(() => new RNAnimated.Value(0.3));
  const [rippleFillScale] = useState(() => new RNAnimated.Value(0.12));
  const budget = useMemo(() => resolveZenBudget(data), [data]);

  useEffect(() => {
    const cursorLoop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(cursorOpacity, { duration: 605, toValue: 1, useNativeDriver: USE_NATIVE_ANIMATION_DRIVER }),
        RNAnimated.timing(cursorOpacity, { duration: 0, toValue: 0, useNativeDriver: USE_NATIVE_ANIMATION_DRIVER }),
        RNAnimated.timing(cursorOpacity, { duration: 495, toValue: 0, useNativeDriver: USE_NATIVE_ANIMATION_DRIVER }),
        RNAnimated.timing(cursorOpacity, { duration: 0, toValue: 1, useNativeDriver: USE_NATIVE_ANIMATION_DRIVER })
      ])
    );
    const coachLoop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(coachOpacity, {
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
        }),
        RNAnimated.timing(coachOpacity, {
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          toValue: 0.6,
          useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
        })
      ])
    );

    cursorLoop.start();
    coachLoop.start();

    return () => {
      cursorLoop.stop();
      coachLoop.stop();
    };
  }, [coachOpacity, cursorOpacity]);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(ZEN_COACH_STORAGE_KEY)
      .then((value) => {
        if (active) {
          setCoachHidden(value === '1');
        }
      })
      .catch(() => {
        if (active) {
          setCoachHidden(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  const hideRipple = useCallback(() => {
    rippleRingOpacity.stopAnimation();
    rippleRingScale.stopAnimation();
    rippleFillOpacity.stopAnimation();
    rippleFillScale.stopAnimation();
    setRipple((current) => ({ ...current, visible: false }));
  }, [rippleFillOpacity, rippleFillScale, rippleRingOpacity, rippleRingScale]);

  const clearPressTimer = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  const cancelPress = useCallback(() => {
    clearPressTimer();
    triggeredLongPressRef.current = false;
    hideRipple();
  }, [clearPressTimer, hideRipple]);

  const markCoachSeen = useCallback(() => {
    setCoachHidden(true);
    AsyncStorage.setItem(ZEN_COACH_STORAGE_KEY, '1').catch(() => undefined);
  }, []);

  const openAddEntry = useCallback(() => {
    clearPressTimer();
    triggeredLongPressRef.current = true;
    hideRipple();
    markCoachSeen();
    onOpenAddEntry();
  }, [clearPressTimer, hideRipple, markCoachSeen, onOpenAddEntry]);

  const startRipple = useCallback((x: number, y: number) => {
    rippleRingOpacity.setValue(0);
    rippleRingScale.setValue(0.6);
    rippleFillOpacity.setValue(0.3);
    rippleFillScale.setValue(0.12);
    setRipple({ visible: true, x, y });
    requestAnimationFrame(() => {
      RNAnimated.parallel([
        RNAnimated.timing(rippleRingOpacity, {
          duration: 160,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
        }),
        RNAnimated.timing(rippleRingScale, {
          duration: 160,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
        }),
        RNAnimated.timing(rippleFillOpacity, {
          duration: 160,
          easing: Easing.out(Easing.cubic),
          toValue: 0.9,
          useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
        }),
        RNAnimated.timing(rippleFillScale, {
          duration: HOLD_DURATION_MS,
          easing: Easing.linear,
          toValue: 1,
          useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
        })
      ]).start();
    });
  }, [rippleFillOpacity, rippleFillScale, rippleRingOpacity, rippleRingScale]);

  useEffect(() => {
    setPanResponder(PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (event) => {
        const x = event.nativeEvent.locationX;
        const y = event.nativeEvent.locationY;

        triggeredLongPressRef.current = false;
        pressOriginRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        startRipple(x, y);
        clearPressTimer();
        pressTimerRef.current = setTimeout(openAddEntry, HOLD_DURATION_MS);
      },
      onPanResponderMove: (event) => {
        const dx = event.nativeEvent.pageX - pressOriginRef.current.x;
        const dy = event.nativeEvent.pageY - pressOriginRef.current.y;

        if (Math.hypot(dx, dy) > HOLD_CANCEL_RADIUS) {
          clearPressTimer();
          hideRipple();
        }
      },
      onPanResponderRelease: () => {
        if (triggeredLongPressRef.current) {
          triggeredLongPressRef.current = false;
          return;
        }

        clearPressTimer();
        hideRipple();
      },
      onPanResponderTerminate: cancelPress,
      onPanResponderTerminationRequest: () => true,
      onShouldBlockNativeResponder: () => true,
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true
    }));
  }, [cancelPress, clearPressTimer, hideRipple, openAddEntry, startRipple]);

  const cursorStyle = { opacity: cursorOpacity };
  const coachStyle = { opacity: coachOpacity };
  const rippleRingStyle = {
    opacity: rippleRingOpacity,
    transform: [
      { translateX: -38 },
      { translateY: -38 },
      { scale: rippleRingScale }
    ]
  };
  const rippleFillStyle = {
    opacity: rippleFillOpacity,
    transform: [{ scale: rippleFillScale }]
  };

  return (
    <RNAnimated.View
      accessibilityLabel="Zen home"
      style={[
        localStyles.root,
        {
          pointerEvents: interactionEnabled ? 'auto' : 'none',
          transform: [{ translateY }]
        }
      ]}
    >
      <View style={localStyles.pressArea} {...(panResponder?.panHandlers || {})}>
        <View style={[localStyles.monthHeader, { paddingTop: Math.max(50, insets.top) + 30 }]}>
          <Text style={localStyles.monthText}>{data.monthLabel}</Text>
          <View style={localStyles.monthRule} />
        </View>

        <View style={localStyles.heroBlock}>
          <Text style={localStyles.heroLabel}>BUDGETED THIS MONTH</Text>
          <View style={localStyles.amountRow}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={localStyles.amountText}>
              {formatZenYen(data.budgetedMonthYen)}
            </Text>
            <RNAnimated.View style={[localStyles.cursor, cursorStyle]} />
          </View>

          <View style={localStyles.paceGrid}>
            <View style={localStyles.paceCell}>
              <Text style={localStyles.paceLabel}>TODAY</Text>
              <Text style={localStyles.paceValue}>{formatZenYen(data.budgetedTodayYen)}</Text>
            </View>
            <View style={localStyles.paceDivider} />
            <View style={localStyles.paceCell}>
              <Text style={localStyles.paceLabel}>LEFT / DAY</Text>
              <Text style={[localStyles.paceValue, { color: budget.leftPerDayTone }]}>
                {formatZenYen(budget.leftPerDay)}
              </Text>
            </View>
          </View>
        </View>

        <View style={localStyles.budgetBlock}>
          <View style={localStyles.budgetCaptionRow}>
            <Text style={localStyles.budgetLabel}>BUDGET</Text>
            <Text style={[localStyles.budgetPct, { color: budget.overBudget ? zenColors.danger : zenColors.inkSoft }]}>
              {budget.budgetPct}%
            </Text>
          </View>
          <View style={localStyles.budgetTrack}>
            <View
              style={[
                localStyles.budgetFill,
                {
                  backgroundColor: budget.budgetTone,
                  width: budget.lineFillPct
                }
              ]}
            />
          </View>
          <Text style={[localStyles.budgetFooter, { color: budget.overBudget ? zenColors.danger : zenColors.inkSoft }]}>
            {budget.caption}
          </Text>
        </View>
      </View>

      <View style={[localStyles.footer, { height: 118 + insets.bottom, paddingBottom: insets.bottom }]}>
        <SweepToDashboard onComplete={onOpenDashboard} />
      </View>

      {ripple.visible ? (
        <RNAnimated.View
          style={[
            localStyles.rippleRing,
            {
              left: ripple.x,
              top: ripple.y
            },
            rippleRingStyle
          ]}
        >
          <RNAnimated.View style={[localStyles.rippleFill, rippleFillStyle]} />
        </RNAnimated.View>
      ) : null}

      {!coachHidden ? (
        <RNAnimated.View style={[localStyles.coach, coachStyle]}>
          <Text style={localStyles.coachText}>HOLD TO ADD</Text>
        </RNAnimated.View>
      ) : null}
    </RNAnimated.View>
  );
}

function SweepToDashboard({ onComplete }: { onComplete: () => void }) {
  const committedRef = useRef(false);
  const [panResponder, setPanResponder] = useState<PanResponderInstance | null>(null);
  const [shimmerProgress] = useState(() => new RNAnimated.Value(-1));

  useEffect(() => {
    setPanResponder(PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => (
        gestureState.dx > 8 &&
        gestureState.dx > Math.abs(gestureState.dy) * DASHBOARD_SWEEP_DIRECTION_RATIO
      ),
      onPanResponderGrant: () => {
        committedRef.current = false;
      },
      onPanResponderRelease: (_, gestureState) => {
        const horizontalEnough = gestureState.dx >= DASHBOARD_SWEEP_COMMIT_DISTANCE;
        const quickSweep = gestureState.dx > 28 && gestureState.vx >= DASHBOARD_SWEEP_COMMIT_VELOCITY;

        if (!horizontalEnough && !quickSweep) {
          committedRef.current = false;
          return;
        }

        if (!committedRef.current) {
          committedRef.current = true;
          onComplete();
        }
      },
      onPanResponderTerminate: () => {
        committedRef.current = false;
      },
      onPanResponderTerminationRequest: () => true
    }));
  }, [onComplete]);

  useEffect(() => {
    shimmerProgress.setValue(-1);
    const shimmerLoop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(shimmerProgress, {
          duration: DASHBOARD_SWEEP_CHARS.length * 120,
          easing: Easing.linear,
          toValue: DASHBOARD_SWEEP_CHARS.length,
          useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
        }),
        RNAnimated.timing(shimmerProgress, {
          duration: 780,
          easing: Easing.linear,
          toValue: DASHBOARD_SWEEP_CHARS.length + 2,
          useNativeDriver: USE_NATIVE_ANIMATION_DRIVER
        })
      ])
    );

    shimmerLoop.start();

    return () => {
      shimmerLoop.stop();
    };
  }, [shimmerProgress]);

  return (
    <View
      accessibilityHint="Sweep right over the text to open the dashboard"
      accessibilityLabel="sweep to dashboard"
      accessibilityRole="button"
      onAccessibilityTap={onComplete}
      style={localStyles.dashboardSweepHitArea}
      {...(panResponder?.panHandlers || {})}
    >
      <View style={localStyles.dashboardSweepTextRow}>
        {DASHBOARD_SWEEP_CHARS.map((char, index) => {
          const opacity = shimmerProgress.interpolate({
            extrapolate: 'clamp',
            inputRange: [index - 1, index, index + 1],
            outputRange: [0.26, 0.96, 0.26]
          });

          return (
            <RNAnimated.Text
              key={`${char}-${index}`}
              style={[
                localStyles.dashboardSweepChar,
                { opacity }
              ]}
            >
              {char === ' ' ? '\u00A0' : char}
            </RNAnimated.Text>
          );
        })}
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 16,
    maxWidth: '92%',
    minHeight: 60
  },
  amountText: {
    color: zenColors.ink,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 52,
    fontWeight: '500',
    includeFontPadding: false,
    letterSpacing: 0,
    lineHeight: 60,
    minWidth: 0,
    textAlignVertical: 'center'
  },
  budgetBlock: {
    alignSelf: 'center',
    width: 228
  },
  budgetCaptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9
  },
  budgetFill: {
    borderRadius: 99,
    height: 2
  },
  budgetFooter: {
    fontFamily: fontFamilies.mono,
    fontSize: 11,
    letterSpacing: 0.8,
    lineHeight: 15,
    marginTop: 11,
    textAlign: 'center'
  },
  budgetLabel: {
    color: zenColors.inkFaint,
    fontFamily: fontFamilies.mono,
    fontSize: 9.5,
    letterSpacing: 1.8,
    lineHeight: 13
  },
  budgetPct: {
    fontFamily: fontFamilies.mono,
    fontSize: 9.5,
    letterSpacing: 1,
    lineHeight: 13
  },
  budgetTrack: {
    backgroundColor: zenColors.hairlineTrack,
    borderRadius: 99,
    height: 2,
    overflow: 'hidden'
  },
  coach: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    pointerEvents: 'none',
    right: 0,
    top: '60%',
    zIndex: 30
  },
  coachText: {
    backgroundColor: 'rgba(42,39,34,0.9)',
    borderRadius: 999,
    color: zenColors.paper,
    fontFamily: fontFamilies.mono,
    fontSize: 9.5,
    letterSpacing: 1.8,
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  cursor: {
    alignSelf: 'center',
    backgroundColor: zenColors.ochre,
    height: 38,
    marginLeft: 13,
    transform: [{ translateY: -3 }],
    width: 12
  },
  dashboardSweepChar: {
    color: zenColors.inkFaint,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
    letterSpacing: 2,
    lineHeight: 13
  },
  dashboardSweepHitArea: {
    alignItems: 'center',
    height: 52,
    justifyContent: 'center',
    minWidth: 190,
    paddingHorizontal: 20
  },
  dashboardSweepTextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center'
  },
  footer: {
    alignItems: 'center',
    flex: 0,
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  heroBlock: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 48,
    width: '100%'
  },
  heroLabel: {
    color: zenColors.inkFaint,
    fontFamily: fontFamilies.mono,
    fontSize: 9.5,
    letterSpacing: 2.4,
    lineHeight: 13
  },
  monthHeader: {
    alignItems: 'center',
    flex: 0,
    gap: 9
  },
  monthRule: {
    backgroundColor: 'rgba(42,39,34,0.5)',
    height: 1,
    width: 18
  },
  monthText: {
    color: zenColors.ink,
    fontFamily: fontFamilies.mono,
    fontSize: 11,
    letterSpacing: 3,
    lineHeight: 15
  },
  paceCell: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
    minWidth: 0
  },
  paceDivider: {
    backgroundColor: 'rgba(42,39,34,0.14)',
    height: 26,
    width: 1
  },
  paceGrid: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 24,
    marginTop: 44,
    width: 272
  },
  paceLabel: {
    color: zenColors.inkFaint,
    fontFamily: fontFamilies.mono,
    fontSize: 9,
    letterSpacing: 1.8,
    lineHeight: 12
  },
  paceValue: {
    color: zenColors.ink,
    fontFamily: fontFamilies.mono,
    fontSize: 15,
    letterSpacing: 0.5,
    lineHeight: 20
  },
  pressArea: {
    flex: 1,
    width: '100%'
  },
  rippleFill: {
    backgroundColor: 'rgba(42,39,34,0.82)',
    borderRadius: 999,
    bottom: 4,
    left: 4,
    position: 'absolute',
    right: 4,
    top: 4
  },
  rippleRing: {
    borderColor: 'rgba(42,39,34,0.45)',
    borderRadius: 999,
    borderWidth: 1.5,
    height: 76,
    pointerEvents: 'none',
    position: 'absolute',
    width: 76,
    zIndex: 40
  },
  root: {
    backgroundColor: zenColors.paper,
    bottom: 0,
    flex: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 50
  }
});
