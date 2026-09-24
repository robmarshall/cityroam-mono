"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CTAButton, type CheckoutSegment } from "@/components/CTAButton";
import { formatGBP, PRICE_GBP } from "@/lib/site";

/**
 * A "Book · £29" bar pinned to the bottom of the screen on phones.
 *
 * It appears once the first booking button on the page (the hero one) has
 * scrolled off the top, and hides again whenever any other booking button or
 * booking section (`[data-book-cta]`) is on screen, so there are never two
 * "Book" buttons in view. It goes through the same CTAButton checkout as the
 * rest of the page, with the page's segment.
 *
 * Render it once, at the end of <main>: it also leaves a spacer so the bar
 * never covers the last of the page.
 */
export function StickyBookBar({
  segment = "general",
  location,
}: {
  segment?: CheckoutSegment;
  location: string;
}) {
  const t = useTranslations("cta");
  const [visible, setVisible] = useState(false);
  // Never hide the bar from under a keyboard user who is focused inside it.
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-book-cta]"));
    const first = targets[0];
    if (!first || typeof IntersectionObserver === "undefined") return;

    const onScreen = new Set<Element>();
    let pastFirst = false;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
        if (entry.target === first) {
          pastFirst = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        }
      }
      setVisible(pastFirst && onScreen.size === 0);
    });

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const show = visible || hasFocus;

  return (
    <>
      {/* Keeps the footer clear of the bar. Same height as the bar. */}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))] sm:hidden" />
      <div
        onFocus={() => setHasFocus(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHasFocus(false);
        }}
        // `invisible` (visibility: hidden) takes the hidden bar out of the tab
        // order and the accessibility tree, not just off screen.
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur transition-[transform,visibility] duration-200 motion-reduce:transition-none sm:hidden ${
          show ? "visible translate-y-0" : "invisible translate-y-full"
        }`}
      >
        <CTAButton
          location={location}
          segment={segment}
          label={t("sticky", { price: formatGBP(PRICE_GBP) })}
          fullWidth
          sticky
        />
      </div>
    </>
  );
}
