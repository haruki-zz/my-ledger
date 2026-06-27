import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';

import { motionDuration, motionDurations, motionEasings, useReduceMotion } from '@/src/lib/motion';

type AnimatedChevronProps = {
  color?: string;
  open: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

type AnimatedBarFillProps = {
  axis?: 'x' | 'y';
  color: string;
  minSize?: number;
  size: number;
  style?: StyleProp<ViewStyle>;
};

type AnimatedPercentFillProps = {
  color: string;
  percent: number;
  style?: StyleProp<ViewStyle>;
};

type AnimatedSkeletonBlockProps = {
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedChevron({
  color = '#C7BDAE',
  open,
  size = 14,
  style
}: AnimatedChevronProps) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: motionDuration(motionDurations.accordion, reduceMotion),
      easing: motionEasings.crisp
    });
  }, [open, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * -1 },
      { rotate: `${progress.value * 180}deg` }
    ]
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      <Ionicons color={color} name="chevron-down" size={size} />
    </Animated.View>
  );
}

export function AnimatedBarFill({
  axis = 'x',
  color,
  minSize = 0,
  size,
  style
}: AnimatedBarFillProps) {
  const reduceMotion = useReduceMotion();
  const animatedSize = useSharedValue(Math.max(minSize, size));
  const animatedColor = useSharedValue(color);

  useEffect(() => {
    animatedSize.value = withTiming(Math.max(minSize, size), {
      duration: motionDuration(motionDurations.data, reduceMotion),
      easing: motionEasings.standard
    });
  }, [animatedSize, minSize, reduceMotion, size]);

  useEffect(() => {
    animatedColor.value = withTiming(color, {
      duration: motionDuration(motionDurations.content, reduceMotion),
      easing: motionEasings.crisp
    });
  }, [animatedColor, color, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => (
    axis === 'x'
      ? { backgroundColor: animatedColor.value, width: animatedSize.value }
      : { backgroundColor: animatedColor.value, height: animatedSize.value }
  ));

  return <Animated.View style={[style, animatedStyle]} />;
}

export function AnimatedPercentFill({
  color,
  percent,
  style
}: AnimatedPercentFillProps) {
  const reduceMotion = useReduceMotion();
  const animatedPercent = useSharedValue(percent);
  const animatedColor = useSharedValue(color);

  useEffect(() => {
    animatedPercent.value = withTiming(percent, {
      duration: motionDuration(motionDurations.data, reduceMotion),
      easing: motionEasings.standard
    });
  }, [animatedPercent, percent, reduceMotion]);

  useEffect(() => {
    animatedColor.value = withTiming(color, {
      duration: motionDuration(motionDurations.content, reduceMotion),
      easing: motionEasings.crisp
    });
  }, [animatedColor, color, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: animatedColor.value,
    width: `${animatedPercent.value}%`
  }));

  return <Animated.View style={[style, animatedStyle]} />;
}

export function AnimatedSkeletonBlock({
  color = 'rgba(42,39,34,0.10)',
  style
}: AnimatedSkeletonBlockProps) {
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(pulse);
      pulse.value = 0.55;
      return;
    }

    pulse.value = withRepeat(
      withTiming(1, {
        duration: motionDurations.loader,
        easing: motionEasings.tab
      }),
      -1,
      true
    );

    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.56 : 0.36 + pulse.value * 0.28,
    transform: [{ scaleX: reduceMotion ? 1 : 0.985 + pulse.value * 0.015 }]
  }));

  return (
    <Animated.View
      style={[
        { backgroundColor: color, borderRadius: 8, overflow: 'hidden' },
        style,
        animatedStyle
      ]}
    />
  );
}

export function motionCardResizeTransition(reduceMotion: boolean) {
  return motionLayoutTransition(reduceMotion);
}

export function motionAccordionTransition(reduceMotion: boolean) {
  if (reduceMotion) {
    return LinearTransition.duration(0);
  }

  return LinearTransition
    .duration(motionDurations.accordion)
    .easing(motionEasings.crisp);
}

export function motionLayoutTransition(reduceMotion: boolean) {
  if (reduceMotion) {
    return LinearTransition.duration(0);
  }

  return LinearTransition
    .duration(motionDurations.layout)
    .easing(motionEasings.crisp);
}

export function motionFadeIn(reduceMotion: boolean) {
  return FadeIn
    .duration(motionDuration(motionDurations.content, reduceMotion))
    .easing(motionEasings.standard);
}

export function motionFadeOut(reduceMotion: boolean) {
  return FadeOut
    .duration(motionDuration(motionDurations.exit, reduceMotion))
    .easing(motionEasings.standard);
}

export function motionPanelIn(reduceMotion: boolean) {
  return FadeInDown
    .duration(motionDuration(motionDurations.content, reduceMotion))
    .easing(motionEasings.crisp);
}

export function motionPanelOut(reduceMotion: boolean) {
  return FadeOutUp
    .duration(motionDuration(motionDurations.exit, reduceMotion))
    .easing(motionEasings.standard);
}
