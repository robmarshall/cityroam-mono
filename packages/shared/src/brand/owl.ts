/**
 * The Owl: City Roam's mark, and the face of the guide.
 *
 * Framework-free so the marketing site, the player app, the OG image renderer
 * and static icons can all draw the same shape. It is a monoline drawing on a
 * 24-unit grid: a flat-crowned head with short outward ear tufts, two round
 * eyes that just meet in the middle, and a small V beak. Deliberately not the
 * heraldic Leeds owls (no crown, no standing pose) and not a mascot (no
 * pupils, no feet, no expression). See docs/plans/brand-direction-a.md.
 *
 * Draw it as strokes, never fills: `fill="none"`, `stroke="currentColor"`,
 * round caps and joins, with the stroke width from OWL_STROKE.
 */

export const OWL_VIEWBOX = "0 0 24 24" as const;

/** Grid size the path data is drawn on. */
export const OWL_GRID = 24 as const;

/**
 * Stroke widths in grid units. Below ~24px a 1.5 stroke falls under a device
 * pixel and the eyes fill in, so small renders use the heavier weight.
 */
export const OWL_STROKE = {
  regular: 1.5,
  small: 2,
  /** Rendered sizes at or under this many CSS pixels use `small`. */
  smallMaxPx: 24,
} as const;

export function owlStrokeWidth(sizePx: number): number {
  return sizePx <= OWL_STROKE.smallMaxPx ? OWL_STROKE.small : OWL_STROKE.regular;
}

/** Each part as SVG path data, in drawing order. */
export const OWL_PARTS = {
  /** Head: flat crown, ear tufts at the outer corners, rounded chin. */
  head: "M4.5 4.5L7.25 6.75H16.75L19.5 4.5V12.5C19.5 17.4 16.2 21 12 21C7.8 21 4.5 17.4 4.5 12.5Z",
  /** Left eye, a circle r=2.75 at (9.25, 11.25). */
  eyeLeft: "M6.5 11.25a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0 -5.5 0",
  /** Right eye, a circle r=2.75 at (14.75, 11.25); it meets the left one. */
  eyeRight: "M12 11.25a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0 -5.5 0",
  beak: "M11.1 15.4L12 16.5L12.9 15.4",
} as const;

/** All parts in one path, for renderers that want a single element. */
export const OWL_PATH = Object.values(OWL_PARTS).join(" ");

export type OwlSvgOptions = {
  /** Rendered width and height in px. Omit for a scalable SVG. */
  size?: number;
  /** Stroke colour. Defaults to currentColor. */
  color?: string;
  /** Stroke width in grid units. Defaults to owlStrokeWidth(size ?? 48). */
  strokeWidth?: number;
  /** Accessible name. Without one the SVG is marked decorative. */
  title?: string;
};

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The owl as a standalone SVG string (for data URLs, Satori images and static
 * icon files). React code should use the marketing `OwlMark` component.
 */
export function owlSvg({ size, color = "currentColor", strokeWidth, title }: OwlSvgOptions = {}): string {
  const sw = strokeWidth ?? owlStrokeWidth(size ?? 48);
  const dims = size ? ` width="${size}" height="${size}"` : "";
  const a11y = title ? ` role="img" aria-label="${escapeXml(title)}"` : ` aria-hidden="true"`;
  const titleEl = title ? `<title>${escapeXml(title)}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${OWL_VIEWBOX}"${dims}${a11y} fill="none" ` +
    `stroke="${escapeXml(color)}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">` +
    `${titleEl}<path d="${OWL_PATH}"/></svg>`
  );
}
