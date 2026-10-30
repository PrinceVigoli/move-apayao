import { getListMyFixedLoopReservationsQueryKey } from "@workspace/api-client-react";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { fixedLoopDirection, formatManilaDay, formatManilaTime, useListMyFixedLoopReservations } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";
export default function ReservationsScreen() {
  const colors = useColors(), insets = useSafeAreaInsets(), router = useRouter();
  const [offset, setOffset] = useState(0);
  const query = useListMyFixedLoopReservations({ limit: 20, offset }, { query: { queryKey: getListMyFixedLoopReservationsQueryKey({ limit: 20, offset }), refetchInterval: 10_000 } });
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ paddingTop: insets.top + 12, padding: 18, flexDirection: "row", alignItems: "center", gap: 16 }}><Pressable accessibilityLabel="Back" onPress={() => router.back()}><Feather name="arrow-left" size={24} color={colors.foreground} /></Pressable><Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 23 }}>My reservations</Text></View>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 28, gap: 14 }}>
      {query.isLoading ? <ActivityIndicator color={colors.primary} /> : query.isError ? <View style={{ gap: 16 }}><Text style={{ color: colors.mutedForeground }}>Could not load reservations. Check your connection.</Text><Button title="Retry" onPress={() => query.refetch()} /></View> : !query.data?.reservations.length ? <Text style={{ color: colors.mutedForeground }}>No reservations on this page.</Text> : query.data.reservations.map(ticket => <Pressable key={ticket.id} onPress={() => router.push(`/reservation/${ticket.id}` as never)} style={{ backgroundColor: colors.card, borderRadius: 16, padding: 18, borderColor: colors.border, borderWidth: 1, gap: 8 }}>
        <Text style={{ color: colors.primaryStrong, fontFamily: "Inter_700Bold" }}>{ticket.reference} · {ticket.status.replace("_", " ")}</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }}>{formatManilaDay(ticket.run.serviceDate)} · {formatManilaTime(ticket.run.departureAt)}</Text>
        <Text style={{ color: colors.mutedForeground }}>{fixedLoopDirection(ticket.run.direction)}</Text>
        <Text style={{ color: colors.foreground }}>{ticket.pickupName} → {ticket.dropoffName}</Text>
        <Text style={{ color: colors.mutedForeground }}>{ticket.seats.length} seated · {ticket.standing.length} standing</Text>
      </Pressable>)}
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}><Button title="Previous" variant="outline" disabled={offset === 0 || query.isLoading} onPress={() => setOffset(value=>Math.max(0,value-20))} /><Button title="Next" variant="outline" disabled={query.isError || query.isLoading || (query.data?.reservations.length ?? 0) < 20} onPress={() => setOffset(value=>value+20)} /></View>
    </ScrollView>
  </View>;
}
