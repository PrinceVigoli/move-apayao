import React from "react";
import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { FixedLoopService } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { RouteMap } from "@/components/RouteMap";

const statusLabels: Record<string, string> = { off_duty: "Off duty", scheduled: "Ready for service", boarding: "Boarding", on_route: "On route" };
export function FixedLoopVehicleCard({ service, map = true }: { service: FixedLoopService; map?: boolean }) {
  const colors = useColors();
  const point = service.location ? { latitude: service.location.lat, longitude: service.location.lon } : null;
  return <View style={{ borderRadius: 18, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, overflow: "hidden" }}>
    {map && point && <View style={{ height: 220 }}><RouteMap driver={point} followDriver interactive showRecenterButton={false} style={{ flex: 1 }} /></View>}
    <View style={{ padding: 16, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><Feather name="truck" size={24} color={colors.primary} /><Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 17, flex: 1 }}>{service.unitLabel}</Text></View>
      <Text style={{ color: colors.primaryStrong, fontFamily: "Inter_600SemiBold" }}>Fixed loop · {statusLabels[service.vehicleStatus] || service.vehicleStatus}</Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 20 }}>{point ? "Live e-jeep location · updates automatically" : "Vehicle GPS location is currently unavailable. Scheduled departures can still be reserved."}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{service.seatedCapacity} seated + {service.standingCapacity} standing places per departure</Text>
    </View>
  </View>;
}
