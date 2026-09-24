import { z } from "zod";
import {
  SUPPORTED_LANGUAGES,
  VOUCHER_MESSAGE_MAX_LENGTH,
  VOUCHER_RECIPIENT_NAME_MAX_LENGTH,
  VOUCHER_STATUSES,
} from "../constants/index.js";
import type { SupportedLanguage } from "../types/enums.js";

// Control characters other than tab/newline/carriage return. They have no
// business on a printed card and some break email clients.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const languageSchema = z.enum(SUPPORTED_LANGUAGES as unknown as [SupportedLanguage, ...SupportedLanguage[]]);

/** Blank strings are treated as "not given" so an empty form field is fine. */
function optionalText(max: number, label: string, allowNewlines: boolean) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .max(max, `${label} must be at most ${max} characters`)
      .refine((v) => !CONTROL_CHARS.test(v), `${label} contains invalid characters`)
      .refine((v) => allowNewlines || !/[\r\n]/.test(v), `${label} must be a single line`)
      .optional(),
  );
}

/** POST /checkout/create-voucher-session */
export const createVoucherSessionSchema = z.object({
  /** Language of the voucher email and the redemption link. Defaults to en. */
  language: languageSchema.optional(),
  /** Restrict the voucher to one route family. Omit or null for any family. */
  route_family_id: z.string().uuid("route_family_id must be a UUID").nullable().optional(),
  recipient_name: optionalText(VOUCHER_RECIPIENT_NAME_MAX_LENGTH, "Recipient name", false),
  message: optionalText(VOUCHER_MESSAGE_MAX_LENGTH, "Message", true),
});
export type CreateVoucherSessionInput = z.infer<typeof createVoucherSessionSchema>;

/** POST /vouchers/:code/redeem */
export const redeemVoucherSchema = z.object({
  /** Language to play in; falls back to English if the family lacks it. */
  language: languageSchema.optional(),
  /** Optional: the event link is emailed here as well as returned. */
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(254).email("Invalid email").optional(),
  ),
  /**
   * Only for a voucher valid for any family: which family to play. Ignored
   * when the voucher names its own family.
   */
  route_family_id: z.string().uuid("route_family_id must be a UUID").optional(),
});
export type RedeemVoucherInput = z.infer<typeof redeemVoucherSchema>;

/** POST /admin/vouchers/:id/void */
export const adminVoidVoucherSchema = z.object({
  reason: optionalText(500, "Reason", true),
});

/** GET /admin/vouchers query string */
export const adminVoucherListQuerySchema = z.object({
  q: z.string().trim().max(254).optional(),
  status: z.enum(VOUCHER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});
