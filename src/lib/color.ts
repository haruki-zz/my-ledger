import type { ColorValue } from 'react-native';

import { colors } from '@/src/components/styles';

export function tintFromAccent(accent: ColorValue, alpha = 0.10) {
  if (typeof accent !== 'string') {
    return colors.tint;
  }

  const match = /^#([0-9a-fA-F]{6})$/.exec(accent);
  if (!match) {
    return colors.tint;
  }

  const [, hex] = match;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}
