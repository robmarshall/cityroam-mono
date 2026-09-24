import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Messages come from two files per locale: the main one and
 * messages/gift/<locale>.json, which holds only the `gift` namespace (the
 * voucher pages and the gift line). They are kept apart so the gift copy can
 * change without touching the main files; the key-parity tests cover both.
 */
export async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const [main, gift] = await Promise.all([
    import(`../../messages/${locale}.json`),
    import(`../../messages/gift/${locale}.json`),
  ]);
  return { ...main.default, ...gift.default };
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validate that the incoming locale is supported
  if (!locale || !routing.locales.includes(locale as typeof routing.locales[number])) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
