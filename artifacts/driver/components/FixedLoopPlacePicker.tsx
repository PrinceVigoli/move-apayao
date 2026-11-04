import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export function FixedLoopPlacePicker({
  availableSeats,
  availableStanding,
  seats,
  standing,
  onChange,
  disabled = false,
}: {
  availableSeats: number[];
  availableStanding: number[];
  seats: number[];
  standing: number[];
  onChange: (seats: number[], standing: number[]) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const [type, setType] = useState<"seated" | "standing">("seated");
  const available = type === "seated" ? availableSeats : availableStanding;
  const selected = type === "seated" ? seats : standing;
  const capacity = type === "seated" ? 19 : 10;
  return (
    <View style={{ gap: 16 }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          backgroundColor: colors.muted,
          padding: 4,
          borderRadius: 14,
        }}
      >
        {(["seated", "standing"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: type === value }}
            onPress={() => setType(value)}
            style={{
              flex: 1,
              minHeight: 46,
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 11,
              backgroundColor: type === value ? colors.primary : "transparent",
            }}
          >
            <Text
              style={{
                color:
                  type === value ? colors.primaryForeground : colors.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
              }}
            >
              {value === "seated" ? "Seated" : "Standing"} (
              {value === "seated" ? seats.length : standing.length})
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
        {available.length} of {capacity}{" "}
        {type === "seated" ? "seats" : "standing places"} available for your
        journey
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length: capacity }, (_, i) => i + 1).map((number) => {
          const free = available.includes(number),
            checked = selected.includes(number);
          return (
            <Pressable
              key={`${type}-${number}`}
              accessibilityRole="checkbox"
              accessibilityLabel={`${type === "seated" ? "Seat" : "Standing place"} ${number}${free ? "" : ", unavailable"}`}
              accessibilityState={{ checked, disabled: disabled || !free }}
              disabled={disabled || !free}
              onPress={() => {
                const next = checked
                  ? selected.filter((n) => n !== number)
                  : [...selected, number].sort((a, b) => a - b);
                onChange(
                  type === "seated" ? next : seats,
                  type === "standing" ? next : standing,
                );
              }}
              style={{
                width: "17%",
                minWidth: 44,
                minHeight: 48,
                borderRadius: 12,
                borderWidth: 1,
                alignItems: "center",
                justifyContent: "center",
                borderColor: checked ? colors.primary : colors.border,
                backgroundColor: checked
                  ? colors.primary
                  : free
                    ? colors.card
                    : colors.muted,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: checked
                    ? colors.primaryForeground
                    : free
                      ? colors.foreground
                      : colors.mutedForeground,
                  fontFamily: "Inter_600SemiBold",
                  textDecorationLine: !free ? "line-through" : "none",
                }}
              >
                {type === "seated"
                  ? String(number).padStart(2, "0")
                  : `S${number}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {[
          ["Available", colors.card],
          ["Taken", colors.muted],
          ["Selected", colors.primary],
        ].map(([title, color]) => (
          <View
            key={title}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <View
              style={{
                width: 13,
                height: 13,
                borderRadius: 4,
                backgroundColor: color,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {title}
            </Text>
          </View>
        ))}
      </View>
      <Text
        style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 19 }}
      >
        Places are confirmed when your reservation succeeds. You can select both
        seated and standing places.
      </Text>
    </View>
  );
}
