# City Roam Data Model

This document explains how routes, stops, events, and the AI pipeline fit together. Understanding this helps you create content that works well with the game engine.

---

## Entity Relationships

```
Route
  ├── has many Stops (ordered by stop_number, 1-indexed)
  └── has many Events (runtime game instances)
        ├── has many Participants
        └── has many Messages (chat log)

Message Banks (global, not per-route)
  └── Templates used by the AI guide
```

### What You Author

As a content creator, you author **routes** and **stops**. You can also create **message bank** entries to expand the guide's repertoire.

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
| total_stops | Automatically maintained — count of stops |
| is_active | Whether the route is available for purchase |

---

## Stops

Stops are the individual locations within a route. They are the core content unit.

| Field | Purpose | Used By |
|-------|---------|---------|
| stop_number | Position in route (1, 2, 3...) | Auto-assigned, determines play order |
| name | Location name (internal reference) | Admin only — players never see this |
| directions_from_previous | How to walk here from the previous stop | Shown to player after solving previous clue |
| clue | Riddle/puzzle identifying this location | Shown to player, used by intent classifier |
| accepted_answers | Array of valid answer strings | Used by LLM answer matcher |
| hints | Array of 2-3 hint strings | Served in order when player asks for help |
| correct_response | Optional stop-specific success text | Sent on correct answer (rarely used) |
| fun_fact | Interesting info about the location | Shown immediately after correct answer |
| images | S3 image keys | Shown to player for next stop after correct answer |
| google_maps_link | Link to Google Maps | Available to guide when answering questions |

### Stop Ordering

- Stops are **1-indexed** (`stop_number` starts at 1).
- When using the bulk create endpoint, stop order matches array position — the first stop in the array becomes stop 1.
- When adding/deleting individual stops, numbering is automatically maintained by the API.

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
  │     ├── Correct → success bank + fun_fact + next stop directions + next clue
  │     └── Incorrect → failure bank (+ hint nudge after 3 wrong with 0 hints)
  ├── "hint-request" → Serve next hint from hints array (no LLM)
  │     └── All hints used → hint-exhausted bank (reveals answer) + advance
  ├── "question" → Question Handler (LLM answers using stop context)
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
- Current stop name, clue, and directions
- Next stop directions (only after current is solved)
- Estimated distance remaining
- Whether a Google Maps link exists

The guide **cannot** access information beyond what's in the stop data. Write detailed, informative stop content so the guide has enough context to answer player questions.

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
| `{{FIRST_STOP_DIRECTIONS}}` | opening | directions_from_previous of stop 1 |
| `{{FIRST_CLUE}}` | opening | clue of stop 1 |
| `{{CITY_NAME}}` | opening, completion | route.city |
| `{{TOTAL_STOPS}}` | opening, completion | route.total_stops |
| `{{DISTANCE_KM}}` | completion | route.estimated_distance_km |
| `{{REVIEW_LINK}}` | completion | Configured review URL |

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
3. **IN_PROGRESS** — Lead participant started the game. Guide sends opening message.
4. **COMPLETED** — All stops solved. Completion message sent.
5. **EXPIRED** — Event code expired (90 days after creation).
6. **REFUNDED** — Payment refunded via admin panel.

Events track `current_stop`, `hints_given`, `wrong_attempts`, and `guide_response_count` as players progress through the route's stops.
