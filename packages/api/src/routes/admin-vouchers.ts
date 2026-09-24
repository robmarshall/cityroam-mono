import { Hono } from "hono";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type {
  AdminVoucherDetail,
  AdminVoucherDetailResponse,
  AdminVoucherListItem,
  AdminVoucherListResponse,
  AdminVoucherResendResponse,
  SupportedLanguage,
  VoucherStatus,
} from "@cityroam/shared/types";
import { adminVoidVoucherSchema, adminVoucherListQuerySchema } from "@cityroam/shared/validation";
import { buildVoucherRedeemUrl, normalizeVoucherCode } from "@cityroam/shared/utils";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events, routeFamilies, vouchers } from "../db/schema/index.js";
import { AppError } from "../middleware/error-handler.js";
import { requireAdmin } from "../middleware/admin.js";
import { createLogger } from "../lib/logger.js";
import { sendVoucherEmail } from "../services/voucher-email.js";

const log = createLogger("admin-vouchers");

/**
 * Admin voucher management. Session-only: vouchers carry buyer emails and
 * gift messages, and voiding one destroys a paid-for entitlement, so no API
 * key may touch them.
 */
export const adminVoucherRoutes = new Hono();

const sessionOnly = requireAdmin("session-only");

type VoucherRow = typeof vouchers.$inferSelect;

function toListItem(row: VoucherRow): AdminVoucherListItem {
  return {
    id: row.id,
    code: row.code,
    status: row.status as VoucherStatus,
    purchaser_email: row.purchaser_email ?? null,
    recipient_name: row.recipient_name ?? null,
    language: row.language as SupportedLanguage,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    redeemed_at: row.redeemed_at?.toISOString() ?? null,
    email_failed_at: row.email_failed_at?.toISOString() ?? null,
  };
}

/** Escapes LIKE wildcards so a search for "a_b" means that literally. */
function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

async function loadVoucher(id: string): Promise<VoucherRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AppError(404, "Voucher not found", "VOUCHER_NOT_FOUND");
  }
  const row = await db.query.vouchers.findFirst({ where: eq(vouchers.id, id) });
  if (!row) throw new AppError(404, "Voucher not found", "VOUCHER_NOT_FOUND");
  return row;
}

async function toDetail(row: VoucherRow): Promise<AdminVoucherDetail> {
  const family = row.route_family_id
    ? await db.query.routeFamilies.findFirst({
        where: eq(routeFamilies.id, row.route_family_id),
        columns: { id: true, name: true },
      })
    : null;
  const event = row.redeemed_event_id
    ? await db.query.events.findFirst({
        where: eq(events.id, row.redeemed_event_id),
        columns: { id: true, code: true, status: true },
      })
    : null;

  return {
    ...toListItem(row),
    message: row.message ?? null,
    route_family: family ? { id: family.id, name: family.name } : null,
    amount_total: row.amount_total ?? null,
    currency: row.currency ?? null,
    stripe_session_id: row.stripe_session_id ?? null,
    stripe_payment_id: row.stripe_payment_id ?? null,
    redeemed_event: event ? { id: event.id, code: event.code, status: event.status } : null,
    refunded_at: row.refunded_at?.toISOString() ?? null,
    voided_at: row.voided_at?.toISOString() ?? null,
    void_reason: row.void_reason ?? null,
    email_sent_at: row.email_sent_at?.toISOString() ?? null,
    email_error: row.email_error ?? null,
    redeem_url: buildVoucherRedeemUrl(env.MARKETING_URL, row.language, row.code),
  };
}

// GET /admin/vouchers?q=&status=&page=&per_page= — newest first
adminVoucherRoutes.get("/admin/vouchers", sessionOnly, async (c) => {
  const query = adminVoucherListQuerySchema.parse({
    q: c.req.query("q") || undefined,
    status: c.req.query("status") || undefined,
    page: c.req.query("page") ?? undefined,
    per_page: c.req.query("per_page") ?? undefined,
  });

  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(vouchers.status, query.status));
  if (query.q) {
    const asCode = normalizeVoucherCode(query.q);
    const search = asCode
      ? eq(vouchers.code, asCode)
      : or(ilike(vouchers.code, likeTerm(query.q)), ilike(vouchers.purchaser_email, likeTerm(query.q)));
    if (search) conditions.push(search);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRows = await db.select({ count: count() }).from(vouchers).where(where);
  const rows = await db
    .select()
    .from(vouchers)
    .where(where)
    .orderBy(desc(vouchers.created_at))
    .limit(query.per_page)
    .offset((query.page - 1) * query.per_page);

  const response: AdminVoucherListResponse = {
    vouchers: rows.map(toListItem),
    total: Number(totalRows[0]?.count ?? 0),
    page: query.page,
    per_page: query.per_page,
  };
  return c.json(response, 200);
});

// GET /admin/vouchers/:id
adminVoucherRoutes.get("/admin/vouchers/:id", sessionOnly, async (c) => {
  const row = await loadVoucher(c.req.param("id"));
  const response: AdminVoucherDetailResponse = { voucher: await toDetail(row) };
  return c.json(response, 200);
});

// POST /admin/vouchers/:id/void — cancels an unredeemed voucher. No refund is issued.
adminVoucherRoutes.post("/admin/vouchers/:id/void", sessionOnly, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const data = adminVoidVoucherSchema.parse(body ?? {});
  const row = await loadVoucher(id);

  if (row.status !== "PURCHASED" && row.status !== "EXPIRED") {
    throw new AppError(
      409,
      `A ${row.status.toLowerCase()} voucher cannot be voided`,
      "VOUCHER_NOT_VOIDABLE",
    );
  }

  // Compare-and-swap so a redemption landing at the same moment wins or loses cleanly.
  const updated = await db
    .update(vouchers)
    .set({ status: "VOID", voided_at: new Date(), void_reason: data.reason ?? null })
    .where(and(eq(vouchers.id, row.id), eq(vouchers.status, row.status)))
    .returning();

  if (updated.length === 0) {
    throw new AppError(409, "The voucher changed while voiding; reload and try again", "VOUCHER_NOT_VOIDABLE");
  }

  log.info("voucher voided", { voucherId: row.id, admin: c.get("admin")?.username ?? null });
  const response: AdminVoucherDetailResponse = { voucher: await toDetail(updated[0]) };
  return c.json(response, 200);
});

// POST /admin/vouchers/:id/resend-email — sends the voucher email to the buyer again
adminVoucherRoutes.post("/admin/vouchers/:id/resend-email", sessionOnly, async (c) => {
  const row = await loadVoucher(c.req.param("id"));

  if (row.status !== "PURCHASED") {
    throw new AppError(
      409,
      `A ${row.status.toLowerCase()} voucher cannot be resent`,
      "VOUCHER_NOT_RESENDABLE",
    );
  }
  if (!row.purchaser_email) {
    throw new AppError(400, "Voucher has no purchaser email", "NO_PURCHASER_EMAIL");
  }

  const outcome = await sendVoucherEmail({
    voucherId: row.id,
    to: row.purchaser_email,
    code: row.code,
    expiresAt: row.expires_at,
    language: row.language,
    recipientName: row.recipient_name,
    message: row.message,
  });

  if (!outcome.sent) {
    throw new AppError(
      502,
      `Could not send the email after ${outcome.attempts} attempt${outcome.attempts === 1 ? "" : "s"}: ${outcome.error ?? "unknown error"}`,
      "EMAIL_SEND_FAILED",
    );
  }

  const response: AdminVoucherResendResponse = { success: true, attempts: outcome.attempts };
  return c.json(response, 200);
});
