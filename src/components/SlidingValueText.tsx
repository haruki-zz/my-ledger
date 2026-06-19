import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from 'react-native';

type SlidingValueTextProps = {
  duration?: number;
  fitToWidth?: boolean;
  formatValue: (value: number) => string;
  staggerMs?: number;
  textStyle: StyleProp<TextStyle>;
  value: number;
  wrapperStyle?: StyleProp<ViewStyle>;
};

type StaticToken = {
  char: string;
  key: string;
  type: 'static';
};

type ColumnToken = {
  cells: string[];
  delayMs: number;
  endIndex: number;
  key: string;
  progress: Animated.Value;
  startIndex: number;
  type: 'column';
};

type RenderToken = StaticToken | ColumnToken;

type ActiveTransition = {
  key: number;
  tokens: RenderToken[];
};

const canUseNativeDriver = Platform.OS !== 'web';
const DEFAULT_DURATION = 280;
const DEFAULT_STAGGER_MS = 14;
const DIGIT_ROLL_EASING = Easing.bezier(0.33, 1, 0.68, 1);

export function SlidingValueText({
  duration = DEFAULT_DURATION,
  fitToWidth = false,
  formatValue,
  staggerMs = DEFAULT_STAGGER_MS,
  textStyle,
  value,
  wrapperStyle
}: SlidingValueTextProps) {
  const formattedValue = useMemo(() => formatValue(value), [formatValue, value]);
  const [displayValue, setDisplayValue] = useState(formattedValue);
  const [activeTransition, setActiveTransition] = useState<ActiveTransition | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const displayValueRef = useRef(formattedValue);
  const numericValueRef = useRef(value);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const transitionKeyRef = useRef(0);
  const flattenedTextStyle = StyleSheet.flatten(textStyle) || {};
  const baseFontSize = typeof flattenedTextStyle.fontSize === 'number' ? flattenedTextStyle.fontSize : 14;
  const baseLineHeight = typeof flattenedTextStyle.lineHeight === 'number'
    ? flattenedTextStyle.lineHeight
    : baseFontSize * 1.2;
  const scale = fitToWidth && containerWidth > 0 && naturalWidth > containerWidth
    ? containerWidth / naturalWidth
    : 1;
  const effectiveTextStyle = useMemo(() => ([
    textStyle,
    scale < 1 ? {
      fontSize: baseFontSize * scale,
      lineHeight: baseLineHeight * scale
    } : null
  ]), [baseFontSize, baseLineHeight, scale, textStyle]);
  const effectiveLineHeight = baseLineHeight * scale;

  useEffect(() => {
    const currentDisplayValue = displayValueRef.current;

    if (formattedValue === currentDisplayValue) {
      numericValueRef.current = value;
      return;
    }

    animationRef.current?.stop();
    const transitionKey = transitionKeyRef.current + 1;
    transitionKeyRef.current = transitionKey;
    const nextTokens = buildRenderTokens({
      newText: formattedValue,
      newValue: value,
      oldText: currentDisplayValue,
      oldValue: numericValueRef.current,
      staggerMs
    });

    displayValueRef.current = formattedValue;
    numericValueRef.current = value;
    setDisplayValue(formattedValue);
    setActiveTransition({ key: transitionKey, tokens: nextTokens });

    const animations = nextTokens.flatMap((token) => {
      if (token.type !== 'column') {
        return [];
      }

      token.progress.setValue(0);
      return Animated.sequence([
        Animated.delay(token.delayMs),
        Animated.timing(token.progress, {
          duration,
          easing: DIGIT_ROLL_EASING,
          toValue: 1,
          useNativeDriver: canUseNativeDriver
        })
      ]);
    });

    if (animations.length === 0) {
      setActiveTransition(null);
      return;
    }

    const animation = Animated.parallel(animations);
    animationRef.current = animation;
    animation.start(({ finished }) => {
      if (finished && transitionKeyRef.current === transitionKey) {
        setActiveTransition(null);
        animationRef.current = null;
      }
    });

    return () => {
      animation.stop();
    };
  }, [duration, formattedValue, staggerMs, value]);

  function handleWrapperLayout(event: LayoutChangeEvent) {
    if (!fitToWidth) {
      return;
    }

    const nextWidth = event.nativeEvent.layout.width;
    if (Math.abs(nextWidth - containerWidth) > 0.5) {
      setContainerWidth(nextWidth);
    }
  }

  return (
    <Animated.View onLayout={handleWrapperLayout} style={[componentStyles.wrapper, wrapperStyle]}>
      {activeTransition ? (
        <Animated.View style={componentStyles.row}>
          {activeTransition.tokens.map((token) => (
            token.type === 'static'
              ? renderStaticToken(token, effectiveTextStyle, effectiveLineHeight)
              : renderColumnToken(token, effectiveTextStyle, effectiveLineHeight)
          ))}
        </Animated.View>
      ) : (
        <Text numberOfLines={1} style={effectiveTextStyle}>
          {displayValue}
        </Text>
      )}
      {fitToWidth ? (
        <Text
          numberOfLines={1}
          onLayout={(event) => setNaturalWidth(event.nativeEvent.layout.width)}
          style={[textStyle, componentStyles.measureText]}
        >
          {displayValue}
        </Text>
      ) : null}
    </Animated.View>
  );
}

function renderStaticToken(token: StaticToken, textStyle: StyleProp<TextStyle>, lineHeight: number) {
  return (
    <Text key={token.key} style={[textStyle, { height: lineHeight, lineHeight }]}>
      {token.char}
    </Text>
  );
}

function renderColumnToken(token: ColumnToken, textStyle: StyleProp<TextStyle>, lineHeight: number) {
  const translateY = token.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-token.startIndex * lineHeight, -token.endIndex * lineHeight]
  });

  return (
    <Animated.View key={token.key} style={[componentStyles.column, { height: lineHeight }]}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {token.cells.map((cell, index) => (
          <Text key={`${token.key}-${index}`} style={[textStyle, { height: lineHeight, lineHeight }]}>
            {cell}
          </Text>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

function buildRenderTokens({
  newText,
  newValue,
  oldText,
  oldValue,
  staggerMs
}: {
  newText: string;
  newValue: number;
  oldText: string;
  oldValue: number;
  staggerMs: number;
}): RenderToken[] {
  const oldDigitsFromRight = [...oldText].filter(isDigit).reverse();
  const direction = newValue >= oldValue ? 1 : -1;
  const reversedTokens: RenderToken[] = [];
  let digitOrdinal = 0;

  [...newText].reverse().forEach((char, indexFromRight) => {
    const keyBase = `${newText.length - indexFromRight}-${char}`;

    if (!isDigit(char)) {
      reversedTokens.push({
        char,
        key: `static-${keyBase}`,
        type: 'static'
      });
      return;
    }

    const oldDigit = oldDigitsFromRight[digitOrdinal] ?? null;
    const delayIndex = digitOrdinal;
    digitOrdinal += 1;

    if (oldDigit === char) {
      reversedTokens.push({
        char,
        key: `static-${keyBase}-${delayIndex}`,
        type: 'static'
      });
      return;
    }

    reversedTokens.push({
      ...buildDigitColumn(oldDigit, char, direction),
      delayMs: delayIndex * staggerMs,
      key: `column-${keyBase}-${delayIndex}-${staggerMs}`,
      progress: new Animated.Value(0),
      type: 'column'
    });
  });

  return reversedTokens.reverse();
}

function buildDigitColumn(oldDigit: string | null, newDigit: string, direction: 1 | -1) {
  if (oldDigit === null) {
    return direction === 1
      ? { cells: ['', newDigit], endIndex: 1, startIndex: 0 }
      : { cells: [newDigit, ''], endIndex: 0, startIndex: 1 };
  }

  const sequence = digitSequence(Number(oldDigit), Number(newDigit), direction).map(String);

  if (direction === 1) {
    return {
      cells: sequence,
      endIndex: sequence.length - 1,
      startIndex: 0
    };
  }

  return {
    cells: sequence.slice().reverse(),
    endIndex: 0,
    startIndex: sequence.length - 1
  };
}

function digitSequence(oldDigit: number, newDigit: number, direction: 1 | -1) {
  const sequence = [oldDigit];
  let value = oldDigit;

  while (value !== newDigit && sequence.length <= 10) {
    value = (value + direction + 10) % 10;
    sequence.push(value);
  }

  return sequence;
}

function isDigit(char: string) {
  return char >= '0' && char <= '9';
}

const componentStyles = StyleSheet.create({
  column: {
    overflow: 'hidden'
  },
  measureText: {
    left: 0,
    opacity: 0,
    position: 'absolute',
    top: 0
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row'
  },
  wrapper: {
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative'
  }
});
