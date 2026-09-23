"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the root layout. Reports to Sentry
 * (a no-op when it is not configured) and renders a bare fallback page.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1rem", textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>Please refresh the page, or email hello@cityroam.co.uk if it keeps happening.</p>
      </body>
    </html>
  );
}
