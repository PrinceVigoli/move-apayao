import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";
import { RouteMap, type NearbyDriverPin } from "@/components/RouteMap";
import { useLocation } from "@/hooks/useLocation";
import {
  useGetNearbyDrivers,
  useGetProfile,
  useListTrips,
} from "@workspace/api-client-react";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { lat, lon, isFallback } = useLocation();
  const { data: profile } = useGetProfile();
  const { data: nearby } = useGetNearbyDrivers({ lat, lon });
  const { data: trips } = useListTrips({ limit: 1 });
  const firstName =
    profile?.user?.fullName?.split(" ")[0] ||
    profile?.user?.email?.split("@")[0] ||
    "Maria";
  const pins: NearbyDriverPin[] = (nearby?.drivers ?? [])
    .filter((d) => d.currentLat != null && d.currentLon != null)
    .map((d) => ({
      id: d.userId,
      latitude: d.currentLat!,
      longitude: d.currentLon!,
      label: d.fullName || "Available E-Trike",
    }));
  const recent = trips?.trips?.[0];
  const shortcuts = [
    { title: "Pudtol", sub: "Municipal Hall", icon: "home" },
    { title: "Pudtol", sub: "Public Market", icon: "shopping-bag" },
    { title: "Sta. Marcela", sub: "Elementary School", icon: "map-pin" },
  ] as const;
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 96 : 112),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <View>
            <Text style={[styles.brand, { color: colors.foreground }]}>
              MOVE <Text style={{ color: colors.primary }}>Apayao</Text>
            </Text>
            <Text style={[styles.greeting, { color: colors.foreground }]}>
              Good morning, {firstName}
            </Text>
            <View style={styles.location}>
              <Feather name="map-pin" size={13} color={colors.primary} />
              <Text
                style={[styles.locationText, { color: colors.mutedForeground }]}
              >
                {isFallback ? "Pudtol, Apayao" : "Your current location"}
              </Text>
            </View>
          </View>
          <Pressable style={[styles.alert, { backgroundColor: colors.card }]}>
            <Feather name="bell" size={20} color={colors.foreground} />
            <View
              style={[styles.alertDot, { backgroundColor: colors.destructive }]}
            />
          </Pressable>
        </View>
        <View style={styles.mapWrap}>
          <RouteMap
            userLocation={{ latitude: lat, longitude: lon }}
            userLocationIsFallback={isFallback}
            nearbyDrivers={pins}
            interactive
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.mapBadge, { backgroundColor: colors.card }]}>
            <View
              style={[styles.onlineDot, { backgroundColor: colors.success }]}
            />
            <Text style={[styles.mapBadgeText, { color: colors.foreground }]}>
              {pins.length} e-trikes nearby
            </Text>
          </View>
        </View>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <Pressable
            onPress={() => router.push("/trips")}
            style={[
              styles.search,
              {
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
          >
            <Feather name="search" size={21} color={colors.foreground} />
            <Text
              style={[styles.searchText, { color: colors.mutedForeground }]}
            >
              Where are you going?
            </Text>
          </Pressable>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shortcuts}
          >
            {shortcuts.map((item) => (
              <Pressable
                key={item.sub}
                onPress={() => router.push("/trips")}
                style={[
                  styles.shortcut,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Feather name={item.icon} size={18} color={colors.primary} />
                <Text
                  style={[styles.shortcutTitle, { color: colors.foreground }]}
                >
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.shortcutSub,
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {item.sub}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={[styles.eco, { backgroundColor: colors.secondary }]}>
            <View style={[styles.ecoIcon, { backgroundColor: colors.primary }]}>
              <Feather name="zap" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ecoTitle, { color: colors.primaryStrong }]}>
                Green rides, stronger Apayao.
              </Text>
              <Text style={[styles.ecoSub, { color: colors.mutedForeground }]}>
                Choose E-Trike. Ride sustainably.
              </Text>
            </View>
            <Feather name="feather" size={22} color={colors.primary} />
          </View>
          <Button
            title="Book a ride"
            size="lg"
            onPress={() => router.push("/trips")}
            icon={
              <Feather
                name="truck"
                size={20}
                color={colors.primaryForeground}
              />
            }
          />
          {recent && (
            <Pressable
              onPress={() => router.push(`/trip/${recent.id}`)}
              style={[styles.recent, { borderColor: colors.border }]}
            >
              <View
                style={[styles.recentIcon, { backgroundColor: colors.muted }]}
              >
                <Feather name="clock" size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.recentTitle, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {recent.dropoffAddress || "Recent trip"}
                </Text>
                <Text
                  style={[styles.recentSub, { color: colors.mutedForeground }]}
                >
                  {recent.status.replace("_", " ")}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: -0.5 },
  greeting: { fontFamily: "Inter_700Bold", fontSize: 20, marginTop: 18 },
  location: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  locationText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  alert: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  alertDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  mapWrap: { height: 280, overflow: "hidden" },
  mapBadge: {
    position: "absolute",
    left: 18,
    top: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 18,
    paddingHorizontal: 12,
    height: 36,
    elevation: 4,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  mapBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  sheet: {
    marginTop: -18,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    gap: 16,
    elevation: 8,
  },
  search: {
    height: 58,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchText: { fontFamily: "Inter_400Regular", fontSize: 15 },
  shortcuts: { gap: 10 },
  shortcut: {
    width: 124,
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    gap: 3,
  },
  shortcutTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginTop: 5,
  },
  shortcutSub: { fontFamily: "Inter_400Regular", fontSize: 10 },
  eco: {
    borderRadius: 17,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ecoIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ecoTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  ecoSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3 },
  recent: {
    borderTopWidth: 1,
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  recentIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  recentTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  recentSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textTransform: "capitalize",
    marginTop: 2,
  },
});
