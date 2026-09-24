import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildVoucherRedeemUrl,
  formatVoucherCode,
  generateVoucherCode,
  isValidVoucherCode,
  normalizeVoucherCode,
} from "./index.js";
import { VOUCHER_CODE_ALPHABET, VOUCHER_CODE_LENGTH } from "../constants/index.js";

const FORMAT = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/;

describe("voucher codes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses an alphabet with no look-alike characters", () => {
    expect(VOUCHER_CODE_ALPHABET).toHaveLength(31);
    for (const ch of "01OIL") expect(VOUCHER_CODE_ALPHABET).not.toContain(ch);
    expect(new Set(VOUCHER_CODE_ALPHABET).size).toBe(VOUCHER_CODE_ALPHABET.length);
  });

  it("generates XXXX-XXXX-XX codes from the alphabet only", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateVoucherCode();
      expect(code).toMatch(FORMAT);
      for (const ch of code.replace(/-/g, "")) expect(VOUCHER_CODE_ALPHABET).toContain(ch);
      expect(isValidVoucherCode(code)).toBe(true);
    }
  });

  it("does not repeat across many draws and uses every character", () => {
    const codes = new Set<string>();
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const code = generateVoucherCode();
      codes.add(code);
      for (const ch of code) seen.add(ch);
    }
    expect(codes.size).toBe(20_000);
    for (const ch of VOUCHER_CODE_ALPHABET) expect(seen).toContain(ch);
  });

  it("rejects biased bytes instead of folding them with a modulo", () => {
    // 248 = 256 - (256 % 31) is the first byte that would bias the draw.
    let call = 0;
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((arr: Uint8Array) => {
      call++;
      arr.fill(call === 1 ? 250 : 0);
      return arr;
    }) as typeof crypto.getRandomValues);
    expect(generateVoucherCode()).toBe("AAAA-AAAA-AA");
    expect(call).toBe(2);
  });

  it("normalises what people type", () => {
    expect(normalizeVoucherCode("abcd-efgh-jk")).toBe("ABCD-EFGH-JK");
    expect(normalizeVoucherCode(" abcd efgh jk ")).toBe("ABCD-EFGH-JK");
    expect(normalizeVoucherCode("ABCDEFGHJK")).toBe("ABCD-EFGH-JK");
  });

  it("refuses anything that cannot be a code", () => {
    expect(normalizeVoucherCode("ABCD-EFGH-J")).toBeNull();
    expect(normalizeVoucherCode("ABCD-EFGH-JKM")).toBeNull();
    expect(normalizeVoucherCode("ABCD-EFGH-J0")).toBeNull(); // zero
    expect(normalizeVoucherCode("ABCD-EFGH-JO")).toBeNull(); // letter O
    expect(normalizeVoucherCode("ABCD-EFGH-J1")).toBeNull();
    expect(normalizeVoucherCode("ABCD/EFGH/JK")).toBeNull();
    expect(normalizeVoucherCode(12345)).toBeNull();
    expect(normalizeVoucherCode("A".repeat(100))).toBeNull();
    expect(isValidVoucherCode("abcd-efgh-jk")).toBe(false);
  });

  it("formats a bare code into its groups", () => {
    expect(formatVoucherCode("ABCDEFGHJK")).toBe("ABCD-EFGH-JK");
    expect(VOUCHER_CODE_LENGTH).toBe(10);
  });

  it("builds the locale-prefixed redemption link", () => {
    expect(buildVoucherRedeemUrl("https://cityroam.co.uk", "fr", "ABCD-EFGH-JK")).toBe(
      "https://cityroam.co.uk/fr/redeem?code=ABCD-EFGH-JK",
    );
    expect(buildVoucherRedeemUrl("https://cityroam.co.uk/", "en", "ABCD-EFGH-JK")).toBe(
      "https://cityroam.co.uk/en/redeem?code=ABCD-EFGH-JK",
    );
  });
});
