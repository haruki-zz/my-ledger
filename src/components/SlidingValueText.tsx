import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

type SlidingValueTextProps = {
  duration?: number;
  formatValue: (value: number) => string;
  textStyle: StyleProp<TextStyle>;
  value: number;
  wrapperStyle?: StyleProp<ViewStyle>;
};

const canUseNativeDriver = process.env.EXPO_OS !== 'web';

export function SlidingValueText({
  duration = 220,
  formatValue,
  textStyle,
  value,
  wrapperStyle
}: SlidingValueTextProps) {
  const formattedValue = useMemo(() => formatValue(value), [formatValue, value]);
  const [displayValue, setDisplayValue] = useState(formattedValue);
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [progress] = useState(() => new Animated.Value(1));
  const displayValueRef = useRef(formattedValue);

  useEffect(() => {
    const currentDisplayValue = displayValueRef.current;

    if (formattedValue === currentDisplayValue) {
      return;
    }

    progress.stopAnimation();
    setPreviousValue(currentDisplayValue);
    displayValueRef.current = formattedValue;
    setDisplayValue(formattedValue);
    progress.setValue(0);
    Animated.timing(progress, {
      duration,
      toValue: 1,
      useNativeDriver: canUseNativeDriver
    }).start(({ finished }) => {
      if (finished) {
        setPreviousValue(null);
      }
    });
  }, [duration, formattedValue, progress]);

  if (previousValue === null) {
    return (
      <Animated.View style={[componentStyles.wrapper, wrapperStyle]}>
        <Text numberOfLines={1} style={[textStyle, componentStyles.textLayer]}>
          {displayValue}
        </Text>
      </Animated.View>
    );
  }

  const outgoingStyle = {
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0]
    }),
    transform: [{
      translateY: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -18]
      })
    }]
  };
  const incomingStyle = {
    opacity: progress,
    transform: [{
      translateY: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [18, 0]
      })
    }]
  };

  return (
    <Animated.View style={[componentStyles.wrapper, wrapperStyle]}>
      <Animated.Text numberOfLines={1} style={[textStyle, componentStyles.textLayer, outgoingStyle]}>
        {previousValue}
      </Animated.Text>
      <Animated.Text numberOfLines={1} style={[textStyle, componentStyles.textLayer, incomingStyle]}>
        {displayValue}
      </Animated.Text>
    </Animated.View>
  );
}

const componentStyles = StyleSheet.create({
  textLayer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  wrapper: {
    overflow: 'hidden',
    position: 'relative'
  }
});
