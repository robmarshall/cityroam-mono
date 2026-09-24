import type { StaticImageData } from "next/image";
import type { SupportedLanguage } from "@cityroam/shared/types";

/**
 * Photo manifest: one entry per photo slot on the site. A null slot renders a
 * PhotoSlot placeholder (stone panel, line map, owl), so the layout is final
 * before the photos exist.
 *
 * To add a photo: drop the JPEGs into src/images/photos/ (see the README
 * there for names and sizes), import them below and replace the slot's null
 * with an entry, for example
 *
 *   homeHero: { desktop: homeHeroWide, mobile: homeHeroTall, focal: { x: 50, y: 35 }, alt: { en: "…", es: "…", fr: "…", de: "…", nl: "…" } },
 *
 * Static imports give next/image the dimensions and a content hash, so the
 * responsive sizes are generated at build time.
 */
export type Photo = {
  /** Landscape crop, used from the md breakpoint up (16:9 for heroes). */
  desktop: StaticImageData;
  /** Portrait crop for phones (4:5 for heroes). Defaults to `desktop`. */
  mobile?: StaticImageData;
  /** Where the subject sits, in percent, so object-cover crops around it. */
  focal: { x: number; y: number };
  /**
   * Alt text in every locale. Describe what's in the frame, and never name
   * a stop on the route (see the spoiler rule in the shot list).
   */
  alt: Record<SupportedLanguage, string>;
};

/** Slot names, with the shot-list numbers they're waiting for. */
export type PhotoSlotName =
  /** M1: Victoria Quarter roof (M2 Thornton's Arcade or M12 blue hour as alternates). */
  | "homeHero"
  /** F1: a parent and two children reading the phone together. */
  | "families"
  /** H1: a hen group laughing over a phone, daytime. */
  | "henParties"
  /** T1: colleagues, two phones out, one reading a clue aloud. */
  | "teamBuilding";

export const PHOTOS: Record<PhotoSlotName, Photo | null> = {
  homeHero: null,
  families: null,
  henParties: null,
  teamBuilding: null,
};
