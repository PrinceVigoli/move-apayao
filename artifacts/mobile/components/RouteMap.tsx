import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Platform, Pressable } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';

type LatLng = { latitude: number; longitude: number };

export type NearbyDriverPin = {
  id: string;
  latitude: number;
  longitude: number;
  label?: string;
};

// Grab-style tight zoom for "here's where you are" — roughly a few blocks
// across, not the wide province-level view used as a loading fallback.
const USER_ZOOM_DELTA = 0.01;

interface RouteMapProps {
  /** Trip mode: draws a pickup->dropoff route line. */
  pickup?: LatLng;
  dropoff?: LatLng;
  /** Assigned driver being tracked (single moving pin). */
  driver?: LatLng | null;
  /** Nearby-available-drivers mode: multiple pins, no route line. */
  nearbyDrivers?: NearbyDriverPin[];
  /** The passenger's/driver's own location (blue dot style pin). */
  userLocation?: LatLng | null;
  /**
   * True while userLocation is still a placeholder (e.g. the Apayao-center
   * fallback used before the first GPS fix arrives). While true, the map
   * will NOT auto-zoom there — it waits for a real fix.
   */
  userLocationIsFallback?: boolean;
  /** Recenter to keep the tracked driver in view as they move. */
  followDriver?: boolean;
  /** Show a Grab-style floating button to snap back to the user's location. */
  showRecenterButton?: boolean;
  style?: any;
  interactive?: boolean;
  onDriverPress?: (id: string) => void;
  /**
   * Fires with the tapped coordinate when the user taps anywhere on the map.
   * Also fires for taps on labeled POIs (stores, churches, terminals — the
   * named places people naturally tap as a destination); in that case the
   * POI's own name is passed as `label`, which is a better address than a
   * reverse geocode. On Android these are two DIFFERENT native events
   * (onPress vs onPoiClick) — wiring only onPress silently swallows POI taps.
   */
  onMapPress?: (coord: LatLng, label?: string) => void;
  /** Makes the pickup pin draggable; fires with the final position. */
  onPickupDragEnd?: (coord: LatLng) => void;
  /** Makes the dropoff pin draggable; fires with the final position. */
  onDropoffDragEnd?: (coord: LatLng) => void;
}

function regionFor(points: LatLng[], fallback?: LatLng): Region {
  if (points.length === 0) {
    const c = fallback ?? { latitude: 18.3121, longitude: 121.3214 };
    return { ...c, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  }
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latDelta = Math.max((maxLat - minLat) * 1.6, 0.01);
  const lonDelta = Math.max((maxLon - minLon) * 1.6, 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

function userRegion(u: LatLng): Region {
  return { ...u, latitudeDelta: USER_ZOOM_DELTA, longitudeDelta: USER_ZOOM_DELTA };
}

/**
 * Interactive Google map with three modes that can combine:
 *  - Route mode: pass pickup + dropoff to draw the trip line.
 *  - Tracking mode: pass driver (+ followDriver) for a live moving pin.
 *  - Nearby mode: pass nearbyDrivers for a Grab-style scatter of available
 *    e-trikes around the user.
 *
 * Grab-style auto-centering: when only userLocation is provided (no
 * pickup/dropoff route to frame), the map automatically animates to a tight
 * zoom on the user's location as soon as a REAL GPS fix arrives — not the
 * wide fallback region used while location is still loading. This only fires
 * once per fix (so it doesn't fight the user for control while they're
 * panning); a floating recenter button lets them snap back anytime after.
 *
 * Requires react-native-maps + a Google Maps API key (app.json). Works in an
 * EAS dev/prod build, not stock Expo Go.
 */
export function RouteMap({
  pickup,
  dropoff,
  driver,
  nearbyDrivers,
  userLocation,
  userLocationIsFallback = false,
  followDriver = false,
  showRecenterButton,
  style,
  interactive = true,
  onDriverPress,
  onMapPress,
  onPickupDragEnd,
  onDropoffDragEnd,
}: RouteMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView | null>(null);
  const hasAutoCenteredRef = useRef(false);
  const lastFramedRef = useRef<string>('');
  const [mapReady, setMapReady] = useState(false);

  const isRouteMode = !!(pickup && dropoff);

  const framePoints: LatLng[] = [
    ...(pickup ? [pickup] : []),
    ...(dropoff ? [dropoff] : []),
    ...(driver ? [driver] : []),
    ...(userLocation ? [userLocation] : []),
    ...((nearbyDrivers ?? []).map((d) => ({ latitude: d.latitude, longitude: d.longitude }))),
  ];

  const initialRegion = regionFor(
    isRouteMode ? [pickup!, dropoff!] : framePoints,
    userLocation ?? undefined,
  );

  // Keep the tracked driver in view as they move (trip tracking screen).
  useEffect(() => {
    if (!followDriver || !driver || !mapRef.current || !mapReady) return;
    const pts = [driver, ...(pickup ? [pickup] : []), ...(dropoff ? [dropoff] : [])];
    mapRef.current.animateToRegion(regionFor(pts), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.latitude, driver?.longitude, followDriver, mapReady]);

  // Grab-style auto-center: the very first time a REAL (non-fallback) user
  // location shows up in "my location" / "nearby drivers" mode (i.e. no
  // pickup->dropoff route to frame instead), snap to a tight zoom on it.
  useEffect(() => {
    if (isRouteMode) return; // route framing takes priority over user-centering
    if (!userLocation || userLocationIsFallback) return;
    if (hasAutoCenteredRef.current) return;
    if (!mapRef.current || !mapReady) return;

    mapRef.current.animateToRegion(userRegion(userLocation), 500);
    hasAutoCenteredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation?.latitude, userLocation?.longitude, userLocationIsFallback, isRouteMode, mapReady]);

  const handleRecenter = () => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.animateToRegion(userRegion(userLocation), 400);
  };

  // Whenever a pickup or dropoff pin is set/moved, bring it into view — a
  // pin chosen from text search can otherwise land off-screen with zero
  // visual feedback. Frames both points when both exist, else zooms tight on
  // the one that changed. Keyed on the coordinate string so it fires exactly
  // once per change and never fights the user's own panning.
  useEffect(() => {
    if (!mapRef.current || !mapReady || followDriver) return;
    const key = `${pickup?.latitude ?? ''},${pickup?.longitude ?? ''}|${dropoff?.latitude ?? ''},${dropoff?.longitude ?? ''}`;
    if (key === lastFramedRef.current || key === '|,') return;
    if (!pickup && !dropoff) return;
    lastFramedRef.current = key;
    if (pickup && dropoff) {
      mapRef.current.animateToRegion(regionFor([pickup, dropoff]), 500);
    } else {
      mapRef.current.animateToRegion(userRegion((dropoff ?? pickup)!), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude, mapReady, followDriver]);

  const shouldShowRecenter =
    showRecenterButton ?? (!!userLocation && !userLocationIsFallback && !isRouteMode);

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onMapReady={() => setMapReady(true)}
        onPress={
          onMapPress
            ? (e) => onMapPress(e.nativeEvent.coordinate)
            : undefined
        }
        onPoiClick={
          onMapPress
            ? (e) =>
                onMapPress(
                  e.nativeEvent.coordinate,
                  e.nativeEvent.name?.replace(/\n/g, ', '),
                )
            : undefined
        }
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {isRouteMode && (
          <Polyline
            coordinates={[pickup!, dropoff!]}
            strokeColor={colors.primary}
            strokeWidth={4}
            lineDashPattern={[1]}
          />
        )}

        {pickup && (
          <Marker
            coordinate={pickup}
            title="Pickup"
            anchor={{ x: 0.5, y: 0.5 }}
            draggable={!!onPickupDragEnd}
            onDragEnd={
              onPickupDragEnd
                ? (e) => onPickupDragEnd(e.nativeEvent.coordinate)
                : undefined
            }
          >
            <View style={[styles.pin, { backgroundColor: colors.primary }]}>
              <Feather name="navigation" size={14} color={colors.primaryForeground} />
            </View>
          </Marker>
        )}

        {dropoff && (
          <Marker
            coordinate={dropoff}
            title="Dropoff"
            anchor={{ x: 0.5, y: 0.5 }}
            draggable={!!onDropoffDragEnd}
            onDragEnd={
              onDropoffDragEnd
                ? (e) => onDropoffDragEnd(e.nativeEvent.coordinate)
                : undefined
            }
          >
            <View style={[styles.pin, { backgroundColor: colors.destructive }]}>
              <Feather name="map-pin" size={14} color="#fff" />
            </View>
          </Marker>
        )}

        {driver && (
          <Marker coordinate={driver} title="Driver" anchor={{ x: 0.5, y: 0.5 }} flat>
            <View style={styles.driverPin}>
              <View style={[styles.driverInner, { backgroundColor: colors.accent }]}>
                <Feather name="truck" size={14} color="#fff" />
              </View>
            </View>
          </Marker>
        )}

        {(nearbyDrivers ?? []).map((d) => (
          <Marker
            key={d.id}
            coordinate={{ latitude: d.latitude, longitude: d.longitude }}
            title={d.label ?? 'Available e-trike'}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            onPress={() => onDriverPress?.(d.id)}
          >
            <View style={styles.etrikePin}>
              <View style={[styles.etrikeInner, { backgroundColor: colors.primary }]}>
                <Feather name="truck" size={13} color={colors.primaryForeground} />
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {shouldShowRecenter && (
        <Pressable
          onPress={handleRecenter}
          style={[styles.recenterBtn, { backgroundColor: colors.card }]}
          hitSlop={8}
        >
          <Feather name="crosshair" size={20} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    ...Platform.select({
      android: { elevation: 4 },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  driverPin: { alignItems: 'center', justifyContent: 'center' },
  driverInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    ...Platform.select({
      android: { elevation: 6 },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  etrikePin: { alignItems: 'center', justifyContent: 'center' },
  etrikeInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    ...Platform.select({
      android: { elevation: 4 },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
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
});
