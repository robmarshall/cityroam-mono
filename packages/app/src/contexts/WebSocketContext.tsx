import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

interface WebSocketState {
  status: ConnectionStatus;
  lastMessage: unknown;
}

type WebSocketAction =
  | { type: "STATUS_CHANGE"; status: ConnectionStatus }
  | { type: "MESSAGE_RECEIVED"; message: unknown };

interface WebSocketContextValue {
  status: ConnectionStatus;
  lastMessage: unknown;
  send: (message: object) => void;
  connect: (code: string, token: string) => void;
  disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: WebSocketState = {
  status: "disconnected",
  lastMessage: null,
};

function wsReducer(
  state: WebSocketState,
  action: WebSocketAction,
): WebSocketState {
  switch (action.type) {
    case "STATUS_CHANGE":
      return { ...state, status: action.status };
    case "MESSAGE_RECEIVED":
      return { ...state, lastMessage: action.message };
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const WS_BASE_URL: string = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wsReducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    dispatch({ type: "STATUS_CHANGE", status: "disconnected" });
  }, []);

  const connect = useCallback(
    (code: string, token: string) => {
      // Close any existing connection first
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      dispatch({ type: "STATUS_CHANGE", status: "connecting" });

      const url = `${WS_BASE_URL}/ws/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.addEventListener("open", () => {
        if (socketRef.current === ws) {
          dispatch({ type: "STATUS_CHANGE", status: "connected" });
        }
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        if (socketRef.current === ws) {
          try {
            const data: unknown = JSON.parse(String(event.data));
            dispatch({ type: "MESSAGE_RECEIVED", message: data });
          } catch {
            // Non-JSON message — store raw string
            dispatch({ type: "MESSAGE_RECEIVED", message: event.data });
          }
        }
      });

      ws.addEventListener("close", () => {
        if (socketRef.current === ws) {
          socketRef.current = null;
          dispatch({ type: "STATUS_CHANGE", status: "disconnected" });
        }
      });

      ws.addEventListener("error", () => {
        // The close event will fire after error, so we let close handle cleanup.
      });
    },
    [],
  );

  const send = useCallback((message: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  return (
    <WebSocketContext
      value={{
        status: state.status,
        lastMessage: state.lastMessage,
        send,
        connect,
        disconnect,
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
