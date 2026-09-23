import type { EventStatus, SupportedLanguage } from "./enums.js";
import type { AdminApiKeyScope } from "../constants/index.js";
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
  /**
   * Set while the hunt is parked on an action block waiting for the lead to
   * confirm. Lets a client that missed (or reloaded past) the action_waiting
   * broadcast rebuild the confirm prompt.
   */
  pending_action: {
    block_id: string;
    label: string;
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
    /**
     * Set when every attempt to email the event code failed. The buyer has no
     * other lasting copy of the code, so the list flags it for a resend.
     */
    code_email_failed_at?: string | null;
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
  /**
   * Delivery state of the email carrying the event code. `failed_at` and
   * `error` are set when every send attempt failed and cleared by a later
   * successful send (including an admin resend).
   */
  code_email: {
    sent_at: string | null;
    failed_at: string | null;
    error: string | null;
  };
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
    route_family_id: string;
    language: string;
    buyer_email: string | null;
    created_at: string;
    expires_at: string;
  };
}

/** POST /admin/upload */
export interface AdminImageUploadResponse {
  /** Pre-signed S3 PUT URL (expires after 5 minutes). */
  upload_url: string;
  /** S3 object key the PUT writes to. */
  key: string;
  /** Public CDN URL of the object once uploaded. */
  url: string;
  /** Present for slug uploads: the `{{IMAGE:slug}}` placeholder that resolves to `url`. */
  slug?: string;
  placeholder?: string;
}

/** GET /admin/route-images/:slug — where a `{{IMAGE:slug}}` placeholder resolves. */
export interface AdminRouteImageResponse {
  slug: string;
  key: string;
  placeholder: string;
  /** CDN URL the placeholder resolves to, or null when no CDN base is configured. */
  url: string | null;
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
// --- Admin API keys ---

/** A key as listed in the admin panel. The secret is never returned again. */
export interface AdminApiKey {
  id: string;
  name: string;
  /** `crk_<env>_<keyId>` — the non-secret part of the token. */
  prefix: string;
  /** Last four characters of the secret, for recognising a key. */
  last4: string;
  scopes: AdminApiKeyScope[];
  created_by: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}

export interface AdminApiKeyListResponse {
  api_keys: AdminApiKey[];
}

/** Returned once, at creation: `token` is the only time the full secret is shown. */
export interface AdminApiKeyCreateResponse {
  api_key: AdminApiKey;
  token: string;
}
