import React from "react";
import { View, StyleSheet, ViewProps, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";

interface CardProps extends ViewProps {
  children: React.ReactNode;
  /** `flat` drops the shadow — use inside an already-elevated sheet. */
  elevation?: "raised" | "flat";
}

/**
 * Surface container.
 *
 * In light mode a card is separated from the page by a soft shadow rather
 * than a hard border, which keeps busy screens (trip details, driver
 * dashboard) from looking like a stack of boxes. In dark mode shadows are
 * invisible, so separation comes from the border instead — this is why the
 * two schemes are handled differently rather than sharing one style.
 */
export function Card({
  children,
  style,
  elevation = "raised",
  ...props
}: CardProps) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius + 2,
          borderWidth: isDark ? 1 : StyleSheet.hairlineWidth,
        },
        !isDark && elevation === "raised" && styles.raised,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    overflow: "hidden",
  },
  raised: {
    elevation: 2,
    shadowColor: "#0f291d",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
});
