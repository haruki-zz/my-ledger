import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Animated from 'react-native-reanimated';

import { AnimatedChevron, motionCardResizeTransition, motionPanelIn, motionPanelOut } from '@/src/components/motion';
import { colors, fontFamilies, theme } from '@/src/components/styles';
import { useReduceMotion } from '@/src/lib/motion';

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
  const layout = motionCardResizeTransition(reduceMotion);
  const panelIn = motionPanelIn(reduceMotion);
  const panelOut = motionPanelOut(reduceMotion);
  const contentKey = `${open ? 'detail' : 'summary'}:${measureKey || title}`;

  return (
    <Animated.View layout={layout} style={localStyles.card}>
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
          <AnimatedChevron open={open} />
        </View>
      </Pressable>

      {middle}

      <Animated.View
        entering={panelIn}
        exiting={panelOut}
        key={contentKey}
        layout={layout}
        style={localStyles.collapseWrap}
      >
        {open ? detail : summary}
      </Animated.View>

      {footer}
    </Animated.View>
  );
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
