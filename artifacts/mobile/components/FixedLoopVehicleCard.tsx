import React from "react";
import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  fixedLoopDirection,
  formatManilaTime,
  type FixedLoopRun,
  type FixedLoopService,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { RouteMap } from "@/components/RouteMap";
import { Button } from "@/components/ui/Button";

const statusLabels: Record<string, string> = {
  off_duty: "Off duty",
  scheduled: "Ready for service",
  boarding: "Boarding",
  on_route: "On route",
};
export function FixedLoopVehicleCard({
  service,
  map = true,
  nextRun,
  onReserve,
  departuresLoading,
  departuresError,
  onRetryDepartures,
}: {
  service: FixedLoopService;
  map?: boolean;
  nextRun?: FixedLoopRun;
  onReserve?: () => void;
  departuresLoading?: boolean;
  departuresError?: boolean;
  onRetryDepartures?: () => void;
}) {
  const colors = useColors();
  const point = service.location
    ? { latitude: service.location.lat, longitude: service.location.lon }
    : null;
  const displayRun = nextRun ?? service.activeRun;
  return (
    <View
      style={{
        borderRadius: 22,
        backgroundColor: colors.secondary,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ padding: 20, gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: 20,
              backgroundColor: colors.primary,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Feather name="truck" size={32} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text
              style={{
                color: colors.primaryStrong,
                fontFamily: "Inter_700Bold",
                fontSize: 13,
              }}
            >
              {statusLabels[service.vehicleStatus] || service.vehicleStatus}
            </Text>
            <Text
              style={{
                color: colors.foreground,
                fontFamily: "Inter_700Bold",
                fontSize: 22,
              }}
            >
              {displayRun
                ? fixedLoopDirection(displayRun.direction)
                : "Pudtol ↔ ASC"}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              {displayRun?.direction === "to_pudtol"
                ? "Via national highway"
                : "Via Payanan Road"}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Feather name="circle" size={14} color={colors.primaryStrong} />
          <Text
            style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}
          >
            {displayRun?.direction === "to_pudtol" ? "ASC" : "Pudtol"}
          </Text>
          <View
            style={{ flex: 1, height: 1, backgroundColor: colors.primary }}
          />
          <Feather name="map-pin" size={16} color={colors.primaryStrong} />
          <Text
            style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}
          >
            {displayRun?.direction === "to_pudtol" ? "Pudtol" : "ASC"}
          </Text>
        </View>
        {onReserve && (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 16,
              gap: 6,
            }}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
              Next departure today
            </Text>
            <Text
              style={{
                color: colors.primaryStrong,
                fontFamily: "Inter_700Bold",
                fontSize: nextRun ? 32 : 20,
              }}
            >
              {departuresLoading
                ? "Finding departures…"
                : departuresError
                  ? "Schedule unavailable"
                  : nextRun
                    ? formatManilaTime(nextRun.departureAt)
                    : "See upcoming departures"}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              {service.seatedCapacity} seats · {service.standingCapacity}{" "}
              standing capacity
            </Text>
            {departuresError && onRetryDepartures && (
              <Button
                title="Retry schedule"
                variant="outline"
                size="sm"
                onPress={onRetryDepartures}
              />
            )}
          </View>
        )}
        {onReserve && (
          <Button
            title="Reserve a place"
            size="lg"
            onPress={onReserve}
            icon={
              <Feather
                name="arrow-right"
                size={20}
                color={colors.primaryForeground}
              />
            }
          />
        )}
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
          {service.unitLabel}
          {!onReserve
            ? ` · ${service.seatedCapacity} seats + ${service.standingCapacity} standing`
            : ""}
        </Text>
      </View>
      {map && point && (
        <View style={{ height: 200 }}>
          <RouteMap
            driver={point}
            followDriver
            interactive
            showRecenterButton={false}
            style={{ flex: 1 }}
          />
        </View>
      )}
      {map && (
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 16,
            paddingTop: point ? 12 : 0,
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
          }}
        >
          <Feather
            name={point ? "navigation" : "info"}
            size={14}
            color={colors.primaryStrong}
          />
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 12,
              lineHeight: 18,
              flex: 1,
            }}
          >
            {point
              ? "Live e-jeep location · updates automatically"
              : "GPS location unavailable. You can still reserve a scheduled departure."}
          </Text>
        </View>
      )}
    </View>
  );
}
