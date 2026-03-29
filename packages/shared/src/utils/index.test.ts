import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  generateEventCode,
  buildEventUrl,
  buildS3Key,
  buildS3Url,
  formatTimestamp,
  isValidEventCode,
} from "./index.js";
import { EVENT_CODE_LENGTH, EVENT_CODE_ALPHABET } from "../constants/index.js";

describe("generateEventCode", () => {
  it("returns a string of EVENT_CODE_LENGTH", () => {
    const code = generateEventCode();
    expect(code).toHaveLength(EVENT_CODE_LENGTH);
  });

  it("only uses characters from EVENT_CODE_ALPHABET", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateEventCode();
      for (const char of code) {
        expect(EVENT_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it("generates unique codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateEventCode());
    }
    expect(codes.size).toBeGreaterThan(90);
  });
});

describe("buildEventUrl", () => {
  it("constructs the correct URL", () => {
    expect(buildEventUrl("https://example.com", "ABCD1234")).toBe(
      "https://example.com/event/ABCD1234",
    );
  });

  it("does not add extra slashes", () => {
    const url = buildEventUrl("https://example.com", "CODE");
    expect(url).not.toContain("//event");
  });
});

describe("buildS3Key", () => {
  it("constructs the correct S3 key", () => {
    expect(buildS3Key("route-1", 3, "photo.jpg")).toBe(
      "routes/route-1/stops/3/photo.jpg",
    );
  });
});

describe("buildS3Url", () => {
  it("constructs the full CDN URL", () => {
    expect(buildS3Url("https://cdn.example.com", "routes/1/stops/2/img.png")).toBe(
      "https://cdn.example.com/routes/1/stops/2/img.png",
    );
  });

  it("strips trailing slash from cdnBaseUrl", () => {
    expect(buildS3Url("https://cdn.example.com/", "key")).toBe(
      "https://cdn.example.com/key",
    );
  });

  it("handles cdnBaseUrl without trailing slash", () => {
    expect(buildS3Url("https://cdn.example.com", "key")).toBe(
      "https://cdn.example.com/key",
    );
  });
});

describe("formatTimestamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T14:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns time only for today", () => {
    const today = new Date("2026-03-27T09:15:00Z");
    const result = formatTimestamp(today);
    // Should only contain time, no date component
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns date and time for older messages", () => {
    const yesterday = new Date("2026-03-26T09:15:00Z");
    const result = formatTimestamp(yesterday);
    // Should contain month abbreviation and time
    expect(result).toMatch(/\d+ \w+, \d{2}:\d{2}/);
  });

  it("returns date and time for messages from a different year", () => {
    const lastYear = new Date("2025-12-25T10:00:00Z");
    const result = formatTimestamp(lastYear);
    expect(result).toMatch(/\d+ \w+, \d{2}:\d{2}/);
  });
});

describe("isValidEventCode", () => {
  it("returns true for valid lowercase codes", () => {
    expect(isValidEventCode("abcdefgh")).toBe(true);
    expect(isValidEventCode("23456789")).toBe(true);
    expect(isValidEventCode("ab3def4h")).toBe(true);
  });

  it("returns false for wrong length", () => {
    expect(isValidEventCode("abcdefg")).toBe(false); // too short
    expect(isValidEventCode("abcdefghj")).toBe(false); // too long
    expect(isValidEventCode("")).toBe(false);
  });

  it("returns false for codes with ambiguous characters", () => {
    expect(isValidEventCode("abcdefg0")).toBe(false); // contains 0
    expect(isValidEventCode("abcdefgo")).toBe(false); // contains o
    expect(isValidEventCode("abcdefg1")).toBe(false); // contains 1
    expect(isValidEventCode("abcdefgi")).toBe(false); // contains i
    expect(isValidEventCode("abcdefgl")).toBe(false); // contains l
  });

  it("returns false for uppercase characters", () => {
    expect(isValidEventCode("ABCDEFGH")).toBe(false);
  });
});
