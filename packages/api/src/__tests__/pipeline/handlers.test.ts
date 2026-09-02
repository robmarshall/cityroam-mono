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

// ── Mock game-completion ────────────────────────────────────────────
vi.mock("../../services/pipeline/handlers/game-completion.js", () => ({
  handleGameCompletion: vi.fn().mockResolvedValue(undefined),
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
  buildRouteTemplateVars: vi.fn().mockResolvedValue({}),
  applyTemplateVars: vi.fn((content: string) => content),
}));

// ── Mock the atomic counters ───────────────────────────────────────
// Both are a single conditional UPDATE against the events row; the SQL is
// covered in event-counters.test.ts. Mocking them here lets each test say
// what the row lock handed back.
vi.mock("../../services/pipeline/event-counters.js", () => ({
  claimHint: vi.fn(),
  recordWrongAttempt: vi.fn(),
}));

// ── Mock en-route lookups ──────────────────────────────────────────
vi.mock("../../services/enroute.js", () => ({
  loadEnRouteTail: vi.fn().mockResolvedValue({
    notes: [],
    mapLink: null,
    directions: null,
  }),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../../db/index.js";
import { appendMessage, publishMessage, removeMessage } from "../../redis/index.js";
import { claimHint, recordWrongAttempt } from "../../services/pipeline/event-counters.js";
import { loadEnRouteTail, type EnRouteContext } from "../../services/enroute.js";
import { incrementGuideResponseCount } from "../../services/pipeline/guide-response-cap.js";
import { advanceAfterBlock } from "../../services/group-runner.js";
import { sendSequence } from "../../services/send-sequence.js";

import {
  handleAnswerAttempt,
  handleAnswerAttemptWithoutLLM,
  writeGuideMessage,
  getRandomMessageBank,
  SCRIPTED_MESSAGE,
  type AnswerAttemptContext,
} from "../../services/pipeline/handlers/answer-attempt.js";

import {
  handleHintRequest,
  type HintRequestContext,
} from "../../services/pipeline/handlers/hint-request.js";

import {
  handleQuestion,
  type QuestionContext,
} from "../../services/pipeline/handlers/question.js";

import {
  handleOffTopic,
  handleContextualComment,
  handlePromptInjection,
  handleInappropriate,
  handleClarification,
  type SilentHandlerContext,
} from "../../services/pipeline/handlers/silent.js";

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

function makeMockRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: "route-1",
    route_family_id: "family-1",
    total_stops: 5,
    estimated_distance_km: "3.5",
    ...overrides,
  };
}

function makeAnswerCtx(overrides: Partial<AnswerAttemptContext> = {}): AnswerAttemptContext {
  return {
    eventId: "evt-1",
    eventCode: "ABC123",
    currentBlockId: "block-1",
    currentStop: 1,
    wrongAttempts: 0,
    hintsGiven: 0,
    language: "en",
    ...overrides,
  };
}

function makeHintCtx(overrides: Partial<HintRequestContext> = {}): HintRequestContext {
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

function makeQuestionCtx(overrides: Partial<QuestionContext> = {}): QuestionContext {
  return {
    eventId: "evt-1",
    eventCode: "ABC123",
    routeId: "route-1",
    currentBlockId: "block-1",
    currentStop: 1,
    language: "en",
    ...overrides,
  };
}

function makeSilentCtx(overrides: Partial<SilentHandlerContext> = {}): SilentHandlerContext {
  return {
    eventId: "evt-1",
    eventCode: "ABC123",
    currentStop: 1,
    messageId: "user-msg-1",
    language: "en",
    ...overrides,
  };
}

function makeLlm(classifyResult: unknown = null) {
  return { classify: vi.fn().mockResolvedValue(classifyResult) };
}

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: returning always gives a message-like object so writeGuideMessage works
  (db as any).returning.mockResolvedValue([mockMsg]);
  // Default: the claims succeed and this caller owns the first hint / attempt
  vi.mocked(claimHint).mockResolvedValue(1);
  vi.mocked(recordWrongAttempt).mockResolvedValue({ wrongAttempts: 1, hintsGiven: 0 });
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
// writeGuideMessage image URL handling
// =====================================================================

describe("writeGuideMessage image_url", () => {
  it("absolutizes a bare S3 key in the payload sent to clients", async () => {
    (db as any).returning.mockResolvedValueOnce([
      { ...mockMsg, image_url: "uploads/1699_photo.png" },
    ]);

    const payload = await writeGuideMessage(
      "evt-1",
      "ABC123",
      1,
      "",
      "uploads/1699_photo.png",
      "image",
    );

    expect(payload.image_url).toBe("https://cdn.test.com/uploads/1699_photo.png");
    expect(vi.mocked(appendMessage).mock.calls[0][1].image_url).toBe(
      "https://cdn.test.com/uploads/1699_photo.png",
    );
    expect(vi.mocked(publishMessage).mock.calls[0][1].image_url).toBe(
      "https://cdn.test.com/uploads/1699_photo.png",
    );
  });

  it("stores the value as given rather than the absolutized form", async () => {
    (db as any).returning.mockResolvedValueOnce([
      { ...mockMsg, image_url: "uploads/1699_photo.png" },
    ]);

    await writeGuideMessage("evt-1", "ABC123", 1, "", "uploads/1699_photo.png", "image");

    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: "uploads/1699_photo.png" }),
    );
  });

  it("leaves an already-absolute URL untouched", async () => {
    const absolute = "https://cdn.test.com/uploads/photo.png";
    (db as any).returning.mockResolvedValueOnce([{ ...mockMsg, image_url: absolute }]);

    const payload = await writeGuideMessage("evt-1", "ABC123", 1, "", absolute, "image");

    expect(payload.image_url).toBe(absolute);
  });

  it("keeps image_url null for text messages", async () => {
    const payload = await writeGuideMessage("evt-1", "ABC123", 1, "Hello");

    expect(payload.image_url).toBeNull();
  });
});

// =====================================================================
// answer-attempt handler
// =====================================================================

describe("handleAnswerAttempt", () => {
  it("correct answer: sends success message, resets counters, calls advanceAfterBlock", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // getRandomMessageBank: success bank
    (db as any).where
      .mockResolvedValueOnce([{ content: "Great job!" }]);

    const llm = makeLlm({ type: "answer-correct" });
    const ctx = makeAnswerCtx();
    const result = await handleAnswerAttempt(llm, ctx, "Town Hall");

    expect(result).toEqual({ handled: true, correct: true });

    // LLM was called
    expect(llm.classify).toHaveBeenCalledOnce();

    // Success guide message written, but it's message-bank text so it
    // doesn't spend the guide response budget
    expect(appendMessage).toHaveBeenCalled();
    expect(publishMessage).toHaveBeenCalled();
    expect(incrementGuideResponseCount).not.toHaveBeenCalled();

    // Counters reset
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        hints_given: 0,
        wrong_attempts: 0,
      }),
    );

    // advanceAfterBlock called to continue the route
    expect(advanceAfterBlock).toHaveBeenCalledWith("evt-1", "ABC123", "block-1");
  });

  it("correct answer on last stop: advanceAfterBlock handles game completion", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // getRandomMessageBank: success bank
    (db as any).where
      .mockResolvedValueOnce([{ content: "You nailed it!" }]);

    const llm = makeLlm({ type: "answer-correct" });
    const ctx = makeAnswerCtx({ currentStop: 3 });
    const result = await handleAnswerAttempt(llm, ctx, "Town Hall");

    expect(result).toEqual({ handled: true, correct: true });

    // advanceAfterBlock is called (it internally handles game completion if last group)
    expect(advanceAfterBlock).toHaveBeenCalledWith("evt-1", "ABC123", "block-1");
  });

  it("incorrect answer: increments wrong_attempts, sends failure message", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    (db as any).where
      .mockResolvedValueOnce([{ content: "Not quite right." }]); // failure bank

    vi.mocked(recordWrongAttempt).mockResolvedValue({ wrongAttempts: 1, hintsGiven: 1 });

    const llm = makeLlm({ type: "answer-incorrect" });
    const ctx = makeAnswerCtx({ wrongAttempts: 0, hintsGiven: 1 });
    const result = await handleAnswerAttempt(llm, ctx, "wrong answer");

    expect(result).toEqual({ handled: true, correct: false });

    // wrong_attempts incremented in SQL, against the block it was aimed at
    expect(recordWrongAttempt).toHaveBeenCalledWith("evt-1", "block-1");

    // Guide message sent (failure bank)
    expect(appendMessage).toHaveBeenCalled();
  });

  it("incorrect on the third attempt with 0 hints: includes hint nudge text", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    (db as any).where.mockResolvedValueOnce([{ content: "Try again." }]);

    // The row lock says this attempt is the third
    vi.mocked(recordWrongAttempt).mockResolvedValue({ wrongAttempts: 3, hintsGiven: 0 });

    const llm = makeLlm({ type: "answer-incorrect" });
    const ctx = makeAnswerCtx({ wrongAttempts: 0, hintsGiven: 0 });
    const result = await handleAnswerAttempt(llm, ctx, "wrong answer");

    expect(result).toEqual({ handled: true, correct: false });

    // The guide message content should include the hint nudge
    const insertCalls = (db as any).values.mock.calls;
    const lastInsertValues = insertCalls[insertCalls.length - 1][0];
    expect(lastInsertValues.content).toContain("You might want to ask for a hint.");
  });

  it("nudges once: the fourth wrong attempt does not repeat the suggestion", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    (db as any).where.mockResolvedValueOnce([{ content: "Try again." }]);

    vi.mocked(recordWrongAttempt).mockResolvedValue({ wrongAttempts: 4, hintsGiven: 0 });

    const llm = makeLlm({ type: "answer-incorrect" });
    await handleAnswerAttempt(llm, makeAnswerCtx(), "wrong again");

    const insertCalls = (db as any).values.mock.calls;
    const lastInsertValues = insertCalls[insertCalls.length - 1][0];
    expect(lastInsertValues.content).not.toContain("You might want to ask for a hint.");
  });

  it("wrong answer for a block the group has already left: says nothing", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // The conditional UPDATE matched no row — a teammate answered correctly
    // while this message was in flight.
    vi.mocked(recordWrongAttempt).mockResolvedValue(null);

    const llm = makeLlm({ type: "answer-incorrect" });
    const result = await handleAnswerAttempt(llm, makeAnswerCtx(), "wrong answer");

    expect(result).toEqual({ handled: true, correct: false });
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("mid-advancement (no current block): does not count a wrong attempt", async () => {
    // getRandomMessageBank: clarification bank
    (db as any).where.mockResolvedValueOnce([{ content: "Not sure what you mean." }]);

    const llm = makeLlm({ type: "answer-incorrect" });
    const ctx = makeAnswerCtx({ currentBlockId: null, wrongAttempts: 0 });
    const result = await handleAnswerAttempt(llm, ctx, "Town Hall");

    expect(result).toEqual({ handled: true, correct: false });
    expect(recordWrongAttempt).not.toHaveBeenCalled();
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it("LLM failure: uses deterministic fallback for non-matching answer", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // LLM returns null (failure)
    const llm = makeLlm(null);

    (db as any).where
      .mockResolvedValueOnce([{ content: "That's not quite right." }]);

    const ctx = makeAnswerCtx();
    const result = await handleAnswerAttempt(llm, ctx, "gibberish");

    expect(result).toEqual({ handled: true, correct: false });

    // Failure message sent (not clarification)
    expect(appendMessage).toHaveBeenCalled();
  });

  it("LLM failure: deterministic fallback matches correct answer", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // LLM returns null (failure)
    const llm = makeLlm(null);

    // getRandomMessageBank: success bank
    (db as any).where
      .mockResolvedValueOnce([{ content: "Correct!" }]);

    const ctx = makeAnswerCtx();
    const result = await handleAnswerAttempt(llm, ctx, "Town Hall");

    expect(result).toEqual({ handled: true, correct: true });

    // advanceAfterBlock called
    expect(advanceAfterBlock).toHaveBeenCalledWith("evt-1", "ABC123", "block-1");
  });
});

// =====================================================================
// hint-request handler
// =====================================================================

describe("handleHintRequest", () => {
  it("serves hints via sendSequence and increments hints_given", async () => {
    const questionBlock = makeMockQuestionBlock({
      config: {
        type: "question",
        clue: "Find the tallest building.",
        accepted_answers: ["Town Hall"],
        hints: [
          [{ content: "Hint one.", image_url: null, delay_ms: 0 }],
          [{ content: "Hint two.", image_url: null, delay_ms: 0 }],
          [{ content: "Hint three.", image_url: null, delay_ms: 0 }],
        ],
      },
    });

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);

    // events.findFirst for template vars
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ route_id: "route-1" });

    vi.mocked(claimHint).mockResolvedValue(1);

    const ctx = makeHintCtx({ hintsGiven: 0 });
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: false });

    // sendSequence called with first hint sequence
    expect(sendSequence).toHaveBeenCalledWith(
      "evt-1",
      "ABC123",
      1,
      [{ content: "Hint one.", image_url: null, delay_ms: 0 }],
      expect.any(Object),
    );

    // hints_given moved atomically, bounded by the number of hints
    expect(claimHint).toHaveBeenCalledWith("evt-1", "block-1", 3);
  });

  it("hints exhausted: reveals answer with {{ANSWER}} replaced, calls advanceAfterBlock", async () => {
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

    // One hint exists and the claim came back one past it — this caller owns
    // the reveal.
    vi.mocked(claimHint).mockResolvedValue(2);

    const ctx = makeHintCtx({ hintsGiven: 1 });
    const result = await handleHintRequest(ctx);

    expect(result).toEqual({ handled: true, exhausted: true });

    // Check the hint-exhausted message replaced {{ANSWER}}
    const insertCalls = (db as any).values.mock.calls;
    const exhaustedInsert = insertCalls[0][0];
    expect(exhaustedInsert.content).toBe("The answer was Town Hall. Moving on!");
    expect(exhaustedInsert.content).not.toContain("{{ANSWER}}");

    // Counters reset
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        hints_given: 0,
        wrong_attempts: 0,
      }),
    );

    // advanceAfterBlock called
    expect(advanceAfterBlock).toHaveBeenCalledWith("evt-1", "ABC123", "block-1");
  });
});

// =====================================================================
// question handler
// =====================================================================

describe("handleQuestion", () => {
  it("known answer: sends guide response text", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);

    const llm = makeLlm({ type: "answer", text: "The library is two blocks east." });
    const ctx = makeQuestionCtx();
    const result = await handleQuestion(llm, ctx, "Where is the library?");

    expect(result).toEqual({ handled: true });
    expect(llm.classify).toHaveBeenCalledOnce();

    // Guide message with the LLM's answer text
    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[insertCalls.length - 1][0];
    expect(msgInsert.content).toBe("The library is two blocks east.");
  });

  it("unknown: sends unknown-answer bank message", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);

    // getRandomMessageBank for unknown-answer bank
    (db as any).where
      .mockResolvedValueOnce([{ content: "I'm not sure about that." }]);

    const llm = makeLlm({ type: "unknown" });
    const ctx = makeQuestionCtx();
    const result = await handleQuestion(llm, ctx, "What is the meaning of life?");

    expect(result).toEqual({ handled: true });

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[insertCalls.length - 1][0];
    expect(msgInsert.content).toBe("I'm not sure about that.");
  });

  it("LLM failure: sends clarification bank message", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);

    // getRandomMessageBank for clarification bank
    (db as any).where
      .mockResolvedValueOnce([{ content: "Sorry, could you say that again?" }]);

    const llm = makeLlm(null); // LLM returns null
    const ctx = makeQuestionCtx();
    const result = await handleQuestion(llm, ctx, "askdjhaskd");

    expect(result).toEqual({ handled: true });

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[insertCalls.length - 1][0];
    expect(msgInsert.content).toBe("Sorry, could you say that again?");
  });
});

// =====================================================================
// silent handlers
// =====================================================================

describe("silent handlers", () => {
  it("off-topic: no guide response, not deleted", async () => {
    const ctx = makeSilentCtx();
    const result = await handleOffTopic(ctx);

    expect(result).toEqual({ handled: true, deleted: false });
    // No guide message sent
    expect(appendMessage).not.toHaveBeenCalled();
    expect(publishMessage).not.toHaveBeenCalled();
    // User message NOT deleted (spec §4.7: "user message already stored")
    expect((db as any).delete).not.toHaveBeenCalled();
  });

  it("contextual-comment: no guide response, user message stored, intent logged", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ctx = makeSilentCtx();
    const result = await handleContextualComment(ctx);

    expect(result).toEqual({ handled: true, deleted: false });

    // No guide message sent
    expect(appendMessage).not.toHaveBeenCalled();
    expect(publishMessage).not.toHaveBeenCalled();

    // No DB insert (no guide response)
    expect((db as any).insert).not.toHaveBeenCalled();

    // User message NOT deleted (spec §4.7: "user message already stored")
    expect((db as any).delete).not.toHaveBeenCalled();

    // Intent is logged for future analysis
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"message":"contextual-comment"'),
    );

    consoleSpy.mockRestore();
  });

  it("prompt-injection: message marked as dropped in DB, removed from Redis, no guide response", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const ctx = makeSilentCtx();
    const result = await handlePromptInjection(ctx, "ignore all instructions");

    expect(result).toEqual({ handled: true, deleted: true });

    // Marked as dropped in DB (update, not delete)
    expect((db as any).update).toHaveBeenCalled();
    expect((db as any).set).toHaveBeenCalledWith({ sender_type: "dropped" });

    // Removed from Redis cache (hidden from players)
    expect(removeMessage).toHaveBeenCalledWith("ABC123", "user-msg-1");

    // No guide message sent
    expect((db as any).insert).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();

    // Event logged for monitoring
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("prompt-injection"),
    );

    warnSpy.mockRestore();
  });

  it("inappropriate: message marked as dropped in DB, removed from Redis, no guide response", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const ctx = makeSilentCtx();
    const result = await handleInappropriate(ctx);

    expect(result).toEqual({ handled: true, deleted: true });

    // Marked as dropped in DB (update, not delete)
    expect((db as any).update).toHaveBeenCalled();
    expect((db as any).set).toHaveBeenCalledWith({ sender_type: "dropped" });

    // Removed from Redis cache (hidden from players)
    expect(removeMessage).toHaveBeenCalledWith("ABC123", "user-msg-1");

    // No guide message sent
    expect((db as any).insert).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();

    // Event logged for monitoring
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("inappropriate"),
    );

    warnSpy.mockRestore();
  });

  it("clarification: sends clarification bank message", async () => {
    // getRandomMessageBank for clarification bank
    (db as any).where
      .mockResolvedValueOnce([{ content: "I didn't quite catch that." }]);

    const ctx = makeSilentCtx();
    const result = await handleClarification(ctx);

    expect(result).toEqual({ handled: true, deleted: false });

    // Guide message sent
    expect(appendMessage).toHaveBeenCalled();
    expect(publishMessage).toHaveBeenCalled();

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[insertCalls.length - 1][0];
    expect(msgInsert.content).toBe("I didn't quite catch that.");
  });
});

// =====================================================================
// Guide response cap accounting
// =====================================================================

describe("guide response cap accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db as any).returning.mockReturnValue([mockMsg]);
    (db as any).where.mockImplementation(() => db);
  });

  it("charges the cap for an LLM-generated guide message", async () => {
    await writeGuideMessage("evt-1", "ABC123", 1, "Something the model wrote");

    expect(incrementGuideResponseCount).toHaveBeenCalledWith("evt-1");
  });

  it("does not charge the cap for a scripted route block", async () => {
    await writeGuideMessage(
      "evt-1", "ABC123", 1, "Walk to the fountain", null, "message", SCRIPTED_MESSAGE,
    );

    expect(incrementGuideResponseCount).not.toHaveBeenCalled();
  });

  it("does not charge the cap for message-bank text", async () => {
    await writeGuideMessage(
      "evt-1", "ABC123", 1, "Nice one!", null, undefined, SCRIPTED_MESSAGE,
    );

    expect(incrementGuideResponseCount).not.toHaveBeenCalled();
  });
});

// =====================================================================
// handleAnswerAttemptWithoutLLM — the capped-event answer path
// =====================================================================

describe("handleAnswerAttemptWithoutLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db as any).returning.mockReturnValue([mockMsg]);
    (db as any).where.mockImplementation(() => db);
  });

  it("accepts a matching answer and advances the hunt", async () => {
    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeMockQuestionBlock());
    (db as any).where.mockResolvedValueOnce([{ content: "Correct!" }]);

    const matched = await handleAnswerAttemptWithoutLLM(makeAnswerCtx(), "Town Hall");

    expect(matched).toBe(true);
    expect(advanceAfterBlock).toHaveBeenCalledWith("evt-1", "ABC123", "block-1");
  });

  it("rejects a non-matching message without touching wrong_attempts", async () => {
    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeMockQuestionBlock());

    const matched = await handleAnswerAttemptWithoutLLM(makeAnswerCtx(), "what time is it");

    expect(matched).toBe(false);
    expect(advanceAfterBlock).not.toHaveBeenCalled();
    expect((db as any).set).not.toHaveBeenCalled();
  });

  it("returns false when no block is current", async () => {
    const matched = await handleAnswerAttemptWithoutLLM(
      makeAnswerCtx({ currentBlockId: null }),
      "Town Hall",
    );

    expect(matched).toBe(false);
    expect(db.query.routeBlocks.findFirst).not.toHaveBeenCalled();
  });

  it("returns false when the current block is not a question", async () => {
    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "block-1", type: "action", config: { type: "action", label: "Go" } });

    const matched = await handleAnswerAttemptWithoutLLM(makeAnswerCtx(), "Town Hall");

    expect(matched).toBe(false);
    expect(advanceAfterBlock).not.toHaveBeenCalled();
  });
});

// =====================================================================
// Handlers during the walk between blocks
// =====================================================================

describe("handlers while the group is walking", () => {
  it("question: answers from the leg's directions instead of the clarification bank", async () => {
    vi.mocked(loadEnRouteTail).mockResolvedValue({
      notes: ["Cross the bridge and turn left at the pub."],
      mapLink: "https://maps.google.com/?q=bridge",
      directions: "Cross the bridge and turn left at the pub.",
    });

    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeMockRoute());
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ city: "Leeds" });

    const llm = makeLlm({ type: "answer", text: "Left at the pub, then straight on." });

    const result = await handleQuestion(
      llm,
      makeQuestionCtx({ currentBlockId: null, enRoute: makeEnRoute() }),
      "which way at the bridge?",
    );

    expect(result).toEqual({ handled: true });

    // The block lookup is skipped — there is no current block to load
    expect(db.query.routeBlocks.findFirst).not.toHaveBeenCalled();

    const prompt = llm.classify.mock.calls[0][0] as string;
    expect(prompt).toContain("Cross the bridge and turn left at the pub.");
    expect(prompt).toContain("walking between stops");

    const sent = (db as any).values.mock.calls.map((c: any[]) => c[0].content);
    expect(sent).toContain("Left at the pub, then straight on.");
  });

  it("question: the clue they are walking towards never reaches the prompt", async () => {
    vi.mocked(loadEnRouteTail).mockResolvedValue({
      notes: ["Head for the river."],
      mapLink: null,
      directions: "Head for the river.",
    });

    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeMockRoute());
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ city: "Leeds" });

    const llm = makeLlm({ type: "answer", text: "Keep going." });

    await handleQuestion(
      llm,
      makeQuestionCtx({
        currentBlockId: null,
        enRoute: makeEnRoute({
          nextQuestionConfig: {
            type: "question",
            clue: "Find the tallest building in the square.",
            accepted_answers: ["Town Hall"],
            hints: [],
          } as any,
        }),
      }),
      "how far now?",
    );

    const prompt = llm.classify.mock.calls[0][0] as string;
    expect(prompt).not.toContain("tallest building");
  });

  it("answer: an early correct answer is acknowledged, never advanced", async () => {
    (db as any).where.mockResolvedValueOnce([]); // no early-answer bank entry

    const llm = makeLlm({ type: "answer-correct" });

    const result = await handleAnswerAttempt(
      llm,
      makeAnswerCtx({
        currentBlockId: null,
        enRoute: makeEnRoute({
          nextQuestionConfig: {
            type: "question",
            clue: "Find the tallest building in the square.",
            accepted_answers: ["Town Hall"],
            hints: [],
          } as any,
        }),
      }),
      "it's the town hall",
    );

    // Not treated as a correct answer: nothing advances mid-sequence
    expect(result).toEqual({ handled: true, correct: false });
    expect(advanceAfterBlock).not.toHaveBeenCalled();
    expect(recordWrongAttempt).not.toHaveBeenCalled();

    const sent = (db as any).values.mock.calls.map((c: any[]) => c[0].content);
    expect(sent[0]).toContain("not there yet");
  });

  it("answer: a wrong guess during the walk counts nothing and says nothing", async () => {
    const llm = makeLlm({ type: "answer-incorrect" });

    const result = await handleAnswerAttempt(
      llm,
      makeAnswerCtx({
        currentBlockId: null,
        enRoute: makeEnRoute({
          nextQuestionConfig: {
            type: "question",
            clue: "Find the tallest building in the square.",
            accepted_answers: ["Town Hall"],
            hints: [],
          } as any,
        }),
      }),
      "the cathedral?",
    );

    expect(result).toEqual({ handled: true, correct: false });
    expect(recordWrongAttempt).not.toHaveBeenCalled();
    expect(advanceAfterBlock).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("answer: stays quiet when there is no question ahead", async () => {
    const llm = makeLlm({ type: "answer-correct" });

    const result = await handleAnswerAttempt(
      llm,
      makeAnswerCtx({
        currentBlockId: null,
        enRoute: makeEnRoute({ nextQuestionBlockId: null, nextQuestionConfig: null }),
      }),
      "town hall",
    );

    expect(result).toEqual({ handled: true, correct: false });
    expect(llm.classify).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("capped answer: an early deterministic match is acknowledged, not advanced", async () => {
    (db as any).where.mockResolvedValueOnce([]); // no early-answer bank entry

    const handled = await handleAnswerAttemptWithoutLLM(
      makeAnswerCtx({
        currentBlockId: null,
        enRoute: makeEnRoute({
          nextQuestionConfig: {
            type: "question",
            clue: "Find the tallest building in the square.",
            accepted_answers: ["Town Hall"],
            hints: [],
          } as any,
        }),
      }),
      "town hall",
    );

    expect(handled).toBe(true);
    expect(advanceAfterBlock).not.toHaveBeenCalled();
  });
});
