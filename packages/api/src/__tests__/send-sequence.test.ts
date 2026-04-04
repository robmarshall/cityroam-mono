import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mock redis/index ────────────────────────────────────────────────
vi.mock("../redis/index.js", () => ({
  appendMessage: vi.fn().mockResolvedValue(undefined),
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishTyping: vi.fn().mockResolvedValue(undefined),
  publishControl: vi.fn().mockResolvedValue(undefined),
  removeMessage: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock answer-attempt (writeGuideMessage) ─────────────────────────
vi.mock("../services/pipeline/handlers/answer-attempt.js", () => ({
  writeGuideMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { publishTyping } from "../redis/index.js";
import { writeGuideMessage } from "../services/pipeline/handlers/answer-attempt.js";
import { sendSequence } from "../services/send-sequence.js";

import type { SequenceItem } from "@cityroam/shared/types";

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Helpers ─────────────────────────────────────────────────────────

function makeItem(overrides: Partial<SequenceItem> = {}): SequenceItem {
  return {
    content: "Hello there",
    image_url: null,
    delay_ms: 0,
    ...overrides,
  };
}

// =====================================================================
// sendSequence
// =====================================================================

describe("sendSequence", () => {
  it("sends each item via writeGuideMessage in order", async () => {
    const items: SequenceItem[] = [
      makeItem({ content: "First" }),
      makeItem({ content: "Second" }),
      makeItem({ content: "Third" }),
    ];

    const promise = sendSequence("evt-1", "ABC123", 1, items);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).toHaveBeenCalledTimes(3);
    expect(writeGuideMessage).toHaveBeenNthCalledWith(1, "evt-1", "ABC123", 1, "First", null);
    expect(writeGuideMessage).toHaveBeenNthCalledWith(2, "evt-1", "ABC123", 1, "Second", null);
    expect(writeGuideMessage).toHaveBeenNthCalledWith(3, "evt-1", "ABC123", 1, "Third", null);
  });

  it("shows typing indicator for delay_ms > 0", async () => {
    const items = [makeItem({ content: "Delayed", delay_ms: 1000 })];

    const promise = sendSequence("evt-1", "ABC123", 1, items);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    // typing true then false
    expect(publishTyping).toHaveBeenCalledTimes(2);
    expect(publishTyping).toHaveBeenNthCalledWith(1, "ABC123", expect.objectContaining({
      type: "guide_typing",
      is_typing: true,
    }));
    expect(publishTyping).toHaveBeenNthCalledWith(2, "ABC123", expect.objectContaining({
      type: "guide_typing",
      is_typing: false,
    }));
  });

  it("skips typing for delay_ms = 0", async () => {
    const items = [makeItem({ content: "No delay", delay_ms: 0 })];

    const promise = sendSequence("evt-1", "ABC123", 1, items);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(publishTyping).not.toHaveBeenCalled();
    expect(writeGuideMessage).toHaveBeenCalledOnce();
  });

  it("applies template variable substitution to content", async () => {
    const items = [makeItem({ content: "Welcome to {{CITY}}, enjoy {{ACTIVITY}}" })];
    const templateVars = { CITY: "London", ACTIVITY: "the hunt" };

    const promise = sendSequence("evt-1", "ABC123", 1, items, templateVars);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).toHaveBeenCalledWith(
      "evt-1", "ABC123", 1, "Welcome to London, enjoy the hunt", null,
    );
  });

  it("passes image_url through to writeGuideMessage", async () => {
    const items = [makeItem({ content: "Look!", image_url: "https://img.test/photo.jpg" })];

    const promise = sendSequence("evt-1", "ABC123", 1, items);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).toHaveBeenCalledWith(
      "evt-1", "ABC123", 1, "Look!", "https://img.test/photo.jpg",
    );
  });

  it("null image_url passed as null", async () => {
    const items = [makeItem({ content: "Text only", image_url: null })];

    const promise = sendSequence("evt-1", "ABC123", 1, items);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).toHaveBeenCalledWith(
      "evt-1", "ABC123", 1, "Text only", null,
    );
  });

  it("empty sequence: no calls made", async () => {
    const promise = sendSequence("evt-1", "ABC123", 1, []);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).not.toHaveBeenCalled();
    expect(publishTyping).not.toHaveBeenCalled();
  });

  it("error in one item does not stop subsequent items", async () => {
    (writeGuideMessage as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ id: "msg-2" });

    const items = [
      makeItem({ content: "Fails" }),
      makeItem({ content: "Succeeds" }),
    ];

    const promise = sendSequence("evt-1", "ABC123", 1, items);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).toHaveBeenCalledTimes(2);
    // Second call still happens despite first failure
    expect(writeGuideMessage).toHaveBeenNthCalledWith(2, "evt-1", "ABC123", 1, "Succeeds", null);
  });

  it("multiple items sent in correct order with delays", async () => {
    const items = [
      makeItem({ content: "A", delay_ms: 500 }),
      makeItem({ content: "B", delay_ms: 300 }),
      makeItem({ content: "C", delay_ms: 0 }),
    ];

    const promise = sendSequence("evt-1", "ABC123", 2, items);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).toHaveBeenCalledTimes(3);
    // Verify order
    const calls = (writeGuideMessage as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][3]).toBe("A");
    expect(calls[1][3]).toBe("B");
    expect(calls[2][3]).toBe("C");

    // Items A and B had delays, so typing was called 4 times (2 per delayed item)
    expect(publishTyping).toHaveBeenCalledTimes(4);
  });
});
