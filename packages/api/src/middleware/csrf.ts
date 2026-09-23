import type { MiddlewareHandler } from "hono";
import { isAllowedOrigin } from "./origins.js";
import { AppError } from "./error-handler.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request forgery guard for cookie-authenticated routes.
 *
 * The session cookie is `SameSite=None` because the player app and the API
 * live on different origins, so the browser attaches it to cross-site requests
 * too. Without a check, any page could auto-submit a form at
 * `POST /event/:code/start` and drive somebody else's hunt. Rather than add a
 * token the client has to carry, we lean on headers a browser sets itself and
 * an attacker cannot forge from a page:
 *
 *   1. `Origin` — sent on every cross-origin request (and on all POSTs). If it
 *      is present it must be one of the origins we already trust for CORS.
 *   2. `Sec-Fetch-Site` — sent by current browsers on every request. Anything
 *      but `cross-site` (i.e. `same-origin`, `same-site`, or `none` for a
 *      user-typed navigation) is fine.
 *
 * Either signal passing is enough, so a deployment that puts the API on a
 * different registrable domain from the app (`Sec-Fetch-Site: cross-site` with
 * a trusted `Origin`) still works. A request carrying neither header is not
 * coming from a browser page — curl, a health checker, server-to-server — and
 * cannot be a forgery, so it passes.
 *
 * On top of that, a `Content-Type` that is present must be JSON. HTML forms
 * can only send `application/x-www-form-urlencoded`, `multipart/form-data`, or
 * `text/plain`, so this alone blocks the simple-request form attack even from
 * a client that strips the headers above.
 */
export const csrfGuard: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method.toUpperCase())) {
    await next();
    return;
  }

  const origin = c.req.header("Origin");
  const fetchSite = c.req.header("Sec-Fetch-Site")?.toLowerCase();

  const originOk = origin ? isAllowedOrigin(origin) : false;
  const fetchSiteOk = fetchSite ? fetchSite !== "cross-site" : false;

  // Only judge a request that actually carries one of the signals.
  if ((origin || fetchSite) && !originOk && !fetchSiteOk) {
    throw new AppError(403, "Cross-site request rejected", "CSRF_REJECTED");
  }

  const contentType = c.req.header("Content-Type");
  if (contentType) {
    const mediaType = contentType.split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      throw new AppError(
        403,
        "Unsupported content type",
        "CSRF_REJECTED",
      );
    }
  }

  await next();
};
