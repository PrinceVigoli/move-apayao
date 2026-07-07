import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import {
  useUpdateDriverAvailability,
  useUpdateDriverLocation,
} from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';

type Coords = { lat: number; lon: number };

interface DriverStatusValue {
  isOnline: boolean;
  location: Coords | null;
  /** True while a go-online/offline request is in flight. */
  toggling: boolean;
  error: string | null;
  goOnline: () => Promise<void>;
  goOffline: () => Promise<void>;
}

const DriverStatusContext = createContext<DriverStatusValue | undefined>(undefined);

// How often we push the driver's position while online. The passenger's live
// tracking map and the nearby-drivers booking map both read from this.
const LOCATION_PING_MS = 5000;

/**
 * Owns the driver's online/offline state and, while online, continuously
 * broadcasts GPS to the backend (PUT /drivers/location) so passengers can see
 * and match with them. Going offline flips availability off and stops pings.
 *
 * Uses a foreground location watch + a throttled ping loop. Keeps the screen
 * awake while online so the OS doesn't suspend the JS timers mid-shift. For a
 * production build you'd graduate this to a true background task
 * (expo-task-manager + background location); this foreground approach is the
 * reliable v1 that works in an EAS build without extra native setup.
 */
export function DriverStatusProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState<Coords | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestCoords = useRef<Coords | null>(null);

  const updateAvailability = useUpdateDriverAvailability();
  const updateLocation = useUpdateDriverLocation();

  // Keep the device awake only while on shift.
  useKeepAwake(isOnline ? 'driver-online' : undefined);

  const pushLocation = useCallback(() => {
    const c = latestCoords.current;
    if (!c) return;
    updateLocation.mutate({ data: { lat: c.lat, lon: c.lon } });
  }, [updateLocation]);

  const startBroadcasting = useCallback(async () => {
    // Foreground watch: updates latestCoords as the driver moves.
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 4000 },
      (pos) => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        latestCoords.current = c;
        setLocation(c);
      },
    );

    // Throttled ping loop so we send at a steady cadence even when stationary.
    pingTimer.current = setInterval(pushLocation, LOCATION_PING_MS);
  }, [pushLocation]);

  const stopBroadcasting = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
  }, []);

  const goOnline = useCallback(async () => {
    setError(null);
    setToggling(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is required to go online.');
        return;
      }

      // Seed an immediate fix so the backend has a position right away.
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      latestCoords.current = c;
      setLocation(c);

      // Mark available first (also seeds the geo index), then send location.
      await updateAvailability.mutateAsync({ data: { isAvailable: true } });
      await updateLocation.mutateAsync({ data: { lat: c.lat, lon: c.lon } });

      await startBroadcasting();
      setIsOnline(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not go online.');
    } finally {
      setToggling(false);
    }
  }, [startBroadcasting, updateAvailability, updateLocation]);

  const goOffline = useCallback(async () => {
    setError(null);
    setToggling(true);
    try {
      stopBroadcasting();
      await updateAvailability.mutateAsync({ data: { isAvailable: false } });
      setIsOnline(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not go offline.');
    } finally {
      setToggling(false);
    }
  }, [stopBroadcasting, updateAvailability]);

  // If the user logs out while online, tear everything down.
  useEffect(() => {
    if (!isAuthenticated && isOnline) {
      stopBroadcasting();
      setIsOnline(false);
    }
  }, [isAuthenticated, isOnline, stopBroadcasting]);

  useEffect(() => stopBroadcasting, [stopBroadcasting]);

  return (
    <DriverStatusContext.Provider
      value={{ isOnline, location, toggling, error, goOnline, goOffline }}
    >
      {children}
    </DriverStatusContext.Provider>
  );
}

export function useDriverStatus(): DriverStatusValue {
  const ctx = useContext(DriverStatusContext);
  if (!ctx) throw new Error('useDriverStatus must be used within DriverStatusProvider');
  return ctx;
}
