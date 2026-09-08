import type { MarketRegime, Signal } from "./types";

// Mirrors forex-ai's lib/market/setupQualityScore.ts exactly -- hand-copied here for the
// same reason every other type/helper in this app is (see types.ts's own top-of-file
// note): this app isn't set up as a monorepo-shared library with the web app.

const SMC_MAX = 30;
const TREND_MAX = 20;
const MOMENTUM_MAX = 15;
const LIQUIDITY_MAX = 10;
const VOLATILITY_MAX = 10;
const NEWS_MAX = 10;
const SESSION_MAX = 5;

const TREND_REGIME_MISMATCH_PENALTY = 2;

// Oil trades through Asia and the full US session (see forex-ai's symbols.ts) -- treated
// the same as the London/New York killzone for the session sub-score below.
const COMMODITY_PAIRS = new Set(["USOIL", "UKOIL"]);

export interface SetupQualityBreakdown {
  smc: number; // 0-30
  trend: number; // 0-20
  momentum: number; // 0-15
  liquidity: number; // 0-10
  volatility: number; // 0-10
  newsRisk: number; // 0-10
  session: number; // 0-5
  /** Sum of the above -- always 0-100 by construction. Explicitly NOT a probability of
   * winning -- a transparent breakdown of how well-confirmed the setup is, using only
   * data the engine already computed. */
  total: number;
}

/** Not stored on `Signal` -- computed on demand from fields the Signal already carries
 * plus the independently computed MarketRegime. Weights are documented defaults, not
 * claimed-optimal figures. */
export function scoreSetupQuality(signal: Signal, regime: MarketRegime): SetupQualityBreakdown {
  const smc = Math.round((signal.entryScore / 100) * SMC_MAX);

  const regimeAgrees =
    (signal.direction === "long" && regime === "strong_uptrend") || (signal.direction === "short" && regime === "strong_downtrend");
  const trendBase = Math.round((signal.directionScore / 100) * TREND_MAX);
  const trend = Math.max(0, regimeAgrees ? trendBase : trendBase - TREND_REGIME_MISMATCH_PENALTY);

  let momentum = 0;
  if (signal.confluences.includes("rsi_momentum")) momentum += 5;
  if (signal.confluences.includes("macd_crossover")) momentum += 5;
  if (signal.confluences.includes("rsi_divergence")) momentum += 5;
  momentum = Math.min(momentum, MOMENTUM_MAX);

  const hasSweepAndStructure =
    signal.confluences.includes("liquidity_sweep") && (signal.confluences.includes("bos") || signal.confluences.includes("choch"));
  const liquidity = hasSweepAndStructure ? LIQUIDITY_MAX : 0;

  const volatility = regime === "high_volatility" ? VOLATILITY_MAX : regime === "low_volatility" ? 3 : 7;

  const newsRisk = signal.newsStatus === "clear" ? NEWS_MAX : signal.newsStatus === "unavailable" ? 5 : 0;

  const session =
    signal.session === "london" || signal.session === "newyork" || COMMODITY_PAIRS.has(signal.pair)
      ? SESSION_MAX
      : signal.session === "asia"
        ? 3
        : 2;

  const total = smc + trend + momentum + liquidity + volatility + newsRisk + session;

  return { smc, trend, momentum, liquidity, volatility, newsRisk, session, total };
}
