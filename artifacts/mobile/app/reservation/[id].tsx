import { getGetFixedLoopReservationQueryKey } from "@workspace/api-client-react";
import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { fixedLoopDirection, formatManilaDay, formatManilaTime, getListMyFixedLoopReservationsQueryKey, useCancelFixedLoopReservation, useGetFixedLoopReservation } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";
export default function ReservationScreen() {
  const colors = useColors(), insets = useSafeAreaInsets(), router = useRouter(), client = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>(), id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const query = useGetFixedLoopReservation(id, { query: { queryKey: getGetFixedLoopReservationQueryKey(id), enabled: valid, refetchInterval: 10_000 } });
  const cancel = useCancelFixedLoopReservation();
  const ticket = query.data?.reservation;
  const confirmCancel = () => Alert.alert("Cancel reservation?", "Your selected places will be released for other passengers.", [
    { text: "Keep reservation", style: "cancel" },
    { text: "Cancel reservation", style: "destructive", onPress: () => cancel.mutate({ id }, {
      onSuccess: () => { query.refetch(); client.invalidateQueries({ queryKey: getListMyFixedLoopReservationsQueryKey() }); },
      onError: error => Alert.alert("Could not cancel", error instanceof Error ? error.message : "Check your connection and try again."),
    }) },
  ]);
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ paddingTop: insets.top + 12, padding: 18, flexDirection: "row", gap: 14, alignItems: "center" }}><Pressable accessibilityLabel="Back" onPress={() => router.back()}><Feather name="arrow-left" size={24} color={colors.foreground} /></Pressable><Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 23 }}>Your reservation</Text></View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 16 }}>
      {query.isLoading ? <ActivityIndicator color={colors.primary} /> : !valid || query.isError || !ticket ? <View style={{ gap: 14 }}><Text style={{ color: colors.mutedForeground }}>This reservation could not be loaded.</Text><Button title="Retry" variant="outline" onPress={() => query.refetch()} /></View> : <>
        <View style={{ backgroundColor: colors.card, borderRadius: 18, padding: 22, gap: 14, borderWidth: 1, borderColor: colors.border }}>
          <Text selectable style={{ color: colors.primaryStrong, fontFamily: "Inter_700Bold", fontSize: 25 }}>{ticket.reference}</Text>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{ticket.status.replace("_", " ")}</Text>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 20 }}>{formatManilaDay(ticket.run.serviceDate)} · {formatManilaTime(ticket.run.departureAt)}</Text>
          <Text style={{ color: colors.mutedForeground }}>{fixedLoopDirection(ticket.run.direction)}</Text>
          <Text style={{ color: colors.foreground, lineHeight: 23 }}>Pickup: {ticket.pickupName}{"\n"}Drop-off: {ticket.dropoffName}</Text>
          <Text style={{ color: colors.foreground }}>Seats: {ticket.seats.length ? ticket.seats.join(", ") : "None"}</Text>
          <Text style={{ color: colors.foreground }}>Standing places: {ticket.standing.length ? ticket.standing.map(n=>`S${n}`).join(", ") : "None"}</Text>
          <Text style={{ color: colors.mutedForeground }}>{ticket.run.unitLabel}</Text>
        </View>
        {["confirmed", "boarded"].includes(ticket.status) && <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>Show this reference to the driver for check-in. The time shown is departure from {ticket.run.stops[0]?.name}; follow the vehicle location for pickup at your selected stop.</Text>}
        {ticket.status === "confirmed" && ticket.run.bookingOpen && <Button title="Cancel reservation" variant="outline" loading={cancel.isPending} onPress={confirmCancel} />}
        <Button title="Track the e-jeep" onPress={() => router.push("/(tabs)" as never)} />
        <Button title="My reservations" variant="outline" onPress={() => router.push("/reservations" as never)} />
      </>}
    </ScrollView>
  </View>;
}
