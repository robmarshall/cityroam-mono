import { EVENT_CODE_ALPHABET, EVENT_CODE_LENGTH } from "../constants/index.js";

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
 * Absolutize a stored image reference for sending to a browser.
 *
 * Uploads now record the full CDN URL, but rows written before that hold a bare
 * S3 key ("uploads/1699_photo.png"), which a browser resolves against whatever
 * page it is rendered on. Values that are already absolute pass through, as does
 * everything when there is no CDN base configured — degrading to the previous
 * behaviour is better than emitting a confidently wrong URL.
 */
export function resolveImageUrl(
  imageUrl: string | null | undefined,
  cdnBaseUrl: string,
): string | null {
  if (!imageUrl) return null;
  if (/^(?:https?:)?\/\//i.test(imageUrl) || imageUrl.startsWith("data:")) {
    return imageUrl;
  }
  if (!cdnBaseUrl) return imageUrl;
  return buildS3Url(cdnBaseUrl, imageUrl.replace(/^\/+/, ""));
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
