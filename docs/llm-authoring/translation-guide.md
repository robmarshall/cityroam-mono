# City Roam Translation Guide

This document explains how to translate an existing route into a new language. Translation produces a new route linked to the same **route family** as the original, sharing the same physical locations and structure but with all player-facing content in the target language.

---

## Supported Languages

| Code | Language |
|------|----------|
| `en` | English |
| `es` | Spanish |
| `fr` | French |
| `de` | German |
| `nl` | Dutch |

---

## Workflow

### Step 1 — Read the Source Route

Fetch the complete route with all groups and blocks:

```
GET /admin/routes/:id
Authorization: Bearer <token>
```

The response includes the route's `language`, `route_family_id`, and all groups with their blocks. This is your source material.

### Step 2 — Check for Existing Variants

Before creating a translation, check whether the target language already exists in the family:

```
GET /admin/route-families/:familyId
Authorization: Bearer <token>
```

This returns all routes in the family. If a route with your target language already exists, do not create a duplicate — edit the existing one instead.

### Step 3 — Create the Translated Route

Use the bulk-groups endpoint to create the translated route in a single atomic call:

```
POST /admin/routes/bulk-groups
Content-Type: application/json
Authorization: Bearer <token>
```

The request body follows the same format as any bulk route creation, with two additions to the route object:

| Field | Value |
|-------|-------|
| `language` | Target language code (e.g. `"es"`) |
| `route_family_id` | UUID of the existing route family (from the source route) |

Everything else — `city`, `estimated_duration_mins`, `estimated_distance_km`, `is_active` — stays the same. Translate the `name` and `description` fields.

---

## Block Translation Rules

### `message` blocks

Translate the `content` field. Keep all template variables exactly as they are: `{{CITY_NAME}}`, `{{TOTAL_STOPS}}`, `{{DISTANCE_KM}}`, `{{REVIEW_LINK}}`.

Source:
```json
{ "type": "message", "content": "{{TOTAL_STOPS}} stops, roughly {{DISTANCE_KM}}km. Should take about an hour if you don't dawdle." }
```

Translated (Spanish):
```json
{ "type": "message", "content": "{{TOTAL_STOPS}} paradas, unos {{DISTANCE_KM}}km. Deberia llevar una hora si no os entreteneis." }
```

### `image` blocks

Reuse the same `image_url`. Images are language-agnostic unless they contain English text overlays. If an image contains burned-in text, note it for the admin to replace — use a placeholder comment in the image URL description.

### `map` blocks

Reuse the same `google_maps_link`. Google Maps displays in the user's device language automatically.

### `question` blocks

Translate all three content fields:

| Field | Action |
|-------|--------|
| `clue` | Translate the riddle text |
| `accepted_answers` | Translate to correct names in the target language (see section below) |
| `hints` | Translate all hint `content` strings in every sequence |

Keep the same number of hints (2-3) and the same number of sequence items per hint. Keep all `image_url` and `delay_ms` values unchanged.

### `action` blocks

Translate the `label` text.

### `delay_ms`

Keep the same timing values on all blocks. The pacing is tied to physical walking distances, which do not change between languages.

---

## Translating Accepted Answers

This is the most important part to get right. Accepted answers must be the **correct name of the place in the target language**, not a transliteration or phonetic approximation.

Rules:

1. **Use the local/official name if it does not change across languages.** Many landmarks keep the same name: "Big Ben" is "Big Ben" in Spanish. "Leeds Town Hall" stays "Leeds Town Hall" in most languages because it is a proper noun without a standard translation.
2. **Use the translated name when one exists.** "Buckingham Palace" becomes "Palacio de Buckingham" in Spanish. "Tower of London" becomes "Tour de Londres" in French.
3. **Include both the translated name and the original name as accepted answers.** Players may know the place by either name.
4. **Research the standard name** in the target language. Do not guess — verify what native speakers actually call the place.

Example (English to Spanish):

Source:
```json
"accepted_answers": ["Corn Exchange", "Leeds Corn Exchange", "the Corn Exchange"]
```

Translated:
```json
"accepted_answers": ["Corn Exchange", "Leeds Corn Exchange", "Lonja de Cereales", "la Lonja de Cereales"]
```

The original English names are kept because a Spanish-speaking player in Leeds may still use them. The Spanish translations are added for players who think of the answer in their own language.

---

## Adapting the Guide Personality

The core character stays the same across languages: sardonic, understated, brief, knowledgeable. No exclamation marks. No emoji. Maximum 2 sentences per message block.

However, the expression of that character must feel natural in the target language. A dry, sardonic tone in British English does not translate word-for-word into natural-sounding Spanish or French. Adapt the idiom and phrasing to the target language's cultural norms while preserving the underlying character.

| Language | Adaptation Notes |
|----------|-----------------|
| `es` | Spanish allows more warmth without losing dryness. Use "tuteo" (informal "tu") or "vosotros" for groups. Dry humour lands differently — lean into understatement rather than sarcasm. |
| `fr` | French dryness maps well to British dryness. Use "vous" for politeness. Brevity is natural in French. |
| `de` | German directness complements the guide's bluntness. Use "ihr" for groups. Keep sentences short. |
| `nl` | Dutch directness is a natural fit. Use informal "je/jullie". The understated tone works well as-is. |

Do not produce a stilted literal translation. The guide should sound like a local who happens to speak the target language, not a British person being dubbed.

---

## Message Banks

Message banks are filtered by language at query time. When translating a route into a new language, you must also create corresponding message bank entries for that language.

### Check Existing Entries

```
GET /admin/message-banks?language=es
Authorization: Bearer <token>
```

If entries already exist for the target language (from a previous translation), you do not need to create new ones.

### Create Entries

If no entries exist for the target language, create them for all types:

```
POST /admin/message-banks
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "success",
  "content": "Esa es.",
  "language": "es",
  "is_active": true
}
```

Follow the same recommended counts as for English (see guide-personality.md):

| Type | Minimum | Recommended |
|------|---------|-------------|
| success | 3 | 5-7 |
| failure | 3 | 5-7 |
| hint-exhausted | 2 | 3 |
| hint-offer | 2 | 3 |
| hint-decline | 2 | 3 |
| clarification | 2 | 3 |
| unknown-answer | 2 | 3 |
| over-length | 2 | 3 |
| completion | 2 | 3 |

Message bank entries must maintain the guide's personality in the target language. The same rules apply: brief, dry, no exclamation marks, no emoji. Template variables (`{{ANSWER}}`, `{{TOTAL_STOPS}}`, etc.) stay as-is.

---

## What NOT to Change

- **Google Maps URLs** — they display in the user's device language automatically
- **Image URLs** — unless the image contains burned-in English text
- **Template variable names** — `{{CITY_NAME}}`, `{{TOTAL_STOPS}}`, etc. are replaced at runtime
- **Block ordering and group structure** — the translated route must have the same number of groups, the same number of blocks per group, in the same order
- **Delay timings** — pacing is tied to physical distances, not language
- **City name in the route metadata** — keep the same `city` value (it is a proper noun)

---

## Worked Example

Translating the first two groups of a Leeds route from English to Spanish.

### Source (English)

```json
{
  "route": {
    "city": "Leeds",
    "name": "Leeds City Centre Discovery",
    "description": "A walking tour through the historic heart of Leeds.",
    "language": "en",
    "route_family_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "estimated_duration_mins": 60,
    "estimated_distance_km": 2.5,
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
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Town+Hall" },
          "delay_ms": 500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Walk south down Vicar Lane, past the markets. About 5 minutes." },
          "delay_ms": 4000
        }
      ]
    }
  ]
}
```

### Translated (Spanish)

```json
{
  "route": {
    "city": "Leeds",
    "name": "Descubriendo el Centro de Leeds",
    "description": "Un paseo por el corazon historico de Leeds.",
    "language": "es",
    "route_family_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "estimated_duration_mins": 60,
    "estimated_distance_km": 2.5,
    "is_active": true
  },
  "groups": [
    {
      "name": "Introduccion",
      "blocks": [
        {
          "type": "message",
          "config": { "type": "message", "content": "Bueno. Bienvenidos a {{CITY_NAME}}." },
          "delay_ms": 0
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Conozco estas calles mejor que la mayoria. Vosotros solo teneis que seguir el ritmo." },
          "delay_ms": 1500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Os dare una pista en cada parada. La resolvais y seguimos." },
          "delay_ms": 2000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "{{TOTAL_STOPS}} paradas, unos {{DISTANCE_KM}}km. Deberia llevar una hora si no os entreteneis." },
          "delay_ms": 2000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Si os quedais atascados, pedid una pista. No juzgo. Mucho." },
          "delay_ms": 2000
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Id hacia The Headrow en el centro. Buscad el edificio con las columnas altas — dificil de pasar por alto." },
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
            "clue": "Me alzo con columnas altas y orgullosas, donde la justicia se dicto en voz alta. Victoria puso mi primera piedra — ahora los conciertos llenan mis salas de piedra.",
            "accepted_answers": ["Leeds Town Hall", "Town Hall", "Ayuntamiento de Leeds", "el Ayuntamiento"],
            "hints": [
              [{ "content": "Pensad en edificios civicos — este tiene columnas corintias.", "image_url": null, "delay_ms": 0 }],
              [{ "content": "Esta en The Headrow, inaugurado en 1858 por la Reina Victoria.", "image_url": null, "delay_ms": 0 }]
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
          "config": { "type": "message", "content": "Brodrick lo diseno con 30 anos. Murio en la pobreza en Paris. La arquitectura es un negocio duro." },
          "delay_ms": 2000
        },
        {
          "type": "map",
          "config": { "type": "map", "google_maps_link": "https://maps.google.com/?q=Leeds+Town+Hall" },
          "delay_ms": 500
        },
        {
          "type": "message",
          "config": { "type": "message", "content": "Caminad hacia el sur por Vicar Lane, pasando los mercados. Unos 5 minutos." },
          "delay_ms": 4000
        }
      ]
    }
  ]
}
```

### What Changed

- `language` set to `"es"`, same `route_family_id`
- Route `name` and `description` translated
- Group name "Introduction" translated to "Introduccion"
- Group name "Leeds Town Hall" kept as-is (proper noun, no standard Spanish translation)
- All message `content` translated, template variables preserved
- Question `clue` translated into a Spanish riddle
- `accepted_answers` includes both English originals and Spanish equivalents ("Ayuntamiento de Leeds")
- Hint `content` strings translated
- `image_url`, `google_maps_link`, all `delay_ms` values unchanged
- Same number of groups, same number of blocks per group, same block order
- Guide personality adapted: dry and understated, uses "vosotros" for informal group address

---

## Checklist

Before submitting a translated route:

1. Source route read via `GET /admin/routes/:id`
2. Route family checked via `GET /admin/route-families/:familyId` — no duplicate language variant exists
3. `language` field set to target language code
4. `route_family_id` matches the source route's family
5. Same number of groups as the source
6. Same number of blocks per group as the source
7. Same block types and ordering as the source
8. All `delay_ms` values unchanged
9. All `image_url` values unchanged
10. All `google_maps_link` values unchanged
11. All template variables (`{{CITY_NAME}}`, etc.) preserved exactly
12. `accepted_answers` include both target-language names and original names where appropriate
13. Guide personality adapted to target language — not a literal translation
14. Message bank entries created for the target language (all 9 types)
