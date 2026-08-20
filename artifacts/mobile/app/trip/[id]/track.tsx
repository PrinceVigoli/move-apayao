import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { RouteMap } from "@/components/RouteMap";
import { useGetTrip, getGetTripQueryKey } from "@workspace/api-client-react";
import { useTripTracking } from "@/hooks/useTripTracking";

export default function TrackDriverScreen() {
  const { id } = useLocalSearchParams();
  const tripId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { data, isLoading } = useGetTrip(tripId, {
    query: { queryKey: getGetTripQueryKey(tripId), enabled: !!tripId },
  });
  const trip = data?.trip;
  const enabled =
    !!trip?.driverId &&
    ["matched", "accepted", "arrived", "in_progress"].includes(trip.status);
  const { location, tripStatus, connected, error } = useTripTracking(
    tripId,
    enabled,
  );
  const status = tripStatus ?? trip?.status ?? "requested";
  if (isLoading || !trip)
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  const driverCoord = location
    ? { latitude: location.lat, longitude: location.lon }
    : null;
  const title =
    status === "in_progress"
      ? "On the way to drop-off"
      : status === "arrived"
        ? "Driver has arrived"
        : status === "accepted"
          ? "Driver heading to pickup"
          : status === "matched"
            ? "Waiting for driver response"
        : status === "completed"
          ? "Trip completed"
          : "Finding your driver";
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <RouteMap
        pickup={{ latitude: trip.pickupLat, longitude: trip.pickupLon }}
        dropoff={{ latitude: trip.dropoffLat, longitude: trip.dropoffLon }}
        routePolyline={trip.routePolyline}
        driver={driverCoord}
        followDriver
        interactive
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.top,
          { paddingTop: insets.top + 8, backgroundColor: colors.primary },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.topIcon}>
          <Feather name="chevron-down" size={25} color="#fff" />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.topTitle}>{title}</Text>
          <Text style={[styles.eta, { color: colors.accent }]}>
            {status === "completed"
              ? "Arrived"
              : status === "in_progress"
                ? "In progress"
                : status === "arrived"
                  ? "Meet at pickup"
                  : "Live tracking"}
          </Text>
        </View>
        <View style={styles.topIcon}>
          <View
            style={[
              styles.liveDot,
              { backgroundColor: connected ? colors.accent : colors.warning },
            ]}
          />
        </View>
      </View>
      <View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 18, backgroundColor: colors.card },
        ]}
      >
        <View style={styles.driverRow}>
          <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
            <Feather name="user" size={25} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.driverName, { color: colors.foreground }]}>
              {data.driver?.fullName ?? "Your MOVE driver"}
            </Text>
            <View style={styles.verified}>
              <Feather name="shield" size={12} color={colors.success} />
              <Text
                style={[styles.verifiedText, { color: colors.mutedForeground }]}
              >
                Verified · {data.driver?.vehicleColor ? `${data.driver.vehicleColor} ` : ""}
                {data.driver?.vehicleType ?? "MOVE vehicle"} · {data.driver?.plateNumber ?? "Plate pending"}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.fare, { color: colors.foreground }]}>
              ₱{trip.fareAmount?.toFixed(0) ?? "--"}
            </Text>
            <Text style={[styles.tripId, { color: colors.mutedForeground }]}>
              TRIP #{trip.id}
            </Text>
          </View>
        </View>
        <View style={styles.progress}>
          <View
            style={[styles.progressLine, { backgroundColor: colors.border }]}
          />
          <View
            style={[
              styles.progressDone,
              {
                backgroundColor: colors.primary,
                width:
                  status === "in_progress"
                    ? "62%"
                    : status === "completed"
                      ? "100%"
                      : "24%",
              },
            ]}
          />
          {["Driver confirmed", "Driver arriving", "Drop-off"].map(
            (label, index) => (
              <View key={label} style={styles.progressStep}>
                <View
                  style={[
                    styles.progressDot,
                    {
                      backgroundColor:
                        index === 0 ||
                        status === "in_progress" ||
                        status === "completed"
                          ? colors.primary
                          : colors.border,
                    },
                  ]}
                >
                  {index === 0 && (
                    <Feather name="check" size={10} color="#fff" />
                  )}
                </View>
                <Text
                  style={[
                    styles.progressLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ),
          )}
        </View>
        <View
          style={[styles.routeCard, { backgroundColor: colors.background }]}
        >
          <View style={styles.routeRow}>
            <View
              style={[styles.routeDot, { backgroundColor: colors.success }]}
            />
            <Text
              style={[styles.routeText, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {trip.pickupAddress || "Pickup"}
            </Text>
          </View>
          <View style={styles.routeRow}>
            <View
              style={[styles.routeDot, { backgroundColor: colors.destructive }]}
            />
            <Text
              style={[styles.routeText, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {trip.dropoffAddress || "Drop-off"}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() =>
              data.driver?.phone
                ? Linking.openURL(`tel:${data.driver.phone}`)
                : Alert.alert("Call driver", "No phone number is available for this driver.")
            }
            style={[styles.action, { borderColor: colors.border }]}
          >
            <Feather name="phone" size={18} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.foreground }]}>
              Call
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert(
                "Message driver",
                "Messaging will be available in a future update.",
              )
            }
            style={[styles.action, { borderColor: colors.border }]}
          >
            <Feather name="message-circle" size={18} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.foreground }]}>
              Message
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert("Emergency assistance", "Call 911 now or send a trip-linked incident to the operations team.", [
                { text: "Cancel", style: "cancel" },
                { text: "Report incident", onPress: () => router.push(`/report?tripId=${tripId}` as never) },
                { text: "Call 911", style: "destructive", onPress: () => Linking.openURL("tel:911") },
              ])
            }
            style={[
              styles.action,
              styles.emergency,
              { backgroundColor: colors.destructive },
            ]}
          >
            <Feather name="alert-triangle" size={18} color="#fff" />
            <Text style={styles.emergencyText}>Emergency</Text>
          </Pressable>
        </View>
        <View style={styles.connection}>
          <View
            style={[
              styles.connectionDot,
              { backgroundColor: connected ? colors.success : colors.warning },
            ]}
          />
          <Text
            style={[styles.connectionText, { color: colors.mutedForeground }]}
          >
            {location
              ? `${location.source === "iot_gps" ? "Vehicle GPS" : "Driver phone GPS"}${location.stale ? " (last known)" : ""} updated ${new Date(location.ts).toLocaleTimeString()}`
              : (error ?? "Waiting for live vehicle location…")}
          </Text>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: 105,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  topIcon: { width: 42, alignItems: "center" },
  topTitle: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  eta: { fontFamily: "Inter_700Bold", fontSize: 26, marginTop: 2 },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    elevation: 14,
  },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  driverName: { fontFamily: "Inter_700Bold", fontSize: 16 },
  verified: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    marginTop: 5,
  },
  verifiedText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  fare: { fontFamily: "Inter_700Bold", fontSize: 20 },
  tripId: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    letterSpacing: 0.8,
    marginTop: 3,
  },
  progress: {
    height: 76,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    position: "relative",
  },
  progressLine: {
    position: "absolute",
    top: 10,
    left: 18,
    right: 18,
    height: 2,
  },
  progressDone: { position: "absolute", top: 10, left: 18, height: 2 },
  progressStep: { width: "30%", alignItems: "center" },
  progressDot: {
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  progressLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    textAlign: "center",
    marginTop: 7,
  },
  routeCard: { borderRadius: 15, padding: 12, gap: 10 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeDot: { width: 9, height: 9, borderRadius: 5 },
  routeText: { fontFamily: "Inter_500Medium", fontSize: 12, flex: 1 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  action: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  actionText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  emergency: { flex: 1.3, borderWidth: 0 },
  emergencyText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 11 },
  connection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
  },
  connectionDot: { width: 7, height: 7, borderRadius: 4 },
  connectionText: { fontFamily: "Inter_400Regular", fontSize: 10 },
});
