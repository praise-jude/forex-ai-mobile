import type { ExecuteResponse, Pair, PredictionUpdate, Signal, Timeframe } from "@/lib/api/types";
import { formatPrice } from "@/lib/api/format";
import { describeNoTradeReason } from "@/lib/api/noTradeReason";
import { predictionHeadline } from "@/lib/api/predictionLabel";
import { PAIR_SPOKEN_NAMES, matchPair, tickerWord } from "./pairNames";

// Three independent signal engines (15m/30m/1h) can now announce for the same pair
// moments apart -- spoken so a listener can tell them apart. Mirrors forex-ai's web
// grammar.ts (that file is the source of truth for this mapping; kept in sync by hand).
const TIMEFRAME_SPOKEN: Record<Timeframe, string> = {
  "5m": "5 minute",
  "15m": "15 minute",
  "30m": "30 minute",
  "1h": "1 hour",
  "4h": "4 hour",
  "1d": "daily",
};

/** The exact phrase the user must say to hard-confirm a trade -- deliberately requires an
 * exact match (see parseVoiceCommand) so background noise or a vague "yes" can never fire
 * a live order by itself. Mirrors forex-ai's lib/voice/grammar.ts. */
export function buildConfirmPhrase(signal: Signal): string {
  const directionWord = signal.direction === "long" ? "BUY" : "SELL";
  return `CONFIRM ${directionWord} ${tickerWord(signal.pair)}`;
}

/** Short spoken summary of which Signer B (independent confirmation) factors actively
 * support this signal's direction -- omits factors that are unavailable, neutral, or
 * conflicting rather than mentioning them negatively here: Signer B's own direction
 * must already agree with SMC's for a signal to have been produced at all (a real
 * conflict holds the trade, see the backend's decisionMatrix.ts), so nothing here is
 * ever a disagreement, just factors that weren't decisive. Mirrors forex-ai's web
 * lib/voice/grammar.ts. */
function confirmationSummary(signal: Signal): string {
  const supporting: string[] = [];
  if (signal.signerBEmaTrend !== "unavailable" && signal.signerBEmaTrend === (signal.direction === "long" ? "bullish" : "bearish")) {
    supporting.push("the EMA trend");
  }
  if (signal.supertrendTrend !== "unavailable" && signal.supertrendTrend === (signal.direction === "long" ? "up" : "down")) {
    supporting.push("Supertrend");
  }
  if (signal.usdStrengthStatus === "supports") supporting.push("currency strength");
  if (
    signal.rsiDivergence !== "unavailable" &&
    signal.rsiDivergence !== "none" &&
    signal.rsiDivergence === (signal.direction === "long" ? "bullish" : "bearish")
  ) {
    supporting.push("RSI divergence");
  }

  if (supporting.length === 0) return "";
  const list = supporting.length === 1 ? supporting[0] : `${supporting.slice(0, -1).join(", ")} and ${supporting[supporting.length - 1]}`;
  return `${list} ${supporting.length === 1 ? "is" : "are"} confirming the move.`;
}

export function buildSignalAnnouncement(signal: Signal): string {
  const directionWord = signal.direction === "long" ? "buy" : "sell";
  return [
    `JUDE here. I have a potential ${directionWord} opportunity.`,
    `The market is ${PAIR_SPOKEN_NAMES[signal.pair]}, on the ${TIMEFRAME_SPOKEN[signal.timeframe]} timeframe.`,
    `Entry ${formatPrice(signal.pair, signal.entry)}.`,
    `Stop loss ${formatPrice(signal.pair, signal.stopLoss)}.`,
    `Take profit ${formatPrice(signal.pair, signal.takeProfit)}.`,
    confirmationSummary(signal),
    `Confidence ${Math.round(signal.confidence)} percent.`,
    `Say "${buildConfirmPhrase(signal)}" to place this trade.`,
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

/** Spoken form of the real current evaluation for a pair, for "analyze X" / "what's the
 * X signal" queries -- distinct from buildSignalAnnouncement, which is the proactive "a
 * new signal just arrived" announcement. Uses the same real evaluation data (and the
 * same no-trade reasoning) as the prediction card and buildPredictionAnnouncement, so
 * "analyze X" never says less than what's already on screen. */
export function buildAnalysisAnnouncement(pair: Pair, update: PredictionUpdate | null): string {
  const name = PAIR_SPOKEN_NAMES[pair];
  if (!update) return `No active setup on ${name} right now.`;

  if (update.evaluation.status === "no_trade") {
    return `${name} is currently no trade. ${describeNoTradeReason(update.evaluation.reason)}`;
  }

  const { signal } = update.evaluation;
  const directionWord = signal.direction === "long" ? "BUY" : "SELL";
  const tierWord = signal.tier === "watch" ? "a watch-tier setup, below the execution threshold" : `a ${directionWord} setup`;
  return [
    `${name} currently shows ${tierWord} on the ${TIMEFRAME_SPOKEN[signal.timeframe]} timeframe.`,
    `Confidence ${Math.round(signal.confidence)} percent.`,
    `Entry ${formatPrice(pair, signal.entry)}, stop loss ${formatPrice(pair, signal.stopLoss)}, take profit ${formatPrice(pair, signal.takeProfit)}.`,
  ].join(" ");
}

/**
 * A short status readout for a prediction-headline change on the currently selected
 * pair -- distinct from buildSignalAnnouncement's full trade pitch, since this fires on
 * *any* headline change (including into NEUTRAL/NO TRADE), not just a new executable
 * signal. Never fabricates a reason -- the no_trade/watch detail comes straight from
 * describeNoTradeReason / the real Signal fields. Mirrors forex-ai's web grammar.ts.
 */
export function buildPredictionAnnouncement(update: PredictionUpdate): string {
  const pairName = PAIR_SPOKEN_NAMES[update.pair];
  const timeframeWord = TIMEFRAME_SPOKEN[update.timeframe];

  if (update.evaluation.status === "no_trade") {
    return `JUDE here. ${pairName} is now no trade on the ${timeframeWord} timeframe. ${describeNoTradeReason(update.evaluation.reason)}`;
  }

  const { signal } = update.evaluation;
  if (signal.tier === "watch") {
    const lean = signal.direction === "long" ? "buy" : "sell";
    return `JUDE here. ${pairName} has moved to neutral on the ${timeframeWord} timeframe -- leaning ${lean} at ${signal.confidence.toFixed(0)} percent, below the execution threshold.`;
  }

  const headline = predictionHeadline(update.evaluation).toLowerCase();
  return `JUDE here. ${pairName} is now a ${headline} at ${signal.confidence.toFixed(0)} percent confidence on the ${timeframeWord} timeframe.`;
}

function blockedReasonSpeech(code: string, reason: string): string {
  switch (code) {
    case "stale_price":
      return "The market has moved since I gave you that recommendation, so I cancelled the order.";
    case "cooldown":
      return `Your trading activity has exceeded your configured risk limit, so I can't place this. ${reason}`;
    case "daily_loss":
    case "halted":
      return "Autopilot is locked for today -- the daily loss limit has already been reached.";
    default:
      return reason;
  }
}

/** Never says "trade placed" unless `result.status === "filled"` -- MetaApi's own
 * confirmation, relayed through the backend, is what triggers that line. */
export function buildResultAnnouncement(signal: Signal, result: ExecuteResponse): string {
  const pairWord = tickerWord(signal.pair);
  const directionWord = signal.direction === "long" ? "buy" : "sell";

  switch (result.status) {
    case "filled": {
      const { trade } = result;
      return [
        "The trade has been placed successfully.",
        `${pairWord} ${directionWord}.`,
        `Entry price ${formatPrice(signal.pair, trade.filledEntry ?? trade.requestedEntry)}.`,
        `Position size ${trade.requestedLots} lots.`,
        "I'll monitor the position.",
      ].join(" ");
    }
    case "rejected":
      return `I could not place the trade. ${result.trade.rejectReason ?? "The broker rejected the order."}`;
    case "blocked":
      return `I could not place the trade. ${blockedReasonSpeech(result.code, result.reason)}`;
    case "skipped_sizing":
      return `I could not place the trade. ${result.reason}`;
    case "duplicate":
      return "That trade has already been submitted -- no second order was placed.";
    case "not_found":
      return "That signal has expired. No trade has been placed.";
    case "network_error":
      return "I couldn't reach the server to place that trade. No trade has been placed.";
  }
}

export type VoiceCommand =
  | { kind: "hard_confirm" }
  | { kind: "soft_confirm" }
  | { kind: "decline" }
  | { kind: "emergency_stop" }
  | { kind: "query_profit" }
  | { kind: "query_positions" }
  | { kind: "analyze"; pair: Pair }
  | { kind: "trade_request"; pair: Pair; direction: "long" | "short" }
  | { kind: "mute" }
  | { kind: "unmute" }
  | { kind: "unrecognized" };

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

const SOFT_CONFIRM_PHRASES = ["approve", "place the trade", "yes place it", "confirm", "yes", "go ahead", "do it"];
const DECLINE_PHRASES = ["reject", "cancel", "dont place it", "wait", "no"];
const EMERGENCY_PHRASES = ["emergency stop", "stop trading", "disable autopilot", "halt trading"];
const PROFIT_PHRASES = ["whats my current profit", "what is my profit", "show my profit", "current profit", "my profit"];
const POSITIONS_PHRASES = ["show my open trades", "what trades are open", "show open trades", "open positions", "open trades"];
const MUTE_PHRASES = ["mute", "stop talking", "quiet", "be quiet"];
const UNMUTE_PHRASES = ["unmute", "start talking"];
const BUY_WORDS = ["buy", "long"];
const SELL_WORDS = ["sell", "short"];
const ANALYZE_WORDS = ["analyze", "analyse", "whats the", "what is the", "how is", "check"];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary match, not raw substring -- a bare `.includes()` here would classify
 * "I know the risk, go ahead" as a decline (because "know" contains "no") or "eyeshadow
 * looks nice" as a soft-confirm (because "eyeshadow" contains "yes"). This drives real
 * trade confirm/decline classification, so a false match isn't just a UX annoyance.
 * Mirrors forex-ai's web lib/voice/grammar.ts. */
function matchesAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((phrase) => normalized === phrase || new RegExp(`\\b${escapeRegExp(phrase)}\\b`).test(normalized));
}

function containsWord(normalized: string, words: string[]): boolean {
  return words.some((word) => new RegExp(`\\b${word}\\b`).test(normalized));
}

/**
 * Classifies a transcribed voice command. `expectedConfirmPhrase` should be the exact
 * phrase from `buildConfirmPhrase` for whichever signal is currently awaiting
 * confirmation (or null if none is pending) -- only an exact match against it ever counts
 * as "hard_confirm", so a stray "confirm" alone can't fire a real order (see
 * useVoiceAssistant's soft_confirm handling, which re-prompts for the exact phrase).
 */
export function parseVoiceCommand(transcript: string, expectedConfirmPhrase: string | null): VoiceCommand {
  const normalized = normalize(transcript);
  if (!normalized) return { kind: "unrecognized" };

  if (expectedConfirmPhrase && normalized === normalize(expectedConfirmPhrase)) {
    return { kind: "hard_confirm" };
  }
  if (matchesAny(normalized, EMERGENCY_PHRASES)) return { kind: "emergency_stop" };
  if (matchesAny(normalized, DECLINE_PHRASES)) return { kind: "decline" };
  if (matchesAny(normalized, PROFIT_PHRASES)) return { kind: "query_profit" };
  if (matchesAny(normalized, POSITIONS_PHRASES)) return { kind: "query_positions" };
  if (matchesAny(normalized, MUTE_PHRASES)) return { kind: "mute" };
  if (matchesAny(normalized, UNMUTE_PHRASES)) return { kind: "unmute" };

  const pair = matchPair(normalized);
  if (pair) {
    if (containsWord(normalized, BUY_WORDS)) return { kind: "trade_request", pair, direction: "long" };
    if (containsWord(normalized, SELL_WORDS)) return { kind: "trade_request", pair, direction: "short" };
    if (matchesAny(normalized, ANALYZE_WORDS) || normalized.split(" ").length <= 4) {
      return { kind: "analyze", pair };
    }
  }

  // Checked after pair/trade-request detection: a pending "buy XAUUSD" trade request
  // shouldn't be misread as a soft-confirm ("yes"/"confirm" alone) meant for a DIFFERENT
  // already-pending signal.
  if (matchesAny(normalized, SOFT_CONFIRM_PHRASES)) return { kind: "soft_confirm" };

  return { kind: "unrecognized" };
}
