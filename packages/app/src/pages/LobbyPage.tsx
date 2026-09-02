import { useEffect, useCallback, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { setLanguage } from "../i18n/index";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type {
  ParticipantJoinedPayload,
  ParticipantLeftPayload,
  GameStartedPayload,
  LanguageChangedPayload,
  LeadChangedPayload,
  SupportedLanguage,
} from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { trackEvent } from "../lib/analytics";
import { useParticipant } from "../contexts/ParticipantContext";
import { useEvent } from "../contexts/EventContext";
import {
  useWebSocket,
  REJOIN_CLOSE_CODES,
  fatalCloseReason,
} from "../contexts/WebSocketContext";

export default function LobbyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { participant, token, setParticipant } = useParticipant();
  const {
    event,
    participants,
    available_languages,
    setEvent,
    setParticipants,
    addParticipant,
    removeParticipant,
  } = useEvent();
  const {
    status: wsStatus,
    closeCode,
    maxAttemptsReached,
    isRejected,
    subscribe,
    connect,
    manualRetry,
  } = useWebSocket();

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const [languageConfirm, setLanguageConfirm] = useState<SupportedLanguage | null>(null);

  // Guard: redirect to join if no session context
  useEffect(() => {
    if (!participant || !event || !code) {
      navigate(`/event/${code ?? ""}`, { replace: true });
    }
  }, [participant, event, code, navigate]);

  // If event is already IN_PROGRESS, redirect to play
  useEffect(() => {
    if (event?.status === "IN_PROGRESS") {
      navigate(`/event/${code}/play`, { replace: true });
    } else if (event?.status === "COMPLETED") {
      navigate(`/event/${code}/complete`, { replace: true });
    } else if (event?.status === "EXPIRED" || event?.status === "REFUNDED") {
      navigate(`/event/${code}`, { replace: true });
    }
  }, [event?.status, code, navigate]);

  // Handle close codes — leave the lobby with an explanation rather than
  // sitting on a dead screen. Fatal codes are terminal, so the join screen
  // (which re-reads the event) is the only place that can recover.
  useEffect(() => {
    if (closeCode === null || !code) return;
    if (REJOIN_CLOSE_CODES.has(closeCode)) {
      navigate(`/event/${code}`, {
        replace: true,
        state: { sessionExpired: true },
      });
      return;
    }
    const reason = fatalCloseReason(closeCode);
    if (reason) {
      navigate(`/event/${code}`, {
        replace: true,
        state: { disconnectedReason: reason },
      });
    }
  }, [closeCode, code, navigate]);

  // Connect WebSocket on mount.
  //
  // The guard matters: a fatal close leaves the status at a terminal value
  // without navigating instantly, and without a one-shot ref this effect
  // would re-fire on every status change and call connect() again — which
  // resets the backoff, so a refused socket would spin in a tight loop.
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    if (code && token && wsStatus === "disconnected" && !isRejected && !hasConnectedRef.current) {
      hasConnectedRef.current = true;
      connectRef.current(code, token);
    }
    return () => {
      // Don't disconnect on unmount — the play page will reuse the connection
    };
  }, [code, token, wsStatus, isRejected]);

  // Handle incoming WebSocket messages via subscription (no batching risk)
  const participantsRef = useRef(participants);
  participantsRef.current = participants;
  const eventRef = useRef(event);
  eventRef.current = event;
  const participantContextRef = useRef(participant);
  participantContextRef.current = participant;

  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      switch (msg.type) {
        case "participant_joined": {
          const payload = msg.payload as ParticipantJoinedPayload;
          // Use the real id — a locally invented one would never match the
          // participant_id in lead_changed, so the Lead badge would break
          if (participantsRef.current.some((p) => p.id === payload.participant_id)) {
            break;
          }
          addParticipant({
            id: payload.participant_id,
            display_name: payload.name,
            is_lead: false,
            is_active: true,
          });
          break;
        }
        case "participant_left": {
          const payload = msg.payload as ParticipantLeftPayload;
          removeParticipant(payload.participant_id);
          break;
        }
        case "lead_changed": {
          const payload = msg.payload as LeadChangedPayload;
          setParticipants(
            participantsRef.current.map((p) => ({
              ...p,
              is_lead: p.id === payload.participant_id,
            })),
          );
          const me = participantContextRef.current;
          if (me) {
            setParticipant({ ...me, is_lead: me.id === payload.participant_id });
          }
          break;
        }
        case "game_started": {
          const _payload = msg.payload as GameStartedPayload;
          setEvent({
            code: code!,
            status: "IN_PROGRESS",
            current_stop: eventRef.current?.current_stop ?? 1,
            language: eventRef.current?.language,
          });
          break;
        }
        case "language_changed": {
          const payload = msg.payload as LanguageChangedPayload;
          const newLang = payload.language;
          setEvent({
            ...eventRef.current!,
            language: newLang,
          });
          void setLanguage(newLang);
          break;
        }
      }
    });

    return unsubscribe;
  }, [
    subscribe,
    code,
    addParticipant,
    removeParticipant,
    setEvent,
    setParticipants,
    setParticipant,
  ]);

  const handleStart = useCallback(async () => {
    if (!code || !event || starting) return;
    setStarting(true);
    setError(null);

    try {
      await api.post(`/event/${code}/start`);

      trackEvent(POSTHOG_EVENTS.GAME_STARTED, {
        event_code: code,
        participant_count: participants.length,
      });

      setEvent({
        code,
        status: "IN_PROGRESS",
        current_stop: 1,
        language: eventRef.current?.language ?? event.language,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("lobby.startFailed"));
      }
      setStarting(false);
    }
  }, [code, starting, participants.length, setEvent]);

  const handleLanguageChange = useCallback(async () => {
    if (!code || !languageConfirm || changingLanguage) return;
    setChangingLanguage(true);
    setError(null);

    try {
      await api.put(`/event/${code}/language`, { language: languageConfirm });
      // The WS language_changed event will update context and i18n
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("error.generic"));
      }
    } finally {
      setChangingLanguage(false);
      setLanguageConfirm(null);
    }
  }, [code, languageConfirm, changingLanguage, t]);

  // Don't render if no context — show loading spinner during redirect
  if (!participant || !event || !code) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white">
        <p className="text-system-text">{t("common.loading")}</p>
      </div>
    );
  }

  const isLead = participant.is_lead;
  const leadName = participants.find((p) => p.is_lead)?.display_name;
  const activeParticipants = participants.filter((p) => p.is_active);

  return (
    <div className="flex min-h-svh flex-col bg-white">
      {/* Connection status banners */}
      {wsStatus === "reconnecting" && !maxAttemptsReached && (
        <div className="shrink-0 bg-yellow-400 px-4 py-1.5 text-center text-sm font-medium text-yellow-900">
          {t("common.reconnecting")}
        </div>
      )}
      {maxAttemptsReached && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-red-500 px-4 py-2 text-center text-sm font-medium text-white">
          <span>{t("common.unableToReconnect")}</span>
          <button
            onClick={manualRetry}
            className="rounded-md bg-white/20 px-3 py-0.5 text-sm font-semibold hover:bg-white/30"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">
          {t("lobby.title")}
        </h1>

        {/* Language selector — lead only, multiple languages available */}
        {isLead && available_languages.length > 1 && (
          <div className="mb-6 w-full max-w-sm">
            <label
              htmlFor="language-select"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {t("language.selectorLabel")}
            </label>
            <select
              id="language-select"
              value={event.language ?? "en"}
              onChange={(e) => {
                const target = e.target.value as SupportedLanguage;
                if (target !== event.language) {
                  setLanguageConfirm(target);
                }
              }}
              disabled={changingLanguage}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {available_languages.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`language.${lang}`)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Bilingual language change confirmation dialog */}
        {languageConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="mb-3 text-lg font-bold text-gray-900">
                {t("language.confirmTitle")}
              </h2>
              <p className="mb-2 text-sm text-gray-700">
                {t("language.confirmMessage")}
              </p>
              {/* Show target language confirmation in that language */}
              {languageConfirm !== "en" && (
                <p className="mb-4 text-sm italic text-gray-500">
                  {t(`language.bilingualConfirm.${languageConfirm}`)}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setLanguageConfirm(null)}
                  disabled={changingLanguage}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleLanguageChange}
                  disabled={changingLanguage}
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {changingLanguage
                    ? t("language.changing")
                    : `${t("language.confirmButton")} — ${t(`language.${languageConfirm}`)}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Participant list */}
        <div className="mb-8 w-full max-w-sm">
          <ul className="space-y-3">
            {activeParticipants.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3"
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
                <span className="text-gray-900">{p.display_name}</span>
                {p.is_lead && (
                  <span className="ml-auto text-xs font-medium text-brand-600">
                    {t("lobby.leadBadge")}
                  </span>
                )}
                {p.id === participant.id && !p.is_lead && (
                  <span className="ml-auto text-xs text-gray-400">{t("lobby.youBadge")}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="mb-4 w-full max-w-sm rounded-lg bg-red-50 p-3 text-center text-sm text-red-700">
            {error}
          </div>
        )}

        {isLead ? (
          <button
            onClick={handleStart}
            disabled={starting}
            className="w-full max-w-sm rounded-lg bg-brand-600 px-6 py-3 text-lg font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? t("lobby.starting") : t("lobby.startButton")}
          </button>
        ) : (
          <p className="text-center text-system-text">
            {leadName ? t("lobby.waitingForLead", { name: leadName }) : t("lobby.waitingForLeadDefault")}
          </p>
        )}

        {/* Connection status */}
        {wsStatus === "connecting" && (
          <p className="mt-4 text-sm text-gray-400">{t("common.connecting")}</p>
        )}
      </div>
    </div>
  );
}
