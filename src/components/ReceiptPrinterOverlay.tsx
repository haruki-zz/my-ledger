import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Svg, { Defs, Pattern, Polygon, Rect } from 'react-native-svg';

import { SlideToAction } from '@/src/components/SlideToAction';
import { colors, fontFamilies } from '@/src/components/styles';
import {
  activeReceiptPrinterRun,
  buildReceiptPrinterModel,
  type ReceiptPrinterModel,
  type ReceiptPrinterNode,
  type ReceiptPrinterTypedRun
} from '@/src/lib/receiptPrinter';
import type { MonthlyReceiptStat } from '@/src/lib/stats';

const RECEIPT_WIDTH = 290;
const KNOB_SIZE = 52;
const TRACK_WIDTH = 300;
const TRACK_PADDING = 4;
const PRINT_LEAD_IN_MS = 440;
const AUTO_SAVE_DELAY_MS = 5000;

type PrinterPhase = 'dismissing' | 'morphing' | 'ready' | 'printing' | 'tray';

type ReceiptPrinterOverlayProps = {
  currentUserName: string;
  onKeep: () => void;
  otherUserName: string;
  receipt: MonthlyReceiptStat;
  reduceMotion: boolean;
  safeAreaBottom: number;
  safeAreaTop: number;
};

export function ReceiptPrinterOverlay({
  currentUserName,
  onKeep,
  otherUserName,
  receipt,
  reduceMotion,
  safeAreaBottom,
  safeAreaTop
}: ReceiptPrinterOverlayProps) {
  const [phase, setPhase] = useState<PrinterPhase>(reduceMotion ? 'tray' : 'ready');
  const [typed, setTyped] = useState(0);
  const [printedReceipt] = useState(() => receipt);
  const [readyOpacity] = useState(() => new Animated.Value(1));
  const [printerMorph] = useState(() => new Animated.Value(0));
  const [printerDismiss] = useState(() => new Animated.Value(0));
  const startingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const printedModel = useMemo(() => buildReceiptPrinterModel({
    currentUserName,
    otherUserName,
    receipt: printedReceipt
  }), [currentUserName, otherUserName, printedReceipt]);
  const model = printedModel;
  const displayTyped = phase === 'printing' ? typed : model.totalChars;

  useEffect(() => {
    if (reduceMotion) {
      setPhase('tray');
      setTyped(printedModel.totalChars);
    }
  }, [printedModel.totalChars, reduceMotion]);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (phase !== 'printing') {
      return;
    }

    const step = () => {
      setTyped((current) => {
        const next = Math.min(current + 1, printedModel.totalChars);
        if (next >= printedModel.totalChars) {
          timerRef.current = setTimeout(() => {
            setPhase('tray');
          }, 120);
          return next;
        }
        timerRef.current = setTimeout(step, charDelay(printedModel.stream[next - 1] || ''));
        return next;
      });
    };

    timerRef.current = setTimeout(step, PRINT_LEAD_IN_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [phase, printedModel.stream, printedModel.totalChars]);

  const startDismiss = useCallback(() => {
    if (reduceMotion) {
      onKeep();
      return;
    }

    setPhase('dismissing');
    printerDismiss.setValue(0);
    Animated.timing(printerDismiss, {
      duration: 620,
      easing: Easing.in(Easing.cubic),
      toValue: 1,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        onKeep();
      }
    });
  }, [onKeep, printerDismiss, reduceMotion]);

  useEffect(() => {
    if (phase !== 'tray') {
      return;
    }

    autoSaveTimerRef.current = setTimeout(startDismiss, AUTO_SAVE_DELAY_MS);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [phase, startDismiss]);

  function startPrint() {
    if (phase !== 'ready' || startingRef.current) {
      return;
    }

    if (reduceMotion) {
      setTyped(printedModel.totalChars);
      setPhase('tray');
      return;
    }

    startingRef.current = true;
    Animated.timing(readyOpacity, {
      duration: 240,
      easing: Easing.out(Easing.quad),
      toValue: 0,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) {
        startingRef.current = false;
        return;
      }

      setPhase('morphing');
      printerMorph.setValue(0);
      Animated.timing(printerMorph, {
        duration: 620,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true
      }).start(() => {
        startingRef.current = false;
        setTyped(0);
        setPhase('printing');
      });
    });
  }

  return (
    <View style={[localStyles.overlay, { paddingBottom: safeAreaBottom + 16, paddingTop: safeAreaTop + 8 }]}>
      <View style={localStyles.topZone}>
        {phase === 'ready' ? (
          <Animated.View style={{ opacity: readyOpacity }}>
            <ReadyControls
              monthLabel={printedReceipt.label}
              onStartPrint={startPrint}
            />
          </Animated.View>
        ) : null}
        {phase === 'morphing' ? <MorphingPrinter progress={printerMorph} /> : null}
        {phase === 'printing' || phase === 'tray' ? <PrinterChrome phase={phase} /> : null}
        {phase === 'dismissing' ? <DismissingPrinter progress={printerDismiss} /> : null}
      </View>
      <View style={localStyles.feedWrap}>
        <ScrollView
          contentContainerStyle={localStyles.feedContent}
          showsVerticalScrollIndicator={false}
          style={localStyles.feed}
        >
          {phase === 'ready' || phase === 'morphing' ? (
            <View style={localStyles.emptyFeed} />
          ) : (
            <View
              accessibilityLabel={`${printedReceipt.label}, ${printedReceipt.records} records`}
              style={localStyles.paperWrap}
            >
              <TearEdge direction="top" />
              <ReceiptPrinterPaper
                model={model}
                showCursor={phase === 'printing'}
                typed={displayTyped}
              />
              {displayTyped >= model.totalChars ? <TearEdge direction="bottom" /> : null}
            </View>
          )}
        </ScrollView>
      </View>
      <View style={localStyles.bottomZone}>
        {phase === 'printing' ? (
          <View style={localStyles.printingBar}>
            <View style={localStyles.printingDot} />
            <Text style={localStyles.printingText}>PRINTING RECEIPT...</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function MorphingPrinter({ progress }: { progress: Animated.Value }) {
  const opacity = progress.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 1, 1]
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.32, 1]
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-58, 0]
  });

  return (
    <Animated.View
      style={[
        localStyles.printerMorphFromSystemIsland,
        {
          opacity,
          transform: [
            { translateY },
            { scale }
          ]
        }
      ]}
    >
      <PrinterChrome phase="ready" />
    </Animated.View>
  );
}

function DismissingPrinter({ progress }: { progress: Animated.Value }) {
  const opacity = progress.interpolate({
    inputRange: [0, 0.88, 1],
    outputRange: [1, 1, 0]
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.32]
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -58]
  });

  return (
    <Animated.View
      style={[
        localStyles.printerMorphFromSystemIsland,
        {
          opacity,
          transform: [
            { translateY },
            { scale }
          ]
        }
      ]}
    >
      <PrinterChrome phase="tray" />
    </Animated.View>
  );
}

function PrinterChrome({ phase }: { phase: Exclude<PrinterPhase, 'dismissing' | 'morphing'> }) {
  const ledStyle = phase === 'printing'
    ? localStyles.ledPrinting
    : phase === 'tray'
      ? localStyles.ledDone
      : localStyles.ledReady;
  const label = phase === 'printing' ? 'PRINTING' : phase === 'tray' ? 'DONE' : 'READY';

  return (
    <View style={localStyles.printer}>
      <View style={localStyles.roll} />
      <View style={[localStyles.knob, localStyles.knobLeft]} />
      <View style={[localStyles.knob, localStyles.knobRight]} />
      <View style={localStyles.brandRow}>
        <Text style={localStyles.brand}>MY LEDGER · THERMAL CO.</Text>
        <View style={localStyles.statusGroup}>
          <View style={[localStyles.led, ledStyle]} />
          <Text style={localStyles.ledText}>{label}</Text>
        </View>
      </View>
      <View style={localStyles.vents}>
        <View style={localStyles.vent} />
        <View style={localStyles.vent} />
      </View>
      <View style={localStyles.slot}>
        <View style={localStyles.slotInner} />
      </View>
    </View>
  );
}

function ReadyControls({
  monthLabel,
  onStartPrint
}: {
  monthLabel: string;
  onStartPrint: () => void;
}) {
  return (
    <View style={localStyles.readyBar}>
      <View style={localStyles.readyCaption}>
        <Text style={localStyles.readySmall}>MONTH CLOSED · {monthLabel}</Text>
        <Text style={localStyles.readyBig}>Your {titleCaseMonth(monthLabel)} receipt is ready</Text>
      </View>
      <SlideToAction
        accessibilityLabel="Slide to print receipt"
        knobLabel="››"
        knobSize={KNOB_SIZE}
        knobStyle={localStyles.slideKnob}
        knobTextStyle={localStyles.slideKnobText}
        label="SLIDE TO PRINT"
        onComplete={onStartPrint}
        textStyle={localStyles.slideText}
        trackHeight={60}
        trackPadding={TRACK_PADDING}
        trackStyle={localStyles.slideTrack}
        trackWidth={TRACK_WIDTH}
      />
    </View>
  );
}

function ReceiptPrinterPaper({
  model,
  showCursor,
  typed
}: {
  model: ReceiptPrinterModel;
  showCursor: boolean;
  typed: number;
}) {
  const activeRunId = activeReceiptPrinterRun(model, typed)?.id || null;

  return (
    <View style={localStyles.paper}>
      {model.nodes.map((node) => (
        <PrinterNode
          activeRunId={activeRunId}
          key={node.id}
          node={node}
          showCursor={showCursor}
          typed={typed}
        />
      ))}
    </View>
  );
}

function PrinterNode({
  activeRunId,
  node,
  showCursor,
  typed
}: {
  activeRunId: string | null;
  node: ReceiptPrinterNode;
  showCursor: boolean;
  typed: number;
}) {
  if (node.type !== 'dot' && node.type !== 'text' && typed < node.start) {
    return null;
  }

  if (node.type === 'section') {
    if (node.role === 'items') {
      return (
        <View style={localStyles.itemsList}>
          {node.children.map((child) => (
            <PrinterNode
              activeRunId={activeRunId}
              key={child.id}
              node={child}
              showCursor={showCursor}
              typed={typed}
            />
          ))}
        </View>
      );
    }

    return (
      <View style={sectionStyle(node.role)}>
        {node.children.map((child) => (
          <PrinterNode
            activeRunId={activeRunId}
            key={child.id}
            node={child}
            showCursor={showCursor}
            typed={typed}
          />
        ))}
      </View>
    );
  }

  if (node.type === 'row') {
    return (
      <View style={rowStyle(node.role)}>
        {node.children.map((child) => (
          <PrinterNode
            activeRunId={activeRunId}
            key={child.id}
            node={child}
            showCursor={showCursor}
            typed={typed}
          />
        ))}
      </View>
    );
  }

  if (node.type === 'dot') {
    return <View style={[localStyles.itemDot, { backgroundColor: node.color, opacity: node.opacity ?? 1 }]} />;
  }

  if (node.type === 'text') {
    return (
      <TypedRun
        active={activeRunId === node.id}
        run={node}
        showCursor={showCursor}
        typed={typed}
      />
    );
  }

  if (node.type === 'rule') {
    return <View style={ruleStyle(node.variant)} />;
  }

  if (node.type === 'barcode') {
    return (
      <View accessibilityLabel="Category spend share barcode" style={localStyles.barcode}>
        {node.bars.map((bar, index) => (
          <View
            key={`${index}-${bar.width}-${bar.color}`}
            style={[localStyles.barcodeBar, { backgroundColor: bar.color, width: bar.width }]}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={localStyles.tearWrap}>
      <TearEdge direction={node.direction} />
    </View>
  );
}

const TypedRun = memo(function TypedRun({
  active,
  run,
  showCursor,
  typed
}: {
  active: boolean;
  run: ReceiptPrinterTypedRun;
  showCursor: boolean;
  typed: number;
}) {
  const visibleLength = visibleRunLength(run, typed);
  const text = run.text.slice(0, visibleLength);
  const cursor = showCursor && active ? '|' : '';

  return (
    <Text numberOfLines={run.kind === 'category' ? 1 : undefined} style={textStyle(run)}>
      {text}
      {cursor}
    </Text>
  );
}, (previous, next) => (
  previous.active === next.active &&
  previous.run.color === next.run.color &&
  previous.run.length === next.run.length &&
  previous.run.offset === next.run.offset &&
  previous.run.text === next.run.text &&
  previous.showCursor === next.showCursor &&
  visibleRunLength(previous.run, previous.typed) === visibleRunLength(next.run, next.typed)
));

function TearEdge({ direction }: { direction: 'bottom' | 'top' }) {
  const points = direction === 'top' ? '0,9 6,0 12,9' : '0,0 12,0 6,9';
  return (
    <Svg height={9} width={RECEIPT_WIDTH}>
      <Defs>
        <Pattern height={9} id={`printer-tear-${direction}`} patternUnits="userSpaceOnUse" width={12}>
          <Polygon fill="#FFFDF7" points={points} />
        </Pattern>
      </Defs>
      <Rect fill={`url(#printer-tear-${direction})`} height={9} width={RECEIPT_WIDTH} />
    </Svg>
  );
}

function visibleRunLength(run: ReceiptPrinterTypedRun, typed: number) {
  return Math.max(0, Math.min(run.length, typed - run.offset));
}

function charDelay(ch: string) {
  let delay = 9 + Math.random() * 16;
  if (ch === ' ') {
    delay += 30 + Math.random() * 55;
  }
  if (',.%·/#&'.includes(ch)) {
    delay += 35;
  }
  if (/[0-9]/.test(ch)) {
    delay += 6;
  }
  if (Math.random() < 0.04) {
    delay += 110 + Math.random() * 170;
  }
  return delay;
}

function titleCaseMonth(label: string) {
  return label.toLowerCase().replace(/\b\w/g, (match) => match.toUpperCase());
}

function rowStyle(role: Extract<ReceiptPrinterNode, { type: 'row' }>['role']) {
  if (role === 'category') {
    return localStyles.categoryRow;
  }
  if (role === 'columns') {
    return localStyles.columnsRow;
  }
  if (role === 'comparison') {
    return localStyles.comparisonRow;
  }
  if (role === 'header') {
    return localStyles.receiptHeader;
  }
  if (role === 'metaGroup') {
    return localStyles.receiptMetaGroup;
  }
  if (role === 'member' || role === 'kv') {
    return localStyles.keyValueRow;
  }
  if (role === 'total') {
    return localStyles.totalRow;
  }
  return localStyles.keyValueRow;
}

function sectionStyle(role: Extract<ReceiptPrinterNode, { type: 'section' }>['role']) {
  if (role === 'settlement') {
    return localStyles.settlementModule;
  }
  return localStyles.section;
}

function ruleStyle(variant: Extract<ReceiptPrinterNode, { type: 'rule' }>['variant']) {
  if (variant === 'compact') {
    return localStyles.ruleCompact;
  }
  if (variant === 'settlement') {
    return localStyles.settlementDivider;
  }
  return localStyles.rule;
}

function textStyle(run: ReceiptPrinterTypedRun) {
  const color = run.color || colors.ink;
  if (run.id === 'column-item') {
    return [localStyles.columnItem, { color }];
  }
  if (run.id === 'column-mom') {
    return [localStyles.columnMom, { color }];
  }
  if (run.id === 'column-amount') {
    return [localStyles.columnAmount, { color }];
  }
  if (run.kind === 'heading') {
    return [localStyles.receiptMonth, { color }];
  }
  if (run.kind === 'meta' && (run.id === 'records' || run.id === 'daily-average')) {
    return [localStyles.receiptMeta, { color }];
  }
  if (run.kind === 'category') {
    return [localStyles.itemNameText, { color }];
  }
  if (run.kind === 'mom') {
    return [localStyles.itemMom, { color }];
  }
  if (run.kind === 'amount' && run.id.includes('category-')) {
    return [localStyles.itemAmount, { color }];
  }
  if (run.kind === 'amount') {
    return [localStyles.keyValue, { color }];
  }
  if (run.kind === 'total' && run.id === 'total-value') {
    return [localStyles.totalValue, { color }];
  }
  if (run.kind === 'total') {
    return [localStyles.totalLabel, { color }];
  }
  if (run.kind === 'comparison') {
    return [localStyles.comparisonText, { color }];
  }
  if (run.id === 'split-title') {
    return [localStyles.splitHeader, { color }];
  }
  return [localStyles.keyLabel, { color }];
}

const localStyles = StyleSheet.create({
  barcode: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 2,
    height: 32,
    justifyContent: 'center',
    marginBottom: 2,
    marginTop: 10
  },
  barcodeBar: {
    backgroundColor: colors.primaryDark
  },
  bottomZone: {
    flexShrink: 0
  },
  brand: {
    color: '#C9A86A',
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    lineHeight: 15
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  categoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 3
  },
  columnAmount: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 12,
    textAlign: 'right',
    width: 64
  },
  columnItem: {
    color: colors.subtle,
    flex: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 12
  },
  columnMom: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 12,
    textAlign: 'center',
    width: 50
  },
  columnsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 6
  },
  comparisonRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 7
  },
  comparisonText: {
    color: colors.muted,
    fontFamily: fontFamilies.mono,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'right'
  },
  emptyFeed: {
    height: 60
  },
  feed: {
    flex: 1
  },
  feedContent: {
    alignItems: 'center',
    paddingBottom: 70
  },
  feedWrap: {
    flex: 1,
    marginTop: -6,
    minHeight: 0,
    position: 'relative'
  },
  itemAmount: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'right',
    width: 64
  },
  itemDot: {
    borderRadius: 2,
    height: 8,
    width: 8
  },
  itemMom: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
    width: 50
  },
  itemNameText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    minWidth: 0
  },
  itemsList: {
    paddingRight: 6
  },
  keyLabel: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 17,
    minWidth: 0
  },
  keyValue: {
    color: colors.ink,
    fontFamily: fontFamilies.monoBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'right'
  },
  keyValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingVertical: 3
  },
  knob: {
    backgroundColor: '#534d46',
    borderRadius: 8,
    height: 15,
    position: 'absolute',
    top: -4,
    width: 15
  },
  knobLeft: {
    left: 16
  },
  knobRight: {
    right: 16
  },
  led: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  ledDone: {
    backgroundColor: '#C9923A',
    boxShadow: '0 0 6px rgba(201,146,58,0.55)'
  },
  ledPrinting: {
    backgroundColor: '#E8B84B',
    boxShadow: '0 0 10px rgba(232,184,75,0.85)'
  },
  ledReady: {
    backgroundColor: '#7a6a44'
  },
  ledText: {
    color: '#8c857c',
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
    lineHeight: 14
  },
  overlay: {
    backgroundColor: colors.bg,
    bottom: 0,
    flexDirection: 'column',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20
  },
  paper: {
    backgroundColor: '#FFFDF7',
    paddingBottom: 16,
    paddingHorizontal: 22,
    paddingTop: 22,
    width: RECEIPT_WIDTH
  },
  paperWrap: {
    boxShadow: '0 22px 28px rgba(42,39,34,0.26)'
  },
  printerMorphFromSystemIsland: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center'
  },
  printer: {
    alignSelf: 'center',
    backgroundColor: '#35312d',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    boxShadow: '0 20px 32px -20px rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingTop: 15,
    position: 'relative',
    width: 312,
    zIndex: 2
  },
  printingBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingBottom: 26,
    paddingHorizontal: 22,
    paddingTop: 18
  },
  printingDot: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    height: 8,
    width: 8
  },
  printingText: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    lineHeight: 15
  },
  readyBar: {
    paddingBottom: 20,
    paddingHorizontal: 22,
    paddingTop: 12
  },
  readyBig: {
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
    textAlign: 'center'
  },
  readyCaption: {
    marginBottom: 12
  },
  readySmall: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    lineHeight: 13,
    textAlign: 'center'
  },
  receiptMeta: {
    color: colors.muted,
    fontFamily: fontFamilies.mono,
    fontSize: 10.5,
    lineHeight: 14,
    textAlign: 'right'
  },
  receiptMetaGroup: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 1
  },
  receiptMonth: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fontFamilies.monoBold,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.5,
    lineHeight: 23,
    minWidth: 0
  },
  receiptHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minWidth: 0
  },
  roll: {
    backgroundColor: '#4a453f',
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    height: 14,
    left: 26,
    position: 'absolute',
    right: 26,
    top: -7
  },
  rule: {
    borderColor: 'rgba(42,39,34,0.32)',
    borderStyle: 'dashed',
    borderTopWidth: 1,
    height: 0,
    marginVertical: 11
  },
  ruleCompact: {
    borderColor: 'rgba(42,39,34,0.32)',
    borderStyle: 'dashed',
    borderTopWidth: 1,
    height: 0,
    marginVertical: 6
  },
  section: {
    gap: 0
  },
  settlementDivider: {
    backgroundColor: 'rgba(42,39,34,0.42)',
    height: 2,
    marginBottom: 8,
    marginTop: 7
  },
  settlementModule: {
    marginTop: 2
  },
  slideKnob: {
    alignItems: 'center',
    backgroundColor: '#B9852F',
    borderRadius: 26,
    boxShadow: '0 4px 10px rgba(168,116,31,0.45)',
    height: KNOB_SIZE,
    justifyContent: 'center',
    left: TRACK_PADDING,
    position: 'absolute',
    top: TRACK_PADDING,
    width: KNOB_SIZE
  },
  slideKnobText: {
    color: '#FFF6E4',
    fontFamily: fontFamilies.bold,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 22
  },
  slideText: {
    color: colors.muted,
    fontFamily: fontFamilies.monoBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    lineHeight: 15,
    paddingLeft: 60,
    textAlign: 'center'
  },
  slideTrack: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#EFE7DB',
    borderColor: 'rgba(42,39,34,0.10)',
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: 'inset 0 2px 5px rgba(42,39,34,0.12)',
    height: 60,
    justifyContent: 'center',
    position: 'relative',
    width: TRACK_WIDTH
  },
  slot: {
    backgroundColor: '#1f1c18',
    height: 24,
    marginHorizontal: -16,
    marginTop: 15,
    position: 'relative'
  },
  slotInner: {
    backgroundColor: '#0e0c0a',
    borderRadius: 3,
    boxShadow: '0 1px 0 rgba(201,168,106,0.28)',
    height: 8,
    left: 18,
    position: 'absolute',
    right: 18,
    top: 8
  },
  splitHeader: {
    color: colors.subtle,
    fontFamily: fontFamilies.monoBold,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1.5,
    lineHeight: 12,
    marginBottom: 2
  },
  statusGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  tearWrap: {
    marginHorizontal: -22
  },
  topZone: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 105
  },
  totalLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    lineHeight: 18
  },
  totalRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  totalValue: {
    color: colors.ink,
    fontFamily: fontFamilies.monoExtraBold,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 27
  },
  vent: {
    backgroundColor: 'rgba(0,0,0,0.24)',
    borderRadius: 2,
    height: 2
  },
  vents: {
    gap: 4,
    marginTop: 13
  }
});
