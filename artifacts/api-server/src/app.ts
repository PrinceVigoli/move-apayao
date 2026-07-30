import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalLimiter } from "./lib/rate-limit";
import type { AuthenticatedRequest } from "./middlewares/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Restrict cross-origin access to known frontends instead of reflecting any
// origin. Bearer-token auth means CSRF isn't the primary concern here, but a
// wide-open CORS policy still lets any website read this API's responses
// (including error bodies) from a victim's browser.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", generalLimiter, router);

// Centralized error handler — must be registered last. Express 5 forwards
// rejected promises from async route handlers here automatically, so this
// is the single place that decides what an unhandled error looks like to a
// client, instead of leaving that to Express's default handler (whose
// stack-trace-leaking behavior depends on NODE_ENV being set correctly in
// every deploy environment).
app.use((err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const authReq = req as AuthenticatedRequest;
  req.log?.error(
    { err, userId: authReq.user?.id, path: req.path, method: req.method },
    "Unhandled error",
  );
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
