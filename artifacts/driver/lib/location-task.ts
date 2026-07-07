import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { API_BASE_URL } from '@/lib/api-config';

/**
 * Background location task for the driver app.
 *
 * This runs OUTSIDE the React tree — even when the app is backgrounded or the
 * phone is locked — so it can't use the generated api-client hooks or the
 * app's fetch wrapper. It talks to the backend with a raw fetch, reading the
 * Supabase access token straight from the persisted session (AsyncStorage),
 * exactly the token the in-app client would attach.
 *
 * expo-task-manager requires the task to be DEFINED at module top-level and
 * this module to be imported once at app startup (see _layout.tsx) so the task
 * is registered before Location.startLocationUpdatesAsync references it.
 */

export const BACKGROUND_LOCATION_TASK = 'move-apayao-driver-location';

type LocationTaskData = {
  locations: Location.LocationObject[];
};

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[bg-location] task error:', error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as LocationTaskData;
  const latest = locations?.[locations.length - 1];
  if (!latest || !API_BASE_URL) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return; // Not signed in — nothing to broadcast.

    await fetch(`${API_BASE_URL.replace(/\/+$/, '')}/api/drivers/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lat: latest.coords.latitude,
        lon: latest.coords.longitude,
      }),
    });
  } catch (e) {
    // Background failures must never throw — just log and let the next
    // location update try again.
    console.warn('[bg-location] push failed:', e instanceof Error ? e.message : e);
  }
});

/**
 * Starts background location updates. Safe to call when already started.
 */
export async function startBackgroundLocation(): Promise<void> {
  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  ).catch(() => false);
  if (alreadyRunning) return;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 15,
    pausesUpdatesAutomatically: false,
    // Android: a persistent notification is REQUIRED for background location.
    foregroundService: {
      notificationTitle: 'MOVE Apayao Driver — Online',
      notificationBody: 'Sharing your location so passengers can find you.',
      notificationColor: '#2563eb',
    },
    // iOS: show the blue bar so the driver knows location is active.
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
  });
}

/**
 * Stops background location updates. Safe to call when not running.
 */
export async function stopBackgroundLocation(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  ).catch(() => false);
  if (running) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}