import type { Pair } from "./types";

// Mirrors the decimals table from forex-ai/lib/market/symbols.ts -- the mobile client
// never talks to the broker directly, so only the display-precision half of that table
// is needed here, not the broker-symbol mapping.
const DECIMALS: Record<Pair, number> = {
  "EUR/USD": 5,
  "GBP/USD": 5,
  "USD/JPY": 3,
  "AUD/USD": 5,
  "USD/CAD": 5,
  "XAU/USD": 3,
  "XAG/USD": 3,
  USOIL: 3,
  UKOIL: 3,
  "BTC/USD": 2,
};

export function decimals(pair: Pair): number {
  return DECIMALS[pair];
}

export function formatPrice(pair: Pair, value: number): string {
  return value.toFixed(decimals(pair));
}

export function relativeTime(fromMs: number): string {
  const seconds = Math.round((Date.now() - fromMs) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function formatRemaining(untilMs: number, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil((untilMs - nowMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatAgo(lastUpdateAt: number | null, nowMs: number): string {
  if (lastUpdateAt === null) return "no data yet";
  const seconds = Math.max(0, Math.round((nowMs - lastUpdateAt) / 1000));
  if (seconds < 60) return `updated ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `updated ${minutes}m ago`;
}
