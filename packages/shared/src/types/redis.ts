import type { ParticipantLeftReason } from "./enums.js";
import type { ChatMessagePayload } from "./websocket.js";

export interface IncomingMessagePayload {
  event_id: string;
  event_code: string;
  participant_id: string;
  participant_name: string;
  text: string;
  message_id: string;
  timestamp: string;
}

export type BroadcastMessagePayload = ChatMessagePayload;

export interface TypingPayload {
  type: "participant_typing" | "guide_typing";
  participant_name: string | null;
  participant_id: string | null;
  is_typing: boolean;
}

export type ControlEventPayload =
  | { type: "game_started"; data: { started_by: string } }
  | { type: "hunt_complete"; data: { summary: string } }
  | {
      type: "participant_joined";
      data: { name: string; participant_count: number };
    }
  | {
      type: "participant_left";
      data: {
        name: string;
        participant_count: number;
        reason: ParticipantLeftReason;
      };
    };
