import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getRedis } from "../lib/redis";

const router: IRouter = Router();

// Server-side key so it never ships inside the mobile app bundle (where it
// could be extracted and abused — Places calls are billed per request). The
// Maps SDK key used by the app for rendering is a SEPARATE key in app.json;
// this one must have the "Places API" enabled in Google Cloud.
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";
const PLACES_CACHE_TTL_SECONDS = 86400; // place data is effectively static day-to-day
const PLACES_FETCH_TIMEOUT_MS = 5000;

// Bias all searches toward Apayao so a passenger typing "market" gets the
// local one, not a namesake in Manila. Center + radius (meters).
const APAYAO_CENTER = { lat: 18.0187, lon: 121.1699 };
const APAYAO_BIAS_RADIUS_M = 60000; // ~province-scale

/**
 * GET /api/places/search?q=<text>[&sessiontoken=<uuid>]
 *
 * Autocomplete proxy. Returns a short list of { placeId, primary, secondary }
 * matches for the typed text, biased to Apayao. The client shows these as a
 * pick-list; the user taps the correct one, then the app calls /places/details
 * to resolve it to coordinates.
 *
 * Pass a stable sessiontoken (a UUID generated when the user starts typing,
 * reused for the matching /details call) — Google bills autocomplete +details
 * as a single session when you do, which is cheaper.
 */
router.get("/places/search", requireAuth, async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  const sessiontoken = req.query.sessiontoken ? String(req.query.sessiontoken) : undefined;

  if (q.length < 2) {
    res.json({ predictions: [] });
    return;
  }

  if (!GOOGLE_PLACES_API_KEY) {
    // No key configured — return empty so the app cleanly falls back to
    // "tap the map instead" rather than erroring.
    res.json({ predictions: [], unavailable: true });
    return;
  }

  const redis = getRedis();
  const cacheKey = `places:search:${q.toLowerCase()}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }
  } catch (err) {
    logger.warn({ err }, "Places search cache read failed (non-fatal)");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLACES_FETCH_TIMEOUT_MS);

  try {
    const url = new URL(`${PLACES_BASE}/autocomplete/json`);
    url.searchParams.set("input", q);
    url.searchParams.set("key", GOOGLE_PLACES_API_KEY);
    url.searchParams.set("location", `${APAYAO_CENTER.lat},${APAYAO_CENTER.lon}`);
    url.searchParams.set("radius", String(APAYAO_BIAS_RADIUS_M));
    url.searchParams.set("components", "country:ph");
    if (sessiontoken) url.searchParams.set("sessiontoken", sessiontoken);

    const resp = await fetch(url.toString(), { signal: controller.signal });
    if (!resp.ok) {
      logger.error({ status: resp.status }, "Google Places autocomplete error");
      res.status(502).json({ error: "Place search unavailable" });
      return;
    }

    const data = (await resp.json()) as {
      status: string;
      predictions?: Array<{
        place_id: string;
        structured_formatting?: { main_text?: string; secondary_text?: string };
        description?: string;
      }>;
    };

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      logger.error({ status: data.status }, "Google Places non-OK status");
      // REQUEST_DENIED here almost always means the Places API isn't enabled
      // for the key, or billing isn't set up.
      res.status(502).json({ error: "Place search unavailable", googleStatus: data.status });
      return;
    }

    const payload = {
      predictions: (data.predictions ?? []).slice(0, 6).map((p) => ({
        placeId: p.place_id,
        primary: p.structured_formatting?.main_text ?? p.description ?? "",
        secondary: p.structured_formatting?.secondary_text ?? "",
      })),
    };

    redis
      .set(cacheKey, JSON.stringify(payload), "EX", PLACES_CACHE_TTL_SECONDS)
      .catch((err) => logger.warn({ err }, "Places search cache write failed (non-fatal)"));

    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Places search failed");
    res.status(502).json({ error: "Place search error" });
  } finally {
    clearTimeout(timeout);
  }
});

/**
 * GET /api/places/details?placeId=<id>[&sessiontoken=<uuid>]
 *
 * Resolves a chosen prediction to coordinates + a clean formatted address.
 * The app then drops a pin at these coordinates for the user to CONFIRM on the
 * map before booking — so a wrong pick is caught visually, not silently.
 */
router.get("/places/details", requireAuth, async (req, res): Promise<void> => {
  const placeId = String(req.query.placeId ?? "").trim();
  const sessiontoken = req.query.sessiontoken ? String(req.query.sessiontoken) : undefined;

  if (!placeId) {
    res.status(400).json({ error: "Missing placeId" });
    return;
  }
  if (!GOOGLE_PLACES_API_KEY) {
    res.status(503).json({ error: "Place lookup unavailable" });
    return;
  }

  const redis = getRedis();
  const cacheKey = `places:details:${placeId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }
  } catch (err) {
    logger.warn({ err }, "Places details cache read failed (non-fatal)");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLACES_FETCH_TIMEOUT_MS);

  try {
    const url = new URL(`${PLACES_BASE}/details/json`);
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("key", GOOGLE_PLACES_API_KEY);
    url.searchParams.set("fields", "geometry,formatted_address,name");
    if (sessiontoken) url.searchParams.set("sessiontoken", sessiontoken);

    const resp = await fetch(url.toString(), { signal: controller.signal });
    if (!resp.ok) {
      logger.error({ status: resp.status }, "Google Places details error");
      res.status(502).json({ error: "Place lookup unavailable" });
      return;
    }

    const data = (await resp.json()) as {
      status: string;
      result?: {
        geometry?: { location?: { lat: number; lng: number } };
        formatted_address?: string;
        name?: string;
      };
    };

    if (data.status !== "OK" || !data.result?.geometry?.location) {
      logger.error({ status: data.status }, "Google Places details non-OK");
      res.status(502).json({ error: "Place lookup failed", googleStatus: data.status });
      return;
    }

    const loc = data.result.geometry.location;
    const payload = {
      lat: loc.lat,
      lon: loc.lng,
      address:
        data.result.name && data.result.formatted_address
          ? `${data.result.name}, ${data.result.formatted_address}`
          : data.result.formatted_address ?? data.result.name ?? "",
    };

    redis
      .set(cacheKey, JSON.stringify(payload), "EX", PLACES_CACHE_TTL_SECONDS)
      .catch((err) => logger.warn({ err }, "Places details cache write failed (non-fatal)"));

    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Places details failed");
    res.status(502).json({ error: "Place lookup error" });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
