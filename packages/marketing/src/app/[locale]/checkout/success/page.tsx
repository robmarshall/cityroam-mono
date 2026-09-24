"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type { CheckoutSuccessResponse } from "@cityroam/shared/types";
import { Annotation } from "@/components/Annotation";
import { OwlMark } from "@/components/OwlMark";
import { trackEvent } from "@/lib/analytics";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 30000;

type Status = "loading" | "success" | "error";

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[70vh] items-center justify-center bg-stone-50 px-6 py-20 sm:py-24">
          <div className="mx-auto w-full max-w-xl text-center">
            <LoadingState />
          </div>
        </main>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [status, setStatus] = useState<Status>("loading");
  const [eventCode, setEventCode] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const t = useTranslations("checkout");

  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const startTime = useRef<number>(0);

  const fetchEvent = useCallback(async () => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    try {
      const res = await fetch(
        `${API_URL}/checkout/success?session_id=${encodeURIComponent(sessionId)}`,
      );

      if (!res.ok) {
        throw new Error("Event not found");
      }

      const data: CheckoutSuccessResponse = await res.json();
      setEventCode(data.event_code);
      setEventUrl(data.event_url);
      setStatus("success");
      trackEvent(POSTHOG_EVENTS.CHECKOUT_COMPLETED, {
        event_code: data.event_code,
      });
    } catch {
      const elapsed = Date.now() - startTime.current;
      if (elapsed < MAX_POLL_DURATION_MS) {
        pollTimer.current = setTimeout(fetchEvent, POLL_INTERVAL_MS);
      } else {
        setStatus("error");
      }
    }
  }, [sessionId]);

  const handleRetry = useCallback(() => {
    setStatus("loading");
    startTime.current = Date.now();
    fetchEvent();
  }, [fetchEvent]);

  useEffect(() => {
    startTime.current = Date.now();
    fetchEvent();
    return () => clearTimeout(pollTimer.current);
  }, [fetchEvent]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(eventUrl);
      setCopied(true);
      trackEvent(POSTHOG_EVENTS.EVENT_LINK_COPIED, { event_code: eventCode });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select input text
    }
  }, [eventUrl, eventCode]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: t("success.shareTitle"),
      url: eventUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        trackEvent(POSTHOG_EVENTS.EVENT_LINK_SHARED, {
          event_code: eventCode,
          share_method: "native",
        });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(eventUrl);
      setCopied(true);
      trackEvent(POSTHOG_EVENTS.EVENT_LINK_SHARED, {
        event_code: eventCode,
        share_method: "clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Final fallback: select the URL input so the user can copy manually
      const input = document.querySelector<HTMLInputElement>("input[readonly]");
      if (input) {
        input.select();
      }
    }
  }, [eventUrl, eventCode, t]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-stone-50 px-6 py-20 sm:py-24">
      <div className="mx-auto w-full max-w-xl text-center">
        {status === "loading" && <LoadingState />}
        {status === "error" && <ErrorState onRetry={handleRetry} />}
        {status === "success" && (
          <SuccessState
            eventUrl={eventUrl}
            copied={copied}
            onCopy={handleCopy}
            onShare={handleShare}
          />
        )}
      </div>
    </main>
  );
}

function LoadingState() {
  const t = useTranslations("checkout");
  return (
    <div role="status">
      <div
        aria-hidden="true"
        className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-brick-500 motion-reduce:animate-none"
      />
      <p className="mt-6 text-lg text-muted">{t("loading")}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("checkout");
  return (
    <>
      <h1 className="font-display text-2xl font-semibold text-ink-900" role="alert">
        {t("error.title")}
      </h1>
      <p className="mt-4 text-muted leading-relaxed">{t("error.description")}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-button bg-brick-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-brick-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
          {t("error.tryAgain")}
        </button>
        <Link
          href="/"
          className="rounded-button px-6 py-3 font-semibold text-ink-900 ring-2 ring-inset ring-ink-900 transition-colors hover:bg-ink-900 hover:text-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
          {t("error.backHome")}
        </Link>
      </div>
    </>
  );
}

function SuccessState({
  eventUrl,
  copied,
  onCopy,
  onShare,
}: {
  eventUrl: string;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
}) {
  const t = useTranslations("checkout");
  return (
    <>
      <OwlMark size={44} className="mx-auto text-ink-900" />
      <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-balance text-ink-900 sm:text-5xl">
        {t("success.title")}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-700">{t("success.subtitle")}</p>

      {/* The one job left: get the link to the group. */}
      <section
        aria-labelledby="forward-title"
        className="mt-10 rounded-card bg-white p-6 text-left ring-1 ring-stone-200 sm:p-8"
      >
        <h2 id="forward-title" className="font-display text-2xl font-semibold text-ink-900">
          {t("success.forwardTitle")}
        </h2>
        <p className="mt-2 leading-relaxed text-muted">{t("success.forwardText")}</p>

        <label htmlFor="event-link" className="mt-6 block text-sm font-medium text-ink-700">
          {t("success.eventLinkLabel")}
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="event-link"
            type="text"
            readOnly
            value={eventUrl}
            className="min-w-0 flex-1 rounded-button border border-stone-300 bg-stone-50 px-3 py-2.5 text-sm text-ink-900 select-all"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            type="button"
            onClick={onCopy}
            aria-live="polite"
            className="shrink-0 rounded-button px-4 py-2.5 text-sm font-semibold text-ink-900 ring-2 ring-inset ring-ink-900 transition-colors hover:bg-ink-900 hover:text-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          >
            {copied ? t("success.copied") : t("success.copy")}
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">{t("success.validity")}</p>

        <button
          type="button"
          onClick={onShare}
          className="mt-6 inline-flex w-full items-center justify-center rounded-button bg-brick-500 px-8 py-3.5 text-lg font-semibold text-white transition-colors hover:bg-brick-600 active:bg-brick-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) sm:w-auto"
        >
          {t("success.share")}
        </button>
      </section>

      <section aria-labelledby="next-title" className="mt-10 text-left">
        <h2 id="next-title" className="font-display text-2xl font-semibold text-ink-900">
          {t("success.whatsNext")}
        </h2>
        <ol className="mt-6 space-y-5">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-brick-500 font-display font-semibold text-brick-600"
              >
                {i + 1}
              </span>
              <p className="pt-1 leading-relaxed text-ink-700">{t(`success.steps.${i}`)}</p>
            </li>
          ))}
        </ol>
        <Annotation text={t("success.note")} tail="top-left" className="mt-8 ml-12" />
      </section>

      <div className="mt-12 space-y-3 border-t border-stone-200 pt-8 text-sm text-muted">
        <p>
          {t("success.giftText")}{" "}
          <Link href="/gift" className="font-medium text-brick-600 underline underline-offset-2 hover:text-ink-900">
            {t("success.giftLink")}
          </Link>
        </p>
        <p>
          {t("success.refundNote")}{" "}
          <Link href="/refunds" className="font-medium text-brick-600 underline underline-offset-2 hover:text-ink-900">
            {t("success.refundLink")}
          </Link>
        </p>
      </div>
    </>
  );
}
