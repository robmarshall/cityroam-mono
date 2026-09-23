// City Roam production router
// Routes <DOMAIN> traffic (e.g. cityroam.co.uk):
//   /app, /app/* -> player SPA Vercel project
//   everything else -> marketing (Next.js) Vercel project
//
// Origins come from worker environment variables so the Vercel project names
// can change without a code edit:
//   FRONTEND_ORIGIN   e.g. https://<app-project>.vercel.app
//   MARKETING_ORIGIN  e.g. https://<marketing-project>.vercel.app
// Both are required. There are deliberately no fallbacks: if either is unset
// the worker answers 503 rather than proxying customers to a guessed host.
// Set them in wrangler.prod.toml [vars] or the Cloudflare dashboard.

export default {
  async fetch(request, env = {}) {
    const frontendOrigin = env.FRONTEND_ORIGIN;
    const marketingOrigin = env.MARKETING_ORIGIN;

    if (!frontendOrigin || !marketingOrigin) {
      console.error(
        "prod-router: FRONTEND_ORIGIN and MARKETING_ORIGIN must both be set",
      );
      return new Response("Router misconfigured", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Only /app and /app/... go to the player SPA. A bare startsWith("/app")
    // would also capture marketing paths such as /apple or /application.
    const isApp = path === "/app" || path.startsWith("/app/");
    const target = isApp ? frontendOrigin : marketingOrigin;

    // Build the upstream URL preserving path + query string
    const upstreamUrl = new URL(path + url.search, target);

    // Clone the request with the new URL, preserving method/headers/body
    const upstreamRequest = new Request(upstreamUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    });

    // Set Host header to upstream so Vercel routes correctly
    upstreamRequest.headers.set("Host", upstreamUrl.host);
    // Forward the original host so the upstream can build absolute URLs
    upstreamRequest.headers.set("X-Forwarded-Host", url.host);

    const response = await fetch(upstreamRequest);

    // Clone response so we can modify headers
    const newResponse = new Response(response.body, response);
    // Remove any x-frame-options to avoid issues
    newResponse.headers.delete("x-frame-options");

    return newResponse;
  },
};
