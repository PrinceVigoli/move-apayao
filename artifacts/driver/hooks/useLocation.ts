import { useEffect, useState, useCallback } from 'react';
import * as Location from 'expo-location';

// Apayao provincial center — used as a safe fallback when the device has not
// yet returned a fix or the user denied the location permission. Keeps the UI
// populated (weather, nearby drivers) instead of showing nothing.
export const APAYAO_FALLBACK = { lat: 18.3121, lon: 121.3214 } as const;

export type LocationState = {
  lat: number;
  lon: number;
  /** True while the first fix is being acquired. */
  loading: boolean;
  /** 'granted' | 'denied' | 'undetermined' — mirrors expo-location. */
  permission: Location.PermissionStatus | 'undetermined';
  /** True when lat/lon are the Apayao fallback rather than a real device fix. */
  isFallback: boolean;
  /** Human-readable error, if any. */
  error: string | null;
  /** Manually re-request a fresh fix (e.g. pull-to-refresh). */
  refresh: () => Promise<void>;
};

/**
 * Returns the device's current coordinates, requesting permission on mount.
 *
 * Works in Expo Go and EAS builds — expo-location is a config-plugin-free
 * module, so no native rebuild is required beyond the one already produced by
 * `eas build`. On web it falls back to the browser geolocation API that
 * expo-location wraps; if anything fails we degrade to the Apayao center so the
 * rest of the screen still has usable coordinates.
 */
export function useLocation(): LocationState {
  const [lat, setLat] = useState<number>(APAYAO_FALLBACK.lat);
  const [lon, setLon] = useState<number>(APAYAO_FALLBACK.lon);
  const [loading, setLoading] = useState<boolean>(true);
  const [permission, setPermission] =
    useState<LocationState['permission']>('undetermined');
  const [isFallback, setIsFallback] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status);

      if (status !== 'granted') {
        // Keep the fallback coordinates so weather / nearby still render.
        setIsFallback(true);
        setError('Location permission denied. Showing Apayao area.');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLat(pos.coords.latitude);
      setLon(pos.coords.longitude);
      setIsFallback(false);
    } catch (e) {
      setIsFallback(true);
      setError(
        e instanceof Error ? e.message : 'Could not determine your location.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { lat, lon, loading, permission, isFallback, error, refresh: load };
}
