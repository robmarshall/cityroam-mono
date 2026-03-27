import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock db module ──────────────────────────────────────────────────
vi.mock("../../db/index.js", () => {
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
      stops: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
      messageBanks: { findFirst: vi.fn() },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    groupBy: vi.fn(() => mockDb),
    orderBy: vi.fn(() => mockDb),
    limit: vi.fn(() => mockDb),
    offset: vi.fn(() => mockDb),
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    returning: vi.fn(() => []),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    transaction: vi.fn((fn: any) => fn(mockDb)),
  };
  const mockSchema = {
    messageBanks: {
      content: "content",
      type: "type",
      is_active: "is_active",
    },
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: mockSchema };
});

// ── Mock redis rate-limit module ────────────────────────────────────
vi.mock("../../redis/rate-limit.js", () => ({
  checkParticipantRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, current: 1, limit: 10 }),
}));

import { db } from "../../db/index.js";
import { checkParticipantRateLimit } from "../../redis/rate-limit.js";
import { preFilter } from "../../services/pipeline/pre-filter.js";
import {
  classifyIntent,
  buildClassificationPrompt,
} from "../../services/pipeline/classifier.js";
import type { LLMService } from "../../services/llm/interface.js";

// =====================================================================
// Layer 1: Pre-filter
// =====================================================================
describe("preFilter (Layer 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: where() returns empty array (no message bank rows)
    (db as any).where.mockResolvedValue([]);
    // Default: rate limit allowed
    (checkParticipantRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      current: 1,
      limit: 10,
    });
  });

  it("drops empty message silently", async () => {
    const result = await preFilter("", "EVT1", "p1");
    expect(result).toEqual({ action: "drop" });
  });

  it("drops whitespace-only message silently", async () => {
    const result = await preFilter("   \t\n  ", "EVT1", "p1");
    expect(result).toEqual({ action: "drop" });
  });

  it("drops message under MIN_MESSAGE_LENGTH (1 char)", async () => {
    const result = await preFilter("a", "EVT1", "p1");
    expect(result).toEqual({ action: "drop" });
  });

  it("responds with over-length bank message when message exceeds MAX_MESSAGE_LENGTH", async () => {
    const longMsg = "x".repeat(501);
    (db as any).where.mockResolvedValue([
      { content: "Whoa, that's too long!" },
    ]);

    const result = await preFilter(longMsg, "EVT1", "p1");

    expect(result.action).toBe("respond");
    expect(result.response).toBe("Whoa, that's too long!");
  });

  it("uses fallback text when no bank messages exist for over-length", async () => {
    const longMsg = "x".repeat(501);
    (db as any).where.mockResolvedValue([]);

    const result = await preFilter(longMsg, "EVT1", "p1");

    expect(result.action).toBe("respond");
    expect(result.response).toBe(
      "Your message is too long. Please keep it shorter.",
    );
  });

  it("drops rate-limited message silently", async () => {
    (checkParticipantRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      current: 11,
      limit: 10,
    });

    const result = await preFilter("hello there", "EVT1", "p1");

    expect(result).toEqual({ action: "drop" });
  });

  it("passes normal message through", async () => {
    const result = await preFilter("hello there", "EVT1", "p1");

    expect(result).toEqual({ action: "pass" });
  });
});

// =====================================================================
// Layer 2: Classifier
// =====================================================================
describe("classifyIntent (Layer 2)", () => {
  const INTENT_TYPES = [
    "answer-attempt",
    "hint-request",
    "contextual-comment",
    "question",
    "off-topic-chat",
    "prompt-injection",
    "inappropriate",
    "clarification",
  ] as const;

  let mockLlm: LLMService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLlm = { classify: vi.fn() };
  });

  describe("valid classifications", () => {
    for (const intentType of INTENT_TYPES) {
      it(`parses "${intentType}" classification correctly`, async () => {
        (mockLlm.classify as ReturnType<typeof vi.fn>).mockResolvedValue({
          type: intentType,
        });

        const result = await classifyIntent(
          mockLlm,
          "Find the hidden fountain",
          "some player message",
        );

        expect(result).toEqual({ type: intentType });
        expect(mockLlm.classify).toHaveBeenCalledOnce();
      });
    }
  });

  it("returns null when LLM returns null (malformed JSON)", async () => {
    (mockLlm.classify as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await classifyIntent(
      mockLlm,
      "Find the hidden fountain",
      "I think it's near the park",
    );

    expect(result).toBeNull();
  });

  it("returns null on LLM timeout (null return)", async () => {
    (mockLlm.classify as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await classifyIntent(mockLlm, "Go to the clock tower", "");

    expect(result).toBeNull();
  });

  it("returns null when type field has an invalid value", async () => {
    (mockLlm.classify as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: "unknown-intent",
    });

    const result = await classifyIntent(
      mockLlm,
      "Find the hidden fountain",
      "hello",
    );

    expect(result).toBeNull();
  });

  it("returns null when type field is missing", async () => {
    (mockLlm.classify as ReturnType<typeof vi.fn>).mockResolvedValue({
      intent: "answer-attempt",
    });

    const result = await classifyIntent(
      mockLlm,
      "Find the hidden fountain",
      "the park bench",
    );

    expect(result).toBeNull();
  });

  it("builds classification prompt with clue and message", () => {
    const prompt = buildClassificationPrompt(
      "Find the red door",
      "Is it on Main Street?",
    );

    expect(prompt).toContain("Find the red door");
    expect(prompt).toContain("Is it on Main Street?");
    expect(prompt).toContain("answer-attempt");
    expect(prompt).toContain("hint-request");
  });
});
