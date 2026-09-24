"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True once the element has scrolled into view, and it stays true: the
 * annotations and the line map animate a single time, never on every pass.
 *
 * The "hidden until seen" styling lives in globals.css (`.reveal`, `.draw`)
 * and only applies with motion allowed and scripting on, so with reduced
 * motion, no JavaScript or no IntersectionObserver everything is simply there.
 */
export function useSeenOnce<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen, threshold]);

  return [ref, seen] as const;
}
