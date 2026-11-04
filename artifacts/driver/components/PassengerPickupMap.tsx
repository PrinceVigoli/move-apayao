import React, { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import {
  getPassengerMapPins,
  getPassengerAvatar,
  type PassengerMapPin,
  type FixedLoopRun,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useDriverStatus } from "@/contexts/DriverStatusContext";
import { Button } from "@/components/ui/Button";

function PassengerMarker({ pin }: { pin: PassengerMapPin }) {
  const colors = useColors();
  const [loaded, setLoaded] = useState(false);
  const avatar = useQuery({
    queryKey: ["passenger-avatar", pin.reservationId, pin.avatarVersion],
    queryFn: () => getPassengerAvatar(pin.reservationId),
    enabled: pin.hasAvatar,
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    setLoaded(false);
  }, [pin.avatarVersion]);
  return (
    <Marker
      coordinate={{ latitude: pin.lat, longitude: pin.lon }}
      title={pin.name}
      description={`Pickup: ${pin.pickupName}${pin.accuracyM != null ? ` · location accuracy about ${Math.round(pin.accuracyM)} m` : ""}`}
      tracksViewChanges={!!avatar.data?.avatarUrl && !loaded}
      anchor={{ x: 0.5, y: 1 }}
    >
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            borderWidth: 3,
            borderColor: colors.accent,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {avatar.data?.avatarUrl ? (
            <Image
              source={{ uri: avatar.data.avatarUrl }}
              onLoadEnd={() => setLoaded(true)}
              style={{ width: 42, height: 42, borderRadius: 21 }}
            />
          ) : (
            <Text
              style={{
                color: colors.primaryForeground,
                fontFamily: "Inter_700Bold",
                fontSize: 21,
              }}
            >
              {pin.name[0]?.toUpperCase() || "P"}
            </Text>
          )}
        </View>
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 6,
            padding: 4,
            maxWidth: 140,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: colors.foreground,
              fontSize: 12,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            {pin.name.split(" ")[0]}
          </Text>
        </View>
      </View>
    </Marker>
  );
}

export function PassengerPickupMap({ run }: { run: FixedLoopRun }) {
  const colors = useColors(),
    driver = useDriverStatus();
  const map = useRef<MapView | null>(null),
    framed = useRef(false);
  const [ready, setReady] = useState(false);
  const enabled = ["scheduled", "boarding", "on_route"].includes(run.status);
  const query = useQuery({
    queryKey: ["passenger-pickup-map", run.id],
    queryFn: () => getPassengerMapPins(run.id),
    enabled,
    refetchInterval: 5_000,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // Hide expired pins even when a polling request fails or the app resumes.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  const pins = enabled
    ? (query.data?.passengers ?? []).filter(
        (pin) => now - Date.parse(pin.capturedAt) <= 45_000,
      )
    : [];
  const driverPoint = driver.location
    ? { latitude: driver.location.lat, longitude: driver.location.lon }
    : null;
  const stop = run.stops[run.currentStopIndex];
  const center =
    driverPoint ??
    (pins[0]
      ? { latitude: pins[0].lat, longitude: pins[0].lon }
      : stop?.lat != null && stop?.lon != null
        ? { latitude: stop.lat, longitude: stop.lon }
        : { latitude: 18.3121, longitude: 121.3214 });
  const fit = () => {
    const points = [
      ...pins.map((pin) => ({ latitude: pin.lat, longitude: pin.lon })),
      ...(driverPoint ? [driverPoint] : []),
    ];
    if (points.length > 1)
      map.current?.fitToCoordinates(points, {
        edgePadding: { top: 60, bottom: 70, left: 55, right: 55 },
        animated: true,
      });
    else
      map.current?.animateToRegion(
        {
          ...(points[0] ?? center),
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        500,
      );
  };
  useEffect(() => {
    framed.current = false;
  }, [run.id]);
  useEffect(() => {
    if (ready && pins.length && !framed.current) {
      fit();
      framed.current = true;
    }
  }, [ready, pins.length, run.id]);
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 20,
        overflow: "hidden",
      }}
    >
      <View style={{ padding: 18, gap: 8 }}>
        <Text
          style={{
            color: colors.foreground,
            fontSize: 19,
            fontFamily: "Inter_700Bold",
          }}
        >
          Passenger pickup map
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.mutedForeground, lineHeight: 20 }}
        >
          {query.isError
            ? "Could not refresh passenger locations. Pins expire automatically."
            : `${pins.length} passenger${pins.length === 1 ? " is" : "s are"} sharing a recent pickup location.`}
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          Tap a photo to see the passenger name and booked pickup stop. Photos
          and live positions appear only when passengers choose to share.
        </Text>
      </View>
      <MapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={{ height: 300 }}
        initialRegion={{
          ...center,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        }}
        onMapReady={() => setReady(true)}
        toolbarEnabled={false}
      >
        {driverPoint && (
          <Marker
            coordinate={driverPoint}
            title="Your e-jeep"
            tracksViewChanges={false}
          >
            <View
              style={{
                padding: 10,
                borderRadius: 22,
                backgroundColor: colors.accent,
              }}
            >
              <Feather name="truck" size={22} color={colors.accentForeground} />
            </View>
          </Marker>
        )}
        {pins.map((pin) => (
          <PassengerMarker key={pin.reservationId} pin={pin} />
        ))}
      </MapView>
      <View style={{ padding: 14 }}>
        <Button
          title={query.isError ? "Retry locations" : "Show passengers on map"}
          variant="outline"
          onPress={() => {
            if (query.isError) void query.refetch();
            fit();
          }}
        />
      </View>
    </View>
  );
}
