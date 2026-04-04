import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock env ────────────────────────────────────────────────────────
vi.mock("../../env.js", () => ({
  env: {
    AWS_CDN_BASE_URL: "https://cdn.test.com",
    REVIEW_LINK: "https://review.test.com",
  },
}));

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../../db/index.js", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema/index.js")>(
    "../../db/schema/index.js",
  );
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
      routeBlocks: { findFirst: vi.fn() },
      messageBanks: { findFirst: vi.fn() },
      routeFamilies: { findFirst: vi.fn() },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    returning: vi.fn(() => []),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    transaction: vi.fn((fn: any) => fn(mockDb)),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: realSchema };
});

// ── Mock redis/index ────────────────────────────────────────────────
vi.mock("../../redis/index.js", () => ({
  appendMessage: vi.fn().mockResolvedValue(undefined),
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishControl: vi.fn().mockResolvedValue(undefined),
  removeMessage: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock guide-response-cap ─────────────────────────────────────────
vi.mock("../../services/pipeline/guide-response-cap.js", () => ({
  incrementGuideResponseCount: vi.fn().mockResolvedValue(undefined),
  isGuideResponseCapReached: vi.fn().mockResolvedValue(false),
  sendCapReachedMessage: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock group-runner ──────────────────────────────────────────────
vi.mock("../../services/group-runner.js", () => ({
  advanceAfterBlock: vi.fn().mockResolvedValue(undefined),
  runGroup: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock send-sequence ─────────────────────────────────────────────
vi.mock("../../services/send-sequence.js", () => ({
  sendSequence: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock template-vars ─────────────────────────────────────────────
vi.mock("../../services/template-vars.js", () => ({
  buildRouteTemplateVars: vi.fn().mockResolvedValue({ CITY_NAME: "Test City" }),
  applyTemplateVars: vi.fn((content: string) => content),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../../db/index.js";
import { appendMessage, publishMessage } from "../../redis/index.js";
import { advanceAfterBlock } from "../../services/group-runner.js";
import { sendSequence } from "../../services/send-sequence.js";
import { buildRouteTemplateVars } from "../../services/template-vars.js";

import {
  handleHintRequest,
  type HintRequestContext,
} from "../../services/pipeline/handlers/hint-request.js";

// ── Helpers ─────────────────────────────────────────────────────────

const mockMsg = {
  id: "msg-1",
  sender_type: "guide",
  sender_name: "Guide",
  participant_id: null,
  content: "test",
  image_url: null,
  step_number: 1,
  created_at: new Date(),
};

function makeMockQuestionBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-1",
    type: "question",
    config: {
      type: "question",
      clue: "Find the tallest building in the square.",
      accepted_answers: ["Town Hall", "The Town Hall"],
      hints: [
        [{ content: "It has a clock tower.", image_url: null, delay_ms: 0 }],
        [{ content: "It faces the main square.", image_url: null, delay_ms: 0 }],
      ],
    },
    ...overrides,
  };
}

function makeCtx(overrides: Partial<HintRequestContext> = {}): HintRequestContext {
  return {
    eventId: "evt-1",
    eventCode: "ABC123",
    currentBlockId: "block-1",
    currentStop: 1,
    hintsGiven: 0,
    language: "en",
    ...overrides,
  };
}

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (db as any).returning.mockResolvedValue([mockMsg]);
});

// =====================================================================
// hint-request handler
// =====================================================================

describe("handleHintRequest", () => {
  it("serves first hint via sendSequence when hints remain (hintsGiven=0)", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // events.findFirst for template vars
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ route_id: "route-1" });

    const ctx = makeCtx({ hintsGiven: 0 });
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: false });

    // sendSequence called with first hint sequence
    expect(sendSequence).toHaveBeenCalledWith(
      "evt-1",
      "ABC123",
      1,
      [{ content: "It has a clock tower.", image_url: null, delay_ms: 0 }],
      expect.any(Object),
    );

    // hints_given incremented to 1
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({ hints_given: 1 }),
    );
  });

  it("serves second hint when hintsGiven=1", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ route_id: "route-1" });

    const ctx = makeCtx({ hintsGiven: 1 });
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: false });

    // sendSequence called with second hint sequence
    expect(sendSequence).toHaveBeenCalledWith(
      "evt-1",
      "ABC123",
      1,
      [{ content: "It faces the main square.", image_url: null, delay_ms: 0 }],
      expect.any(Object),
    );

    // hints_given incremented to 2
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({ hints_given: 2 }),
    );
  });

  it("hints exhausted: sends hint-exhausted bank message with {{ANSWER}} replaced", async () => {
    const questionBlock = makeMockQuestionBlock({
      config: {
        type: "question",
        clue: "Find the tallest building.",
        accepted_answers: ["Town Hall"],
        hints: [
          [{ content: "Only hint.", image_url: null, delay_ms: 0 }],
        ],
      },
    });

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // getRandomMessageBank for hint-exhausted bank
    (db as any).where
      .mockResolvedValueOnce([{ content: "The answer was {{ANSWER}}. Moving on!" }]);

    const ctx = makeCtx({ hintsGiven: 1 });
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: true });

    // Check the hint-exhausted message replaced {{ANSWER}}
    const insertCalls = (db as any).values.mock.calls;
    const exhaustedInsert = insertCalls[0][0];
    expect(exhaustedInsert.content).toBe("The answer was Town Hall. Moving on!");
    expect(exhaustedInsert.content).not.toContain("{{ANSWER}}");
  });

  it("hints exhausted: resets hints_given=0, wrong_attempts=0, hint_offered=false", async () => {
    const questionBlock = makeMockQuestionBlock({
      config: {
        type: "question",
        clue: "Find it.",
        accepted_answers: ["Town Hall"],
        hints: [],
      },
    });

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // getRandomMessageBank for hint-exhausted bank
    (db as any).where
      .mockResolvedValueOnce([{ content: "Answer: {{ANSWER}}" }]);

    const ctx = makeCtx({ hintsGiven: 0 }); // 0 hints available, so exhausted immediately
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: true });

    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        hints_given: 0,
        wrong_attempts: 0,
        hint_offered: false,
      }),
    );
  });

  it("hints exhausted: calls advanceAfterBlock", async () => {
    const questionBlock = makeMockQuestionBlock({
      config: {
        type: "question",
        clue: "Find it.",
        accepted_answers: ["Town Hall"],
        hints: [],
      },
    });

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    (db as any).where
      .mockResolvedValueOnce([{ content: "Answer: {{ANSWER}}" }]);

    const ctx = makeCtx({ hintsGiven: 0 });
    await handleHintRequest(ctx);

    expect(advanceAfterBlock).toHaveBeenCalledWith("evt-1", "ABC123", "block-1");
  });

  it("hints exhausted with fallback message when no bank message found", async () => {
    const questionBlock = makeMockQuestionBlock({
      config: {
        type: "question",
        clue: "Find it.",
        accepted_answers: ["Town Hall"],
        hints: [],
      },
    });

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // No bank messages found (empty array for both language and English fallback)
    (db as any).where
      .mockResolvedValueOnce([])  // no messages for "en"
      .mockResolvedValueOnce([]); // getRandomMessageBank returns null (language === "en", no fallback)

    const ctx = makeCtx({ hintsGiven: 0 });
    await handleHintRequest(ctx);

    // Should use HINT_EXHAUSTED_FALLBACK with answer replaced
    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("The answer is Town Hall. Let's move on.");
  });

  it("no currentBlockId: sends clarification fallback", async () => {
    // getRandomMessageBank for clarification
    (db as any).where
      .mockResolvedValueOnce([{ content: "I didn't understand that." }]);

    const ctx = makeCtx({ currentBlockId: null });
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: false });

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("I didn't understand that.");
  });

  it("block not found: sends clarification fallback", async () => {
    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null);

    (db as any).where
      .mockResolvedValueOnce([{ content: "Can you rephrase?" }]);

    const ctx = makeCtx();
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: false });

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("Can you rephrase?");
  });

  it("block not question type: sends clarification fallback", async () => {
    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "block-1", type: "directions", config: {} });

    (db as any).where
      .mockResolvedValueOnce([{ content: "Not sure what you mean." }]);

    const ctx = makeCtx();
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: false });

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("Not sure what you mean.");
  });

  it("template vars passed to sendSequence", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ route_id: "route-1" });

    const ctx = makeCtx({ hintsGiven: 0 });
    await handleHintRequest(ctx);

    expect(buildRouteTemplateVars).toHaveBeenCalledWith("route-1");
    expect(sendSequence).toHaveBeenCalledWith(
      "evt-1",
      "ABC123",
      1,
      expect.any(Array),
      { CITY_NAME: "Test City" },
    );
  });

  it("event not found for template vars: still sends hint with empty templateVars", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // events.findFirst returns null
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null);

    const ctx = makeCtx({ hintsGiven: 0 });
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: false });

    // sendSequence still called with empty template vars
    expect(sendSequence).toHaveBeenCalledWith(
      "evt-1",
      "ABC123",
      1,
      expect.any(Array),
      {},
    );
  });

  it("hint sequence with multiple items sent correctly", async () => {
    const questionBlock = makeMockQuestionBlock({
      config: {
        type: "question",
        clue: "Find it.",
        accepted_answers: ["Town Hall"],
        hints: [
          [
            { content: "First part.", image_url: null, delay_ms: 0 },
            { content: "Second part.", image_url: "img.jpg", delay_ms: 500 },
          ],
        ],
      },
    });

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ route_id: "route-1" });

    const ctx = makeCtx({ hintsGiven: 0 });
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: false });

    // sendSequence called with the multi-item hint sequence
    expect(sendSequence).toHaveBeenCalledWith(
      "evt-1",
      "ABC123",
      1,
      [
        { content: "First part.", image_url: null, delay_ms: 0 },
        { content: "Second part.", image_url: "img.jpg", delay_ms: 500 },
      ],
      expect.any(Object),
    );
  });
});
