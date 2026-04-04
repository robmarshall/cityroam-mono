import type { EventStatus, SupportedLanguage } from "./enums.js";
import type { Event, Message, Participant, Route, RouteBlock, RouteFamily, RouteGroup } from "./entities.js";
import type { ChatMessagePayload } from "./websocket.js";

// Public API responses

export interface EventDetailResponse {
  event: {
    code: string;
    status: EventStatus;
    current_stop: number;
    started_at: string | null;
    created_at: string;
    language: SupportedLanguage;
  };
  available_languages: SupportedLanguage[];
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
    language: SupportedLanguage;
  };
  available_languages: SupportedLanguage[];
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
  participants: Omit<Participant, "token">[];
  messages: Message[];
  stripe_payment_id: string | null;
}

export type AdminRouteGroupResponse = RouteGroup & {
  blocks: RouteBlock[];
};

export interface AdminRouteDetailResponse {
  route: Route;
  route_family: RouteFamily;
  groups: AdminRouteGroupResponse[];
}

export interface AdminRouteListResponse {
  routes: Array<Route & { group_count: number }>;
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
    language: string;
    content: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
}

export interface AdminRouteFamilyListResponse {
  route_families: Array<RouteFamily & { routes: Array<{ id: string; language: SupportedLanguage; name: string; is_active: boolean }> }>;
}

export interface AdminRouteFamilyDetailResponse {
  route_family: RouteFamily;
  routes: Array<Route & { group_count: number }>;
}