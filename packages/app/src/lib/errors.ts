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

export function validationMessage(code: string): string {
  const key = `validation.${code}`;
  if (i18n.exists(key)) {
    return i18n.t(key, VALIDATION_INTERPOLATION[code]);
  }
  return code;
}

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "EVENT_NOT_FOUND":
        return i18n.t("error.eventNotFound");
      case "EVENT_FULL":
        return i18n.t("error.eventFull");
      case "EVENT_EXPIRED":
        return i18n.t("error.eventExpired");
      case "EVENT_COMPLETED":
        return i18n.t("error.eventCompleted");
      case "EVENT_REFUNDED":
        return i18n.t("error.eventRefunded");
      case "INVALID_INPUT":
        return i18n.t("error.invalidInput");
      default:
        if (err.status === 404) {
          return i18n.t("error.eventNotFound");
        }
        return err.message;
    }
  }
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return i18n.t("error.networkError");
  }
  return i18n.t("error.generic");
}
