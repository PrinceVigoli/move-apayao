import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { RouteMap } from '@/components/RouteMap';
import { Feather } from '@expo/vector-icons';
import {
  useGetTrip,
  useAcceptTrip,
  useDeclineTrip,
  useCompleteTrip,
  getGetTripQueryKey,
  getListTripsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useDriverStatus } from '@/contexts/DriverStatusContext';
import * as Haptics from 'expo-haptics';

function navigateTo(lat: number, lon: number, label: string) {
  const q = encodeURIComponent(label);
  const url = Platform.select({
    ios: `maps://?daddr=${lat},${lon}&q=${q}`,
    android: `google.navigation:q=${lat},${lon}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`,
  });
  Linking.openURL(url as string).catch(() =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`),
  );
}

export default function DriverTripScreen() {
  const { id } = useLocalSearchParams();
  const tripId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { location } = useDriverStatus();

  const { data, isLoading } = useGetTrip(tripId, {
    query: { queryKey: getGetTripQueryKey(tripId), enabled: !!tripId },
  });
  const trip = data?.trip;

  const acceptTrip = useAcceptTrip();
  const declineTrip = useDeclineTrip();
  const completeTrip = useCompleteTrip();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
    queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
  };

  const onAccept = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    acceptTrip.mutate(
      { id: tripId },
      {
        onSuccess: () => invalidate(),
        onError: (e: any) =>
          Alert.alert('Could not accept', e?.response?.data?.error ?? 'Trip no longer available.'),
      },
    );
  };

  const onDecline = () => {
    Alert.alert('Decline trip?', 'This ride will be offered to another driver.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () =>
          declineTrip.mutate(
            { id: tripId },
            {
              onSuccess: () => {
                invalidate();
                router.back();
              },
              onError: (e: any) =>
                Alert.alert('Could not decline', e?.response?.data?.error ?? 'Try again.'),
            },
          ),
      },
    ]);
  };

  const onComplete = () => {
    Alert.alert('Complete trip?', 'Confirm the passenger has been dropped off.', [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Complete',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          completeTrip.mutate(
            { id: tripId },
            {
              onSuccess: () => {
                invalidate();
                Alert.alert('Trip completed', 'Fare collected. Nice work!');
                router.back();
              },
              onError: (e: any) => {
                const msg =
                  e?.response?.status === 402
                    ? 'Passenger has insufficient wallet balance.'
                    : e?.response?.data?.error ?? 'Could not complete the trip.';
                Alert.alert('Could not complete', msg);
              },
            },
          );
        },
      },
    ]);
  };

  if (isLoading || !trip) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Loading trip…</Text>
      </View>
    );
  }

  const driverCoord = location ? { latitude: location.lat, longitude: location.lon } : null;
  const isMatched = trip.status === 'matched';
  const isActive = trip.status === 'in_progress';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <RouteMap
        pickup={{ latitude: trip.pickupLat, longitude: trip.pickupLon }}
        dropoff={{ latitude: trip.dropoffLat, longitude: trip.dropoffLon }}
        driver={driverCoord}
        interactive
        style={styles.map}
      />

      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, { top: insets.top + 12, backgroundColor: colors.card }]}
      >
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </Pressable>

      <ScrollView
        style={[styles.sheet, { backgroundColor: colors.card }]}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isMatched ? 'New Ride Request' : isActive ? 'Active Trip' : 'Trip'}
          </Text>
          <Badge label={trip.status} variant={isActive ? 'warning' : 'secondary'} />
        </View>

        <Card style={styles.detailsCard}>
          <View style={styles.locRow}>
            <Feather name="navigation" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.locLabel, { color: colors.mutedForeground }]}>Pickup</Text>
              <Text style={[styles.locValue, { color: colors.foreground }]}>
                {trip.pickupAddress || 'Pickup point'}
              </Text>
            </View>
            <Pressable
              onPress={() => navigateTo(trip.pickupLat, trip.pickupLon, 'Pickup')}
              style={[styles.navBtn, { backgroundColor: colors.primary + '18' }]}
            >
              <Feather name="navigation-2" size={16} color={colors.primary} />
            </Pressable>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.locRow}>
            <Feather name="map-pin" size={18} color={colors.destructive} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.locLabel, { color: colors.mutedForeground }]}>Dropoff</Text>
              <Text style={[styles.locValue, { color: colors.foreground }]}>
                {trip.dropoffAddress || 'Destination'}
              </Text>
            </View>
            <Pressable
              onPress={() => navigateTo(trip.dropoffLat, trip.dropoffLon, 'Dropoff')}
              style={[styles.navBtn, { backgroundColor: colors.destructive + '18' }]}
            >
              <Feather name="navigation-2" size={16} color={colors.destructive} />
            </Pressable>
          </View>
        </Card>

        <Card style={styles.fareCard}>
          <View style={styles.fareRow}>
            <Text style={[styles.fareLabel, { color: colors.mutedForeground }]}>Fare</Text>
            <Text style={[styles.fareValue, { color: colors.foreground }]}>
              {trip.fareAmount != null ? `₱${trip.fareAmount.toFixed(2)}` : '--'}
            </Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={[styles.fareLabel, { color: colors.mutedForeground }]}>Distance</Text>
            <Text style={[styles.fareValueSm, { color: colors.foreground }]}>
              {trip.distanceKm != null ? `${trip.distanceKm.toFixed(1)} km` : '--'}
            </Text>
          </View>
        </Card>

        {isMatched && (
          <View style={{ gap: 10, marginTop: 20 }}>
            <Button title="Accept Trip" onPress={onAccept} loading={acceptTrip.isPending} />
            <Button
              title="Decline"
              variant="ghost"
              onPress={onDecline}
              loading={declineTrip.isPending}
            />
          </View>
        )}

        {isActive && (
          <Button
            title="Complete Trip"
            onPress={onComplete}
            loading={completeTrip.isPending}
            style={{ marginTop: 20 }}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  map: { height: '45%', width: '100%' },
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
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '62%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  detailsCard: { padding: 16 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 2 },
  locValue: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, marginVertical: 14, marginLeft: 30 },
  fareCard: { padding: 16, gap: 10, marginTop: 16 },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  fareValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  fareValueSm: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
