# City Roam Content Authoring Guide

This document explains how to write high-quality treasure hunt routes for City Roam. Follow these guidelines when creating routes, groups, blocks, and other content.

---

## Research Requirement

When creating or editing a route, you **must use a research tool** (web search, knowledge base, etc.) to gather information about each location and the surrounding area before writing content. This applies to:

- **Fun facts** — verify historical dates, architect names, anecdotes
- **En-route commentary** — discover notable buildings, statues, plaques, and stories along the walking path between stops
- **Hints** — confirm visible architectural features, street names, dates on inscriptions
- **Clue writing** — check what's actually visible at each location

Do not rely on training data alone. Research ensures accuracy and surfaces the interesting, surprising details that make a route feel alive.

---

## Route Design Principles

- **5-8 groups** (locations) is the sweet spot. Fewer feels too short; more causes fatigue.
- **Total duration**: 60-90 minutes of walking and solving.
- **Total distance**: 2-5km.
- Groups should follow a **logical walking path** — no backtracking or zigzagging across the city.
- **Walking time between locations**: 3-7 minutes. If two locations are next to each other, the route feels rushed. If they're 15 minutes apart, players lose momentum.
- Start from a well-known, easy-to-find location (major train station, central square, etc.).
- End near amenities (pubs, restaurants, transport) — players will want to celebrate.
- Choose locations that are **publicly accessible** and visible from the street. Don't send players inside buildings unless the building is freely open.

---

## Route Structure

A route is made up of **groups**, and each group contains **blocks**. Groups represent logical sections (typically one location each). Blocks are the individual content pieces within each group.

### Typical Location Group

Most groups follow this enriched pattern:

1. **Question block** — the riddle for this location
2. **Image block** — photo of the location (delivered after correct answer)
3. **Message block** — fun fact about the place
4. **Message block** — second tidbit from a different angle (optional)
5. **Map block** — Google Maps link (optional)
6. **Message block** — walking directions to the next location
7. **Message block** — en-route commentary about something they'll pass (optional, with long delay)
8. **Image block** — photo of the en-route point of interest (optional)

The first group should be a conversational introduction with no question. See "Conversational Introduction Pattern" below.

### Delays Between Blocks

Use `delay_ms` on blocks to create natural pacing. The maximum is 300,000ms (5 minutes). Use short delays for conversational rhythm and longer delays for en-route commentary while players are walking.

| Delay | Use |
|-------|-----|
| **0ms** | Questions, first block in a sequence |
| **1000-2000ms** | Follow-up within a cluster (intro messages, related facts) |
| **3000-5000ms** | Between topically distinct messages (fun fact → directions) |
| **15000-30000ms** | First en-route commentary (player has just started walking) |
| **60000-180000ms** | Later en-route commentary (player has been walking a few minutes) |

Use longer delays for groups where the walk is longer. If two stops are 5 minutes apart, space en-route messages across that window. If the walk is under 2 minutes, skip en-route commentary.

---

## Conversational Introduction Pattern

The introduction group sets the tone for the entire hunt. Break it into **5-6 short messages** with varied delays so it feels like a real guide chatting, not a robotic instruction dump.

### Pattern

1. **Greeting** (0ms) — personality-forward opener, 1 sentence
2. **Character colour** (1500ms) — one sentence establishing who the guide is
3. **How it works** (2000ms) — one sentence on the game mechanic
4. **What to expect** (2000ms) — stops and distance, use template variables
5. **Hint mechanic** (2000ms) — one sentence on asking for hints
6. **First directions** (3000ms) — where to head first

Each message is **1-2 sentences max**. The guide's personality should come through from the very first message.

### Good Example

```json
[
  { "type": "message", "config": { "type": "message", "content": "Right then. Welcome to {{CITY_NAME}}." }, "delay_ms": 0 },
  { "type": "message", "config": { "type": "message", "content": "I know these streets better than most. You just need to keep up." }, "delay_ms": 1500 },
  { "type": "message", "config": { "type": "message", "content": "I'll give you a clue at each stop. You figure it out, we move on." }, "delay_ms": 2000 },
  { "type": "message", "config": { "type": "message", "content": "{{TOTAL_STOPS}} stops, roughly {{DISTANCE_KM}}km. Should take about an hour if you don't dawdle." }, "delay_ms": 2000 },
  { "type": "message", "config": { "type": "message", "content": "If you get stuck, ask for a hint. I won't judge. Much." }, "delay_ms": 2000 },
  { "type": "message", "config": { "type": "message", "content": "Head to The Headrow in the city centre. Look for the building with the tall columns — hard to miss." }, "delay_ms": 3000 }
]
```

### Bad Example

```json
[
  { "type": "message", "config": { "type": "message", "content": "Welcome to {{CITY_NAME}}. I'll be your guide today — I know where we're going, you do the leg work." }, "delay_ms": 0 },
  { "type": "message", "config": { "type": "message", "content": "Here's how it works: I'll give you a clue at each stop, you figure it out, and we move on. There are {{TOTAL_STOPS}} stops covering {{DISTANCE_KM}}km. Ask for a hint if you're stuck." }, "delay_ms": 2000 },
  { "type": "message", "config": { "type": "message", "content": "Head to The Headrow in the city centre. You'll see a grand building with tall columns — you can't miss it." }, "delay_ms": 2000 }
]
```

The bad example crams mechanics into one message and lacks personality. The good example builds character across several short messages.

---

## Writing Clues

Each question block has a `clue` — a riddle that identifies a specific physical location. The player must be near the location to solve it.

### Rules

- Reference **visible architectural features**: columns, domes, inscriptions, sculptures, signage.
- The clue should be **solvable by someone standing within sight of the location**.
- Avoid depending on temporary installations, seasonal features, or things that may be removed (scaffolding, pop-up stalls, banners).
- Avoid clues that require specialist knowledge. A tourist should be able to solve them with observation and the hints provided.
- **Rhyming verse** works well but isn't required. The clue should feel like a puzzle, not a textbook entry.

### Good Example

```
I stand with columns tall and proud, where justice once was served aloud.
Victoria laid my cornerstone — now concerts fill my halls of stone.
```

This works because it references visible features (columns), historical context (Victoria, justice), and current use (concerts) — all verifiable on-site.

### Bad Example

```
This building was designed by architect Cuthbert Brodrick in the neo-classical style.
```

This is a fact, not a riddle. The player can't solve it by looking at the building.

---

## Accepted Answers

An array of strings the system will accept as correct. The answer-matching system handles:

- **Case insensitivity** — "town hall" matches "Town Hall"
- **1-2 character typos** — "Tow Hall" matches "Town Hall"
- **Common abbreviations** — "St" matches "Saint"
- **Leading/trailing articles** — "the Town Hall" matches "Town Hall"
- **Answers embedded in sentences** — "I think it's the Town Hall" matches "Town Hall"

Because of this fuzzy matching, you do **not** need to add misspellings. Focus on:

1. **Full official name**: "Leeds Town Hall"
2. **Short name**: "Town Hall"
3. **Common alternative names**: "the Town Hall"
4. **Historical names** (if well-known): "Leeds Parish Church" for Leeds Minster

Typically 2-4 accepted answers is enough.

---

## Hints

Each question block must have **2-3 hints**, served in order when players ask for help.

Each hint is an array of `SequenceItem` objects. For simple text hints, use a single item:

```json
[{ "content": "Think civic buildings — this one has Corinthian columns.", "image_url": null, "delay_ms": 0 }]
```

For richer hints, you can include multiple messages and images in a single hint:

```json
[
  { "content": "Look for this distinctive feature:", "image_url": null, "delay_ms": 0 },
  { "content": "", "image_url": "https://example.com/hint-image.jpg", "delay_ms": 1000 }
]
```

### Escalation Pattern

1. **Hint 1 — Gentle nudge**: Narrow the category or area. Don't give away the answer.
   - "Think civic buildings — this one has Corinthian columns."
2. **Hint 2 — More specific**: Give an era, street name, or distinguishing feature.
   - "It's on The Headrow, opened in 1858 by Queen Victoria."
3. **Hint 3 — Nearly gives it away** (optional): Only if 2 hints aren't enough for this particular question.
   - "The building directly opposite the main library entrance, with the clock tower."

After all hints are exhausted, the system **automatically reveals the answer** and moves the player to the next group. So hints should genuinely help — don't waste them on vague encouragement.

---

## Post-Answer Enrichment

When a player answers correctly, the system sends a success message from the message bank automatically. Everything positioned after the question block in the same group is then delivered as a sequence. This is your opportunity to reward the player with interesting content about the place they just identified.

### Pattern

1. *(Success message — automatic from message bank, do NOT add a "well done" block)*
2. **Image block** — photo of the location (delay: 1500ms). The player sees what they just identified.
3. **Message block** — primary fun fact, 1-2 sentences (delay: 2000ms). Pick the most interesting detail.
4. **Message block** — second tidbit from a different angle (delay: 2500ms). Optional — only include if there's something genuinely worth saying. Human stories, absurd stats, or connections to modern life work well.

### Rules

- **Image first** — the player just identified this place, show it to them while they read the facts
- **1-2 sentences per message** — never a wall of text
- **Don't duplicate the success acknowledgement** — the message bank handles "correct" / "got it" / etc.
- **Different angles** — if you include a second tidbit, approach from a different direction than the first fact (e.g. first fact is historical, second is a quirky modern detail)
- **Match the guide's dry tone** — see guide-personality.md

### Good Example

```json
{ "type": "image", "config": { "type": "image", "image_url": "{{IMAGE:leeds-town-hall-facade}}" }, "delay_ms": 1500 },
{ "type": "message", "config": { "type": "message", "content": "Brodrick designed this when he was 30. He died in poverty in Paris. Architecture's a tough business." }, "delay_ms": 2000 },
{ "type": "message", "config": { "type": "message", "content": "The organ inside has over 6,500 pipes. They still use it for concerts every month." }, "delay_ms": 2500 }
```

### Bad Example

```json
{ "type": "message", "config": { "type": "message", "content": "Leeds Town Hall was designed by Cuthbert Brodrick and opened in 1858. It is a Grade I listed building located on The Headrow in the city centre. The building features a Corinthian colonnade and a distinctive clock tower. It was originally used for civic functions and courts but now hosts concerts and events. The organ inside has over 6,500 pipes." }, "delay_ms": 1500 }
```

One massive block, no image, Wikipedia-style density. Players will skim past it.

---

## Directions (Message Blocks)

Use message blocks for walking directions between locations. Place them after the post-answer enrichment blocks, before any en-route commentary.

### For the first group
Give directions from a well-known starting point in a message block:
- "Head to The Headrow in the city centre. You'll see a grand building with tall columns — you can't miss it."

### For subsequent groups
Give walking directions from the previous location in the last section of the preceding group:
- "Walk south down Vicar Lane, past the markets. After about 5 minutes you'll see a distinctive domed roof on your right."

### Rules
- Include **estimated walking time** ("about 5 minutes").
- Reference **visible landmarks** for navigation ("past the markets", "on your left").
- Keep it concise: **1-3 sentences**.
- Use street names when helpful but don't rely on them alone — not everyone reads street signs.
- The directions should work for someone who has never visited the city before.

---

## En-Route Commentary

En-route commentary fills the walk between stops with interesting observations about things the player will pass. These blocks use longer delays to arrive while the player is actually walking, creating the feeling of a guide pointing things out along the way.

### Placement

En-route commentary blocks go **after the directions message**, still within the same group. Since all blocks after the question fire sequentially after a correct answer, the delays space them out across the walk.

### Pattern

```
... (post-answer enrichment blocks) ...
Message: directions to next stop (delay: 3000-5000ms)
Message: en-route observation #1 (delay: 15000-60000ms)
Image:   photo of en-route point of interest (delay: 15000-30000ms)  [optional]
Message: en-route observation #2 (delay: 60000-120000ms)  [optional]
```

### Rules

- **Max 3 en-route blocks per group** — don't overwhelm players while they're walking
- **1-2 sentences each** — casual, offhand observations
- **Only mention things actually on the walking route** — research the path between stops
- **Skip for short walks** — if the walk is under 2 minutes or there's nothing notable, don't force it
- **Tone is casual observation, not lecturing** — see guide-personality.md for voice guidance
- **Scale delays to walk length** — 3-minute walk gets one observation at ~30s; 7-minute walk can have 2-3 observations spread across 1-3 minutes

### Good Example

```json
{ "type": "message", "config": { "type": "message", "content": "Walk south down Vicar Lane, past the markets. About 5 minutes." }, "delay_ms": 4000 },
{ "type": "message", "config": { "type": "message", "content": "Kirkgate Market on your right is one of the largest covered markets in Europe. Worth a look on the way back." }, "delay_ms": 45000 },
{ "type": "message", "config": { "type": "message", "content": "You'll pass a narrow alley on your left just before the church. That's where the first Leeds newspaper was printed." }, "delay_ms": 90000 }
```

### Bad Example

```json
{ "type": "message", "config": { "type": "message", "content": "Walk south down Vicar Lane. On your right you will see Kirkgate Market, which is one of the largest covered markets in Europe. It was established in 1822 and has over 400 traders. Continue past the market and you will also see a narrow alley where the first Leeds newspaper was printed in 1718. After about 5 minutes you will see a distinctive domed roof on your right." }, "delay_ms": 2000 }
```

Everything crammed into one message with a short delay. The player reads it all before they've even started walking.

---

## Map Blocks

Use map blocks to help players find locations. Format the Google Maps link as:

```
https://maps.google.com/?q=Leeds+Town+Hall
```

Use the location name (URL-encoded with `+` for spaces). These render as styled map link cards in the app.

---

## Action Blocks

Use action blocks for group coordination points. The lead player sees a button; other players see a waiting message. Good for:

- "Everyone arrived?" — placed before a question, ensuring the group is together
- "Ready to move on?" — placed between locations

Keep labels short and actionable.

---

## Images

Images can be included via `image` blocks with a URL. They are a key tool for making the route feel rich and visual.

### When to Use Images

- **Post-answer** — photo of the location the player just identified (most important use)
- **En-route** — notable things players will pass while walking
- **Hints** — visual clues within hint sequences
- **Introduction** — optional hero image of the city (first block of intro group)

### When NOT to Use Images

- **Before a question** — showing a photo of the location spoils the riddle
- **More than 2 images per group** — visual fatigue; pick the best ones

### Image URLs

When creating routes programmatically, use descriptive placeholder URLs in the format `{{IMAGE:description}}` (e.g. `{{IMAGE:leeds-town-hall-facade}}`, `{{IMAGE:kirkgate-market-interior}}`). An admin will replace these with real URLs through the admin panel before the route goes live.

---

## Template Variables in Message Blocks

Message block content supports template variables that are replaced at runtime:

| Variable | Replaced With |
|----------|---------------|
| `{{CITY_NAME}}` | The route's city |
| `{{TOTAL_STOPS}}` | Number of groups in the route |
| `{{DISTANCE_KM}}` | Estimated distance in km |
| `{{REVIEW_LINK}}` | Configured Google review URL |

Useful for introduction and closing messages:
- "Welcome to {{CITY_NAME}}. I'll be your guide today."
- "That's all {{TOTAL_STOPS}} stops done. You've covered roughly {{DISTANCE_KM}}km."

---

## Translation

When translating an existing route into a new language, follow the translation workflow in `translation-guide.md`. This section covers tone and style guidance specific to translated content.

### Personality Across Languages

The guide's core personality — dry, brief, knowledgeable — must survive translation. But "dry British humour" doesn't translate literally. Adapt the personality to feel natural in the target language:

**English (en):** Understated, sardonic. "That's the one." / "Not quite."
**Spanish (es):** Laconic, matter-of-fact. Avoid the overly polite register common in tourism. "Esa es." / "No del todo."
**French (fr):** Wry, slightly detached. The guide knows more than they say. "C'est ça." / "Pas tout à fait."
**German (de):** Direct, no-nonsense. Comfortable with brevity. "Stimmt." / "Nicht ganz."
**Dutch (nl):** Straightforward, casually confident. "Klopt." / "Niet helemaal."

### Translation Rules

- **Never translate literally** — adapt idioms and phrasing to sound natural in the target language
- **Keep messages the same length** — if the English version is 1-2 sentences, the translation should be too
- **Preserve template variables** — `{{CITY_NAME}}`, `{{TOTAL_STOPS}}`, etc. must remain as-is (they are replaced at runtime)
- **Match the delay timing** — do not adjust `delay_ms` values; the pacing is designed for the walking route, not the language
- **Translate accepted answers to the local name** — "Leeds Town Hall" stays "Leeds Town Hall" in Spanish because it's a proper noun, but the clue and hints must be in Spanish. Use the locally known name where one exists.
- **Rhyming clues don't need to rhyme** — if the English clue rhymes, the translation should be an engaging riddle in the target language, but forcing a rhyme at the expense of clarity is worse than a clear non-rhyming clue
- **En-route commentary stays local** — the buildings and landmarks don't change, but descriptions should use natural phrasing for the target language

### What NOT to Translate

- Image URLs (images are language-agnostic unless they contain English text overlays)
- Google Maps URLs (Google Maps displays in the user's device language automatically)
- Template variable names
- Block types, positions, or structure
- Delay timings

---

## Anti-Patterns

Avoid these common mistakes when authoring routes:

- **Wall of text** — any message over 3 sentences. Split into multiple blocks with delays.
- **Robotic Q&A loop** — question, single fun fact, directions, repeat. Break the loop with images, multi-message enrichment, and en-route commentary.
- **Personality-free intro** — a mechanical "here's how it works" dump with no character.
- **Dead air between stops** — no content between directions and the next question. Players are walking for 5 minutes with nothing from the guide.
- **Spoiler images** — showing a photo of a location before the riddle is answered.
- **Delay-free dumps** — 4+ blocks all with `delay_ms: 0`. The player gets a wall of content all at once.
- **Over-commenting** — more than 3 en-route blocks per group, or commentary on a very short walk where there's nothing notable.
- **Duplicating the success message** — adding a "Well done" or "Correct" block after a question. The message bank handles this automatically.

---

## Complete Worked Example

Here's a well-structured 2-location route demonstrating all the patterns above:

```json
{
  "route": {
    "city": "Leeds",
    "name": "Leeds City Centre Discovery",
    "description": "A short walking tour through the historic heart of Leeds, covering its grandest civic buildings.",
    "estimated_duration_mins": 30,
    "estimated_distance_km": 1.5,
    "is_active": true
  },
  "groups": [
    {
      "name": "Introduction",
      "blocks": [
        {
          "type": "message",
          "config": { "type": "message", "content": "Right then. Welcome to {{CITY_NAME}}." },
          "delay_ms": 0
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "I know these streets better than most. You just need to keep up." },
          "delay_ms": 1500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "I'll give you a clue at each stop. You figure it out, we move on." },
          "delay_ms": 2000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "{{TOTAL_STOPS}} stops, roughly {{DISTANCE_KM}}km. Should take about an hour if you don't dawdle." },
          "delay_ms": 2000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "If you get stuck, ask for a hint. I won't judge. Much." },
          "delay_ms": 2000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Head to The Headrow in the city centre. Look for the building with the tall columns — hard to miss." },
          "delay_ms": 3000
        }
      ]
    },
    {
      "name": "Leeds Town Hall",
      "blocks": [
        {
          "type": "question",
          "config": {
            "type": "question",
            "clue": "I stand with columns tall and proud, where justice once was served aloud. Victoria laid my cornerstone — now concerts fill my halls of stone.",
            "accepted_answers": ["Leeds Town Hall", "Town Hall", "the Town Hall"],
            "hints": [
              [{ "content": "Think civic buildings — this one has Corinthian columns.", "image_url": null, "delay_ms": 0 }],
              [{ "content": "It's on The Headrow, opened in 1858 by Queen Victoria.", "image_url": null, "delay_ms": 0 }]
            ]
          },
          "delay_ms": 0
        },
        {
          "type": "image",
          "config": { "type": "image", "image_url": "{{IMAGE:leeds-town-hall-facade}}" },
          "delay_ms": 1500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Brodrick designed this when he was 30. He died in poverty in Paris. Architecture's a tough business." },
          "delay_ms": 2000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "The organ inside has over 6,500 pipes. They still use it for concerts every month." },
          "delay_ms": 2500
        },
        {
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Town+Hall" },
          "delay_ms": 500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Walk south down Vicar Lane, past the markets. About 5 minutes." },
          "delay_ms": 4000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Kirkgate Market on your right is one of the largest covered markets in Europe. Worth a look on the way back." },
          "delay_ms": 45000
        },
        {
          "type": "image",
          "config": { "type": "image", "image_url": "{{IMAGE:kirkgate-market-exterior}}" },
          "delay_ms": 15000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "You'll pass a narrow alley on your left just before the church. That's where the first Leeds newspaper was printed." },
          "delay_ms": 90000
        }
      ]
    },
    {
      "name": "Corn Exchange",
      "blocks": [
        {
          "type": "question",
          "config": {
            "type": "question",
            "clue": "My roof is round, my trades have changed — from grain to vintage, rearranged. Step inside my oval hall, where independent traders fill each stall.",
            "accepted_answers": ["Corn Exchange", "Leeds Corn Exchange", "the Corn Exchange"],
            "hints": [
              [{ "content": "This building was originally for trading grain.", "image_url": null, "delay_ms": 0 }],
              [{ "content": "It has a distinctive oval shape and domed glass roof, built in 1863.", "image_url": null, "delay_ms": 0 }]
            ]
          },
          "delay_ms": 0
        },
        {
          "type": "image",
          "config": { "type": "image", "image_url": "{{IMAGE:corn-exchange-dome}}" },
          "delay_ms": 1500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Another Brodrick design. The elliptical shape was revolutionary for 1863 — engineers weren't sure the roof would hold." },
          "delay_ms": 2000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "It nearly got demolished in the 1980s. Locals fought to save it. Now it's Grade I listed and full of independent shops." },
          "delay_ms": 2500
        },
        {
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Corn+Exchange" },
          "delay_ms": 500
        }
      ]
    }
  ]
}
```

Notice how:
- The **introduction** builds personality across 6 short messages — each 1-2 sentences with varied delays
- **Post-answer enrichment** starts with an image, then layers in fun facts from different angles
- **En-route commentary** fills the walk with observations, spaced out with long delays (45s, 15s, 90s) so they arrive while the player is actually walking
- **Images appear after answers**, not before — no spoilers
- **Delays are varied and intentional** — short for conversational rhythm, long for walking gaps
- **Individual messages stay short** — 1-2 sentences each, never a wall of text
- The **guide's personality** comes through in word choice and pacing, not in lengthy explanations
- The **success acknowledgement is NOT duplicated** — it comes from the message bank automatically
- **Image placeholders** use `{{IMAGE:description}}` format for admin to replace later
