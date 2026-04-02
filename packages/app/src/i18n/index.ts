import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE } from "@cityroam/shared/constants";
import en from "./en.json";

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

export default i18n;
