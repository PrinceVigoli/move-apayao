import { getGetFixedLoopServiceQueryKey } from "@workspace/api-client-react";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useGetFixedLoopService, useGetProfile } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useManilaGreeting } from "@/hooks/useManilaGreeting";
import { FixedLoopVehicleCard } from "@/components/FixedLoopVehicleCard";
import { Button } from "@/components/ui/Button";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const greeting = useManilaGreeting();
  const profile = useGetProfile();
  const fleet = useGetFixedLoopService({ query: { queryKey: getGetFixedLoopServiceQueryKey(), refetchInterval: 10_000 } });
  const service = fleet.data?.service;
  const firstName = profile.data?.user.fullName?.split(" ")[0] || "there";
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 25 }}>MOVE <Text style={{ color: colors.primary }}>Apayao</Text></Text><Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 19, marginTop: 8 }}>{greeting}, {firstName}</Text></View>
      <Pressable accessibilityLabel="Send feedback" onPress={() => router.push("/feedback" as never)} style={{ padding: 12 }}><Feather name="message-square" size={24} color={colors.primary} /></Pressable>
    </View>
    <Text style={{ color: colors.primaryStrong, fontFamily: "Inter_700Bold", marginBottom: 8 }}>PUDTOL–LUNA FIXED LOOP</Text>
    <Text style={{ color: colors.mutedForeground, fontSize: 15, lineHeight: 22, marginBottom: 20 }}>Find the e-jeep, choose a departure, then reserve your seat or standing place.</Text>
    {fleet.isLoading ? <ActivityIndicator size="large" color={colors.primary} /> : service ? <FixedLoopVehicleCard service={service} /> : <View style={{ padding: 20, backgroundColor: colors.card, borderRadius: 16, gap: 12 }}>
      <Text style={{ fontFamily: "Inter_700Bold", color: colors.foreground }}>{fleet.isError ? "Could not find the e-jeep" : "Fixed-loop service is being prepared"}</Text>
      <Text style={{ color: colors.mutedForeground }}>{fleet.isError ? "Check your connection and refresh." : "Departures will appear once the operator has configured the service."}</Text>
      <Button title="Refresh" variant="outline" onPress={() => fleet.refetch()} />
    </View>}
    <View style={{ gap: 12, marginTop: 20 }}>
      <Button title="Book the e-jeep" size="lg" disabled={!service || fleet.isError} onPress={() => router.push("/trips")} icon={<Feather name="truck" size={20} color={colors.primaryForeground} />} />
      <Button title="My reservations" variant="outline" onPress={() => router.push("/reservations" as never)} />
    </View>
    {service && <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 18, marginTop: 22, gap: 10 }}>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 17 }}>Your daily loop</Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 21 }}>Pudtol → ASC via Payanan Road. Return via Tumog and the national highway.</Text>
      <Pressable onPress={() => router.push("/routes")}><Text style={{ color: colors.primaryStrong, fontFamily: "Inter_600SemiBold" }}>See pickup and drop-off stops →</Text></Pressable>
    </View>}
  </ScrollView>;
}
