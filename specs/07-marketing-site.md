# Spec 07: Marketing Site (Next.js)

## Goal
Build the Next.js marketing site with landing page, checkout flow, and success page.

## Deliverables

### 7.1 Marketing Package Setup
- Next.js + TypeScript + Tailwind (extending shared preset from `@cityroam/shared/tailwind`)
- PostHog SDK initialisation
- Environment variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`
- Note: No Stripe publishable key needed — checkout uses server-to-server API call, not client-side Stripe.js

### 7.2 Landing Page (`/`)
- Server-rendered for SEO
- Clear headline communicating value proposition
- "How it works" section: 3 steps (Book, Share the link, Explore)
- Price displayed prominently: "£29 — normally £49" (launch pricing with anchored higher price)
- Single CTA button: "Book Your Hunt" — triggers checkout flow
- Social proof section (placeholder cards for reviews — manually populated initially)
- FAQ section (accordion/collapsible):
  - How many people can play? (Up to 10)
  - How long does it take? (About 90 minutes)
  - What do I need? (Just a phone with internet)
  - Is it accessible? (Covers ~Xkm of city centre walking)
  - What's the refund policy? (Full refund, no questions asked)
- Refund policy displayed clearly: "Not happy? Get a full refund, no questions asked."
- PostHog: `page_viewed`, `cta_clicked` (with location: "hero" | "pricing" | "faq"), `faq_expanded`

### 7.3 Checkout Flow
1. CTA click → show loading state on button ("Redirecting to checkout...")
2. Call API `POST /checkout/create-session`
3. On success: redirect to Stripe hosted checkout URL (window.location.href)
4. On error: show error message ("Something went wrong. Please try again.")
5. Stripe redirects to `/checkout/success?session_id=...` on completion
6. Stripe redirects to `/` on cancellation
- PostHog: `checkout_started` (on CTA click, before API call)

### 7.4 Success Page (`/checkout/success`)
- On mount: extract `session_id` from URL query params
- Call API `GET /checkout/success?session_id=...` to retrieve event code and URL
- **Loading state:** "Setting up your hunt..." with spinner
- **Error state:** "We couldn't find your booking. Check your email for the event link, or contact us." (email might have the link even if this page fails)
- **Success state:**
  - "You're all set!" heading
  - Event link displayed prominently in a copyable field
  - Copy button: copies link to clipboard, shows "Copied!" confirmation
  - Share button: Web Share API (`navigator.share`) with fallback to clipboard copy. Share data: title "Join my City Roam treasure hunt!", url: event link
  - Instructions: "Share this link with your group. Everyone opens it, enters their name, and the lead person starts when everyone's ready."
  - Refund policy reminder: "Not happy? Get a full refund — no questions asked."
- **Refresh handling:** The success page calls the API each time, so refreshing works (event code is looked up by session_id). No client-side caching needed.
- PostHog: `checkout_completed`, `event_link_copied`, `event_link_shared`

### 7.5 SEO & Meta
- Page title: "City Roam — AI-Guided Treasure Hunts in Leeds"
- Meta description: compelling summary for search results
- Open Graph tags: title, description, image (placeholder social preview image)
- Twitter Card meta tags
- Structured data: `LocalBusiness` or `Product` schema (JSON-LD)
- Sitemap generation (`next-sitemap` or similar)
- Robots.txt allowing all crawlers

### 7.6 Responsive Design
- Mobile-first, works on all screen sizes
- Lighthouse mobile score target: 80+

## Dependencies
- Spec 01 (shared Tailwind preset, analytics catalogue)
- Spec 03 (API checkout endpoints — POST /checkout/create-session, GET /checkout/success)

## Backend Tests
- None (frontend package — no backend tests per instructions)
