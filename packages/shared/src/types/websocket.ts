import type { ParticipantLeftReason, SenderType } from "./enums.js";
import type { BlockType } from "./blocks.js";

// Generic wrapper
export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
}

// Client → Server payloads
export interface UserMessagePayload {
  text: string;
}

export type TypingStartPayload = Record<string, never>;

export type TypingStopPayload = Record<string, never>;

export type PingPayload = Record<string, never>;

export interface ActionConfirmPayload {
  block_id: string;
}

// Server → Client payloads
export interface ActionWaitingPayload {
  block_id: string;
  label: string;
}
export interface ChatMessagePayload {
  id: string;
  sender_type: SenderType;
  sender_name: string;
  participant_id: string | null;
  content: string;
  image_url: string | null;
  step_number: number;
  created_at: string;
  block_type?: BlockType;
}

export interface GuideTypingPayload {
  is_typing: boolean;
}

export interface ParticipantTypingPayload {
  name: string;
  is_typing: boolean;
}

export interface ParticipantJoinedPayload {
  name: string;
  participant_count: number;
}

export interface ParticipantLeftPayload {
  name: string;
  participant_count: number;
  reason: ParticipantLeftReason;
}

export interface GameStartedPayload {
  started_by: string;
}

export interface GameCompletePayload {
  summary: string;
}

export interface NameChangedPayload {
  participant_id: string;
  old_name: string;
  new_name: string;
}

export type PongPayload = Record<string, never>;

export interface MessageDroppedPayload {
  message_id: string;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}
