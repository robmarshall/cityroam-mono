import { OWL_PARTS, OWL_VIEWBOX, owlStrokeWidth } from "@cityroam/shared/brand";

/**
 * The City Roam owl (packages/shared/src/brand/owl.ts), drawn in currentColor
 * so it takes the colour of the text around it.
 *
 * Decorative by default (hidden from assistive tech), because it usually sits
 * next to the "City Roam" wordmark or the guide's name. Pass `label` when the
 * owl stands alone and has to say something.
 */
export function OwlMark({
  size = 24,
  label,
  strokeWidth,
  className = "",
}: {
  /** Width and height in CSS pixels. Also picks the stroke weight. */
  size?: number;
  /** Accessible name. Omit when the owl is decorative. */
  label?: string;
  /** Override the stroke weight (grid units). */
  strokeWidth?: number;
  className?: string;
}) {
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true, focusable: "false" } as const);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={OWL_VIEWBOX}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? owlStrokeWidth(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      {...a11y}
    >
      {label && <title>{label}</title>}
      {Object.values(OWL_PARTS).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
