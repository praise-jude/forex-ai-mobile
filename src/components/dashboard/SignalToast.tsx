import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

export interface ToastEntry {
  key: string;
  signal: Signal;
}

const AUTO_DISMISS_MS = 6000;

function Toast({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (key: string) => void }) {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const id = setTimeout(() => onDismiss(toast.key), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLong = toast.signal.direction === "long";

  return (
    <Animated.View style={[styles.toast, { opacity, borderColor: isLong ? DashboardColors.emerald : DashboardColors.rose }]}>
      <Pressable style={styles.toastContent} onPress={() => onDismiss(toast.key)}>
        <Text style={[styles.toastTitle, { color: isLong ? DashboardColors.emerald : DashboardColors.rose }]}>
          {isLong ? "JUDE · BUY SIGNAL" : "OMINI · SELL SIGNAL"}
        </Text>
        <Text style={styles.toastBody}>
          {toast.signal.pair} · {toast.signal.confidence.toFixed(0)}% confidence
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function SignalToastStack({ toasts, onDismiss }: { toasts: ToastEntry[]; onDismiss: (key: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <View style={styles.stack} pointerEvents="box-none">
      {toasts.map((toast) => (
        <Toast key={toast.key} toast={toast} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { position: "absolute", top: 12, left: 12, right: 12, gap: 8, zIndex: 50 },
  toast: {
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: DashboardColors.surface,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    elevation: 6,
  },
  toastContent: { paddingHorizontal: 14, paddingVertical: 10 },
  toastTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  toastBody: { fontSize: 12, color: DashboardColors.textSecondary, marginTop: 2 },
});
