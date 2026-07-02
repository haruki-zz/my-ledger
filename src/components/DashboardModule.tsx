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
  disableContentTransition?: boolean;
  expandOnCollapsedAreaPress?: boolean;
  footer?: ReactNode;
  measureKey?: string;
  middle?: ReactNode;
  onToggle: () => void;
  open: boolean;
  summary: ReactNode;
  title: string;
};

export function DashboardModule({
  detail,
  disableContentTransition = false,
  expandOnCollapsedAreaPress = false,
  footer,
  measureKey,
  middle,
  onToggle,
  open,
  summary,
  title
}: DashboardModuleProps) {
  const reduceMotion = useReduceMotion();
  const layout = motionCardResizeTransition(reduceMotion);
  const panelIn = disableContentTransition ? undefined : motionPanelIn(reduceMotion);
  const panelOut = disableContentTransition ? undefined : motionPanelOut(reduceMotion);
  const contentKey = `${open ? 'detail' : 'summary'}:${measureKey || title}`;
  const pressCollapsedArea = expandOnCollapsedAreaPress && !open;
  const headerContent = (
    <>
      <View style={localStyles.headerLeft}>
        <View style={localStyles.tick} />
        <Text style={localStyles.title}>{title}</Text>
      </View>
      <AnimatedChevron open={open} />
    </>
  );

  return (
    <Animated.View layout={layout} style={localStyles.card}>
      <Pressable
        accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${title}`}
        accessibilityRole="button"
        disabled={pressCollapsedArea}
        onPress={onToggle}
        style={({ pressed }) => [localStyles.header, pressed && !pressCollapsedArea && localStyles.headerPressed]}
      >
        {headerContent}
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
      {pressCollapsedArea ? (
        <Pressable
          accessibilityLabel={`Expand ${title}`}
          accessibilityRole="button"
          onPress={onToggle}
          pointerEvents="box-only"
          style={({ pressed }) => [
            localStyles.collapsedHitOverlay,
            pressed && localStyles.collapsedHitOverlayPressed
          ]}
        />
      ) : null}
    </Animated.View>
  );
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: theme.radii.surface,
    boxShadow: '0 10px 24px -16px rgba(42,39,34,0.13)',
    overflow: 'hidden',
    position: 'relative'
  },
  collapseWrap: {
    overflow: 'hidden'
  },
  collapsedHitOverlay: {
    borderRadius: theme.radii.surface,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2
  },
  collapsedHitOverlayPressed: {
    backgroundColor: 'rgba(42,39,34,0.03)'
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
