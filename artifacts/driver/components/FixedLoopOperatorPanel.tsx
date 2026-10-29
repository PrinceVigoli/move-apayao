import { getListFixedLoopOperatorRunsQueryKey, getGetFixedLoopManifestQueryKey, getGetFixedLoopAvailabilityQueryKey } from "@workspace/api-client-react";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bookingRequestId, fixedLoopDirection, formatManilaDay, formatManilaTime, getManilaDate, manilaDatePlus, useCheckInFixedLoopReservation, useControlFixedLoopRun, useGetFixedLoopAvailability, useGetFixedLoopManifest, useListFixedLoopOperatorRuns, useRecordFixedLoopWalkIn, type ControlFixedLoopRunBodyAction, type FixedLoopOperatorService, type FixedLoopReservation } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useDriverStatus } from "@/contexts/DriverStatusContext";
import { Button } from "@/components/ui/Button";
import { FixedLoopPlacePicker } from "./FixedLoopPlacePicker";

export default function FixedLoopOperatorPanel({ service }: { service: FixedLoopOperatorService }) {
  const colors = useColors(), insets = useSafeAreaInsets(), driver = useDriverStatus();
  const [date, setDate] = useState(getManilaDate), [runId, setRunId] = useState<number | null>(null);
  const [dropoff, setDropoff] = useState(1), [seats, setSeats] = useState<number[]>([]), [standing, setStanding] = useState<number[]>([]);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const departures = useListFixedLoopOperatorRuns({ date }, { query: { queryKey: getListFixedLoopOperatorRunsQueryKey({ date }), refetchInterval: 15_000 } });
  const manifest = useGetFixedLoopManifest(runId ?? 0, { query: { queryKey: getGetFixedLoopManifestQueryKey(runId ?? 0), enabled: !!runId, refetchInterval: 5_000 } });
  const run = manifest.data?.run;
  const active = !!run && ["boarding", "on_route"].includes(run.status);
  const availability = useGetFixedLoopAvailability(runId ?? 0, { pickupIndex: run?.currentStopIndex ?? 0, dropoffIndex: dropoff }, { query: { queryKey: getGetFixedLoopAvailabilityQueryKey(runId ?? 0, { pickupIndex: run?.currentStopIndex ?? 0, dropoffIndex: dropoff }), enabled: !!run && active && dropoff > run.currentStopIndex && dropoff < run.stops.length, refetchInterval: 10_000 } });
  const control = useControlFixedLoopRun(), checkIn = useCheckInFixedLoopReservation(), walkIn = useRecordFixedLoopWalkIn();
  const pending = control.isPending || checkIn.isPending || walkIn.isPending;
  useEffect(() => { setSeats([]); setStanding([]); request.current = null; if (run && dropoff <= run.currentStopIndex) setDropoff(run.stops.length - 1); }, [runId, run?.currentStopIndex, dropoff]);
  useEffect(() => {
    if (!availability.data) return;
    const current = availability.data;
    setSeats(prev => { const next = prev.filter(n=>current.availableSeats.includes(n)); return next.length === prev.length ? prev : next; });
    setStanding(prev => { const next = prev.filter(n=>current.availableStanding.includes(n)); return next.length === prev.length ? prev : next; });
  }, [availability.data]);
  const refresh = () => { manifest.refetch(); departures.refetch(); availability.refetch(); };
  const failed = (error: unknown) => { refresh(); Alert.alert("Could not update run", error instanceof Error ? error.message : "Check your connection and retry."); };
  const act = (action: ControlFixedLoopRunBodyAction) => {
    if (!run || pending) return;
    const send = () => control.mutate({ id: run.id, data: { action, expectedStopIndex: run.currentStopIndex, ...(action === "cancel" ? { confirmAlighted: true } : {}) } }, { onSuccess: refresh, onError: failed });
    if (action === "next_stop") Alert.alert("Confirm arrival and alighting?", `Confirm you have arrived at ${run.stops[run.currentStopIndex + 1]?.name} and passengers getting off here have alighted. Their places will be released.`, [{ text: "Not yet", style: "cancel" }, { text: "Confirm", onPress: send }]);
    else if (action === "cancel") Alert.alert("Cancel this departure?", "Confirm all onboard passengers have alighted. All affected reservations will be cancelled and their places released.", [{ text: "Keep run", style: "cancel" }, { text: "Confirm empty and cancel", style: "destructive", onPress: send }]);
    else send();
  };
  const check = (ticket: FixedLoopReservation, action: "board" | "no_show") => {
    const send = () => checkIn.mutate({ id: ticket.id, data: { action } }, { onSuccess: refresh, onError: failed });
    if (action === "no_show") Alert.alert("Confirm no-show?", `Release the places reserved by ${ticket.passengerName || "this passenger"} (${ticket.reference})?`, [{ text: "Keep reservation", style: "cancel" }, { text: "Confirm no-show", style: "destructive", onPress: send }]);
    else send();
  };
  const recordWalkIn = () => {
    if (!run || !active || pending || seats.length + standing.length === 0) return;
    const fingerprint = JSON.stringify({ runId: run.id, pickup: run.currentStopIndex, dropoff, seats, standing });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: bookingRequestId() };
    walkIn.mutate({ id: run.id, data: { dropoffIndex: dropoff, seats, standing, requestId: request.current!.key } }, { onSuccess: () => { setSeats([]); setStanding([]); request.current = null; refresh(); }, onError: failed });
  };
  const tickets = manifest.data?.reservations ?? [];
  const onboard = tickets.filter(ticket=>ticket.status === "boarded");
  const seated = onboard.reduce((total,ticket)=>total+ticket.seats.length,0), standingCount = onboard.reduce((total,ticket)=>total+ticket.standing.length,0);
  const box = { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 } as const;
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 120, gap: 18 }}>
    <Text style={{ color: colors.foreground, fontSize: 25, fontFamily: "Inter_700Bold" }}>Fixed-loop operations</Text>
    <Text style={{ color: colors.primaryStrong, fontFamily: "Inter_600SemiBold" }}>{service.unitLabel}</Text>
    <View style={box}><Text style={{ color: colors.foreground }}>{driver.isOnline ? "GPS sharing is online" : "Go online to share the e-jeep's GPS location"}</Text>
      <Button title={driver.isOnline ? "Go offline" : "Go online"} onPress={() => driver.isOnline ? driver.goOffline() : driver.goOnline()} loading={driver.toggling} disabled={pending || (driver.isOnline && active)} />
      {driver.error && <Text style={{ color: colors.destructive }}>{driver.error}</Text>}
      {!service.enabled && <Text style={{ color: colors.destructive }}>This service has not been enabled by the operator.</Text>}
    </View>
    <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }}>Daily runs</Text>
    <ScrollView horizontal contentContainerStyle={{ gap: 10 }} showsHorizontalScrollIndicator={false}>{Array.from({ length: 7 },(_,i)=>manilaDatePlus(getManilaDate(),i)).map(day=><Pressable key={day} onPress={()=>{ setDate(day); setRunId(null); }} style={{ padding: 12, borderRadius: 10, backgroundColor: day===date ? colors.secondary : colors.card }}><Text style={{ color: colors.foreground }}>{day===getManilaDate()?"Today":formatManilaDay(day)}</Text></Pressable>)}</ScrollView>
    {departures.isLoading ? <ActivityIndicator color={colors.primary} /> : departures.isError ? <Button title="Retry runs" onPress={()=>departures.refetch()} /> : <ScrollView horizontal contentContainerStyle={{ gap: 9 }} showsHorizontalScrollIndicator={false}>{departures.data?.runs.map(item=><Pressable key={item.id} onPress={()=>{ setRunId(item.id); setDropoff(item.stops.length-1); }} style={{ padding: 13, borderWidth: 1, borderColor: item.id===runId?colors.primary:colors.border, borderRadius: 12, backgroundColor: colors.card, width: 178 }}><Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{formatManilaTime(item.departureAt)}</Text><Text style={{ color: colors.mutedForeground, marginTop: 6 }}>{item.direction==="to_asc"?"Pudtol → ASC":"ASC → Pudtol"}</Text><Text style={{ color: colors.primaryStrong, marginTop: 6 }}>{item.status.replace("_"," ")}</Text></Pressable>)}</ScrollView>}
    {runId && manifest.isError && <Button title="Retry manifest" onPress={()=>manifest.refetch()} />}
    {runId && manifest.isLoading && <ActivityIndicator color={colors.primary} />}
    {run && <>
      <View style={box}><Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 19 }}>{formatManilaTime(run.departureAt)} · {fixedLoopDirection(run.direction)}</Text><Text style={{ color: colors.foreground }}>Current stop: {run.stops[run.currentStopIndex]?.name}</Text><Text style={{ color: colors.primaryStrong, fontFamily: "Inter_700Bold" }}>Onboard: {seated}/19 seated · {standingCount}/10 standing</Text><Text style={{ color: colors.mutedForeground }}>Boarding keeps the existing reservation allocation. Walk-ins use the same remaining places.</Text>
        {run.status==="scheduled" && <Button title="Open boarding" disabled={pending || !driver.isOnline || !service.enabled} onPress={()=>act("boarding")} />}
        {run.status==="boarding" && <Button title="Confirm departure" disabled={pending || !driver.isOnline} onPress={()=>act("start")} />}
        {run.status==="on_route" && run.currentStopIndex<run.stops.length-1 && <Button title={`Arrive at ${run.stops[run.currentStopIndex+1]?.name}`} disabled={pending} onPress={()=>act("next_stop")} />}
        {!["completed","cancelled"].includes(run.status) && <Button title="Cancel this run" variant="outline" disabled={pending} onPress={()=>act("cancel")} />}
      </View>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 19 }}>Passenger manifest</Text>
      {!tickets.length && <Text style={{ color: colors.mutedForeground }}>No reservations or walk-ins on this run.</Text>}
      {tickets.map(ticket=><View key={ticket.id} style={box}><Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{ticket.reference} · {ticket.passengerName || "Passenger"}</Text><Text style={{ color: colors.mutedForeground }}>{ticket.pickupName} → {ticket.dropoffName}</Text><Text style={{ color: colors.foreground }}>Seats: {ticket.seats.join(", ") || "None"} · Standing: {ticket.standing.map(n=>`S${n}`).join(", ") || "None"}</Text><Text style={{ color: colors.primaryStrong }}>{ticket.status.replace("_"," ")}</Text>
        {ticket.status==="confirmed" && active && ticket.pickupIndex===run.currentStopIndex && <Button title="Confirm boarded" size="sm" disabled={pending} onPress={()=>check(ticket,"board")} />}
        {ticket.status==="confirmed" && run.status==="on_route" && ticket.pickupIndex<=run.currentStopIndex && <Button title="Mark no-show" variant="outline" size="sm" disabled={pending} onPress={()=>check(ticket,"no_show")} />}
      </View>)}
      {active && run.currentStopIndex<run.stops.length-1 && <View style={box}>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 19 }}>Record walk-ins</Text><Text style={{ color: colors.mutedForeground }}>Boarding at {run.stops[run.currentStopIndex]?.name}. Choose their drop-off and places before boarding.</Text>
        {run.stops.map((stop,index)=>index>run.currentStopIndex&&<Pressable key={stop.key} onPress={()=>setDropoff(index)} disabled={pending} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: index===dropoff?colors.primary:colors.border }}><Text style={{ color: colors.foreground }}>{index===dropoff?"● ":"○ "}{stop.name}</Text></Pressable>)}
        {availability.isLoading ? <ActivityIndicator color={colors.primary} /> : availability.isError || !availability.data ? <Button title="Refresh availability" variant="outline" onPress={()=>availability.refetch()} /> : <FixedLoopPlacePicker availableSeats={availability.data.availableSeats} availableStanding={availability.data.availableStanding} seats={seats} standing={standing} onChange={(a,b)=>{setSeats(a);setStanding(b);}} disabled={pending} />}
        <Button title={`Record ${seats.length+standing.length} walk-in passenger${seats.length+standing.length===1?"":"s"}`} onPress={recordWalkIn} loading={walkIn.isPending} disabled={pending || availability.isError || !availability.data || seats.length+standing.length===0} />
      </View>}
    </>}
  </ScrollView>;
}
