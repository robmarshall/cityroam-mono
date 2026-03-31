import { describe, expect, it } from "vitest";
import {
  MAX_PARTICIPANTS,
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_GUIDE_RESPONSES_PER_EVENT,
  PARTICIPANT_OFFLINE_TIMEOUT_MS,
  IDLE_PROMPT_TIMEOUT_MS,
  IDLE_PAUSE_TIMEOUT_MS,
  WEBSOCKET_PING_INTERVAL_MS,
  TYPING_INDICATOR_DEBOUNCE_MS,
  GUIDE_RATE_LIMIT_MS,
  PARTICIPANT_RATE_LIMIT_COUNT,
  PARTICIPANT_RATE_LIMIT_WINDOW_MS,
  EVENT_EXPIRY_DAYS,
  SESSION_TOKEN_EXPIRY_HOURS,
  EVENT_CODE_LENGTH,
  EVENT_CODE_ALPHABET,
} from "./index.js";

describe("constants", () => {
  describe("game limits", () => {
    it("MAX_PARTICIPANTS is 10", () => {
      expect(MAX_PARTICIPANTS).toBe(10);
    });

    it("MAX_MESSAGE_LENGTH is 200", () => {
      expect(MAX_MESSAGE_LENGTH).toBe(200);
    });

    it("MIN_MESSAGE_LENGTH is 2", () => {
      expect(MIN_MESSAGE_LENGTH).toBe(2);
    });

    it("MAX_DISPLAY_NAME_LENGTH is 30", () => {
      expect(MAX_DISPLAY_NAME_LENGTH).toBe(30);
    });

    it("MAX_GUIDE_RESPONSES_PER_EVENT is 100", () => {
      expect(MAX_GUIDE_RESPONSES_PER_EVENT).toBe(100);
    });
  });

  describe("timeouts", () => {
    it("PARTICIPANT_OFFLINE_TIMEOUT_MS is 10 minutes", () => {
      expect(PARTICIPANT_OFFLINE_TIMEOUT_MS).toBe(600_000);
    });

    it("IDLE_PROMPT_TIMEOUT_MS is 60 minutes", () => {
      expect(IDLE_PROMPT_TIMEOUT_MS).toBe(3_600_000);
    });

    it("IDLE_PAUSE_TIMEOUT_MS is 90 minutes", () => {
      expect(IDLE_PAUSE_TIMEOUT_MS).toBe(5_400_000);
    });

    it("WEBSOCKET_PING_INTERVAL_MS is 30 seconds", () => {
      expect(WEBSOCKET_PING_INTERVAL_MS).toBe(30_000);
    });

    it("TYPING_INDICATOR_DEBOUNCE_MS is 3 seconds", () => {
      expect(TYPING_INDICATOR_DEBOUNCE_MS).toBe(3_000);
    });

    it("GUIDE_RATE_LIMIT_MS is 5 seconds", () => {
      expect(GUIDE_RATE_LIMIT_MS).toBe(5_000);
    });

    it("PARTICIPANT_RATE_LIMIT_COUNT is 3", () => {
      expect(PARTICIPANT_RATE_LIMIT_COUNT).toBe(3);
    });

    it("PARTICIPANT_RATE_LIMIT_WINDOW_MS is 10 seconds", () => {
      expect(PARTICIPANT_RATE_LIMIT_WINDOW_MS).toBe(10_000);
    });
  });

  describe("event lifecycle", () => {
    it("EVENT_EXPIRY_DAYS is 90", () => {
      expect(EVENT_EXPIRY_DAYS).toBe(90);
    });

    it("SESSION_TOKEN_EXPIRY_HOURS is 24", () => {
      expect(SESSION_TOKEN_EXPIRY_HOURS).toBe(24);
    });
  });

  describe("event code config", () => {
    it("EVENT_CODE_LENGTH is 8", () => {
      expect(EVENT_CODE_LENGTH).toBe(8);
    });

    it("EVENT_CODE_ALPHABET excludes ambiguous characters", () => {
      expect(EVENT_CODE_ALPHABET).not.toContain("0");
      expect(EVENT_CODE_ALPHABET).not.toContain("o");
      expect(EVENT_CODE_ALPHABET).not.toContain("1");
      expect(EVENT_CODE_ALPHABET).not.toContain("i");
      expect(EVENT_CODE_ALPHABET).not.toContain("l");
    });

    it("EVENT_CODE_ALPHABET contains expected lowercase characters", () => {
      expect(EVENT_CODE_ALPHABET).toContain("a");
      expect(EVENT_CODE_ALPHABET).toContain("z");
      expect(EVENT_CODE_ALPHABET).toContain("2");
      expect(EVENT_CODE_ALPHABET).toContain("9");
    });
  });
});
