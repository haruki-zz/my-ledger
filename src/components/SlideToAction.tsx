import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from 'react-native';

type SlideToActionProps = {
  accessibilityLabel: string;
  label: string;
  onComplete: () => void;
  disabled?: boolean;
  knobLabel?: string;
  knobSize?: number;
  knobStyle?: StyleProp<ViewStyle>;
  knobTextStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  resetKey?: string | number | boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  trackHeight?: number;
  trackPadding?: number;
  trackStyle?: StyleProp<ViewStyle>;
  trackWidth?: number;
};

const DEFAULT_TRACK_HEIGHT = 60;
const DEFAULT_TRACK_PADDING = 4;
const DEFAULT_TRACK_WIDTH = 300;
const DEFAULT_KNOB_SIZE = 52;
const COMPLETE_ANIMATION_MS = 140;
const DRAG_CAPTURE_DISTANCE = 4;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function SlideToAction({
  accessibilityLabel,
  disabled,
  knobLabel = '››',
  knobSize = DEFAULT_KNOB_SIZE,
  knobStyle,
  knobTextStyle,
  label,
  labelStyle,
  onComplete,
  resetKey,
  style,
  textStyle,
  trackHeight = DEFAULT_TRACK_HEIGHT,
  trackPadding = DEFAULT_TRACK_PADDING,
  trackStyle,
  trackWidth = DEFAULT_TRACK_WIDTH
}: SlideToActionProps) {
  const [knobX] = useState(() => new Animated.Value(0));
  const knobMax = Math.max(0, trackWidth - knobSize - trackPadding * 2);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: (_, gestureState) => !disabled && Math.abs(gestureState.dx) > DRAG_CAPTURE_DISTANCE,
    onPanResponderGrant: () => {
      knobX.stopAnimation();
    },
    onPanResponderMove: (_, gestureState) => {
      knobX.setValue(clamp(gestureState.dx, 0, knobMax));
    },
    onPanResponderRelease: (_, gestureState) => {
      const finalValue = clamp(gestureState.dx, 0, knobMax);
      if (finalValue >= knobMax) {
        Animated.timing(knobX, {
          duration: COMPLETE_ANIMATION_MS,
          toValue: knobMax,
          useNativeDriver: true
        }).start(({ finished }) => {
          if (finished) {
            onComplete();
          }
        });
        return;
      }

      Animated.spring(knobX, {
        damping: 18,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(knobX, {
        damping: 18,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true
      }).start();
    },
    onPanResponderTerminationRequest: () => true
  }), [disabled, knobMax, knobX, onComplete]);

  useEffect(() => {
    knobX.stopAnimation();
    knobX.setValue(0);
  }, [knobMax, knobX, resetKey]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onAccessibilityTap={disabled ? undefined : onComplete}
      style={style}
    >
      <View
        style={[
          localStyles.track,
          {
            borderRadius: trackHeight / 2,
            height: trackHeight,
            width: trackWidth
          },
          trackStyle
        ]}
        {...panResponder.panHandlers}
      >
        <Text style={[localStyles.text, textStyle, labelStyle]}>{label}</Text>
        <Animated.View
          style={[
            localStyles.knob,
            {
              borderRadius: knobSize / 2,
              height: knobSize,
              left: trackPadding,
              top: trackPadding,
              width: knobSize
            },
            knobStyle,
            { transform: [{ translateX: knobX }] }
          ]}
        >
          <Text style={[localStyles.knobText, knobTextStyle]}>{knobLabel}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  knob: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute'
  },
  knobText: {
    letterSpacing: 0
  },
  text: {
    textAlign: 'center'
  },
  track: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  }
});
