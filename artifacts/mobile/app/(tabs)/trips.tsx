import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui/Button';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useGetNearbyDrivers,
  useCreateTrip,
  getListTripsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from '@/hooks/useLocation';
import { RouteMap, type NearbyDriverPin } from '@/components/RouteMap';
import * as Haptics from 'expo-haptics';

export default function BookRideScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { lat, lon, isFallback, loading: locLoading } = useLocation();

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');

  const { data: nearbyData, isLoading: nearbyLoading } = useGetNearbyDrivers(
    { lat, lon, radius: 5 },
    { query: { queryKey: ['nearby-drivers', lat, lon] } },
  );
  const createTrip = useCreateTrip();

  const driverPins: NearbyDriverPin[] = (nearbyData?.drivers ?? [])
    .filter((d) => d.currentLat != null && d.currentLon != null)
    .map((d) => ({
      id: d.userId,
      latitude: d.currentLat as number,
      longitude: d.currentLon as number,
      label: d.fullName ? `${d.fullName} • ${d.vehicleType}` : 'Available e-trike',
    }));

  const availableCount = nearbyData?.drivers?.length ?? 0;

  const handleBook = () => {
    if (!pickup.trim() || !dropoff.trim()) {
      Alert.alert('Missing details', 'Please enter both pickup and dropoff locations.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Pickup defaults to the user's current GPS position; dropoff is offset
    // slightly until geocoding is wired up (the address text is what matters
    // for matching/dispatch today).
    createTrip.mutate(
      {
        data: {
          pickupAddress: pickup,
          dropoffAddress: dropoff,
          pickupLat: lat,
          pickupLon: lon,
          dropoffLat: lat + 0.01,
          dropoffLon: lon + 0.01,
        },
      },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
          setPickup('');
          setDropoff('');
          router.push(`/trip/${res.trip.id}`);
        },
        onError: () => {
          Alert.alert('Booking Failed', 'Unable to book a ride right now.');
        },
      },
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Full-screen map */}
      <RouteMap
        userLocation={{ latitude: lat, longitude: lon }}
        userLocationIsFallback={isFallback}
        nearbyDrivers={driverPins}
        interactive
        style={StyleSheet.absoluteFill}
      />

      {/* Top bar: history + available count */}
      <View style={[styles.topBar, { top: insets.top + 12 }]}>
        <Pressable
          style={[styles.iconBtn, { backgroundColor: colors.card }]}
          onPress={() => router.push('/history')}
        >
          <Feather name="clock" size={20} color={colors.foreground} />
        </Pressable>

        <View style={[styles.countPill, { backgroundColor: colors.card }]}>
          {nearbyLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <View style={[styles.countDot, { backgroundColor: availableCount > 0 ? '#10b981' : colors.mutedForeground }]} />
              <Text style={[styles.countText, { color: colors.foreground }]}>
                {availableCount} e-trike{availableCount === 1 ? '' : 's'} nearby
              </Text>
            </>
          )}
        </View>
      </View>

      {locLoading && (
        <View style={[styles.locating, { top: insets.top + 64, backgroundColor: colors.card }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.locatingText, { color: colors.mutedForeground }]}>
            Finding your location…
          </Text>
        </View>
      )}

      {/* Bottom booking sheet */}
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 90 }]}>
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Where to?</Text>
        {isFallback && !locLoading && (
          <Text style={[styles.fallbackNote, { color: colors.mutedForeground }]}>
            Using Apayao area — enable location for accurate pickup.
          </Text>
        )}

        <View style={styles.inputWrapper}>
          <View style={styles.dotLine}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <View style={[styles.square, { backgroundColor: colors.destructive }]} />
          </View>
          <View style={styles.inputs}>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Pickup location"
              placeholderTextColor={colors.mutedForeground}
              value={pickup}
              onChangeText={setPickup}
            />
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, marginTop: 10 }]}
              placeholder="Where to?"
              placeholderTextColor={colors.mutedForeground}
              value={dropoff}
              onChangeText={setDropoff}
            />
          </View>
        </View>

        <Button
          title="Request E-Trike"
          onPress={handleBook}
          loading={createTrip.isPending}
          icon={<Feather name="navigation" size={18} color={colors.primaryForeground} />}
          style={{ marginTop: 14 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
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
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  countDot: { width: 8, height: 8, borderRadius: 4 },
  countText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  locating: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    elevation: 3,
  },
  locatingText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  fallbackNote: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  inputWrapper: { flexDirection: 'row', marginTop: 8 },
  dotLine: { alignItems: 'center', marginRight: 12, marginTop: 16 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  line: { width: 2, flex: 1, marginVertical: 4, minHeight: 20 },
  square: { width: 12, height: 12, borderRadius: 2 },
  inputs: { flex: 1 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
});