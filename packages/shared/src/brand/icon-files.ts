import { OWL_ICON_COLORS, owlIconSvg } from "./owl.js";

/** Static favicon files generated from the owl, relative to packages/. */
export const ICON_FILES = ["marketing/src/app/icon.svg", "app/public/favicon.svg"] as const;

/** What every file in ICON_FILES must contain. */
export function iconFileContents(): string {
  return owlIconSvg({ ...OWL_ICON_COLORS, size: 64 });
}
