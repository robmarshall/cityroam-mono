# Launch checklist

Owner actions left over from the 2026-09-02 audit and fix rounds. Everything
below is something the code cannot do for itself. Tick items off as they are
done.

## 0. Commit the work

- [ ] The three fix rounds (show-stoppers, High tier, Medium tier) are all
      uncommitted in the working tree on `development`, about 145 files.
      Review and commit before anything else. Typecheck, all five test suites,
      and the three frontend builds were green at the end of the last round.

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
- [ ] Run `npm run seed:message-banks` so the new `guide-degraded` and
      `guide-busy` bank types exist in every language. The seeder now adds only
      missing entries and does not wipe admin edits.

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
- [ ] If you ever deploy the frontends via the compose files rather than
      Vercel, these build args are now required and the image build fails
      without them: app `VITE_API_URL`, `VITE_WS_URL`; admin `VITE_API_URL`;
      marketing `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`. Compose also now
      fails loudly on unset `DOMAIN`, `API_DOMAIN`, `ADMIN_DOMAIN`, `WS_DOMAIN`.

## 4. Hosting

- [ ] Switch every Vercel project to Node 22 before **2026-10-01**, when Vercel
      stops building Node 20. `.nvmrc`, `engines`, and the Docker base images
      are already on 22.
- [ ] Docker image builds were validated by inspection only, because Docker
      Desktop was not running locally. The new GitHub Actions workflow builds
      all four images with dummy args on the first push, so watch that run.

## 5. Decisions to make

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

## 6. Legal review

- [ ] Have a solicitor review the three legal pages. Each page file opens with
      a comment listing its specific caveats. The refund policy states the
      no-questions-asked promise already used in marketing copy, split into
      before-start (any time while the code is valid) and after-play (within
      fourteen days), with codes valid for ninety days.

## 7. Known gaps left in place

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
