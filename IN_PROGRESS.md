# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: Phase 2: API Pipeline Language Threading (2.1 through 2.13)
- **Spec File**: IMPLEMENTATION_PLAN.md
- **Stage**: commit
- **Started**: 2026-04-02T00:00:00Z
- **Last Heartbeat**: 2026-04-02T15:30:00Z
- **Inner Loop Count**: 8

## Stage Status
- [x] implement - Complete
- [x] test - Complete
- [x] review - Complete

## TODOs (feed back to implement)
- [x] Review: group-runner.ts:152-155,167,183 — Bug: `runGroup` doesn't load `language` column from the event. Both `advanceToNextGroup` calls (lines 167, 183) use the default `"en"`, so game completion triggered from `runGroup` will always produce English messages regardless of event language. Fix: add `language: true` to the columns query and pass it to both `advanceToNextGroup` calls.
- [x] Review: answer-attempt.ts:234 — Hardcoded English fallback `"Correct!"`. Use a per-language fallback map (like COMPLETION_FALLBACK in game-completion.ts).
- [x] Review: answer-attempt.ts:278 — Hardcoded English fallback `"That's not quite right. Try again!"`. Use a per-language fallback map.
- [x] Review: hint-request.ts:121 — Hardcoded English fallback `"The answer is ${answer}. Let's move on."`. Use a per-language fallback map with `{{ANSWER}}` placeholder.
- [x] Review: pre-filter.ts:39 — Hardcoded English fallback `"Your message is too long. Please keep it shorter."`. Use a per-language fallback map.
- [x] Review: ws/handlers.ts:55,115,120,131,149 — Inconsistent error code/message pattern. Specific error codes (e.g. "ACTION_MISSING_BLOCK") are sent as the `message` field instead of the `code` field. Users see raw codes. Either swap so codes go in `code` field with human-readable `message`, or send only the `code` and let the client map it.
- [x] Review: orchestrator.ts:212 — Hardcoded English fallback `"No worries — keep at it!"` for hint-decline. Add a per-language `HINT_DECLINE_FALLBACK` map (en/es/fr/de/nl) like other handlers.
- [x] Review: idle-timer.ts:140 — Hardcoded English `"your current clue"` fallback when block not found. Add a per-language fallback map for this placeholder text.
- [x] Review: ws/handlers.ts:66 + ChatPage.tsx:318 — Bug: Zod validation errors send `code: "VALIDATION_ERROR"` but the actual error code (e.g. "MESSAGE_TOO_SHORT") is in the `message` field. ChatPage prefers `payload.code`, so users see raw "VALIDATION_ERROR". Fix: send the Zod issue message as the `code` field (e.g. `sendError(ws, "Invalid message", result.error.issues[0].message)`).
- [x] Review: pre-filter.ts:9 — `OVER_LENGTH_FALLBACK` typed as `Record<string, string>` instead of `Record<SupportedLanguage, string>`. Inconsistent with other fallback maps. Fix type for safety.
- [x] Review: classifier.ts:7, answer-attempt.ts:36, question.ts:23 — `LANGUAGE_NAMES` map duplicated in 3 files. Extract to a shared constant (e.g. in shared package or a pipeline utils file) and import from single source.
- [x] Review: answer-attempt.ts:245,253,261, hint-request.ts:13, hint-nudge.ts:23, game-completion.ts:24 — Six fallback maps typed `Record<string, string>` instead of `Record<SupportedLanguage, string>`. Same issue that was fixed for pre-filter.ts:9 in last iteration. Apply consistently to all fallback maps for type safety.
- [x] Review: answer-attempt.ts:47 — `LANGUAGE_NAMES[language] ?? "English"` uses hardcoded string fallback. Should be `LANGUAGE_NAMES[language] ?? LANGUAGE_NAMES.en` to match question.ts:50 pattern.
- [x] Review: orchestrator.ts:108 — `(event.language ?? "en") as SupportedLanguage` casts DB varchar without validation. Add runtime check against SUPPORTED_LANGUAGES array with "en" fallback for invalid values.

## Files Modified
- packages/api/src/services/pipeline/handlers/answer-attempt.ts (modified) — getRandomMessageBank accepts language, AnswerAttemptContext has language, buildAnswerMatchPrompt is language-aware, hint nudge suffix translated, added SUCCESS_FALLBACK and FAILURE_FALLBACK maps, import LANGUAGE_NAMES from shared
- packages/api/src/services/pipeline/handlers/hint-request.ts (modified) — HintRequestContext has language, all message bank calls pass language, added HINT_EXHAUSTED_FALLBACK map
- packages/api/src/services/pipeline/handlers/hint-nudge.ts (modified) — HintNudgeContext has language, hint-offer fallback translated
- packages/api/src/services/pipeline/handlers/question.ts (modified) — QuestionContext has language, buildQuestionPrompt adds "Respond in {language}", all message bank calls pass language, import LANGUAGE_NAMES from shared
- packages/api/src/services/pipeline/handlers/silent.ts (modified) — SilentHandlerContext has language, clarification bank call passes language
- packages/api/src/services/pipeline/handlers/game-completion.ts (modified) — GameCompletionContext has language, completion fallback translated
- packages/api/src/services/pipeline/orchestrator.ts (modified) — loads event.language, passes to all handlers and utility functions, added HINT_DECLINE_FALLBACK map, runtime language validation
- packages/api/src/services/pipeline/classifier.ts (modified) — classifyIntent accepts language, prompt includes multilingual classification examples, import LANGUAGE_NAMES from shared
- packages/api/src/services/pipeline/deterministic-match.ts (modified) — language-aware article stripping (en/es/fr/de/nl), Unicode NFD accent normalization
- packages/api/src/services/pipeline/word-match.ts (modified) — per-language affirmative/negative word lists, English fallback, accent-aware matching
- packages/api/src/services/pipeline/pre-filter.ts (modified) — removed duplicate getRandomMessageBank, imports from answer-attempt, preFilter accepts language, added OVER_LENGTH_FALLBACK map with Record<SupportedLanguage, string> type
- packages/api/src/services/pipeline/idle-timer.ts (modified) — per-language idle messages (resume/nudge/pause), IdleState tracks language, added per-language CLUE_FALLBACK map
- packages/api/src/services/pipeline/guide-response-cap.ts (modified) — per-language cap reached messages
- packages/api/src/services/group-runner.ts (modified) — loads language column, passes language through to advanceToNextGroup in runGroup
- packages/api/src/routes/events.ts (modified) — added PUT /event/:code/language endpoint for lead to change language before game start
- packages/api/src/routes/checkout.ts (modified) — per-language email templates, route_family_id in Stripe metadata, family-aware route lookup
- packages/api/src/ws/handlers.ts (modified) — error codes now sent in `code` field with human-readable `message` field, Zod validation sends actual error code
- packages/shared/src/types/redis.ts (modified) — added language_changed control event type
- packages/shared/src/constants/index.ts (modified) — added LANGUAGE_NAMES constant
- packages/app/src/lib/errors.ts (modified) — added WebSocket error code mappings
- packages/app/src/pages/ChatPage.tsx (modified) — use payload.code for error lookup with fallback to payload.message
- packages/api/src/__tests__/pipeline/handlers.test.ts (modified) — added language to test contexts
- packages/api/src/__tests__/pipeline/completion-cap-idle.test.ts (modified) — added language to test contexts
- packages/api/src/__tests__/pipeline/orchestrator.test.ts (modified) — added language to event row and assertion updates

## Iteration Log
- Loop 1: Starting implementation of Phase 2 API Pipeline Language Threading
- Loop 2 (test): All 337 tests passed (201 API, 136 shared), typecheck passed. Advancing to review.
- Loop 2: Implemented all 13 sub-tasks (2.1–2.13). All TypeScript packages compile cleanly. Key changes: getRandomMessageBank filters by language with English fallback, orchestrator threads language from event to all handlers, AI prompts include language context, deterministic matching handles per-language articles and Unicode normalization, word lists support 5 languages, idle/cap messages translated, new PUT /event/:code/language endpoint, checkout supports route_family_id metadata, WebSocket errors use codes instead of English strings.
- Loop 3 (review): Review found issues — (1) Bug: runGroup doesn't thread language to advanceToNextGroup, defaulting to "en". (2) Four hardcoded English fallback strings in answer-attempt, hint-request, pre-filter should use per-language fallback maps. (3) ws/handlers.ts sends error codes as message field instead of code field, inconsistent pattern.
- Loop 4 (test): All 337 tests passed (201 API, 136 shared), typecheck passed. Advancing to review.
- Loop 3 (implement): Fixed all 6 review TODOs. (1) group-runner.ts: added language column to runGroup query, pass to both advanceToNextGroup calls. (2) answer-attempt.ts: added SUCCESS_FALLBACK and FAILURE_FALLBACK maps for 5 languages. (3) hint-request.ts: added HINT_EXHAUSTED_FALLBACK map with {{ANSWER}} placeholder. (4) pre-filter.ts: added OVER_LENGTH_FALLBACK map. (5) ws/handlers.ts: all sendError calls now use human-readable message + error code. (6) ChatPage.tsx: uses payload.code for error lookup. Both api and app typecheck clean.
- Loop 4 (review): Review found 5 issues — (1) orchestrator.ts:212 hardcoded English hint-decline fallback. (2) idle-timer.ts:140 hardcoded English "your current clue". (3) ws/handlers.ts:66 sends "VALIDATION_ERROR" as code but ChatPage can't map it (should send actual Zod error code). (4) pre-filter.ts OVER_LENGTH_FALLBACK typed Record<string,string> not Record<SupportedLanguage,string>. (5) LANGUAGE_NAMES duplicated in 3 files.
- Loop 5 (test): All 337 tests passed (201 API, 136 shared), typecheck passed. Advancing to review.
- Loop 4 (implement): Fixed all 5 review TODOs. (1) Extracted LANGUAGE_NAMES to shared/constants/index.ts, updated classifier.ts, answer-attempt.ts, question.ts to import from shared. (2) Added HINT_DECLINE_FALLBACK map to orchestrator.ts. (3) Added per-language CLUE_FALLBACK in idle-timer.ts. (4) Fixed ws/handlers.ts:66 to send Zod error code in code field. (5) Fixed OVER_LENGTH_FALLBACK type to Record<SupportedLanguage, string>. All three packages typecheck clean.
- Loop 5 (review): Review found 3 issues — (1) 6 fallback maps still typed Record<string, string> instead of Record<SupportedLanguage, string> (same fix as pre-filter.ts, apply consistently). (2) answer-attempt.ts:47 inconsistent LANGUAGE_NAMES fallback pattern. (3) orchestrator.ts:108 unsafe type cast at DB boundary needs runtime validation.
- Loop 6 (test): All 337 tests passed (201 API, 136 shared), typecheck passed. Advancing to review.
- Loop 5 (implement): Fixed all 3 review TODOs. (1) Updated 6 fallback maps (SUCCESS_FALLBACK, FAILURE_FALLBACK, HINT_NUDGE_SUFFIX in answer-attempt.ts, HINT_EXHAUSTED_FALLBACK in hint-request.ts, HINT_OFFER_FALLBACK in hint-nudge.ts, COMPLETION_FALLBACK in game-completion.ts) to Record<SupportedLanguage, string>. (2) Changed LANGUAGE_NAMES fallback from "English" to LANGUAGE_NAMES.en. (3) Added runtime SUPPORTED_LANGUAGES validation in orchestrator.ts instead of unsafe cast. API typecheck clean.
- Loop 6 (review): Review passed. All previous review issues resolved. Remaining agent-flagged items are pre-existing patterns (unsafe `as` casts, session access) not introduced by this change. Language threading is consistent, fallback maps typed correctly, LANGUAGE_NAMES deduplicated to shared, all tests pass.

## Blockers
(none)
