import { locales } from "@/i18n/config";
import { renderAppIcon } from "@/lib/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default function AppleIcon() {
  return renderAppIcon(size.width);
}
