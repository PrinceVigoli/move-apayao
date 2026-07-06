import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { API_BASE_URL } from '@/lib/api-config';

export type DriverLocation = {
  driverId: string;
  lat: number;
  lon: number;
  ts: number;
};

export type TrackingState = {
  location: DriverLocation | null;
  tripStatus: string | null;
  connected: boolean;
  error: string | null;
};

/**
 * Subscribes to the server's Server-Sent Events tracking stream for a trip and
 * returns the driver's latest live position.
 *
 * React Native has no built-in EventSource and its fetch streaming support is
 * unreliable across engines, so we read the SSE stream with a plain
 * XMLHttpRequest and parse the `onprogress` buffer ourselves. This works in
 * Expo Go and EAS builds without any extra native dependency.
 *
 * The Supabase access token is passed as a `token` query param because SSE
 * requests can't carry an Authorization header.
 */
export function useTripTracking(tripId: number | null, enabled: boolean): TrackingState {
  const [location, setLocation] = useState<DriverLocation | null>(null);
  const [tripStatus, setTripStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const bufferRef = useRef<string>('');
  const lastIndexRef = useRef<number>(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parseChunk = useCallback((text: string) => {
    // Only process the newly-arrived portion of the responseText.
    const fresh = text.slice(lastIndexRef.current);
    lastIndexRef.current = text.length;
    bufferRef.current += fresh;

    // SSE events are separated by a blank line.
    const events = bufferRef.current.split('\n\n');
    bufferRef.current = events.pop() ?? '';

    for (const raw of events) {
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        // lines starting with ':' are comments (heartbeat) — ignore
      }
      if (dataLines.length === 0) continue;
      let payload: any = {};
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch {
        continue;
      }

      if (eventName === 'location') {
        setLocation({
          driverId: payload.driverId,
          lat: payload.lat,
          lon: payload.lon,
          ts: payload.ts ?? Date.now(),
        });
      } else if (eventName === 'status') {
        setTripStatus(payload.status ?? null);
      } else if (eventName === 'end') {
        // Stream is closing server-side; stop retrying.
        cleanup(false);
      }
    }
  }, []);

  const cleanup = useCallback((allowRetry: boolean) => {
    if (xhrRef.current) {
      try {
        xhrRef.current.abort();
      } catch {
        /* noop */
      }
      xhrRef.current = null;
    }
    if (!allowRetry && retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(async () => {
    if (!tripId || !enabled || !API_BASE_URL) return;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError('Not authenticated');
      return;
    }

    bufferRef.current = '';
    lastIndexRef.current = 0;

    const url =
      `${API_BASE_URL.replace(/\/+$/, '')}/api/trips/${tripId}/track/stream` +
      `?token=${encodeURIComponent(token)}`;

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'text/event-stream');

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        if (xhr.status === 200) {
          setConnected(true);
          setError(null);
        } else {
          setError(`Tracking unavailable (${xhr.status})`);
        }
      }
    };

    xhr.onprogress = () => {
      if (xhr.responseText) parseChunk(xhr.responseText);
    };

    xhr.onerror = () => {
      setError('Connection lost');
      scheduleReconnect();
    };

    xhr.onload = () => {
      // Server closed the stream — reconnect unless we were told to stop.
      scheduleReconnect();
    };

    xhr.send();
  }, [tripId, enabled, parseChunk]);

  const scheduleReconnect = useCallback(() => {
    cleanup(true);
    if (!enabled) return;
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => {
      void connect();
    }, 3000);
  }, [cleanup, connect, enabled]);

  useEffect(() => {
    if (enabled && tripId) {
      void connect();
    }
    return () => cleanup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tripId]);

  return { location, tripStatus, connected, error };
}