import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { EventStatus } from "@cityroam/shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventInfo {
  code: string;
  status: EventStatus;
  current_stop: number;
}

interface EventParticipant {
  id: string;
  display_name: string;
  is_lead: boolean;
  is_active: boolean;
}

interface EventState {
  event: EventInfo | null;
  participants: EventParticipant[];
}

type EventAction =
  | { type: "SET_EVENT"; event: EventInfo }
  | { type: "SET_PARTICIPANTS"; participants: EventParticipant[] }
  | { type: "UPDATE_PARTICIPANT"; id: string; updates: Partial<EventParticipant> }
  | { type: "ADD_PARTICIPANT"; participant: EventParticipant }
  | { type: "REMOVE_PARTICIPANT"; id: string }
  | { type: "CLEAR" };

interface EventContextValue extends EventState {
  setEvent: (event: EventInfo) => void;
  setParticipants: (participants: EventParticipant[]) => void;
  updateParticipant: (id: string, updates: Partial<EventParticipant>) => void;
  addParticipant: (participant: EventParticipant) => void;
  removeParticipant: (id: string) => void;
  clearEvent: () => void;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: EventState = {
  event: null,
  participants: [],
};

function eventReducer(state: EventState, action: EventAction): EventState {
  switch (action.type) {
    case "SET_EVENT":
      return { ...state, event: action.event };
    case "SET_PARTICIPANTS":
      return { ...state, participants: action.participants };
    case "UPDATE_PARTICIPANT":
      return {
        ...state,
        participants: state.participants.map((p) =>
          p.id === action.id ? { ...p, ...action.updates } : p,
        ),
      };
    case "ADD_PARTICIPANT":
      return {
        ...state,
        participants: [...state.participants, action.participant],
      };
    case "REMOVE_PARTICIPANT":
      return {
        ...state,
        participants: state.participants.filter((p) => p.id !== action.id),
      };
    case "CLEAR":
      return initialState;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const EventContext = createContext<EventContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EventProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(eventReducer, initialState);

  const setEvent = useCallback((event: EventInfo) => {
    dispatch({ type: "SET_EVENT", event });
  }, []);

  const setParticipants = useCallback((participants: EventParticipant[]) => {
    dispatch({ type: "SET_PARTICIPANTS", participants });
  }, []);

  const updateParticipant = useCallback(
    (id: string, updates: Partial<EventParticipant>) => {
      dispatch({ type: "UPDATE_PARTICIPANT", id, updates });
    },
    [],
  );

  const addParticipant = useCallback((participant: EventParticipant) => {
    dispatch({ type: "ADD_PARTICIPANT", participant });
  }, []);

  const removeParticipant = useCallback((id: string) => {
    dispatch({ type: "REMOVE_PARTICIPANT", id });
  }, []);

  const clearEvent = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  return (
    <EventContext
      value={{
        ...state,
        setEvent,
        setParticipants,
        updateParticipant,
        addParticipant,
        removeParticipant,
        clearEvent,
      }}
    >
      {children}
    </EventContext>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEvent(): EventContextValue {
  const ctx = useContext(EventContext);
  if (!ctx) {
    throw new Error("useEvent must be used within an EventProvider");
  }
  return ctx;
}
