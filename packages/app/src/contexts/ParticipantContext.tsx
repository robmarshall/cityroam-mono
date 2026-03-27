import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { JoinEventResponse } from "@cityroam/shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Participant = JoinEventResponse["participant"];

interface ParticipantState {
  participant: Participant | null;
  token: string | null;
}

type ParticipantAction =
  | { type: "SET_PARTICIPANT"; participant: Participant }
  | { type: "SET_TOKEN"; token: string }
  | { type: "CLEAR" };

interface ParticipantContextValue extends ParticipantState {
  setParticipant: (participant: Participant) => void;
  setToken: (token: string) => void;
  clearParticipant: () => void;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: ParticipantState = {
  participant: null,
  token: null,
};

function participantReducer(
  state: ParticipantState,
  action: ParticipantAction,
): ParticipantState {
  switch (action.type) {
    case "SET_PARTICIPANT":
      return { ...state, participant: action.participant };
    case "SET_TOKEN":
      return { ...state, token: action.token };
    case "CLEAR":
      return initialState;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ParticipantContext = createContext<ParticipantContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ParticipantProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(participantReducer, initialState);

  const setParticipant = useCallback((participant: Participant) => {
    dispatch({ type: "SET_PARTICIPANT", participant });
  }, []);

  const setToken = useCallback((token: string) => {
    dispatch({ type: "SET_TOKEN", token });
  }, []);

  const clearParticipant = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  return (
    <ParticipantContext value={{ ...state, setParticipant, setToken, clearParticipant }}>
      {children}
    </ParticipantContext>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useParticipant(): ParticipantContextValue {
  const ctx = useContext(ParticipantContext);
  if (!ctx) {
    throw new Error("useParticipant must be used within a ParticipantProvider");
  }
  return ctx;
}
