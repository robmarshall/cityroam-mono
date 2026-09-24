"use client";

import { useTranslations } from "next-intl";
import { OwlMark } from "@/components/OwlMark";
import { useSeenOnce } from "@/lib/useSeenOnce";

/**
 * A note in the margin from the Owl: a short, dry line about the city, signed
 * with the owl mark. It looks like one of the guide's chat bubbles (squared
 * corner towards what it's talking about) so the page reads like the game.
 *
 * Positioning: with `at`, the note is placed absolutely inside its nearest
 * positioned parent from the md breakpoint up, by percentages, so it stays
 * put on any photo crop. Below md it sits in the flow, or is dropped with
 * `hideBelowMd` where there's no room.
 *
 * It rises into place once, when first scrolled into view (`.reveal` in
 * globals.css). With reduced motion it is static.
 *
 * Copy rules: the Owl's voice (dry, no exclamation marks, no owl puns), true,
 * and never an answer on the route. See docs/llm-authoring/guide-personality.md.
 */
export function Annotation({
  text,
  at,
  tail = "bottom-left",
  delay = 0,
  hideBelowMd = false,
  className = "",
}: {
  text: string;
  /**
   * Where the note sits from md up, in percent of its positioned parent: `x`
   * from the left edge (or from the right edge with `fromRight`), `y` from
   * the top. Negative values let it hang over the edge like a margin note.
   */
  at?: { x: number; y: number; fromRight?: boolean };
  /** Which corner is squared off, pointing at the subject. */
  tail?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Extra delay before it rises, in ms, to stagger several notes. */
  delay?: number;
  hideBelowMd?: boolean;
  className?: string;
}) {
  const t = useTranslations("chatDemo");
  const [ref, seen] = useSeenOnce<HTMLDivElement>(0.6);

  const corner = {
    "top-left": "rounded-tl-sm",
    "top-right": "rounded-tr-sm",
    "bottom-left": "rounded-bl-sm",
    "bottom-right": "rounded-br-sm",
  }[tail];

  const position = at
    ? `md:absolute md:top-(--note-y) md:z-10 md:m-0 ${at.fromRight ? "md:right-(--note-x)" : "md:left-(--note-x)"}`
    : "";
  const style = {
    "--reveal-delay": `${delay}ms`,
    ...(at ? { "--note-x": `${at.x}%`, "--note-y": `${at.y}%` } : {}),
  } as React.CSSProperties;

  return (
    <div
      role="note"
      ref={ref}
      data-seen={seen ? "" : undefined}
      style={style}
      className={`reveal relative ${hideBelowMd ? "hidden md:block" : "block"} ${position} w-full max-w-[15rem] rounded-2xl ${corner} bg-white px-4 py-3 text-left shadow-[0_8px_24px_-8px_rgba(20,33,61,0.25)] ring-1 ring-stone-200 ${className}`}
    >
      <p className="font-display text-[1.0625rem] leading-snug text-ink-900">{text}</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-500">
        <OwlMark size={16} />
        <span>{t("guideLabel")}</span>
      </p>
    </div>
  );
}
