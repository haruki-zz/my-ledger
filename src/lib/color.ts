import type { ColorValue } from 'react-native';

import { colors } from '@/src/components/styles';

const MUTED_NEUTRAL = '#9A8F84';

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

/**
 * Pulls a chart color toward a shared warm-neutral so a multi-category
 * palette reads as one low-saturation family instead of a full rainbow.
 */
export function mutedChartColor(color: string, amount = 0.4) {
  const from = parseHexColor(color);
  const toward = parseHexColor(MUTED_NEUTRAL);
  if (!from || !toward) {
    return color;
  }

  const mixChannel = (a: number, b: number) => Math.round(a + (b - a) * amount);
  const red = mixChannel(from.red, toward.red);
  const green = mixChannel(from.green, toward.green);
  const blue = mixChannel(from.blue, toward.blue);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function parseHexColor(color: string) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (!match) {
    return null;
  }

  const [, hex] = match;
  return {
    blue: Number.parseInt(hex.slice(4, 6), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    red: Number.parseInt(hex.slice(0, 2), 16)
  };
}
