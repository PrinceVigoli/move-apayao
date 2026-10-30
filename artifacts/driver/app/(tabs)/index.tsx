import { getListFixedLoopOperatorRunsQueryKey } from "@workspace/api-client-react";
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { RouteMap } from "@/components/RouteMap";
import { useDriverStatus } from "@/contexts/DriverStatusContext";
import {
  useGetEarnings,
  useGetProfile,
  useListTrips,
  getListTripsQueryKey,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { getManilaDate, useListFixedLoopOperatorRuns } from "@workspace/api-client-react";
import FixedLoopOperatorPanel from "@/components/FixedLoopOperatorPanel";
import { Button } from "@/components/ui/Button";

export default function DriveScreen() {
  const colors = useColors();
  const profile = useGetProfile();
  const assignment = useListFixedLoopOperatorRuns({ date: getManilaDate() }, { query: { queryKey: getListFixedLoopOperatorRunsQueryKey({ date: getManilaDate() }), enabled: profile.data?.user.role === "driver", refetchInterval: 15_000 } });
  if (profile.isLoading || assignment.isLoading) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  if (profile.data?.user.role !== "driver" && !profile.isError) return <OnDemandDriveScreen />;
  if (profile.isError || assignment.isError) return <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: colors.background }}><Text style={{ color: colors.foreground }}>Could not load your service assignment.</Text><Button title="Retry" onPress={() => { profile.refetch(); assignment.refetch(); }} /></View>;
  if (assignment.data?.service) return <FixedLoopOperatorPanel service={assignment.data.service} />;
  return <OnDemandDriveScreen />;
}

function OnDemandDriveScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { isOnline, location, toggling, error, goOnline, goOffline } =
    useDriverStatus();
  const today = new Date().toISOString().slice(0, 10);
  const { data: profile } = useGetProfile();
  const { data: earnings } = useGetEarnings({
    startDate: today,
    endDate: today,
  });
  const { data, isRefetching, refetch } = useListTrips(
    { limit: 10 },
    {
      query: {
        queryKey: getListTripsQueryKey({ limit: 10 }),
        refetchInterval: isOnline ? 5000 : false,
        enabled: isOnline,
      },
    },
  );
  const incoming = useMemo(
    () => data?.trips?.find((trip) => trip.status === "matched"),
    [data],
  );
  const active = useMemo(
    () =>
      data?.trips?.find((trip) =>
        ["accepted", "arrived", "in_progress"].includes(trip.status),
      ),
    [data],
  );
  const todayRow = earnings?.earnings?.[0];
  const firstName = profile?.user?.fullName?.split(" ")[0] || "Joel";
  const coord = location
    ? { latitude: location.lat, longitude: location.lon }
    : null;
  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    isOnline ? goOffline() : goOnline();
  };
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
          />
        }
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + 110,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.brand, { color: colors.foreground }]}>
              MOVE <Text style={{ color: colors.accent }}>Driver</Text>
            </Text>
            <View style={styles.greetingRow}>
              <View
                style={[styles.avatar, { backgroundColor: colors.secondary }]}
              >
                <Text style={[styles.avatarText, { color: colors.accent }]}>
                  {firstName[0]?.toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={[styles.greeting, { color: colors.foreground }]}>
                  Good morning, {firstName}
                </Text>
                <View style={styles.statusLine}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: isOnline
                          ? colors.success
                          : colors.mutedForeground,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusSmall,
                      {
                        color: isOnline
                          ? colors.primaryStrong
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {isOnline ? "You're online" : "You're offline"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <Pressable style={[styles.bell, { backgroundColor: colors.card }]}>
            <Feather name="bell" size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.metrics}>
          <View
            style={[
              styles.metric,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={[styles.metricLabel, { color: colors.mutedForeground }]}
            >
              EARNINGS TODAY
            </Text>
            <Text style={[styles.metricValue, { color: colors.foreground }]}>
              ₱{(todayRow?.totalEarnings ?? 0).toFixed(0)}
            </Text>
            <Text
              style={[styles.metricLink, { color: colors.primaryStrong }]}
              onPress={() => router.push("/earnings")}
            >
              View breakdown ›
            </Text>
          </View>
          <View
            style={[
              styles.metric,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={[styles.metricLabel, { color: colors.mutedForeground }]}
            >
              TRIPS COMPLETED
            </Text>
            <Text style={[styles.metricValue, { color: colors.foreground }]}>
              {todayRow?.tripCount ?? 0}{" "}
              <Text style={styles.tripUnit}>trips</Text>
            </Text>
            <Text
              style={[styles.metricLink, { color: colors.primaryStrong }]}
              onPress={() => router.push("/earnings")}
            >
              View history ›
            </Text>
          </View>
        </View>
        <Pressable
          onPress={toggle}
          disabled={toggling}
          style={[
            styles.onlineSwitch,
            {
              backgroundColor: isOnline ? colors.primary : colors.card,
              borderColor: isOnline ? colors.accent : colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.signal,
              {
                backgroundColor: isOnline ? colors.accent + "30" : colors.muted,
              },
            ]}
          >
            {toggling ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Feather
                name={isOnline ? "radio" : "power"}
                size={24}
                color={isOnline ? colors.accent : colors.mutedForeground}
              />
            )}
          </View>
          <Text style={[styles.onlineText, { color: colors.foreground }]}>
            {isOnline ? "Online" : "Go online"}
          </Text>
          <View
            style={[
              styles.knob,
              {
                backgroundColor: isOnline
                  ? colors.accent
                  : colors.mutedForeground,
              },
            ]}
          />
        </Pressable>
        {error && (
          <View style={[styles.error, { borderColor: colors.destructive }]}>
            <Feather name="alert-circle" size={17} color={colors.destructive} />
            <Text style={{ color: colors.destructive, flex: 1 }}>{error}</Text>
          </View>
        )}
        <View
          style={[
            styles.mapCard,
            {
              backgroundColor: colors.card,
              borderColor: incoming ? colors.accent : colors.border,
            },
          ]}
        >
          <View style={styles.mapHeader}>
            <Text style={[styles.mapTitle, { color: colors.foreground }]}>
              {incoming
                ? "New ride request"
                : active
                  ? "Active trip"
                  : isOnline
                    ? "Waiting for requests"
                    : "Your service area"}
            </Text>
            {incoming && (
              <View style={[styles.count, { backgroundColor: colors.accent }]}>
                <Text style={styles.countText}>1</Text>
              </View>
            )}
          </View>
          <View style={styles.map}>
            {coord ? (
              <RouteMap
                userLocation={coord}
                nearbyDrivers={[
                  {
                    id: "me",
                    latitude: coord.latitude,
                    longitude: coord.longitude,
                    label: "You",
                  },
                ]}
                interactive
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.mapEmpty,
                  { backgroundColor: colors.muted },
                ]}
              >
                <Feather
                  name="map-pin"
                  size={30}
                  color={colors.mutedForeground}
                />
                <Text style={{ color: colors.mutedForeground }}>
                  Go online to locate your vehicle
                </Text>
              </View>
            )}
          </View>
          {incoming && (
            <Pressable
              onPress={() => router.push(`/trip/${incoming.id}`)}
              style={[styles.request, { backgroundColor: colors.background }]}
            >
              <View style={styles.route}>
                <View
                  style={[styles.routeDot, { backgroundColor: colors.success }]}
                />
                <View
                  style={[styles.routeLine, { backgroundColor: colors.border }]}
                />
                <View
                  style={[
                    styles.routeDot,
                    { backgroundColor: colors.destructive },
                  ]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.routeLabel, { color: colors.primaryStrong }]}
                >
                  PICKUP
                </Text>
                <Text
                  style={[styles.routeAddress, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {incoming.pickupAddress || "Pickup location"}
                </Text>
                <Text
                  style={[
                    styles.routeLabel,
                    { color: colors.destructive, marginTop: 10 },
                  ]}
                >
                  DROP-OFF
                </Text>
                <Text
                  style={[styles.routeAddress, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {incoming.dropoffAddress || "Destination"}
                </Text>
              </View>
              <View style={styles.fare}>
                <Text style={[styles.fareValue, { color: colors.foreground }]}>
                  ₱{incoming.fareAmount?.toFixed(0) ?? "--"}
                </Text>
                <Feather name="chevron-right" size={20} color={colors.accent} />
              </View>
            </Pressable>
          )}
          {active && (
            <Pressable
              onPress={() => router.push(`/trip/${active.id}`)}
              style={[styles.continue, { backgroundColor: colors.primary }]}
            >
              <Feather name="navigation" size={18} color={colors.accent} />
              <Text style={styles.continueText}>Continue active trip</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </Pressable>
          )}
        </View>
        <View
          style={[
            styles.vehicle,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View
            style={[styles.vehicleIcon, { backgroundColor: colors.secondary }]}
          >
            <Feather name="truck" size={24} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.vehicleOverline,
                { color: colors.mutedForeground },
              ]}
            >
              YOUR VEHICLE
            </Text>
            <Text style={[styles.vehicleName, { color: colors.foreground }]}>
              Registered MOVE vehicle
            </Text>
          </View>
          <Feather
            name="chevron-right"
            size={20}
            color={colors.mutedForeground}
          />
        </View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  brand: { fontFamily: "Inter_700Bold", fontSize: 20 },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 18,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 17 },
  greeting: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusSmall: { fontFamily: "Inter_500Medium", fontSize: 11 },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    marginTop: 20,
  },
  metric: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 15 },
  metricLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.7,
  },
  metricValue: { fontFamily: "Inter_700Bold", fontSize: 25, marginTop: 7 },
  tripUnit: { fontSize: 15 },
  metricLink: { fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 8 },
  onlineSwitch: {
    marginHorizontal: 18,
    marginTop: 12,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
    padding: 5,
  },
  signal: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  onlineText: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    marginLeft: 14,
  },
  knob: { width: 42, height: 42, borderRadius: 21 },
  error: {
    marginHorizontal: 18,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    gap: 8,
  },
  mapCard: { margin: 18, borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  mapHeader: {
    height: 52,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  count: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: "#0E1B2E", fontFamily: "Inter_700Bold" },
  map: { height: 240 },
  mapEmpty: { alignItems: "center", justifyContent: "center", gap: 10 },
  request: { flexDirection: "row", padding: 15, gap: 12 },
  route: { width: 14, alignItems: "center", paddingTop: 4 },
  routeDot: { width: 9, height: 9, borderRadius: 5 },
  routeLine: { width: 2, height: 45 },
  routeLabel: { fontFamily: "Inter_700Bold", fontSize: 9 },
  routeAddress: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 2 },
  fare: { justifyContent: "center", alignItems: "flex-end" },
  fareValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  continue: {
    margin: 12,
    borderRadius: 14,
    height: 50,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  continueText: { color: "#fff", flex: 1, fontFamily: "Inter_700Bold" },
  vehicle: {
    marginHorizontal: 18,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleOverline: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.7,
  },
  vehicleName: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 4 },
});
