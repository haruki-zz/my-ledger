import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent
} from 'react-native';

import { colors, fontFamilies, theme } from '@/src/components/styles';

type DashboardModuleProps = {
  detail: ReactNode;
  footer?: ReactNode;
  measureKey?: string;
  middle?: ReactNode;
  onToggle: () => void;
  open: boolean;
  summary: ReactNode;
  summaryStat?: ReactNode;
  title: string;
};

const COLLAPSE_DURATION_MS = 450;
const COLLAPSE_EASING = Easing.bezier(0.4, 0, 0.2, 1);

export function DashboardModule({
  detail,
  footer,
  measureKey,
  middle,
  onToggle,
  open,
  summary,
  summaryStat,
  title
}: DashboardModuleProps) {
  const reduceMotion = useReduceMotion();
  const [summaryHeight, setSummaryHeight] = useState<number | null>(null);
  const [detailHeight, setDetailHeight] = useState<number | null>(null);
  const [summaryAnimated] = useState(() => new Animated.Value(open ? 0 : 1));
  const [detailAnimated] = useState(() => new Animated.Value(open ? 1 : 0));
  const animatingRef = useRef(false);

  useEffect(() => {
    setSummaryHeight(null);
    setDetailHeight(null);
  }, [measureKey]);

  useEffect(() => {
    animatingRef.current = true;
    const animation = Animated.parallel([
      Animated.timing(summaryAnimated, {
        duration: reduceMotion ? 0 : COLLAPSE_DURATION_MS,
        easing: COLLAPSE_EASING,
        toValue: open ? 0 : 1,
        useNativeDriver: false
      }),
      Animated.timing(detailAnimated, {
        duration: reduceMotion ? 0 : COLLAPSE_DURATION_MS,
        easing: COLLAPSE_EASING,
        toValue: open ? 1 : 0,
        useNativeDriver: false
      })
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        animatingRef.current = false;
      }
    });

    return () => {
      animation.stop();
      animatingRef.current = false;
    };
  }, [detailAnimated, open, reduceMotion, summaryAnimated]);

  function handleSummaryLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (open || nextHeight <= 0) {
      return;
    }

    setSummaryHeight((current) => {
      if (current !== null && animatingRef.current) {
        return current;
      }

      return current === null || Math.abs(current - nextHeight) > 1 ? nextHeight : current;
    });
  }

  function handleDetailLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (!open || nextHeight <= 0) {
      return;
    }

    setDetailHeight((current) => {
      if (current !== null && animatingRef.current) {
        return current;
      }

      return current === null || Math.abs(current - nextHeight) > 1 ? nextHeight : current;
    });
  }

  const summaryStyle = summaryHeight === null && !open
    ? null
    : {
        height: summaryAnimated.interpolate({
          inputRange: [0, 1],
          outputRange: [0, summaryHeight || 0]
        })
      };
  const detailStyle = detailHeight === null && open
    ? null
    : {
        height: detailAnimated.interpolate({
          inputRange: [0, 1],
          outputRange: [0, detailHeight || 0]
        })
      };

  return (
    <View style={localStyles.card}>
      <Pressable
        accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${title}`}
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [localStyles.header, pressed && localStyles.headerPressed]}
      >
        <View style={localStyles.headerLeft}>
          <View style={localStyles.tick} />
          <Text style={localStyles.title}>{title}</Text>
        </View>
        <View style={localStyles.headerRight}>
          {summaryStat}
          <Animated.View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Ionicons color="#C7BDAE" name="chevron-down" size={14} />
          </Animated.View>
        </View>
      </Pressable>

      {middle}

      <Animated.View
        pointerEvents={open ? 'none' : 'auto'}
        style={[localStyles.collapseWrap, summaryStyle, { opacity: summaryAnimated }]}
      >
        <View onLayout={handleSummaryLayout}>
          {summary}
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[localStyles.collapseWrap, detailStyle, { opacity: detailAnimated }]}
      >
        <View onLayout={handleDetailLayout}>
          {detail}
        </View>
      </Animated.View>

      {footer}
    </View>
  );
}

export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: theme.radii.surface,
    borderWidth: 1,
    boxShadow: '0 16px 34px -18px rgba(42,39,34,0.20)',
    overflow: 'hidden'
  },
  collapseWrap: {
    overflow: 'hidden'
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  headerLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minWidth: 0
  },
  headerPressed: {
    backgroundColor: 'rgba(42,39,34,0.03)'
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  tick: {
    backgroundColor: colors.accent,
    borderRadius: theme.radii.pill,
    height: 18,
    width: 6
  },
  title: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 15,
    textTransform: 'uppercase'
  }
});
