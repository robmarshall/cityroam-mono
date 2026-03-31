/**
 * Deterministic (no-LLM) answer matching fallback.
 * Used when DeepSeek is unreachable so players can still progress.
 */

const LEADING_ARTICLE_RE = /^(?:the|a|an)\s+/i;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(LEADING_ARTICLE_RE, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check whether the player's message matches any of the accepted answers
 * using simple string rules (case-insensitive, article-stripping, word-boundary substring).
 */
export function deterministicAnswerMatch(
  userMessage: string,
  acceptedAnswers: string[],
): boolean {
  const msg = normalize(userMessage);
  if (msg.length === 0) return false;

  for (const answer of acceptedAnswers) {
    const ans = normalize(answer);
    if (ans.length === 0) continue;

    // Word-boundary match: accepted answer appears as a whole-word substring
    const pattern = new RegExp(`\\b${escapeRegex(ans)}\\b`, "i");
    if (pattern.test(msg)) return true;
  }

  return false;
}
