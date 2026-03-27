import { cors } from "hono/cors";
import { env } from "../env.js";

export function createCorsMiddleware() {
  const allowedOrigins = [
    env.MARKETING_URL,
    env.APP_URL,
    env.ADMIN_URL,
  ].filter((origin): origin is string => Boolean(origin) && origin !== "dev-placeholder");

  return cors({
    origin: (origin) => {
      // No origin header (server-to-server, curl, etc.) — allow through
      if (!origin) return origin;
      if (allowedOrigins.includes(origin)) return origin;
      // In development, allow localhost origins
      if (env.NODE_ENV === "development") {
        try {
          const hostname = new URL(origin).hostname;
          if (hostname === "localhost" || hostname === "127.0.0.1") {
            return origin;
          }
        } catch {
          // Invalid URL — reject
        }
      }
      return "";
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
}
