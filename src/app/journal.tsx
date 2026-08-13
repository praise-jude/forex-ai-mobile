import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DashboardColors } from "@/constants/dashboardColors";
import { JournalPanel } from "@/components/dashboard/JournalPanel";
import { useSettings } from "@/lib/api/SettingsContext";

export default function JournalScreen() {
  const { isConfigured, loaded } = useSettings();

  if (!loaded) return null;

  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Not connected yet</Text>
          <Text style={styles.emptyBody}>Set the dashboard server URL and password in Settings to see your trade journal.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <JournalPanel />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DashboardColors.background },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: DashboardColors.textPrimary },
  emptyBody: { fontSize: 13, color: DashboardColors.textSecondary, textAlign: "center" },
});
