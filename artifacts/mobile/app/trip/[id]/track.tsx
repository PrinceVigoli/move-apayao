import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { RouteMap } from '@/components/RouteMap';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Feather } from '@expo/vector-icons';
import { useGetTrip, getGetTripQueryKey } from '@workspace/api-client-react';
import { useTripTracking } from '@/hooks/useTripTracking';

export default function TrackDriverScreen() {
  const { id } = useLocalSearchParams();
  const tripId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const { data, isLoading } = useGetTrip(tripId, {
    query: { queryKey: getGetTripQueryKey(tripId), enabled: !!tripId },
  });
  const trip = data?.trip;

  const trackingEnabled =
    !!trip?.driverId && (trip?.status === 'matched' || trip?.status === 'in_progress');

  const { location, tripStatus, connected, error } = useTripTracking(
    tripId,
    trackingEnabled,
  );

  const status = tripStatus ?? trip?.status ?? 'requested';

  const getStatusVariant = (s: string) => {
    switch (s) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'warning';
      case 'cancelled':
        return 'destructive';
      case 'matched':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (isLoading || !trip) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const driverCoord = location
    ? { latitude: location.lat, longitude: location.lon }
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <RouteMap
        pickup={{ latitude: trip.pickupLat, longitude: trip.pickupLon }}
        dropoff={{ latitude: trip.dropoffLat, longitude: trip.dropoffLon }}
        driver={driverCoord}
        followDriver
        interactive
        style={StyleSheet.absoluteFill}
      />

      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, { top: insets.top + 12, backgroundColor: colors.card }]}
      >
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </Pressable>

      {/* Connection pill */}
      <View style={[styles.connPill, { top: insets.top + 12, backgroundColor: colors.card }]}>
        <View
          style={[
            styles.connDot,
            { backgroundColor: connected ? '#10b981' : colors.mutedForeground },
          ]}
        />
        <Text style={[styles.connText, { color: colors.foreground }]}>
          {connected ? 'Live' : 'Connecting…'}
        </Text>
      </View>

      {/* Bottom info card */}
      <Card style={[styles.infoCard, { bottom: insets.bottom + 20 }]}>
        <View style={styles.infoHeader}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>
            {status === 'in_progress'
              ? 'On the way'
              : status === 'matched'
                ? 'Driver assigned'
                : status === 'completed'
                  ? 'Trip completed'
                  : 'Waiting for driver'}
          </Text>
          <Badge label={status} variant={getStatusVariant(status)} />
        </View>

        {location ? (
          <Text style={[styles.infoSub, { color: colors.mutedForeground }]}>
            Last update {new Date(location.ts).toLocaleTimeString()}
          </Text>
        ) : (
          <Text style={[styles.infoSub, { color: colors.mutedForeground }]}>
            {error ?? 'Waiting for the driver’s location…'}
          </Text>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.locRow}>
          <Feather name="navigation" size={16} color={colors.primary} />
          <Text style={[styles.locText, { color: colors.foreground }]} numberOfLines={1}>
            {trip.pickupAddress || 'Pickup'}
          </Text>
        </View>
        <View style={styles.locRow}>
          <Feather name="map-pin" size={16} color={colors.destructive} />
          <Text style={[styles.locText, { color: colors.foreground }]} numberOfLines={1}>
            {trip.dropoffAddress || 'Dropoff'}
          </Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  connPill: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  connText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  infoCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 16,
    gap: 6,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  infoSub: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  divider: { height: 1, marginVertical: 10 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  locText: { fontSize: 14, fontFamily: 'Inter_500Medium', flex: 1 },
});