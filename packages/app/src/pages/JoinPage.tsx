import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { setLanguage } from "../i18n/index";
import { displayNameSchema } from "@cityroam/shared/validation/player";
import { MIN_DISPLAY_NAME_LENGTH, MAX_DISPLAY_NAME_LENGTH } from "@cityroam/shared/constants";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type {
  EventDetailResponse,
  JoinEventResponse,
  EventStatus,
} from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { friendlyError, validationMessage } from "../lib/errors";
import { trackEvent } from "../lib/analytics";
import { useParticipant } from "../contexts/ParticipantContext";
import { useEvent } from "../contexts/EventContext";
import type { FatalCloseReason } from "../contexts/WebSocketContext";

function redirectForStatus(
  navigate: ReturnType<typeof useNavigate>,
  code: string,
  status: EventStatus,
) {
  switch (status) {
    case "IN_PROGRESS":
      navigate(`/event/${code}/play`, { replace: true });
      break;
    case "COMPLETED":
      navigate(`/event/${code}/complete`, { replace: true });
      break;
    default:
      navigate(`/event/${code}/lobby`, { replace: true });
      break;
  }
}

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { setParticipant, setToken } = useParticipant();
  const { setEvent, setParticipants, setAvailableLanguages } = useEvent();

  const navState = location.state as {
    sessionExpired?: boolean;
    disconnectedReason?: FatalCloseReason;
  } | null;
  const sessionExpired = navState?.sessionExpired === true;
  // A fatal socket close (event gone, event over, no longer a participant)
  // sends the player back here; explain why instead of showing a bare form.
  const disconnectedReason = navState?.disconnectedReason;

  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(
    sessionExpired
      ? t("join.sessionExpired")
      : disconnectedReason
        ? t(`join.disconnected.${disconnectedReason}`)
        : null,
  );
  const [blockingError, setBlockingError] = useState(false);
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
          setToken(data.current_participant.token);
          setEvent({
            code: data.event.code,
            status: data.event.status,
            current_stop: data.event.current_stop,
            language: data.event.language,
          });
          setParticipants(data.participants);
          setAvailableLanguages(data.available_languages);
          void setLanguage(data.event.language);
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
            COMPLETED: t("join.statusCompleted"),
            EXPIRED: t("join.statusExpired"),
            REFUNDED: t("join.statusRefunded"),
          };
          setError(statusMessages[data.event.status] || t("join.statusUnavailable"));
          setBlockingError(true);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = friendlyError(err);
        setError(msg);
        if (
          err instanceof ApiError &&
          (err.code === "EVENT_NOT_FOUND" ||
            err.code === "EVENT_EXPIRED" ||
            err.code === "EVENT_COMPLETED" ||
            err.code === "EVENT_REFUNDED")
        ) {
          setBlockingError(true);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, [code, navigate, setParticipant, setEvent, setParticipants, setAvailableLanguages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setFieldError(null);

      // Validate display name
      const result = displayNameSchema.safeParse(displayName);
      if (!result.success) {
        setFieldError(validationMessage(result.error.issues[0]?.message ?? "DISPLAY_NAME_TOO_SHORT"));
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
          language: data.event.language,
        });
        setParticipants(data.participants);
        setAvailableLanguages(data.available_languages);
        void setLanguage(data.event.language);

        // Track analytics
        trackEvent(POSTHOG_EVENTS.GAME_JOINED, {
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
      setAvailableLanguages,
    ],
  );

  if (checking) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white">
        <p className="text-system-text">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-2xl font-bold text-gray-900">
          {t("join.title")}
        </h1>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {blockingError && (
          <Link
            to="/"
            className="block w-full rounded-lg bg-brand-600 px-4 py-3.5 text-center font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            {t("entry.tryAnotherCode")}
          </Link>
        )}

        {!blockingError && (
          <form onSubmit={handleSubmit} noValidate>
            <label
              htmlFor="display-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {t("join.nameLabel")}
            </label>
            <input
              id="display-name"
              type="text"
              autoComplete="off"
              autoFocus
              minLength={MIN_DISPLAY_NAME_LENGTH}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              placeholder={t("join.namePlaceholder")}
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
              {loading ? t("join.submitting") : t("join.submitButton")}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
