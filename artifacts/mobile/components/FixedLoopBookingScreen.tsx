import { getGetFixedLoopServiceQueryKey, getListFixedLoopRunsQueryKey, getGetFixedLoopAvailabilityQueryKey } from "@workspace/api-client-react";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { bookingRequestId, fixedLoopDirection, formatManilaDay, formatManilaTime, getListMyFixedLoopReservationsQueryKey, getManilaDate, manilaDatePlus, useCreateFixedLoopReservation, useGetFixedLoopAvailability, useGetFixedLoopService, useListFixedLoopRuns, type FixedLoopRun, type FixedLoopStop } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";
import { FixedLoopPlacePicker } from "./FixedLoopPlacePicker";
import { FixedLoopVehicleCard } from "./FixedLoopVehicleCard";

export default function FixedLoopBookingScreen() {
  const colors = useColors(), insets = useSafeAreaInsets(), router = useRouter(), client = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const [today, setToday] = useState(getManilaDate);
  const [date, setDate] = useState(() => {
    const now = new Date(Date.now() + 8 * 60 * 60_000);
    return now.getUTCHours() * 60 + now.getUTCMinutes() >= 1110 ? manilaDatePlus(getManilaDate(), 1) : getManilaDate();
  });
  const [direction, setDirection] = useState<"to_asc" | "to_pudtol">("to_asc");
  const [runId, setRunId] = useState<number | null>(null);
  const [pickupIndex, setPickupIndex] = useState(0), [dropoffIndex, setDropoffIndex] = useState(1);
  const [seats, setSeats] = useState<number[]>([]), [standing, setStanding] = useState<number[]>([]);
  const [stopModal, setStopModal] = useState<"pickup" | "dropoff" | null>(null);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const fleet = useGetFixedLoopService({ query: { queryKey: getGetFixedLoopServiceQueryKey(), refetchInterval: 10_000 } });
  const departures = useListFixedLoopRuns({ date }, { query: { queryKey: getListFixedLoopRunsQueryKey({ date }), enabled: !!fleet.data?.service, refetchInterval: 20_000 } });
  const selectedRun = departures.data?.runs.find(run => run.id === runId);
  const availability = useGetFixedLoopAvailability(runId ?? 0, { pickupIndex, dropoffIndex }, { query: { queryKey: getGetFixedLoopAvailabilityQueryKey(runId ?? 0, { pickupIndex, dropoffIndex }), enabled: !!runId && !!selectedRun && dropoffIndex > pickupIndex, refetchInterval: 10_000 } });
  const create = useCreateFixedLoopReservation();
  const run = availability.data?.run ?? selectedRun;
  const candidates = (departures.data?.runs ?? []).filter(item => item.direction === direction);
  const next = candidates.find(item => item.bookingOpen);
  useEffect(() => { const timer = setInterval(() => setToday(getManilaDate()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (date < today) { setDate(today); setRunId(null); } }, [today, date]);
  useEffect(() => {
    if (!availability.data) return;
    const current = availability.data;
    setSeats(previous => { const valid = previous.filter(n => current.availableSeats.includes(n)); return valid.length === previous.length ? previous : valid; });
    setStanding(previous => { const valid = previous.filter(n => current.availableStanding.includes(n)); return valid.length === previous.length ? previous : valid; });
  }, [availability.data]);
  const chooseRun = (value: FixedLoopRun) => { setRunId(value.id); setPickupIndex(0); setDropoffIndex(value.stops.length - 1); setSeats([]); setStanding([]); request.current = null; scroll.current?.scrollTo({ y: 0, animated: true }); };
  const reserve = () => {
    if (!run || !run.bookingOpen || create.isPending || seats.length + standing.length === 0) return;
    const fingerprint = JSON.stringify({ runId: run.id, pickupIndex, dropoffIndex, seats, standing });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: bookingRequestId() };
    create.mutate({ data: { runId: run.id, pickupIndex, dropoffIndex, seats, standing, requestId: request.current!.key } }, {
      onSuccess: ({ reservation }) => {
        client.invalidateQueries({ queryKey: getListMyFixedLoopReservationsQueryKey() });
        availability.refetch();
        request.current = null;
        router.push(`/reservation/${reservation.id}` as never);
      },
      onError: error => {
        availability.refetch();
        client.invalidateQueries({ queryKey: getListMyFixedLoopReservationsQueryKey() });
        Alert.alert("Could not confirm reservation", error instanceof Error ? error.message : "Check your connection and your reservations before trying again.", [{ text: "OK" }, { text: "My reservations", onPress: () => router.push("/reservations" as never) }]);
      },
    });
  };
  const label = (text: string) => <Text style={{ fontFamily: "Inter_700Bold", color: colors.foreground, fontSize: 17, marginTop: 24, marginBottom: 12 }}>{text}</Text>;
  const choice = (text: string, selected: boolean, onPress: () => void, disabled = false) => <Pressable key={text} accessibilityRole="button" accessibilityState={{ selected, disabled }} onPress={onPress} disabled={disabled}
    style={{ borderRadius: 12, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.card, padding: 13, opacity: disabled ? 0.45 : 1 }}>
    <Text style={{ color: selected ? colors.primaryStrong : colors.foreground, fontFamily: "Inter_600SemiBold", lineHeight: 21 }}>{text}</Text>
  </Pressable>;
  const changeStop = (index: number) => {
    if (stopModal === "pickup") { setPickupIndex(index); if (dropoffIndex <= index) setDropoffIndex((run?.stops.length ?? 2) - 1); }
    else setDropoffIndex(index);
    setSeats([]); setStanding([]); setStopModal(null); request.current = null;
  };
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView ref={scroll} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 120 }}>
      <Text style={{ color: colors.foreground, fontSize: 25, fontFamily: "Inter_700Bold", marginBottom: 8 }}>Book the e-jeep</Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 22, marginBottom: 18 }}>Pudtol–Luna fixed loop · choose your departure and places.</Text>
      {fleet.isLoading ? <ActivityIndicator color={colors.primary} /> : !fleet.data?.service || fleet.isError ? <View style={{ gap: 16 }}><Text style={{ color: colors.mutedForeground }}>{fleet.isError ? "Could not find the fixed-loop vehicle. Check your connection." : "The operator is preparing this service."}</Text><Button title="Search again" variant="outline" onPress={() => fleet.refetch()} /></View> : <>
        <FixedLoopVehicleCard service={fleet.data.service} map={!runId} />
        {!runId ? <>
          {label("1. Choose direction")}
          <View style={{ gap: 10 }}>{choice("Pudtol → ASC · via Payanan Road", direction === "to_asc", () => setDirection("to_asc"))}{choice("ASC → Pudtol · via national highway", direction === "to_pudtol", () => setDirection("to_pudtol"))}</View>
          {label("2. When would you like to ride?")}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {Array.from({ length: fleet.data.service.bookingDays }, (_, i) => manilaDatePlus(today, i)).map(day => choice(day === today ? "Today" : day === manilaDatePlus(today, 1) ? "Tomorrow" : formatManilaDay(day), day === date, () => setDate(day)))}
          </ScrollView>
          <Text style={{ color: colors.mutedForeground, marginVertical: 12 }}>{formatManilaDay(date)} · Philippine time</Text>
          {departures.isLoading ? <ActivityIndicator color={colors.primary} /> : departures.isError ? <Button title="Retry departures" variant="outline" onPress={() => departures.refetch()} /> : <>
            {next && <Button title={`Next departure · ${formatManilaTime(next.departureAt)}`} onPress={() => chooseRun(next)} />}
            <Text style={{ color: colors.mutedForeground, marginTop: 18, marginBottom: 12 }}>Or choose a specific departure time:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>{candidates.map(item => choice(`${formatManilaTime(item.departureAt)}${item.bookingOpen ? "" : " · Closed"}`, false, () => chooseRun(item), !item.bookingOpen))}</View>
            {!next && <Text style={{ color: colors.mutedForeground, lineHeight: 22, marginTop: 12 }}>No more bookable departures in this direction on this date. Choose another day.</Text>}
          </>}
        </> : run ? <>
          <View style={{ marginTop: 20, gap: 10 }}><Text style={{ color: colors.primaryStrong, fontFamily: "Inter_700Bold", fontSize: 18 }}>{formatManilaDay(run.serviceDate)} · {formatManilaTime(run.departureAt)}</Text><Text style={{ color: colors.foreground }}>{fixedLoopDirection(run.direction)}</Text><Button title="Change departure" variant="outline" size="sm" onPress={() => { setRunId(null); setSeats([]); setStanding([]); }} /></View>
          {label("3. Choose pickup and drop-off")}
          <View style={{ gap: 10 }}>{choice(`Pickup · ${run.stops[pickupIndex]?.name ?? "Choose a stop"}`, false, () => setStopModal("pickup"), create.isPending)}{choice(`Drop-off · ${run.stops[dropoffIndex]?.name ?? "Choose a stop"}`, false, () => setStopModal("dropoff"), create.isPending)}</View>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 19, marginTop: 12 }}>Times are departures from {run.stops[0]?.name}. For intermediate stops, follow the e-jeep's live location for pickup.</Text>
          {label("4. Choose your places")}
          {availability.isLoading ? <ActivityIndicator color={colors.primary} /> : availability.isError || !availability.data ? <View style={{ gap: 12 }}><Text style={{ color: colors.destructive }}>Availability could not be confirmed.</Text><Button title="Refresh availability" variant="outline" onPress={() => availability.refetch()} /></View> : <FixedLoopPlacePicker availableSeats={availability.data.availableSeats} availableStanding={availability.data.availableStanding} seats={seats} standing={standing} disabled={create.isPending || !run.bookingOpen} onChange={(a,b) => { setSeats(a); setStanding(b); }} />}
          <View style={{ marginTop: 24, gap: 12 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{seats.length} seat{seats.length === 1 ? "" : "s"} + {standing.length} standing place{standing.length === 1 ? "" : "s"} selected</Text>
            {!run.bookingOpen && <Text style={{ color: colors.destructive }}>Reservations for this run have closed. Choose another departure.</Text>}
            <Button title="Confirm reservation" onPress={reserve} loading={create.isPending} disabled={!run.bookingOpen || availability.isError || !availability.data || seats.length + standing.length === 0} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>The operator confirms the fare. No online payment is collected here.</Text>
          </View>
        </> : <ActivityIndicator color={colors.primary} />}
      </>}
    </ScrollView>
    <Modal visible={!!stopModal} transparent animationType="slide" onRequestClose={() => setStopModal(null)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}><View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: insets.bottom + 24, maxHeight: "80%" }}>
        <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 18 }}>Choose {stopModal === "pickup" ? "pickup" : "drop-off"} stop</Text>
        <ScrollView contentContainerStyle={{ gap: 10 }}>{run?.stops.map((stop: FixedLoopStop, index: number) => choice(stop.name, index === (stopModal === "pickup" ? pickupIndex : dropoffIndex), () => changeStop(index), stopModal === "pickup" ? index === run.stops.length - 1 : index <= pickupIndex))}</ScrollView>
        <View style={{ marginTop: 16 }}><Button title="Close" variant="outline" onPress={() => setStopModal(null)} /></View>
      </View></View>
    </Modal>
  </View>;
}
