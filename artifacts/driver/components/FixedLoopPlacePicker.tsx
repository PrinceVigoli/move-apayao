import React from "react";
import { Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export function FixedLoopPlacePicker({ availableSeats, availableStanding, seats, standing, onChange, disabled = false }: {
  availableSeats: number[]; availableStanding: number[]; seats: number[]; standing: number[];
  onChange: (seats: number[], standing: number[]) => void; disabled?: boolean;
}) {
  const colors = useColors();
  const group = (type: "seated" | "standing", capacity: number, available: number[], selected: number[]) => <View style={{ gap: 12, marginBottom: 24 }}>
    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: colors.foreground }}>{type === "seated" ? "Seats" : "Standing places"} · {available.length}/{capacity} available</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
      {Array.from({ length: capacity }, (_, i) => i + 1).map(number => {
        const free = available.includes(number), checked = selected.includes(number);
        return <Pressable key={number} accessibilityRole="checkbox" accessibilityLabel={`${type === "seated" ? "Seat" : "Standing place"} ${number}${free ? "" : ", unavailable"}`} accessibilityState={{ checked, disabled: disabled || !free }} disabled={disabled || !free}
          onPress={() => {
            const next = checked ? selected.filter(n=>n!==number) : [...selected, number].sort((a,b)=>a-b);
            onChange(type === "seated" ? next : seats, type === "standing" ? next : standing);
          }}
          style={{ width: 52, height: 48, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", borderColor: free ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : free ? colors.card : colors.muted, opacity: free ? 1 : 0.5 }}>
          <Text style={{ color: checked ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_600SemiBold" }}>{type === "seated" ? number : `S${number}`}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
  return <View>{group("seated", 19, availableSeats, seats)}{group("standing", 10, availableStanding, standing)}<Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 19 }}>Choose numbered seats or standing places. Grey places are unavailable for this journey. Places are confirmed when your reservation succeeds.</Text></View>;
}
