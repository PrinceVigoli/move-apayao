import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export function BrandHero({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={[styles.mark, { borderColor: colors.accent }]}>
        <Feather
          name="navigation"
          size={compact ? 26 : 34}
          color={colors.foreground}
        />
      </View>
      <Text style={[styles.brand, { color: colors.foreground }]}>
        MOVE <Text style={{ color: colors.accent }}>Driver</Text>
      </Text>
      {!compact && (
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Professional mobility for Apayao.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 30, paddingBottom: 24 },
  compact: { paddingTop: 8, paddingBottom: 14 },
  mark: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  brand: { fontFamily: "Inter_700Bold", fontSize: 27, letterSpacing: -0.8 },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 6 },
});
