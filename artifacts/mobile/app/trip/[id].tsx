import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  TextInput,
  Linking,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { RouteMap } from "@/components/RouteMap";
import { Feather } from "@expo/vector-icons";
import {
  useGetTrip,
  useCancelTrip,
  useRateTrip,
  getGetTripQueryKey,
  getListTripsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

function openInMaps(lat: number, lon: number, label: string) {
  const encodedLabel = encodeURIComponent(label);
  const url = Platform.select({
    ios: `maps://?q=${encodedLabel}&ll=${lat},${lon}`,
    android: `geo:${lat},${lon}?q=${lat},${lon}(${encodedLabel})`,
    default: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
  });
  Linking.openURL(url as string).catch(() =>
    Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
    ),
  );
}

const CANCEL_REASONS = [
  ["changed_mind", "Plans changed"],
  ["wrong_pickup", "Wrong pickup point"],
  ["driver_taking_too_long", "Driver is taking too long"],
  ["cannot_contact_driver", "Cannot contact driver"],
  ["safety_concern", "Safety concern"],
  ["other", "Other reason"],
] as const;

const RATING_TAGS = [
  "Safe driving",
  "Polite",
  "Clean vehicle",
  "Easy pickup",
  "Good route",
  "Unsafe driving",
] as const;

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams();
  const tripId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();

  const [rateVisible, setRateVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [ratingTags, setRatingTags] = useState<string[]>([]);
  const [cancelVisible, setCancelVisible] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useGetTrip(tripId, {
    query: {
      queryKey: getGetTripQueryKey(tripId),
      enabled: !!tripId,
      // While the trip is still being matched (or awaiting driver accept),
      // poll so the background sweeper's rematch/expiry shows up without a
      // manual refresh. Stops polling once the trip reaches a settled state.
      refetchInterval: (query) => {
        const s = query.state.data?.trip?.status;
        // Poll through the whole active lifecycle — including in_progress —
        // so the driver completing the trip shows up on the passenger's
        // screen within seconds, without a manual refresh.
        return ["requested", "matched", "accepted", "arrived", "in_progress"].includes(
          s ?? "",
        )
          ? 5000
          : false;
      },
    },
  });
  const cancelTrip = useCancelTrip();
  const rateTrip = useRateTrip();

  const trip = data?.trip;

  const handleCancel = (reason: (typeof CANCEL_REASONS)[number][0]) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    cancelTrip.mutate(
      { id: tripId, data: { reason } },
      {
        onSuccess: () => {
          setCancelVisible(false);
          queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
          queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
          router.back();
        },
        onError: (error: any) =>
          Alert.alert(
            "Could not cancel",
            error?.response?.data?.error ?? "Please try again.",
          ),
      },
    );
  };

  const submitRating = () => {
    if (rating < 1) {
      Alert.alert("Select a rating", "Please tap a star from 1 to 5.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    rateTrip.mutate(
      {
        id: tripId,
        data: { rating, comment: comment.trim() || undefined, tags: ratingTags },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetTripQueryKey(tripId),
          });
          setRateVisible(false);
          setRating(0);
          setComment("");
          setRatingTags([]);
          Alert.alert("Thank you!", "Your rating has been submitted.");
        },
        onError: (err: any) => {
          const msg =
            err?.response?.data?.error ??
            err?.message ??
            "Could not submit your rating. Please try again.";
          Alert.alert("Rating failed", String(msg));
        },
      },
    );
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "in_progress":
      case "arrived":
        return "warning";
      case "cancelled":
        return "destructive";
      case "matched":
      case "accepted":
        return "secondary";
      default:
        return "outline";
    }
  };

  const MAP_W = 600;
  const MAP_H = 400;

  const canTrack =
    !!trip?.driverId &&
    ["matched", "accepted", "arrived", "in_progress"].includes(trip?.status ?? "");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.modalHeader}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading || !trip ? (
          <View style={{ gap: 20, marginTop: 20 }}>
            <Skeleton style={{ height: 120, width: "100%" }} />
            <Skeleton style={{ height: 200, width: "100%" }} />
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Trip Details
              </Text>
              <Badge
                label={trip.status}
                variant={getStatusVariant(trip.status)}
              />
            </View>

            {/* Searching / no-driver states */}
            {trip.status === "requested" && (
              <Card style={[styles.stateCard, { borderColor: colors.primary }]}>
                <ActivityIndicator color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.stateTitle, { color: colors.foreground }]}
                  >
                    Looking for a driver…
                  </Text>
                  <Text
                    style={[styles.stateSub, { color: colors.mutedForeground }]}
                  >
                    We keep searching for up to 5 minutes as drivers come online
                    nearby.
                  </Text>
                </View>
              </Card>
            )}
            {trip.status === "cancelled" &&
              (trip.cancelReasonCode ?? trip.cancelReason) === "no_driver_available" && (
                <Card
                  style={[
                    styles.stateCard,
                    { borderColor: colors.destructive },
                  ]}
                >
                  <Feather
                    name="alert-circle"
                    size={22}
                    color={colors.destructive}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.stateTitle, { color: colors.foreground }]}
                    >
                      No driver available
                    </Text>
                    <Text
                      style={[
                        styles.stateSub,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      We couldn't find an available e-trike nearby. Please try
                      booking again in a little while.
                    </Text>
                  </View>
                </Card>
              )}

            {data?.driver && (
              <Card style={styles.identityCard}>
                <View style={[styles.identityAvatar, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.identityInitial, { color: colors.primaryStrong }]}>
                    {(data.driver.fullName ?? "D").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.identityName, { color: colors.foreground }]}>
                    {data.driver.fullName ?? "MOVE driver"}
                  </Text>
                  <Text style={[styles.identityMeta, { color: colors.mutedForeground }]}>
                    {data.driver.vehicleColor ? `${data.driver.vehicleColor} ` : ""}
                    {data.driver.vehicleType} · {data.driver.plateNumber ?? "Plate pending"}
                  </Text>
                  <Text style={[styles.identityMeta, { color: colors.primaryStrong }]}>
                    ★ {data.driver.rating.toFixed(1)} · {data.driver.totalTrips} trips
                  </Text>
                </View>
                {!!data.driver.phone &&
                  ["accepted", "arrived", "in_progress"].includes(trip.status) && (
                  <Pressable
                    accessibilityLabel="Call driver"
                    onPress={() => Linking.openURL(`tel:${data.driver?.phone}`)}
                    style={[styles.callButton, { borderColor: colors.border }]}
                  >
                    <Feather name="phone" size={18} color={colors.primary} />
                  </Pressable>
                )}
              </Card>
            )}

            {trip.pickupCode && ["accepted", "arrived"].includes(trip.status) && (
              <Card style={[styles.pinCard, { backgroundColor: colors.primary }]}>
                <View>
                  <Text style={styles.pinLabel}>PICKUP VERIFICATION PIN</Text>
                  <Text style={styles.pinHelp}>Share only after meeting the correct driver.</Text>
                </View>
                <Text style={styles.pinValue}>{trip.pickupCode}</Text>
              </Card>
            )}

            {/* Embedded interactive route map */}
            <Pressable
              onPress={() => {
                if (canTrack) {
                  router.push(`/trip/${tripId}/track`);
                } else {
                  openInMaps(
                    trip.dropoffLat,
                    trip.dropoffLon,
                    trip.dropoffAddress || "Dropoff",
                  );
                }
              }}
            >
              <Card style={styles.mapCard}>
                <RouteMap
                  pickup={{
                    latitude: trip.pickupLat,
                    longitude: trip.pickupLon,
                  }}
                  dropoff={{
                    latitude: trip.dropoffLat,
                    longitude: trip.dropoffLon,
                  }}
                  routePolyline={trip.routePolyline}
                  interactive={false}
                  style={StyleSheet.absoluteFill}
                />
                <View
                  style={[styles.mapHint, { backgroundColor: colors.card }]}
                  pointerEvents="none"
                >
                  <Feather
                    name={canTrack ? "navigation" : "external-link"}
                    size={13}
                    color={colors.primary}
                  />
                  <Text style={[styles.mapHintText, { color: colors.primary }]}>
                    {canTrack ? "Track Driver" : "Open in Maps"}
                  </Text>
                </View>
              </Card>
            </Pressable>

            <Card style={styles.detailsCard}>
              <View style={styles.locationRow}>
                <Feather
                  name="navigation"
                  size={20}
                  color={colors.primary}
                  style={styles.icon}
                />
                <View style={styles.locationText}>
                  <Text
                    style={[
                      styles.locationLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Pickup
                  </Text>
                  <Text
                    style={[styles.locationValue, { color: colors.foreground }]}
                  >
                    {trip.pickupAddress || "Current Location"}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.locationRow}>
                <Feather
                  name="map-pin"
                  size={20}
                  color={colors.secondaryForeground}
                  style={styles.icon}
                />
                <View style={styles.locationText}>
                  <Text
                    style={[
                      styles.locationLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Dropoff
                  </Text>
                  <Text
                    style={[styles.locationValue, { color: colors.foreground }]}
                  >
                    {trip.dropoffAddress || "Destination"}
                  </Text>
                </View>
              </View>
            </Card>

            <Card style={styles.fareCard}>
              <View style={styles.fareRow}>
                <Text
                  style={[styles.fareLabel, { color: colors.mutedForeground }]}
                >
                  Estimated Fare
                </Text>
                <Text style={[styles.fareValue, { color: colors.foreground }]}>
                  {trip.fareAmount != null
                    ? `₱${trip.fareAmount.toFixed(2)}`
                    : "--"}
                </Text>
              </View>
              <View style={styles.fareRow}>
                <Text
                  style={[styles.fareLabel, { color: colors.mutedForeground }]}
                >
                  Distance
                </Text>
                <Text style={[styles.fareValue, { color: colors.foreground }]}>
                  {trip.distanceKm != null
                    ? `${trip.distanceKm.toFixed(1)} km`
                    : "--"}
                </Text>
              </View>
            </Card>

            {canTrack && (
              <Button
                title="Track Driver Live"
                variant="default"
                onPress={() => router.push(`/trip/${tripId}/track`)}
                icon={
                  <Feather
                    name="navigation"
                    size={18}
                    color={colors.primaryForeground}
                  />
                }
                style={{ marginTop: 24 }}
              />
            )}

            {["requested", "matched", "accepted", "arrived"].includes(trip.status) ? (
              <Button
                title="Cancel Trip"
                variant="destructive"
                onPress={() => setCancelVisible(true)}
                loading={cancelTrip.isPending}
                style={{ marginTop: 12 }}
              />
            ) : null}

            {trip.status === "completed" &&
              (data?.myRating ? (
                <View
                  style={[
                    styles.ratedRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.ratedText, { color: colors.foreground }]}
                  >
                    You rated this trip{" "}
                    <Text style={{ color: colors.accent }}>
                      {"★".repeat(data.myRating.rating)}
                    </Text>
                  </Text>
                  {!!data.myRating.comment && (
                    <Text
                      style={[
                        styles.ratedComment,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      “{data.myRating.comment}”
                    </Text>
                  )}
                </View>
              ) : (
                <Button
                  title="Rate Trip"
                  variant="default"
                  onPress={() => setRateVisible(true)}
                  style={{ marginTop: 24 }}
                />
              ))}
          </>
        )}
      </ScrollView>

      <Modal
        visible={cancelVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCancelVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCancelVisible(false)}>
          <Pressable style={[styles.cancelSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.ratingTitle, { color: colors.foreground }]}>Cancel this ride?</Text>
            <Text style={[styles.ratingSub, { color: colors.mutedForeground }]}>
              Select a reason so service problems can be reviewed.
            </Text>
            {CANCEL_REASONS.map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => handleCancel(value)}
                style={[styles.reasonRow, { borderColor: colors.border }]}
              >
                <Text style={[styles.reasonText, { color: colors.foreground }]}>{label}</Text>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={rateVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRateVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setRateVisible(false)}
        >
          <Pressable
            style={[
              styles.ratingSheet,
              {
                backgroundColor: colors.card,
                paddingBottom: insets.bottom + 24,
              },
            ]}
            onPress={() => {}}
          >
            <View
              style={[
                styles.handle,
                {
                  backgroundColor: colors.border,
                  alignSelf: "center",
                  marginBottom: 20,
                },
              ]}
            />
            <Text style={[styles.ratingTitle, { color: colors.foreground }]}>
              Rate your trip
            </Text>
            <Text style={[styles.ratingSub, { color: colors.mutedForeground }]}>
              How was your ride?
            </Text>

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setRating(star);
                  }}
                  hitSlop={8}
                  style={{ marginHorizontal: 4 }}
                >
                  <Feather
                    name="star"
                    size={40}
                    color={star <= rating ? colors.primary : colors.border}
                  />
                </Pressable>
              ))}
            </View>

            <View style={styles.tagWrap}>
              {RATING_TAGS.map((tag) => {
                const selected = ratingTags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    onPress={() =>
                      setRatingTags((current) =>
                        selected
                          ? current.filter((item) => item !== tag)
                          : current.length < 5
                            ? [...current, tag]
                            : current,
                      )
                    }
                    style={[
                      styles.tag,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.secondary : "transparent",
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? colors.primaryStrong : colors.foreground }}>
                      {tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Add a comment (optional)"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={[
                styles.commentInput,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />

            <Button
              title="Submit Rating"
              variant="default"
              onPress={submitRating}
              loading={rateTrip.isPending}
              style={{ marginTop: 16 }}
            />
            <Button
              title="Not now"
              variant="ghost"
              onPress={() => setRateVisible(false)}
              style={{ marginTop: 8 }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalHeader: { alignItems: "center", paddingVertical: 12 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  mapCard: { height: 200, padding: 0, overflow: "hidden", marginBottom: 20 },
  stateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 20,
  },
  stateTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 2 },
  ratedRow: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  ratedText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  ratedComment: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  stateSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 14,
  },
  identityAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  identityInitial: { fontFamily: "Inter_700Bold", fontSize: 18 },
  identityName: { fontFamily: "Inter_700Bold", fontSize: 15 },
  identityMeta: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3 },
  callButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pinCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    marginBottom: 14,
  },
  pinLabel: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 },
  pinHelp: { color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 4 },
  pinValue: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: 4 },
  mapHint: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    opacity: 0.95,
  },
  mapHintText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  detailsCard: { padding: 16, marginBottom: 20 },
  locationRow: { flexDirection: "row", alignItems: "center" },
  icon: { marginRight: 16 },
  locationText: { flex: 1 },
  locationLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 2,
  },
  locationValue: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 16,
    marginLeft: 36,
  },
  fareCard: { padding: 16, gap: 12 },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fareLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  fareValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  ratingSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  cancelSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 36,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingVertical: 15,
  },
  reasonText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  ratingTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
  ratingSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 20 },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 20,
  },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  commentInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlignVertical: "top",
  },
});
