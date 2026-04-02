import { ApiError } from "./api";
import {
  MIN_DISPLAY_NAME_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
} from "@cityroam/shared/constants";

/**
 * Maps validation error codes from Zod schemas to user-facing messages.
 * When i18n lands (Phase 3), these will be replaced with translation keys.
 */
const VALIDATION_MESSAGES: Record<string, string> = {
  DISPLAY_NAME_TOO_SHORT: `Display name must be at least ${MIN_DISPLAY_NAME_LENGTH} characters`,
  DISPLAY_NAME_TOO_LONG: `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`,
  DISPLAY_NAME_HTML: "Display name must not contain HTML tags",
  DISPLAY_NAME_INVALID_CHARS:
    "Display name may only contain letters, numbers, spaces, hyphens, and apostrophes",
  MESSAGE_TOO_SHORT: `Message must be at least ${MIN_MESSAGE_LENGTH} characters`,
  MESSAGE_TOO_LONG: `Message must be at most ${MAX_MESSAGE_LENGTH} characters`,
  MESSAGE_EMPTY: "Message must not be empty",
  EVENT_CODE_INVALID: "Invalid event code format",
  ACTION_LEAD_ONLY: "Only the group lead can confirm actions",
  ACTION_MISSING_BLOCK: "Missing action reference — please try again",
  ACTION_BLOCK_MISMATCH: "This action is no longer current",
  INVALID_JSON: "Message could not be sent — please try again",
  UNKNOWN_MESSAGE_TYPE: "Unsupported message type",
};

export function validationMessage(code: string): string {
  return VALIDATION_MESSAGES[code] ?? code;
}

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "EVENT_NOT_FOUND":
        return "This event doesn't exist. Check the link and try again.";
      case "EVENT_FULL":
        return "This event is full — no more spaces available.";
      case "EVENT_EXPIRED":
        return "This event has expired.";
      case "EVENT_COMPLETED":
        return "This event has already finished.";
      case "EVENT_REFUNDED":
        return "This event has been refunded.";
      case "INVALID_INPUT":
        return "That doesn't look like a valid event code. Double-check the link or code you were given.";
      default:
        if (err.status === 404) {
          return "This event doesn't exist. Check the link and try again.";
        }
        return err.message;
    }
  }
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return "Couldn't connect. Check your signal and try again.";
  }
  return "Something went wrong. Please try again.";
}
