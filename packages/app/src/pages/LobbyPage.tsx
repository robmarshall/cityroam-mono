import { useEffect, useCallback, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type {
  ParticipantJoinedPayload,
  ParticipantLeftPayload,
  GameStartedPayload,
  WebSocketMessage,
} from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { trackEvent } from "../lib/analytics";
import { useParticipant } from "../contexts/ParticipantContext";
import { useEvent } from "../contexts/EventContext";
import {
  useWebSocket,
  REJOIN_CLOSE_CODES,
  FATAL_CLOSE_CODES,
} from "../contexts/WebSocketContext";

export default function LobbyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { participant, token } = useParticipant();
  const {
    event,
    participants,
    setEvent,
    addParticipant,
    removeParticipant,
  } = useEvent();
  const {
    status: wsStatus,
    lastMessage,
    closeCode,
    maxAttemptsReached,
    connect,
    manualRetry,
  } = useWebSocket();

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: redirect to join if no session context
  useEffect(() => {
    if (!participant || !event || !code) {
      navigate(`/hunt/${code ?? ""}`, { replace: true });
    }
  }, [participant, event, code, navigate]);

  // If event is already IN_PROGRESS, redirect to play
  useEffect(() => {
    if (event?.status === "IN_PROGRESS") {
      navigate(`/hunt/${code}/play`, { replace: true });
    } else if (event?.status === "COMPLETED") {
      navigate(`/hunt/${code}/complete`, { replace: true });
    }
  }, [event?.status, code, navigate]);

  // Handle close codes — redirect to join on auth failure
  useEffect(() => {
    if (closeCode === null || !code) return;
    if (REJOIN_CLOSE_CODES.has(closeCode)) {
      navigate(`/hunt/${code}`, { replace: true });
    }
  }, [closeCode, code, navigate]);

  // Connect WebSocket on mount
  useEffect(() => {
    if (code && token && wsStatus === "disconnected") {
      connect(code, token);
    }
    return () => {
      // Don't disconnect on unmount — the play page will reuse the connection
    };
  }, [code, token, connect, wsStatus]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage as WebSocketMessage;

    switch (msg.type) {
      case "participant_joined": {
        const payload = msg.payload as ParticipantJoinedPayload;
        addParticipant({
          id: crypto.randomUUID(),
          display_name: payload.name,
          is_lead: false,
          is_active: true,
        });
        break;
      }
      case "participant_left": {
        const payload = msg.payload as ParticipantLeftPayload;
        // Find participant by name and remove them
        const leaving = participants.find(
          (p) => p.display_name === payload.name,
        );
        if (leaving) {
          removeParticipant(leaving.id);
        }
        break;
      }
      case "game_started": {
        const _payload = msg.payload as GameStartedPayload;
        setEvent({
          code: code!,
          status: "IN_PROGRESS",
          current_stop: event?.current_stop ?? 1,
        });
        // Navigation handled by the status effect above
        break;
      }
    }
  }, [
    lastMessage,
    code,
    event,
    participants,
    addParticipant,
    removeParticipant,
    setEvent,
  ]);

  const handleStart = useCallback(async () => {
    if (!code || starting) return;
    setStarting(true);
    setError(null);

    try {
      await api.post(`/event/${code}/start`);

      trackEvent(POSTHOG_EVENTS.HUNT_STARTED, {
        event_code: code,
        participant_count: participants.length,
      });

      setEvent({
        code,
        status: "IN_PROGRESS",
        current_stop: 1,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to start the hunt. Please try again.");
      }
      setStarting(false);
    }
  }, [code, starting, participants.length, setEvent]);

  // Don't render if no context
  if (!participant || !event || !code) {
    return null;
  }

  const isLead = participant.is_lead;
  const leadName = participants.find((p) => p.is_lead)?.display_name;
  const activeParticipants = participants.filter((p) => p.is_active);

  // Determine fatal error message from close code
  const fatalMessage =
    closeCode !== null && FATAL_CLOSE_CODES.has(closeCode)
      ? closeCode === 4003
        ? "Event not found."
        : closeCode === 4004
          ? "This event has ended."
          : "You are no longer active in this event."
      : null;

  return (
    <div className="flex min-h-svh flex-col bg-white">
      {/* Connection status banners */}
      {wsStatus === "reconnecting" && (
        <div className="shrink-0 bg-yellow-400 px-4 py-1.5 text-center text-sm font-medium text-yellow-900">
          Reconnecting...
        </div>
      )}
      {maxAttemptsReached && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-red-500 px-4 py-2 text-center text-sm font-medium text-white">
          <span>Unable to reconnect</span>
          <button
            onClick={manualRetry}
            className="rounded-md bg-white/20 px-3 py-0.5 text-sm font-semibold hover:bg-white/30"
          >
            Retry
          </button>
        </div>
      )}
      {fatalMessage && (
        <div className="shrink-0 bg-red-500 px-4 py-1.5 text-center text-sm font-medium text-white">
          {fatalMessage}
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">
          Waiting for players
        </h1>

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
                    Lead
                  </span>
                )}
                {p.id === participant.id && !p.is_lead && (
                  <span className="ml-auto text-xs text-gray-400">You</span>
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
            {starting ? "Starting..." : "Start the Hunt"}
          </button>
        ) : (
          <p className="text-center text-system-text">
            Waiting for {leadName ?? "the lead"} to start the hunt...
          </p>
        )}

        {/* Connection status */}
        {wsStatus === "connecting" && (
          <p className="mt-4 text-sm text-gray-400">Connecting...</p>
        )}
      </div>
    </div>
  );
}
