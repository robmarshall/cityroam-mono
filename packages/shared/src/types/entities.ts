import type {
  EventStatus,
  MessageBankType,
  ParticipantLeftReason,
  SenderType,
  SupportedLanguage,
} from "./enums.js";
import type { BlockType, BlockConfig } from "./blocks.js";

export interface RouteFamily {
  id: string;
  name: string;
  city: string;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  code: string;
  status: EventStatus;
  route_id: string;
  route_family_id: string;
  language: SupportedLanguage;
  buyer_email: string;
  current_stop: number;
  hints_given: number;
  wrong_attempts: number;
  guide_response_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string;
  lead_participant_id: string | null;
  stripe_session_id: string | null;
  stripe_payment_id: string | null;
  refund_requested: boolean;
  refund_note: string | null;
}

export interface Participant {
  id: string;
  event_id: string;
  display_name: string;
  token: string;
  is_lead: boolean;
  is_active: boolean;
  joined_at: string;
  last_seen_at: string;
  left_at: string | null;
  left_reason: ParticipantLeftReason | null;
}

export interface Message {
  id: string;
  event_id: string;
  step_number: number;
  sender_type: SenderType;
  sender_name: string;
  participant_id: string | null;
  content: string;
  image_url: string | null;
  created_at: string;
}

export interface Route {
  id: string;
  name: string;
  description: string;
  language: SupportedLanguage;
  route_family_id: string;
  total_stops: number;
  estimated_duration_mins: number;
  estimated_distance_km: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RouteGroup {
  id: string;
  route_id: string;
  position: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface RouteBlock {
  id: string;
  group_id: string;
  position: number;
  type: BlockType;
  config: BlockConfig;
  delay_ms: number;
  created_at: string;
}

export interface MessageBank {
  id: string;
  type: MessageBankType;
  language: SupportedLanguage;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
