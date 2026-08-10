import type { SignalEvaluation } from "./types";

export type PredictionHeadline = "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL" | "NO TRADE";

/**
 * Mirrors forex-ai's lib/market/predictionLabel.ts. `tier` is a confidence bucket,
 * independent of `direction` -- a short signal at strong_buy tier is "STRONG SELL"
 * here, not "STRONG BUY". `watch`-tier signals (already treated everywhere else in
 * this app as informational-only, not executable) collapse to NEUTRAL -- see
 * predictionSubline for the detail underneath.
 */
export function predictionHeadline(evaluation: SignalEvaluation): PredictionHeadline {
  if (evaluation.status === "no_trade") return "NO TRADE";
  const { tier, direction } = evaluation.signal;
  const isLong = direction === "long";
  if (tier === "watch") return "NEUTRAL";
  if (tier === "strong_buy") return isLong ? "STRONG BUY" : "STRONG SELL";
  return isLong ? "BUY" : "SELL";
}

/** The real lean behind a NEUTRAL (watch-tier) headline -- never shown for any other
 * headline, so a genuine BUY/SELL/NO TRADE never gets a redundant second line. */
export function predictionSubline(evaluation: SignalEvaluation): string | null {
  if (evaluation.status !== "signal" || evaluation.signal.tier !== "watch") return null;
  const lean = evaluation.signal.direction === "long" ? "BUY" : "SELL";
  return `Leaning ${lean} (watch-tier, ${evaluation.signal.confidence.toFixed(0)}%) — below execution threshold.`;
}
