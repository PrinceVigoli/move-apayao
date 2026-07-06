import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
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

interface RouteMapProps {
  /** Trip mode: draws a pickup->dropoff route line. */
  pickup?: LatLng;
  dropoff?: LatLng;
  /** Assigned driver being tracked (single moving pin). */
  driver?: LatLng | null;
  /** Nearby-available-drivers mode: multiple pins, no route line. */
  nearbyDrivers?: NearbyDriverPin[];
  /** The passenger's own location (blue dot style pin). */
  userLocation?: LatLng | null;
  /** Recenter to keep the tracked driver in view as they move. */
  followDriver?: boolean;
  style?: any;
  interactive?: boolean;
  onDriverPress?: (id: string) => void;
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

/**
 * Interactive Google map with three modes that can combine:
 *  - Route mode: pass pickup + dropoff to draw the trip line.
 *  - Tracking mode: pass driver (+ followDriver) for a live moving pin.
 *  - Nearby mode: pass nearbyDrivers for a Grab-style scatter of available
 *    e-trikes around the user.
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
  followDriver = false,
  style,
  interactive = true,
  onDriverPress,
}: RouteMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView | null>(null);

  const framePoints: LatLng[] = [
    ...(pickup ? [pickup] : []),
    ...(dropoff ? [dropoff] : []),
    ...(driver ? [driver] : []),
    ...(userLocation ? [userLocation] : []),
    ...((nearbyDrivers ?? []).map((d) => ({ latitude: d.latitude, longitude: d.longitude }))),
  ];

  const initialRegion = regionFor(
    pickup && dropoff ? [pickup, dropoff] : framePoints,
    userLocation ?? undefined,
  );

  useEffect(() => {
    if (!followDriver || !driver || !mapRef.current) return;
    const pts = [driver, ...(pickup ? [pickup] : []), ...(dropoff ? [dropoff] : [])];
    mapRef.current.animateToRegion(regionFor(pts), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.latitude, driver?.longitude, followDriver]);

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {pickup && dropoff && (
          <Polyline
            coordinates={[pickup, dropoff]}
            strokeColor={colors.primary}
            strokeWidth={4}
            lineDashPattern={[1]}
          />
        )}

        {pickup && (
          <Marker coordinate={pickup} title="Pickup" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.pin, { backgroundColor: colors.primary }]}>
              <Feather name="navigation" size={14} color={colors.primaryForeground} />
            </View>
          </Marker>
        )}

        {dropoff && (
          <Marker coordinate={dropoff} title="Dropoff" anchor={{ x: 0.5, y: 0.5 }}>
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
});