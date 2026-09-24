/**
 * The Owl: City Roam's mark, and the face of the guide.
 *
 * Framework-free so the marketing site, the player app, the OG image renderer
 * and the static icon files all draw the same shape. It sits on a 24-unit
 * grid: a rounded head with soft ear tufts, drawn as a single stroke, and a
 * filled face: two thin eye rings with pupils set slightly low and inwards
 * (calm, looking at you, not staring) and a small triangular beak.
 * Deliberately not the heraldic Leeds owls (no crown, no standing pose) and
 * not a mascot (no feet, no wings, no expression beyond the eyes). See
 * docs/plans/brand-direction-a.md.
 *
 * Two layers, both in one colour:
 * - OWL_STROKE_PATH: `fill="none"`, `stroke` in the colour, round caps and
 *   joins, stroke width from owlStrokeWidth().
 * - OWL_FILL_PATH: `fill` in the colour, `fill-rule="evenodd"` (the eye rings
 *   are two concentric circles), no stroke.
 *
 * Every rendering (OwlMark, OwlAvatar, the OG card, the apple icon and the
 * favicon files) goes through these paths; owlIconSvg() writes the favicons.
 */

export const OWL_VIEWBOX = "0 0 24 24" as const;

/** Grid size the path data is drawn on. */
export const OWL_GRID = 24 as const;

/**
 * Stroke widths in grid units for the head. Below ~24px a 1.5 stroke falls
 * under a device pixel, so small renders use the heavier weight.
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

/** A circle as path data (two arcs), for fills and evenodd rings. */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

/** Stroked parts, as SVG path data. */
export const OWL_STROKE_PARTS = {
  /** Head: soft ear tufts curving into a gently dipped crown, rounded chin. */
  head:
    "M5 4.75C6.2 5.9 7.6 6.5 9 6.6H15C16.4 6.5 17.8 5.9 19 4.75C19.4 6.5 19.75 9 19.75 12.25" +
    "C19.75 17.25 16.4 20.75 12 20.75C7.6 20.75 4.25 17.25 4.25 12.25C4.25 9 4.6 6.5 5 4.75Z",
} as const;

/** Filled parts (evenodd), as SVG path data. */
export const OWL_FILL_PARTS = {
  /** Eye rings: outer r=2.9, inner r=2.05, centred at (9, 11.5) and (15, 11.5). */
  eyeLeft: `${circle(9, 11.5, 2.9)} ${circle(9, 11.5, 2.05)}`,
  eyeRight: `${circle(15, 11.5, 2.9)} ${circle(15, 11.5, 2.05)}`,
  /** Pupils, r=1.35, a touch low and inwards so the owl looks at you calmly. */
  pupilLeft: circle(9.25, 11.75, 1.35),
  pupilRight: circle(14.75, 11.75, 1.35),
  /** A small downward triangle. */
  beak: "M10.9 15.1H13.1L12 16.75Z",
} as const;

/** All stroked parts in one path. */
export const OWL_STROKE_PATH = Object.values(OWL_STROKE_PARTS).join(" ");
/** All filled parts in one path (render with fill-rule="evenodd"). */
export const OWL_FILL_PATH = Object.values(OWL_FILL_PARTS).join(" ");

/**
 * The drawing spans y 4.75–20.75, so its centre sits this many grid units
 * below the viewBox centre. Icons lift it back by this much.
 */
export const OWL_OPTICAL_OFFSET_Y = 0.75;

export type OwlSvgOptions = {
  /** Rendered width and height in px. Omit for a scalable SVG. */
  size?: number;
  /** Colour of both layers. Defaults to currentColor. */
  color?: string;
  /** Head stroke width in grid units. Defaults to owlStrokeWidth(size ?? 48). */
  strokeWidth?: number;
  /** Accessible name. Without one the SVG is marked decorative. */
  title?: string;
};

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The two owl layers as SVG markup, for embedding in a larger SVG. */
function owlLayers(color: string, strokeWidth: number): string {
  const c = escapeXml(color);
  return (
    `<path d="${OWL_STROKE_PATH}" fill="none" stroke="${c}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${OWL_FILL_PATH}" fill="${c}" fill-rule="evenodd"/>`
  );
}

/**
 * The owl as a standalone SVG string (for data URLs and Satori images). React
 * code should use the marketing `OwlMark` or the app `OwlAvatar` component.
 */
export function owlSvg({ size, color = "currentColor", strokeWidth, title }: OwlSvgOptions = {}): string {
  const sw = strokeWidth ?? owlStrokeWidth(size ?? 48);
  const dims = size ? ` width="${size}" height="${size}"` : "";
  const a11y = title ? ` role="img" aria-label="${escapeXml(title)}"` : ` aria-hidden="true"`;
  const titleEl = title ? `<title>${escapeXml(title)}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${OWL_VIEWBOX}"${dims}${a11y}>` +
    `${titleEl}${owlLayers(color, sw)}</svg>`
  );
}

export type OwlIconOptions = {
  /** Square background colour. */
  background: string;
  /** Owl colour. */
  color: string;
  /** Rendered size in px (the SVG still scales). Defaults to 64. */
  size?: number;
  /** Corner radius as a fraction of the side; 0 for full bleed. Defaults to 0.22. */
  radius?: number;
  /** Accessible name. Defaults to "City Roam". */
  title?: string;
};

/**
 * The square app icon: the owl, centred optically, on a rounded square. The
 * marketing favicon (src/app/icon.svg) and the player app favicon
 * (public/favicon.svg) are this output written to disk by
 * `npm run icons -w @cityroam/shared`; icons.test.ts fails if either drifts.
 */
export function owlIconSvg({ background, color, size = 64, radius = 0.22, title = "City Roam" }: OwlIconOptions): string {
  const pad = 1.68; // 7% of the side
  const scale = (OWL_GRID - 2 * pad) / OWL_GRID;
  const dy = pad - scale * OWL_OPTICAL_OFFSET_Y;
  const rx = +(OWL_GRID * radius).toFixed(2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${OWL_VIEWBOX}" width="${size}" height="${size}" ` +
    `role="img" aria-label="${escapeXml(title)}">\n` +
    `  <!-- Generated from packages/shared/src/brand/owl.ts by \`npm run icons -w @cityroam/shared\`. Do not edit by hand. -->\n` +
    `  <rect width="${OWL_GRID}" height="${OWL_GRID}" rx="${rx}" fill="${escapeXml(background)}"/>\n` +
    `  <g transform="translate(${pad} ${+dy.toFixed(3)}) scale(${+scale.toFixed(4)})">${owlLayers(color, OWL_STROKE.small)}</g>\n` +
    `</svg>\n`
  );
}

/**
 * Icon colours: a navy owl on stone (stone-50 and ink-900), the same as the
 * site header. Written out rather than imported from ../tailwind/preset so
 * this file stays self-contained (the marketing build resolves the `./brand`
 * export on its own); owl.test.ts checks they match the preset.
 */
export const OWL_ICON_COLORS = {
  background: "#F5F1EA",
  color: "#14213D",
} as const;
