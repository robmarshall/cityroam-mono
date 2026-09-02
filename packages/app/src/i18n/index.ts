import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE } from "@cityroam/shared/constants";
import en from "./en.json";

// Only the default language ships in the entry bundle. The other catalogues are
// fetched on demand, so a player never downloads four translations they will
// not read.
const LAZY_TRANSLATIONS: Record<string, () => Promise<{ default: object }>> = {
  es: () => import("./es.json"),
  fr: () => import("./fr.json"),
  de: () => import("./de.json"),
  nl: () => import("./nl.json"),
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

/**
 * Switch language, loading its catalogue first so the UI never renders a half
 * translated screen. Falls back to leaving the current language in place if the
 * catalogue cannot be fetched.
 */
export async function setLanguage(language: string): Promise<void> {
  if (language === i18n.language) return;

  const load = LAZY_TRANSLATIONS[language];
  if (load && !i18n.hasResourceBundle(language, "translation")) {
    try {
      const module = await load();
      i18n.addResourceBundle(language, "translation", module.default);
    } catch {
      return;
    }
  }

  await i18n.changeLanguage(language);
}

export default i18n;
