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
  | "BTC/USD";

export const PAIRS: Pair[] = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "USD/CAD",
  "XAU/USD",
  "XAG/USD",
  "USOIL",
  "UKOIL",
  "BTC/USD",
];

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
  | "rsi_divergence";

export type ConfidenceTier = "strong_buy" | "buy" | "watch";
export type SignalSource = "smc" | "tradingview";
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
    };

export type SignalEvaluation = { status: "signal"; signal: Signal } | { status: "no_trade"; reason: NoTradeReason };

export interface PredictionUpdate {
  pair: Pair;
  timeframe: Timeframe;
  evaluation: SignalEvaluation;
  time: number;
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

// Mirrors ExecutionResult from executionEngine.ts plus the client-only outcomes, same
// as lib/market/executionClient.ts on the web side.
export type ExecuteResponse =
  | { status: "duplicate" }
  | { status: "blocked"; code: string; reason: string }
  | { status: "skipped_sizing"; reason: string }
  | { status: "filled"; trade: ExecutedTrade }
  | { status: "rejected"; trade: ExecutedTrade }
  | { status: "not_found" }
  | { status: "network_error" };

export type CardStatus = { state: "idle" } | { state: "loading" } | { state: "done"; result: ExecuteResponse };

export function statusFromTrade(trade: ExecutedTrade): CardStatus | null {
  if (trade.status === "filled") return { state: "done", result: { status: "filled", trade } };
  if (trade.status === "rejected") return { state: "done", result: { status: "rejected", trade } };
  return null;
}

// --- Push notifications (mirrors forex-ai's lib/market/types.ts) ---

export interface NotificationPrefs {
  buySignals: boolean;
  sellSignals: boolean;
  tradeExecution: boolean;
  tpSl: boolean;
  riskAlerts: boolean;
  connectionAlerts: boolean;
  minConfidence: number;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  buySignals: true,
  sellSignals: true,
  tradeExecution: true,
  tpSl: true,
  riskAlerts: true,
  connectionAlerts: true,
  minConfidence: 80,
};

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
