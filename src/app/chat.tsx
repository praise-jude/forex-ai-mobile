import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DashboardColors } from "@/constants/dashboardColors";
import { ChatPanel } from "@/components/dashboard/ChatPanel";
import { useSettings } from "@/lib/api/SettingsContext";

export default function ChatScreen() {
  const { isConfigured, loaded } = useSettings();

  if (!loaded) return null;

  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Not connected yet</Text>
          <Text style={styles.emptyBody}>Set the dashboard server URL and password in Settings to chat with JUDE.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <ChatPanel />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DashboardColors.background },
  container: { flex: 1, padding: 16 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: DashboardColors.textPrimary },
  emptyBody: { fontSize: 13, color: DashboardColors.textSecondary, textAlign: "center" },
});
