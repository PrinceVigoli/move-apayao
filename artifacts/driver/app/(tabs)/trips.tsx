import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useListTrips } from "@workspace/api-client-react";

export default function DriverTripsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isRefetching, refetch } = useListTrips({ limit: 50 });
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
          paddingTop: insets.top + 22,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 105,
        }}
      >
        <Text style={[styles.eyebrow, { color: colors.primaryStrong }]}>
          DRIVER ACTIVITY
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Your trips
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Requests, active rides, and completed journeys.
        </Text>
        <View style={styles.list}>
          {(data?.trips ?? []).map((trip) => (
            <Pressable
              key={trip.id}
              onPress={() => router.push(`/trip/${trip.id}`)}
              style={[
                styles.row,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.icon,
                  {
                    backgroundColor:
                      trip.status === "completed"
                        ? colors.secondary
                        : colors.accent + "1A",
                  },
                ]}
              >
                <Feather
                  name={trip.status === "completed" ? "check" : "navigation"}
                  size={18}
                  color={
                    trip.status === "completed"
                      ? colors.primaryStrong
                      : colors.accent
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.address, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {trip.dropoffAddress || "Trip destination"}
                </Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  {new Date(trip.createdAt).toLocaleDateString()} ·{" "}
                  {trip.status.replace("_", " ")}
                </Text>
              </View>
              <Text style={[styles.fare, { color: colors.foreground }]}>
                ₱{trip.fareAmount?.toFixed(0) ?? "--"}
              </Text>
              <Feather
                name="chevron-right"
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
          ))}
        </View>
        {!data?.trips?.length && (
          <View style={styles.empty}>
            <Feather name="map" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No trips yet
            </Text>
            <Text style={{ color: colors.mutedForeground }}>
              Go online to receive ride requests.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.2 },
  title: { fontFamily: "Inter_700Bold", fontSize: 29, marginTop: 5 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 5 },
  list: { gap: 10, marginTop: 22 },
  row: {
    borderWidth: 1,
    borderRadius: 17,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  address: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  meta: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    textTransform: "capitalize",
    marginTop: 4,
  },
  fare: { fontFamily: "Inter_700Bold", fontSize: 15 },
  empty: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
});
