"use client";

import { useEffect } from "react";
import { ensureInit, trackEvent } from "@/lib/analytics";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import { usePathname } from "next/navigation";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    ensureInit();
  }, []);

  useEffect(() => {
    trackEvent(POSTHOG_EVENTS.PAGE_VIEWED, {
      page: pathname,
      referrer: typeof document !== "undefined" ? document.referrer : "",
    });
  }, [pathname]);

  return <>{children}</>;
}
