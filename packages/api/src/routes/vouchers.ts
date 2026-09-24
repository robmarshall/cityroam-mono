import { Hono } from "hono";
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import type {
  VoucherLookupResponse,
  VoucherRedeemResponse,
  VoucherStatus,
} from "@cityroam/shared/types";
import { buildEventUrl, normalizeVoucherCode } from "@cityroam/shared/utils";
import { redeemVoucherSchema } from "@cityroam/shared/validation";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { routeFamilies, vouchers } from "../db/schema/index.js";
import { AppError, csrfGuard } from "../middleware/index.js";
import { clientIp } from "../lib/client-ip.js";
import { createLogger } from "../lib/logger.js";
import {
  checkVoucherLookupRateLimit,
  checkVoucherRedeemRateLimit,
} from "../redis/rate-limit.js";
import { isRedeemable, redeemVoucher } from "../services/vouchers.js";

/**
 * Public gift voucher endpoints, called by the marketing redemption page
 * (`/<locale>/redeem?code=…`). No personal data leaves here: the lookup
 * returns status, expiry and family only.
 */
export const voucherRoutes = new Hono();

const log = createLogger("vouchers");

async function enforce(
  c: Context,
  check: (ip: string) => Promise<{ allowed: boolean; retryAfterSeconds: number; current: number }>,
  kind: string,
): Promise<void> {
  const ip = clientIp(c);
  const limit = await check(ip);
  if (!limit.allowed) {
    log.warn("voucher endpoint rate limited", { kind, ip, requests: limit.current });
    c.header("Retry-After", String(limit.retryAfterSeconds));
    throw new AppError(429, "Too many attempts. Try again later.", "RATE_LIMITED");
  }
}

function parseCode(c: Context): string {
  const code = normalizeVoucherCode(c.req.param("code"));
  if (!code) {
    throw new AppError(400, "That is not a valid voucher code", "INVALID_VOUCHER_CODE");
  }
  return code;
}

// GET /vouchers/:code — status, expiry and family. No personal data.
voucherRoutes.get("/vouchers/:code", async (c) => {
  await enforce(c, checkVoucherLookupRateLimit, "lookup");
  const code = parseCode(c);

  const voucher = await db.query.vouchers.findFirst({
    where: eq(vouchers.code, code),
    columns: { code: true, status: true, expires_at: true, route_family_id: true },
  });
  if (!voucher) {
    throw new AppError(404, "Voucher not found", "VOUCHER_NOT_FOUND");
  }

  const family = voucher.route_family_id
    ? await db.query.routeFamilies.findFirst({
        where: eq(routeFamilies.id, voucher.route_family_id),
        columns: { id: true, name: true, city: true },
      })
    : null;

  const now = new Date();
  // A PURCHASED voucher past its date reads as EXPIRED before the sweep runs.
  const status: VoucherStatus =
    voucher.status === "PURCHASED" && voucher.expires_at.getTime() <= now.getTime()
      ? "EXPIRED"
      : (voucher.status as VoucherStatus);

  const response: VoucherLookupResponse = {
    code: voucher.code,
    status,
    redeemable: isRedeemable(voucher, now),
    expires_at: voucher.expires_at.toISOString(),
    route_family: family ? { id: family.id, name: family.name, city: family.city } : null,
  };
  return c.json(response, 200);
});

// POST /vouchers/:code/redeem — creates the event. JSON only, trusted origins only.
voucherRoutes.post("/vouchers/:code/redeem", csrfGuard, async (c) => {
  await enforce(c, checkVoucherRedeemRateLimit, "redeem");
  const code = parseCode(c);

  const body = await c.req.json().catch(() => ({}));
  const input = redeemVoucherSchema.parse(body ?? {});

  const result = await redeemVoucher(code, input);

  const response: VoucherRedeemResponse = {
    event_code: result.eventCode,
    event_url: buildEventUrl(env.APP_PUBLIC_URL, result.eventCode),
    event_expires_at: result.eventExpiresAt.toISOString(),
    language: result.language,
    email_sent: result.emailSent,
  };
  return c.json(response, 201);
});
