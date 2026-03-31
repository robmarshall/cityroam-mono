import type { EventStatus } from "./enums.js";
import type { Event, Message, Participant, Route, Stop } from "./entities.js";
import type { ChatMessagePayload } from "./websocket.js";
import type { SequenceItem } from "./sequence.js";

// Public API responses

export interface EventDetailResponse {
  event: {
    code: string;
    status: EventStatus;
    current_stop: number;
    started_at: string | null;
    created_at: string;
  };
  participants: Array<{
    id: string;
    display_name: string;
    is_lead: boolean;
    is_active: boolean;
  }>;
  lead_name: string | null;
  current_participant: {
    id: string;
    display_name: string;
    is_lead: boolean;
    token: string;
  } | null;
}

export interface JoinEventResponse {
  participant: {
    id: string;
    display_name: string;
    is_lead: boolean;
  };
  token: string;
  event: {
    code: string;
    status: EventStatus;
    current_stop: number;
  };
  messages: ChatMessagePayload[];
  participants: Array<{
    id: string;
    display_name: string;
    is_lead: boolean;
    is_active: boolean;
  }>;
}

export interface MessageHistoryResponse {
  messages: ChatMessagePayload[];
}

export interface CheckoutSessionResponse {
  url: string;
}

export interface CheckoutSuccessResponse {
  event_code: string;
  event_url: string;
}

// Admin API responses

export interface AdminDashboardResponse {
  counts: Record<EventStatus, number>;
  total_revenue_events: number;
  recent_events: Array<{
    id: string;
    code: string;
    status: EventStatus;
    buyer_email: string;
    created_at: string;
  }>;
}

export interface AdminEventListResponse {
  events: Array<{
    id: string;
    code: string;
    buyer_email: string;
    status: EventStatus;
    created_at: string;
    participant_count: number;
    refund_requested: boolean;
  }>;
  total: number;
  page: number;
  per_page: number;
}

export interface AdminEventDetailResponse {
  event: Event;
  route_name: string | null;
  total_stops: number | null;
  participants: Participant[];
  messages: Message[];
  stripe_payment_id: string | null;
}

export interface AdminRouteDetailResponse {
  route: Route;
  stops: Stop[];
}

export interface AdminRouteListResponse {
  routes: Array<Route & { stop_count: number }>;
}

export interface AdminStopReorderResponse {
  success: boolean;
}

export interface AdminCreateEventResponse {
  event: {
    id: string;
    code: string;
    status: string;
    route_id: string;
    buyer_email: string | null;
    created_at: string;
    expires_at: string;
  };
}

export interface AdminMessageBankListResponse {
  message_banks: Array<{
    id: string;
    type: string;
    content: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
}

export interface AdminOpeningSequenceItem {
  id: string;
  sort_order: number;
  content: string;
  image_url: string | null;
  delay_ms: number;
}

export interface AdminOpeningSequence {
  id: string;
  name: string;
  is_active: boolean;
  items: AdminOpeningSequenceItem[];
  created_at: string;
  updated_at: string;
}

export interface AdminOpeningSequenceListResponse {
  sequences: AdminOpeningSequence[];
}

export interface AdminOpeningSequenceDetailResponse {
  sequence: AdminOpeningSequence;
}
