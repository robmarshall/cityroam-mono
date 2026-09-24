# City Roam brand redesign: Direction A, "Leeds, annotated"

Status: approved by Rob (owner decisions 2026-09-24). Phase 1 (brand
foundations) and Phase 2 (Owl rename) run in parallel; the rest follow in
order.

## Direction

A calm, editorial look that reads like a well-thumbed city guide with notes in
the margin: warm stone paper, deep navy ink, a single brick-red accent, a
serif display face and a quiet owl mark. Photography (shot by Rob) carries the
place; the chrome stays out of its way.

## Owner decisions

- **Direction A, "Leeds, annotated".**
- **Guide = "The Owl".** Translated names come from a shared `GUIDE_NAMES`
  constant (added in Phase 2): El Búho (es), Le Hibou (fr), Die Eule (de),
  De Uil (nl).
- **The Owl admits being an AI, in character, when sincerely asked.**
- **Owl mark**: an SVG built in code only (no commission). Monoline, two circle
  eyes, ear tufts, a V beak, drawn on a 24-unit grid and legible at 16px.
  - Must not copy the Leeds heraldic owls (no crown, no heraldic pose).
  - Must not look like a cartoon mascot (not Duolingo).
  - No owl puns anywhere in copy.
  - 2026-09-24: a softer redraw (pupils, filled beak) was tried and
    reverted; Rob preferred the original mark. What stayed: the favicon,
    apple icon and app favicon are generated from the same drawing as the
    header mark (`owlIconSvg()`, navy owl on stone; `npm run icons -w
    @cityroam/shared`), and a test fails if the files drift.
- **Price stays £29 per group.** An A/B test comes after launch.
- **No phone numbers and no founder face** on the site.
- **Rob shoots all photos.** Layouts use photo slots until the shots exist.
- Later but in scope: a stag page, gift vouchers before Christmas, a real demo
  sandbox after launch.

## Product truth marketing must respect

The guide does **not** "answer anything". It answers from the current clue,
the current leg's directions and fun facts, and the distance remaining (see
`packages/api/src/services/pipeline/handlers/question.ts`). Copy must not
overclaim general knowledge, live local tips or anything outside the route.

## Palette

Tokens live in `packages/shared/src/tailwind/preset.css` (mirrored in
`preset.ts` and in `BRAND` in `packages/marketing/src/lib/site.ts`). The
existing `brand-*` and `bubble-*` tokens are unchanged because the player app
and admin still use them.

| Token | Hex | Use |
| --- | --- | --- |
| `stone-50` | `#F5F1EA` | Page background (base) |
| `stone-100` | `#ECE6DB` | Alternate band, cards on white |
| `stone-200` | `#DDD5C6` | Borders, rules |
| `stone-300` | `#C9BEAB` | Stronger borders |
| `ink-500` | `#4A5670` | Secondary UI text on light |
| `ink-700` | `#2A3654` | Body text on light |
| `ink-900` | `#14213D` | Headings, navy bands, wordmark |
| `brick-100` | `#F3DDD5` | Tint behind brick accents |
| `brick-500` | `#B5452B` | Primary buttons, accent rules, links |
| `brick-600` | `#9A3A24` | Primary hover / pressed |
| `muted` | `#5C5A55` | Small print on stone/white |

### Contrast rules (WCAG 2.x, computed)

| Pair | Ratio | Verdict |
| --- | --- | --- |
| White on brick-500 | 5.45 | AA |
| Stone-50 on brick-500 | 4.84 | AA |
| Brick-500 text on stone-50 | 4.84 | AA |
| Navy (ink-900) on stone-50 | 14.19 | AAA |
| Brick-500 on navy | 2.93 | **Fails** |
| Brick-500 text on stone-100 | 4.39 | Fails for body text |
| Brick-600 text on stone-100 / brick-100 | 5.63 / 5.36 | AA |
| Muted on stone-50 / white | 6.12 / 6.89 | AA |

**Never put brick text or brick buttons on navy.** Small brick text goes on
stone-50 or white only; on stone-100 or brick-100 use brick-600. On navy
bands use the inverse button (a stone button with navy text) and stone or
white text.
`packages/marketing/src/__tests__/contrast.test.ts` asserts the pairs the site
actually uses.

## Type

- Display: **Fraunces** (opsz axis, `WONK` off), fallback Georgia, serif.
- Body: **Inter**.
- Both via `next/font/google`, latin subset, `display: swap`, exposed as CSS
  variables and mapped in `globals.css` with `@theme inline`.
- Share cards (Satori) use static TTFs in `packages/marketing/assets/fonts/`
  (Fraunces SemiBold, Inter Regular and SemiBold) with their OFL licences.

## Phases

1. **Brand foundations** (parallel with 2): tokens, contrast test, fonts, owl
   mark (`packages/shared/src/brand/owl.ts` + `OwlMark`), favicon and apple
   icon, OG card, chrome restyle (Header, Footer, CTAButton, Section tones
   stone/white/navy, LegalPage, KeyFacts). No page restructuring.
2. **Owl rename** (parallel with 1): the guide becomes The Owl everywhere
   (app, API prompts, message banks, docs, marketing copy), `GUIDE_NAMES` in
   shared constants, player-app favicon.
3. **Home redesign**: PhotoHero / PhotoSlot, Annotation, LineMap,
   RouteAtAGlance, TrustStrip, GiftLine, AudienceCards, Footer with company
   details.
   - **Status (2026-09-24): built.** Home order: hero (PhotoHero, or a
     PhotoPlaceholder panel beside the headline until the photo exists) →
     how it works with the chat demo → route at a glance (LineMap +
     RouteAtAGlance) → what you get, price card and GiftLine → comparison →
     AudienceCards → TrustStrip → FAQ → navy closing band. The old intro,
     "just your phone", "why City Roam" and refund bands were folded in or
     dropped. Footer has audience links above the company line.
   - Photos: `packages/marketing/src/images/photos/README.md` lists the
     expected files; `src/lib/photos.ts` maps slots (`homeHero`, `families`,
     `henParties`, `teamBuilding`) to `null` until then. Adding a photo is
     the file plus one manifest entry; the hero is preloaded per crop.
   - Route facts: `src/lib/route-facts.ts` (`RouteFacts`, the shape Phase 6's
     endpoint should return). Only distance, duration and stops are filled
     in; start point, step-free, dogs, toilets and cover are null (hidden)
     until Rob's route walk.
   - The Owl's margin notes (5 lines, all locales, none about a stop):
     `home.notes.*`.
   - Waiting on Rob: M1, F1, H1, T1 photos; the route walk; a start point
     that isn't the first answer. Stag card and footer link: done in Phase 4.
4. **Audience pages v2** plus a stag page; success, 404 and legal styling.
   - **Status (2026-09-24): built.** One layout for all four audience pages
     (`AudiencePage`, copy under `families.*`, `henParties.*`,
     `teamBuilding.*`, `stagParties.*` with the shared bits in
     `audience.*`): PhotoHero with the price in it (£29 per group, about £3
     each for 10) → three reasons that are true for that audience beside a
     detail photo slot → "Two groups? Book two games." (two bookings of up
     to 10, no scoreboard claims) → compact route at a glance → TrustStrip
     → FAQ → navy closing band with the page's checkout segment. Each page
     has two of the Owl's notes; none names a stop. The old intro,
     "why families like it", "perfect for", features and safety bands were
     folded into the reasons and the FAQ.
   - Stag page at `/<locale>/stag-parties`, checkout segment `stag`. The
     API accepts any lower-case slug and a segment without its own entry in
     `CHECKOUT_ROUTE_FAMILY_IDS` takes the `default` family (or the single
     active one), so stag bookings play the homepage hunt until a stag
     family is mapped. The copy sells the daytime and never the drinking.
   - Header keeps three audiences; the footer lists all four plus
     "Gift vouchers" (`/gift`); the home page has a fourth audience card.
     Sitemap: stag and `/gift` in all five locales with hreflang (not
     `/redeem` or `/gift/success`).
   - Checkout success: owl, "Forward this to your group" card (link, copy,
     share), three next steps, an Owl note, a gift voucher line and the
     refund line; polling, noindex and analytics unchanged. 404: an Owl note
     ("This page isn't on the route. I checked twice."), home button and
     the four audience links. Legal pages: styling only, with a numbered
     table of contents (sticky column from lg); the text is untouched.
   - Photos: new slots `stagParties` (S1) and `familiesDetail` (F2),
     `henPartiesDetail` (H3), `teamBuildingDetail` (T2), all null. No stag
     detail slot (S2 is a pint stop).
   - Waiting on Rob: F1, H1, T1, S1 and F2, H3, T2 photos; mapping a stag
     route family if it should ever differ; the route walk (start point,
     step-free, dogs, toilets, cover still hidden).
5. **Scripted "Try the Owl" demo** (canned, honest about what the Owl can
   answer).
   - **Status (2026-09-24): built.** `TryTheOwl` (client-side, nothing sent
     to a server) on home, in its own "Try the Owl" band after How it works
     (`#try-the-owl`, linked from "Try the Owl ›" beside the hero's Book
     now), and on `/treasure-hunt` in "What a clue looks like" in place of
     the static phone. On phones the home page drops the static chat snippet
     (the playable demo follows straight after); from `sm` the phone mock
     stays beside How it works. `ChatSnippet` is gone.
   - One sample clue from off the route: Father Time on the Time Ball
     Buildings clock, Lower Briggate (not a stop). Answers use the game's
     own matcher, moved to `packages/shared/src/utils/answer-match.ts`
     (the API re-exports it, behaviour unchanged). Two hints then the
     reveal, a Q&A bank (distance, "is this the real route", coffee, price,
     the building, hello), a fallback ("I only know this stretch of the
     route. Try the clue."), then the fun fact, "That's the taste. The real
     route has more of this." and a booking button (`cta_clicked`, location
     `demo`). Copy under `demo.*` in all five locales; matching lists in
     `src/lib/demo/script.ts`; the state machine in `src/lib/demo/engine.ts`.
   - "Are you a bot?": `classifyIdentityQuestion` in shared (ai / machine /
     person / who), run before answer matching, with rotating replies per
     kind. Machine and who replies never open with a no; only "are you a
     person?" may. The three `demo.owl.identity.ai.*` replies are the only
     marketing strings allowed to say AI (explicit key list in
     `AI_EXEMPT_MESSAGE_KEYS`, enforced by the no-AI tests).
   - Analytics: `demo_started`, `demo_answered` (correct/incorrect),
     `demo_hint`, `demo_completed`, each with the page as `location`.
   - Waiting on Rob: confirm the Time Ball facts (Father Time on the clock,
     the one o'clock ball from Greenwich) and the "written by people / by
     hand" wording in the AI replies.
6. **Route facts in the database**: admin form (explicit Save, never
   autosave) and a public endpoint feeding the marketing facts.

- **Vouchers** run in parallel with phases 3–4 (before Christmas).
- **Post-launch**: real demo sandbox; price A/B test (a second Stripe price, a
  PostHog flag and a signed cookie; both prices are genuinely charged).
