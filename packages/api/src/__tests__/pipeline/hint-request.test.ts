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

// ── Mock the atomic counters ───────────────────────────────────────
// The real ones are one conditional UPDATE each; event-counters.test.ts
// covers the SQL. Here they stand in for the row lock so the handler's use of
// the post-increment value can be driven directly.
vi.mock("../../services/pipeline/event-counters.js", () => ({
  claimHint: vi.fn(),
  recordWrongAttempt: vi.fn(),
}));

// ── Mock en-route tail lookup ──────────────────────────────────────
vi.mock("../../services/enroute.js", () => ({
  loadEnRouteTail: vi.fn().mockResolvedValue({
    notes: [],
    mapLink: null,
    directions: null,
  }),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../../db/index.js";
import { appendMessage, publishMessage } from "../../redis/index.js";
import { advanceAfterBlock } from "../../services/group-runner.js";
import { sendSequence } from "../../services/send-sequence.js";
import { buildRouteTemplateVars } from "../../services/template-vars.js";
import { claimHint } from "../../services/pipeline/event-counters.js";
import { loadEnRouteTail, type EnRouteContext } from "../../services/enroute.js";

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
  // Default: the claim succeeds and this request owns hint 1
  vi.mocked(claimHint).mockResolvedValue(1);
  vi.mocked(loadEnRouteTail).mockResolvedValue({
    notes: [],
    mapLink: null,
    directions: null,
  });
});

function makeEnRoute(overrides: Partial<EnRouteContext> = {}): EnRouteContext {
  return {
    groupId: "group-1",
    fromBlockId: "block-0",
    stepNumber: 1,
    nextQuestionBlockId: "block-next",
    nextQuestionConfig: null,
    ...overrides,
  };
}

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

    vi.mocked(claimHint).mockResolvedValue(1);

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

    // The counter moved in SQL, scoped to the block being hinted at
    expect(claimHint).toHaveBeenCalledWith("evt-1", "block-1", 2);
  });

  it("serves the hint the claim returned, not the one the stale context implies", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ route_id: "route-1" });

    // A teammate's request landed first, so this one owns hint 2 even though
    // the context it was built from still said 0 hints had been given.
    vi.mocked(claimHint).mockResolvedValue(2);

    await handleHintRequest(makeCtx({ hintsGiven: 0 }));

    expect(sendSequence).toHaveBeenCalledWith(
      "evt-1",
      "ABC123",
      1,
      [{ content: "It faces the main square.", image_url: null, delay_ms: 0 }],
      expect.any(Object),
    );
  });

  it("stays quiet when the claim is lost to another request", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    vi.mocked(claimHint).mockResolvedValue(null);

    const result = await handleHintRequest(makeCtx());

    expect(result).toEqual({ handled: true, exhausted: false });
    expect(sendSequence).not.toHaveBeenCalled();
    expect(advanceAfterBlock).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("two concurrent requests get hint 1 then hint 2, never the same one", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(questionBlock);
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ route_id: "route-1" });

    // Stand in for the row lock: each claim reads and writes under it, so
    // concurrent callers come out with consecutive values.
    let hintsGiven = 0;
    vi.mocked(claimHint).mockImplementation(async (_e, _b, maxHints) => {
      if (hintsGiven > maxHints) return null;
      hintsGiven += 1;
      return hintsGiven;
    });

    await Promise.all([
      handleHintRequest(makeCtx({ hintsGiven: 0 })),
      handleHintRequest(makeCtx({ hintsGiven: 0 })),
    ]);

    const served = vi.mocked(sendSequence).mock.calls.map((c) => c[3]);
    expect(served).toHaveLength(2);
    expect(served[0]).not.toEqual(served[1]);
    expect(served).toContainEqual([
      { content: "It has a clock tower.", image_url: null, delay_ms: 0 },
    ]);
    expect(served).toContainEqual([
      { content: "It faces the main square.", image_url: null, delay_ms: 0 },
    ]);
    // Both requests counted — the old read-modify-write left this at 1
    expect(hintsGiven).toBe(2);
  });

  it("serves second hint when hintsGiven=1", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ route_id: "route-1" });

    vi.mocked(claimHint).mockResolvedValue(2);

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

    // The exhaustion claim: one caller past the last hint reveals the answer
    vi.mocked(claimHint).mockResolvedValue(2);

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

    // The exhaustion claim: one caller past the last hint reveals the answer
    vi.mocked(claimHint).mockResolvedValue(1);

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

    // The exhaustion claim: one caller past the last hint reveals the answer
    vi.mocked(claimHint).mockResolvedValue(1);

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

    // The exhaustion claim: one caller past the last hint reveals the answer
    vi.mocked(claimHint).mockResolvedValue(1);

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

// =====================================================================
// hint requests during the walk between blocks
// =====================================================================

describe("handleHintRequest while the group is walking", () => {
  it("repeats the directions and map instead of spending a hint", async () => {
    vi.mocked(loadEnRouteTail).mockResolvedValue({
      notes: ["The bridge was rebuilt in 1874.", "Cross the bridge and turn left."],
      mapLink: "https://maps.google.com/?q=bridge",
      directions: "Cross the bridge and turn left.",
    });

    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ route_id: "route-1" });

    // getRandomMessageBank for the en-route lead-in: no bank entry seeded
    (db as any).where.mockResolvedValueOnce([]);

    const result = await handleHintRequest(
      makeCtx({ currentBlockId: null, enRoute: makeEnRoute() }),
    );

    expect(result).toEqual({ handled: true, exhausted: false });

    // No hint consumed — hints belong to a question they have not been asked
    expect(claimHint).not.toHaveBeenCalled();
    expect(sendSequence).not.toHaveBeenCalled();
    expect(advanceAfterBlock).not.toHaveBeenCalled();

    const sent = (db as any).values.mock.calls.map((c: any[]) => c[0].content);
    expect(sent).toContain("Cross the bridge and turn left.");
    expect(sent).toContain("https://maps.google.com/?q=bridge");
    // The next clue is never part of en-route help
    expect(sent.join(" ")).not.toContain("clock tower");
  });

  it("says they are between stops when the leg has no directions", async () => {
    vi.mocked(loadEnRouteTail).mockResolvedValue({
      notes: [],
      mapLink: null,
      directions: null,
    });

    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ route_id: "route-1" });
    (db as any).where.mockResolvedValueOnce([]);

    await handleHintRequest(makeCtx({ currentBlockId: null, enRoute: makeEnRoute() }));

    expect(claimHint).not.toHaveBeenCalled();
    const sent = (db as any).values.mock.calls.map((c: any[]) => c[0].content);
    expect(sent[0]).toContain("between stops");
  });

  it("falls back to clarification when there is no walk in progress either", async () => {
    (db as any).where.mockResolvedValueOnce([{ content: "I didn't catch that." }]);

    await handleHintRequest(makeCtx({ currentBlockId: null, enRoute: null }));

    expect(claimHint).not.toHaveBeenCalled();
    expect(loadEnRouteTail).not.toHaveBeenCalled();
    const sent = (db as any).values.mock.calls.map((c: any[]) => c[0].content);
    expect(sent).toContain("I didn't catch that.");
  });
});
