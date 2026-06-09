import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, theme } from '@/src/components/styles';
import {
  STACK_CARD_MIN_HEIGHT,
  TransferItemCard,
  completedAtForUser
} from '@/src/components/TransferChecklistShared';
import type { TransferChecklistItemRow } from '@/src/types/database';

type TransferStackPreviewProps = {
  currentUserId: string | null;
  items: TransferChecklistItemRow[];
  onPress: () => void;
  userName: (userId: string | null) => string;
};

const STACK_PREVIEW_COUNT = 3;
const STACK_OFFSET_Y = 10;
const STACK_SCALE_STEP = 0.035;
const STACK_OPACITY_STEP = 0.08;

export function TransferStackPreview({
  currentUserId,
  items,
  onPress,
  userName
}: TransferStackPreviewProps) {
  const topItem = items[0];
  const peekCount = Math.min(Math.max(items.length - 1, 0), STACK_PREVIEW_COUNT - 1);
  const stackHeight = STACK_CARD_MIN_HEIGHT + peekCount * STACK_OFFSET_Y;

  if (!topItem) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={`Open transfer items, ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        stackStyles.stackPressable,
        { minHeight: stackHeight },
        pressed && stackStyles.stackPressed
      ]}
    >
      {Array.from({ length: peekCount }, (_, index) => {
        const depth = peekCount - index;
        return (
          <View
            key={`peek-${depth}`}
            pointerEvents="none"
            style={[
              stackStyles.stackLayer,
              stackStyles.stackPeekLayer,
              {
                opacity: 1 - depth * STACK_OPACITY_STEP,
                transform: [
                  { translateY: depth * STACK_OFFSET_Y },
                  { scale: 1 - depth * STACK_SCALE_STEP }
                ]
              }
            ]}
          />
        );
      })}

      <View pointerEvents="none" style={stackStyles.stackLayer}>
        <TransferItemCard
          canToggle={false}
          currentCompleted={Boolean(completedAtForUser(topItem, currentUserId))}
          item={topItem}
          saving={false}
          showToggle={false}
          userName={userName}
        >
          <View style={stackStyles.countBadge}>
            <Text style={stackStyles.countBadgeText}>{items.length} open</Text>
          </View>
        </TransferItemCard>
      </View>
    </Pressable>
  );
}

const stackStyles = StyleSheet.create({
  countBadge: {
    backgroundColor: colors.tint,
    borderColor: colors.line,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 2
  },
  countBadgeText: {
    color: colors.primaryDark,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15
  },
  stackLayer: {
    left: 0,
    minHeight: STACK_CARD_MIN_HEIGHT,
    position: 'absolute',
    right: 0,
    top: 0
  },
  stackPeekLayer: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: colors.line,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    ...theme.shadow
  },
  stackPressable: {
    justifyContent: 'flex-start',
    marginTop: 2
  },
  stackPressed: {
    opacity: 0.86
  }
});
