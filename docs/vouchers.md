# Gift vouchers

A gift voucher is a City Roam game bought for someone else. The buyer pays
through Stripe Checkout, gets an email with a code and a printable card, and
whoever holds the code redeems it on the marketing site. Redeeming creates the
event, and the 90-day window for the game starts then, not at purchase.

- Code: 10 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L),
  shown as `XXXX-XXXX-XX`. Input is forgiving: case, spaces and dashes are
  ignored (`normalizeVoucherCode` in `@cityroam/shared/utils`).
- A voucher can be redeemed for 12 calendar months after purchase.
- Price: the same Stripe price as a game (`STRIPE_PRICE_ID`).
- Table: `vouchers` (migration `0014_add_vouchers`).
- Statuses: `PURCHASED` (unredeemed) → `REDEEMED` | `REFUNDED` | `EXPIRED` |
  `VOID`.

## What the marketing site needs to build

Nothing in `packages/marketing` exists yet. The API is ready for three pages.

### 1. "Buy as a gift" (form → Stripe)

`POST /checkout/create-voucher-session`, then redirect to the returned `url`.
Stripe sends the buyer back to:

- success: `${MARKETING_URL}/<locale>/gift/success?session_id=<id>`
- cancel: `${MARKETING_URL}/<locale>/gift`

`<locale>` is the `language` sent in the request (default `en`).

### 2. Gift success page: `/<locale>/gift/success?session_id=…`

Poll `GET /checkout/voucher-success?session_id=…` (like the game success page
polls `/checkout/success`) until it stops answering 404, then show the code,
the expiry date and the redemption link. The voucher email is sent at the same
time.

### 3. Redemption page: `/<locale>/redeem?code=XXXX-XXXX-XX`

**This URL is a contract.** It is printed on every voucher card and emailed to
every buyer, so it must keep working for at least 12 months after the last
voucher is sold. `code` may be missing (someone typing it by hand) or in any
case; send it to the API as typed, URL-encoded.

1. `GET /vouchers/:code` to check the code and show its status and expiry.
2. Ask for an optional email ("we'll send you the game link as well") and,
   for a voucher with `route_family: null`, optionally which hunt.
3. `POST /vouchers/:code/redeem` with `Content-Type: application/json` from
   the marketing origin (CORS allows it; the CSRF guard refuses any other
   origin and any form post).
4. On 201, show `event_code` and link to `event_url`. That link is the game.

Show a clear message for each error code below. Never show the same code
twice as "try again" when the answer is 409 or 410: those are final.

## Endpoints

All responses are JSON. Errors are `{ "error": string, "code": string }`.
Zod validation failures answer `400 INVALID_INPUT`.

### `POST /checkout/create-voucher-session` (public)

Request (every field optional):

```json
{
  "language": "en",                 // en | es | fr | de | nl; email + redeem link language
  "route_family_id": "uuid",        // restrict to one hunt; omit or null for any hunt
  "recipient_name": "Sam",          // ≤ 60 chars, one line
  "message": "Happy birthday"       // ≤ 300 chars, newlines allowed
}
```

Response `200`: `{ "url": "https://checkout.stripe.com/…" }`

Errors: `400 INVALID_INPUT` (bad field, over-long text, unknown language, or
no hunt is currently sellable for the family, or for the default family when
none is given). The check happens before payment so nobody buys a voucher
that could not be redeemed today.

The session carries `metadata.kind = "voucher"`, `language`,
`route_family_id` (`""` for any), `recipient_name`, `message`, and the
payment intent carries `metadata.kind = "voucher"` so voucher sales are
recognisable in the Stripe dashboard.

### `GET /checkout/voucher-success?session_id=…` (public)

Response `200`:

```json
{
  "voucher_code": "ABCD-EFGH-JK",
  "expires_at": "2027-09-24T10:00:00.000Z",
  "redeem_url": "https://cityroam.co.uk/en/redeem?code=ABCD-EFGH-JK",
  "language": "en"
}
```

Errors: `400 INVALID_INPUT` (no session id), `404 VOUCHER_NOT_FOUND` (webhook
not landed yet: poll).

### `GET /vouchers/:code` (public, rate limited)

No personal data: no buyer email, recipient name or message.

Response `200`:

```json
{
  "code": "ABCD-EFGH-JK",
  "status": "PURCHASED",            // PURCHASED | REDEEMED | REFUNDED | EXPIRED | VOID
  "redeemable": true,
  "expires_at": "2027-09-24T10:00:00.000Z",
  "route_family": { "id": "uuid", "name": "Leeds Classic", "city": "Leeds" }  // null = any hunt
}
```

A `PURCHASED` voucher past `expires_at` reports `EXPIRED` even before the
sweep has updated the row.

Errors: `400 INVALID_VOUCHER_CODE` (cannot be a code), `404
VOUCHER_NOT_FOUND`, `429 RATE_LIMITED` (with `Retry-After`).

### `POST /vouchers/:code/redeem` (public, rate limited, CSRF-guarded)

Request (every field optional):

```json
{
  "language": "fr",                 // language to play in; defaults to the voucher's
  "email": "friend@example.com",    // the event link is emailed here too
  "route_family_id": "uuid"         // only used when the voucher is for any hunt
}
```

Response `201`:

```json
{
  "event_code": "k7m2x9pq",
  "event_url": "https://cityroam.co.uk/app/event/k7m2x9pq",
  "event_expires_at": "2026-12-23T10:00:00.000Z",
  "language": "fr",
  "email_sent": true
}
```

The event is created exactly as a paid purchase creates one: a fresh event
code, `NOT_STARTED`, 90 days from now, the route chosen by the same rules as
checkout (the family's route in the requested language, else its English
route). It records the voucher's Stripe payment id, so refunds work through
the existing event paths, and the redeemer's email as `buyer_email`.

If the family has no route in the requested language the English route is
used and `language` in the response says so.

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_VOUCHER_CODE` | Not a code |
| 400 | `INVALID_INPUT` | Bad email, language or family id |
| 403 | `CSRF_REJECTED` | Untrusted `Origin`, or not `application/json` |
| 404 | `VOUCHER_NOT_FOUND` | No such code |
| 409 | `VOUCHER_ALREADY_REDEEMED` | Redeemed before (including a double submit) |
| 410 | `VOUCHER_EXPIRED` | Past its 12 months |
| 410 | `VOUCHER_REFUNDED` | The buyer was refunded |
| 410 | `VOUCHER_VOID` | Cancelled by an admin |
| 429 | `RATE_LIMITED` | Too many attempts from this IP (`Retry-After`) |
| 503 | `NO_HUNT_AVAILABLE` | No sellable route for the voucher right now; the voucher is untouched, try later |

A double submit gets `409` on the second request and no event code. If the
redeemer gave an email the link is in their inbox; otherwise an admin can
find the event from the voucher's detail page.

**Atomicity.** The claim is a compare-and-swap (`UPDATE vouchers SET
status='REDEEMED' WHERE id=… AND status='PURCHASED' AND expires_at > now()`)
in the same transaction as the event insert. Two concurrent redemptions
serialise on the row lock and exactly one wins. If the event insert fails,
the claim rolls back with it.

### Rate limits

Per client IP, fixed windows in Redis:

- lookup: 30 per minute
- redeem: 10 per 15 minutes

Both fail closed (a Redis error answers 500), like the gameplay limiters,
because the codes are bearer secrets.

### Admin (session-only)

API keys are refused with `403 ADMIN_SESSION_REQUIRED`; there is no scope that
grants voucher access.

- `GET /admin/vouchers?q=&status=&page=&per_page=` → `{ vouchers, total, page, per_page }`.
  `q` matches a code (any typed form) exactly, otherwise a substring of the
  code or buyer email. `status` is one of the five statuses.
- `GET /admin/vouchers/:id` → `{ voucher }` with message, family, amount,
  Stripe ids, redeemed event, refund/void dates, email delivery state and the
  redemption link.
- `POST /admin/vouchers/:id/void` body `{ "reason"?: string ≤ 500 }` →
  `{ voucher }`. Only `PURCHASED` or `EXPIRED`; otherwise `409
  VOUCHER_NOT_VOIDABLE`. **Does not refund**: refund from the Stripe
  dashboard.
- `POST /admin/vouchers/:id/resend-email` → `{ success: true, attempts }`.
  Only `PURCHASED` with a buyer email (`409 VOUCHER_NOT_RESENDABLE`, `400
  NO_PURCHASER_EMAIL`); `502 EMAIL_SEND_FAILED` after three attempts.

The admin panel has a Vouchers page (list with search and status filter,
detail with Resend Email and Void Voucher buttons, each behind a
confirmation).

## Stripe webhook behaviour

No new webhook events. The existing endpoint and its four events cover
vouchers:

- `checkout.session.completed` / `checkout.session.async_payment_succeeded`
  with `metadata.kind = "voucher"` and a settled payment create the voucher
  (idempotent on the unique `vouchers.stripe_session_id`) and email the buyer.
  An email failure is recorded on the voucher (`email_failed_at`) and still
  answers 200; a database failure answers 500 so Stripe retries. Sessions
  without `kind = "voucher"` are game purchases and behave exactly as before.
- `charge.refunded` (full refund) and `charge.dispute.created` for a voucher
  payment:
  - unredeemed (`PURCHASED`, `EXPIRED`, `VOID`) → voucher `REFUNDED`,
    `refunded_at` set. The code stops working.
  - already `REDEEMED` → the voucher stays `REDEEMED` and the event it
    created goes through the existing event refund logic: `REFUNDED` and all
    player sessions dropped, so the game stops mid-play if it is running.
  - partial refunds change nothing, as for games.
- The admin **Issue Refund** button on a redeemed voucher's event refunds the
  voucher purchase (the event carries its payment id). The later
  `charge.refunded` webhook is then a no-op.
- There is no admin refund button for an unredeemed voucher: refund it from
  the Stripe dashboard and the webhook does the rest.

## The email and printable card

`services/voucher-email.ts`, in the voucher's language (en, es, fr, de, nl).
The card is the first block of the email: a bordered table with
"City Roam — a treasure hunt round Leeds, guided by the Owl", the recipient
name and message if given, the code, "Redeem by <date>" and the short
redemption address. Printing the email puts the card on page one (a print
stylesheet hides the rest in clients that honour it). No attachment and no new
dependency. A PDF or PNG card would need a renderer (e.g. `@react-pdf` or
`satori` + `resvg`) — not added.

Redeemers who give an email get the normal event-code email with the refund
line replaced by "This game was a gift. Questions? Reply to this email."

## Expiry and retention

- The six-hourly expiry sweep marks `PURCHASED` vouchers past `expires_at` as
  `EXPIRED`.
- The daily retention sweep, 12 months after a voucher ends (redeemed,
  refunded, voided or expired), nulls `purchaser_email`, `recipient_name`,
  `message`, `void_reason` and `email_error`. Six years after purchase it
  nulls the Stripe ids. The redeemer's email is on the event and follows the
  event's 12-month rule.

## For Rob and the solicitor

- **Privacy notice does not cover vouchers.** It needs: the buyer's email and
  the optional recipient name and gift message (collected at checkout, also
  stored in Stripe as session metadata), the redeemer's optional email, the
  retention periods above (applied by analogy with events), and that a gift
  message is shown to whoever holds the code.
- **Terms and refund policy need voucher wording**: 12-month validity; the
  90-day game window starts at redemption; who may ask for a refund (the
  buyer) and until when (the system applies any full refund issued in
  Stripe, at any time; after redemption that also stops the game, so the
  policy has to say when Rob will issue one); what happens to an expired
  voucher (no automatic refund); the code is a bearer token and anyone holding
  it can redeem it. The voucher email makes no refund promise; it says
  "Questions about the voucher? Reply to this email."
- **UK consumer law check**: a 12-month expiry on a gift voucher is common
  and lawful in the UK, but the solicitor should confirm it for this product.
- **Accounting: breakage.** Voucher money is received at purchase, but the
  service is delivered at redemption, so an unredeemed voucher is a liability
  (deferred income) until it is redeemed, refunded or expires. Revenue from
  vouchers that expire unredeemed ("breakage") is recognised at expiry or
  estimated over the voucher's life, depending on the accountant's policy.
  VAT: a single-purpose voucher (one service, UK place of supply known)
  is taxed at sale, not redemption — confirm the classification with the
  accountant. The admin list filters `EXPIRED` and `PURCHASED` for the
  figures.
- **Dashboard revenue count.** "Total revenue events" counts events with a
  Stripe payment id, so a redeemed voucher's event is counted at redemption;
  unredeemed vouchers are not counted anywhere on the dashboard.
- **Copy review**: the voucher and gift-line email strings in es, fr, de and
  nl were written in the codebase, not by the translators.
