import type { Pair } from "@/lib/api/types";
import { PAIRS } from "@/lib/api/types";

/** Friendlier spoken form for TTS -- mirrors forex-ai's lib/voice/grammar.ts so JUDE
 * sounds the same on mobile as on the web dashboard. Ticker pairs are spelled out letter
 * by letter so TTS engines don't mangle "EURUSD" as a mispronounced word. */
export const PAIR_SPOKEN_NAMES: Record<Pair, string> = {
  "EUR/USD": "Euro against the US Dollar, E U R U S D",
  "GBP/USD": "British Pound against the US Dollar, G B P U S D",
  "USD/JPY": "US Dollar against the Japanese Yen, U S D J P Y",
  "AUD/USD": "Australian Dollar against the US Dollar, A U D U S D",
  "USD/CAD": "US Dollar against the Canadian Dollar, U S D C A D",
  "XAU/USD": "Gold against the US Dollar",
  "XAG/USD": "Silver against the US Dollar",
  USOIL: "US Crude Oil",
  UKOIL: "UK Brent Oil",
  "BTC/USD": "Bitcoin against the US Dollar, B T C U S D",
  "USD/CHF": "US Dollar against the Swiss Franc, U S D C H F",
  "NZD/USD": "New Zealand Dollar against the US Dollar, N Z D U S D",
  "EUR/JPY": "Euro against the Japanese Yen, E U R J P Y",
  "AUD/JPY": "Australian Dollar against the Japanese Yen, A U D J P Y",
  "ETH/USD": "Ethereum against the US Dollar, E T H U S D",
  NFLX: "Netflix",
  MSFT: "Microsoft",
  SPCX: "SpaceX",
};

/** Ticker form used in the spoken confirmation phrase, e.g. "BTC/USD" -> "BTCUSD". */
export function tickerWord(pair: Pair): string {
  return pair.replace("/", "");
}

// Every recognized spoken alias for a pair, checked longest-first below so e.g. "us oil"
// doesn't shadow a later, more specific match. Deliberately keyword-based rather than a
// full NLP model -- a small, fixed instrument list is exactly what a lookup table suits.
const PAIR_ALIASES: [pair: Pair, aliases: string[]][] = [
  ["XAU/USD", ["gold", "xau", "xauusd", "xau usd"]],
  ["XAG/USD", ["silver", "xag", "xagusd", "xag usd"]],
  ["BTC/USD", ["bitcoin", "btc", "btcusd", "btc usd"]],
  ["ETH/USD", ["ethereum", "eth", "ethusd", "eth usd"]],
  ["UKOIL", ["uk oil", "brent oil", "brent", "ukoil"]],
  ["EUR/USD", ["eur usd", "eurusd", "euro dollar", "euro us dollar", "euro"]],
  ["GBP/USD", ["gbp usd", "gbpusd", "pound dollar", "cable", "sterling"]],
  ["USD/JPY", ["usd jpy", "usdjpy", "dollar yen", "yen"]],
  ["AUD/USD", ["aud usd", "audusd", "aussie dollar", "aussie"]],
  ["USD/CAD", ["usd cad", "usdcad", "dollar cad", "loonie"]],
  ["USD/CHF", ["usd chf", "usdchf", "swiss franc", "dollar franc", "chf"]],
  [
    "NZD/USD",
    ["nzd usd", "nzdusd", "kiwi dollar", "kiwi", "new zealand dollar"],
  ],
  // Deliberately more specific than a bare "euro"/"yen" (already claimed by EUR/USD and
  // USD/JPY above, checked first) -- avoids EUR/JPY silently stealing either alias.
  ["EUR/JPY", ["eur jpy", "eurjpy", "euro yen"]],
  // Same reasoning as EUR/JPY -- "aussie" and "yen" are already claimed by AUD/USD and
  // USD/JPY above, so this needs its own more specific phrasing.
  ["AUD/JPY", ["aud jpy", "audjpy", "aussie yen"]],
  ["NFLX", ["netflix", "nflx"]],
  ["MSFT", ["microsoft", "msft"]],
  ["SPCX", ["spacex", "spcx", "space exploration"]],
];

/** Finds the first pair whose alias appears in the (already-lowercased) transcript. */
export function matchPair(normalizedTranscript: string): Pair | undefined {
  for (const [pair, aliases] of PAIR_ALIASES) {
    if (aliases.some((alias) => normalizedTranscript.includes(alias)))
      return pair;
  }
  // Fall back to a bare ticker match (e.g. someone reads "E U R U S D" and Whisper
  // transcribes it close to the compact ticker form).
  for (const pair of PAIRS) {
    if (normalizedTranscript.includes(tickerWord(pair).toLowerCase()))
      return pair;
  }
  return undefined;
}
