import {
  EVENT_CODE_ALPHABET,
  EVENT_CODE_LENGTH,
  VOUCHER_CODE_ALPHABET,
  VOUCHER_CODE_GROUPS,
  VOUCHER_CODE_LENGTH,
  VOUCHER_REDEEM_PATH,
} from "../constants/index.js";

/**
 * Generate a random event code using the allowed alphabet.
 * Uses crypto.getRandomValues for secure randomness.
 */
export function generateEventCode(): string {
  const values = new Uint8Array(EVENT_CODE_LENGTH);
  crypto.getRandomValues(values);
  let code = "";
  for (let i = 0; i < EVENT_CODE_LENGTH; i++) {
    code += EVENT_CODE_ALPHABET[values[i] % EVENT_CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Build the full event URL for sharing with participants.
 * Takes baseDomain as parameter to keep the shared package pure (no env access).
 */
export function buildEventUrl(baseDomain: string, code: string): string {
  return `${baseDomain}/event/${code}`;
}

/**
 * Build the full CDN URL for an S3 object.
 * Takes cdnBaseUrl as parameter to keep the shared package pure (no env access).
 */
export function buildS3Url(cdnBaseUrl: string, key: string): string {
  const base = cdnBaseUrl.endsWith("/") ? cdnBaseUrl.slice(0, -1) : cdnBaseUrl;
  return `${base}/${key}`;
}

/**
 * Route image placeholders.
 *
 * Routes authored programmatically (docs/llm-authoring) reference photos that do
 * not exist yet as `{{IMAGE:slug}}`. The placeholder is stored as-is and resolved
 * at the API boundary to a fixed, predictable S3 key, so a photo becomes live the
 * moment an object is uploaded at that key — no database edit needed. An admin
 * can still replace the placeholder with any other uploaded image URL.
 *
 * Slugs are lowercase kebab-case: letters, digits and single hyphens, no leading
 * or trailing hyphen, at most 100 characters.
 */
export const IMAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const IMAGE_SLUG_MAX_LENGTH = 100;
export const IMAGE_PLACEHOLDER_PATTERN = /^\{\{IMAGE:([a-z0-9]+(?:-[a-z0-9]+)*)\}\}$/;
/** S3 key prefix that placeholder slugs resolve under. */
export const ROUTE_IMAGE_KEY_PREFIX = "route-images/";
/** File extension a placeholder photo must be uploaded with. */
export const ROUTE_IMAGE_EXTENSION = ".jpg";

/** Returns the slug of a well-formed `{{IMAGE:slug}}` placeholder, else null. */
export function parseImagePlaceholder(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = IMAGE_PLACEHOLDER_PATTERN.exec(value);
  if (!match || match[1].length > IMAGE_SLUG_MAX_LENGTH) return null;
  return match[1];
}

/** The S3 key a photo must be uploaded at for `{{IMAGE:slug}}` to resolve. */
export function routeImageKey(slug: string): string {
  return `${ROUTE_IMAGE_KEY_PREFIX}${slug}${ROUTE_IMAGE_EXTENSION}`;
}

/** True for an absolute http(s) URL — the only URL form route content may store. */
export function isAbsoluteHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** True when a value is acceptable as a route image reference (URL or placeholder). */
export function isValidRouteImageRef(value: string): boolean {
  return isAbsoluteHttpUrl(value) || parseImagePlaceholder(value) !== null;
}

/**
 * Absolutize a stored image reference for sending to a browser.
 *
 * Uploads now record the full CDN URL, but rows written before that hold a bare
 * S3 key ("uploads/1699_photo.png"), which a browser resolves against whatever
 * page it is rendered on. Values that are already absolute pass through, as does
 * everything when there is no CDN base configured — degrading to the previous
 * behaviour is better than emitting a confidently wrong URL.
 *
 * `{{IMAGE:slug}}` placeholders resolve to `<cdn>/route-images/<slug>.jpg`. With
 * no CDN configured, or for anything else wrapped in `{{...}}` (a malformed
 * placeholder), the result is null: no image beats a guaranteed-broken one.
 */
export function resolveImageUrl(
  imageUrl: string | null | undefined,
  cdnBaseUrl: string,
): string | null {
  if (!imageUrl) return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  if (/^(?:https?:)?\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }
  const slug = parseImagePlaceholder(trimmed);
  if (slug) {
    return cdnBaseUrl ? buildS3Url(cdnBaseUrl, routeImageKey(slug)) : null;
  }
  if (trimmed.startsWith("{{")) return null;
  if (!cdnBaseUrl) return trimmed;
  return buildS3Url(cdnBaseUrl, trimmed.replace(/^\/+/, ""));
}

/**
 * Format a Date for chat timestamp separators.
 * Shows time for today, date + time for older messages.
 */
export function formatTimestamp(date: Date): string {
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) {
    return time;
  }

  const dateStr = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${dateStr}, ${time}`;
}

/**
 * Validate whether a string is a valid event code (correct length and alphabet).
 */
export function isValidEventCode(code: string): boolean {
  if (code.length !== EVENT_CODE_LENGTH) {
    return false;
  }
  for (let i = 0; i < code.length; i++) {
    if (!EVENT_CODE_ALPHABET.includes(code[i])) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Gift voucher codes
// ---------------------------------------------------------------------------

/**
 * Random voucher code, formatted XXXX-XXXX-XX. Uses rejection sampling so
 * every alphabet character is equally likely (256 is not a multiple of 31).
 */
export function generateVoucherCode(): string {
  const n = VOUCHER_CODE_ALPHABET.length;
  const ceiling = 256 - (256 % n);
  let raw = "";
  while (raw.length < VOUCHER_CODE_LENGTH) {
    const bytes = new Uint8Array(VOUCHER_CODE_LENGTH * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= ceiling) continue;
      raw += VOUCHER_CODE_ALPHABET[b % n];
      if (raw.length === VOUCHER_CODE_LENGTH) break;
    }
  }
  return formatVoucherCode(raw);
}

/** Inserts the display dashes into a bare 10-character code. */
export function formatVoucherCode(raw: string): string {
  const parts: string[] = [];
  let i = 0;
  for (const size of VOUCHER_CODE_GROUPS) {
    parts.push(raw.slice(i, i + size));
    i += size;
  }
  return parts.join("-");
}

/**
 * Canonical XXXX-XXXX-XX form of whatever a person typed: case, spaces and
 * dashes are forgiven. Returns null when it cannot be a voucher code, so a
 * typo is rejected before any database or rate-limit work.
 */
export function normalizeVoucherCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  if (raw.length !== VOUCHER_CODE_LENGTH) return null;
  for (const ch of raw) {
    if (!VOUCHER_CODE_ALPHABET.includes(ch)) return null;
  }
  return formatVoucherCode(raw);
}

/** True for a code already in canonical XXXX-XXXX-XX form. */
export function isValidVoucherCode(code: string): boolean {
  return normalizeVoucherCode(code) === code;
}

/**
 * The marketing redemption link: `${marketingUrl}/<locale>/redeem?code=…`.
 * Takes the base URL as a parameter to keep the shared package pure.
 */
export function buildVoucherRedeemUrl(
  marketingUrl: string,
  language: string,
  code: string,
): string {
  const base = marketingUrl.endsWith("/") ? marketingUrl.slice(0, -1) : marketingUrl;
  return `${base}/${language}${VOUCHER_REDEEM_PATH}?code=${encodeURIComponent(code)}`;
}

// Answer normalisation and matching (the API pipeline and the marketing demo).
// Also exported on its own as `@cityroam/shared/answer-match`, which has no
// runtime imports, for bundles that only need the matcher.
export * from "./answer-match.js";
// "Are you a bot?" detection (the API pipeline and the marketing demo). Also
// exported on its own as `@cityroam/shared/identity-question`.
export * from "./identity-question.js";
