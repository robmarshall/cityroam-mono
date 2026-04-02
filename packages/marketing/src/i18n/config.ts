import type { SupportedLanguage } from "@cityroam/shared/types";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from "@cityroam/shared/constants";

export const locales: readonly SupportedLanguage[] = SUPPORTED_LANGUAGES;
export const defaultLocale: SupportedLanguage = DEFAULT_LANGUAGE;
