import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { OWL_ICON_COLORS, owlIconSvg, owlStrokeWidth, owlSvg } from "@cityroam/shared/brand";
import { BRAND, SITE_NAME, siteUrl } from "./site";

/** Shared dimensions for the Open Graph and Twitter card images. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * Static TTFs for Satori (it can't read woff2 or variable fonts), subset to
 * the Google Fonts "latin" range, which covers every accent our five locales
 * use. Fraunces 72pt SemiBold is from the upstream 1.000 release
 * (undercasetype/Fraunces), Inter Regular and SemiBold from rsms/inter v4.1.
 * Both are OFL 1.1 with no reserved font name; the licences sit next to them
 * in assets/fonts/. next.config.ts traces the folder into the server and
 * standalone output.
 */
const DISPLAY = "Fraunces";
const BODY = "Inter";
const FONT_FILES = [
  { name: DISPLAY, file: "Fraunces-SemiBold-latin.ttf", weight: 600 },
  { name: BODY, file: "Inter-Regular-latin.ttf", weight: 400 },
  { name: BODY, file: "Inter-SemiBold-latin.ttf", weight: 600 },
] as const;

let fontData: Promise<Buffer[]> | undefined;

async function ogFonts() {
  fontData ??= Promise.all(
    FONT_FILES.map(({ file }) => readFile(join(process.cwd(), "assets/fonts", file))),
  );
  const data = await fontData;
  return FONT_FILES.map(({ name, weight }, i) => ({
    name,
    data: data[i],
    style: "normal" as const,
    weight,
  }));
}

/** The owl as an <img> source: Satori draws SVG images reliably. */
function owlDataUrl(color: string, size: number, strokeWidth?: number) {
  return `data:image/svg+xml;base64,${Buffer.from(owlSvg({ size, color, strokeWidth })).toString("base64")}`;
}

const displayHost = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

/**
 * Renders the share card: stone paper, the owl and the navy wordmark, a brick
 * rule and the localised tagline in Fraunces. No binary asset is committed;
 * it is drawn at build time.
 */
export async function renderShareImage(locale: string) {
  const [t, fonts] = await Promise.all([
    getTranslations({ locale, namespace: "metadata" }),
    ogFonts(),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: BRAND.stone50,
          color: BRAND.ink900,
          fontFamily: BODY,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <img src={owlDataUrl(BRAND.ink900, 72)} width={72} height={72} alt="" />
          <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 600, fontSize: "52px", letterSpacing: "-1px" }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: "120px", height: "8px", backgroundColor: BRAND.brick500 }} />
          <div
            style={{
              display: "flex",
              marginTop: "36px",
              maxWidth: "1000px",
              fontFamily: DISPLAY,
              fontWeight: 600,
              fontSize: "84px",
              lineHeight: 1.08,
              letterSpacing: "-2px",
            }}
          >
            {t("og.tagline")}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: "30px", color: BRAND.muted }}>{displayHost}</div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

/**
 * Square app icon used for `apple-icon`: the same drawing as the favicon
 * (owlIconSvg, navy owl on stone), full bleed because iOS rounds it. At
 * this size it takes the header's regular stroke weight.
 */
export async function renderAppIcon(size: number) {
  const icon = owlIconSvg({ ...OWL_ICON_COLORS, size, radius: 0, strokeWidth: owlStrokeWidth(size) });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}`}
          width={size}
          height={size}
          alt=""
        />
      </div>
    ),
    { width: size, height: size },
  );
}
