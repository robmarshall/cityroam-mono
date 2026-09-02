import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { BRAND, SITE_NAME, siteUrl } from "./site";

/** Shared dimensions for the Open Graph and Twitter card images. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const displayHost = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

/**
 * Renders the share card. No binary asset is committed: the card is drawn from
 * the brand colours and the localised tagline at build time.
 */
export async function renderShareImage(locale: string) {
  const t = await getTranslations({ locale, namespace: "metadata" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: BRAND.blue600,
          backgroundImage: `linear-gradient(135deg, ${BRAND.blue500} 0%, ${BRAND.blue900} 100%)`,
          color: BRAND.white,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "88px",
              height: "88px",
              borderRadius: "24px",
              backgroundColor: BRAND.white,
              color: BRAND.blue500,
              fontSize: "48px",
              fontWeight: 700,
            }}
          >
            CR
          </div>
          <div style={{ display: "flex", fontSize: "36px", opacity: 0.9 }}>
            {displayHost}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "104px", fontWeight: 700, letterSpacing: "-2px" }}>
            {SITE_NAME}
          </div>
          <div style={{ display: "flex", marginTop: "24px", fontSize: "46px", lineHeight: 1.3, opacity: 0.92 }}>
            {t("og.tagline")}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

/** 180x180 rounded app icon used for `apple-icon`. */
export function renderAppIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BRAND.blue500,
          color: BRAND.white,
          fontSize: Math.round(size * 0.42),
          fontWeight: 700,
          fontFamily: "sans-serif",
          letterSpacing: "-2px",
        }}
      >
        CR
      </div>
    ),
    { width: size, height: size },
  );
}
