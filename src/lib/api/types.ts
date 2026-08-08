// Mirrors the subset of forex-ai/lib/market/types.ts that the mobile client needs.
// Kept as a hand-copied, JSON-shaped mirror (not a shared package) since the web app
// isn't set up as a monorepo-shared library today.

export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";

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
  | "multi_timeframe";

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
  tier: ConfidenceTier;
  confluences: Confluence[];
  session: Session;
  timeframe: Timeframe;
  createdAt: number;
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
