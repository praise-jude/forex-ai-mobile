// Mirrors the subset of forex-ai/lib/market/types.ts that the mobile client needs.
// Kept as a hand-copied, JSON-shaped mirror (not a shared package) since the web app
// isn't set up as a monorepo-shared library today.

export type Timeframe = "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export type Pair =
  | "EUR/USD"
  | "GBP/USD"
  | "USD/JPY"
  | "AUD/USD"
  | "USD/CAD"
  | "XAU/USD"
  | "XAG/USD"
  | "USOIL"
  | "UKOIL"
  | "BTC/USD"
  | "USD/CHF"
  | "NZD/USD"
  | "EUR/JPY"
  | "AUD/JPY"
  | "ETH/USD"
  | "NFLX"
  | "MSFT"
  | "SPCX";

// Trimmed to match forex-ai/lib/market/types.ts's own PAIRS -- the operator's chosen
// "best 9" (7 FX majors + gold + one crypto). The Pair type union above is left
// untouched (same reasoning as the web side: a historical trade record on a dropped
// pair must still typecheck), only this monitored/tradable list is trimmed.
export const PAIRS: Pair[] = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD", "XAU/USD", "BTC/USD"];

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
}

export type Confluence =
  | "liquidity_sweep"
  | "bos"
  | "choch"
  | "fvg"
  | "order_block"
  | "killzone"
  | "ema_trend"
  | "rsi_momentum"
  | "macd_crossover"
  | "volume"
  | "trend_ema_stack"
  | "market_structure"
  | "adx"
  | "candlestick"
  | "multi_timeframe"
  | "supertrend"
  | "currency_strength"
  | "rsi_divergence"
  // rangeEngine.ts (mean-reversion) confluences below -- SMC never produces these.
  | "range_regime"
  | "boundary_touch"
  | "rsi_extreme"
  | "rejection_candle";

export type ConfidenceTier = "strong_buy" | "buy" | "watch";
export type SignalSource = "smc" | "tradingview" | "mean_reversion";
export type Session = "asia" | "london" | "newyork" | "off-session";

export interface Signal {
  id: string;
  source: SignalSource;
  pair: Pair;
  direction: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2: number;
  riskReward: number;
  confidence: number;
  directionScore: number;
  entryScore: number;
  /** Raw ADX/RSI readings at the signal candle. NaN for TradingView-sourced signals
   * (no candle history to derive them from -- never fabricated). */
  adx: number;
  rsi: number;
  tier: ConfidenceTier;
  confluences: Confluence[];
  session: Session;
  timeframe: Timeframe;
  createdAt: number;
  /** The real SMC order-block/FVG zone bounds behind `entry`. Optional -- TradingView-
   * sourced signals have no zone concept. */
  zoneTop?: number;
  zoneBottom?: number;
  /** Signer B's own independent directional read (Trend + Momentum + Volatility +
   * Currency Strength + Session, computed without reference to this signal's own
   * `direction`, then combined via the backend's decisionMatrix.ts). "unavailable"
   * only for TradingView-sourced signals. */
  signerBDirection: "long" | "short" | "neutral" | "unavailable";
  signerBConfidence: number;
  signerBEmaTrend: "bullish" | "bearish" | "neutral" | "unavailable";
  rsiDivergence: "bullish" | "bearish" | "none" | "unavailable";
  /** Transparent confirmation-layer status, always present and honest about missing
   * data ("unavailable" is a real, distinct value -- never silently omitted or
   * fabricated as agreeing). */
  supertrendTrend: "up" | "down" | "unavailable";
  usdStrengthStatus: "supports" | "conflicts" | "unavailable";
  newsStatus: "clear" | "high_impact_soon" | "unavailable";
}

// Mirrors confidenceScore.ts's DimensionScore -- the two independently-bottlenecked
// 0-100 sub-scores (direction, entry) behind a Signal's confidence/tier.
export interface DimensionScore {
  total: number;
  tier: ConfidenceTier | "no_trade";
  reasons: Confluence[];
}

// Mirrors forex-ai's NoTradeReason/SignalEvaluation/PredictionUpdate -- why a given M15
// candle close did NOT produce a Signal, computed server-side from the same real gate
// data, never guessed client-side.
export type NoTradeReason =
  | { code: "outside_killzone" }
  | { code: "no_setup" }
  | { code: "trend_disagreement"; impliedDirection: "long" | "short"; d1: string; h4: string; h1: string }
  | { code: "weak_trend_adx"; adx: number }
  | { code: "low_volatility"; atr: number; atrAverage: number }
  | { code: "below_threshold"; direction: DimensionScore; entry: DimensionScore }
  // A decisive hold -- an SMC setup was found and would otherwise have qualified, but a
  // high-impact release for one of the pair's currencies is imminent. Never fires from
  // missing/unavailable news data -- only from a genuinely detected upcoming event.
  | { code: "news_blackout"; impliedDirection: "long" | "short"; event: string; currency: string; minutesUntil: number }
  // SMC found a qualifying setup, but Signer B's independent read had no real lean
  // either way -- a genuine tie/insufficient-data read, not a fabricated agreement.
  | { code: "signer_b_neutral"; impliedDirection: "long" | "short" }
  // SMC found a qualifying setup, but Signer B's independent read points the opposite
  // direction -- a genuine conflict between the two independent signers, held rather
  // than forced.
  | {
      code: "signer_conflict";
      impliedDirection: "long" | "short";
      signerBDirection: "long" | "short";
      signerBConfidence: number;
    }
  // Everything else passed but the most recently closed 5-minute candle didn't confirm
  // the setup's own direction -- an on-demand REST check at decision time, never a live
  // subscription (see forex-ai's m5Confirmation.ts).
  | { code: "m5_not_confirmed"; impliedDirection: "long" | "short" }
  // --- rangeEngine.ts (mean-reversion) reasons below -- SMC never produces these. ---
  | { code: "not_ranging"; regime: MarketRegime }
  | { code: "no_boundary_touch" }
  | { code: "range_below_threshold"; total: number; impliedDirection: "long" | "short" };

export type SignalEvaluation = { status: "signal"; signal: Signal } | { status: "no_trade"; reason: NoTradeReason };

export type MarketRegime =
  | "news_driven"
  | "breakout"
  | "strong_uptrend"
  | "strong_downtrend"
  | "high_volatility"
  | "low_volatility"
  | "consolidation"
  | "range";

export interface HigherTimeframeTrends {
  d1: "bullish" | "bearish" | "neutral";
  h4: "bullish" | "bearish" | "neutral";
  h1: "bullish" | "bearish" | "neutral";
}

export interface PredictionUpdate {
  pair: Pair;
  timeframe: Timeframe;
  // Which engine produced this evaluation -- two independent engines (SMC,
  // rangeEngine.ts's mean-reversion engine) can evaluate the same pair/timeframe
  // without one shadowing the other's latest status server-side.
  source: SignalSource;
  evaluation: SignalEvaluation;
  time: number;
  // Already present in the backend's JSON response (predictionStore.ts) -- these two
  // fields were simply never declared on the mobile mirror. Needed by TradeProposalCard
  // for its D1/H4/H1 trend row, same data the web dashboard already shows.
  regime: MarketRegime;
  trends: HigherTimeframeTrends;
}

export type AccountKey = "live" | "demo";

export interface OpenPosition {
  id: string;
  pair: Pair;
  direction: "long" | "short";
  lots: number;
  openPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  clientId?: string;
}

export type ExecutionStatus = "pending" | "filled" | "rejected";

export interface ExecutedTrade {
  id: string;
  signalId: string;
  account: AccountKey;
  pair: Pair;
  direction: "long" | "short";
  requestedLots: number;
  requestedEntry: number;
  filledEntry?: number;
  stopLoss: number;
  takeProfit: number;
  status: ExecutionStatus;
  brokerPositionId?: string;
  brokerOrderId?: string;
  rejectReason?: string;
  riskPct: number;
  attemptedAt: number;
  filledAt?: number;
}

export interface WatchlistEntry {
  pair: Pair;
  bid: number | null;
  ask: number | null;
  time: number | null;
}

export interface SignalsSnapshot {
  asOf: number;
  watchlist: WatchlistEntry[];
  signals: Signal[];
  executedTrades: ExecutedTrade[];
  predictions: PredictionUpdate[];
}

export interface PositionsResponse {
  account: AccountKey;
  positions: OpenPosition[];
  tradesToday: number;
}

export type ConnectionStatusValue = "live" | "reconnecting" | "disconnected";

export interface ConnectionStatusResponse {
  status: ConnectionStatusValue;
  lastUpdateAt: number | null;
}

export interface RiskStatusResponse {
  account: AccountKey;
  haltedForToday: boolean;
  cooldownUntil: number | null;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  maxDailyLossPct: number;
  // The halt/cooldown condition itself has cleared (day rolled over, timer expired), but
  // DEMO/LIVE auto-execution stays paused until a human deliberately reviews and resumes
  // it -- mirrors lib/market/riskState.ts's requiresAcknowledgement on the web side.
  requiresAcknowledgement: boolean;
}

export type EngineMode = "analysis" | "demo" | "live";

export interface EngineModeResponse {
  mode: EngineMode;
  demoConfigured: boolean;
  riskPerTradePct: number;
}

export interface KillSwitchState {
  active: boolean;
  envControlled: boolean;
}

// Mirrors forex-ai/app/api/autopilot-lock/route.ts -- a dedicated switch for the
// autopilot specifically (blocks only auto-execution, not manual trading), distinct
// from KillSwitchState above.
export interface AutopilotLockState {
  locked: boolean;
}

// Mirrors lib/market/confirmationMode.ts on the web side -- "signal_only" shows no
// execute affordance at all, "confirm" is the default propose-then-approve flow.
export interface ConfirmationModeResponse {
  manualMode: "signal_only" | "confirm";
  proposalTtlSeconds: number;
}

export interface ExecutionPolicyResponse {
  minTier: "buy" | "strong_buy";
  minRiskReward: number;
}

export interface CloseAllResult {
  account: AccountKey;
  closed: string[];
  failed: { id: string; reason: string }[];
}

// Mirrors ExecutionResult from executionEngine.ts plus the client-only outcomes, same
// as lib/market/executionClient.ts on the web side. "expired"/"confirmation_required"
// are the two Confirmation Mode gate outcomes from the execute route.
export type ExecuteResponse =
  | { status: "duplicate" }
  | { status: "blocked"; code: string; reason: string }
  | { status: "skipped_sizing"; reason: string }
  | { status: "filled"; trade: ExecutedTrade }
  | { status: "rejected"; trade: ExecutedTrade }
  | { status: "not_found" }
  | { status: "network_error" }
  | { status: "expired" }
  | { status: "confirmation_required"; requiredPhrase: string };

export type CardStatus = { state: "idle" } | { state: "loading" } | { state: "done"; result: ExecuteResponse };

export function statusFromTrade(trade: ExecutedTrade): CardStatus | null {
  if (trade.status === "filled") return { state: "done", result: { status: "filled", trade } };
  if (trade.status === "rejected") return { state: "done", result: { status: "rejected", trade } };
  return null;
}

// --- Trade journal (mirrors forex-ai's lib/market/tradeJournal.ts JSON shapes) ---

export type JournalCloseReason = "stop_loss" | "take_profit" | "invalidation" | "manual" | "other";

// Minimal mirror of SignalContext -- the Journal screen only ever reads
// setupQuality.total, regime, and (for confluence-edge analytics) confluences off this,
// never the rest of the breakdown.
export interface JournalSignalContext {
  regime: MarketRegime;
  setupQuality: { total: number };
  /** Optional -- entries recorded before this field existed on the server have it
   * undefined, never a fabricated guess at which confluences were present. */
  confluences?: Confluence[];
}

export interface JournalEntry {
  id: string;
  signalId: string;
  account: AccountKey;
  pair: Pair;
  timeframe: Timeframe | undefined;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  profit: number;
  riskDollars: number | null;
  rMultiple: number | null;
  reason: JournalCloseReason;
  closedAt: number;
  context: JournalSignalContext | null;
}

export interface PerformanceStats {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  averageR: number | null;
  maxDrawdownR: number | null;
}

export interface SignalFunnelStats {
  approved: number;
  rejected: number;
  expired: number;
  blocked: number;
}

// "Which confluences actually predict wins" -- mirrors forex-ai's
// getConfluenceBreakdown in lib/market/tradeJournal.ts. Buckets are not mutually
// exclusive (a trade's signal can carry many confluences at once).
export type ConfluenceStatus = "ok" | "insufficient_data";

export interface ConfluenceBreakdownBucket {
  confluence: Confluence;
  sampleSize: number;
  status: ConfluenceStatus;
  winRate: number | null;
  averageR: number | null;
}

// "Is the broker filling me at a worse price than I asked for" -- mirrors forex-ai's
// getSlippageStats in lib/market/slippage.ts. Positive pips = adverse (cost you),
// negative = favorable (helped you).
export interface SlippageStats {
  count: number;
  averagePips: number | null;
  adverseRate: number;
  worstAdversePips: number | null;
  bestFavorablePips: number | null;
}

export interface JournalResponse {
  entries: JournalEntry[];
  stats: PerformanceStats;
  openCount: number;
  signalFunnel: SignalFunnelStats;
  breakdownByPair: Record<string, PerformanceStats>;
  breakdownBySession: Record<string, PerformanceStats>;
  /** "Which market regime is my SMC strategy actually working in" -- effectively
   * SMC-only (context is only ever recorded for internally-generated SMC signals). */
  breakdownByRegime: Record<string, PerformanceStats>;
  breakdownByConfluence: ConfluenceBreakdownBucket[];
  slippage: SlippageStats;
  slippageByPair: Record<string, SlippageStats>;
  confidenceCalibration: ConfidenceCalibrationBucket[];
  signerBCalibration: SignerBCalibrationBucket[];
  calibrationMinSamples: number;
}

// "Can I actually trust a 95% confidence signal" -- mirrors forex-ai's
// getConfidenceCalibration in lib/market/tradeJournal.ts.
export type CalibrationStatus = "calibrated" | "insufficient_data";

export interface ConfidenceCalibrationBucket {
  tier: "buy" | "strong_buy";
  sampleSize: number;
  status: CalibrationStatus;
  winRate: number | null;
  averageR: number | null;
  expectancy: number | null;
}

// Mirrors forex-ai's DimensionTier (lib/market/confidenceScore.ts).
export type DimensionTier = "no_trade" | "watch" | "buy" | "strong_buy";

// "Is Signer B actually pulling its weight, or just rubber-stamping Signer A" -- mirrors
// forex-ai's getSignerBCalibration in lib/market/tradeJournal.ts. Every fired signal
// already has Signer B agreeing with Signer A on direction (decisionMatrix.ts holds on
// any disagreement/neutral read), so this buckets by Signer B's own confidence level
// instead -- spans all four DimensionTier values, unlike Signer A's own calibration
// (buy/strong_buy only, gated by construction of what becomes a Signal at all).
export interface SignerBCalibrationBucket {
  tier: DimensionTier;
  sampleSize: number;
  status: CalibrationStatus;
  winRate: number | null;
  averageR: number | null;
  expectancy: number | null;
}

// --- Push notifications (mirrors forex-ai's lib/market/types.ts) ---

export interface NotificationPrefs {
  buySignals: boolean;
  sellSignals: boolean;
  tradeExecution: boolean;
  tpSl: boolean;
  riskAlerts: boolean;
  connectionAlerts: boolean;
  weeklyDigest: boolean;
  dailyDigest: boolean;
  /** Fires when a restart (deploy, crash, host restart) silently drops Engine Mode back
   * to its safe ANALYSIS default from LIVE/DEMO. Defaults ON: missing this one means
   * believing you're still live-trading when you're not. */
  engineModeAlerts: boolean;
  /** Fires when a signal that otherwise qualified was held back from auto-execution --
   * correlated exposure, a risk limit, an existing losing position on the same
   * pair+timeframe, or a lot size too small to clear the broker's minimum. Purely
   * informational -- narrates why the autopilot didn't fire, never changes whether it
   * does. Defaults ON. */
  autopilotBlocked: boolean;
  /** Fires when the London/NY killzone window opens or closes -- the SMC engine's own
   * FX/gold trading window. Purely informational. Defaults ON. */
  sessionAlerts: boolean;
  minConfidence: number;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  buySignals: true,
  sellSignals: true,
  tradeExecution: true,
  tpSl: true,
  riskAlerts: true,
  connectionAlerts: true,
  weeklyDigest: true,
  // Defaults OFF, unlike weeklyDigest -- mirrors forex-ai's own default, since a
  // nightly push is a much higher-frequency ask than a weekly one.
  dailyDigest: false,
  engineModeAlerts: true,
  autopilotBlocked: true,
  sessionAlerts: true,
  minConfidence: 80,
};

// --- System health (mirrors forex-ai's app/api/system-health/route.ts) ---

export interface SystemHealthPair {
  pair: Pair;
  specAvailable: boolean;
  tradeMode: string | null;
  stopsLevel: number | null;
  priceAvailable: boolean;
  stale: boolean;
}

export interface SystemHealthAccount {
  account: AccountKey;
  connectionStatus: ConnectionStatusResponse;
  accountInfo: { balance: number; equity: number; freeMargin: number; margin: number; tradeAllowed: boolean } | null;
  pairs: SystemHealthPair[];
}

export interface SystemHealthResponse {
  live: SystemHealthAccount;
  demo: SystemHealthAccount | null;
}

// --- Backtesting (mirrors forex-ai's lib/market/backtest/backtestRunner.ts) ---

// Only these three timeframes are ever actually evaluated by the live signal engine --
// mirrors backtest/constants.ts's own BACKTEST_TIMEFRAMES.
export const BACKTEST_TIMEFRAMES: Timeframe[] = ["15m", "30m", "1h"];
export const MAX_LOOKBACK_DAYS = 180;
export const DEFAULT_LOOKBACK_DAYS = 60;

export interface BacktestRequest {
  pairs: Pair[];
  timeframe: Timeframe;
  lookbackDays?: number;
  realistic?: boolean;
}

export type BacktestStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface BacktestProgress {
  pairsDone: number;
  pairsTotal: number;
  barsEvaluated: number;
  barsTotal: number;
}

export interface ScoreRangeBucket {
  range: string;
  count: number;
  winRate: number;
  averageR: number | null;
}

export interface BacktestResult {
  stats: PerformanceStats;
  profitFactor: number | null;
  sharpeRatio: number | null;
  streaks: { maxConsecutiveWins: number; maxConsecutiveLosses: number };
  scoreRangeBreakdown: ScoreRangeBucket[];
  openAtWindowEnd: number;
  perPair: { pair: Pair; stats: PerformanceStats }[];
  entries: JournalEntry[];
}

export interface BacktestJob {
  id: string;
  createdAt: number;
  request: BacktestRequest;
  status: BacktestStatus;
  progress: BacktestProgress;
  error?: string;
  result: BacktestResult | null;
}

export interface BacktestListResponse {
  current: BacktestJob | null;
  history: BacktestJob[];
}

// --- Risk & execution config (mirrors forex-ai's lib/market/executionConfig.ts) ---

export interface ExecutionConfig {
  riskPerTradePct: number;
  maxConcurrentPositions: number;
  maxCorrelatedPositions: number;
  maxDailyLossPct: number;
  maxTradesPerDay: number;
  maxConsecutiveLosses: number;
  cooldownMinutes: number;
  maxSpreadFractionOfStop: number;
  breakEvenTriggerR: number;
  trailingArmTriggerR: number;
  trailingDistanceFractionOfStop: number;
  positionManagementEnabled: boolean;
  partialCloseEnabled: boolean;
  partialCloseFraction: number;
  m5ConfirmationEnabled: boolean;
  confidenceSizingEnabled: boolean;
  riskMultiplierBuy: number;
  riskMultiplierStrongBuy: number;
}

export interface ExecutionConfigResponse {
  live: ExecutionConfig;
  demo: ExecutionConfig | null;
}

// --- Pair correlation (mirrors forex-ai's lib/market/rollingCorrelation.ts) ---

export interface CorrelationEntry {
  pairA: Pair;
  pairB: Pair;
  correlation: number;
  sampleSize: number;
}

export interface CorrelationResponse {
  entries: CorrelationEntry[];
  computedAtAgeMs: number | null;
  threshold: number;
}

export type DevicePlatform = "ios" | "android" | "web";

export interface PushDevice {
  deviceId: string;
  pushToken: string;
  platform: DevicePlatform;
  appVersion?: string;
  notificationPrefs: NotificationPrefs;
  createdAt: number;
  updatedAt: number;
}
