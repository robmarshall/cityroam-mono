import type { SupportedLanguage, VoucherStatus } from "./enums.js";

// ---------------------------------------------------------------------------
// Public voucher API
// ---------------------------------------------------------------------------

/** POST /checkout/create-voucher-session */
export interface VoucherCheckoutSessionResponse {
  url: string;
}

/**
 * GET /checkout/voucher-success?session_id=… — what the purchase success page
 * shows. 404 VOUCHER_NOT_FOUND until the Stripe webhook has landed; poll.
 */
export interface VoucherCheckoutSuccessResponse {
  voucher_code: string;
  expires_at: string;
  redeem_url: string;
  language: SupportedLanguage;
}

/** GET /vouchers/:code — no personal data. */
export interface VoucherLookupResponse {
  code: string;
  status: VoucherStatus;
  /** True when POST /vouchers/:code/redeem would be accepted right now. */
  redeemable: boolean;
  expires_at: string;
  /** null means the voucher is valid for any hunt. */
  route_family: { id: string; name: string; city: string } | null;
}

/** POST /vouchers/:code/redeem */
export interface VoucherRedeemResponse {
  event_code: string;
  event_url: string;
  /** 90 days from redemption. */
  event_expires_at: string;
  language: SupportedLanguage;
  /** Whether the event link was emailed (only when an email was supplied). */
  email_sent: boolean;
}

export type VoucherErrorCode =
  | "INVALID_VOUCHER_CODE"
  | "VOUCHER_NOT_FOUND"
  | "VOUCHER_ALREADY_REDEEMED"
  | "VOUCHER_EXPIRED"
  | "VOUCHER_REFUNDED"
  | "VOUCHER_VOID"
  | "NO_HUNT_AVAILABLE"
  | "RATE_LIMITED";

// ---------------------------------------------------------------------------
// Admin voucher API (session-only)
// ---------------------------------------------------------------------------

export interface AdminVoucherListItem {
  id: string;
  code: string;
  status: VoucherStatus;
  purchaser_email: string | null;
  recipient_name: string | null;
  language: SupportedLanguage;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  email_failed_at: string | null;
}

export interface AdminVoucherListResponse {
  vouchers: AdminVoucherListItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface AdminVoucherDetail extends AdminVoucherListItem {
  message: string | null;
  route_family: { id: string; name: string } | null;
  amount_total: number | null;
  currency: string | null;
  stripe_session_id: string | null;
  stripe_payment_id: string | null;
  redeemed_event: { id: string; code: string; status: string } | null;
  refunded_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  redeem_url: string;
}

export interface AdminVoucherDetailResponse {
  voucher: AdminVoucherDetail;
}

export interface AdminVoucherResendResponse {
  success: true;
  attempts: number;
}
