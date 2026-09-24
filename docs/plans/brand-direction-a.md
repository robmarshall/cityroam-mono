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
  - Revised 2026-09-24 after Rob found the first favicon "a bit creepy"
    (hollow, pupil-less eyes read as a blank stare at 16–32px, and the V
    beak blurred into a heart): the head is now softer (curved tufts, a
    gently dipped crown), the eyes are thin rings with pupils set a touch
    low and inwards, and the beak is a small filled triangle. The favicon,
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
4. **Audience pages v2** plus a stag page; success, 404 and legal styling.
5. **Scripted "Try the Owl" demo** (canned, honest about what the Owl can
   answer).
6. **Route facts in the database**: admin form (explicit Save, never
   autosave) and a public endpoint feeding the marketing facts.

- **Vouchers** run in parallel with phases 3–4 (before Christmas).
- **Post-launch**: real demo sandbox; price A/B test (a second Stripe price, a
  PostHog flag and a signed cookie; both prices are genuinely charged).
