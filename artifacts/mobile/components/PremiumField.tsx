import React, { useState } from "react";
import { View, TextInput, StyleSheet, type TextInputProps } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type Props = TextInputProps & {
  icon: React.ComponentProps<typeof Feather>["name"];
  secure?: boolean;
};

export function PremiumField({ icon, secure, style, ...props }: Props) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: colors.card, borderColor: colors.input },
      ]}
    >
      <Feather name={icon} size={19} color={colors.mutedForeground} />
      <TextInput
        {...props}
        secureTextEntry={secure && !visible}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, { color: colors.foreground }, style]}
      />
      {secure && (
        <Feather
          name={visible ? "eye-off" : "eye"}
          size={19}
          color={colors.mutedForeground}
          onPress={() => setVisible((value) => !value)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: {
    flex: 1,
    height: "100%",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
});
