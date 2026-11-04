import { getGetFixedLoopServiceQueryKey } from "@workspace/api-client-react";
import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetFixedLoopService } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/ui/Button";
export default function FixedLoopRoutesScreen() {
  const colors = useColors(), insets = useSafeAreaInsets();
  const query = useGetFixedLoopService({ query: { queryKey: getGetFixedLoopServiceQueryKey(), refetchInterval: 15_000 } });
  const service = query.data?.service;
  return <ScrollView style={{ backgroundColor: colors.background, flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 }}>
    <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground }}>Loop stops</Text>
    <Text style={{ color: colors.mutedForeground, marginTop: 10, marginBottom: 20 }}>Pickup and drop-off choices follow the direction of travel.</Text>
    {query.isLoading ? <ActivityIndicator color={colors.primary} /> : !service ? <View style={{ gap: 14 }}><Text style={{ color: colors.mutedForeground }}>{query.isError ? "Could not load stops. Check your connection." : "The operator is preparing this service."}</Text><Button title="Refresh" variant="outline" onPress={() => query.refetch()} /></View> : [
      { title: "Pudtol → ASC", road: "Via Payanan Road", stops: service.outboundStops },
      { title: "ASC → Pudtol", road: "Via national highway", stops: service.returnStops },
    ].map(direction => <View key={direction.title} style={{ padding: 20, borderRadius: 16, backgroundColor: colors.card, marginBottom: 18, gap: 12 }}>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 19 }}>{direction.title}</Text><Text style={{ color: colors.primaryStrong }}>{direction.road}</Text>
      {direction.stops.map((stop, index) => <View key={stop.key} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}><Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", width: 20 }}>{index + 1}</Text><Text style={{ flex: 1, color: colors.foreground, lineHeight: 23 }}>{stop.name}</Text></View>)}
    </View>)}
  </ScrollView>;
}
