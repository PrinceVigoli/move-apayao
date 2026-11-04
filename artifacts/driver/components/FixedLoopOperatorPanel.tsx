import {
  getListFixedLoopOperatorRunsQueryKey,
  getGetFixedLoopManifestQueryKey,
  getGetFixedLoopAvailabilityQueryKey,
} from "@workspace/api-client-react";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  bookingRequestId,
  fixedLoopDirection,
  formatManilaDay,
  formatManilaTime,
  getManilaDate,
  manilaDatePlus,
  useCheckInFixedLoopReservation,
  useControlFixedLoopRun,
  useGetFixedLoopAvailability,
  useGetFixedLoopManifest,
  useListFixedLoopOperatorRuns,
  useRecordFixedLoopWalkIn,
  useGetProfile,
  type ControlFixedLoopRunBodyAction,
  type FixedLoopOperatorService,
  type FixedLoopReservation,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useDriverStatus } from "@/contexts/DriverStatusContext";
import { Feather } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";
import { FixedLoopPlacePicker } from "./FixedLoopPlacePicker";
import { PassengerPickupMap } from "./PassengerPickupMap";

export default function FixedLoopOperatorPanel({
  service,
}: {
  service: FixedLoopOperatorService;
}) {
  const colors = useColors(),
    insets = useSafeAreaInsets(),
    driver = useDriverStatus();
  const profile = useGetProfile();
  const firstName = profile.data?.user.fullName?.split(" ")[0] || "Driver";
  const [date, setDate] = useState(getManilaDate),
    [runId, setRunId] = useState<number | null>(null);
  const [dropoff, setDropoff] = useState(1),
    [seats, setSeats] = useState<number[]>([]),
    [standing, setStanding] = useState<number[]>([]);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const departures = useListFixedLoopOperatorRuns(
    { date },
    {
      query: {
        queryKey: getListFixedLoopOperatorRunsQueryKey({ date }),
        refetchInterval: 15_000,
      },
    },
  );
  const manifest = useGetFixedLoopManifest(runId ?? 0, {
    query: {
      queryKey: getGetFixedLoopManifestQueryKey(runId ?? 0),
      enabled: !!runId,
      refetchInterval: 5_000,
    },
  });
  const run = manifest.data?.run;
  const active = !!run && ["boarding", "on_route"].includes(run.status);
  const availability = useGetFixedLoopAvailability(
    runId ?? 0,
    { pickupIndex: run?.currentStopIndex ?? 0, dropoffIndex: dropoff },
    {
      query: {
        queryKey: getGetFixedLoopAvailabilityQueryKey(runId ?? 0, {
          pickupIndex: run?.currentStopIndex ?? 0,
          dropoffIndex: dropoff,
        }),
        enabled:
          !!run &&
          active &&
          dropoff > run.currentStopIndex &&
          dropoff < run.stops.length,
        refetchInterval: 10_000,
      },
    },
  );
  const control = useControlFixedLoopRun(),
    checkIn = useCheckInFixedLoopReservation(),
    walkIn = useRecordFixedLoopWalkIn();
  const pending = control.isPending || checkIn.isPending || walkIn.isPending;
  useEffect(() => {
    setSeats([]);
    setStanding([]);
    request.current = null;
    if (run && dropoff <= run.currentStopIndex)
      setDropoff(run.stops.length - 1);
  }, [runId, run?.currentStopIndex, dropoff]);
  useEffect(() => {
    if (!availability.data) return;
    const current = availability.data;
    setSeats((prev) => {
      const next = prev.filter((n) => current.availableSeats.includes(n));
      return next.length === prev.length ? prev : next;
    });
    setStanding((prev) => {
      const next = prev.filter((n) => current.availableStanding.includes(n));
      return next.length === prev.length ? prev : next;
    });
  }, [availability.data]);
  const refresh = () => {
    manifest.refetch();
    departures.refetch();
    availability.refetch();
  };
  const failed = (error: unknown) => {
    refresh();
    Alert.alert(
      "Could not update run",
      error instanceof Error
        ? error.message
        : "Check your connection and retry.",
    );
  };
  const act = (action: ControlFixedLoopRunBodyAction) => {
    if (!run || pending) return;
    const send = () =>
      control.mutate(
        {
          id: run.id,
          data: {
            action,
            expectedStopIndex: run.currentStopIndex,
            ...(action === "cancel" ? { confirmAlighted: true } : {}),
          },
        },
        { onSuccess: refresh, onError: failed },
      );
    if (action === "next_stop")
      Alert.alert(
        "Confirm arrival and alighting?",
        `Confirm you have arrived at ${run.stops[run.currentStopIndex + 1]?.name} and passengers getting off here have alighted. Their places will be released.`,
        [
          { text: "Not yet", style: "cancel" },
          { text: "Confirm", onPress: send },
        ],
      );
    else if (action === "cancel")
      Alert.alert(
        "Cancel this departure?",
        "Confirm all onboard passengers have alighted. All affected reservations will be cancelled and their places released.",
        [
          { text: "Keep run", style: "cancel" },
          {
            text: "Confirm empty and cancel",
            style: "destructive",
            onPress: send,
          },
        ],
      );
    else send();
  };
  const check = (ticket: FixedLoopReservation, action: "board" | "no_show") => {
    const send = () =>
      checkIn.mutate(
        { id: ticket.id, data: { action } },
        { onSuccess: refresh, onError: failed },
      );
    if (action === "no_show")
      Alert.alert(
        "Confirm no-show?",
        `Release the places reserved by ${ticket.passengerName || "this passenger"} (${ticket.reference})?`,
        [
          { text: "Keep reservation", style: "cancel" },
          { text: "Confirm no-show", style: "destructive", onPress: send },
        ],
      );
    else send();
  };
  const recordWalkIn = () => {
    if (!run || !active || pending || seats.length + standing.length === 0)
      return;
    const fingerprint = JSON.stringify({
      runId: run.id,
      pickup: run.currentStopIndex,
      dropoff,
      seats,
      standing,
    });
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, key: bookingRequestId() };
    walkIn.mutate(
      {
        id: run.id,
        data: {
          dropoffIndex: dropoff,
          seats,
          standing,
          requestId: request.current!.key,
        },
      },
      {
        onSuccess: () => {
          setSeats([]);
          setStanding([]);
          request.current = null;
          refresh();
        },
        onError: failed,
      },
    );
  };
  const tickets = manifest.data?.reservations ?? [];
  const onboard = tickets.filter((ticket) => ticket.status === "boarded");
  const seated = onboard.reduce(
      (total, ticket) => total + ticket.seats.length,
      0,
    ),
    standingCount = onboard.reduce(
      (total, ticket) => total + ticket.standing.length,
      0,
    );
  // Prefer an active run, then the next scheduled departure. Never mutate a run by selection.
  useEffect(() => {
    if (runId || !departures.data?.runs.length) return;
    const runs = departures.data.runs;
    const next =
      runs.find((item) => ["boarding", "on_route"].includes(item.status)) ??
      runs.find(
        (item) =>
          item.status === "scheduled" &&
          new Date(item.departureAt).getTime() >= Date.now(),
      ) ??
      runs.find((item) => item.status === "scheduled") ??
      runs[0];
    setRunId(next.id);
  }, [runId, departures.data]);
  const box = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  } as const;
  const title = (text: string) => (
    <Text
      style={{
        color: colors.foreground,
        fontFamily: "Inter_700Bold",
        fontSize: 21,
      }}
    >
      {text}
    </Text>
  );
  const statusText = (status: string) =>
    status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 120,
        gap: 22,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          style={{
            color: colors.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 24,
          }}
        >
          MOVE <Text style={{ fontFamily: "Inter_400Regular" }}>Driver</Text>
        </Text>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.accent,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: colors.accentForeground,
              fontFamily: "Inter_700Bold",
              fontSize: 19,
            }}
          >
            {firstName[0]?.toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Text
          style={{
            color: colors.foreground,
            fontFamily: "Inter_500Medium",
            fontSize: 16,
          }}
        >
          Hello, {firstName}
        </Text>
        <Text
          style={{
            color: colors.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 31,
            lineHeight: 37,
            letterSpacing: -0.8,
          }}
        >
          {run?.status === "boarding"
            ? "Let's get everyone onboard."
            : run?.status === "on_route"
              ? "A good journey ahead."
              : "Ready for your next run?"}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            flex: 1,
            minWidth: 150,
          }}
        >
          <Feather
            name={driver.isOnline ? "navigation" : "map-pin"}
            size={17}
            color={driver.isOnline ? colors.accent : colors.mutedForeground}
          />
          <Text
            style={{
              color: driver.isOnline ? colors.accent : colors.mutedForeground,
              fontFamily: "Inter_600SemiBold",
              fontSize: 13,
            }}
          >
            {driver.isOnline ? "GPS sharing on" : "GPS sharing off"}
          </Text>
        </View>
        <Button
          title={driver.isOnline ? "Go offline" : "Go online"}
          variant="outline"
          size="sm"
          onPress={() =>
            driver.isOnline ? driver.goOffline() : driver.goOnline()
          }
          loading={driver.toggling}
          disabled={pending || (driver.isOnline && active)}
        />
      </View>
      {driver.error && (
        <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
          {driver.error}
        </Text>
      )}
      {!service.enabled && (
        <Text style={{ color: colors.warning }}>
          This service has not been enabled by the operator.
        </Text>
      )}
      {runId && manifest.isError && (
        <View style={box}>
          <Text style={{ color: colors.foreground }}>
            Could not load this run.
          </Text>
          <Button
            title="Retry manifest"
            variant="outline"
            onPress={() => manifest.refetch()}
          />
        </View>
      )}
      {runId && manifest.isLoading && (
        <ActivityIndicator color={colors.accent} />
      )}
      {run && (
        <View
          style={{
            ...box,
            backgroundColor: colors.secondary,
            borderColor: colors.primary,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text
              style={{
                color: colors.secondaryForeground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 12,
                letterSpacing: 1,
                flex: 1,
              }}
            >
              {run.status === "scheduled"
                ? "YOUR DEPARTURE"
                : statusText(run.status).toUpperCase()}
            </Text>
            <Feather name="truck" size={25} color={colors.accent} />
          </View>
          <Text
            style={{
              color: colors.foreground,
              fontFamily: "Inter_700Bold",
              fontSize: 36,
            }}
          >
            {formatManilaTime(run.departureAt)}
          </Text>
          <Text
            style={{
              color: colors.foreground,
              fontFamily: "Inter_700Bold",
              fontSize: 22,
            }}
          >
            {fixedLoopDirection(run.direction)}
          </Text>
          <Text style={{ color: colors.secondaryForeground, fontSize: 13 }}>
            {run.direction === "to_asc"
              ? "Via Payanan Road"
              : "Via national highway"}{" "}
            · {service.unitLabel}
          </Text>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 16,
              flexDirection: "row",
              gap: 12,
            }}
          >
            {[
              { value: `${seated} / 19`, label: "Seated onboard" },
              { value: `${standingCount} / 10`, label: "Standing onboard" },
            ].map((metric) => (
              <View key={metric.label} style={{ flex: 1, gap: 5 }}>
                <Text
                  style={{
                    color: colors.foreground,
                    fontFamily: "Inter_700Bold",
                    fontSize: 27,
                  }}
                >
                  {metric.value}
                </Text>
                <Text
                  style={{ color: colors.secondaryForeground, fontSize: 12 }}
                >
                  {metric.label}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="map-pin" size={17} color={colors.accent} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.secondaryForeground, fontSize: 12 }}>
                Current stop
              </Text>
              <Text
                style={{
                  color: colors.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 16,
                }}
              >
                {run.stops[run.currentStopIndex]?.name}
              </Text>
            </View>
          </View>
          {run.status === "scheduled" && (
            <Button
              title="Open boarding"
              size="lg"
              disabled={pending || !driver.isOnline || !service.enabled}
              onPress={() => act("boarding")}
            />
          )}
          {run.status === "boarding" && (
            <Button
              title="Confirm departure"
              size="lg"
              disabled={pending || !driver.isOnline}
              onPress={() => act("start")}
            />
          )}
          {run.status === "on_route" &&
            run.currentStopIndex < run.stops.length - 1 && (
              <>
                <Text
                  style={{
                    color: colors.secondaryForeground,
                    fontSize: 14,
                    lineHeight: 21,
                  }}
                >
                  Next: {run.stops[run.currentStopIndex + 1]?.name}
                </Text>
                <Button
                  title="Confirm arrival & alighting"
                  size="lg"
                  disabled={pending}
                  onPress={() => act("next_stop")}
                />
              </>
            )}
          {run.status === "scheduled" && !driver.isOnline && (
            <Text style={{ color: colors.warning, fontSize: 13 }}>
              Go online to open boarding and share the vehicle location.
            </Text>
          )}
        </View>
      )}
      <View style={{ gap: 14 }}>
        {title("Daily runs")}
        <ScrollView
          horizontal
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          showsHorizontalScrollIndicator={false}
        >
          {Array.from({ length: 7 }, (_, i) =>
            manilaDatePlus(getManilaDate(), i),
          ).map((day) => (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityState={{ selected: day === date }}
              onPress={() => {
                setDate(day);
                setRunId(null);
              }}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 16,
                borderRadius: 12,
                backgroundColor: day === date ? colors.accent : colors.card,
              }}
            >
              <Text
                style={{
                  color:
                    day === date ? colors.accentForeground : colors.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                {day === getManilaDate() ? "Today" : formatManilaDay(day)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {departures.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : departures.isError ? (
          <Button
            title="Retry runs"
            variant="outline"
            onPress={() => departures.refetch()}
          />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
          >
            {departures.data?.runs.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === runId }}
                onPress={() => {
                  setRunId(item.id);
                  setDropoff(item.stops.length - 1);
                }}
                style={{
                  padding: 16,
                  borderWidth: 1,
                  borderColor:
                    item.id === runId ? colors.accent : colors.border,
                  borderRadius: 16,
                  backgroundColor: colors.card,
                  width: 186,
                  gap: 8,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
                >
                  <Feather name="clock" size={16} color={colors.accent} />
                  <Text
                    style={{
                      color: colors.foreground,
                      fontFamily: "Inter_700Bold",
                      fontSize: 18,
                    }}
                  >
                    {formatManilaTime(item.departureAt)}
                  </Text>
                </View>
                <Text style={{ color: colors.foreground, fontSize: 13 }}>
                  {item.direction === "to_asc"
                    ? "Pudtol → ASC"
                    : "ASC → Pudtol"}
                </Text>
                <Text style={{ color: colors.accent, fontSize: 12 }}>
                  {statusText(item.status)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {!departures.isLoading &&
          !departures.isError &&
          !departures.data?.runs.length && (
            <Text style={{ color: colors.mutedForeground }}>
              No runs scheduled for this date.
            </Text>
          )}
      </View>
      {run && (
        <>
          <View style={{ gap: 14 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              {title("Passenger manifest")}
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                {tickets.length} bookings
              </Text>
            </View>
            <PassengerPickupMap key={run.id} run={run} />
            {!tickets.length && (
              <View style={box}>
                <Feather
                  name="users"
                  size={26}
                  color={colors.mutedForeground}
                />
                <Text
                  style={{
                    color: colors.foreground,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  A fresh start for this run
                </Text>
                <Text style={{ color: colors.mutedForeground, lineHeight: 21 }}>
                  Reservations and recorded walk-ins will appear here.
                </Text>
              </View>
            )}
            {tickets.map((ticket) => (
              <View key={ticket.id} style={box}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.secondary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name="user" size={21} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      style={{
                        color: colors.foreground,
                        fontFamily: "Inter_700Bold",
                        fontSize: 16,
                      }}
                    >
                      {ticket.passengerName || "Passenger"}
                    </Text>
                    <Text
                      style={{
                        color:
                          ticket.status === "boarded"
                            ? colors.success
                            : colors.mutedForeground,
                        fontSize: 12,
                      }}
                    >
                      {statusText(ticket.status)} · {ticket.reference}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 13,
                    lineHeight: 20,
                  }}
                >
                  {ticket.pickupName} → {ticket.dropoffName}
                </Text>
                <Text style={{ color: colors.foreground, fontSize: 14 }}>
                  Seats {ticket.seats.join(", ") || "—"} · Standing{" "}
                  {ticket.standing.map((n) => `S${n}`).join(", ") || "—"}
                </Text>
                {ticket.status === "confirmed" &&
                  active &&
                  ticket.pickupIndex === run.currentStopIndex && (
                    <Button
                      title="Confirm boarded"
                      size="sm"
                      disabled={pending}
                      onPress={() => check(ticket, "board")}
                    />
                  )}
                {ticket.status === "confirmed" &&
                  run.status === "on_route" &&
                  ticket.pickupIndex <= run.currentStopIndex && (
                    <Button
                      title="Mark no-show"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onPress={() => check(ticket, "no_show")}
                    />
                  )}
              </View>
            ))}
          </View>
          {active && run.currentStopIndex < run.stops.length - 1 && (
            <View style={box}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Feather name="user-plus" size={22} color={colors.accent} />
                {title("Record walk-ins")}
              </View>
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontSize: 13,
                  lineHeight: 21,
                }}
              >
                Boarding at {run.stops[run.currentStopIndex]?.name}. Choose
                their drop-off and places.
              </Text>
              {run.stops.map(
                (stop, index) =>
                  index > run.currentStopIndex && (
                    <Pressable
                      key={stop.key}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: index === dropoff,
                        disabled: pending,
                      }}
                      onPress={() => setDropoff(index)}
                      disabled={pending}
                      style={{
                        minHeight: 48,
                        padding: 13,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor:
                          index === dropoff ? colors.accent : colors.border,
                        flexDirection: "row",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <Feather
                        name={index === dropoff ? "check-circle" : "circle"}
                        size={18}
                        color={
                          index === dropoff
                            ? colors.accent
                            : colors.mutedForeground
                        }
                      />
                      <Text
                        style={{
                          color: colors.foreground,
                          flex: 1,
                          lineHeight: 21,
                        }}
                      >
                        {stop.name}
                      </Text>
                    </Pressable>
                  ),
              )}
              {availability.isLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : availability.isError || !availability.data ? (
                <Button
                  title="Refresh availability"
                  variant="outline"
                  onPress={() => availability.refetch()}
                />
              ) : (
                <FixedLoopPlacePicker
                  availableSeats={availability.data.availableSeats}
                  availableStanding={availability.data.availableStanding}
                  seats={seats}
                  standing={standing}
                  onChange={(a, b) => {
                    setSeats(a);
                    setStanding(b);
                  }}
                  disabled={pending}
                />
              )}
              <Button
                title={`Record ${seats.length + standing.length} walk-in passenger${seats.length + standing.length === 1 ? "" : "s"}`}
                onPress={recordWalkIn}
                loading={walkIn.isPending}
                disabled={
                  pending ||
                  availability.isError ||
                  !availability.data ||
                  seats.length + standing.length === 0
                }
              />
            </View>
          )}
          {!["completed", "cancelled"].includes(run.status) && (
            <Button
              title="Cancel this run"
              variant="ghost"
              disabled={pending}
              onPress={() => act("cancel")}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}
