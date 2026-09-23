import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { WEBSOCKET_PING_INTERVAL_MS } from "@cityroam/shared/constants";
import type { ChatMessagePayload, WebSocketMessage, MessageHistoryResponse } from "@cityroam/shared/types";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import { api } from "../lib/api";
import { trackEvent } from "../lib/analytics";

export type MessageCallback = (message: WebSocketMessage) => void;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * `rejected` is terminal: the server refused this socket with a custom close
 * code and reconnecting would just be refused again. Nothing — not backoff,
 * not an `online` event, not a tab wake — reconnects out of it. Only an
 * explicit `connect()` (a fresh join) clears it.
 */
type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "rejected";

/** Custom close codes sent by the WS server */
const CLOSE_CODE_INVALID_TOKEN = 4001;
const CLOSE_CODE_EXPIRED_SESSION = 4002;
const CLOSE_CODE_NOT_FOUND = 4003;
const CLOSE_CODE_COMPLETED_OR_EXPIRED = 4004;
const CLOSE_CODE_NOT_ACTIVE = 4005;

/** Close codes that should redirect to the join screen (auth failure) */
export const REJOIN_CLOSE_CODES = new Set([CLOSE_CODE_INVALID_TOKEN, CLOSE_CODE_EXPIRED_SESSION]);

/** Close codes that should show an error and NOT reconnect */
export const FATAL_CLOSE_CODES = new Set([
  CLOSE_CODE_NOT_FOUND,
  CLOSE_CODE_COMPLETED_OR_EXPIRED,
  CLOSE_CODE_NOT_ACTIVE,
]);

/** All custom close codes — never auto-reconnect on these */
const NO_RECONNECT_CODES = new Set([...REJOIN_CLOSE_CODES, ...FATAL_CLOSE_CODES]);

/** i18n suffixes under `join.disconnected.*` for each fatal close code. */
export type FatalCloseReason = "eventNotFound" | "eventEnded" | "notActive";

/**
 * Maps a fatal close code to the notice the join screen should show once the
 * player has been sent back there.
 */
export function fatalCloseReason(code: number | null): FatalCloseReason | null {
  switch (code) {
    case CLOSE_CODE_NOT_FOUND:
      return "eventNotFound";
    case CLOSE_CODE_COMPLETED_OR_EXPIRED:
      return "eventEnded";
    case CLOSE_CODE_NOT_ACTIVE:
      return "notActive";
    default:
      return null;
  }
}

const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Once backoff is exhausted we keep a slow heartbeat retry going rather than
 * giving up for good — a phone that comes back on signal ten minutes later
 * should reconnect on its own, without the player finding a dead screen.
 */
const SLOW_RETRY_INTERVAL_MS = 30_000;

/** Exponential backoff delays: 1s, 2s, 4s, 8s, 16s (capped) */
function getBackoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 16_000);
}

interface WebSocketState {
  status: ConnectionStatus;
  closeCode: number | null;
  closeReason: string | null;
  reconnectAttempt: number;
  maxAttemptsReached: boolean;
  /** Bumped on every successful reconnect (never on the first connect). */
  resyncNonce: number;
}

type WebSocketAction =
  | { type: "STATUS_CHANGE"; status: ConnectionStatus }
  | { type: "CLOSE_CODE"; code: number | null; reason?: string | null }
  | { type: "REJECTED"; code: number; reason: string | null }
  | { type: "RECONNECT_ATTEMPT"; attempt: number }
  | { type: "MAX_ATTEMPTS_REACHED" }
  | { type: "RESYNC" }
  | { type: "RESET_RECONNECT" };

export interface WebSocketContextValue {
  status: ConnectionStatus;
  closeCode: number | null;
  closeReason: string | null;
  reconnectAttempt: number;
  maxAttemptsReached: boolean;
  /** True once the server refused the socket — no retry will ever succeed. */
  isRejected: boolean;
  /**
   * Increments after each successful *re*connect. Pages watch it to re-fetch
   * game state they may have missed while the socket was down.
   */
  resyncNonce: number;
  catchUpMessages: ChatMessagePayload[];
  send: (message: object) => boolean;
  subscribe: (callback: MessageCallback) => () => void;
  connect: (code: string, token: string) => void;
  disconnect: () => void;
  manualRetry: () => void;
  clearCatchUpMessages: () => void;
  /**
   * Seeds the catch-up watermark. Callers that load history over HTTP must
   * call this, otherwise a reconnect after a page refresh has no `since` and
   * silently skips catch-up entirely.
   */
  setLastMessageTimestamp: (timestamp: string) => void;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: WebSocketState = {
  status: "disconnected",
  closeCode: null,
  closeReason: null,
  reconnectAttempt: 0,
  maxAttemptsReached: false,
  resyncNonce: 0,
};

function wsReducer(
  state: WebSocketState,
  action: WebSocketAction,
): WebSocketState {
  switch (action.type) {
    case "STATUS_CHANGE":
      return { ...state, status: action.status };
    case "CLOSE_CODE":
      return { ...state, closeCode: action.code, closeReason: action.reason ?? null };
    case "REJECTED":
      return {
        ...state,
        status: "rejected",
        closeCode: action.code,
        closeReason: action.reason,
        maxAttemptsReached: false,
      };
    case "RECONNECT_ATTEMPT":
      return { ...state, reconnectAttempt: action.attempt };
    case "MAX_ATTEMPTS_REACHED":
      return { ...state, maxAttemptsReached: true, status: "disconnected" };
    case "RESYNC":
      return { ...state, resyncNonce: state.resyncNonce + 1 };
    case "RESET_RECONNECT":
      return {
        ...state,
        reconnectAttempt: 0,
        maxAttemptsReached: false,
        closeCode: null,
        closeReason: null,
      };
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const WS_BASE_URL: string = import.meta.env.VITE_WS_URL ?? "ws://localhost:3002";

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wsReducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionParamsRef = useRef<{ code: string; token: string } | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lastMessageTimestampRef = useRef<string | null>(null);
  const disconnectedAtRef = useRef<number | null>(null);
  const [catchUpMessages, setCatchUpMessages] = useState<ChatMessagePayload[]>([]);
  const intentionalDisconnectRef = useRef(false);
  /** Set when the server refuses the socket. Blocks every automatic retry. */
  const terminalRef = useRef(false);
  const subscribersRef = useRef<Set<MessageCallback>>(new Set());

  // Use refs so close handlers and wake listeners always call the latest version
  const connectInternalRef = useRef<(code: string, token: string, isReconnect: boolean) => void>(
    () => {},
  );
  const scheduleReconnectRef = useRef<(code: string, token: string) => void>(() => {});

  // -------------------------------------------------------------------------
  // Cleanup helpers
  // -------------------------------------------------------------------------

  const clearPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  /**
   * Drop the current socket. Clearing socketRef first makes the outgoing
   * socket's own close handler a no-op, so exactly one socket is ever live
   * and a replaced socket can never schedule a competing reconnect.
   */
  const closeCurrentSocket = useCallback(() => {
    const existing = socketRef.current;
    if (!existing) return;
    socketRef.current = null;
    try {
      existing.close();
    } catch {
      // Already closing — nothing to do
    }
  }, []);

  // -------------------------------------------------------------------------
  // Ping keep-alive
  // -------------------------------------------------------------------------

  const startPing = useCallback(() => {
    clearPingInterval();
    pingIntervalRef.current = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "ping", payload: {} }));
      }
    }, WEBSOCKET_PING_INTERVAL_MS);
  }, [clearPingInterval]);

  // -------------------------------------------------------------------------
  // Catch-up messages after reconnection
  // -------------------------------------------------------------------------

  const setLastMessageTimestamp = useCallback((timestamp: string) => {
    const current = lastMessageTimestampRef.current;
    // Never move the watermark backwards — a slow history response must not
    // undo newer live frames that already arrived.
    if (current && new Date(timestamp).getTime() <= new Date(current).getTime()) {
      return;
    }
    lastMessageTimestampRef.current = timestamp;
  }, []);

  const fetchCatchUpMessages = useCallback(async (code: string) => {
    const since = lastMessageTimestampRef.current;
    if (!since) return;

    try {
      const path = `/event/${encodeURIComponent(code)}/messages?since=${encodeURIComponent(since)}`;
      const response = await api.get<MessageHistoryResponse>(path);
      if (response.messages.length > 0) {
        // Append rather than replace: two reconnects in quick succession must
        // not drop the first batch before the page has consumed it.
        setCatchUpMessages((prev) => [...prev, ...response.messages]);

        // Update last message timestamp to the newest catch-up message
        const newest = response.messages[response.messages.length - 1];
        lastMessageTimestampRef.current = newest.created_at;
      }
    } catch {
      // Catch-up failure is non-fatal — messages may arrive via WS
    }
  }, []);

  // -------------------------------------------------------------------------
  // Reconnect scheduling
  // -------------------------------------------------------------------------

  const scheduleReconnect = useCallback(
    (code: string, token: string) => {
      clearReconnectTimer();
      if (terminalRef.current) return;

      const attempt = reconnectAttemptRef.current;
      const exhausted = attempt >= MAX_RECONNECT_ATTEMPTS;

      if (exhausted) {
        // Backoff is spent, but we keep trying slowly instead of stranding
        // the player on a dead socket for the rest of the hunt.
        dispatch({ type: "MAX_ATTEMPTS_REACHED" });
      } else {
        reconnectAttemptRef.current = attempt + 1;
        dispatch({ type: "RECONNECT_ATTEMPT", attempt: attempt + 1 });
        dispatch({ type: "STATUS_CHANGE", status: "reconnecting" });
      }

      const delay = exhausted ? SLOW_RETRY_INTERVAL_MS : getBackoffDelay(attempt);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (terminalRef.current || intentionalDisconnectRef.current) return;
        // Don't burn slow retries on a backgrounded tab — the visibility
        // listener reconnects the moment the player looks at the screen.
        if (exhausted && typeof document !== "undefined" && document.visibilityState !== "visible") {
          scheduleReconnectRef.current(code, token);
          return;
        }
        connectInternalRef.current(code, token, true);
      }, delay);
    },
    [clearReconnectTimer],
  );

  scheduleReconnectRef.current = scheduleReconnect;

  // -------------------------------------------------------------------------
  // Core connection logic
  // -------------------------------------------------------------------------

  const connectInternal = useCallback(
    (code: string, token: string, isReconnect: boolean) => {
      clearReconnectTimer();
      // Close any existing connection first
      closeCurrentSocket();

      dispatch({ type: "STATUS_CHANGE", status: isReconnect ? "reconnecting" : "connecting" });

      const url = `${WS_BASE_URL}/ws/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.addEventListener("open", () => {
        if (socketRef.current !== ws) return;

        dispatch({ type: "STATUS_CHANGE", status: "connected" });
        dispatch({ type: "RESET_RECONNECT" });
        reconnectAttemptRef.current = 0;

        // Start ping keep-alive
        startPing();

        // If reconnecting, fetch catch-up messages and track analytics
        if (isReconnect) {
          fetchCatchUpMessages(code);
          // Tell pages to re-read game state — action_waiting and other
          // one-shot broadcasts sent during the outage are gone for good.
          dispatch({ type: "RESYNC" });

          const offlineDuration = disconnectedAtRef.current
            ? Math.round((Date.now() - disconnectedAtRef.current) / 1000)
            : 0;
          trackEvent(POSTHOG_EVENTS.PARTICIPANT_RECONNECTED, {
            event_code: code,
            offline_duration_seconds: offlineDuration,
          });
          disconnectedAtRef.current = null;
        }
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        if (socketRef.current !== ws) return;
        try {
          const data = JSON.parse(String(event.data)) as WebSocketMessage;

          // Deliver to all subscribers synchronously — no React batching risk
          for (const cb of subscribersRef.current) {
            try { cb(data); } catch { /* isolate subscriber errors */ }
          }

          // Track last chat_message timestamp for catch-up
          if (data.type === "chat_message") {
            const payload = data.payload as ChatMessagePayload;
            lastMessageTimestampRef.current = payload.created_at;
          }
        } catch {
          // Malformed JSON — ignore
        }
      });

      ws.addEventListener("close", (event: CloseEvent) => {
        if (socketRef.current !== ws) return;
        socketRef.current = null;
        clearPingInterval();

        const closeCode = event.code;

        // If intentional disconnect, don't reconnect
        if (intentionalDisconnectRef.current) {
          dispatch({ type: "CLOSE_CODE", code: closeCode, reason: event.reason });
          dispatch({ type: "STATUS_CHANGE", status: "disconnected" });
          intentionalDisconnectRef.current = false;
          return;
        }

        // Server replaced this socket with a newer connection for the same
        // participant — the new socket is already active so we must NOT
        // auto-reconnect (that would create yet another connection and loop).
        if (closeCode === 1000 && event.reason === "Replaced by new connection") {
          dispatch({ type: "CLOSE_CODE", code: closeCode, reason: event.reason });
          dispatch({ type: "STATUS_CHANGE", status: "disconnected" });
          return;
        }

        // Custom close codes are terminal: the server has judged this token,
        // event, or participant and will refuse an identical socket forever.
        if (NO_RECONNECT_CODES.has(closeCode)) {
          terminalRef.current = true;
          clearReconnectTimer();
          dispatch({ type: "REJECTED", code: closeCode, reason: event.reason || null });
          return;
        }

        dispatch({ type: "CLOSE_CODE", code: closeCode, reason: event.reason });

        // Unexpected disconnect — attempt reconnect
        if (disconnectedAtRef.current === null) {
          disconnectedAtRef.current = Date.now();
        }
        scheduleReconnectRef.current(code, token);
      });

      ws.addEventListener("error", () => {
        // The close event fires after error, so let close handle cleanup.
      });
    },
    [startPing, clearPingInterval, clearReconnectTimer, closeCurrentSocket, fetchCatchUpMessages],
  );

  // Keep connectInternalRef in sync
  connectInternalRef.current = connectInternal;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const connect = useCallback(
    (code: string, token: string) => {
      connectionParamsRef.current = { code, token };
      intentionalDisconnectRef.current = false;
      terminalRef.current = false;
      reconnectAttemptRef.current = 0;
      dispatch({ type: "RESET_RECONNECT" });
      connectInternal(code, token, false);
    },
    [connectInternal],
  );

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    clearReconnectTimer();
    clearPingInterval();
    closeCurrentSocket();
    dispatch({ type: "STATUS_CHANGE", status: "disconnected" });
    connectionParamsRef.current = null;
  }, [clearReconnectTimer, clearPingInterval, closeCurrentSocket]);

  const send = useCallback((message: object): boolean => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify(message));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  const subscribe = useCallback((callback: MessageCallback) => {
    subscribersRef.current.add(callback);
    return () => { subscribersRef.current.delete(callback); };
  }, []);

  const manualRetry = useCallback(() => {
    const params = connectionParamsRef.current;
    if (!params) return;
    // A manual tap is an explicit request, so it clears the terminal flag —
    // if the server still refuses, the next close sets it again.
    terminalRef.current = false;
    intentionalDisconnectRef.current = false;
    reconnectAttemptRef.current = 0;
    dispatch({ type: "RESET_RECONNECT" });
    connectInternal(params.code, params.token, true);
  }, [connectInternal]);

  const clearCatchUpMessages = useCallback(() => {
    setCatchUpMessages([]);
  }, []);

  // -------------------------------------------------------------------------
  // Wake on network/tab events
  //
  // Mobile browsers freeze timers in background tabs and give no warning when
  // a socket dies with the radio. These events are the only reliable signal
  // that the phone is usable again, so each one collapses the backoff and
  // reconnects immediately.
  // -------------------------------------------------------------------------

  useEffect(() => {
    const wake = () => {
      const params = connectionParamsRef.current;
      if (!params) return;
      if (terminalRef.current || intentionalDisconnectRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;

      const readyState = socketRef.current?.readyState;
      if (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) return;

      clearReconnectTimer();
      reconnectAttemptRef.current = 0;
      dispatch({ type: "RESET_RECONNECT" });
      connectInternalRef.current(params.code, params.token, true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") wake();
    };

    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [clearReconnectTimer]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearPingInterval();
      clearReconnectTimer();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [clearPingInterval, clearReconnectTimer]);

  return (
    <WebSocketContext
      value={{
        status: state.status,
        closeCode: state.closeCode,
        closeReason: state.closeReason,
        reconnectAttempt: state.reconnectAttempt,
        maxAttemptsReached: state.maxAttemptsReached,
        isRejected: state.status === "rejected",
        resyncNonce: state.resyncNonce,
        catchUpMessages,
        send,
        subscribe,
        connect,
        disconnect,
        manualRetry,
        clearCatchUpMessages,
        setLastMessageTimestamp,
      }}
    >
      {children}
    </WebSocketContext>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return ctx;
}
