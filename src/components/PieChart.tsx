import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, styles } from '@/src/components/styles';
import { formatYen } from '@/src/lib/format';
import type { CategoryStat } from '@/src/lib/stats';

type PieChartProps = {
  categories: CategoryStat[];
  totalYen: number;
};

const SIZE = 160;
const CENTER = SIZE / 2;
const RADIUS = 62;

export function PieChart({ categories, totalYen }: PieChartProps) {
  if (totalYen <= 0 || categories.length === 0) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <Text style={styles.muted}>暂无可统计的类别支出</Text>
      </View>
    );
  }

  const slices = categories.reduce<({ startAngle: number; endAngle: number } & CategoryStat)[]>((items, category) => {
    const startAngle = items.length > 0 ? items[items.length - 1].endAngle : -90;
    const endAngle = startAngle + (category.amountYen / totalYen) * 360;
    items.push({ ...category, startAngle, endAngle });
    return items;
  }, []);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ alignItems: 'center' }}>
        <Svg height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE}>
          <Circle cx={CENTER} cy={CENTER} fill="#EEF3F7" r={RADIUS} />
          {slices.length === 1 ? (
            <Circle cx={CENTER} cy={CENTER} fill={slices[0].color} r={RADIUS} />
          ) : (
            slices.map((category) => (
              <Path
                d={describeArc(CENTER, CENTER, RADIUS, category.startAngle, category.endAngle)}
                fill={category.color}
                key={category.category}
              />
            ))
          )}
          <Circle cx={CENTER} cy={CENTER} fill={colors.surface} r={34} />
        </Svg>
      </View>

      <View style={{ gap: 10 }}>
        {categories.map((category) => (
          <View key={category.category} style={[styles.between, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
              <View
                style={{
                  backgroundColor: category.color,
                  borderRadius: 4,
                  height: 12,
                  marginTop: 4,
                  width: 12
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{category.category}</Text>
                <Text style={styles.muted}>{category.percentage.toFixed(1)}%</Text>
              </View>
            </View>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>
              {formatYen(category.amountYen)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z'
  ].join(' ');
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}
