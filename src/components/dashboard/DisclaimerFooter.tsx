import { StyleSheet, Text } from "react-native";
import { DashboardColors } from "@/constants/dashboardColors";

export function DisclaimerFooter() {
  return (
    <Text style={styles.text}>
      Forex AI provides automated market analysis and trade execution tools. A signal score is not a guarantee of profit. Trading
      involves substantial risk, and losses can occur. Use risk controls and test the strategy on a demo account before using real
      funds.
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    borderTopWidth: 1,
    borderTopColor: DashboardColors.border,
    paddingTop: 12,
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    color: DashboardColors.textMuted,
  },
});
