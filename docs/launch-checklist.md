# Launch checklist

Owner actions left over from the 2026-09-02 audit and fix rounds. Everything
below is something the code cannot do for itself. Tick items off as they are
done.

## 0. Commit the work

- [x] The three fix rounds (show-stoppers, High tier, Medium tier) were
      committed on `development` in `5a4154a`.
- [ ] Review and commit the follow-up round (backend-only prod compose,
      production Cloudflare worker, `/app` routing fix, dev compose cleanup,
      route image placeholders, code-email failure panel, player error
      messages, Sentry, data retention).

## 1. Database

- [ ] **Before migrating**, run the violator-detection queries in the header
      comments of these migrations. Each unique index will fail to create if
      existing rows violate it:
  - `packages/api/drizzle/0009_add_events_stripe_session_unique.sql`
    (duplicate `stripe_session_id` on events)
  - `packages/api/drizzle/0011_add_position_uniques_and_email_state.sql`
    (duplicate active language variants per family, block/group position
    collisions)
- [ ] Run migrations 0009, 0010, 0011 (`npm run migrate`). 0009 must be in
      place before the new API code is deployed, because the webhook insert now
      uses `ON CONFLICT (stripe_session_id)`.
- [ ] Run migrations 0012 (`admin_api_keys`) and 0013 (`admin_audit_log`)
      with the MCP / admin API key release. Both only create new tables, so
      there is nothing to check first.
- [ ] Seed message banks so the new `guide-degraded` and `guide-busy` bank
      types exist in every language. In production use the message-banks-only
      seeder, `npm run docker:prod:seed:message-banks` (runs
      `start:seed:message-banks` in the `api-http` container). Do **not** run
      `docker:prod:seed` there: the full seed also creates the development
      route. With no argument the seeder covers every language, English
      included (`--dry-run` previews); it adds only missing entries and does
      not wipe admin edits. Locally the equivalent is `npm run
      seed:message-banks`.

## 2. Stripe dashboard

- [ ] Add these events to the webhook endpoint:
  - `checkout.session.async_payment_succeeded` (delayed payment methods)
  - `charge.refunded` (dashboard refunds now mark the event REFUNDED)
  - `charge.dispute.created` (disputes now mark the event REFUNDED)
- [ ] Confirm the account has terms, privacy and refund URLs set to the new
      pages: `/{locale}/terms`, `/{locale}/privacy`, `/{locale}/refunds`.

## 3. Environment and config

- [ ] `CHECKOUT_ROUTE_FAMILY_IDS` is optional while only one route family is
      live. Set it as soon as a second family goes live, always including a
      `default` key, or the homepage buy button will return 400. Both accepted
      formats are documented in `.env.example`.
- [ ] `SESSION_SECRET` must now be at least 32 characters outside development
      or the API refuses to boot.
- [ ] Both compose files are now backend-only and fail loudly on unset
      `POSTGRES_PASSWORD`, `REDIS_PASSWORD`. Domains come from Coolify's
      Domains setting per service.
      `DOMAIN` and `ADMIN_DOMAIN` are no longer used by compose.
- [ ] `SENTRY_DSN`, `SENTRY_ENVIRONMENT` and `SENTRY_RELEASE` are passed
      through to `api-http` and `api-ws` in both compose files. Set them in
      Coolify for each environment (see section 5), or leave the DSN empty to
      disable Sentry.
- [ ] `API_KEY_ENV` is already set in both compose files (`stg` in
      `docker-compose.staging.yml`, `prd` in `docker-compose.prod.yml`); the API
      refuses to boot outside development without it. Do not override it in
      Coolify: a key is only accepted by the deployment whose `API_KEY_ENV`
      matches its `crk_<env>_` prefix.
- [ ] Give the API's IAM user `s3:ListBucket` on **both** buckets (staging and
      production), alongside the existing object permissions. The admin
      route-image listing and the MCP `list_image_slugs` tool need it, and
      without it S3 answers `HeadObject` on a missing key with 403, so image
      existence checks report "unknown" and `upload_image` asks for
      `overwrite: true` on every slug.
- [ ] The frontend Dockerfiles still require their build args (app
      `VITE_API_URL`, `VITE_WS_URL`; admin `VITE_API_URL`; marketing
      `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`) if you ever self-host them.

## 4. Hosting

- [ ] **Coolify production.** Create the production resource from
      `docker-compose.prod.yml` (backend only: postgres, redis, migrate,
      api-http, api-ws). Set the Domains of api-http to
      `https://api.cityroam.co.uk` and api-ws to `https://ws.cityroam.co.uk`
      in Coolify (compose no longer defines routers). Set `POSTGRES_PASSWORD`,
      `REDIS_PASSWORD`, optional `SENTRY_DSN`, and the rest of `.env.example`.
- [ ] **DNS for the backend.** `api` and `ws` records point at the Coolify
      server, DNS-only (grey cloud) until Let's Encrypt has issued, or proxied
      with SSL mode Full (strict).
- [ ] **Vercel production projects.** Create app, admin and marketing
      projects. On the app project set `VITE_API_URL=https://<API_DOMAIN>` and
      `VITE_WS_URL=wss://<WS_DOMAIN>` (no path, no port; the app appends
      `/ws/<code>`). Give admin its custom domain.
- [ ] **Cloudflare production worker.** Uncomment the `[vars]` block in
      `infra/cloudflare-workers/wrangler.prod.toml` and put the real Vercel
      hostnames in `FRONTEND_ORIGIN` and `MARKETING_ORIGIN` (nothing real is
      checked in, and the worker answers `503 Router misconfigured` until both
      are set), check the routes, then
      `npx wrangler deploy --config wrangler.prod.toml`. Steps in
      `infra/cloudflare-workers/README.md`.
- [ ] **Redeploy the staging worker.** `staging-router.js` now sends only
      `/app` and `/app/...` to the SPA (it used to capture `/apple` etc.).
      Paste it into the staging worker in the Cloudflare dashboard.
- [x] **CI compose check.** `.github/workflows/ci.yml` now passes
      `WS_DOMAIN` to the prod compose validation and no longer sets the unused
      `DOMAIN`, `ADMIN_DOMAIN` and frontend build vars there. CI also runs on
      pushes to `staging`.

- [ ] Switch every Vercel project to Node 22 before **2026-10-01**, when Vercel
      stops building Node 20. `.nvmrc`, `engines`, and the Docker base images
      are already on 22.
  - [x] Staging projects (app, admin, marketing) switched to Node 22.x on
        2026-09-23.
  - [ ] Production projects: deferred until after the `staging` to `main`
        merge, then switch before 2026-10-01.
- [ ] Docker image builds were validated by inspection only, because Docker
      Desktop was not running locally. The new GitHub Actions workflow builds
      all four images with dummy args on the first push, so watch that run.

## 4a. Route authoring MCP server

- [ ] After each deploy of the API key release (staging, then production),
      log into that environment's admin panel, open **Settings → API Keys**
      and create a key for the MCP server with only the scopes it needs
      (`routes:read`, `routes:write`, `images:read`, `images:write`,
      `message-banks:read`, `message-banks:write`; `routes:publish` cannot be
      granted). The token is shown once. Put it in your local client config
      (see `docs/llm-authoring/mcp.md`), never in the repo. Start with staging
      only; create a production key when a production change is needed, and
      revoke keys you no longer use.

## 5. Sentry

One Sentry project, `cityroam`, in the `prl-digital` org
(https://prl-digital.sentry.io), for the whole monorepo. Events are told apart
by the `service` tag (`api-http`, `api-ws`, `app`, `admin`, `marketing`) and
releases are namespaced `<pkg>@<version>`. With no DSN set, a package skips
Sentry entirely.

- [ ] Use the **same DSN** for staging and production, on every service:
      Coolify `SENTRY_DSN` (api-http, api-ws), Vercel `VITE_SENTRY_DSN` (app,
      admin) and `NEXT_PUBLIC_SENTRY_DSN` (marketing).
- [ ] **Set the environment explicitly in every environment.** Staging and
      production share one project, so the environment tag is the only thing
      that separates them. Coolify `SENTRY_ENVIRONMENT`, Vercel
      `VITE_SENTRY_ENVIRONMENT` (app, admin) and
      `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (marketing): `staging` on staging,
      `production` on production. Do not rely on the fallbacks. The Vercel
      staging projects use `staging` as their production branch, so
      `VERCEL_ENV` reports `production` there; the Vite builds fall back to
      the build mode (`production`), and the API falls back to `NODE_ENV`
      (`production` in both compose files). The Vite and Next values are
      inlined at build time, so redeploy after changing them.
- [ ] Scope every alert rule to `environment:production`, so staging noise
      never pages anyone.
- [ ] Turn on spike protection for the project, so a runaway error loop cannot
      burn the monthly quota.
- [ ] Optional: set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` (`prl-digital`) and
      `SENTRY_PROJECT` (`cityroam`) on the marketing Vercel projects to upload
      source maps at build time. Without the token the build skips the
      upload. Treat the token as a secret and never commit it.
- [ ] Releases need no setup. Each package falls back to its build's git SHA
      (Coolify `SOURCE_COMMIT`, Vercel `VERCEL_GIT_COMMIT_SHA`) when
      `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE`
      is unset.

## 6. Decisions to make

- [ ] **Contact address.** The marketing site and legal pages now use
      `hello@cityroam.co.uk`. It was `hello@cityroam.com` before. If the .com
      mailbox is the real one, revert that string in
      `packages/marketing/src/lib/site.ts` and the five message files.
- [ ] **Admin login limiter fails open.** If Redis is down, login is allowed
      through with a logged error. The gameplay limiters fail closed with a 500.
      Decide whether to align them.
- [ ] **Analytics without consent.** PostHog initialises unconditionally on
      both the marketing site and the player app by your decision. The privacy
      page now cites legitimate interest for analytics cookies, which is
      contestable under UK PECR. Revisit before scaling EU traffic.

## 7. Legal review

- [ ] Have a solicitor review the three legal pages. Each page file opens with
      a comment listing its specific caveats. The refund policy states the
      no-questions-asked promise already used in marketing copy, split into
      before-start (any time while the code is valid) and after-play (within
      fourteen days), with codes valid for ninety days.

## 8. Known gaps left in place

These were judged Low and are unchanged:

- The WebSocket session token travels in the query string. Moving it needs a
  client change and a cookie strategy that works across the `ws.` subdomain.
- A walk between stops that spans an API container restart is deaf until the
  next stop, because the reconciler does not recreate the en-route marker.
- Sent-message confirmation in the player app matches on sender plus content
  within 60 seconds, because the WebSocket server has no ack frame. A
  server-side correlation id would make it exact.
- The deprecated `z.string().email()` call in the API health test still works
  under Zod 4 and was left alone.
