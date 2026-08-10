import { Fragment, memo, useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Polyline, Rect } from "react-native-svg";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { formatPrice } from "@/lib/api/format";
import type { Candle, Pair, PredictionUpdate, Signal, Timeframe } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 5000;
const CHART_HEIGHT = 220;
const MAX_CANDLES = 60;
// Smaller than the web dashboard's forecast spacing (8 bars) -- this chart has a fixed
// canvas with no panning/scrolling, unlike lightweight-charts, so the projected curve
// has to stay inside the same right-edge margin reserved for axis labels rather than
// extending far past the last visible candle. Purely illustrative either way -- see
// forex-ai's PriceChart.tsx comment on FORECAST_BAR_SPACING for why the spacing itself
// carries no time-prediction meaning.
const FORECAST_BAR_SPACING = 3;

export function PriceChart({ pair, timeframe, prediction }: { pair: Pair; timeframe: Timeframe; prediction: PredictionUpdate | null }) {
  const api = useApi();
  const [width, setWidth] = useState(0);

  const { data, error } = usePolling(
    () => api.get<{ pair: Pair; timeframe: Timeframe; candles: Candle[] }>(`/api/candles?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`),
    POLL_INTERVAL_MS
  );

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const rawCandles = data?.candles ?? [];
  const lastRaw = rawCandles[rawCandles.length - 1];
  // Every poll tick (every 5s) hands back a freshly-parsed array/object even when the
  // underlying candles/signal haven't actually changed since M15/M30/1H candles close far
  // less often than that -- keyed on a cheap fingerprint (not the array/object reference
  // itself) so CandleChart's React.memo below can actually skip re-rendering the whole SVG
  // on the many ticks where nothing visible changed.
  const candles = useMemo(
    () => rawCandles.slice(-MAX_CANDLES),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately fingerprinted on length + last candle's time/close instead of rawCandles itself, which is a new array reference every poll regardless of content.
    [rawCandles.length, lastRaw?.time, lastRaw?.close]
  );
  const matchesSelection = prediction?.pair === pair && prediction?.timeframe === timeframe;
  const rawSignal = matchesSelection && prediction?.evaluation.status === "signal" ? prediction.evaluation.signal : null;
  // Signal records are immutable once created (signalStore.ts never mutates one in
  // place) -- same id means same content, so this is safe to key on id alone.
  const signal = useMemo(
    () => rawSignal,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on id only, for the same reference-stability reason as `candles` above.
    [rawSignal?.id]
  );

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.pairLabel}>{pair}</Text>
        <Text style={styles.timeframeLabel}>{timeframe} · SMC signal timeframe</Text>
      </View>
      <View style={styles.chartBox} onLayout={onLayout}>
        {candles.length === 0 || width === 0 ? (
          <Text style={styles.placeholder}>{error ? error : "Loading candles…"}</Text>
        ) : (
          <CandleChart candles={candles} pair={pair} width={width} height={CHART_HEIGHT} signal={signal} />
        )}
      </View>
      {signal && (
        <Text style={styles.forecastBadge}>AI FORECAST &middot; PROJECTED PATH (illustrative, not a price prediction)</Text>
      )}
    </View>
  );
}

// Memoized so the many poll ticks that hand back an unchanged (but referentially fresh)
// candles/signal fingerprint -- see PriceChart's own useMemo calls above -- skip
// re-rendering the whole SVG (~60 candles + annotation lines) entirely.
const CandleChart = memo(function CandleChart({
  candles,
  pair,
  width,
  height,
  signal,
}: {
  candles: Candle[];
  pair: Pair;
  width: number;
  height: number;
  signal: Signal | null;
}) {
  const padding = { top: 8, bottom: 8, left: 4, right: 56 };
  const plotWidth = Math.max(width - padding.left - padding.right, 1);
  const plotHeight = Math.max(height - padding.top - padding.bottom, 1);

  // The real entry/SL/TP/zone levels are folded into the visible price range so the
  // annotation lines and forecast curve are never clipped above/below the candles --
  // never fabricated, just widening the same real high/low the candles already set.
  const annotationPrices = signal
    ? [signal.entry, signal.stopLoss, signal.takeProfit, signal.takeProfit2, signal.zoneTop, signal.zoneBottom].filter(
        (p): p is number => p !== undefined
      )
    : [];
  const high = Math.max(...candles.map((c) => c.high), ...annotationPrices);
  const low = Math.min(...candles.map((c) => c.low), ...annotationPrices);
  const range = Math.max(high - low, 1e-9);

  const slotWidth = plotWidth / candles.length;
  const bodyWidth = Math.max(slotWidth * 0.6, 1);

  function y(price: number): number {
    return padding.top + (1 - (price - low) / range) * plotHeight;
  }

  // Named (not inline) so the forecast curve below can also compute positions at
  // synthetic indices past the last real candle.
  function x(i: number): number {
    return padding.left + i * slotWidth + slotWidth / 2;
  }

  const last = candles[candles.length - 1];
  const lastIndex = candles.length - 1;

  const annotations: { price: number; color: string; label: string }[] = signal
    ? [
        { price: signal.entry, color: DashboardColors.textSecondary, label: "Entry" },
        { price: signal.stopLoss, color: DashboardColors.rose, label: "SL" },
        { price: signal.takeProfit, color: DashboardColors.emerald, label: "TP1" },
        { price: signal.takeProfit2, color: DashboardColors.emerald, label: "TP2" },
        ...(signal.zoneTop !== undefined ? [{ price: signal.zoneTop, color: DashboardColors.sky, label: "Zone" }] : []),
        ...(signal.zoneBottom !== undefined ? [{ price: signal.zoneBottom, color: DashboardColors.sky, label: "Zone" }] : []),
      ]
    : [];

  const forecastColor = signal?.direction === "long" ? DashboardColors.emerald : DashboardColors.rose;
  const forecastPoints = signal
    ? [
        `${x(lastIndex)},${y(last.close)}`,
        `${x(lastIndex + FORECAST_BAR_SPACING)},${y(signal.takeProfit)}`,
        `${x(lastIndex + FORECAST_BAR_SPACING * 2)},${y(signal.takeProfit2)}`,
      ].join(" ")
    : null;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {candles.map((candle, i) => {
          const cx = x(i);
          const bullish = candle.close >= candle.open;
          const color = bullish ? DashboardColors.emerald : DashboardColors.rose;
          const bodyTop = y(Math.max(candle.open, candle.close));
          const bodyBottom = y(Math.min(candle.open, candle.close));
          const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

          return (
            <Fragment key={candle.time}>
              <Line x1={cx} x2={cx} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth={1} />
              <Rect x={cx - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
            </Fragment>
          );
        })}
        <Line
          x1={padding.left}
          x2={width - padding.right}
          y1={y(last.close)}
          y2={y(last.close)}
          stroke={DashboardColors.textMuted}
          strokeWidth={1}
          strokeDasharray="4,4"
        />
        {annotations.map((a, i) => (
          <Line
            key={`${a.label}-${i}`}
            x1={padding.left}
            x2={width - padding.right}
            y1={y(a.price)}
            y2={y(a.price)}
            stroke={a.color}
            strokeWidth={1}
            strokeDasharray="2,3"
          />
        ))}
        {forecastPoints && <Polyline points={forecastPoints} fill="none" stroke={forecastColor} strokeWidth={2} strokeDasharray="1,3" />}
      </Svg>
      {/* Plain RN <Text> overlay for axis labels -- react-native-svg's own <Text> needs
          its own font-loading path, which these small price labels don't need. */}
      <SvgLabel x={width - padding.right + 4} y={y(high)} text={formatPrice(pair, high)} />
      <SvgLabel x={width - padding.right + 4} y={y(low)} text={formatPrice(pair, low)} />
      <SvgLabel x={width - padding.right + 4} y={y(last.close)} text={formatPrice(pair, last.close)} highlight />
      {annotations.map((a, i) => (
        <SvgLabel key={`${a.label}-label-${i}`} x={width - padding.right + 4} y={y(a.price)} text={a.label} />
      ))}
    </View>
  );
});

function SvgLabel({ x, y, text, highlight }: { x: number; y: number; text: string; highlight?: boolean }) {
  return (
    <Text
      style={[
        styles.axisLabel,
        { position: "absolute", left: x, top: y - 7 },
        highlight && { color: DashboardColors.sky, fontWeight: "700" },
      ]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  pairLabel: { fontSize: 15, fontWeight: "700", color: DashboardColors.textPrimary },
  timeframeLabel: { fontSize: 11, color: DashboardColors.textMuted },
  chartBox: {
    height: CHART_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholder: { color: DashboardColors.textMuted, fontSize: 12 },
  axisLabel: { fontSize: 10, color: DashboardColors.textSecondary },
  forecastBadge: { marginTop: 6, fontSize: 10, color: DashboardColors.textMuted },
});
