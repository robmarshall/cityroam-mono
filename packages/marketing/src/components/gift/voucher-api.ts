import type {
  SupportedLanguage,
  VoucherCheckoutSessionResponse,
  VoucherCheckoutSuccessResponse,
  VoucherLookupResponse,
  VoucherRedeemResponse,
} from "@cityroam/shared/types";
import {
  VOUCHER_CODE_ALPHABET,
  VOUCHER_CODE_GROUPS,
  VOUCHER_CODE_LENGTH,
} from "@cityroam/shared/constants";

/**
 * The marketing side of the gift voucher API (docs/vouchers.md). Every call
 * resolves to a tagged result rather than throwing, so the pages can map each
 * API error code to its own message and decide which ones are final.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Anything the API or the network can answer that the pages tell apart. */
export type ApiFailure = {
  ok: false;
  status: number;
  /** The API's error code, "NETWORK" when the request never got an answer. */
  code: string;
  message?: string;
  /** Seconds, from Retry-After on a 429. */
  retryAfter?: number;
};

export type ApiResult<T> = { ok: true; status: number; data: T } | ApiFailure;

function retryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    return { ok: false, status: 0, code: "NETWORK" };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // An HTML error page from a proxy, or an empty body.
  }

  if (res.ok) return { ok: true, status: res.status, data: body as T };

  const err = (body ?? {}) as { code?: unknown; error?: unknown };
  return {
    ok: false,
    status: res.status,
    code: typeof err.code === "string" ? err.code : `HTTP_${res.status}`,
    message: typeof err.error === "string" ? err.error : undefined,
    retryAfter: res.status === 429 ? retryAfterSeconds(res) : undefined,
  };
}

/**
 * JSON POST. The redeem endpoint's CSRF guard wants `application/json` and a
 * trusted Origin, which the browser adds by itself on a cross-origin fetch;
 * nothing else is set (no credentials, no custom headers) so the CORS
 * preflight stays as simple as the API expects.
 */
function postJson<T>(path: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  return call<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

export type GiftDetails = {
  language: SupportedLanguage;
  recipientName?: string;
  message?: string;
};

/** Body for POST /checkout/create-voucher-session: blank fields are left out. */
export function voucherSessionBody({ language, recipientName, message }: GiftDetails) {
  const body: { language: SupportedLanguage; recipient_name?: string; message?: string } = {
    language,
  };
  const name = recipientName?.trim();
  const text = message?.trim();
  if (name) body.recipient_name = name;
  if (text) body.message = text;
  return body;
}

export function createVoucherSession(details: GiftDetails) {
  return postJson<VoucherCheckoutSessionResponse>(
    "/checkout/create-voucher-session",
    voucherSessionBody(details),
  );
}

/**
 * The API answers INVALID_INPUT both for a bad field and for "no hunt can be
 * sold right now". The form checks the fields itself, so the second is the
 * one a buyer will actually see; the message tells them apart.
 */
export function isNoHuntAvailable(failure: ApiFailure): boolean {
  return failure.code === "INVALID_INPUT" && /no hunt/i.test(failure.message ?? "");
}

export function fetchVoucherSuccess(sessionId: string) {
  return call<VoucherCheckoutSuccessResponse>(
    `/checkout/voucher-success?session_id=${encodeURIComponent(sessionId)}`,
  );
}

/**
 * Delay before poll number `attempt` (0-based) on the success page: 1s, then
 * half as long again each time, capped at 5s. About ten tries in 30 seconds.
 */
export function pollDelay(attempt: number): number {
  return Math.min(5000, Math.round(1000 * 1.5 ** attempt));
}

// ---------------------------------------------------------------------------
// Redeeming
// ---------------------------------------------------------------------------

/**
 * What the code box shows: upper case, only letters and digits, dashes in
 * the XXXX-XXXX-XX places. Used for the prefill from the link and on blur.
 * Something that isn't a code (too long, odd characters) is upper-cased and
 * otherwise left alone, so the person can see what they typed.
 */
export function formatCodeInput(input: string): string {
  const upper = input.toUpperCase().trim();
  const raw = upper.replace(/[\s-]/g, "");
  if (raw.length !== VOUCHER_CODE_LENGTH || !/^[A-Z0-9]+$/.test(raw)) return upper;
  const parts: string[] = [];
  let i = 0;
  for (const size of VOUCHER_CODE_GROUPS) {
    parts.push(raw.slice(i, i + size));
    i += size;
  }
  return parts.join("-");
}

/** Canonical code, or null when what was typed can't be one. */
export function toVoucherCode(input: string): string | null {
  const formatted = formatCodeInput(input);
  const raw = formatted.replace(/-/g, "");
  if (raw.length !== VOUCHER_CODE_LENGTH) return null;
  for (const ch of raw) if (!VOUCHER_CODE_ALPHABET.includes(ch)) return null;
  return formatted;
}

export function lookupVoucher(code: string) {
  return call<VoucherLookupResponse>(`/vouchers/${encodeURIComponent(code)}`);
}

export function redeemVoucher(
  code: string,
  { language, email }: { language: SupportedLanguage; email?: string },
) {
  const body: { language: SupportedLanguage; email?: string } = { language };
  const trimmed = email?.trim();
  if (trimmed) body.email = trimmed;
  return postJson<VoucherRedeemResponse>(`/vouchers/${encodeURIComponent(code)}/redeem`, body);
}

/**
 * What the redemption page should say about a code, from a lookup (the
 * voucher's status) or from a refused redemption (the error code). The
 * "final" ones never come with a try-again button (docs/vouchers.md).
 */
export type CodeProblem =
  | "notACode"
  | "notFound"
  | "alreadyRedeemed"
  | "expired"
  | "refunded"
  | "void"
  | "rateLimited"
  | "noHunt"
  | "badEmail"
  | "unavailable";

export const FINAL_PROBLEMS: ReadonlySet<CodeProblem> = new Set([
  "alreadyRedeemed",
  "expired",
  "refunded",
  "void",
]);

/** Problem for a lookup that answered 200 but can't be redeemed. */
export function problemForStatus(voucher: VoucherLookupResponse): CodeProblem | null {
  if (voucher.redeemable) return null;
  switch (voucher.status) {
    case "REDEEMED":
      return "alreadyRedeemed";
    case "REFUNDED":
      return "refunded";
    case "VOID":
      return "void";
    default:
      // EXPIRED, or PURCHASED but past its date.
      return "expired";
  }
}

export function problemForFailure(failure: ApiFailure): CodeProblem {
  switch (failure.code) {
    case "INVALID_VOUCHER_CODE":
      return "notACode";
    case "VOUCHER_NOT_FOUND":
      return "notFound";
    case "VOUCHER_ALREADY_REDEEMED":
      return "alreadyRedeemed";
    case "VOUCHER_EXPIRED":
      return "expired";
    case "VOUCHER_REFUNDED":
      return "refunded";
    case "VOUCHER_VOID":
      return "void";
    case "RATE_LIMITED":
      return "rateLimited";
    case "NO_HUNT_AVAILABLE":
      return "noHunt";
    case "INVALID_INPUT":
      return "badEmail";
    default:
      return "unavailable";
  }
}

/** Whole minutes for a Retry-After, at least one. */
export function retryMinutes(seconds: number | undefined): number {
  return Math.max(1, Math.ceil((seconds ?? 60) / 60));
}
