import type {
  EventStatus,
  MessageBankType,
  ParticipantLeftReason,
  SenderType,
} from "./enums.js";

export interface Event {
  id: string;
  code: string;
  status: EventStatus;
  route_id: string;
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
  city: string;
  name: string;
  description: string;
  total_stops: number;
  estimated_duration_mins: number;
  estimated_distance_km: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Stop {
  id: string;
  route_id: string;
  stop_number: number;
  name: string;
  directions_from_previous: string;
  clue: string;
  accepted_answers: string[];
  hints: string[];
  correct_response: string;
  fun_fact: string;
  images: string[];
  google_maps_link: string;
  created_at: string;
  updated_at: string;
}

export interface MessageBank {
  id: string;
  type: MessageBankType;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
