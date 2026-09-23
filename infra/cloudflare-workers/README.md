# Cloudflare router workers

The frontends run as separate Vercel projects, but players and customers see one
domain. A Cloudflare worker on that domain proxies each request:

| Path | Upstream |
|---|---|
| `/app` and `/app/...` | player SPA project (`packages/app`, built with base `/app/`) |
| everything else | marketing project (`packages/marketing`) |

Only an exact `/app` or a path under `/app/` goes to the SPA, so marketing paths
such as `/apple` are not swallowed. The API and WebSocket servers are not behind
the worker: they have their own subdomains (`API_DOMAIN`, `WS_DOMAIN`) that point
at Coolify. The admin panel is on its own Vercel custom domain.

| File | Environment | Origins |
|---|---|---|
| `staging-router.js` | `staging.cityroam.co.uk` | hard-coded `cityroam-*-staging.vercel.app` |
| `prod-router.js` + `wrangler.prod.toml` | `cityroam.co.uk` | `FRONTEND_ORIGIN` / `MARKETING_ORIGIN` worker vars |

## Deploying the production worker

1. Create the production Vercel projects (app, admin, marketing) and note their
   `*.vercel.app` hostnames.
2. **Replace before deploy:** uncomment the `[vars]` block in
   `wrangler.prod.toml` and set `FRONTEND_ORIGIN` / `MARKETING_ORIGIN` to those
   hostnames. Nothing real is checked in, and the worker has no fallback
   origins: if either variable is unset or empty it logs an error and answers
   every request with `503 Router misconfigured` instead of proxying.
3. Check the `routes` in `wrangler.prod.toml` match the production zone.
4. Make sure the apex and `www` DNS records exist and are **proxied** (orange
   cloud). Worker routes only run on proxied records. The record target does not
   matter when the worker handles every path; a placeholder such as
   `AAAA 100::` is fine.
5. From this folder: `npx wrangler login`, then
   `npx wrangler deploy --config wrangler.prod.toml`.
6. Smoke test: `/` and `/en/...` serve marketing, `/app/` serves the player app,
   `/apple` serves the marketing 404. A `503 Router misconfigured` means the
   origin variables did not reach the worker.

To deploy by hand in the dashboard instead, create a worker, paste
`prod-router.js`, add `FRONTEND_ORIGIN` and `MARKETING_ORIGIN` as variables, and
add the two routes. If you set the variables in the dashboard and later deploy
with wrangler, keep the `[vars]` block commented out and add `keep_vars = true`
to `wrangler.prod.toml`, otherwise wrangler removes dashboard-only variables.

## Updating the staging worker

`staging-router.js` has no wrangler config in the repo. Paste the file into the
existing staging worker in the Cloudflare dashboard and deploy.

## Backend DNS (not proxied through the worker)

`API_DOMAIN` and `WS_DOMAIN` point at the Coolify server, where Traefik issues
Let's Encrypt certificates. Use DNS-only (grey cloud) records, or switch to
proxied with SSL mode Full (strict) once certificates are live. The Vercel admin
domain must be DNS-only.
