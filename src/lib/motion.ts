import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, ReduceMotion } from 'react-native-reanimated';

export const motionDurations = {
  exit: 130,
  modalEnter: 180,
  micro: 220,
  content: 260,
  accordion: 260,
  tabs: 280,
  layout: 300,
  data: 520,
  loader: 1100,
  large: 680
} as const;

export const motionEasings = {
  crisp: Easing.bezier(0.22, 1, 0.36, 1),
  emphasize: Easing.bezier(0.2, 0, 0, 1),
  standard: Easing.bezier(0.22, 1, 0.36, 1),
  tab: Easing.bezier(0.16, 1, 0.3, 1)
} as const;

export const motionSprings = {
  responsive: {
    damping: 18,
    mass: 0.72,
    stiffness: 190
  },
  settle: {
    damping: 18,
    mass: 0.8,
    stiffness: 180
  }
} as const;

export const motionReduce = ReduceMotion.System;

export function motionDuration(duration: number, reduceMotion: boolean) {
  return reduceMotion ? 0 : duration;
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
