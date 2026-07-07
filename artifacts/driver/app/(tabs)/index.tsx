import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { RouteMap } from '@/components/RouteMap';
import { Feather } from '@expo/vector-icons';
import { useDriverStatus } from '@/contexts/DriverStatusContext';
import { useListTrips, getListTripsQueryKey } from '@workspace/api-client-react';
import * as Haptics from 'expo-haptics';

export default function DriveScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { isOnline, location, toggling, error, goOnline, goOffline } = useDriverStatus();

  // While online, poll for trips assigned to this driver. A 'matched' trip is a
  // new request waiting to be accepted; 'in_progress' is the active ride.
  const { data } = useListTrips(
    { limit: 10 },
    {
      query: {
        queryKey: getListTripsQueryKey({ limit: 10 }),
        refetchInterval: isOnline ? 5000 : false,
        enabled: isOnline,
      },
    },
  );

  const activeTrip = useMemo(
    () => data?.trips?.find((t) => t.status === 'in_progress'),
    [data],
  );
  const incomingTrip = useMemo(
    () => data?.trips?.find((t) => t.status === 'matched'),
    [data],
  );

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isOnline) goOffline();
    else goOnline();
  };

  const driverCoord = location
    ? { latitude: location.lat, longitude: location.lon }
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Map fills the screen; driver's own position shown */}
      {driverCoord ? (
        <RouteMap
          userLocation={driverCoord}
          nearbyDrivers={
            driverCoord
              ? [{ id: 'me', latitude: driverCoord.latitude, longitude: driverCoord.longitude, label: 'You' }]
              : []
          }
          interactive
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.mapPlaceholder, { backgroundColor: colors.muted }]}>
          <Feather name="map-pin" size={40} color={colors.mutedForeground} />
          <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>
            {isOnline ? 'Getting your location…' : 'Go online to start driving'}
          </Text>
        </View>
      )}

      {/* Online status pill */}
      <View style={[styles.statusPill, { top: insets.top + 12, backgroundColor: colors.card }]}>
        <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10b981' : colors.mutedForeground }]} />
        <Text style={[styles.statusText, { color: colors.foreground }]}>
          {isOnline ? 'Online' : 'Offline'}
        </Text>
      </View>

      {/* Bottom control area */}
      <ScrollView
        style={[styles.sheet, { backgroundColor: colors.card }]}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.destructive + '18' }]}>
            <Feather name="alert-circle" size={16} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        )}

        {/* Incoming trip request */}
        {incomingTrip ? (
          <Card style={[styles.tripCard, { borderColor: colors.primary, borderWidth: 2 }]}>
            <View style={styles.tripHeader}>
              <Text style={[styles.tripTitle, { color: colors.foreground }]}>New Ride Request</Text>
              <Badge label="matched" variant="secondary" />
            </View>
            <View style={styles.tripRow}>
              <Feather name="navigation" size={16} color={colors.primary} />
              <Text style={[styles.tripAddr, { color: colors.foreground }]} numberOfLines={1}>
                {incomingTrip.pickupAddress || 'Pickup'}
              </Text>
            </View>
            <View style={styles.tripRow}>
              <Feather name="map-pin" size={16} color={colors.destructive} />
              <Text style={[styles.tripAddr, { color: colors.foreground }]} numberOfLines={1}>
                {incomingTrip.dropoffAddress || 'Dropoff'}
              </Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={[styles.fareLabel, { color: colors.mutedForeground }]}>Fare</Text>
              <Text style={[styles.fareValue, { color: colors.foreground }]}>
                {incomingTrip.fareAmount != null ? `₱${incomingTrip.fareAmount.toFixed(2)}` : '--'}
              </Text>
            </View>
            <Button
              title="View & Accept"
              onPress={() => router.push(`/trip/${incomingTrip.id}`)}
              style={{ marginTop: 12 }}
            />
          </Card>
        ) : activeTrip ? (
          <Card style={[styles.tripCard, { borderColor: colors.accent, borderWidth: 2 }]}>
            <View style={styles.tripHeader}>
              <Text style={[styles.tripTitle, { color: colors.foreground }]}>Active Trip</Text>
              <Badge label="in progress" variant="warning" />
            </View>
            <View style={styles.tripRow}>
              <Feather name="map-pin" size={16} color={colors.destructive} />
              <Text style={[styles.tripAddr, { color: colors.foreground }]} numberOfLines={1}>
                {activeTrip.dropoffAddress || 'Dropoff'}
              </Text>
            </View>
            <Button
              title="Continue Trip"
              onPress={() => router.push(`/trip/${activeTrip.id}`)}
              style={{ marginTop: 12 }}
            />
          </Card>
        ) : (
          isOnline && (
            <View style={styles.waiting}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.waitingText, { color: colors.mutedForeground }]}>
                Waiting for ride requests…
              </Text>
            </View>
          )
        )}

        {/* Go online / offline */}
        <Button
          title={toggling ? '' : isOnline ? 'Go Offline' : 'Go Online'}
          variant={isOnline ? 'destructive' : 'default'}
          onPress={handleToggle}
          loading={toggling}
          style={{ marginTop: incomingTrip || activeTrip ? 16 : 24 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  placeholderText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  statusPill: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '55%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  tripCard: { padding: 16, gap: 8 },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tripTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  tripAddr: { fontSize: 14, fontFamily: 'Inter_500Medium', flex: 1 },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  fareLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  fareValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  waiting: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  waitingText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});
