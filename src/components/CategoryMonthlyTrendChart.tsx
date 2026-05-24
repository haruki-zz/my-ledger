import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { colors, styles } from '@/src/components/styles';
import { formatYen } from '@/src/lib/format';
import type { MonthlyCategoryTrendStat } from '@/src/lib/stats';

type CategoryMonthlyTrendChartProps = {
  color: string;
  series: MonthlyCategoryTrendStat[];
};

const WIDTH = 320;
const HEIGHT = 210;
const PADDING_LEFT = 52;
const PADDING_RIGHT = 18;
const PADDING_TOP = 28;
const PADDING_BOTTOM = 38;
const PLOT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

export function CategoryMonthlyTrendChart({ color, series }: CategoryMonthlyTrendChartProps) {
  const maxAmount = Math.max(0, ...series.map((item) => item.amountYen));
  if (series.length === 0 || maxAmount <= 0) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 190 }}>
        <Text style={styles.muted}>暂无该类别趋势数据</Text>
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
  const labelIndexes = labelIndexSet(series.length);
  const valueIndexes = valueIndexSet(points, labelIndexes, maxAmount);

  return (
    <View style={{ gap: 8 }}>
      <Svg height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%">
        <Line stroke={colors.line} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={baseline} y2={baseline} />
        <Line stroke={colors.line} strokeWidth={1} x1={PADDING_LEFT} x2={WIDTH - PADDING_RIGHT} y1={PADDING_TOP} y2={PADDING_TOP} />
        <SvgText fill={colors.muted} fontSize={10} x={4} y={PADDING_TOP + 4}>
          {formatYen(maxAmount)}
        </SvgText>
        <SvgText fill={colors.muted} fontSize={10} x={4} y={baseline + 4}>
          ¥0
        </SvgText>

        <Path d={buildCurvePath(points)} fill="none" stroke={color} strokeLinecap="round" strokeWidth={3} />

        {points.map((point) => (
          <Circle
            cx={point.x}
            cy={point.y}
            fill={colors.surface}
            key={point.monthKey}
            r={4}
            stroke={color}
            strokeWidth={2}
          />
        ))}

        {valueIndexes.map((index) => (
          <SvgText
            fill={colors.ink}
            fontSize={9}
            key={`value-${points[index].monthKey}`}
            textAnchor="middle"
            x={points[index].x}
            y={Math.max(12, points[index].y - 8)}
          >
            {compactYen(points[index].amountYen)}
          </SvgText>
        ))}

        {labelIndexes.map((index) => (
          <SvgText
            fill={colors.muted}
            fontSize={10}
            key={series[index].monthKey}
            textAnchor="middle"
            x={points[index].x}
            y={HEIGHT - 10}
          >
            {series[index].label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
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
  if (length <= 6) {
    return Array.from({ length }, (_, index) => index);
  }

  return [...new Set([
    0,
    Math.floor((length - 1) * 0.25),
    Math.floor((length - 1) * 0.5),
    Math.floor((length - 1) * 0.75),
    length - 1
  ])];
}

function valueIndexSet(
  points: { amountYen: number }[],
  labelIndexes: number[],
  maxAmount: number
) {
  if (points.length <= 6) {
    return points.map((point, index) => (point.amountYen > 0 ? index : -1)).filter((index) => index >= 0);
  }

  return points
    .map((point, index) => (point.amountYen > 0 && (point.amountYen === maxAmount || labelIndexes.includes(index)) ? index : -1))
    .filter((index) => index >= 0);
}

function compactYen(amountYen: number) {
  if (amountYen >= 9950) {
    return `¥${Math.round(amountYen / 1000) / 10}万`;
  }

  if (amountYen >= 1000) {
    return `¥${Math.round(amountYen / 100) / 10}千`;
  }

  return `¥${amountYen}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
