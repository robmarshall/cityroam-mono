"use client";

import { useSeenOnce } from "@/lib/useSeenOnce";

/**
 * A hand-drawn schematic of the Leeds loop. It is deliberately not a real
 * map: the shape is only roughly the city centre, the stops are unlabelled
 * dots and only the start is named, so it shows the size of the walk without
 * giving away a single answer. Keep it that way if you redraw it.
 *
 * The route draws itself once when it scrolls into view (see `.draw` in
 * globals.css); with reduced motion it is simply there.
 */

/** The loop, on a 480×360 grid. Clockwise from the start. */
const ROUTE =
  "M150 92 H318 Q342 92 342 116 V200 Q342 222 362 234 L396 254 Q414 265 407 280 Q400 294 380 294 H238 Q214 294 214 270 V152 Q214 128 190 128 H120 Q96 128 96 110 Q96 92 118 92 Z";

const START = { x: 150, y: 92 };

/** Answer stops, unlabelled on purpose. The delay staggers them after the line. */
const STOPS = [
  { x: 282, y: 92, delay: 700 },
  { x: 342, y: 176, delay: 1000 },
  { x: 300, y: 294, delay: 1300 },
  { x: 214, y: 208, delay: 1600 },
];

/** Background streets, to suggest a city without mapping it. */
const STREETS = [
  "M20 92 H460",
  "M20 128 H200",
  "M20 210 H460",
  "M20 294 H460",
  "M96 20 V340",
  "M214 20 V340",
  "M342 20 V340",
  "M250 20 L470 250",
  "M40 340 L180 180",
];

/** A river along the bottom. */
const RIVER = "M0 330 C80 312 140 346 220 330 S360 310 480 326";

/**
 * Windows onto the sketch for the backdrop, so neighbouring placeholders show
 * different stretches of the line rather than the same picture three times.
 */
const CROPS = {
  full: "0 0 480 360",
  north: "60 40 280 210",
  east: "200 80 280 210",
  south: "120 150 280 210",
} as const;

export function LineMap({
  label,
  startLabel,
  variant = "map",
  crop = "full",
  className = "",
}: {
  /** Accessible description of the map (the "map" variant only). */
  label?: string;
  /** "Start", localised. The only text on the map. */
  startLabel?: string;
  /**
   * "map" is the route-at-a-glance drawing. "backdrop" is the quiet version
   * behind a photo placeholder: no text, lighter, no animation, and it
   * crops to fill its box.
   */
  variant?: "map" | "backdrop";
  /** Backdrop only: which part of the sketch fills the box. */
  crop?: keyof typeof CROPS;
  className?: string;
}) {
  const [ref, seen] = useSeenOnce<SVGSVGElement>(0.4);
  const backdrop = variant === "backdrop";

  const a11y =
    !backdrop && label
      ? ({ role: "img", "aria-label": label } as const)
      : ({ "aria-hidden": true, focusable: "false" } as const);

  return (
    <svg
      ref={ref}
      viewBox={backdrop ? CROPS[crop] : CROPS.full}
      preserveAspectRatio={backdrop ? "xMidYMid slice" : "xMidYMid meet"}
      data-seen={backdrop || seen ? "" : undefined}
      className={`${backdrop ? "" : "draw"} block h-full w-full ${className}`}
      {...a11y}
    >
      {!backdrop && label && <title>{label}</title>}

      <g
        fill="none"
        className="stroke-stone-300"
        strokeWidth={backdrop ? 1.5 : 1.25}
        vectorEffect={backdrop ? "non-scaling-stroke" : undefined}
      >
        {STREETS.map((d) => (
          <path key={d} d={d} vectorEffect={backdrop ? "non-scaling-stroke" : undefined} />
        ))}
      </g>

      <path
        d={RIVER}
        fill="none"
        className="stroke-ink-500"
        strokeOpacity={backdrop ? 0.18 : 0.25}
        strokeWidth={10}
        strokeLinecap="round"
      />

      {/* North arrow, the way a guidebook would draw it. */}
      {!backdrop && (
        <g transform="translate(44 44)" className="stroke-ink-700" strokeWidth={1.5} fill="none">
          <path d="M0 14 L0 -14 M-6 -6 L0 -14 L6 -6" strokeLinecap="round" strokeLinejoin="round" />
          <text
            x={0}
            y={32}
            textAnchor="middle"
            className="fill-ink-700 font-sans"
            stroke="none"
            fontSize={14}
            fontWeight={600}
          >
            N
          </text>
        </g>
      )}

      <path
        d={ROUTE}
        pathLength={backdrop ? undefined : 1}
        className={`stroke-brick-500 ${backdrop ? "" : "draw-path"}`}
        fill="none"
        strokeOpacity={backdrop ? 0.55 : 1}
        strokeWidth={backdrop ? 3 : 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={backdrop ? undefined : 1}
        strokeDashoffset={backdrop ? undefined : 0}
        vectorEffect={backdrop ? "non-scaling-stroke" : undefined}
      />

      {STOPS.map((stop) => (
        <circle
          key={`${stop.x}-${stop.y}`}
          cx={stop.x}
          cy={stop.y}
          r={backdrop ? 5 : 7}
          className="draw-dot fill-stone-50 stroke-ink-900"
          style={{ "--dot-delay": `${stop.delay}ms` } as React.CSSProperties}
          strokeOpacity={backdrop ? 0.5 : 1}
          strokeWidth={backdrop ? 2 : 2.75}
        />
      ))}

      {/* The start, the one labelled point. */}
      <circle
        cx={START.x}
        cy={START.y}
        r={backdrop ? 7 : 10}
        className="fill-brick-500 stroke-stone-50"
        fillOpacity={backdrop ? 0.7 : 1}
        strokeWidth={3}
      />
      {!backdrop && startLabel && (
        <text
          x={START.x}
          y={START.y - 20}
          textAnchor="middle"
          className="fill-ink-900 font-sans"
          fontSize={18}
          fontWeight={600}
        >
          {startLabel}
        </text>
      )}
    </svg>
  );
}
