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

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../../db/index.js";
import { appendMessage, publishMessage } from "../../redis/index.js";

import {
  handleQuestion,
  type QuestionContext,
} from "../../services/pipeline/handlers/question.js";

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

function makeCtx(overrides: Partial<QuestionContext> = {}): QuestionContext {
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

function makeLlm(classifyResult: unknown = null) {
  return { classify: vi.fn().mockResolvedValue(classifyResult) };
}

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (db as any).returning.mockResolvedValue([mockMsg]);
});

// =====================================================================
// question handler
// =====================================================================

describe("handleQuestion", () => {
  it("LLM returns answer: writes text as guide message", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ city: "Amsterdam" });

    const llm = makeLlm({ type: "answer", text: "The library is two blocks east." });
    const ctx = makeCtx();
    const result = await handleQuestion(llm, ctx, "Where is the library?");

    expect(result).toEqual({ handled: true });
    expect(llm.classify).toHaveBeenCalledOnce();

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[insertCalls.length - 1][0];
    expect(msgInsert.content).toBe("The library is two blocks east.");
  });

  it("LLM returns unknown: writes unknown-answer bank message", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ city: "Amsterdam" });

    // getRandomMessageBank for unknown-answer
    (db as any).where
      .mockResolvedValueOnce([{ content: "I'm not sure about that." }]);

    const llm = makeLlm({ type: "unknown" });
    const ctx = makeCtx();
    const result = await handleQuestion(llm, ctx, "What is the meaning of life?");

    expect(result).toEqual({ handled: true });

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[insertCalls.length - 1][0];
    expect(msgInsert.content).toBe("I'm not sure about that.");
  });

  it("LLM returns null (timeout/failure): writes clarification bank message", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ city: "Amsterdam" });

    (db as any).where
      .mockResolvedValueOnce([{ content: "Sorry, could you say that again?" }]);

    const llm = makeLlm(null);
    const ctx = makeCtx();
    const result = await handleQuestion(llm, ctx, "askdjhaskd");

    expect(result).toEqual({ handled: true });

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[insertCalls.length - 1][0];
    expect(msgInsert.content).toBe("Sorry, could you say that again?");
  });

  it("LLM returns invalid structure: writes clarification bank message", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ city: "Amsterdam" });

    (db as any).where
      .mockResolvedValueOnce([{ content: "Could you rephrase that?" }]);

    const llm = makeLlm({ type: "garbage", foo: "bar" });
    const ctx = makeCtx();
    const result = await handleQuestion(llm, ctx, "some question");

    expect(result).toEqual({ handled: true });

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[insertCalls.length - 1][0];
    expect(msgInsert.content).toBe("Could you rephrase that?");
  });

  it("no currentBlockId: sends clarification fallback", async () => {
    (db as any).where
      .mockResolvedValueOnce([{ content: "I didn't understand." }]);

    const llm = makeLlm();
    const ctx = makeCtx({ currentBlockId: null });
    const result = await handleQuestion(llm, ctx, "hello");

    expect(result).toEqual({ handled: true });

    // LLM should NOT be called when there's no block
    expect(llm.classify).not.toHaveBeenCalled();

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("I didn't understand.");
  });

  it("block not found: sends clarification fallback", async () => {
    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null);

    (db as any).where
      .mockResolvedValueOnce([{ content: "Can you try again?" }]);

    const llm = makeLlm();
    const ctx = makeCtx();
    const result = await handleQuestion(llm, ctx, "hello");

    expect(result).toEqual({ handled: true });
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it("block not question type: sends clarification fallback", async () => {
    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "block-1", type: "directions", config: {} });

    (db as any).where
      .mockResolvedValueOnce([{ content: "Not sure what you mean." }]);

    const llm = makeLlm();
    const ctx = makeCtx();
    const result = await handleQuestion(llm, ctx, "hello");

    expect(result).toEqual({ handled: true });
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it("route not found: sends clarification fallback", async () => {
    const questionBlock = makeMockQuestionBlock();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null);

    (db as any).where
      .mockResolvedValueOnce([{ content: "Something went wrong." }]);

    const llm = makeLlm();
    const ctx = makeCtx();
    const result = await handleQuestion(llm, ctx, "hello");

    expect(result).toEqual({ handled: true });
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it("family not found: uses 'the city' as fallback city name in prompt", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null);

    const llm = makeLlm({ type: "answer", text: "Over there." });
    const ctx = makeCtx();
    await handleQuestion(llm, ctx, "Where is it?");

    // Verify the prompt passed to LLM contains "the city" as fallback
    const prompt = llm.classify.mock.calls[0][0] as string;
    expect(prompt).toContain("city exploration game in the city");
  });

  it("distance calculation: proportional to stops remaining", async () => {
    const questionBlock = makeMockQuestionBlock();
    // 10 stops, 5.0 km total => 0.5 km/stop
    // currentStop=3 => stopsRemaining = 10 - 3 + 1 = 8 => 8 * 0.5 = 4.0 km
    const route = makeMockRoute({
      total_stops: 10,
      estimated_distance_km: "5.0",
    });

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ city: "Berlin" });

    const llm = makeLlm({ type: "answer", text: "Keep walking." });
    const ctx = makeCtx({ currentStop: 3 });
    await handleQuestion(llm, ctx, "How far?");

    const prompt = llm.classify.mock.calls[0][0] as string;
    expect(prompt).toContain("4.0 km");
  });

  it("builds correct prompt with city name, stop info, clue", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ city: "Paris" });

    const llm = makeLlm({ type: "answer", text: "Yes." });
    const ctx = makeCtx({ currentStop: 2 });
    await handleQuestion(llm, ctx, "Am I close?");

    const prompt = llm.classify.mock.calls[0][0] as string;
    expect(prompt).toContain("city exploration game in Paris");
    expect(prompt).toContain("Stop 2 of 5");
    expect(prompt).toContain("Find the tallest building in the square.");
    expect(prompt).toContain("Am I close?");
  });

  it("uses correct language in prompt via LANGUAGE_NAMES lookup", async () => {
    const questionBlock = makeMockQuestionBlock();
    const route = makeMockRoute();

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(questionBlock);
    (db.query.routes.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(route);
    (db.query.routeFamilies.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ city: "Madrid" });

    const llm = makeLlm({ type: "answer", text: "Si." });
    const ctx = makeCtx({ language: "es" });
    await handleQuestion(llm, ctx, "Donde esta?");

    const prompt = llm.classify.mock.calls[0][0] as string;
    expect(prompt).toContain("Respond in Spanish");
  });
});
