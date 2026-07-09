import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import * as Location from 'expo-location';
import {
  useGetNearbyDrivers,
  useCreateTrip,
  getListTripsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from '@/hooks/useLocation';
import { RouteMap, type NearbyDriverPin } from '@/components/RouteMap';
import {
  searchPlaces,
  getPlaceDetails,
  newPlacesSessionToken,
  type PlacePrediction,
} from '@/lib/places';
import * as Haptics from 'expo-haptics';

type LatLng = { latitude: number; longitude: number };
type SelectMode = 'pickup' | 'dropoff' | null;

// Turns a coordinate into a short human-readable label using expo-location's
// built-in reverse geocoder (no extra API key/cost — it rides on the OS
// geocoder). Reverse geocoding a REAL tapped point is far more reliable in
// rural areas than forward-geocoding a typed barangay name, which is why the
// booking flow is tap-first. Falls back to coordinates if nothing resolves.
async function labelForCoord(coord: LatLng): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coord.latitude,
      longitude: coord.longitude,
    });
    const r = results?.[0];
    if (r) {
      const parts = [r.name, r.street, r.district, r.subregion, r.city].filter(
        (p) => p && p.trim().length > 0,
      );
      // De-duplicate consecutive identical parts (common in sparse rural data).
      const deduped = parts.filter((p, i) => p !== parts[i - 1]);
      if (deduped.length > 0) return deduped.slice(0, 3).join(', ');
    }
  } catch {
    /* fall through to coordinates */
  }
  return `${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`;
}

export default function BookRideScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { lat, lon, isFallback, loading: locLoading } = useLocation();

  // Real coordinates for pickup/dropoff. Pickup defaults to the device GPS
  // fix once it arrives; both are fully re-selectable by tapping the map.
  const [pickupCoord, setPickupCoord] = useState<LatLng | null>(null);
  const [dropoffCoord, setDropoffCoord] = useState<LatLng | null>(null);
  const [pickupLabel, setPickupLabel] = useState('');
  const [dropoffLabel, setDropoffLabel] = useState('');
  const [selectMode, setSelectMode] = useState<SelectMode>('dropoff');
  const [geocoding, setGeocoding] = useState(false);
  const [passengerCount, setPassengerCount] = useState(1);

  // Text-search state: which field is being searched, the query, the result
  // predictions, and a Google session token linking autocomplete->details.
  const [searchField, setSearchField] = useState<'pickup' | 'dropoff' | null>(null);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const sessionTokenRef = useRef<string>(newPlacesSessionToken());

  // Seed pickup from the first real GPS fix (unless the user already tapped a
  // custom pickup, or we're still on the Apayao fallback).
  useEffect(() => {
    if (pickupCoord || isFallback || locLoading) return;
    const coord = { latitude: lat, longitude: lon };
    setPickupCoord(coord);
    labelForCoord(coord).then((l) => setPickupLabel((prev) => prev || l));
  }, [lat, lon, isFallback, locLoading, pickupCoord]);

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

  // A tap on the map sets whichever point is currently being selected, then
  // reverse-geocodes it into an editable label.
  const handleMapPress = useCallback(
    async (coord: LatLng) => {
      if (!selectMode) return;
      Haptics.selectionAsync();
      setPredictions([]);
      setSearchField(null);
      if (selectMode === 'pickup') {
        setPickupCoord(coord);
        setPickupLabel('Locating…');
      } else {
        setDropoffCoord(coord);
        setDropoffLabel('Locating…');
      }
      setGeocoding(true);
      const label = await labelForCoord(coord);
      if (selectMode === 'pickup') setPickupLabel(label);
      else setDropoffLabel(label);
      setGeocoding(false);
      // After setting dropoff, stop selection so the user can pan freely.
      setSelectMode((m) => (m === 'dropoff' ? null : m));
    },
    [selectMode],
  );

  // Debounced text search. When the user types in a field, query the Places
  // proxy ~350ms after they stop typing.
  const runSearch = useCallback((field: 'pickup' | 'dropoff', text: string) => {
    if (field === 'pickup') setPickupLabel(text);
    else setDropoffLabel(text);
    setSearchField(field);

    if (text.trim().length < 2) {
      setPredictions([]);
      return;
    }
    setSearching(true);
  }, []);

  useEffect(() => {
    if (!searchField) return;
    const text = searchField === 'pickup' ? pickupLabel : dropoffLabel;
    if (text.trim().length < 2) {
      setPredictions([]);
      setSearching(false);
      return;
    }
    const handle = setTimeout(async () => {
      const results = await searchPlaces(text, sessionTokenRef.current);
      setPredictions(results);
      setSearching(false);
    }, 350);
    return () => clearTimeout(handle);
  }, [pickupLabel, dropoffLabel, searchField]);

  // User tapped one of the text-search results: resolve it to a coordinate,
  // drop the pin (which the map then frames so they can confirm visually),
  // and close the dropdown.
  const pickPrediction = useCallback(
    async (field: 'pickup' | 'dropoff', pred: PlacePrediction) => {
      Haptics.selectionAsync();
      setPredictions([]);
      setSearchField(null);
      setGeocoding(true);
      const details = await getPlaceDetails(pred.placeId, sessionTokenRef.current);
      // Start a fresh session for the next search.
      sessionTokenRef.current = newPlacesSessionToken();
      setGeocoding(false);
      if (!details) {
        Alert.alert(
          'Could not locate that place',
          'Please tap the map to set this point instead.',
        );
        return;
      }
      const coord = { latitude: details.lat, longitude: details.lon };
      const label = details.address || pred.primary;
      if (field === 'pickup') {
        setPickupCoord(coord);
        setPickupLabel(label);
      } else {
        setDropoffCoord(coord);
        setDropoffLabel(label);
      }
      // Leave selection off so the map frames the chosen point for confirmation.
      setSelectMode(null);
    },
    [],
  );

  const handleBook = () => {
    if (!pickupCoord || !pickupLabel.trim()) {
      Alert.alert('Set pickup', 'Please set your pickup point on the map.');
      return;
    }
    if (!dropoffCoord || !dropoffLabel.trim()) {
      Alert.alert('Set destination', 'Tap the map to set where you want to go.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    createTrip.mutate(
      {
        data: {
          pickupAddress: pickupLabel,
          dropoffAddress: dropoffLabel,
          pickupLat: pickupCoord.latitude,
          pickupLon: pickupCoord.longitude,
          dropoffLat: dropoffCoord.latitude,
          dropoffLon: dropoffCoord.longitude,
          passengerCount,
        },
      },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
          setDropoffCoord(null);
          setDropoffLabel('');
          setPassengerCount(1);
          setSelectMode('dropoff');
          router.push(`/trip/${res.trip.id}`);
        },
        onError: () => {
          Alert.alert('Booking Failed', 'Unable to book a ride right now.');
        },
      },
    );
  };

  const bothSet = !!pickupCoord && !!dropoffCoord;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Full-screen map. In route mode (both points set) it frames the route;
          otherwise it shows the user + nearby drivers and accepts taps. */}
      <RouteMap
        pickup={pickupCoord ?? undefined}
        dropoff={dropoffCoord ?? undefined}
        userLocation={{ latitude: lat, longitude: lon }}
        userLocationIsFallback={isFallback}
        nearbyDrivers={bothSet ? undefined : driverPins}
        onMapPress={handleMapPress}
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

      {/* Tap-to-select hint banner */}
      {selectMode && (
        <View style={[styles.tapHint, { top: insets.top + 64, backgroundColor: colors.primary }]}>
          <Feather name="map-pin" size={14} color={colors.primaryForeground} />
          <Text style={[styles.tapHintText, { color: colors.primaryForeground }]}>
            Tap the map to set your {selectMode === 'pickup' ? 'pickup point' : 'destination'}
          </Text>
        </View>
      )}

      {locLoading && (
        <View style={[styles.locating, { top: insets.top + 108, backgroundColor: colors.card }]}>
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

        <View style={styles.inputWrapper}>
          <View style={styles.dotLine}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <View style={[styles.square, { backgroundColor: colors.destructive }]} />
          </View>
          <View style={styles.inputs}>
            {/* Pickup row */}
            <Pressable
              onPress={() => setSelectMode('pickup')}
              style={[
                styles.fieldRow,
                {
                  borderColor: selectMode === 'pickup' || searchField === 'pickup' ? colors.primary : colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <TextInput
                style={[styles.fieldInput, { color: colors.foreground }]}
                placeholder="Search or tap map for pickup"
                placeholderTextColor={colors.mutedForeground}
                value={pickupLabel}
                onChangeText={(t) => runSearch('pickup', t)}
                onFocus={() => setSearchField('pickup')}
              />
              <Feather
                name="crosshair"
                size={16}
                color={selectMode === 'pickup' ? colors.primary : colors.mutedForeground}
              />
            </Pressable>

            {/* Dropoff row */}
            <Pressable
              onPress={() => setSelectMode('dropoff')}
              style={[
                styles.fieldRow,
                {
                  marginTop: 10,
                  borderColor: selectMode === 'dropoff' || searchField === 'dropoff' ? colors.primary : colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <TextInput
                style={[styles.fieldInput, { color: colors.foreground }]}
                placeholder="Search or tap map for destination"
                placeholderTextColor={colors.mutedForeground}
                value={dropoffLabel}
                onChangeText={(t) => runSearch('dropoff', t)}
                onFocus={() => setSearchField('dropoff')}
              />
              {geocoding || (searching && searchField === 'dropoff') ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather
                  name="map-pin"
                  size={16}
                  color={selectMode === 'dropoff' ? colors.destructive : colors.mutedForeground}
                />
              )}
            </Pressable>
          </View>
        </View>

        {/* Text-search results dropdown */}
        {searchField && predictions.length > 0 && (
          <View style={[styles.predictions, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {predictions.map((p) => (
              <Pressable
                key={p.placeId}
                onPress={() => pickPrediction(searchField, p)}
                style={styles.predictionRow}
              >
                <Feather name="map-pin" size={15} color={colors.mutedForeground} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.predPrimary, { color: colors.foreground }]} numberOfLines={1}>
                    {p.primary}
                  </Text>
                  {!!p.secondary && (
                    <Text style={[styles.predSecondary, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {p.secondary}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.seatRow}>
          <View style={styles.seatLabelGroup}>
            <Feather name="users" size={16} color={colors.mutedForeground} />
            <Text style={[styles.seatLabel, { color: colors.foreground }]}>
              {passengerCount} {passengerCount === 1 ? 'passenger' : 'passengers'}
            </Text>
          </View>
          <View style={styles.seatStepper}>
            <Pressable
              onPress={() => setPassengerCount((c) => Math.max(1, c - 1))}
              disabled={passengerCount <= 1}
              style={[styles.seatBtn, { borderColor: colors.border, opacity: passengerCount <= 1 ? 0.4 : 1 }]}
            >
              <Feather name="minus" size={18} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.seatCount, { color: colors.foreground }]}>{passengerCount}</Text>
            <Pressable
              onPress={() => setPassengerCount((c) => Math.min(16, c + 1))}
              disabled={passengerCount >= 16}
              style={[styles.seatBtn, { borderColor: colors.border, opacity: passengerCount >= 16 ? 0.4 : 1 }]}
            >
              <Feather name="plus" size={18} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <Button
          title="Request E-Trike"
          onPress={handleBook}
          loading={createTrip.isPending}
          disabled={!bothSet}
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
  tapHint: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  tapHintText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
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
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  inputWrapper: { flexDirection: 'row', marginTop: 4 },
  dotLine: { alignItems: 'center', marginRight: 12, marginTop: 18 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  line: { width: 2, flex: 1, marginVertical: 4, minHeight: 22 },
  square: { width: 12, height: 12, borderRadius: 2 },
  inputs: { flex: 1 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  fieldInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16 },
  predictions: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  predPrimary: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  predSecondary: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 1 },
  seatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  seatLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seatLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  seatStepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seatBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatCount: { fontSize: 17, fontFamily: 'Inter_700Bold', minWidth: 20, textAlign: 'center' },
});
