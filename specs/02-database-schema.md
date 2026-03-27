# Spec 02: Database Schema & Migrations

## Goal
Define and implement the PostgreSQL schema with ordered migrations for all core tables using Drizzle ORM.

## Deliverables

### 2.1 Migration Tool Setup
- Use **Drizzle Kit** for migrations (Drizzle ORM is the chosen ORM for the entire project)
- Drizzle schema definitions in `packages/api/src/db/schema/`
- Migration scripts runnable via `npm run migrate` from `packages/api`
- Separate seed script for initial data (`npm run seed`)
- Migration files stored in `packages/api/drizzle/` with sequential naming (e.g., `0001_create_routes.sql`)

### 2.2 Tables

**routes** (must be created before events due to FK)
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| city | varchar | NOT NULL |
| name | varchar | NOT NULL |
| description | text | |
| total_stops | integer | NOT NULL |
| estimated_duration_mins | integer | NOT NULL |
| estimated_distance_km | decimal | NOT NULL |
| is_active | boolean | NOT NULL, default true |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

**events**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| code | varchar(8) | UNIQUE, NOT NULL, indexed |
| status | varchar | NOT NULL, default 'NOT_STARTED', CHECK in ('NOT_STARTED','WAITING','IN_PROGRESS','COMPLETED','EXPIRED') |
| route_id | uuid | FK -> routes, NOT NULL |
| stripe_session_id | varchar | nullable |
| stripe_payment_id | varchar | nullable |
| buyer_email | varchar | nullable |
| lead_participant_id | uuid | FK -> participants, nullable (set after first join) |
| current_stop | integer | NOT NULL, default 0 |
| hints_given | integer | NOT NULL, default 0 |
| wrong_attempts | integer | NOT NULL, default 0 |
| guide_response_count | integer | NOT NULL, default 0 |
| created_at | timestamptz | NOT NULL, default now() |
| started_at | timestamptz | nullable |
| completed_at | timestamptz | nullable |
| expires_at | timestamptz | NOT NULL |

Note: `lead_participant_id` FK to participants creates a circular dependency with events. Use a deferred FK constraint or add the FK via ALTER TABLE after both tables exist.

**participants**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| event_id | uuid | FK -> events, NOT NULL |
| display_name | varchar(30) | NOT NULL |
| token | varchar | NOT NULL, UNIQUE |
| is_lead | boolean | NOT NULL, default false |
| is_active | boolean | NOT NULL, default true |
| joined_at | timestamptz | NOT NULL, default now() |
| last_seen_at | timestamptz | NOT NULL, default now() |
| left_at | timestamptz | nullable |
| left_reason | varchar | nullable, CHECK in ('voluntary', 'timeout') |

**messages**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| event_id | uuid | FK -> events, NOT NULL |
| step_number | integer | NOT NULL |
| sender_type | varchar | NOT NULL, CHECK in ('user','guide','system') |
| sender_name | varchar | NOT NULL |
| participant_id | uuid | FK -> participants, nullable |
| content | text | NOT NULL |
| image_url | varchar | nullable |
| created_at | timestamptz | NOT NULL, default now(), indexed |

Index: `(event_id, created_at)` for message history queries.

**stops**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| route_id | uuid | FK -> routes, NOT NULL |
| stop_number | integer | NOT NULL |
| name | varchar | NOT NULL |
| directions_from_previous | text | NOT NULL |
| clue | text | NOT NULL |
| accepted_answers | jsonb | NOT NULL |
| hints | jsonb | NOT NULL |
| correct_response | text | nullable |
| fun_fact | text | NOT NULL |
| images | jsonb | NOT NULL, default '[]' |
| google_maps_link | varchar | nullable |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

Unique constraint: `(route_id, stop_number)`.

**message_banks**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| type | varchar | NOT NULL, CHECK in ('success','failure','hint-exhausted','clarification','unknown-answer','opening','completion','over-length') |
| content | text | NOT NULL |
| is_active | boolean | NOT NULL, default true |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

### 2.3 Seed Data

Seed the `message_banks` table with the following entries. All entries seeded with `is_active: true`.

**Success messages (type: 'success'):**
1. "That's the one."
2. "Correct. I'd be worried if that had taken any longer."
3. "Got it."
4. "Right first time."
5. "There it is."
6. "Yep, that's it."
7. "Bang on."

**Failure messages (type: 'failure'):**
1. "Not quite."
2. "Nope."
3. "That's not it."
4. "Not the one I'm looking for."
5. "Close, but no."
6. "Have another look."
7. "Wrong. But I believe in you."

**Hint-exhausted messages (type: 'hint-exhausted'):**
1. "That's everything I've got. The answer is {{ANSWER}}. On we go."
2. "I've given you all the clues I have. It's {{ANSWER}}. Let's keep moving."
3. "Right, I'll put you out of your misery. It's {{ANSWER}}."

**Clarification messages (type: 'clarification'):**
1. "I didn't quite catch that — could you say it differently?"
2. "Not sure what you mean. Try again?"
3. "Say that another way and I'll try to help."

**Unknown-answer messages (type: 'unknown-answer'):**
1. "Not sure — that one's outside my knowledge."
2. "I don't have that one, I'm afraid."
3. "Can't help you there."

**Over-length messages (type: 'over-length'):**
1. "That's a bit much. Keep it shorter."
2. "Too long. Try again with fewer words."
3. "I stopped reading halfway through. Shorter, please."

**Opening templates (type: 'opening'):**
1. "Welcome. I'll be your guide today — I know where we're going, you do the leg work.\n\nHere's how it works: I'll give you a clue at each stop, you figure it out, and we move on. Ask for a hint if you're stuck. Shouldn't take more than 90 minutes if you keep moving.\n\nRight. Head to {{FIRST_STOP_DIRECTIONS}}.\n\nWhen you get there, your first clue:\n\n\"{{FIRST_CLUE}}\""
2. "Right then, let's get started. I'll be guiding you through {{CITY_NAME}} today.\n\nThe rules are simple: I give clues, you solve them. Ask for hints if you're stuck — no shame in it.\n\nFirst up: {{FIRST_STOP_DIRECTIONS}}.\n\nYour clue:\n\n\"{{FIRST_CLUE}}\""
3. "Welcome to the hunt. I'm your guide — dry wit, good directions, no patience for dawdling.\n\nI'll set the clues, you work them out. Hints are available if you get stuck. {{TOTAL_STOPS}} stops, roughly 90 minutes.\n\nTo begin: {{FIRST_STOP_DIRECTIONS}}.\n\nClue:\n\n\"{{FIRST_CLUE}}\""

**Completion templates (type: 'completion'):**
1. "That's the last one. Well done — you've made it through all {{TOTAL_STOPS}} stops and covered roughly {{DISTANCE_KM}}km of {{CITY_NAME}}.\n\nIf you enjoyed it, a Google review goes a long way: {{REVIEW_LINK}}\n\nNow go find a drink. You've earned it."
2. "And that's a wrap. {{TOTAL_STOPS}} stops, {{DISTANCE_KM}}km, and you didn't quit once.\n\nIf you had fun, we'd appreciate a review: {{REVIEW_LINK}}\n\nEnjoy the rest of your day."
3. "Done. All {{TOTAL_STOPS}} stops complete.\n\nYou've covered about {{DISTANCE_KM}}km of {{CITY_NAME}} and hopefully learned a thing or two.\n\nLeave a review if you're feeling generous: {{REVIEW_LINK}}"

### 2.4 Seed Data — Development Route

A sample route for development and testing, so developers can run the full flow without the admin panel.

**Route:**
- city: "Leeds"
- name: "Leeds City Centre Discovery"
- description: "A short development route through the heart of Leeds for testing the treasure hunt experience."
- total_stops: 3
- estimated_duration_mins: 30
- estimated_distance_km: 1.5
- is_active: true

**Stop 1:**
- stop_number: 1
- name: "Leeds Town Hall"
- directions_from_previous: "Head to The Headrow in the city centre. You'll see a grand building with tall columns — you can't miss it."
- clue: "I stand with columns tall and proud, where justice once was served aloud. Victoria laid my cornerstone — now concerts fill my halls of stone."
- accepted_answers: ["Leeds Town Hall", "Town Hall", "the Town Hall"]
- hints: ["Think civic buildings — this one has Corinthian columns.", "It's on The Headrow, opened in 1858 by Queen Victoria."]
- fun_fact: "Leeds Town Hall was designed by Cuthbert Brodrick and opened in 1858. The organ inside has over 6,500 pipes."
- images: []
- google_maps_link: "https://maps.google.com/?q=Leeds+Town+Hall"

**Stop 2:**
- stop_number: 2
- name: "Corn Exchange"
- directions_from_previous: "Walk south down Vicar Lane, past the markets. After about 5 minutes you'll see a distinctive domed roof on your right."
- clue: "My roof is round, my trades have changed — from grain to vintage, rearranged. Step inside my oval hall, where independent traders fill each stall."
- accepted_answers: ["Corn Exchange", "Leeds Corn Exchange", "the Corn Exchange"]
- hints: ["This building was originally for trading grain.", "It has a distinctive oval shape and domed glass roof, built in 1863."]
- fun_fact: "The Corn Exchange is another Cuthbert Brodrick design. Its elliptical shape was revolutionary for 1863 and it's now Grade I listed."
- images: []
- google_maps_link: "https://maps.google.com/?q=Leeds+Corn+Exchange"

**Stop 3:**
- stop_number: 3
- name: "Leeds Minster"
- directions_from_previous: "Head east along Kirkgate for about 3 minutes. Look for the church on your left."
- clue: "The oldest site of worship here, I've watched this city grow each year. My name was raised from parish church — now 'Minster' puts me a notch above the rest."
- accepted_answers: ["Leeds Minster", "the Minster", "Leeds Parish Church"]
- hints: ["It's the oldest religious site in Leeds, on Kirkgate.", "It became a Minster in 2012 — before that it was Leeds Parish Church."]
- fun_fact: "Leeds Minster stands on a site of Christian worship dating back to the 7th century. The current building is mostly Victorian but the site is over 1,300 years old."
- images: []
- google_maps_link: "https://maps.google.com/?q=Leeds+Minster"

### 2.5 Indexes
- `events.code` — unique index
- `events.status` — index for admin queries
- `messages(event_id, created_at)` — composite index for history queries
- `participants(event_id)` — for participant lookups
- `participants(token)` — unique index for session validation
- `stops(route_id, stop_number)` — unique composite index
- `message_banks(type)` — for type-filtered queries

## Dependencies
- Spec 01 (monorepo + shared types must exist)

## Backend Tests
- Migration up/down runs cleanly
- Seed data inserts correctly: all expected message bank entries per type, and the development route with 3 stops
- Foreign key constraints enforced (e.g., cannot insert participant for non-existent event)
- Unique constraints enforced (duplicate event code, duplicate stop number per route)
- Check constraints enforced (invalid status values rejected, invalid left_reason rejected, invalid message_bank type rejected)
- Circular FK (events.lead_participant_id -> participants) works correctly
- Development route seed: route exists with is_active=true, 3 stops with correct stop_numbers and valid accepted_answers/hints arrays
