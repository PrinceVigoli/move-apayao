import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';

type LatLng = { latitude: number; longitude: number };

interface RouteMapProps {
  pickup: LatLng;
  dropoff: LatLng;
  driver?: LatLng | null;
  /** When true, the map recenters to keep the driver in view as they move. */
  followDriver?: boolean;
  style?: any;
  /** Disable gestures for a small embedded preview. */
  interactive?: boolean;
}

function regionFor(points: LatLng[]): Region {
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
 * Interactive Google map used both as an embedded preview in the trip detail
 * screen and full-screen in the live tracker. Requires react-native-maps +
 * a Google Maps API key (see app.json / EAS setup) — works in an EAS dev/prod
 * build, not in stock Expo Go.
 */
export function RouteMap({
  pickup,
  dropoff,
  driver,
  followDriver = false,
  style,
  interactive = true,
}: RouteMapProps) {
  const colors = useColors();
  const mapRef = useRef<MapView | null>(null);

  const points = [pickup, dropoff, ...(driver ? [driver] : [])];
  const initialRegion = regionFor([pickup, dropoff]);

  // Keep the driver framed as their position updates.
  useEffect(() => {
    if (!followDriver || !driver || !mapRef.current) return;
    mapRef.current.animateToRegion(regionFor(points), 600);
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
        showsUserLocation={false}
        toolbarEnabled={false}
      >
        <Polyline
          coordinates={[pickup, dropoff]}
          strokeColor={colors.primary}
          strokeWidth={4}
          lineDashPattern={[1]}
        />

        <Marker coordinate={pickup} title="Pickup" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.pin, { backgroundColor: colors.primary }]}>
            <Feather name="navigation" size={14} color={colors.primaryForeground} />
          </View>
        </Marker>

        <Marker coordinate={dropoff} title="Dropoff" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.pin, { backgroundColor: colors.destructive }]}>
            <Feather name="map-pin" size={14} color="#fff" />
          </View>
        </Marker>

        {driver && (
          <Marker
            coordinate={driver}
            title="Driver"
            anchor={{ x: 0.5, y: 0.5 }}
            flat
          >
            <View style={styles.driverPin}>
              <View style={[styles.driverInner, { backgroundColor: colors.accent }]}>
                <Feather name="truck" size={14} color="#fff" />
              </View>
            </View>
          </Marker>
        )}
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
  driverPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});