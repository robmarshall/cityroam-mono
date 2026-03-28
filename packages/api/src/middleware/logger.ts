import type { MiddlewareHandler } from "hono";
import { createLogger } from "../lib/logger.js";

const log = createLogger("http");

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration_ms = Date.now() - start;
  const status = c.res.status;

  log.info("request", { method, path, status, duration_ms });
};
