import type { Context } from "hono";

/**
 * Best-guess client IP for rate limiting and bookkeeping. The API sits behind
 * Traefik, which appends to `x-forwarded-for` and sets `x-real-ip`; Cloudflare
 * in front of it sets `cf-connecting-ip`. Most-trusted header first, and the
 * *first* entry of `x-forwarded-for` is only reached when neither proxy header
 * is present.
 *
 * A caller with direct access to the API port can forge these. That is
 * acceptable for a login limiter: forging simply hands the attacker a fresh
 * bucket, which is no worse than the no-limiter status quo, and the API is not
 * exposed outside the proxy in any deployed environment.
 */
export function clientIp(c: Context): string {
  const direct =
    c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? null;
  if (direct?.trim()) return direct.trim().slice(0, 64);

  const forwarded = c.req.header("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);

  return "unknown";
}
