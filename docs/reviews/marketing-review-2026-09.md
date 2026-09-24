# Marketing site review — September 2026

Scope: `packages/marketing`, all five locales (en, es, fr, de, nl): home,
families, hen parties, team building, checkout success, terms, privacy,
refunds and the 404 page. Reviewed on 2026-09-23 against `project-spec.md`,
`docs/llm-authoring/guide-personality.md`, the player app's copy and the API.
Sources: a production build (`next build` + `next start`), desktop screenshots
in Chrome, 390px-wide renders in iframes, the rendered HTML, and the source.

Status key: **Fixed** means changed in this round. **Owner** means it needs a
decision or information only the owner has. **Legal** means it is in the legal
pages, which are waiting for solicitor review, so it is flagged and not changed.

## Summary

The site was structurally sound (per-page metadata, hreflang, sitemap and
locale routing all worked), but the content had drifted from the product:

1. **Fabricated testimonials.** Named reviews with job titles ("Sarah
   Mitchell, Marketing Director") on three pages. The product has not launched,
   so these cannot be real. Under the DMCC Act 2024 (in force April 2025),
   fake consumer reviews are a banned practice. Removed.
2. **Features that don't exist.** Leaderboards and team "races", "totally
   personalised" hen dos, "choose your starting point from anywhere", corporate
   invoicing, "detailed briefing materials", free rescheduling for bad weather,
   9am–4pm start windows, and a hen group size of 6–12 when the hard limit is
   10. Rewritten to match what the code does.
3. **Tone.** Generic, exclamation-heavy copy ("Absolutely!", "memories that last
   a lifetime") that clashed with the brand's dry, understated guide. The chat
   demo had the guide saying "That's right! Well done 🎉", which breaks every
   rule in the guide personality doc. Rewritten throughout, in all five
   languages.
4. **Visible bugs.** The families page printed raw escape codes
   (`👴👵`) as card icons and scrolled sideways on phones.
   The closing CTA button was blue on a blue band, so it had no visible edge.
   The JSON-LD escape was a no-op. Fixed.
5. **Accessibility.** White text on `#007AFF` buttons measured 4.0:1, which
   fails WCAG AA. The FAQ, menu and language switcher had no expanded state,
   there was no reduced-motion handling, and the 404 page was Next's unbranded
   default with no `lang`. Fixed.

The biggest remaining risks are owner decisions. See P1 items marked **Owner**
or **Legal**, especially the £49 "was" price and the privacy page's cookie
consent claims.

## Findings

Line numbers refer to the files **before** this round (`git show HEAD:<path>`).

### P1

| # | Location | Problem | Recommendation | Status |
|---|---|---|---|---|
| 1 | `messages/*.json` `home.reviews.*`, `henParties.testimonials.*`, `teamBuilding.testimonials.*`; `app/[locale]/page.tsx:218-236`, `hen-parties/page.tsx:194-213`, `team-building/page.tsx:195-216` | Invented reviews with names, roles and companies, shown as genuine. A banned practice under the DMCC Act 2024 and CPUT Schedule 1, and a trust risk if spotted. | Remove them. Add real reviews once they exist (Proposal 5). | **Fixed**: sections and keys removed |
| 2 | `families/page.tsx:104-118` | JSX attribute strings don't process JS escapes, so `icon="👴..."` rendered the literal text. The unbreakable string made the page 524px wide at a 375px viewport, so it scrolled sideways. | Fix the component. | **Fixed**: emoji icons replaced by shared components |
| 3 | `henParties.problem.text3`, `henParties.organise.perfectSize` | "Ideal for groups of 6–12", but `MAX_PARTICIPANTS` is 10 and the API rejects the 11th player. | Say up to 10, and suggest two bookings for bigger groups. | **Fixed** |
| 4 | `teamBuilding.faq.1`, `teamBuilding.sizes.*` | Promises leaderboards, teams that "race" and "compete". The spec excludes scoring and leaderboards, and the code has none. | Describe informal rivalry honestly (no official scoreboard). | **Fixed** |
| 5 | `teamBuilding.practical.*`, `teamBuilding.faq.0/2/3` | Promises "proper invoicing", "expense-friendly pricing", "detailed briefing materials", "coordination for multiple teams", "full rescheduling for severe weather", start times "between 9am–4pm", and corporate discounts. None of these exist in the product or the Stripe setup (no `invoice_creation`). | Cut the promises you can't keep, and point invoice and multi-team questions to email. | **Fixed** (see also #6) |
| 6 | `legal.terms` "Our liability" last paragraph vs the team-building page | The terms say "We supply hunts to consumers. If you buy for business purposes, the consumer protections … do not apply", but a whole page sells to businesses. | Ask the solicitor to add B2B terms, or at least confirm the wording works for company purchases. | **Legal** |
| 7 | `home.howItWorks.step1Desc` | "Choose your starting point … from anywhere in the city centre". Routes have a fixed start and the lead player presses start. | Describe the real flow: book, share the link, start, go at your own pace. | **Fixed** |
| 8 | `home.pricing.originalPrice` (£49, struck through) | A "was" price is only lawful if it was a genuine previous selling price for a reasonable period (CMA pricing guidance; DMCC Act). The site has never charged £49. | Remove the strikethrough, or reword it as "£29 launch price" with no reference price. See Proposal 4. | **Owner** (left as is; screen-reader text "Was" added so it's no longer read out as a bare second price) |
| 9 | `legal.privacy` "What we collect" and "Cookies" | (a) "any photos players send in the in-game chat": players can't send photos (spec §1.3, no upload UI). (b) "Analytics … if you accept analytics cookies" and "only if you accept", but PostHog loads unconditionally and there is no banner, as the same page later admits. (c) "remember your cookie choice": there is no choice. | Solicitor to correct. The launch checklist already records the consent decision. | **Legal** |
| 10 | `legal.terms` / `legal.privacy` "Registered business name and address: [complete before launch]" | Placeholder is live on every locale. The trader's identity is a legal requirement for distance selling. | Fill it in before launch. | **Owner / Legal** |
| 11 | `faq.1`, `families.faq.2`, `teamBuilding.practical.text2` vs `project-spec.md` (90 min / 1–2 h) and the seeded dev route (60 min, 2.5 km) | The site says 2–3 hours (2.5–3.5 with children) and "about 2.5 miles" (4 km). The spec says about 90 minutes. The dev route is 2.5 **km**. | Confirm the live route's real duration and distance, then update the numbers. The copy now uses them consistently, so it's a find-and-replace. | **Owner** |
| 12 | `faq.3`, `families.faq.1`, `home.included.items.5` | "The entire route is … wheelchair accessible … avoiding steps and steep hills". Not verifiable from the code, and it's a strong accessibility promise. | Now says "mostly flat, on city-centre pavements", with "email us before you book" for wheelchair users. Only restore a stronger claim once the route has been walked with that in mind. | **Fixed** (softened); **Owner** to confirm |
| 13 | `components/CTAButton.tsx:70`, `Header.tsx`, step circles | White on `brand-500` (#007AFF) is 4.0:1, which fails AA for 16–18px text. Every primary button and the step numbers used it. | Use `brand-600` (#0062CC, 5.8:1) for filled buttons and badges. The shared preset is untouched, so the player app's bubbles don't change. | **Fixed** |
| 14 | `families|hen-parties|team-building/page.tsx` CTA band | A blue button on a blue band: the button had no visible edge. | Add an inverse (white) button variant for brand-coloured backgrounds. | **Fixed** |
| 15 | `messages/*.json` `chatDemo.*` | The demo guide said "That's right! Well done 🎉" and "Welcome to City Roam! 📱", breaking the guide's no-exclamation, no-emoji rules. "The Old Town Hall … golden clock" isn't a Leeds landmark. | Rewrite in the guide's voice with a true Leeds example (the Corn Exchange, by Cuthbert Brodrick). | **Fixed** (the demo now names the Corn Exchange; swap it if that's a live-route answer you'd rather not reveal) |

### P2

| # | Location | Problem | Recommendation | Status |
|---|---|---|---|---|
| 16 | All `messages/*.json` non-legal copy | Tone: exclamation marks (27 in en), clichés ("unforgettable", "memories that last forever", "Instagram-worthy", "Absolutely!"), US spelling ("personalized"), Title Case headings. Doesn't match the brand voice or the target market. | Rewrite in plain, dry British English with sentence-case headings, then re-translate. | **Fixed** in all five locales |
| 17 | `home.problem.text1` | "No schedules. No guides." on a product whose selling point is the guide. | "No tour guide. No timetable." | **Fixed** |
| 18 | Home: `phone.*`, `included.*`, `whyChoose.*` | "No download", "pause and resume" and "just your phone" each appeared three times across adjacent sections. | Give each section its own job: phone = how the chat works, included = what you get, why = how it's different. | **Fixed** (copy). The deeper restructure is Proposal 2 |
| 19 | Audience pages | No price anywhere on the families, hen or team pages. The only price is on the homepage. | Add a price and refund line to each closing CTA band (`cta.priceNote`). | **Fixed** |
| 20 | `app/[locale]/page.tsx:59`, `IphoneDemo.tsx` | The hero phone mock is about 690px tall. On a 390px phone it pushed everything below the fold and overflowed the viewport (381px on 375). | Hide the hero mock below `sm` (the second demo still shows) and shrink both mocks. | **Fixed** |
| 21 | `components/CTAButton.tsx:67` | The hero CTA was centred under left-aligned copy at desktop widths. | Add an `align="start-lg"` option. | **Fixed** |
| 22 | `components/FAQ.tsx` | No `aria-expanded`/`aria-controls`. Answers weren't in the DOM when collapsed, so they weren't indexed. The audience pages rendered their FAQs differently (static list). | One accessible accordion with answers kept in the HTML behind `hidden`, used on all four pages. | **Fixed** |
| 23 | `components/Header.tsx` | The menu and language toggles lacked `aria-expanded`. There was no Escape to close. A 150ms `onBlur` timeout raced keyboard users. The mobile language buttons were read as "EN", "ES" with no language name or `lang`. The code labels were gray-400 (2.5:1). There were no focus-visible styles. | Fix all of these. | **Fixed** |
| 24 | `IphoneDemo/ChatDemo.tsx`, `globals.css` | No `prefers-reduced-motion` handling: spring animations, typing dots and auto-scroll always ran. Screen readers heard a conversation that kept changing. | With reduced motion, show the finished conversation with no animation. Expose the demo as `role="img"` with a single label. | **Fixed** |
| 25 | No `not-found` page | `/en/anything` served Next's unbranded default 404, with no header, footer or `lang`. | Add a localised `[locale]/not-found.tsx` and a `[...rest]` catch-all. | **Fixed**. Returns 404 with `noindex` and renders translated inside the site chrome. Known limitation: Next 16 sends an empty `__next_error__` HTML shell for this 404 and the page fills in once JavaScript runs (no server errors logged). Harmless for SEO. Worth revisiting on a later Next release. |
| 26 | `app/[locale]/layout.tsx:86` | `.replace(/</g, "<")`: the replacement is the `<` character itself, so the JSON-LD `</script>` guard did nothing. | Use `"\\u003c"`. | **Fixed** |
| 27 | `layout.tsx:66`, `CTAButton.tsx:40` | Price hard-coded as `29` in two places. | Use a `PRICE_GBP` constant in `lib/site.ts`, documented as mirroring the Stripe price. | **Fixed** |
| 28 | `checkout/success/page.tsx:207` | The link `<label>` wasn't tied to its input. The loading and error states weren't announced. The refund note had no link to the policy. Nothing said the link had been emailed or how long it lasts. "What's next?" wasn't a heading. | Fix all of these. | **Fixed** |
| 29 | `lib/metadata.ts:44` | The OG image alt was the bare "City Roam", while `metadata.home.ogImageAlt` existed unused in every locale. | Use the localised alt. | **Fixed** |
| 30 | Metadata copy (`metadata.*`) | Titles in Title Case with no keyword. The team description said "teams of 4-10+". | Rewrite: keyword first ("Family treasure hunt in Leeds — City Roam"), accurate descriptions of 160 characters or fewer. | **Fixed** |
| 31 | `src/__tests__/smoke.test.ts` | The translation test compared top-level keys only, so a missing nested key would ship as a raw key path. | Add a deep key-parity test. | **Fixed** |
| 32 | Duplicate components | `FeatureCard`, `IconCard`, `NumberedStep`, section and heading class strings were copied across four pages and had drifted (different card backgrounds, shadows, icon rules). | Extract `components/Section.tsx` (Section, SectionHeading, PageHero, Intro, Card, CardGrid, CheckList, Steps, CtaBand). | **Fixed** (the four pages shrank by about 45%) |
| 33 | Emoji used as icons (about 40 across the pages) | They render differently on every OS, look cheap next to the type, and clash with the brand's "no emoji" rule. | Remove them. Lists use one check icon, and cards are text-only. A proper icon set is part of Proposal 6. | **Fixed** |
| 34 | Section rhythm | On the home page, "What's included" and "Why City Roam" were both white with no divider. On hen and team, the testimonials and FAQ alternated oddly once removed. | Alternate white and grey backgrounds consistently. | **Fixed** |
| 35 | Header "Book now" on audience pages | Links to `/#pricing` on the homepage, so the booking loses the page's `segment` (for example, `families`) and any route family mapped to it. | Make the header CTA segment-aware, or scroll to the page's own CTA band. | **Owner** (harmless while one route family is live) |
| 36 | `messages/fr.json` `faq.3` | "surfaces pavées" means cobbled, the opposite of the intended meaning. | Correct. | **Fixed** |
| 37 | All locales | Message files mixed raw UTF-8 and `\uXXXX` escapes line by line. | Normalise to raw UTF-8. | **Fixed** (this makes the diff larger than the content change) |

### P3

| # | Location | Problem | Recommendation | Status |
|---|---|---|---|---|
| 38 | `app/global-error.tsx` | Hard-coded contact email. | Use `CONTACT_EMAIL`. | **Fixed** |
| 39 | `common.header.currentLanguage` | Unused key in every locale. | Remove. | **Fixed** |
| 40 | `IphoneFrame.module.css:1` | Stale filename comment. | Remove. | **Fixed** |
| 41 | `CTAButton.tsx` | `checkout_started` fires on click, before the API has created a session. The spec says "Stripe session created". | Move it after a successful response, or rename it. Analytics funnels depend on this, so it's left for the owner. | **Owner** |
| 42 | Naming | The player app now says "game" ("Start the game", "Leave game"). The marketing and legal copy said "hunt", "experience" and "adventure" interchangeably. | Marketing now uses "treasure hunt" for the category (SEO) and "game" for the thing you play and book, to match the app. The legal pages still say "hunt". Align them at solicitor review. | **Fixed** (marketing); **Legal** |
| 43 | `app/[locale]/opengraph-image.tsx` | The share card shows "CR" in a rounded square as a stand-in logo. | Replace it when there's a real logo (Proposal 6). | **Owner** |
| 44 | Footer | Links only to the legal pages. The audience pages are reachable only from the header. | Add Families / Hen parties / Team building links for internal linking. | Proposal 7 |
| 45 | Checkout success URL | The API's `success_url` has no locale, so the page renders in the negotiated locale rather than the one used at checkout. | Pass the locale into `success_url` in `packages/api/src/routes/checkout.ts`. | **Owner** (API change, out of scope) |

## Translation notes for a native speaker

The es/fr/de/nl copy was rewritten from the new English, not translated
literally. Worth a native read before launch:

- **All locales:** the guide's jokes in `chatDemo.*`, `faq.5` ("It's Leeds,
  so it might"), `families.perfectFor.holidays` ("it is a screen, but you're
  outside") and `henParties.safety.text3` ("pace the drinks") were adapted, not
  translated. Check they land and stay dry rather than rude.
- **de:** standardised on "ihr" for the group and "du" only on the checkout
  page. "falls jemand schlappmacht" and "Ich verkneife mir jeden Kommentar" are
  colloquial. "Vorher" is the screen-reader label before the struck-through
  price.
- **fr:** "vous" throughout. "EVJF" in the nav. The "surfaces pavées" error
  (it means cobbled) is fixed. "Au lieu de" labels the old price. "Coincés ?
  … Je ne jugerai pas, ou pas trop fort" is a loose adaptation.
- **es:** Spain Spanish, "vosotros" for the group and "tú" for the buyer. The
  guide label is "Guía", which matches the player app. The joke "dosificad las
  copas" needs a check.
- **nl:** "Gids" is the guide label, and "Normaal" is the old-price label.
  "voor wie begint in te kakken" (flagging) is informal. The home and families
  meta descriptions are right at 160 characters.

## Proposals for owner decision

Not implemented. Effort: S is under half a day, M is 1–2 days, L is 3 or more
days.

### 1. Lead with the experience, not "AI" — S

**Why.** "AI-guided treasure hunts" is the H1, the title, the OG tagline and
the subtitle. For families and hen parties "AI" is at best neutral and at worst
a worry ("will it be a chatbot?"). The guide personality doc says the guide
"never breaks character … never 'an AI'", and the marketing contradicts that.
The guide's real draw is its dry wit and local knowledge. Keep "AI" in the
metadata description for the curious, and drop it from the headline.

**Draft.**
- H1: "A treasure hunt round Leeds, in your group chat"
- Subtitle: "Solve clues, explore the city centre and hear the stories behind it, with a guide who knows every building. £29 for up to 10 people."
- Title tag: "City Roam — treasure hunts around Leeds city centre"
- OG tagline: "Treasure hunts around Leeds, played on your phones"

### 2. Tighten the home page from nine sections to seven — M

**Why.** "Just your phone", "What's included" and "Why City Roam" still cover
overlapping ground, and the price appears two-thirds of the way down. Buyers
need the what, how, price and trust signals in the first two screens.

```
[Hero: headline · subtitle · CTA · key facts strip]   (see 3)
[How it works: 4 steps]  ── with the phone demo beside it on desktop
[What you get: 6-item checklist + price card side by side]
[Who it's for: 3 cards linking to Families / Hen parties / Team building]
[Refund promise band]
[FAQ]
[Final CTA]
```

Merge "Just your phone" into How it works, and "Why City Roam" into the
audience cards.

### 3. Key-facts strip under the hero CTA — S

**Why.** Price, group size, duration and "no app" are the four things every
segment asks first. Right now they're scattered.

**Draft (en).** `£29 per group · Up to 10 players · 2–3 hours · No app needed`

```
[ Book now ]
£29 per group · Up to 10 players · 2–3 hours · No app needed
```

### 4. Price presentation — S

**Why.** See P1 #8. The £49 strikethrough is a legal risk unless £49 was
genuinely charged. The price card also sits apart from what you get.

**Draft.** Drop the reference price and badge the launch instead:
"£29 per group — launch price. Up to 10 people, link valid for 90 days, full
refund if you're not happy." A per-head comparison helps groups: "That's under
£3 each for a group of 10."

### 5. Real social proof — S, once there is some

**Why.** Reviews were removed (P1 #1). The completion screen already asks for
Google reviews.

**Draft.** A three-quote strip with first name and month played, linked to the
Google Business profile. Until then, one honest line: "New in 2026. Tell us
how it went: we read everything." Don't show star ratings until there are real
ones.

### 6. Visual identity pass: logo, icon set, photography — L

**Why.** The site is all system font, iOS blue and a phone mock, with no Leeds
in it. A hen party or a visitor gets no sense of place. The OG card and apple
icon use a "CR" stand-in.

**Draft.** Commission or license 6–8 photos (Victoria Quarter, Corn Exchange,
Kirkgate Market, a group looking at a phone on Briggate), a wordmark, and one
consistent line-icon set (for example Heroicons outline) to reintroduce icons
in cards. Photos go in the hero on audience pages:

```
[ full-bleed photo, dark gradient ]
  Family adventures made easy
  [ Book now ]
```

### 7. Navigation and footer — S

**Why.** The header CTA drops the audience segment (P2 #35). The footer has no
audience links.

**Draft.** Header "Book now" scrolls to the page's own closing band on the
audience pages. Footer gets a second row: "Families · Hen parties · Team
building · Terms · Privacy · Refunds".

### 8. Stag do page — M

**Why.** The spec lists hen *and* stag groups as a target audience, but there
is only a hen page. Stag groups are a large Leeds weekend market.

**Draft.** H1 "A stag do treasure hunt in Leeds". Intro: "Clues, pubs and a
bit of competitive shouting. Up to 10 on one booking; bring the whole party by
booking one game per team." It reuses the hen page structure and needs a new
`stag-parties` checkout segment mapped in `CHECKOUT_ROUTE_FAMILY_IDS`.

### 9. "Play in your language" for visitors — S

**Why.** The app supports five languages, and the site is translated into
five. Visitors from abroad are part of the target market, but nothing says
the game itself can be played in Spanish, French, German or Dutch.

**Draft (FAQ).** "Can we play in another language? — Yes, if the route is
available in it: the group lead picks the language before starting." Only add
this once every live route has all five language variants.

### 10. Weather and accessibility detail — S

**Why.** These are the two biggest objections for families and older
relatives. The answers are generic until the route has been checked.

**Draft.** A short "Route at a glance" box on the families page: start point
area, distance, number of stops, steps or slopes (yes/no), toilets en route,
covered sections. Fill it in from a walk of the live route.
