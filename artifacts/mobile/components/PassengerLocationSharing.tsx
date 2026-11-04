import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import {
  startPassengerSharing,
  stopPassengerSharing,
  updatePassengerSharing,
  type PassengerPoint,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/useColors";

export function PassengerLocationSharing({
  reservationId,
}: {
  reservationId: number;
}) {
  const colors = useColors();
  const [sharing, setSharing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const wanted = useRef(false),
    session = useRef<string | null>(null),
    point = useRef<PassengerPoint | null>(null);
  const watch = useRef<Location.LocationSubscription | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sending = useRef(false);
  const stop = useCallback(
    (visible = true) => {
      wanted.current = false;
      watch.current?.remove();
      watch.current = null;
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      const old = session.current;
      session.current = null;
      point.current = null;
      if (visible) {
        setSharing(false);
        setMessage("Location sharing is off.");
      }
      if (old)
        void stopPassengerSharing(reservationId, old).catch(() => {
          if (visible)
            setMessage(
              "Sharing stopped on this phone. The last pin will disappear within a minute.",
            );
        });
    },
    [reservationId],
  );
  useFocusEffect(
    useCallback(() => {
      setSharing(false);
      setMessage("");
      return () => stop(false);
    }, [stop]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && session.current) stop();
    });
    return () => subscription.remove();
  }, [stop]);
  const fromFix = (fix: Location.LocationObject): PassengerPoint => ({
    lat: fix.coords.latitude,
    lon: fix.coords.longitude,
    accuracyM: fix.coords.accuracy,
    capturedAt: new Date(fix.timestamp).toISOString(),
  });
  const start = async () => {
    if (busy || wanted.current) return;
    wanted.current = true;
    setBusy(true);
    setMessage("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Allow location access to share your pickup position. You can still travel using your selected pickup stop.",
        );
      const first = fromFix(
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
      );
      if (!wanted.current || AppState.currentState !== "active") {
        wanted.current = false;
        return;
      }
      const response = await startPassengerSharing(reservationId, first);
      if (!wanted.current || AppState.currentState !== "active") {
        wanted.current = false;
        await stopPassengerSharing(reservationId, response.sharingId);
        return;
      }
      session.current = response.sharingId;
      point.current = first;
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 0,
          timeInterval: 10_000,
        },
        (fix) => {
          point.current = fromFix(fix);
        },
      );
      if (!wanted.current) {
        subscription.remove();
        return;
      }
      watch.current = subscription;
      setSharing(true);
      setMessage("Your assigned driver can now see your live pickup location.");
      timer.current = setInterval(() => {
        const id = session.current,
          latest = point.current;
        if (!wanted.current || !id || !latest || sending.current) return;
        if (Date.now() - Date.parse(latest.capturedAt) > 40_000) {
          setMessage(
            "Waiting for a fresh GPS fix. Your old location will expire automatically.",
          );
          return;
        }
        sending.current = true;
        void updatePassengerSharing(reservationId, id, latest)
          .then(() => {
            if (wanted.current)
              setMessage(
                "Your assigned driver can see your live pickup location.",
              );
          })
          .catch((error) => {
            const status = (error as { status?: number }).status;
            if (status === 409 || status === 403 || status === 404) {
              stop();
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Location sharing has ended.",
              );
            } else if (wanted.current)
              setMessage(
                "Connection interrupted. The driver sees only recent location updates.",
              );
          })
          .finally(() => {
            sending.current = false;
          });
      }, 10_000);
    } catch (error) {
      stop();
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not start location sharing.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 18,
        padding: 18,
        gap: 12,
      }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontFamily: "Inter_700Bold",
          fontSize: 17,
        }}
      >
        Help your driver find you
      </Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 21 }}>
        Share your current location, name and profile photo with the driver
        assigned to this reservation. Available from one hour before departure.
        Keep this screen open while waiting; sharing stops when you leave it or
        board. Your booked stop remains your pickup point.
      </Text>
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.foreground, lineHeight: 21 }}
        >
          {message}
        </Text>
      )}
      <Button
        title={
          sharing ? "Stop sharing my location" : "Share my pickup location"
        }
        variant={sharing ? "outline" : "default"}
        onPress={sharing ? () => stop() : start}
        loading={busy}
      />
    </View>
  );
}
