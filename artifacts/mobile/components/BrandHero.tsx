import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export function BrandHero({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={[styles.sun, { backgroundColor: colors.accent }]} />
      <View style={styles.landscape}>
        <Feather
          name="triangle"
          size={compact ? 40 : 58}
          color={colors.primary}
        />
        <Feather
          name="navigation"
          size={compact ? 25 : 36}
          color={colors.primaryStrong}
          style={styles.river}
        />
      </View>
      <Text style={[styles.brand, { color: colors.foreground }]}>
        MOVE <Text style={{ color: colors.primary }}>Apayao</Text>
      </Text>
      {!compact && (
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Rides that move Apayao forward.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 24,
    minHeight: 185,
    justifyContent: "flex-end",
  },
  compact: { minHeight: 94, paddingBottom: 14 },
  landscape: { height: 62, alignItems: "center", justifyContent: "center" },
  sun: {
    position: "absolute",
    top: 16,
    right: "28%",
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  river: { position: "absolute", bottom: 3, transform: [{ rotate: "145deg" }] },
  brand: { fontFamily: "Inter_700Bold", fontSize: 27, letterSpacing: -0.8 },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 6 },
});
