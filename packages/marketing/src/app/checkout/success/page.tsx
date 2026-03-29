"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type { CheckoutSuccessResponse } from "@cityroam/shared/types";
import { trackEvent } from "@/lib/analytics";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

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

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    async function fetchEvent() {
      try {
        const res = await fetch(
          `${API_URL}/checkout/success?session_id=${encodeURIComponent(sessionId!)}`,
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
        setStatus("error");
      }
    }

    fetchEvent();
  }, [sessionId]);

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
      title: "Join my City Roam adventure!",
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
      // Silent fail
    }
  }, [eventUrl, eventCode]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-24">
      <div className="mx-auto w-full max-w-lg text-center">
        {status === "loading" && <LoadingState />}
        {status === "error" && <ErrorState />}
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
  return (
    <>
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      <p className="mt-6 text-lg text-gray-600">Setting up your experience...</p>
    </>
  );
}

function ErrorState() {
  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900">
        We couldn&apos;t find your booking
      </h1>
      <p className="mt-4 text-gray-600 leading-relaxed">
        Check your email for the event link, or contact us.
      </p>
      <a
        href="/"
        className="mt-8 inline-block rounded-button bg-brand-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-600"
      >
        Back to Home
      </a>
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
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900">You&apos;re all set!</h1>

      <div className="mt-8 rounded-card border border-gray-200 bg-gray-50 p-4">
        <label className="block text-sm font-medium text-gray-500">
          Your event link
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
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <button
        onClick={onShare}
        className="mt-6 inline-flex items-center justify-center rounded-button bg-brand-500 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-brand-600 active:bg-brand-700"
      >
        Share with Friends
      </button>

      <div className="mt-8 rounded-card bg-gray-50 p-6 text-left">
        <p className="font-semibold text-gray-900">What&apos;s next?</p>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          Share this link with your group. Everyone opens it, enters their name,
          and the lead person starts when everyone&apos;s ready.
        </p>
      </div>

      <p className="mt-6 text-sm text-gray-500">
        Not happy? Get a full refund — no questions asked.
      </p>
    </>
  );
}
