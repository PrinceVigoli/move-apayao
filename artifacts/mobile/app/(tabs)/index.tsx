import React from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  getGetFixedLoopServiceQueryKey,
  getListFixedLoopRunsQueryKey,
  getManilaDate,
  useGetFixedLoopService,
  useGetProfile,
  useListFixedLoopRuns,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useManilaGreeting } from "@/hooks/useManilaGreeting";
import { FixedLoopVehicleCard } from "@/components/FixedLoopVehicleCard";
import { Button } from "@/components/ui/Button";

export default function HomeScreen() {
  const colors = useColors(),
    insets = useSafeAreaInsets(),
    router = useRouter();
  const greeting = useManilaGreeting(),
    profile = useGetProfile();
  const date = getManilaDate();
  const fleet = useGetFixedLoopService({
    query: {
      queryKey: getGetFixedLoopServiceQueryKey(),
      refetchInterval: 10_000,
    },
  });
  const service = fleet.data?.service;
  const runs = useListFixedLoopRuns(
    { date },
    {
      query: {
        queryKey: getListFixedLoopRunsQueryKey({ date }),
        enabled: !!service,
        refetchInterval: 20_000,
      },
    },
  );
  const nextRun = runs.data?.runs.find(
    (run) =>
      run.bookingOpen && new Date(run.departureAt).getTime() > Date.now(),
  );
  const firstName = profile.data?.user.fullName?.split(" ")[0] || "there";
  const link = (
    icon: React.ComponentProps<typeof Feather>["name"],
    title: string,
    subtitle: string,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 18,
        paddingHorizontal: 16,
        backgroundColor: pressed ? colors.secondary : colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
      })}
    >
      <Feather name={icon} size={23} color={colors.primaryStrong} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            color: colors.foreground,
            fontFamily: "Inter_600SemiBold",
            fontSize: 16,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          {subtitle}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      refreshControl={
        <RefreshControl
          refreshing={fleet.isRefetching || runs.isRefetching}
          onRefresh={() => {
            fleet.refetch();
            runs.refetch();
          }}
          tintColor={colors.primary}
        />
      }
      contentContainerStyle={{
        padding: 20,
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 110,
        gap: 22,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            color: colors.primaryStrong,
            fontFamily: "Inter_700Bold",
            fontSize: 24,
          }}
        >
          MOVE <Text style={{ fontFamily: "Inter_400Regular" }}>Apayao</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          onPress={() => router.push("/profile")}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 19,
              color: colors.accentForeground,
            }}
          >
            {firstName[0]?.toUpperCase()}
          </Text>
        </Pressable>
      </View>
      <View style={{ gap: 7 }}>
        <Text
          style={{
            color: colors.foreground,
            fontFamily: "Inter_500Medium",
            fontSize: 16,
          }}
        >
          {greeting}, {firstName}
        </Text>
        <Text
          style={{
            color: colors.primaryStrong,
            fontFamily: "Inter_700Bold",
            fontSize: 33,
            letterSpacing: -1,
          }}
        >
          Your daily ride.
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>
          Pudtol–Luna fixed loop
        </Text>
      </View>
      {fleet.isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : service && !fleet.isError ? (
        <FixedLoopVehicleCard
          service={service}
          nextRun={nextRun}
          departuresLoading={runs.isLoading}
          departuresError={runs.isError}
          onRetryDepartures={() => runs.refetch()}
          onReserve={() => router.push("/trips")}
        />
      ) : (
        <View
          style={{
            padding: 22,
            backgroundColor: colors.card,
            borderRadius: 18,
            gap: 14,
          }}
        >
          <Feather name="truck" size={30} color={colors.primary} />
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              color: colors.foreground,
              fontSize: 18,
            }}
          >
            {fleet.isError
              ? "Could not find the e-jeep"
              : "Your daily ride is coming soon"}
          </Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
            {fleet.isError
              ? "Check your connection and try again."
              : "Departures will appear once the operator has configured the service."}
          </Text>
          <Button
            title="Refresh service"
            variant="outline"
            onPress={() => fleet.refetch()}
          />
        </View>
      )}
      <View style={{ gap: 12 }}>
        <Text
          style={{
            color: colors.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 21,
          }}
        >
          Plan your trip
        </Text>
        {link(
          "calendar",
          "Departure schedules",
          "Choose a day and departure time",
          () => router.push("/trips"),
        )}
        {link(
          "map-pin",
          "Pickup & drop-off stops",
          "Explore both directions of the daily loop",
          () => router.push("/routes"),
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/reservations" as never)}
        style={{
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
          padding: 18,
          borderRadius: 16,
          backgroundColor: colors.secondary,
        }}
      >
        <Feather name="bookmark" size={23} color={colors.primaryStrong} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              color: colors.foreground,
              fontFamily: "Inter_700Bold",
              fontSize: 16,
            }}
          >
            My reservations
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            Your tickets, all in one place
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.primaryStrong} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/feedback" as never)}
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
        }}
      >
        <Feather
          name="message-square"
          size={16}
          color={colors.mutedForeground}
        />
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
          Help us improve your ride
        </Text>
      </Pressable>
    </ScrollView>
  );
}
