"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type { CheckoutSuccessResponse } from "@cityroam/shared/types";
import { trackEvent } from "@/lib/analytics";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 30000;

type Status = "loading" | "success" | "error";

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-white px-6 py-24">
          <div className="mx-auto w-full max-w-lg text-center">
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
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-24">
      <div className="mx-auto w-full max-w-lg text-center">
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
    <>
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      <p className="mt-6 text-lg text-gray-600">{t("loading")}</p>
    </>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("checkout");
  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900">{t("error.title")}</h1>
      <p className="mt-4 text-gray-600 leading-relaxed">{t("error.description")}</p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <button
          onClick={onRetry}
          className="rounded-button bg-brand-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-600"
        >
          {t("error.tryAgain")}
        </button>
        <Link
          href="/"
          className="rounded-button border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
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
      <h1 className="text-3xl font-bold text-gray-900">{t("success.title")}</h1>

      <div className="mt-8 rounded-card border border-gray-200 bg-gray-50 p-4">
        <label className="block text-sm font-medium text-gray-500">
          {t("success.eventLinkLabel")}
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={eventUrl}
            className="flex-1 rounded-button border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 select-all"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            onClick={onCopy}
            className="shrink-0 rounded-button border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {copied ? t("success.copied") : t("success.copy")}
          </button>
        </div>
      </div>

      <button
        onClick={onShare}
        className="mt-6 inline-flex items-center justify-center rounded-button bg-brand-500 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-brand-600 active:bg-brand-700"
      >
        {t("success.share")}
      </button>

      <div className="mt-8 rounded-card bg-gray-50 p-6 text-left">
        <p className="font-semibold text-gray-900">{t("success.whatsNext")}</p>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          {t("success.whatsNextDescription")}
        </p>
      </div>

      <p className="mt-6 text-sm text-gray-500">
        {t("success.refundNote")}
      </p>
    </>
  );
}
