import { Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, fontFamilies, styles, theme } from '@/src/components/styles';
import { formatYen } from '@/src/lib/format';
import type { DailyStat } from '@/src/lib/stats';

export type DailyChartMode = 'curve' | 'bar';

type DailyChartProps = {
  mode: DailyChartMode;
  series: DailyStat[];
};

const WIDTH = 320;
const HEIGHT = 190;
const PADDING_LEFT = 48;
const PADDING_RIGHT = 14;
const PADDING_TOP = 18;
const PADDING_BOTTOM = 34;
const PLOT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

export function DailyChart({ mode, series }: DailyChartProps) {
  const maxAmount = Math.max(0, ...series.map((item) => item.amountYen));
  if (series.length === 0 || maxAmount <= 0) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <Text style={styles.muted}>No daily expense trend yet</Text>
      </View>
    );
  }

  const points = series.map((item, index) => {
    const x = PADDING_LEFT + (series.length === 1 ? PLOT_WIDTH / 2 : (index / (series.length - 1)) * PLOT_WIDTH);
    const ratio = item.amountYen / maxAmount;
    const y = clamp(PADDING_TOP + PLOT_HEIGHT - ratio * PLOT_HEIGHT, PADDING_TOP, PADDING_TOP + PLOT_HEIGHT);
    return { ...item, x, y };
  });
  const baseline = PADDING_TOP + PLOT_HEIGHT;
  const barSlotWidth = PLOT_WIDTH / series.length;
  const barWidth = Math.max(3, Math.min(18, barSlotWidth * 0.58));
  const labelIndexes = labelIndexSet(series.length);

  return (
    <View style={{ gap: 10 }}>
      <Svg height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%">
        <Line stroke={theme.chart.grid} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={baseline} y2={baseline} />
        <Line stroke={theme.chart.grid} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={PADDING_TOP} y2={PADDING_TOP} />
        <SvgText fill={colors.muted} fontFamily={fontFamilies.regular} fontSize={10} x={4} y={PADDING_TOP + 4}>
          {formatYen(maxAmount)}
        </SvgText>
        <SvgText fill={colors.muted} fontFamily={fontFamilies.regular} fontSize={10} x={4} y={baseline + 4}>
          {formatYen(0)}
        </SvgText>

        {mode === 'bar' ? (
          points.map((point) => (
            <Rect
              fill={theme.chart.primary}
              height={baseline - point.y}
              key={point.date}
              rx={3}
              width={barWidth}
              x={point.x - barWidth / 2}
              y={point.y}
            />
          ))
        ) : (
          <>
            <Path d={buildAreaPath(points, baseline)} fill="rgba(15,118,110,0.10)" />
            <Path d={buildCurvePath(points)} fill="none" stroke={theme.chart.primary} strokeLinecap="round" strokeWidth={3} />
          </>
        )}

        {labelIndexes.map((index) => (
          <SvgText fill={colors.muted} fontFamily={fontFamilies.regular} fontSize={10} key={series[index].date} textAnchor="middle" x={points[index].x} y={HEIGHT - 10}>
            {series[index].label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function buildAreaPath(points: { x: number; y: number }[], baseline: number) {
  if (points.length === 0) {
    return '';
  }

  return [
    buildCurvePath(points),
    `L ${points[points.length - 1].x} ${baseline}`,
    `L ${points[0].x} ${baseline}`,
    'Z'
  ].join(' ');
}

function buildCurvePath(points: { x: number; y: number }[]) {
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const distance = current.x - previous.x;
    const firstControlX = previous.x + distance * 0.45;
    const secondControlX = current.x - distance * 0.45;
    commands.push(`C ${firstControlX} ${previous.y} ${secondControlX} ${current.y} ${current.x} ${current.y}`);
  }

  return commands.join(' ');
}

function labelIndexSet(length: number) {
  if (length <= 1) {
    return [0];
  }

  return [...new Set([0, Math.floor((length - 1) / 2), length - 1])];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
