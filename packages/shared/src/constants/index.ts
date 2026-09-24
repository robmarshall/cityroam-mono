// Game limits
export const MAX_PARTICIPANTS = 10;
export const MAX_MESSAGE_LENGTH = 200;
export const MIN_MESSAGE_LENGTH = 2;
export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 20;
export const MAX_GUIDE_RESPONSES_PER_EVENT = 100;

// Timeouts (milliseconds)
export const PARTICIPANT_OFFLINE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const IDLE_PROMPT_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
export const IDLE_PAUSE_TIMEOUT_MS = 90 * 60 * 1000; // 90 minutes
export const WEBSOCKET_PING_INTERVAL_MS = 30 * 1000; // 30 seconds
export const TYPING_INDICATOR_DEBOUNCE_MS = 3 * 1000; // 3 seconds
export const GUIDE_RATE_LIMIT_MS = 5 * 1000; // 5 seconds
export const MAX_BLOCK_DELAY_MS = 5 * 60 * 1000; // 5 minutes — longest a route block may pause
export const PARTICIPANT_RATE_LIMIT_COUNT = 3; // max messages
export const PARTICIPANT_RATE_LIMIT_WINDOW_MS = 10 * 1000; // in 10 seconds

// Event lifecycle
export const TERMINAL_STATUSES = new Set<string>(["COMPLETED", "EXPIRED", "REFUNDED"]);
export const EVENT_EXPIRY_DAYS = 90;
export const SESSION_TOKEN_EXPIRY_HOURS = 24;

// Event code
export const EVENT_CODE_LENGTH = 8;
export const EVENT_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/i/l

// Language
import type { SupportedLanguage } from "../types/enums.js";
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ["en", "es", "fr", "de", "nl"] as const;
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  nl: "Dutch",
};

// The guide
/**
 * The AI guide's name as players see it, per language. It is translated, not
 * transliterated: first-person copy must agree with it (El Búho and Le Hibou
 * are masculine, Die Eule is feminine, De Uil takes "de").
 *
 * - `label` stands on its own: the chat sender label, headings, the start of
 *   a sentence ("The Owl has reached its message limit").
 * - `inSentence` is for running text, article in lower case: "I'm the Owl.",
 *   "Soy el Búho.", "Ich bin die Eule." The `{{GUIDE_NAME}}` template variable
 *   resolves to this form and is capitalised automatically when it opens a
 *   sentence (packages/api/src/services/template-vars.ts).
 */
export const GUIDE_NAMES = {
  en: { label: "The Owl", inSentence: "the Owl" },
  es: { label: "El Búho", inSentence: "el Búho" },
  fr: { label: "Le Hibou", inSentence: "le Hibou" },
  de: { label: "Die Eule", inSentence: "die Eule" },
  nl: { label: "De Uil", inSentence: "de Uil" },
} as const satisfies Record<SupportedLanguage, { label: string; inSentence: string }>;
export type GuideName = (typeof GUIDE_NAMES)[SupportedLanguage];

/** The guide's name forms for a language code, falling back to English for unknown codes. */
export function guideNameFor(language: string): GuideName {
  return (GUIDE_NAMES as Record<string, GuideName>)[language] ?? GUIDE_NAMES.en;
}

// Admin API keys
/**
 * Scopes an admin API key can carry. A session JWT implicitly holds all of
 * them plus access to session-only routes.
 *
 * `routes:publish` (activating a route so it can be sold) exists for the
 * server-side check only: activation is human-only, so the key-creation
 * schema refuses to grant it and no key ever holds it.
 */
export const ADMIN_API_KEY_SCOPES = [
  "routes:read",
  "routes:write",
  "routes:publish",
  "images:read",
  "images:write",
  "message-banks:read",
  "message-banks:write",
] as const;
export type AdminApiKeyScope = (typeof ADMIN_API_KEY_SCOPES)[number];

/** Scopes that can never be granted to an API key. */
export const ADMIN_API_KEY_UNGRANTABLE_SCOPES: readonly AdminApiKeyScope[] = ["routes:publish"];

/** Scopes the key-creation form may offer. */
export const ADMIN_API_KEY_GRANTABLE_SCOPES: readonly AdminApiKeyScope[] = ADMIN_API_KEY_SCOPES.filter(
  (s) => !ADMIN_API_KEY_UNGRANTABLE_SCOPES.includes(s),
);

/** Lifetimes offered when creating a key; null means it never expires. */
export const ADMIN_API_KEY_EXPIRY_DAYS = [30, 90, 365] as const;

/** Deployment environments encoded in a key's prefix (`crk_<env>_…`). */
export const ADMIN_API_KEY_ENVS = ["dev", "stg", "prd"] as const;
export type AdminApiKeyEnv = (typeof ADMIN_API_KEY_ENVS)[number];

// Gift vouchers
/**
 * Voucher codes are typed by hand from a printed card, so the alphabet drops
 * every character that reads as another: no 0/O, 1/I/L. Upper case only;
 * input is upper-cased before it is checked. 31^10 is about 8 x 10^14 codes.
 */
export const VOUCHER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Characters in a voucher code, not counting the display dashes. */
export const VOUCHER_CODE_LENGTH = 10;
/** Display grouping: XXXX-XXXX-XX. */
export const VOUCHER_CODE_GROUPS = [4, 4, 2] as const;
/** A voucher can be redeemed for this long after purchase. */
export const VOUCHER_EXPIRY_MONTHS = 12;
export const VOUCHER_RECIPIENT_NAME_MAX_LENGTH = 60;
export const VOUCHER_MESSAGE_MAX_LENGTH = 300;
/**
 * The marketing page that redeems a voucher, under the locale prefix:
 * `${MARKETING_URL}/<locale>/redeem?code=XXXX-XXXX-XX`.
 */
export const VOUCHER_REDEEM_PATH = "/redeem";
export const VOUCHER_STATUSES = ["PURCHASED", "REDEEMED", "REFUNDED", "EXPIRED", "VOID"] as const;
