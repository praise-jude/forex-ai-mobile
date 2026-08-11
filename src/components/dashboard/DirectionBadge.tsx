import { StyleSheet, Text, View } from "react-native";
import { DashboardColors } from "@/constants/dashboardColors";

/**
 * One reusable badge for every BUY/SELL/WAIT/UNAVAILABLE indicator in the dashboard --
 * color, shape, and label always driven by the same 4-tone system, never hand-rolled
 * per component. Exists specifically because `SignalsList.tsx`'s tier badge used to
 * color itself by confidence tier alone, landing on the same sky-blue for a SELL
 * signal as a BUY signal. Mirrors forex-ai's web DirectionBadge.tsx.
 *
 * `positive`/`negative` double as both "long direction"/"short direction" (▲/▼) and
 * "confirmed"/"conflicting" confluence status -- one tone system serves both use
 * cases. `neutral` is WAIT/NEUTRAL (amber), `unavailable` is missing data (gray) --
 * explicitly distinct, since "no lean" and "no data" are different, honest states.
 * Shape + color + text together (never color alone), per this app's own accessibility
 * requirement.
 */
export type BadgeTone = "positive" | "negative" | "neutral" | "unavailable";

const TONE_COLORS: Record<BadgeTone, { bg: string; fg: string }> = {
  positive: { bg: DashboardColors.emeraldBg, fg: DashboardColors.emerald },
  negative: { bg: DashboardColors.roseBg, fg: DashboardColors.rose },
  neutral: { bg: DashboardColors.amberBg, fg: DashboardColors.amber },
  unavailable: { bg: DashboardColors.surfaceAlt, fg: DashboardColors.textMuted },
};

const TONE_ICON: Record<BadgeTone, string> = {
  positive: "▲",
  negative: "▼",
  neutral: "●",
  unavailable: "○",
};

export function DirectionBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const colors = TONE_COLORS[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.fg }]}>
        {TONE_ICON[tone]} {label}
      </Text>
    </View>
  );
}

/** `direction`-only convenience -- the overwhelmingly common case (BUY/SELL badges
 * throughout the dashboard never need the neutral/unavailable tones). */
export function directionTone(direction: "long" | "short"): BadgeTone {
  return direction === "long" ? "positive" : "negative";
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 13, fontWeight: "700" },
});
