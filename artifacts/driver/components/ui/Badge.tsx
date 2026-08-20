import React from "react";
import { View, Text, StyleSheet, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";

type Variant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "outline"
  | "secondary";

interface BadgeProps {
  label: string;
  variant?: Variant;
}

/**
 * Status pill.
 *
 * Uses a tinted background with strongly-coloured text rather than white on a
 * saturated fill. The previous approach put white on amber (2.15:1) and white
 * on green (2.54:1) — both well below the readable threshold at badge text
 * sizes, and these pills carry trip status, so they have to be legible at a
 * glance. Every pairing below clears 4.5:1 in both schemes.
 */
const LIGHT: Record<Exclude<Variant, "outline">, { bg: string; fg: string }> = {
  default: { bg: "#fdeae6", fg: "#b82c0d" },
  success: { bg: "#e4f4ea", fg: "#0f7a43" },
  warning: { bg: "#fdf1dd", fg: "#7a4a06" },
  destructive: { bg: "#fbe9e9", fg: "#b02020" },
  secondary: { bg: "#f2f0ed", fg: "#5c7067" },
};

const DARK: Record<Exclude<Variant, "outline">, { bg: string; fg: string }> = {
  default: { bg: "#33201a", fg: "#f6a58e" },
  success: { bg: "#153228", fg: "#6ee7b7" },
  warning: { bg: "#33280f", fg: "#fbd570" },
  destructive: { bg: "#331a1a", fg: "#fca5a5" },
  secondary: { bg: "#24382f", fg: "#a8bdb4" },
};

export function Badge({ label, variant = "default" }: BadgeProps) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";

  const palette = isDark ? DARK : LIGHT;
  const isOutline = variant === "outline";
  const tone = isOutline ? null : palette[variant];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isOutline ? "transparent" : tone!.bg,
          borderColor: isOutline ? colors.border : "transparent",
          borderWidth: isOutline ? 1 : 0,
        },
      ]}
      accessibilityRole="text"
    >
      <Text
        style={[
          styles.text,
          { color: isOutline ? colors.mutedForeground : tone!.fg },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
    textTransform: "capitalize",
  },
});
