import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import { trackEvent } from "../lib/analytics";
import { useParticipant } from "../contexts/ParticipantContext";
import { useEvent } from "../contexts/EventContext";
import { useWebSocket } from "../contexts/WebSocketContext";

export default function CompletePage() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { participant, clearParticipant } = useParticipant();
  const { event, participants, clearEvent } = useEvent();
  const { disconnect } = useWebSocket();

  const [shared, setShared] = useState(false);

  // Extract summary from navigation state (passed from ChatPage on hunt_complete)
  const summary = (location.state as { summary?: string } | null)?.summary ?? null;

  // Disconnect WS on mount — hunt is over
  useEffect(() => {
    disconnect();
  }, [disconnect]);

  // Guard: redirect to join if no context
  useEffect(() => {
    if (!code) {
      navigate("/", { replace: true });
    }
  }, [code, navigate]);

  // Track completion analytics once
  useEffect(() => {
    if (!code) return;
    trackEvent(POSTHOG_EVENTS.HUNT_COMPLETED, {
      event_code: code,
      participant_count: participants.length || 1,
      duration_minutes: 0,
      stops_completed: event?.current_stop ?? 0,
    });
    // Only fire once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reviewLink = import.meta.env.VITE_REVIEW_LINK as string | undefined;

  const handleReviewClick = useCallback(() => {
    if (!code) return;
    trackEvent(POSTHOG_EVENTS.REVIEW_LINK_CLICKED, {
      event_code: code,
      platform: "google",
    });
  }, [code]);

  const handleShare = useCallback(async () => {
    if (!code) return;

    const shareData: ShareData = {
      title: "City Roam - AI Treasure Hunt",
      text: "I just completed an amazing AI-guided treasure hunt! Check it out:",
      url: `${window.location.origin}/app/hunt/${code}`,
    };

    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        trackEvent(POSTHOG_EVENTS.EVENT_LINK_SHARED, {
          event_code: code,
          share_method: "native",
        });
        setShared(true);
      } catch {
        // User cancelled share sheet — no-op
      }
    } else {
      // Fallback: copy link to clipboard
      try {
        await navigator.clipboard.writeText(shareData.url!);
        trackEvent(POSTHOG_EVENTS.EVENT_LINK_SHARED, {
          event_code: code,
          share_method: "clipboard",
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // Clipboard unavailable — no-op
      }
    }
  }, [code]);

  const handleDone = useCallback(() => {
    clearParticipant();
    clearEvent();
    navigate(`/hunt/${code}`, { replace: true });
  }, [clearParticipant, clearEvent, navigate, code]);

  if (!code) return null;

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Trophy icon */}
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <svg
            className="h-10 w-10 text-brand-600"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
          </svg>
        </div>

        <h1 className="mb-3 text-center text-2xl font-bold text-gray-900">
          Hunt Complete!
        </h1>

        {/* Summary from the guide's completion message */}
        {summary && (
          <p className="mb-8 max-w-md text-center text-gray-600">{summary}</p>
        )}

        {!summary && (
          <p className="mb-8 max-w-md text-center text-gray-600">
            Well done! You've completed the treasure hunt. We hope you enjoyed
            exploring the city.
          </p>
        )}

        {/* Review prompt — only shown when VITE_REVIEW_LINK is configured */}
        {reviewLink && (
          <div className="mb-6 w-full max-w-sm">
            <p className="mb-3 text-center text-sm font-medium text-gray-700">
              Enjoyed the experience? Leave us a review!
            </p>
            <a
              href={reviewLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleReviewClick}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Leave a Google Review
            </a>
          </div>
        )}

        {/* Share button */}
        <div className="mb-6 w-full max-w-sm">
          <button
            onClick={handleShare}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            {shared ? (
              <>
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {"share" in navigator ? "Shared!" : "Link Copied!"}
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
                </svg>
                Share with Friends
              </>
            )}
          </button>
        </div>

        {/* Done button */}
        <button
          onClick={handleDone}
          className="text-sm font-medium text-system-text hover:text-gray-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}
