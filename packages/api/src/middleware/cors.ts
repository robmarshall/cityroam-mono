import { cors } from "hono/cors";
import { isAllowedOrigin } from "./origins.js";

export function createCorsMiddleware() {
  return cors({
    origin: (origin) => {
      // No origin header (server-to-server, curl, etc.) — allow through
      if (!origin) return origin;
      return isAllowedOrigin(origin) ? origin : "";
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
}
