// A deliberately dark, fixed palette (not the app's auto light/dark theme) mirroring the
// web dashboard's zinc/sky/emerald/rose Tailwind colors -- the trading UI is meant to look
// like the same product on both platforms, not adapt to the phone's light/dark setting.
export const DashboardColors = {
  background: "#09090b",
  surface: "#18181b",
  surfaceAlt: "#27272a",
  border: "rgba(255,255,255,0.1)",
  textPrimary: "#f4f4f5",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
  sky: "#38bdf8",
  skyBg: "rgba(56,189,248,0.15)",
  emerald: "#34d399",
  emeraldBg: "rgba(52,211,153,0.15)",
  emeraldStrong: "#059669",
  rose: "#fb7185",
  roseBg: "rgba(244,63,94,0.15)",
  roseStrong: "#e11d48",
  amber: "#fbbf24",
  amberBg: "rgba(245,158,11,0.15)",
} as const;
