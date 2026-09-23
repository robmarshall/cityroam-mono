import i18n from "i18next";
import { ApiError } from "./api";
import {
  MIN_DISPLAY_NAME_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
} from "@cityroam/shared/constants";

/**
 * Maps validation error codes from Zod schemas to user-facing messages
 * using i18next translation keys.
 */
const VALIDATION_INTERPOLATION: Record<string, Record<string, unknown>> = {
  DISPLAY_NAME_TOO_SHORT: { min: MIN_DISPLAY_NAME_LENGTH },
  DISPLAY_NAME_TOO_LONG: { max: MAX_DISPLAY_NAME_LENGTH },
  MESSAGE_TOO_SHORT: { min: MIN_MESSAGE_LENGTH },
  MESSAGE_TOO_LONG: { max: MAX_MESSAGE_LENGTH },
};

/**
 * Maps API error codes to i18next translation keys.
 * Any code with a matching `error.<camelCase>` key will be translated;
 * unrecognised codes fall back to the generic error message.
 */
const ERROR_CODE_KEYS: Record<string, string> = {
  EVENT_NOT_FOUND: "error.eventNotFound",
  EVENT_FULL: "error.eventFull",
  EVENT_EXPIRED: "error.eventExpired",
  EVENT_COMPLETED: "error.eventCompleted",
  EVENT_REFUNDED: "error.eventRefunded",
  INVALID_INPUT: "error.invalidInput",
  RATE_LIMITED: "error.rateLimited",
  UNAUTHORIZED: "error.unauthorized",
  INTERNAL_ERROR: "error.serverError",
};

export function validationMessage(code: string): string {
  const key = `validation.${code}`;
  if (i18n.exists(key)) {
    return i18n.t(key, VALIDATION_INTERPOLATION[code]);
  }
  // Code may also be a known API error code (e.g. WS errors reuse them)
  const errorKey = ERROR_CODE_KEYS[code];
  if (errorKey) {
    return i18n.t(errorKey);
  }
  return i18n.t("error.generic");
}

export interface FriendlyErrorOptions {
  /**
   * Per-call-site overrides of API code to i18n key. The same API code can
   * mean different things on different endpoints (e.g. a 403 UNAUTHORIZED on
   * /start means "lead only", not "session expired"). A key of the form
   * `CODE:STATUS` matches only that status and wins over a bare `CODE`.
   */
  codes?: Record<string, string>;
  /** i18n key used instead of `error.generic` when nothing more specific matches. */
  fallback?: string;
}

/**
 * Turns any thrown value into a translated, user-facing message. Never
 * returns the raw server message, which is English and written for developers.
 */
export function friendlyError(err: unknown, options: FriendlyErrorOptions = {}): string {
  const { codes = {}, fallback = "error.generic" } = options;

  if (err instanceof ApiError) {
    if (err.code) {
      // Zod failures come back as INVALID_INPUT with the schema's message code
      // (e.g. DISPLAY_NAME_TOO_SHORT) as the error text.
      if (err.code === "INVALID_INPUT" && i18n.exists(`validation.${err.message}`)) {
        return validationMessage(err.message);
      }
      const override = codes[`${err.code}:${err.status}`] ?? codes[err.code];
      if (override) {
        return i18n.t(override);
      }
      const key = ERROR_CODE_KEYS[err.code];
      if (key) {
        return i18n.t(key);
      }
    }
    if (err.status === 404) {
      return i18n.t("error.eventNotFound");
    }
    return i18n.t(fallback);
  }
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return i18n.t("error.networkError");
  }
  return i18n.t(fallback);
}
