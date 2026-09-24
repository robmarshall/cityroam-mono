import { describe, it, expect } from "vitest";
import { SUPPORTED_LANGUAGES, GUIDE_NAMES } from "@cityroam/shared/constants";
import {
  VOUCHER_EMAIL_CONTENT,
  buildVoucherEmail,
  formatVoucherDate,
  getVoucherEmailSubject,
} from "../services/voucher-email.js";
import { buildConfirmationEmail } from "../services/email.js";

const CODE = "ABCD-EFGH-JK";
const EXPIRES = new Date("2027-09-24T12:00:00Z");

describe("voucher email", () => {
  it.each(SUPPORTED_LANGUAGES)("has complete copy in %s", (lang) => {
    const copy = VOUCHER_EMAIL_CONTENT[lang];
    for (const [key, value] of Object.entries(copy)) {
      expect(value.trim(), `${lang}.${key}`).not.toBe("");
    }
  });

  it.each(SUPPORTED_LANGUAGES)("keeps the dry voice and never mentions AI in %s", (lang) => {
    const text = Object.values(VOUCHER_EMAIL_CONTENT[lang]).join(" ");
    expect(text).not.toContain("!");
    expect(text).not.toMatch(/\b(AI|IA|KI)\b|artificial|künstlich|artificiel|kunstmatig/i);
  });

  it.each(SUPPORTED_LANGUAGES)("names Leeds and the Owl on the card in %s", (lang) => {
    const tagline = VOUCHER_EMAIL_CONTENT[lang].tagline;
    expect(tagline.startsWith("City Roam — ")).toBe(true);
    expect(tagline).toContain("Leeds");
    // The noun, not the article: German takes the dative ("von der Eule").
    expect(tagline).toContain(GUIDE_NAMES[lang].label.split(" ").pop()!);
  });

  it.each(SUPPORTED_LANGUAGES)("renders the code, localised expiry and redeem link in %s", (lang) => {
    const html = buildVoucherEmail({ code: CODE, expiresAt: EXPIRES, language: lang });
    expect(html).toContain(CODE);
    expect(html).toContain(formatVoucherDate(EXPIRES, lang));
    expect(html).toContain(`https://marketing.test.com/${lang}/redeem?code=${CODE}`);
    expect(html).toContain(VOUCHER_EMAIL_CONTENT[lang].tagline);
    expect(getVoucherEmailSubject(lang)).toBe(VOUCHER_EMAIL_CONTENT[lang].subject);
  });

  it("formats the expiry date per language", () => {
    expect(formatVoucherDate(EXPIRES, "en")).toBe("24 September 2027");
    expect(formatVoucherDate(EXPIRES, "de")).toBe("24. September 2027");
    expect(formatVoucherDate(EXPIRES, "fr")).toBe("24 septembre 2027");
  });

  it("escapes the buyer's recipient name and message and keeps line breaks", () => {
    const html = buildVoucherEmail({
      code: CODE,
      expiresAt: EXPIRES,
      language: "en",
      recipientName: "<script>alert(1)</script>",
      message: "Line one\nLine <b>two</b> & more",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Line one<br>Line &lt;b&gt;two&lt;/b&gt; &amp; more");
    expect(html).toContain("For &lt;script&gt;");
  });

  it("omits the recipient block when there is none", () => {
    const html = buildVoucherEmail({ code: CODE, expiresAt: EXPIRES, language: "en" });
    expect(html).not.toContain(">For ");
  });

  it("falls back to English for an unknown language", () => {
    expect(getVoucherEmailSubject("it")).toBe(VOUCHER_EMAIL_CONTENT.en.subject);
  });
});

describe("gift variant of the event-code email", () => {
  it.each(SUPPORTED_LANGUAGES)("swaps the refund line for the gift line in %s", (lang) => {
    const purchase = buildConfirmationEmail("https://app/event/x", "abcd2345", lang);
    const gift = buildConfirmationEmail("https://app/event/x", "abcd2345", lang, "gift");
    expect(gift).not.toBe(purchase);
    expect(gift).toContain("abcd2345");
    const footer = gift.match(/<p style="color: #999; font-size: 13px;">\s*([^<]+?)\s*<\/p>/)?.[1] ?? "";
    expect(footer).not.toBe("");
    expect(footer).not.toContain("!");
    expect(purchase).not.toContain(footer);
  });
});
