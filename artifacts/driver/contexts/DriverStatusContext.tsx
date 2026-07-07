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
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '@/lib/location-task';

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

/**
 * Owns the driver's online/offline state and, while online, continuously
 * broadcasts GPS to the backend (PUT /drivers/location) so passengers can see
 * and match with them. Going offline flips availability off and stops pings.
 *
 * Broadcasting uses an OS-level BACKGROUND location task (expo-task-manager),
 * so pings continue when the app is backgrounded or the phone is locked. A
 * foreground watch runs in parallel purely to move the on-screen marker while
 * the app is open. Requires the background-location permission + the native
 * foreground-service config in app.json (both are set up).
 */
export function DriverStatusProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState<Coords | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const latestCoords = useRef<Coords | null>(null);

  const updateAvailability = useUpdateDriverAvailability();
  const updateLocation = useUpdateDriverLocation();

  // Keep the device awake only while on shift.
  useKeepAwake(isOnline ? 'driver-online' : undefined);

  const startBroadcasting = useCallback(async () => {
    // Foreground watch: updates the on-screen marker while the app is open.
    // The actual backend pings are sent by the BACKGROUND task below, which
    // keeps broadcasting even when the app is backgrounded or the phone is
    // locked.
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 4000 },
      (pos) => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        latestCoords.current = c;
        setLocation(c);
      },
    );

    // Start OS-level background location updates. Survives backgrounding/lock.
    await startBackgroundLocation();
  }, []);

  const stopBroadcasting = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    // Fire-and-forget: stop the background task too.
    void stopBackgroundLocation();
  }, []);

  const goOnline = useCallback(async () => {
    setError(null);
    setToggling(true);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        setError('Location permission is required to go online.');
        return;
      }

      // Background permission lets us keep broadcasting when the app is
      // backgrounded or the phone is locked. If the driver only grants
      // "while using", we still go online — pings just pause when the app
      // isn't foregrounded (and resume when they reopen it).
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        setError(
          'Tip: allow location "Always" so you keep receiving rides when the app is in the background.',
        );
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