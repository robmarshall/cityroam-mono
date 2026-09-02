# City Roam Data Model

This document explains how routes, groups, blocks, events, and the AI pipeline fit together. Understanding this helps you create content that works well with the game engine.

---

## Entity Relationships

```
Route Family
  └── has many Routes (one per language variant)
        ├── has many Groups (ordered by position, 0-indexed)
        │     └── has many Blocks (ordered by position, 0-indexed)
        └── has many Events (runtime game instances)
              ├── has many Participants
              └── has many Messages (chat log)

Message Banks (global, per-language)
  └── Templates used by the AI guide, filtered by language
```

### What You Author

As a content creator, you author **routes** made up of **groups** containing **blocks**. You can also create **message bank** entries to expand the guide's repertoire.

Events are usually generated automatically when a customer purchases a hunt via Stripe checkout. However, you can create free/test events via `POST /admin/events` (see the API reference).

---

## Route Families

Route families group language variants of the same logical route. A "Leeds City Centre" family might contain an English route, a Spanish route, and a French route — all covering the same locations but with content in different languages.

| Field | Purpose |
|-------|---------|
| name | Canonical name of the route (e.g. "Leeds City Centre") |
| city | The city where all variants take place |

Routes inherit their city from the family. When creating a route, either link it to an existing family via `route_family_id` or provide `city` to auto-create a new family.

---

## Routes

A route is a language-specific variant of a treasure hunt within a route family. Each route belongs to a family and defines the journey in a particular language.

| Field | Purpose |
|-------|---------|
| route_family_id | Links this route to its parent family. Set at creation time. |
| language | The language of this route variant (e.g. 'en', 'es', 'fr', 'de', 'nl'). Set at creation time, immutable. |
| name | Display name of the route |
| description | Brief description for admin reference |
| estimated_duration_mins | Expected total time in minutes |
| estimated_distance_km | Expected total walking distance |
| total_stops | Automatically maintained — count of groups |
| is_active | Whether the route is available for purchase |

---

## Groups

Groups are the logical sections of a route. Each group typically represents one location/stop. They are ordered by `position` (0-indexed).

A group contains:

| Field | Purpose |
|-------|---------|
| name | Section name (e.g. "Leeds Town Hall", "Introduction") |
| position | Order within the route (0, 1, 2...) — auto-managed |

Groups contain one or more **blocks** that define the content delivered to players.

---

## Blocks

Blocks are the individual content units within a group. They are ordered by `position` (0-indexed) and executed sequentially by the game engine.

### Common Fields

| Field | Purpose |
|-------|---------|
| position | Order within the group (0, 1, 2...) |
| type | One of: `message`, `image`, `question`, `action`, `map` |
| config | Type-specific configuration (see below) |
| delay_ms | Milliseconds to wait before sending (0-300000, i.e. up to 5 minutes). Creates natural pacing — short pauses for typing feel, longer delays for en-route commentary while players walk. |

### Block Types

#### `message` — Text message from the guide

| Config Field | Type | Purpose |
|-------------|------|---------|
| content | string | The message text. Supports template variables. |

Use for: directions, fun facts, narrative text, any guide dialogue.

#### `image` — Image shown to the player

| Config Field | Type | Purpose |
|-------------|------|---------|
| image_url | string (URL) | URL of the image to display |

Use for: location photos, visual clues, maps as images.

#### `question` — A riddle/puzzle the player must solve

| Config Field | Type | Purpose |
|-------------|------|---------|
| clue | string | The riddle text shown to the player |
| accepted_answers | string[] | Valid answer strings (min 1) |
| hints | SequenceItem[][] | 2-3 hint sequences, served in order when player asks for help |

This is the core gameplay block. When the game engine reaches a question block, it **pauses and waits** for the player to answer correctly (or exhaust all hints). The AI pipeline handles answer matching, hint delivery, and advancement.

**Hint format:** Each hint is an array of `SequenceItem` objects, allowing multi-message hints with optional images and delays:

```json
{
  "content": "Think civic buildings — this one has Corinthian columns.",
  "image_url": null,
  "delay_ms": 0
}
```

For simple text-only hints, use a single SequenceItem per hint with `image_url: null` and `delay_ms: 0`.

#### `action` — Wait for the lead player to confirm an action

| Config Field | Type | Purpose |
|-------------|------|---------|
| label | string | Button label shown to the lead player |

Use for: "Everyone ready to move on?", "Confirm you've arrived", group coordination points.

When the engine reaches an action block, it **pauses** and shows a button to the lead player. Other players see "Waiting for [lead name]...". The game advances when the lead taps the button.

#### `map` — Google Maps link card

| Config Field | Type | Purpose |
|-------------|------|---------|
| google_maps_link | string (URL) | Link to Google Maps |

Use for: helping players navigate to a location. Rendered as a styled map link card in the app.

---

## Typical Group Structure

### Minimal Group Structure (acceptable)

```
Group: "Leeds Town Hall"
  ├── Block 1: question — riddle + accepted answers + hints (delay: 0)
  ├── Block 2: message  — fun fact (delay: 1500ms)
  ├── Block 3: map      — Google Maps link (delay: 500ms)
  └── Block 4: message  — directions to next location (delay: 2000ms)
```

### Rich Group Structure (preferred)

```
Group: "Leeds Town Hall"
  ├── Block 1: question — riddle (delay: 0)
  ├── Block 2: image    — photo of the location (delay: 1500ms)
  ├── Block 3: message  — fun fact #1 (delay: 2000ms)
  ├── Block 4: message  — fun fact #2 / tidbit (delay: 2500ms)
  ├── Block 5: map      — Google Maps link (delay: 500ms)
  ├── Block 6: message  — walking directions (delay: 3000ms)
  ├── Block 7: message  — en-route commentary (delay: 60000ms)
  └── Block 8: image    — en-route point of interest (delay: 30000ms)
```

All blocks after the question are delivered sequentially after the correct answer, with `delay_ms` spacing them out. This means the post-answer enrichment (image, facts), directions, and en-route commentary all form one reward-and-transition sequence.

The block system is flexible. You can have groups with no questions (pure narrative), multiple questions, action blocks for group coordination, or any combination. See the content guide for detailed patterns.

---

## How the AI Pipeline Uses Your Content

When a player sends a message, it flows through this pipeline:

```
Player message
  ↓
Pre-filter (length checks, rate limits)
  ↓
Intent Classifier (LLM)
  ├── "answer-attempt" → Answer Matcher (LLM checks against accepted_answers)
  │     ├── Correct → success bank + remaining blocks in group + next group
  │     │     (All blocks after the question — images, fun facts, directions,
  │     │      en-route commentary — fire as a sequence with their delay_ms values)
  │     └── Incorrect → failure bank (+ hint nudge after 3 wrong with 0 hints)
  ├── "hint-request" → Serve next hint from question block hints (no LLM)
  │     └── All hints used → hint-exhausted bank (reveals answer) + advance
  ├── "question" → Question Handler (LLM answers using block context)
  ├── "off-topic-chat" → Silent (no response)
  ├── "contextual-comment" → Silent (no response)
  ├── "prompt-injection" → Message deleted
  ├── "inappropriate" → Message deleted
  └── "clarification" → clarification bank
```

### Answer Matching Rules

The LLM-based answer matcher is fuzzy. It accepts:

- **Case-insensitive** — "town hall" matches "Town Hall"
- **1-2 character typos** — "Tow Hall" matches "Town Hall"
- **Common abbreviations** — "St" for "Saint", "Rd" for "Road"
- **Answers in sentences** — "I think it's the Town Hall" matches "Town Hall"
- **Articles ignored** — articles are stripped per language (en: the/a/an, es: el/la/los/las, fr: le/la/les, de: der/die/das/den/dem/des, nl: de/het)
- **Unicode normalization** — accented characters are normalized (café matches cafe)

It does NOT accept answers that are only vaguely related or thematically similar but factually different.

**Implication for authoring:** You don't need to add misspellings to `accepted_answers`. Focus on the canonical name and common alternative names.

### Question Handler Context

When a player asks a question (not an answer attempt), the AI guide can draw on:
- City name
- Current question block's clue
- Whether a Google Maps link exists in the group
- Estimated distance remaining

The guide **cannot** access information beyond what's in the block data. Write detailed, informative content so the guide has enough context to answer player questions.

---

## Message Banks

Message banks are global template collections filtered by language — they are not per-route. All routes of the same language share the same message bank entries for that language.

### How Selection Works

When the system needs a message of a given type:
1. It queries all **active** (`is_active: true`) entries matching the `(type, language)` pair
2. It selects one at random

When creating content for a new language, you need message bank entries in that language for all 9 types.

Having multiple active messages per type makes the experience feel less robotic.

### Template Variables

Some message types support template variables that are replaced at runtime:

| Variable | Available In | Replaced With |
|----------|-------------|---------------|
| `{{ANSWER}}` | hint-exhausted | First item from accepted_answers |
| `{{CITY_NAME}}` | completion, message blocks | route_family.city |
| `{{TOTAL_STOPS}}` | completion, message blocks | route.total_stops |
| `{{DISTANCE_KM}}` | completion, message blocks | route.estimated_distance_km |
| `{{REVIEW_LINK}}` | completion, message blocks | Configured review URL |

Template variables in message block `content` fields are replaced at runtime, so you can use `{{CITY_NAME}}` etc. in your block content.

### Recommended Counts Per Type (Per Language)

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
| guide-degraded | 2 | 3 |
| guide-busy | 2 | 3 |

---

## Event Lifecycle (For Reference)

Events are runtime instances — you don't create them, but understanding the lifecycle helps. Each event has a `language` field set when the lead picks a language in the lobby. The language determines which message bank entries and AI prompt language to use during gameplay.

1. **NOT_STARTED** — Created by Stripe checkout. An 8-character event code is generated.
2. **WAITING** — First participant has joined and is waiting for others.
3. **IN_PROGRESS** — Lead participant started the game. The game engine begins running the first group.
4. **COMPLETED** — All groups completed. Completion message sent.
5. **EXPIRED** — Event code expired (90 days after creation).
6. **REFUNDED** — Payment refunded via admin panel.

Events track `current_group_id`, `current_block_id`, `hints_given`, `wrong_attempts`, and `guide_response_count` as players progress through the route's groups and blocks.
