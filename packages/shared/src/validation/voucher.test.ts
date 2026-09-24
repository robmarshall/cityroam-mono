import { describe, expect, it } from "vitest";
import {
  adminVoucherListQuerySchema,
  createVoucherSessionSchema,
  redeemVoucherSchema,
} from "./index.js";

const FAMILY = "11111111-1111-4111-8111-111111111111";

describe("createVoucherSessionSchema", () => {
  it("accepts an empty body (English, any family)", () => {
    expect(createVoucherSessionSchema.parse({})).toEqual({});
  });

  it("trims and keeps the optional gift fields", () => {
    expect(
      createVoucherSessionSchema.parse({
        language: "nl",
        route_family_id: FAMILY,
        recipient_name: "  Sam ",
        message: " Line one\nLine two ",
      }),
    ).toEqual({ language: "nl", route_family_id: FAMILY, recipient_name: "Sam", message: "Line one\nLine two" });
  });

  it("treats blank strings as not given", () => {
    expect(createVoucherSessionSchema.parse({ recipient_name: "   ", message: "" })).toEqual({
      recipient_name: undefined,
      message: undefined,
    });
  });

  it("caps lengths and rejects control characters and multi-line names", () => {
    expect(createVoucherSessionSchema.safeParse({ recipient_name: "x".repeat(60) }).success).toBe(true);
    expect(createVoucherSessionSchema.safeParse({ recipient_name: "x".repeat(61) }).success).toBe(false);
    expect(createVoucherSessionSchema.safeParse({ message: "y".repeat(300) }).success).toBe(true);
    expect(createVoucherSessionSchema.safeParse({ message: "y".repeat(301) }).success).toBe(false);
    expect(createVoucherSessionSchema.safeParse({ message: "bell\u0007" }).success).toBe(false);
    expect(createVoucherSessionSchema.safeParse({ recipient_name: "Sam\nSmith" }).success).toBe(false);
  });

  it("rejects unknown languages and non-UUID families", () => {
    expect(createVoucherSessionSchema.safeParse({ language: "it" }).success).toBe(false);
    expect(createVoucherSessionSchema.safeParse({ route_family_id: "leeds" }).success).toBe(false);
  });
});

describe("redeemVoucherSchema", () => {
  it("makes every field optional", () => {
    expect(redeemVoucherSchema.parse({})).toEqual({});
    expect(redeemVoucherSchema.parse({ email: "" })).toEqual({ email: undefined });
  });

  it("validates the email", () => {
    expect(redeemVoucherSchema.parse({ email: " a@example.com " }).email).toBe("a@example.com");
    expect(redeemVoucherSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("adminVoucherListQuerySchema", () => {
  it("defaults paging and validates the status", () => {
    expect(adminVoucherListQuerySchema.parse({})).toEqual({ page: 1, per_page: 20 });
    expect(adminVoucherListQuerySchema.parse({ status: "VOID", page: "2", per_page: "50" })).toEqual({
      status: "VOID",
      page: 2,
      per_page: 50,
    });
    expect(adminVoucherListQuerySchema.safeParse({ status: "NOPE" }).success).toBe(false);
    expect(adminVoucherListQuerySchema.safeParse({ per_page: "500" }).success).toBe(false);
  });
});
