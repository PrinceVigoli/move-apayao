import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export function AdaptiveAppFrame({ children }: React.PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        style={{ flex: 1, width: "100%", maxWidth: 900, alignSelf: "center" }}
      >
        {children}
      </View>
    </View>
  );
}
