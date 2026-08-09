import { Fragment, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { formatPrice } from "@/lib/api/format";
import type { Candle, Pair, Timeframe } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 5000;
const CHART_HEIGHT = 220;
const MAX_CANDLES = 60;

export function PriceChart({ pair, timeframe }: { pair: Pair; timeframe: Timeframe }) {
  const api = useApi();
  const [width, setWidth] = useState(0);

  const { data, error } = usePolling(
    () => api.get<{ pair: Pair; timeframe: Timeframe; candles: Candle[] }>(`/api/candles?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`),
    POLL_INTERVAL_MS
  );

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const candles = (data?.candles ?? []).slice(-MAX_CANDLES);

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
          <CandleChart candles={candles} pair={pair} width={width} height={CHART_HEIGHT} />
        )}
      </View>
    </View>
  );
}

function CandleChart({ candles, pair, width, height }: { candles: Candle[]; pair: Pair; width: number; height: number }) {
  const padding = { top: 8, bottom: 8, left: 4, right: 56 };
  const plotWidth = Math.max(width - padding.left - padding.right, 1);
  const plotHeight = Math.max(height - padding.top - padding.bottom, 1);

  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const range = Math.max(high - low, 1e-9);

  const slotWidth = plotWidth / candles.length;
  const bodyWidth = Math.max(slotWidth * 0.6, 1);

  function y(price: number): number {
    return padding.top + (1 - (price - low) / range) * plotHeight;
  }

  const last = candles[candles.length - 1];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {candles.map((candle, i) => {
          const x = padding.left + i * slotWidth + slotWidth / 2;
          const bullish = candle.close >= candle.open;
          const color = bullish ? DashboardColors.emerald : DashboardColors.rose;
          const bodyTop = y(Math.max(candle.open, candle.close));
          const bodyBottom = y(Math.min(candle.open, candle.close));
          const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

          return (
            <Fragment key={candle.time}>
              <Line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth={1} />
              <Rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
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
      </Svg>
      {/* Plain RN <Text> overlay for axis labels -- react-native-svg's own <Text> needs
          its own font-loading path, which these small price labels don't need. */}
      <SvgLabel x={width - padding.right + 4} y={y(high)} text={formatPrice(pair, high)} />
      <SvgLabel x={width - padding.right + 4} y={y(low)} text={formatPrice(pair, low)} />
      <SvgLabel x={width - padding.right + 4} y={y(last.close)} text={formatPrice(pair, last.close)} highlight />
    </View>
  );
}

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
});
