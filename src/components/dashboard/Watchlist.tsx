import { memo, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Pair, WatchlistEntry } from "@/lib/api/types";
import { formatPrice } from "@/lib/api/format";
import { DashboardColors } from "@/constants/dashboardColors";

function TickPrice({ pair, bid }: { pair: Pair; bid: number | null }) {
  const prevBid = useRef(bid);
  const [color, setColor] = useState<string>(DashboardColors.textPrimary);

  useEffect(() => {
    if (bid !== prevBid.current) {
      if (bid !== null && prevBid.current !== null) {
        setColor(bid > prevBid.current ? DashboardColors.emerald : bid < prevBid.current ? DashboardColors.rose : DashboardColors.textPrimary);
      }
      prevBid.current = bid;
    }
  }, [bid]);

  return <Text style={[styles.chipPrice, { color }]}>{bid === null ? "–" : formatPrice(pair, bid)}</Text>;
}

// Memoized so an unrelated poll tick (index.tsx's stabilizeWatchlist reuses unchanged
// entries by reference) doesn't re-render every pair chip -- only a pair whose bid/ask
// actually moved produces a new `entries` array worth re-rendering for.
export const Watchlist = memo(function Watchlist({
  entries,
  selectedPair,
  onSelect,
}: {
  entries: WatchlistEntry[];
  selectedPair: Pair;
  onSelect: (pair: Pair) => void;
}) {
  return (
    <View>
      <Text style={styles.heading}>Pairs</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {entries.map((entry) => {
          const selected = entry.pair === selectedPair;
          return (
            <Pressable
              key={entry.pair}
              onPress={() => onSelect(entry.pair)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${entry.pair}`}
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={styles.chipPair}>{entry.pair}</Text>
              <TickPrice pair={entry.pair} bid={entry.bid} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  heading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: DashboardColors.textMuted,
    marginBottom: 8,
  },
  row: { gap: 8, paddingRight: 8 },
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 92,
  },
  chipSelected: { borderColor: DashboardColors.sky, backgroundColor: DashboardColors.surfaceAlt },
  chipPair: { color: DashboardColors.textPrimary, fontSize: 12, fontWeight: "700" },
  chipPrice: { fontSize: 13, fontWeight: "600", marginTop: 2 },
});
