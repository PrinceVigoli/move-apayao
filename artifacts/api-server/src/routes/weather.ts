import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getRedis } from "../lib/redis";

const router: IRouter = Router();

const OPENWEATHER_API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5";
const WEATHER_CACHE_TTL_SECONDS = 600; // weather doesn't meaningfully change minute to minute
const WEATHER_FETCH_TIMEOUT_MS = 5000;

/**
 * GET /api/weather?lat=&lon=
 * Proxy to OpenWeatherMap. Returns current conditions for a lat/lon.
 * Cached in Redis per ~1km grid cell to avoid re-hitting the upstream API
 * (and its rate limits) on every request for data that's effectively
 * static over a 10-minute window.
 */
router.get("/weather", requireAuth, async (req, res): Promise<void> => {
  const lat = parseFloat(String(req.query.lat ?? "18.3"));
  const lon = parseFloat(String(req.query.lon ?? "121.2"));

  if (!OPENWEATHER_API_KEY) {
    res.json({
      mock: true,
      location: { lat, lon, name: "Apayao" },
      weather: {
        main: "Partly Cloudy",
        description: "partly cloudy",
        temp: 28,
        feelsLike: 31,
        humidity: 75,
        windSpeed: 3.5,
        icon: "03d",
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const redis = getRedis();
  const cacheKey = `weather:${lat.toFixed(2)}:${lon.toFixed(2)}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }
  } catch (err) {
    logger.warn({ err }, "Weather cache read failed (non-fatal, falling through to API)");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);

  try {
    const url = new URL(`${OPENWEATHER_BASE}/weather`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("units", "metric");
    url.searchParams.set("appid", OPENWEATHER_API_KEY);

    const resp = await fetch(url.toString(), { signal: controller.signal });
    if (!resp.ok) {
      req.log.error({ status: resp.status }, "OpenWeatherMap API error");
      res.status(502).json({ error: "Weather service unavailable" });
      return;
    }

    const data = (await resp.json()) as Record<string, unknown>;
    const weather = data.weather as Array<{ main: string; description: string; icon: string }>;
    const main = data.main as { temp: number; feels_like: number; humidity: number };
    const wind = data.wind as { speed: number };

    const payload = {
      mock: false,
      location: { lat, lon, name: data.name },
      weather: {
        main: weather[0]?.main,
        description: weather[0]?.description,
        temp: main?.temp,
        feelsLike: main?.feels_like,
        humidity: main?.humidity,
        windSpeed: wind?.speed,
        icon: weather[0]?.icon,
      },
      timestamp: new Date().toISOString(),
    };

    redis
      .set(cacheKey, JSON.stringify(payload), "EX", WEATHER_CACHE_TTL_SECONDS)
      .catch((err) => logger.warn({ err }, "Weather cache write failed (non-fatal)"));

    res.json(payload);
  } catch (err) {
    logger.error({ err }, "Weather fetch failed");
    res.status(502).json({ error: "Weather service error" });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
