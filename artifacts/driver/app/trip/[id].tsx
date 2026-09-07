import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  Linking,
  Platform,
  TextInput,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RouteMap } from "@/components/RouteMap";
import { Feather } from "@expo/vector-icons";
import {
  useGetTrip,
  useAcceptTrip,
  useDeclineTrip,
  useCompleteTrip,
  useArriveTrip,
  useStartTrip,
  useRateTrip,
  getGetTripQueryKey,
  getListTripsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDriverStatus } from "@/contexts/DriverStatusContext";
import * as Haptics from "expo-haptics";

function navigateTo(lat: number, lon: number, label: string) {
  const q = encodeURIComponent(label);
  const url = Platform.select({
    ios: `maps://?daddr=${lat},${lon}&q=${q}`,
    android: `google.navigation:q=${lat},${lon}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`,
  });
  Linking.openURL(url as string).catch(() =>
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`,
    ),
  );
}

const PASSENGER_RATING_TAGS = ["Ready at pickup", "Polite", "Clear directions", "Late pickup", "Unsafe behavior"];

export default function DriverTripScreen() {
  const { id } = useLocalSearchParams();
  const tripId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { location } = useDriverStatus();

  const { data, isLoading } = useGetTrip(tripId, {
    query: {
      queryKey: getGetTripQueryKey(tripId),
      enabled: !!tripId,
      // Poll while the trip is live so a passenger cancelling mid-ride shows
      // up on the driver's screen within seconds.
      refetchInterval: (query) => {
        const s = query.state.data?.trip?.status;
        return ["matched", "accepted", "arrived", "in_progress"].includes(s ?? "")
          ? 5000
          : false;
      },
    },
  });
  const trip = data?.trip;

  const acceptTrip = useAcceptTrip();
  const declineTrip = useDeclineTrip();
  const completeTrip = useCompleteTrip();
  const arriveTrip = useArriveTrip();
  const startTrip = useStartTrip();
  const rateTrip = useRateTrip();
  const [pickupCode, setPickupCode] = useState("");
  const [rateVisible, setRateVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingTags, setRatingTags] = useState<string[]>([]);
  const [offerSeconds, setOfferSeconds] = useState(0);

  useEffect(() => {
    const expiresAt = trip?.offerExpiresAt
      ? new Date(trip.offerExpiresAt).getTime()
      : trip?.matchedAt
        ? new Date(trip.matchedAt).getTime() + 30_000
        : 0;
    if (trip?.status !== "matched" || !expiresAt) {
      setOfferSeconds(0);
      return;
    }
    const update = () => {
      setOfferSeconds(
        Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [trip?.status, trip?.offerExpiresAt, trip?.matchedAt]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
    queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
  };

  const onAccept = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    acceptTrip.mutate(
      { id: tripId },
      {
        onSuccess: () => invalidate(),
        onError: (e: any) =>
          Alert.alert(
            "Could not accept",
            e?.response?.data?.error ?? "Trip no longer available.",
          ),
      },
    );
  };

  const onDecline = () => {
    const decline = (reason: "too_far" | "vehicle_issue" | "other") =>
      declineTrip.mutate(
        { id: tripId, data: { reason } },
        {
          onSuccess: () => {
            invalidate();
            router.back();
          },
          onError: (e: any) =>
            Alert.alert(
              "Could not decline",
              e?.response?.data?.error ?? "Try again.",
            ),
        },
      );
    Alert.alert(
      "Why are you declining?",
      "The ride will be offered to another driver.",
      [
        { text: "Too far", onPress: () => decline("too_far") },
        { text: "Vehicle issue", onPress: () => decline("vehicle_issue") },
        { text: "Other", style: "destructive", onPress: () => decline("other") },
      ],
    );
  };

  const onArrive = () => {
    arriveTrip.mutate(
      { id: tripId },
      {
        onSuccess: invalidate,
        onError: (e: any) =>
          Alert.alert("Could not confirm arrival", e?.response?.data?.error ?? "Try again."),
      },
    );
  };

  const onStart = () => {
    if (!/^\d{4}$/.test(pickupCode)) {
      return Alert.alert("Pickup PIN required", "Enter the 4-digit PIN shown to the passenger.");
    }
    startTrip.mutate(
      { id: tripId, data: { pickupCode } },
      {
        onSuccess: () => {
          setPickupCode("");
          invalidate();
        },
        onError: (e: any) =>
          Alert.alert("Could not start trip", e?.response?.data?.error ?? "Check the PIN."),
      },
    );
  };

  const onComplete = () => {
    Alert.alert(
      "Complete trip?",
      "Confirm the passenger has been dropped off.",
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Complete",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            completeTrip.mutate(
              { id: tripId },
              {
                onSuccess: () => {
                  invalidate();
                  Alert.alert(
                    "Trip completed",
                    "The expected cash fare was recorded. Follow the pilot cash-handling procedure.",
                  );
                  setRateVisible(true);
                },
                onError: (e: any) => {
                  const msg = e?.response?.data?.error ?? "Could not complete the trip.";
                  Alert.alert("Could not complete", msg);
                },
              },
            );
          },
        },
      ],
    );
  };

  const submitPassengerRating = () => {
    if (rating < 1) return Alert.alert("Select a rating", "Choose 1 to 5 stars.");
    rateTrip.mutate(
      { id: tripId, data: { rating, tags: ratingTags } },
      {
        onSuccess: () => {
          setRateVisible(false);
          invalidate();
          router.back();
        },
        onError: (e: any) =>
          Alert.alert("Could not submit rating", e?.response?.data?.error ?? "Try again."),
      },
    );
  };

  if (isLoading || !trip) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Loading trip…</Text>
      </View>
    );
  }

  const driverCoord = location
    ? { latitude: location.lat, longitude: location.lon }
    : null;
  const isMatched = trip.status === "matched";
  const isAccepted = trip.status === "accepted";
  const isArrived = trip.status === "arrived";
  const isActive = trip.status === "in_progress";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <RouteMap
        pickup={{ latitude: trip.pickupLat, longitude: trip.pickupLon }}
        dropoff={{ latitude: trip.dropoffLat, longitude: trip.dropoffLon }}
        routePolyline={trip.routePolyline}
        driver={driverCoord}
        interactive
        style={styles.map}
      />

      <Pressable
        onPress={() => router.back()}
        style={[
          styles.backBtn,
          { top: insets.top + 12, backgroundColor: colors.card },
        ]}
      >
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </Pressable>

      <ScrollView
        style={[styles.sheet, { backgroundColor: colors.card }]}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isMatched
              ? "New ride request"
              : isAccepted
                ? "Drive to pickup"
                : isArrived
                  ? "Passenger pickup"
                  : isActive
                    ? "Active trip"
                    : "Trip"}
          </Text>
          {isMatched ? (
            <View style={[styles.timer, { borderColor: colors.accent }]}>
              <Text style={[styles.timerText, { color: colors.accent }]}>
                {offerSeconds}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: colors.secondary },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: colors.primaryStrong },
                ]}
              >
                {trip.status.replace("_", " ")}
              </Text>
            </View>
          )}
        </View>

        <Card style={styles.detailsCard}>
          <View style={styles.locRow}>
            <Feather name="navigation" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.locLabel, { color: colors.mutedForeground }]}
              >
                Pickup
              </Text>
              <Text style={[styles.locValue, { color: colors.foreground }]}>
                {trip.pickupAddress || "Pickup point"}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                navigateTo(trip.pickupLat, trip.pickupLon, "Pickup")
              }
              style={[
                styles.navBtn,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Feather name="navigation-2" size={16} color={colors.primary} />
            </Pressable>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.locRow}>
            <Feather name="map-pin" size={18} color={colors.destructive} />
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.locLabel, { color: colors.mutedForeground }]}
              >
                Dropoff
              </Text>
              <Text style={[styles.locValue, { color: colors.foreground }]}>
                {trip.dropoffAddress || "Destination"}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                navigateTo(trip.dropoffLat, trip.dropoffLon, "Dropoff")
              }
              style={[
                styles.navBtn,
                { backgroundColor: colors.destructive + "18" },
              ]}
            >
              <Feather
                name="navigation-2"
                size={16}
                color={colors.destructive}
              />
            </Pressable>
          </View>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.stat, { backgroundColor: colors.background }]}>
            <Feather name="navigation" size={17} color={colors.primaryStrong} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {trip.distanceKm?.toFixed(1) ?? "--"} km
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              trip distance
            </Text>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.background }]}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              ₱{trip.fareAmount?.toFixed(0) ?? "--"}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              estimated fare
            </Text>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.background }]}>
            <Feather name="briefcase" size={17} color={colors.primaryStrong} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              Cash
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              payment
            </Text>
          </View>
        </View>

        <Card style={styles.fareCard}>
          <View style={styles.fareRow}>
            <Text style={[styles.fareLabel, { color: colors.mutedForeground }]}>
              Fare
            </Text>
            <Text style={[styles.fareValue, { color: colors.foreground }]}>
              {trip.fareAmount != null
                ? `₱${trip.fareAmount.toFixed(2)}`
                : "--"}
            </Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={[styles.fareLabel, { color: colors.mutedForeground }]}>
              Distance
            </Text>
            <Text style={[styles.fareValueSm, { color: colors.foreground }]}>
              {trip.distanceKm != null
                ? `${trip.distanceKm.toFixed(1)} km`
                : "--"}
            </Text>
          </View>
        </Card>

        {isMatched && (
          <View style={{ gap: 10, marginTop: 20 }}>
            <Button
              title="Accept ride"
              onPress={onAccept}
              loading={acceptTrip.isPending}
              disabled={offerSeconds === 0}
            />
            <Button
              title="Decline"
              variant="ghost"
              onPress={onDecline}
              loading={declineTrip.isPending}
            />
          </View>
        )}

        {(isAccepted || isArrived || isActive) && (
          <>
            <View
              style={[
                styles.passengerCard,
                { backgroundColor: colors.background },
              ]}
            >
              <View
                style={[
                  styles.passengerAvatar,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <Feather name="user" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.passengerName, { color: colors.foreground }]}
                >
                  {data?.passenger?.fullName ?? "MOVE passenger"}
                </Text>
                <Text
                  style={[
                    styles.passengerMeta,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {trip.passengerCount ?? 1} passenger
                  {trip.passengerCount === 1 ? "" : "s"} · Trip #{trip.id}
                </Text>
              </View>
              {!!data?.passenger?.phone &&
                ["accepted", "arrived", "in_progress"].includes(trip.status) && (
                  <Pressable
                    accessibilityLabel="Call passenger"
                    style={[styles.circleAction, { borderColor: colors.border }]}
                    onPress={() => Linking.openURL(`tel:${data.passenger?.phone}`)}
                  >
                    <Feather name="phone" size={16} color={colors.primaryStrong} />
                  </Pressable>
                )}
            </View>
            {isAccepted && (
              <Button
                title="I've arrived at pickup"
                onPress={onArrive}
                loading={arriveTrip.isPending}
                style={{ marginTop: 14 }}
              />
            )}
            {isArrived && (
              <Card style={styles.pinEntryCard}>
                <Text style={[styles.pinEntryTitle, { color: colors.foreground }]}>Verify passenger pickup</Text>
                <Text style={[styles.passengerMeta, { color: colors.mutedForeground }]}>Ask the passenger for the 4-digit PIN before starting.</Text>
                <TextInput
                  value={pickupCode}
                  onChangeText={(value) => setPickupCode(value.replace(/\D/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="0000"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.pinInput, { color: colors.foreground, borderColor: colors.border }]}
                />
                <Button title="Verify & start trip" onPress={onStart} loading={startTrip.isPending} />
              </Card>
            )}
            {isActive && (
              <Button
                title="Complete trip"
                onPress={onComplete}
                loading={completeTrip.isPending}
                style={{ marginTop: 14 }}
              />
            )}
            <Button
              title="Emergency"
              variant="destructive"
              onPress={() =>
                Alert.alert(
                  "Emergency assistance",
                  "Call the national emergency hotline now?",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Call 911", style: "destructive", onPress: () => Linking.openURL("tel:911") },
                  ],
                )
              }
              icon={<Feather name="alert-triangle" size={17} color="#fff" />}
              style={{ marginTop: 9 }}
            />
          </>
        )}
      </ScrollView>
      <Modal visible={rateVisible} transparent animationType="slide" onRequestClose={() => setRateVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.ratingSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <Text style={[styles.ratingTitle, { color: colors.foreground }]}>Rate the passenger</Text>
            <Text style={[styles.passengerMeta, { color: colors.mutedForeground }]}>Feedback is private and helps resolve repeated service issues.</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setRating(star)}>
                  <Feather name="star" size={38} color={star <= rating ? colors.accent : colors.border} />
                </Pressable>
              ))}
            </View>
            <View style={styles.tagWrap}>
              {PASSENGER_RATING_TAGS.map((tag) => {
                const selected = ratingTags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    onPress={() => setRatingTags((items) => selected ? items.filter((item) => item !== tag) : [...items, tag])}
                    style={[styles.tag, { borderColor: selected ? colors.accent : colors.border }]}
                  >
                    <Text style={{ color: colors.foreground }}>{tag}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button title="Submit rating" onPress={submitPassengerRating} loading={rateTrip.isPending} />
            <Button title="Skip" variant="ghost" onPress={() => { setRateVisible(false); router.back(); }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  map: { height: "52%", width: "100%" },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "70%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  timer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  timerText: { fontFamily: "Inter_700Bold", fontSize: 17 },
  statusBadge: { borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 },
  statusBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    textTransform: "uppercase",
  },
  detailsCard: { padding: 16 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  locLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 2 },
  locValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { height: 1, marginVertical: 14, marginLeft: 30 },
  fareCard: { padding: 16, gap: 10, marginTop: 16 },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fareLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  fareValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  fareValueSm: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  pinEntryCard: { padding: 14, gap: 10, marginTop: 14 },
  pinEntryTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  pinInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    letterSpacing: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  ratingSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 14 },
  ratingTitle: { fontFamily: "Inter_700Bold", fontSize: 22 },
  starsRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginVertical: 8 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: {
    flex: 1,
    minHeight: 76,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    padding: 7,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 13, marginTop: 3 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 8, marginTop: 2 },
  passengerCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  passengerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  passengerName: { fontFamily: "Inter_700Bold", fontSize: 13 },
  passengerMeta: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 3 },
  circleAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
