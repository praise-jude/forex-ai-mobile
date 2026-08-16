import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { formatPrice } from "@/lib/api/format";
import type { ConfluenceBreakdownBucket, JournalEntry, JournalResponse, PerformanceStats, SignalFunnelStats, SlippageStats } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

// Mirrors forex-ai's tradeJournal.ts DEFAULT_CONFLUENCE_MIN_SAMPLES -- a display label
// only; the server is the actual source of truth for each bucket's "ok"/"insufficient_data" status.
const CONFLUENCE_MIN_SAMPLES = 10;

// Trades close on the order of minutes to hours, not seconds -- a slow poll is plenty
// responsive for a screen that isn't the primary live-trading surface.
const POLL_INTERVAL_MS = 15000;

// Journal entries can be days or weeks old, unlike SignalsList's relativeTime (which
// only ever needs to express minutes/hours for a live-fired signal) -- this one also
// expresses days.
function relativeTime(fromMs: number): string {
  const seconds = Math.round((Date.now() - fromMs) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const REASON_LABEL: Record<JournalEntry["reason"], string> = {
  stop_loss: "Stop loss",
  take_profit: "Take profit",
  invalidation: "Invalidation exit",
  manual: "Manual close",
  other: "Closed",
};

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "positive" | "negative" }) {
  const valueColor = tone === "positive" ? DashboardColors.emerald : tone === "negative" ? DashboardColors.rose : DashboardColors.textPrimary;
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

function StatsSummary({ stats, openCount }: { stats: PerformanceStats; openCount: number }) {
  const averageRTone = stats.averageR === null ? undefined : stats.averageR >= 0 ? "positive" : "negative";

  return (
    <View style={styles.statsGrid}>
      <StatTile label="Trades" value={String(stats.count + openCount)} hint={openCount > 0 ? `${openCount} open` : undefined} />
      <StatTile label="Win rate" value={stats.count === 0 ? "—" : `${stats.winRate.toFixed(0)}%`} />
      <StatTile label="Record" value={`${stats.wins}W / ${stats.losses}L`} />
      <StatTile
        label="Average R"
        value={stats.averageR === null ? "—" : `${stats.averageR >= 0 ? "+" : ""}${stats.averageR.toFixed(2)}R`}
        tone={averageRTone}
      />
      <StatTile label="Max drawdown" value={stats.maxDrawdownR === null ? "—" : `${stats.maxDrawdownR.toFixed(2)}R`} tone="negative" />
    </View>
  );
}

/** "AI signal performance" -- was the AI's signal-to-decision pipeline healthy (did
 * proposals get a real decision, or mostly expire/get blocked) -- kept visually distinct
 * from the executed-trade StatsSummary above, which is "actual executed trade
 * performance" and only ever reflects real closed trades. */
function SignalFunnelSummary({ funnel }: { funnel: SignalFunnelStats }) {
  const total = funnel.approved + funnel.rejected + funnel.expired + funnel.blocked;
  if (total === 0) return null;

  return (
    <View>
      <Text style={styles.sectionHeading}>AI signal performance (proposals, not trades)</Text>
      <View style={styles.statsGrid}>
        <StatTile label="Approved" value={String(funnel.approved)} tone="positive" />
        <StatTile label="Rejected" value={String(funnel.rejected)} />
        <StatTile label="Expired" value={String(funnel.expired)} tone="negative" />
        <StatTile label="Blocked" value={String(funnel.blocked)} />
      </View>
    </View>
  );
}

const SESSION_LABEL: Record<string, string> = {
  asia: "Asia",
  london: "London",
  newyork: "New York",
  "off-session": "Off-session",
};

const REGIME_LABEL: Record<string, string> = {
  news_driven: "News-driven",
  breakout: "Breakout",
  strong_uptrend: "Strong uptrend",
  strong_downtrend: "Strong downtrend",
  high_volatility: "High volatility",
  low_volatility: "Low volatility",
  consolidation: "Consolidation",
  range: "Range",
};

/** Which pairs/sessions performance is actually coming from -- a compact table (not
 * tiles) since there can be up to 10 rows. Rows sorted by trade count, most-traded
 * first, so buckets with enough sample size to mean anything surface at the top. RN
 * port of forex-ai's JournalPanel.tsx BreakdownTable. */
function BreakdownTable({
  title,
  breakdown,
  labelFor,
}: {
  title: string;
  breakdown: Record<string, PerformanceStats>;
  labelFor: (key: string) => string;
}) {
  const rows = Object.entries(breakdown).sort((a, b) => b[1].count - a[1].count);
  if (rows.length === 0) return null;

  return (
    <View>
      <Text style={styles.sectionHeading}>{title}</Text>
      <View style={styles.breakdownTable}>
        <View style={[styles.breakdownRow, styles.breakdownHeaderRow]}>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText, styles.breakdownGroupCol]}>Group</Text>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Trades</Text>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Win rate</Text>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Avg R</Text>
        </View>
        {rows.map(([key, stats]) => (
          <View key={key} style={styles.breakdownRow}>
            <Text style={[styles.breakdownCell, styles.breakdownGroupCol, styles.breakdownGroupText]}>{labelFor(key)}</Text>
            <Text style={styles.breakdownCell}>{stats.count}</Text>
            <Text style={styles.breakdownCell}>{stats.winRate.toFixed(0)}%</Text>
            <Text
              style={[
                styles.breakdownCell,
                { color: stats.averageR === null ? DashboardColors.textMuted : stats.averageR >= 0 ? DashboardColors.emerald : DashboardColors.rose },
              ]}
            >
              {stats.averageR === null ? "—" : `${stats.averageR >= 0 ? "+" : ""}${stats.averageR.toFixed(2)}R`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

interface EquityPoint {
  time: number;
  cumulativeR: number;
}

/** Chronological cumulative R across every closed trade with a computed rMultiple --
 * mirrors forex-ai's JournalPanel.tsx buildEquityCurve. */
function buildEquityCurve(entries: JournalEntry[]): EquityPoint[] {
  const withR = entries
    .filter((e): e is JournalEntry & { rMultiple: number } => e.rMultiple !== null)
    .slice()
    .sort((a, b) => a.closedAt - b.closedAt);

  let cumulative = 0;
  return withR.map((e) => {
    cumulative += e.rMultiple;
    return { time: e.closedAt, cumulativeR: cumulative };
  });
}

const EQUITY_CHART_HEIGHT = 140;

/** Static (no touch-scrub) -- matches this file's own PriceChart.tsx precedent, the
 * only other hand-rolled SVG chart in this app, which is also static. Every value here
 * is already direct-labeled (the end point), so nothing is gated behind an interaction
 * this component doesn't have. */
function EquityCurveSvg({ points, width, height, color }: { points: EquityPoint[]; width: number; height: number; color: string }) {
  const padding = { top: 10, bottom: 10, left: 4, right: 46 };
  const plotWidth = Math.max(width - padding.left - padding.right, 1);
  const plotHeight = Math.max(height - padding.top - padding.bottom, 1);

  const minTime = points[0].time;
  const maxTime = points[points.length - 1].time;
  const timeRange = Math.max(maxTime - minTime, 1);
  const values = points.map((p) => p.cumulativeR);
  const minR = Math.min(0, ...values);
  const maxR = Math.max(0, ...values);
  const rRange = Math.max(maxR - minR, 1e-6);

  function x(time: number): number {
    return padding.left + ((time - minTime) / timeRange) * plotWidth;
  }
  function y(value: number): number {
    return padding.top + (1 - (value - minR) / rRange) * plotHeight;
  }

  const last = points[points.length - 1];
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.time).toFixed(1)},${y(p.cumulativeR).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(last.time).toFixed(1)},${y(0).toFixed(1)} L${x(points[0].time).toFixed(1)},${y(0).toFixed(1)} Z`;

  return (
    <View style={[styles.equitySvgWrap, { width, height }]}>
      <Svg width={width} height={height}>
        <Line x1={padding.left} x2={width - padding.right} y1={y(0)} y2={y(0)} stroke={DashboardColors.border} strokeWidth={1} />
        <Path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />
        <Path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={x(last.time)} cy={y(last.cumulativeR)} r={4} fill={color} stroke={DashboardColors.surface} strokeWidth={2} />
      </Svg>
      <Text
        style={[
          styles.equityEndLabel,
          { left: x(last.time) + 7, top: y(last.cumulativeR) - 7, color },
        ]}
      >
        {last.cumulativeR >= 0 ? "+" : ""}
        {last.cumulativeR.toFixed(1)}R
      </Text>
    </View>
  );
}

/** RN port of forex-ai's JournalPanel.tsx EquityCurveChart -- the one "is this actually
 * working over time" view; everything else in this screen is a table or a tile. */
function EquityCurveChart({ entries }: { entries: JournalEntry[] }) {
  const [width, setWidth] = useState(0);
  const points = useMemo(() => buildEquityCurve(entries), [entries]);

  function onLayout(e: LayoutChangeEvent) {
    // equityBox's own 10px horizontal padding is inside the measured layout width (RN's
    // border-box-equivalent), so it must be subtracted here -- otherwise the SVG (given
    // this full width) would render past the box's padded content area.
    setWidth(Math.max(e.nativeEvent.layout.width - 20, 0));
  }

  const last = points[points.length - 1];
  const positive = last ? last.cumulativeR >= 0 : true;
  const color = positive ? DashboardColors.emerald : DashboardColors.rose;

  return (
    <View>
      <View style={styles.equityHeader}>
        <Text style={styles.sectionHeading}>Equity curve (cumulative R)</Text>
        {last && (
          <Text style={[styles.equityHeaderValue, { color }]}>
            {positive ? "+" : ""}
            {last.cumulativeR.toFixed(2)}R
          </Text>
        )}
      </View>
      <View style={styles.equityBox} onLayout={onLayout}>
        {points.length < 2 ? (
          <Text style={styles.equityEmptyText}>Needs at least 2 closed trades with a computed R multiple to plot a curve.</Text>
        ) : width === 0 ? null : (
          <EquityCurveSvg points={points} width={width} height={EQUITY_CHART_HEIGHT} color={color} />
        )}
      </View>
    </View>
  );
}

function formatPips(pips: number | null): string {
  return pips === null ? "—" : `${pips >= 0 ? "+" : ""}${pips.toFixed(1)} pips`;
}

/** "Is the broker filling me at a worse price than I asked for" -- RN port of
 * forex-ai's JournalPanel.tsx SlippageSummary. Positive pips = adverse, negative =
 * favorable. */
function SlippageSummary({ stats }: { stats: SlippageStats }) {
  if (stats.count === 0) return null;
  const avgTone = stats.averagePips === null || stats.averagePips === 0 ? undefined : stats.averagePips > 0 ? "negative" : "positive";
  const worstIsAdverse = stats.worstAdversePips !== null && stats.worstAdversePips > 0;
  const bestIsFavorable = stats.bestFavorablePips !== null && stats.bestFavorablePips < 0;

  return (
    <View>
      <Text style={styles.sectionHeading}>Execution quality (slippage)</Text>
      <View style={styles.statsGrid}>
        <StatTile label="Fills measured" value={String(stats.count)} />
        <StatTile label="Average slippage" value={formatPips(stats.averagePips)} tone={avgTone} />
        <StatTile label="Adverse fills" value={`${stats.adverseRate.toFixed(0)}%`} tone={stats.adverseRate > 50 ? "negative" : undefined} />
        <StatTile label="Worst adverse" value={formatPips(stats.worstAdversePips)} tone={worstIsAdverse ? "negative" : "positive"} />
        <StatTile label="Best favorable" value={formatPips(stats.bestFavorablePips)} tone={bestIsFavorable ? "positive" : "negative"} />
      </View>
    </View>
  );
}

function SlippageBreakdownTable({ breakdown }: { breakdown: Record<string, SlippageStats> }) {
  const rows = Object.entries(breakdown).sort((a, b) => b[1].count - a[1].count);
  if (rows.length === 0) return null;

  return (
    <View>
      <Text style={styles.sectionHeading}>Slippage by pair</Text>
      <View style={styles.breakdownTable}>
        <View style={[styles.breakdownRow, styles.breakdownHeaderRow]}>
          <Text style={[styles.breakdownCell, styles.breakdownGroupCol, styles.breakdownHeaderText]}>Pair</Text>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Fills</Text>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Avg slippage</Text>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Adverse</Text>
        </View>
        {rows.map(([pair, stats]) => (
          <View key={pair} style={styles.breakdownRow}>
            <Text style={[styles.breakdownCell, styles.breakdownGroupCol, styles.breakdownGroupText]}>{pair}</Text>
            <Text style={styles.breakdownCell}>{stats.count}</Text>
            <Text
              style={[
                styles.breakdownCell,
                {
                  color:
                    stats.averagePips === null || stats.averagePips === 0
                      ? DashboardColors.textMuted
                      : stats.averagePips > 0
                        ? DashboardColors.rose
                        : DashboardColors.emerald,
                },
              ]}
            >
              {formatPips(stats.averagePips)}
            </Text>
            <Text style={styles.breakdownCell}>{stats.adverseRate.toFixed(0)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const CONFLUENCE_LABEL: Record<string, string> = {
  liquidity_sweep: "Liquidity sweep",
  bos: "Break of structure",
  choch: "Change of character",
  fvg: "Fair value gap",
  order_block: "Order block",
  killzone: "Killzone timing",
  ema_trend: "EMA trend",
  rsi_momentum: "RSI momentum",
  macd_crossover: "MACD crossover",
  volume: "Volume",
  trend_ema_stack: "EMA stack trend",
  market_structure: "Market structure",
  adx: "ADX strength",
  candlestick: "Candlestick pattern",
  multi_timeframe: "Multi-timeframe",
  supertrend: "Supertrend",
  currency_strength: "Currency strength",
  rsi_divergence: "RSI divergence",
};

/** "Which confluences actually predict wins" -- a dedicated table (not BreakdownTable
 * above) since buckets aren't mutually exclusive and can be "insufficient_data", which
 * needs an honest flagged row instead of a misleadingly-precise percentage from a
 * handful of trades. Rows already arrive sorted by sample size. RN port of forex-ai's
 * JournalPanel.tsx ConfluenceBreakdownTable. */
function ConfluenceBreakdownTable({ breakdown }: { breakdown: ConfluenceBreakdownBucket[] }) {
  if (breakdown.length === 0) return null;

  return (
    <View>
      <Text style={styles.sectionHeading}>Which confluences actually predict wins</Text>
      <Text style={styles.confluenceHint}>
        Real win rate/average R where each confluence was present on the signal. Buckets under {CONFLUENCE_MIN_SAMPLES} trades
        are flagged, not hidden.
      </Text>
      <View style={styles.breakdownTable}>
        <View style={[styles.breakdownRow, styles.breakdownHeaderRow]}>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText, styles.breakdownGroupCol]}>Confluence</Text>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Trades</Text>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Win rate</Text>
          <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Avg R</Text>
        </View>
        {breakdown.map((bucket) => (
          <View key={bucket.confluence} style={styles.breakdownRow}>
            <Text style={[styles.breakdownCell, styles.breakdownGroupCol, styles.breakdownGroupText]}>
              {CONFLUENCE_LABEL[bucket.confluence] ?? bucket.confluence}
            </Text>
            <Text style={styles.breakdownCell}>{bucket.sampleSize}</Text>
            {bucket.status === "insufficient_data" ? (
              <Text style={[styles.breakdownCell, styles.confluenceInsufficient, styles.breakdownSpanTwo]}>
                Needs {CONFLUENCE_MIN_SAMPLES}, have {bucket.sampleSize}
              </Text>
            ) : (
              <>
                <Text style={styles.breakdownCell}>{bucket.winRate!.toFixed(0)}%</Text>
                <Text
                  style={[
                    styles.breakdownCell,
                    { color: bucket.averageR === null ? DashboardColors.textMuted : bucket.averageR >= 0 ? DashboardColors.emerald : DashboardColors.rose },
                  ]}
                >
                  {bucket.averageR === null ? "—" : `${bucket.averageR >= 0 ? "+" : ""}${bucket.averageR.toFixed(2)}R`}
                </Text>
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function EntryRow({ entry }: { entry: JournalEntry }) {
  const isLong = entry.direction === "long";
  const inProfit = entry.profit >= 0;

  return (
    <View style={styles.entryRow}>
      <View style={styles.entryTop}>
        <View style={styles.entryTopLeft}>
          <Text style={[styles.entryDirection, { color: isLong ? DashboardColors.emerald : DashboardColors.rose }]}>
            {isLong ? "LONG" : "SHORT"}
          </Text>
          <Text style={styles.entryPair}>{entry.pair}</Text>
          {entry.context && <Text style={styles.entryMuted}>Setup quality {entry.context.setupQuality.total}/100</Text>}
        </View>
        <Text style={[styles.entryProfit, { color: inProfit ? DashboardColors.emerald : DashboardColors.rose }]}>
          {inProfit ? "+" : ""}
          {entry.profit.toFixed(2)}
          {entry.rMultiple !== null && ` (${entry.rMultiple >= 0 ? "+" : ""}${entry.rMultiple.toFixed(2)}R)`}
        </Text>
      </View>
      <View style={styles.entryBottom}>
        <Text style={styles.entryMuted}>
          {REASON_LABEL[entry.reason]}
          {entry.context && ` · ${entry.context.regime.replace(/_/g, " ")}`}
        </Text>
        <Text style={styles.entryMuted}>
          {formatPrice(entry.pair, entry.entryPrice)} → {formatPrice(entry.pair, entry.exitPrice)} · {relativeTime(entry.closedAt)}
        </Text>
      </View>
    </View>
  );
}

export function JournalPanel() {
  const api = useApi();
  const { data } = usePolling(() => api.get<JournalResponse>("/api/trade-journal"), POLL_INTERVAL_MS);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {data && <StatsSummary stats={data.stats} openCount={data.openCount} />}
      {data && <EquityCurveChart entries={data.entries} />}
      {data && <SignalFunnelSummary funnel={data.signalFunnel} />}
      {data && <BreakdownTable title="Performance by pair" breakdown={data.breakdownByPair} labelFor={(key) => key} />}
      {data && <BreakdownTable title="Performance by session" breakdown={data.breakdownBySession} labelFor={(key) => SESSION_LABEL[key] ?? key} />}
      {data && (
        <BreakdownTable title="Performance by market regime (SMC only)" breakdown={data.breakdownByRegime} labelFor={(key) => REGIME_LABEL[key] ?? key} />
      )}
      {data && <ConfluenceBreakdownTable breakdown={data.breakdownByConfluence} />}
      {data && <SlippageSummary stats={data.slippage} />}
      {data && <SlippageBreakdownTable breakdown={data.slippageByPair} />}

      <View>
        <Text style={styles.sectionHeading}>Closed trades</Text>
        {!data || data.entries.length === 0 ? (
          <Text style={styles.empty}>No closed trades yet — entries appear here once a trade this app opened closes.</Text>
        ) : (
          <View style={styles.entryList}>
            {data.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, gap: 16, paddingBottom: 100 },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: DashboardColors.textMuted,
    marginBottom: 8,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statTile: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    padding: 10,
  },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: DashboardColors.textMuted },
  statValue: { marginTop: 4, fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statHint: { marginTop: 2, fontSize: 10, color: DashboardColors.textMuted },
  empty: { textAlign: "center", paddingVertical: 24, color: DashboardColors.textMuted, fontSize: 13 },
  entryList: { gap: 8 },
  entryRow: { borderRadius: 10, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, padding: 10, gap: 4 },
  entryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  entryTopLeft: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  entryDirection: { fontSize: 11, fontWeight: "700" },
  entryPair: { fontSize: 12, fontWeight: "700", color: DashboardColors.textPrimary },
  entryProfit: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  entryBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  entryMuted: { fontSize: 11, color: DashboardColors.textMuted },
  breakdownTable: { borderRadius: 10, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surface, overflow: "hidden" },
  breakdownRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: DashboardColors.border },
  breakdownHeaderRow: { backgroundColor: DashboardColors.surfaceAlt },
  breakdownCell: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 11, color: DashboardColors.textSecondary, fontVariant: ["tabular-nums"] },
  breakdownGroupCol: { flex: 1.4 },
  breakdownGroupText: { color: DashboardColors.textPrimary, fontWeight: "600" },
  breakdownHeaderText: { color: DashboardColors.textMuted, fontWeight: "700", textTransform: "uppercase", fontSize: 10 },
  confluenceHint: { fontSize: 11, color: DashboardColors.textMuted, lineHeight: 15, marginBottom: 8 },
  confluenceInsufficient: { color: DashboardColors.amber },
  breakdownSpanTwo: { flex: 2 },
  equityHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
  equityHeaderValue: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  equityBox: {
    minHeight: EQUITY_CHART_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  equityEmptyText: { color: DashboardColors.textMuted, fontSize: 12, textAlign: "center", padding: 12 },
  equitySvgWrap: { position: "relative" },
  equityEndLabel: { position: "absolute", fontSize: 10, fontWeight: "700" },
});
