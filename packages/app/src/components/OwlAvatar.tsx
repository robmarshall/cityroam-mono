import { OWL_FILL_PATH, OWL_STROKE_PATH, OWL_VIEWBOX, owlStrokeWidth } from "@cityroam/shared/brand";

/**
 * The guide's avatar: the shared owl mark (packages/shared/src/brand/owl.ts),
 * drawn in the current text colour (a stroked head, a filled face). Decorative by default, since it
 * always sits next to the guide's name; pass `title` when it stands alone.
 */
export function OwlAvatar({
  size = 14,
  className,
  title,
}: {
  /** Rendered width and height in CSS pixels; also picks the stroke weight. */
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={OWL_VIEWBOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={owlStrokeWidth(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      {title && <title>{title}</title>}
      <path d={OWL_STROKE_PATH} />
      <path d={OWL_FILL_PATH} fill="currentColor" stroke="none" fillRule="evenodd" />
    </svg>
  );
}
