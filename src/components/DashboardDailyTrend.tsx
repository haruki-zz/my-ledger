import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { DailyChart } from '@/src/components/DailyChart';
import { DashboardModule } from '@/src/components/DashboardModule';
import { motionLayoutTransition } from '@/src/components/motion';
import { colors, fontFamilies } from '@/src/components/styles';
import { displayName, formatCompactYen } from '@/src/lib/format';
import { useReduceMotion } from '@/src/lib/motion';
import type { DailyUserStat } from '@/src/lib/stats';

type DashboardDailyTrendProps = {
  currentUserColor: string;
  currentUserId: string | null;
  currentUserName: string;
  otherUserColor: string;
  otherUserId: string | null;
  otherUserName: string;
  series: DailyUserStat[];
  todayString: string;
};

const PREVIEW_HEIGHT = 58;

export function DashboardDailyTrend({
  currentUserColor,
  currentUserId,
  currentUserName,
  otherUserColor,
  otherUserId,
  otherUserName,
  series,
  todayString
}: DashboardDailyTrendProps) {
  const [open, setOpen] = useState(false);
  const hasTrend = series.length > 0 && Math.max(0, ...series.map((item) => item.totalAmountYen)) > 0;

  return (
    <DashboardModule
      detail={
        <View style={localStyles.expandedDetail}>
          {hasTrend ? (
            <TrendChart
              currentUserColor={currentUserColor}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              otherUserColor={otherUserColor}
              otherUserId={otherUserId}
              otherUserName={otherUserName}
              series={series}
              todayString={todayString}
            />
          ) : (
            <Text style={localStyles.emptyText}>No daily expense trend yet</Text>
          )}
        </View>
      }
      onToggle={() => setOpen((current) => !current)}
      open={open}
      summary={
        <View style={localStyles.summaryPreview}>
          {hasTrend ? (
            <TrendPreview
              currentUserColor={currentUserColor}
              currentUserId={currentUserId}
              otherUserColor={otherUserColor}
              otherUserId={otherUserId}
              series={series}
              todayString={todayString}
            />
          ) : (
            <Text style={localStyles.emptyText}>No daily expense trend yet</Text>
          )}
        </View>
      }
      summaryStat={
        <View style={localStyles.legend}>
          {currentUserId ? <UserLegendDot color={currentUserColor} label={currentUserName} /> : null}
          {otherUserId ? <UserLegendDot color={otherUserColor} label={otherUserName} /> : null}
        </View>
      }
      title="Daily Trend"
    />
  );
}

function TrendPreview({
  currentUserColor,
  currentUserId,
  otherUserColor,
  otherUserId,
  series,
  todayString
}: Pick<DashboardDailyTrendProps, 'currentUserColor' | 'currentUserId' | 'otherUserColor' | 'otherUserId' | 'series' | 'todayString'>) {
  const maxAmount = Math.max(0, ...series.map((item) => item.totalAmountYen));
  const average = useMemo(() => {
    const elapsed = series.filter((item) => item.date <= todayString);
    const denominator = Math.max(1, elapsed.length || series.length);
    return series.reduce((sum, item) => sum + item.totalAmountYen, 0) / denominator;
  }, [series, todayString]);
  const firstLabel = series[0]?.label || '';
  const lastLabel = series[series.length - 1]?.label || '';

  return (
    <>
      <View style={localStyles.previewBars}>
        {series.map((item) => {
          const totalPx = maxAmount > 0
            ? Math.round((item.totalAmountYen / maxAmount) * PREVIEW_HEIGHT)
            : 0;
          const currentAmount = currentUserId ? item.amountsByUserId[currentUserId] || 0 : 0;
          const currentPx = item.totalAmountYen > 0
            ? Math.round(totalPx * (currentAmount / item.totalAmountYen))
            : 0;
          const future = item.date > todayString;

          return (
            <PreviewBar
              currentColor={currentUserColor}
              currentHeight={currentPx}
              future={future}
              hasOther={Boolean(otherUserId)}
              key={item.date}
              otherColor={otherUserColor}
              totalHeight={totalPx}
            />
          );
        })}
      </View>

      <View style={localStyles.previewFooter}>
        <Text style={localStyles.previewFooterText}>{firstLabel}</Text>
        <Text style={[localStyles.previewFooterText, localStyles.previewAverage]}>avg {formatCompactYen(average)}/day</Text>
        <Text style={localStyles.previewFooterText}>{lastLabel}</Text>
      </View>
    </>
  );
}

function PreviewBar({
  currentColor,
  currentHeight,
  future,
  hasOther,
  otherColor,
  totalHeight
}: {
  currentColor: string;
  currentHeight: number;
  future: boolean;
  hasOther: boolean;
  otherColor: string;
  totalHeight: number;
}) {
  const reduceMotion = useReduceMotion();

  return (
    <Animated.View
      layout={motionLayoutTransition(reduceMotion)}
      style={[
        localStyles.previewBar,
        {
          height: totalHeight,
          opacity: future ? 0.25 : 1
        }
      ]}
    >
      {hasOther ? <View style={[localStyles.previewOther, { backgroundColor: otherColor }]} /> : null}
      {currentHeight > 0 ? (
        <Animated.View
          layout={motionLayoutTransition(reduceMotion)}
          style={[
            localStyles.previewCurrent,
            {
              backgroundColor: currentColor,
              height: currentHeight
            }
          ]}
        />
      ) : null}
    </Animated.View>
  );
}

function TrendChart({
  currentUserColor,
  currentUserId,
  currentUserName,
  otherUserColor,
  otherUserId,
  otherUserName,
  series,
  todayString
}: DashboardDailyTrendProps) {
  return (
    <DailyChart
      currentUserColor={currentUserColor}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      otherUserColor={otherUserColor}
      otherUserId={otherUserId}
      otherUserName={otherUserName}
      series={series}
      todayString={todayString}
    />
  );
}

function UserLegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={localStyles.legendItem}>
      <View style={[localStyles.legendDot, { backgroundColor: color }]} />
      <Text ellipsizeMode="tail" numberOfLines={1} style={localStyles.legendText}>
        {displayName(label).toUpperCase()}
      </Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  expandedDetail: {
    paddingBottom: 14,
    paddingHorizontal: 10,
    paddingTop: 2
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center'
  },
  legend: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9
  },
  legendDot: {
    borderRadius: 2,
    height: 7,
    width: 7
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    maxWidth: 74
  },
  legendText: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12
  },
  previewAverage: {
    color: colors.muted
  },
  previewBar: {
    borderRadius: 2,
    flex: 1,
    justifyContent: 'flex-end',
    minWidth: 0,
    overflow: 'hidden'
  },
  previewBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 2,
    height: PREVIEW_HEIGHT
  },
  previewCurrent: {
    flex: 0
  },
  previewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  previewFooterText: {
    color: colors.subtle,
    fontFamily: fontFamilies.mono,
    fontSize: 9,
    lineHeight: 12
  },
  previewOther: {
    flex: 1
  },
  summaryPreview: {
    gap: 8,
    paddingBottom: 16,
    paddingHorizontal: 16
  }
});
