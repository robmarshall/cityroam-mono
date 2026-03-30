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

type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

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

const MAX_RECONNECT_ATTEMPTS = 10;

/** Exponential backoff delays: 1s, 2s, 4s, 8s, 16s (capped) */
function getBackoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 16_000);
}

interface WebSocketState {
  status: ConnectionStatus;
  closeCode: number | null;
  reconnectAttempt: number;
  maxAttemptsReached: boolean;
}

type WebSocketAction =
  | { type: "STATUS_CHANGE"; status: ConnectionStatus }
  | { type: "CLOSE_CODE"; code: number | null }
  | { type: "RECONNECT_ATTEMPT"; attempt: number }
  | { type: "MAX_ATTEMPTS_REACHED" }
  | { type: "RESET_RECONNECT" };

export interface WebSocketContextValue {
  status: ConnectionStatus;
  closeCode: number | null;
  reconnectAttempt: number;
  maxAttemptsReached: boolean;
  catchUpMessages: ChatMessagePayload[];
  send: (message: object) => void;
  subscribe: (callback: MessageCallback) => () => void;
  connect: (code: string, token: string) => void;
  disconnect: () => void;
  manualRetry: () => void;
  clearCatchUpMessages: () => void;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: WebSocketState = {
  status: "disconnected",
  closeCode: null,
  reconnectAttempt: 0,
  maxAttemptsReached: false,
};

function wsReducer(
  state: WebSocketState,
  action: WebSocketAction,
): WebSocketState {
  switch (action.type) {
    case "STATUS_CHANGE":
      return { ...state, status: action.status };
    case "CLOSE_CODE":
      return { ...state, closeCode: action.code };
    case "RECONNECT_ATTEMPT":
      return { ...state, reconnectAttempt: action.attempt };
    case "MAX_ATTEMPTS_REACHED":
      return { ...state, maxAttemptsReached: true, status: "disconnected" };
    case "RESET_RECONNECT":
      return { ...state, reconnectAttempt: 0, maxAttemptsReached: false, closeCode: null };
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
  const subscribersRef = useRef<Set<MessageCallback>>(new Set());

  // Use a ref for connectInternal so the close handler always calls the latest version
  const connectInternalRef = useRef<(code: string, token: string, isReconnect: boolean) => void>(
    () => {},
  );

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

  const fetchCatchUpMessages = useCallback(async (code: string) => {
    const since = lastMessageTimestampRef.current;
    if (!since) return;

    try {
      const path = `/event/${encodeURIComponent(code)}/messages?since=${encodeURIComponent(since)}`;
      const response = await api.get<MessageHistoryResponse>(path);
      if (response.messages.length > 0) {
        setCatchUpMessages(response.messages);

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

      const attempt = reconnectAttemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        dispatch({ type: "MAX_ATTEMPTS_REACHED" });
        return;
      }

      reconnectAttemptRef.current = attempt + 1;
      dispatch({ type: "RECONNECT_ATTEMPT", attempt: attempt + 1 });
      dispatch({ type: "STATUS_CHANGE", status: "reconnecting" });

      const delay = getBackoffDelay(attempt);
      reconnectTimerRef.current = setTimeout(() => {
        connectInternalRef.current(code, token, true);
      }, delay);
    },
    [clearReconnectTimer],
  );

  // -------------------------------------------------------------------------
  // Core connection logic
  // -------------------------------------------------------------------------

  const connectInternal = useCallback(
    (code: string, token: string, isReconnect: boolean) => {
      // Close any existing connection first
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

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
        dispatch({ type: "CLOSE_CODE", code: closeCode });

        // If intentional disconnect, don't reconnect
        if (intentionalDisconnectRef.current) {
          dispatch({ type: "STATUS_CHANGE", status: "disconnected" });
          intentionalDisconnectRef.current = false;
          return;
        }

        // Server replaced this socket with a newer connection for the same
        // participant — the new socket is already active so we must NOT
        // auto-reconnect (that would create yet another connection and loop).
        if (closeCode === 1000 && event.reason === "Replaced by new connection") {
          dispatch({ type: "STATUS_CHANGE", status: "disconnected" });
          return;
        }

        // Custom close codes — don't reconnect
        if (NO_RECONNECT_CODES.has(closeCode)) {
          dispatch({ type: "STATUS_CHANGE", status: "disconnected" });
          return;
        }

        // Unexpected disconnect — attempt reconnect
        disconnectedAtRef.current = Date.now();
        scheduleReconnect(code, token);
      });

      ws.addEventListener("error", () => {
        // The close event fires after error, so let close handle cleanup.
      });
    },
    [startPing, clearPingInterval, fetchCatchUpMessages, scheduleReconnect],
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
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    dispatch({ type: "STATUS_CHANGE", status: "disconnected" });
    connectionParamsRef.current = null;
  }, [clearReconnectTimer, clearPingInterval]);

  const send = useCallback((message: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback((callback: MessageCallback) => {
    subscribersRef.current.add(callback);
    return () => { subscribersRef.current.delete(callback); };
  }, []);

  const manualRetry = useCallback(() => {
    const params = connectionParamsRef.current;
    if (!params) return;
    reconnectAttemptRef.current = 0;
    dispatch({ type: "RESET_RECONNECT" });
    connectInternal(params.code, params.token, true);
  }, [connectInternal]);

  const clearCatchUpMessages = useCallback(() => {
    setCatchUpMessages([]);
  }, []);

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
        reconnectAttempt: state.reconnectAttempt,
        maxAttemptsReached: state.maxAttemptsReached,
        catchUpMessages,
        send,
        subscribe,
        connect,
        disconnect,
        manualRetry,
        clearCatchUpMessages,
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
