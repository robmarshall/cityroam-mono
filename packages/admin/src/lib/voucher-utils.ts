import type { VoucherStatus } from "@cityroam/shared/types";
import { VOUCHER_STATUSES } from "@cityroam/shared/constants";

export const VOUCHER_STATUS_ORDER: readonly VoucherStatus[] = VOUCHER_STATUSES;

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  PURCHASED: "Unredeemed",
  REDEEMED: "Redeemed",
  REFUNDED: "Refunded",
  EXPIRED: "Expired",
  VOID: "Void",
};

export const VOUCHER_STATUS_COLORS: Record<VoucherStatus, { bg: string; text: string }> = {
  PURCHASED: { bg: "bg-blue-100", text: "text-blue-700" },
  REDEEMED: { bg: "bg-green-100", text: "text-green-700" },
  REFUNDED: { bg: "bg-orange-100", text: "text-orange-700" },
  EXPIRED: { bg: "bg-red-100", text: "text-red-700" },
  VOID: { bg: "bg-gray-200", text: "text-gray-700" },
};

/** Only an unredeemed voucher can be voided (an expired one too, to record why). */
export function canVoid(status: VoucherStatus): boolean {
  return status === "PURCHASED" || status === "EXPIRED";
}

/** Resending the code only makes sense while it can still be redeemed. */
export function canResend(status: VoucherStatus, purchaserEmail: string | null): boolean {
  return status === "PURCHASED" && Boolean(purchaserEmail);
}

export function formatMoney(amountMinor: number | null, currency: string | null): string {
  if (amountMinor == null || !currency) return "—";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(
      amountMinor / 100,
    );
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
