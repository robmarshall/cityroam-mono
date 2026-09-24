/**
 * Deterministic (no-LLM) answer matching.
 *
 * Two jobs:
 *
 * - `deterministicAnswerMatch` is the fallback used when DeepSeek is
 *   unreachable or the event has spent its guide budget, so players can still
 *   progress. It is also the cheap corroborating signal on the normal path.
 * - `nearAnswerMatch` is a looser, still purely lexical check used to
 *   corroborate an LLM "correct" verdict on answers the strict matcher misses
 *   (typos, abbreviations). See `matchAnswer` in handlers/answer-attempt.ts.
 *
 * The implementation lives in shared (`utils/answer-match.ts`) so the
 * marketing site's scripted demo accepts answers exactly the way a real game
 * does. This module keeps the pipeline's import path stable.
 */

export { deterministicAnswerMatch, nearAnswerMatch } from "@cityroam/shared/utils";
