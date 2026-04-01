# City Roam Data Model

This document explains how routes, groups, blocks, events, and the AI pipeline fit together. Understanding this helps you create content that works well with the game engine.

---

## Entity Relationships

```
Route
  ├── has many Groups (ordered by position, 0-indexed)
  │     └── has many Blocks (ordered by position, 0-indexed)
  └── has many Events (runtime game instances)
        ├── has many Participants
        └── has many Messages (chat log)

Message Banks (global, not per-route)
  └── Templates used by the AI guide
```

### What You Author

As a content creator, you author **routes** made up of **groups** containing **blocks**. You can also create **message bank** entries to expand the guide's repertoire.

You do NOT create events — those are generated automatically when a customer purchases a hunt via Stripe checkout.

---

## Routes

A route is a treasure hunt in a specific city. It defines the overall journey.

| Field | Purpose |
|-------|---------|
| city | The city where the route takes place |
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
| delay_ms | Milliseconds to wait before sending (0-30000). Creates a natural typing pause. |

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

A standard location group follows this pattern:

```
Group: "Leeds Town Hall"
  ├── Block 1: message  — directions to walk here from previous location
  ├── Block 2: image    — photo of the location (optional)
  ├── Block 3: question — riddle + accepted answers + hints
  ├── Block 4: message  — fun fact (sent after correct answer)
  └── Block 5: map      — Google Maps link (optional)
```

But the block system is flexible. You can have groups with no questions (pure narrative), multiple questions, action blocks for group coordination, or any combination.

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
- **Articles ignored** — "the", "a", "an" are stripped

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

Message banks are global template collections — they are not per-route. All routes share the same message bank.

### How Selection Works

When the system needs a message of a given type:
1. It queries all **active** (`is_active: true`) entries of that type
2. It selects one at random

Having multiple active messages per type makes the experience feel less robotic.

### Template Variables

Some message types support template variables that are replaced at runtime:

| Variable | Available In | Replaced With |
|----------|-------------|---------------|
| `{{ANSWER}}` | hint-exhausted | First item from accepted_answers |
| `{{CITY_NAME}}` | opening, completion, message blocks | route.city |
| `{{TOTAL_STOPS}}` | opening, completion, message blocks | route.total_stops |
| `{{DISTANCE_KM}}` | completion, message blocks | route.estimated_distance_km |
| `{{REVIEW_LINK}}` | completion, message blocks | Configured review URL |

Template variables in message block `content` fields are replaced at runtime, so you can use `{{CITY_NAME}}` etc. in your block content.

### Recommended Counts Per Type

| Type | Minimum | Recommended |
|------|---------|-------------|
| success | 3 | 5-7 |
| failure | 3 | 5-7 |
| hint-exhausted | 2 | 3 |
| clarification | 2 | 3 |
| unknown-answer | 2 | 3 |
| over-length | 2 | 3 |
| opening | 2 | 3 |
| completion | 2 | 3 |

---

## Event Lifecycle (For Reference)

Events are runtime instances — you don't create them, but understanding the lifecycle helps:

1. **NOT_STARTED** — Created by Stripe checkout. An 8-character event code is generated.
2. **WAITING** — First participant has joined and is waiting for others.
3. **IN_PROGRESS** — Lead participant started the game. The game engine begins running the first group.
4. **COMPLETED** — All groups completed. Completion message sent.
5. **EXPIRED** — Event code expired (90 days after creation).
6. **REFUNDED** — Payment refunded via admin panel.

Events track `current_group_id`, `current_block_id`, `hints_given`, `wrong_attempts`, and `guide_response_count` as players progress through the route's groups and blocks.
