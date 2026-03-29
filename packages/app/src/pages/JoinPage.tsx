import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { displayNameSchema } from "@cityroam/shared/validation";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type {
  EventDetailResponse,
  JoinEventResponse,
  EventStatus,
} from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { trackEvent } from "../lib/analytics";
import { useParticipant } from "../contexts/ParticipantContext";
import { useEvent } from "../contexts/EventContext";

function redirectForStatus(
  navigate: ReturnType<typeof useNavigate>,
  code: string,
  status: EventStatus,
) {
  switch (status) {
    case "IN_PROGRESS":
      navigate(`/hunt/${code}/play`, { replace: true });
      break;
    case "COMPLETED":
      navigate(`/hunt/${code}/complete`, { replace: true });
      break;
    default:
      navigate(`/hunt/${code}/lobby`, { replace: true });
      break;
  }
}

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "EVENT_NOT_FOUND":
        return "This hunt doesn't exist. Check the link and try again.";
      case "EVENT_FULL":
        return "This hunt is full — no more spaces available.";
      case "EVENT_EXPIRED":
        return "This hunt has expired.";
      case "EVENT_COMPLETED":
        return "This hunt has already finished.";
      case "EVENT_REFUNDED":
        return "This hunt has been refunded.";
      case "INVALID_INPUT":
        return "That doesn't look like a valid hunt code. Double-check the link or code you were given.";
      default:
        if (err.status === 404) {
          return "This hunt doesn't exist. Check the link and try again.";
        }
        return err.message;
    }
  }
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return "Couldn't connect. Check your signal and try again.";
  }
  return "Something went wrong. Please try again.";
}

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { setParticipant, setToken } = useParticipant();
  const { setEvent, setParticipants } = useEvent();

  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Auto-rejoin: check if user already has a valid session for this event
  useEffect(() => {
    if (!code) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    async function checkExistingSession() {
      try {
        const data = await api.get<EventDetailResponse>(`/event/${code}`);
        if (cancelled) return;

        if (data.current_participant) {
          // User already has a session — populate context and redirect
          setParticipant(data.current_participant);
          setEvent({
            code: data.event.code,
            status: data.event.status,
            current_stop: data.event.current_stop,
          });
          setParticipants(data.participants);
          redirectForStatus(navigate, code!, data.event.status);
          return;
        }

        // Event exists but user has no session — check if joinable
        if (
          data.event.status === "COMPLETED" ||
          data.event.status === "EXPIRED" ||
          data.event.status === "REFUNDED"
        ) {
          const statusMessages: Record<string, string> = {
            COMPLETED: "This hunt has already finished.",
            EXPIRED: "This hunt has expired.",
            REFUNDED: "This hunt has been refunded.",
          };
          setError(statusMessages[data.event.status] || "This hunt is no longer available.");
        }
      } catch (err) {
        if (cancelled) return;
        const msg = friendlyError(err);
        setError(msg);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, [code, navigate, setParticipant, setEvent, setParticipants]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setFieldError(null);

      // Validate display name
      const result = displayNameSchema.safeParse(displayName);
      if (!result.success) {
        setFieldError(result.error.issues[0]?.message ?? "Invalid name");
        return;
      }

      setLoading(true);
      try {
        const data = await api.post<JoinEventResponse>(
          `/event/${code}/join`,
          { display_name: result.data },
        );

        // Populate contexts
        setParticipant(data.participant);
        setToken(data.token);
        setEvent({
          code: data.event.code,
          status: data.event.status,
          current_stop: data.event.current_stop,
        });
        setParticipants(data.participants);

        // Track analytics
        trackEvent(POSTHOG_EVENTS.HUNT_JOINED, {
          event_code: data.event.code,
          is_lead: data.participant.is_lead,
          participant_count: data.participants.length,
        });

        redirectForStatus(navigate, code!, data.event.status);
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setLoading(false);
      }
    },
    [
      code,
      displayName,
      navigate,
      setParticipant,
      setToken,
      setEvent,
      setParticipants,
    ],
  );

  if (checking) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white">
        <p className="text-system-text">Loading...</p>
      </div>
    );
  }

  const hasBlockingError =
    error &&
    (error.includes("doesn't exist") ||
      error.includes("has expired") ||
      error.includes("has already finished") ||
      error.includes("has been refunded"));

  return (
    <div className="flex min-h-svh items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-2xl font-bold text-gray-900">
          Join the Hunt
        </h1>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!hasBlockingError && (
          <form onSubmit={handleSubmit} noValidate>
            <label
              htmlFor="display-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Your name
            </label>
            <input
              id="display-name"
              type="text"
              autoComplete="off"
              autoFocus
              maxLength={30}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              placeholder="Enter your display name"
              className={`mb-1 block w-full rounded-lg border px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${
                fieldError
                  ? "border-red-300 focus:ring-red-500"
                  : "border-gray-300 focus:ring-brand-500"
              }`}
            />
            {fieldError && (
              <p className="mb-3 text-sm text-red-600">{fieldError}</p>
            )}
            {!fieldError && <div className="mb-3" />}

            <button
              type="submit"
              disabled={loading || !displayName.trim()}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Joining..." : "Join the Hunt"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
