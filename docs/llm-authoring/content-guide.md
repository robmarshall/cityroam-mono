# City Roam Content Authoring Guide

This document explains how to write high-quality treasure hunt routes for City Roam. Follow these guidelines when creating routes, groups, blocks, and other content.

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

Most groups follow this pattern:

1. **Question block** — the riddle for this location
2. **Message block** — fun fact (delivered after the player answers correctly)
3. **Map block** — Google Maps link (optional, helps players find the spot)
4. **Message block** — walking directions to the next location

You can also include image blocks, action blocks (for group coordination), or additional message blocks as needed. The first group might be a pure introduction with no question.

### Delays Between Blocks

Use `delay_ms` on blocks to create natural pacing. When the game engine sends multiple blocks in sequence (e.g. after a correct answer), delays simulate typing pauses:

- **0ms** — instant (good for questions, the first block in a sequence)
- **1000-2000ms** — short pause (good for follow-up messages)
- **2000-3000ms** — longer pause (good for directions after a fun fact)

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

## Directions (Message Blocks)

Use message blocks for walking directions between locations. Place them at the end of a group, after the fun fact, so they're delivered after the player solves the current riddle.

### For the first group
Give directions from a well-known starting point in a message block:
- "Head to The Headrow in the city centre. You'll see a grand building with tall columns — you can't miss it."

### For subsequent groups
Give walking directions from the previous location in the last message block of the preceding group:
- "Walk south down Vicar Lane, past the markets. After about 5 minutes you'll see a distinctive domed roof on your right."

### Rules
- Include **estimated walking time** ("about 5 minutes").
- Reference **visible landmarks** for navigation ("past the markets", "on your left").
- Keep it concise: **1-3 sentences**.
- Use street names when helpful but don't rely on them alone — not everyone reads street signs.
- The directions should work for someone who has never visited the city before.

---

## Fun Facts (Message Blocks)

Use message blocks for fun facts, placed immediately after the question block in the same group. They're delivered after a correct answer and reward the player with interesting knowledge.

### Rules
- **1-3 sentences**.
- Match the guide's tone: dry, knowledgeable, understated. No exclamation marks.
- Focus on **history, architecture, or surprising facts**.
- Avoid Wikipedia-style density. Pick one or two interesting details.

### Good Example

"Leeds Town Hall was designed by Cuthbert Brodrick and opened in 1858. The organ inside has over 6,500 pipes."

### Bad Example

"Leeds Town Hall is a Grade I listed building in Leeds, West Yorkshire, England! It was built between 1853 and 1858 and is located on The Headrow! The architect was Cuthbert Brodrick who won a competition to design it! The building features a Corinthian colonnade and a dome!"

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

Images can be included via `image` blocks with a URL. When creating routes programmatically, you can either:
- Use publicly accessible image URLs directly
- Leave image blocks out and add them later through the admin panel

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

## Complete Worked Example

Here's a well-structured 3-location route with an introduction group:

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
          "config": { "type": "message", "content": "Welcome to {{CITY_NAME}}. I'll be your guide today — I know where we're going, you do the leg work." },
          "delay_ms": 0
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Here's how it works: I'll give you a clue at each stop, you figure it out, and we move on. Ask for a hint if you're stuck." },
          "delay_ms": 2000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Head to The Headrow in the city centre. You'll see a grand building with tall columns — you can't miss it." },
          "delay_ms": 2000
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
          "type": "message",
          "config": { "type": "message", "content": "Leeds Town Hall was designed by Cuthbert Brodrick and opened in 1858. The organ inside has over 6,500 pipes." },
          "delay_ms": 1500
        },
        {
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Town+Hall" },
          "delay_ms": 500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Walk south down Vicar Lane, past the markets. After about 5 minutes you'll see a distinctive domed roof on your right." },
          "delay_ms": 2000
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
          "type": "message",
          "config": { "type": "message", "content": "The Corn Exchange is another Cuthbert Brodrick design. Its elliptical shape was revolutionary for 1863 and it's now Grade I listed." },
          "delay_ms": 1500
        },
        {
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Corn+Exchange" },
          "delay_ms": 500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Head east along Kirkgate for about 3 minutes. Look for the church on your left." },
          "delay_ms": 2000
        }
      ]
    },
    {
      "name": "Leeds Minster",
      "blocks": [
        {
          "type": "question",
          "config": {
            "type": "question",
            "clue": "The oldest site of worship here, I've watched this city grow each year. My name was raised from parish church — now 'Minster' puts me a notch above the rest.",
            "accepted_answers": ["Leeds Minster", "the Minster", "Leeds Parish Church"],
            "hints": [
              [{ "content": "It's the oldest religious site in Leeds, on Kirkgate.", "image_url": null, "delay_ms": 0 }],
              [{ "content": "It became a Minster in 2012 — before that it was Leeds Parish Church.", "image_url": null, "delay_ms": 0 }]
            ]
          },
          "delay_ms": 0
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Leeds Minster stands on a site of Christian worship dating back to the 7th century. The current building is mostly Victorian but the site is over 1,300 years old." },
          "delay_ms": 1500
        },
        {
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Minster" },
          "delay_ms": 500
        }
      ]
    }
  ]
}
```

Notice how:
- The introduction group sets the scene with no question
- Directions flow logically — each group's last message block gives directions to the next location
- Clues reference things you can see at the location
- Accepted answers cover the common ways someone might say the name
- Hints escalate from vague to specific
- Fun facts are concise and interesting
- `delay_ms` creates natural pacing between messages
- Map blocks help players navigate
