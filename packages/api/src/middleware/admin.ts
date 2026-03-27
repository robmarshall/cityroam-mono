import type { MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";
import { env } from "../env.js";
import { AppError } from "./error-handler.js";

const JWT_EXPIRY_HOURS = 8;

export interface AdminContext {
  username: string;
}

/**
 * Signs a JWT token for the admin user.
 */
export async function signAdminToken(username: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: username,
    role: "admin",
    iat: now,
    exp: now + JWT_EXPIRY_HOURS * 60 * 60,
  };
  return await sign(payload, env.SESSION_SECRET);
}

/**
 * Admin auth middleware — requires a valid JWT Bearer token.
 * Attaches admin context to c.set("admin", ...).
 * Returns 401 if no valid token found.
 */
export const adminAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AppError(401, "Admin authentication required", "ADMIN_UNAUTHORIZED");
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verify(token, env.SESSION_SECRET, "HS256");
    if (payload.role !== "admin") {
      throw new AppError(401, "Invalid admin token", "ADMIN_UNAUTHORIZED");
    }
    c.set("admin" as any, { username: payload.sub } as AdminContext);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, "Invalid or expired admin token", "ADMIN_UNAUTHORIZED");
  }

  await next();
};
