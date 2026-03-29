// City Roam staging router
// Routes staging.cityroam.co.uk traffic:
//   /app/* -> cityroam-frontend-staging.vercel.app (player SPA)
//   /*     -> cityroam-marketing-staging.vercel.app (marketing/Next.js)

const FRONTEND_ORIGIN = "https://cityroam-frontend-staging.vercel.app";
const MARKETING_ORIGIN = "https://cityroam-marketing-staging.vercel.app";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Determine target origin based on path
    const target = path.startsWith("/app") ? FRONTEND_ORIGIN : MARKETING_ORIGIN;

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
    // Forward the original host for debugging
    upstreamRequest.headers.set("X-Forwarded-Host", url.host);

    const response = await fetch(upstreamRequest);

    // Clone response so we can modify headers
    const newResponse = new Response(response.body, response);
    // Remove any x-frame-options to avoid issues
    newResponse.headers.delete("x-frame-options");

    return newResponse;
  },
};
