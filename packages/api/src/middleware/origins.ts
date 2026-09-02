import { env } from "../env.js";

/**
 * The browser origins allowed to talk to this API.
 *
 * Shared by the CORS middleware and the CSRF guard so a request that CORS
 * would reject can never be treated as trusted by the guard, and vice versa.
 */
export function getAllowedOrigins(): string[] {
  return [env.MARKETING_URL, env.APP_URL, env.ADMIN_URL].filter(
    (origin): origin is string =>
      Boolean(origin) && origin !== "dev-placeholder",
  );
}

/**
 * True when the given `Origin` header value is one this API trusts.
 *
 * In development any localhost/127.0.0.1 origin passes, because the dev
 * servers run on a handful of ports that aren't worth enumerating.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (getAllowedOrigins().includes(origin)) return true;

  if (env.NODE_ENV === "development") {
    try {
      const hostname = new URL(origin).hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    } catch {
      // Not a URL — untrusted
    }
  }

  return false;
}
