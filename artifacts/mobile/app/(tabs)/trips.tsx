import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  Pressable,
  ActivityIndicator,
  Linking,
  Keyboard,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
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
type SelectMode = 'pickup' | 'dropoff';

// Reverse-geocodes a coordinate into a short human-readable label using the
// free OS geocoder. Only used for taps on UNLABELED map spots — POI taps
// carry their own name, which is better. Falls back to raw coordinates.
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

  const { lat, lon, isFallback, loading: locLoading, permission, refresh } = useLocation();

  const [pickupCoord, setPickupCoord] = useState<LatLng | null>(null);
  const [dropoffCoord, setDropoffCoord] = useState<LatLng | null>(null);
  const [pickupLabel, setPickupLabel] = useState('');
  const [dropoffLabel, setDropoffLabel] = useState('');
  // Which point the next map tap sets. Never null — the map should always
  // respond to a tap. Defaults to dropoff (the thing people adjust most).
  const [selectMode, setSelectMode] = useState<SelectMode>('dropoff');
  const [geocoding, setGeocoding] = useState(false);
  const [passengerCount, setPassengerCount] = useState(1);
  // Collapse the booking sheet to a slim peek bar so the map is actually
  // tappable on small screens (Grab-style).
  const [sheetCollapsed, setSheetCollapsed] = useState(false);

  const [searchField, setSearchField] = useState<SelectMode | null>(null);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const sessionTokenRef = useRef<string>(newPlacesSessionToken());

  // Seed pickup from the first real GPS fix (unless already set manually).
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

  const applyPoint = useCallback(
    async (mode: SelectMode, coord: LatLng, presetLabel?: string) => {
      Haptics.selectionAsync();
      Keyboard.dismiss();
      setPredictions([]);
      setSearchField(null);
      if (mode === 'pickup') {
        setPickupCoord(coord);
        setPickupLabel(presetLabel ?? 'Locating…');
      } else {
        setDropoffCoord(coord);
        setDropoffLabel(presetLabel ?? 'Locating…');
      }
      if (!presetLabel) {
        setGeocoding(true);
        const label = await labelForCoord(coord);
        if (mode === 'pickup') setPickupLabel(label);
        else setDropoffLabel(label);
        setGeocoding(false);
      }
      // After a pickup tap, switch back to dropoff (the common next step);
      // after a dropoff tap, STAY on dropoff so repeat taps keep adjusting it
      // instead of being silently ignored.
      setSelectMode('dropoff');
    },
    [],
  );

  // Map taps: POI taps arrive with the place's own name as `label`;
  // blank-map taps get reverse-geocoded.
  const handleMapPress = useCallback(
    (coord: LatLng, label?: string) => {
      void applyPoint(selectMode, coord, label);
    },
    [selectMode, applyPoint],
  );

  // Debounced text search with availability feedback.
  const runSearch = useCallback((field: SelectMode, text: string) => {
    if (field === 'pickup') setPickupLabel(text);
    else setDropoffLabel(text);
    setSearchField(field);
    setSearchUnavailable(false);
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
      const result = await searchPlaces(text, sessionTokenRef.current);
      setPredictions(result.predictions);
      setSearchUnavailable(result.unavailable);
      setSearching(false);
    }, 350);
    return () => clearTimeout(handle);
  }, [pickupLabel, dropoffLabel, searchField]);

  const pickPrediction = useCallback(
    async (field: SelectMode, pred: PlacePrediction) => {
      Haptics.selectionAsync();
      setPredictions([]);
      setSearchField(null);
      Keyboard.dismiss();
      setGeocoding(true);
      const details = await getPlaceDetails(pred.placeId, sessionTokenRef.current);
      sessionTokenRef.current = newPlacesSessionToken();
      setGeocoding(false);
      if (!details) {
        Alert.alert('Could not locate that place', 'Please tap the map to set this point instead.');
        return;
      }
      await applyPoint(
        field,
        { latitude: details.lat, longitude: details.lon },
        details.address || pred.primary,
      );
    },
    [applyPoint],
  );

  const handleBook = () => {
    if (!pickupCoord || !pickupLabel.trim()) {
      Alert.alert('Set pickup', 'Tap the map (or search) to set your pickup point.');
      return;
    }
    if (!dropoffCoord || !dropoffLabel.trim()) {
      Alert.alert('Set destination', 'Tap the map (or search) to set where you want to go.');
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
  const permissionDenied = permission === 'denied';

  const clearPoint = (mode: SelectMode) => {
    Haptics.selectionAsync();
    if (mode === 'pickup') {
      setPickupCoord(null);
      setPickupLabel('');
    } else {
      setDropoffCoord(null);
      setDropoffLabel('');
    }
    setSelectMode(mode);
    setSheetCollapsed(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <RouteMap
        pickup={pickupCoord ?? undefined}
        dropoff={dropoffCoord ?? undefined}
        userLocation={{ latitude: lat, longitude: lon }}
        userLocationIsFallback={isFallback}
        nearbyDrivers={bothSet ? undefined : driverPins}
        onMapPress={handleMapPress}
        onPickupDragEnd={(c) => void applyPoint('pickup', c)}
        onDropoffDragEnd={(c) => void applyPoint('dropoff', c)}
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

      {/* Tap-target hint */}
      <View style={[styles.tapHint, { top: insets.top + 64, backgroundColor: colors.primary }]}>
        <Feather name="map-pin" size={14} color={colors.primaryForeground} />
        <Text style={[styles.tapHintText, { color: colors.primaryForeground }]}>
          Tap the map or a place name to set your {selectMode === 'pickup' ? 'pickup' : 'destination'}
        </Text>
      </View>

      {/* Location permission banner */}
      {permissionDenied && (
        <View style={[styles.permBanner, { top: insets.top + 108, backgroundColor: colors.card, borderColor: colors.destructive }]}>
          <Feather name="alert-triangle" size={15} color={colors.destructive} />
          <Text style={[styles.permText, { color: colors.foreground }]}>
            Location is off — tap the map to set pickup manually, or{' '}
            <Text
              style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}
              onPress={() => Linking.openSettings().then(() => refresh())}
            >
              open Settings
            </Text>
          </Text>
        </View>
      )}

      {locLoading && !permissionDenied && (
        <View style={[styles.locating, { top: insets.top + 108, backgroundColor: colors.card }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.locatingText, { color: colors.mutedForeground }]}>
            Finding your location…
          </Text>
        </View>
      )}

      {/* Bottom booking sheet — collapsible so the map stays tappable */}
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.sheetWrap}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 90 }]}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              Keyboard.dismiss();
              setSheetCollapsed((c) => !c);
            }}
            style={styles.grabberHit}
            hitSlop={10}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {sheetCollapsed
                  ? dropoffLabel
                    ? `To: ${dropoffLabel}`
                    : 'Where to?'
                  : 'Where to?'}
              </Text>
              <Feather
                name={sheetCollapsed ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.mutedForeground}
              />
            </View>
          </Pressable>

          {!sheetCollapsed && (
            <>
              <View style={styles.inputWrapper}>
                <View style={styles.dotLine}>
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                  <View style={[styles.line, { backgroundColor: colors.border }]} />
                  <View style={[styles.square, { backgroundColor: colors.destructive }]} />
                </View>
                <View style={styles.inputs}>
                  {/* Pickup row */}
                  <View
                    style={[
                      styles.fieldRow,
                      {
                        borderColor:
                          selectMode === 'pickup' || searchField === 'pickup'
                            ? colors.primary
                            : colors.border,
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
                      onFocus={() => {
                        setSearchField('pickup');
                        setSelectMode('pickup');
                      }}
                    />
                    {pickupCoord ? (
                      <Pressable onPress={() => clearPoint('pickup')} hitSlop={8}>
                        <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    ) : (
                      <Feather
                        name="crosshair"
                        size={16}
                        color={selectMode === 'pickup' ? colors.primary : colors.mutedForeground}
                      />
                    )}
                  </View>

                  {/* Dropoff row */}
                  <View
                    style={[
                      styles.fieldRow,
                      {
                        marginTop: 10,
                        borderColor:
                          selectMode === 'dropoff' || searchField === 'dropoff'
                            ? colors.primary
                            : colors.border,
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
                      onFocus={() => {
                        setSearchField('dropoff');
                        setSelectMode('dropoff');
                      }}
                    />
                    {geocoding || (searching && searchField === 'dropoff') ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : dropoffCoord ? (
                      <Pressable onPress={() => clearPoint('dropoff')} hitSlop={8}>
                        <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    ) : (
                      <Feather
                        name="map-pin"
                        size={16}
                        color={selectMode === 'dropoff' ? colors.destructive : colors.mutedForeground}
                      />
                    )}
                  </View>
                </View>
              </View>

              {/* Search results / availability feedback */}
              {searchField && (predictions.length > 0 || (!searching && searchUnavailable)) && (
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
                  {predictions.length === 0 && searchUnavailable && (
                    <View style={styles.predictionRow}>
                      <Feather name="wifi-off" size={15} color={colors.mutedForeground} style={{ marginRight: 10 }} />
                      <Text style={[styles.predSecondary, { color: colors.mutedForeground, flex: 1 }]}>
                        Search is unavailable right now — tap your destination on the map instead.
                      </Text>
                    </View>
                  )}
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
            </>
          )}
        </View>
      </KeyboardAvoidingView>
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
  permBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    elevation: 3,
  },
  permText: { fontSize: 12.5, fontFamily: 'Inter_500Medium', flex: 1, lineHeight: 17 },
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
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
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
  grabberHit: { alignItems: 'stretch' },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', flex: 1 },
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
