import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { canResend, canVoid, formatMoney, VOUCHER_STATUS_LABELS } from "../lib/voucher-utils";
import { VOUCHER_STATUSES } from "@cityroam/shared/constants";

// No DOM environment in this package: pages are rendered with
// react-dom/server, and the button rules are tested through the helpers the
// page uses to enable them.

const store = new Map<string, string>();
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store.clear();
  store.set("cityroam_admin_token", "session-jwt");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => vi.unstubAllGlobals());

describe("voucher admin helpers", () => {
  it("labels every status", () => {
    for (const s of VOUCHER_STATUSES) expect(VOUCHER_STATUS_LABELS[s]).toBeTruthy();
  });

  it("only offers Void for an unredeemed voucher", () => {
    expect(canVoid("PURCHASED")).toBe(true);
    expect(canVoid("EXPIRED")).toBe(true);
    expect(canVoid("REDEEMED")).toBe(false);
    expect(canVoid("REFUNDED")).toBe(false);
    expect(canVoid("VOID")).toBe(false);
  });

  it("only offers Resend for a redeemable voucher with a buyer email", () => {
    expect(canResend("PURCHASED", "a@example.com")).toBe(true);
    expect(canResend("PURCHASED", null)).toBe(false);
    expect(canResend("REDEEMED", "a@example.com")).toBe(false);
  });

  it("formats minor units as money", () => {
    expect(formatMoney(4500, "gbp")).toBe("£45.00");
    expect(formatMoney(null, "gbp")).toBe("—");
  });
});

describe("voucher pages", () => {
  it("renders the list page with an explicit Search button and sends nothing while rendering", async () => {
    const { AuthProvider } = await import("../contexts/AuthContext");
    const { default: VouchersListPage } = await import("../pages/VouchersListPage");
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(AuthProvider, null, createElement(VouchersListPage))),
    );
    expect(html).toContain("Gift Vouchers");
    expect(html).toContain(">Search<");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders the detail page loading state", async () => {
    const { AuthProvider } = await import("../contexts/AuthContext");
    const { default: VoucherDetailPage } = await import("../pages/VoucherDetailPage");
    const html = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ["/vouchers/abc"] },
        createElement(
          AuthProvider,
          null,
          createElement(Routes, null, createElement(Route, { path: "/vouchers/:id", element: createElement(VoucherDetailPage) })),
        ),
      ),
    );
    expect(html).toContain("Loading voucher");
  });
});
