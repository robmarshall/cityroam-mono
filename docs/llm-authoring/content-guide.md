# City Roam Content Authoring Guide

This document explains how to write high-quality treasure hunt routes for City Roam. Follow these guidelines when creating routes, stops, clues, hints, and other content.

---

## Route Design Principles

- **5-8 stops** is the sweet spot. Fewer feels too short; more causes fatigue.
- **Total duration**: 60-90 minutes of walking and solving.
- **Total distance**: 2-5km.
- Stops should follow a **logical walking path** — no backtracking or zigzagging across the city.
- **Walking time between stops**: 3-7 minutes. If two stops are next to each other, the route feels rushed. If they're 15 minutes apart, players lose momentum.
- Start from a well-known, easy-to-find location (major train station, central square, etc.).
- End near amenities (pubs, restaurants, transport) — players will want to celebrate.
- Choose stops that are **publicly accessible** and visible from the street. Don't send players inside buildings unless the building is freely open.

---

## Writing Clues

Each clue is a riddle that identifies a specific physical location. The player must be near the location to solve it.

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

Each stop must have **2-3 hints**, served in order when players ask for help.

### Escalation Pattern

1. **Hint 1 — Gentle nudge**: Narrow the category or area. Don't give away the answer.
   - "Think civic buildings — this one has Corinthian columns."
2. **Hint 2 — More specific**: Give an era, street name, or distinguishing feature.
   - "It's on The Headrow, opened in 1858 by Queen Victoria."
3. **Hint 3 — Nearly gives it away** (optional): Only if 2 hints aren't enough for this particular stop.
   - "The building directly opposite the main library entrance, with the clock tower."

After all hints are exhausted, the system **automatically reveals the answer** and moves the player to the next stop. So hints should genuinely help — don't waste them on vague encouragement.

---

## Directions

The `directions_from_previous` field tells players how to walk from the previous stop to this one.

### For the first stop
Give directions from a well-known starting point:
- "Head to The Headrow in the city centre. You'll see a grand building with tall columns — you can't miss it."

### For subsequent stops
Give walking directions from the previous stop:
- "Walk south down Vicar Lane, past the markets. After about 5 minutes you'll see a distinctive domed roof on your right."

### Rules
- Include **estimated walking time** ("about 5 minutes").
- Reference **visible landmarks** for navigation ("past the markets", "on your left").
- Keep it concise: **1-3 sentences**.
- Use street names when helpful but don't rely on them alone — not everyone reads street signs.
- The directions should work for someone who has never visited the city before.

---

## Fun Facts

Displayed immediately after a correct answer. They reward the player with interesting knowledge about the location.

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

## Google Maps Links

Optional but recommended. Format:

```
https://maps.google.com/?q=Leeds+Town+Hall
```

Use the location name (URL-encoded with `+` for spaces). This helps players who are struggling to find the location.

---

## Correct Response

The `correct_response` field is optional free text shown after a correct answer (in addition to the fun fact). Most stops leave this empty — the random success message bank ("That's the one.", "Got it.") handles it. Only use this if you want a stop-specific acknowledgement.

---

## Images

Images are stored as S3 keys and must be uploaded separately via the `/admin/upload` endpoint. When creating routes programmatically, **leave images as an empty array** `[]`. Images can be added later through the admin panel.

---

## Complete Worked Example

Here's a well-structured 3-stop route:

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
  "stops": [
    {
      "name": "Leeds Town Hall",
      "directions_from_previous": "Head to The Headrow in the city centre. You'll see a grand building with tall columns — you can't miss it.",
      "clue": "I stand with columns tall and proud, where justice once was served aloud. Victoria laid my cornerstone — now concerts fill my halls of stone.",
      "accepted_answers": ["Leeds Town Hall", "Town Hall", "the Town Hall"],
      "hints": [
        "Think civic buildings — this one has Corinthian columns.",
        "It's on The Headrow, opened in 1858 by Queen Victoria."
      ],
      "correct_response": "",
      "fun_fact": "Leeds Town Hall was designed by Cuthbert Brodrick and opened in 1858. The organ inside has over 6,500 pipes.",
      "images": [],
      "google_maps_link": "https://maps.google.com/?q=Leeds+Town+Hall"
    },
    {
      "name": "Corn Exchange",
      "directions_from_previous": "Walk south down Vicar Lane, past the markets. After about 5 minutes you'll see a distinctive domed roof on your right.",
      "clue": "My roof is round, my trades have changed — from grain to vintage, rearranged. Step inside my oval hall, where independent traders fill each stall.",
      "accepted_answers": ["Corn Exchange", "Leeds Corn Exchange", "the Corn Exchange"],
      "hints": [
        "This building was originally for trading grain.",
        "It has a distinctive oval shape and domed glass roof, built in 1863."
      ],
      "correct_response": "",
      "fun_fact": "The Corn Exchange is another Cuthbert Brodrick design. Its elliptical shape was revolutionary for 1863 and it's now Grade I listed.",
      "images": [],
      "google_maps_link": "https://maps.google.com/?q=Leeds+Corn+Exchange"
    },
    {
      "name": "Leeds Minster",
      "directions_from_previous": "Head east along Kirkgate for about 3 minutes. Look for the church on your left.",
      "clue": "The oldest site of worship here, I've watched this city grow each year. My name was raised from parish church — now 'Minster' puts me a notch above the rest.",
      "accepted_answers": ["Leeds Minster", "the Minster", "Leeds Parish Church"],
      "hints": [
        "It's the oldest religious site in Leeds, on Kirkgate.",
        "It became a Minster in 2012 — before that it was Leeds Parish Church."
      ],
      "correct_response": "",
      "fun_fact": "Leeds Minster stands on a site of Christian worship dating back to the 7th century. The current building is mostly Victorian but the site is over 1,300 years old.",
      "images": [],
      "google_maps_link": "https://maps.google.com/?q=Leeds+Minster"
    }
  ]
}
```

Notice how:
- Directions flow logically from stop to stop
- Clues reference things you can see at the location
- Accepted answers cover the common ways someone might say the name
- Hints escalate from vague to specific
- Fun facts are concise and interesting
