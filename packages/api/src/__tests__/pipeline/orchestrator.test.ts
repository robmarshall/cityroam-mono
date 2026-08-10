import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../env.js", () => ({
  env: {
    AWS_CDN_BASE_URL: "https://cdn.test.com",
    REVIEW_LINK: "https://review.test.com",
  },
}));

vi.mock("../../db/index.js", () => {
  const mockDb: any = {
    execute: vi.fn().mockResolvedValue([]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
      routeBlocks: { findFirst: vi.fn() },
      routeGroups: { findFirst: vi.fn() },
      messageBanks: { findFirst: vi.fn() },
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
  // Schema stubs — drizzle `eq()` only needs truthy column references
  const mockSchema: any = {
    events: { id: "events.id", status: "events.status", guide_response_count: "events.guide_response_count" },
    messages: { id: "messages.id" },
    routes: { id: "routes.id" },
    routeBlocks: { id: "route_blocks.id", group_id: "route_blocks.group_id" },
    routeGroups: { id: "route_groups.id", route_id: "route_groups.route_id" },
    messageBanks: { content: "mb.content", type: "mb.type", is_active: "mb.is_active" },
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: mockSchema };
});

vi.mock("../../redis/index.js", () => ({
  appendMessage: vi.fn().mockResolvedValue(undefined),
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishTyping: vi.fn().mockResolvedValue(undefined),
  publishControl: vi.fn().mockResolvedValue(undefined),
  removeMessage: vi.fn().mockResolvedValue(undefined),
  checkGuideRateLimit: vi.fn().mockResolvedValue({ allowed: true, current: 1, limit: 1 }),
  checkParticipantRateLimit: vi.fn().mockResolvedValue({ allowed: true, current: 1, limit: 10 }),
}));

vi.mock("../../services/pipeline/pre-filter.js", () => ({
  preFilter: vi.fn().mockResolvedValue({ action: "pass" }),
}));

vi.mock("../../services/pipeline/classifier.js", () => ({
  classifyIntent: vi.fn().mockResolvedValue({ type: "answer-attempt" }),
}));

vi.mock("../../services/pipeline/guide-response-cap.js", () => ({
  isGuideResponseCapReached: vi.fn().mockResolvedValue(false),
  sendCapReachedMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/pipeline/idle-timer.js", () => ({
  updateIdleTimestamp: vi.fn().mockReturnValue(false),
  handleIdleResume: vi.fn().mockResolvedValue(undefined),
  removeFromIdleTracking: vi.fn(),
}));

vi.mock("../../services/pipeline/handlers/answer-attempt.js", () => ({
  handleAnswerAttempt: vi.fn().mockResolvedValue({ handled: true, correct: false }),
  handleAnswerAttemptWithoutLLM: vi.fn().mockResolvedValue(false),
  SCRIPTED_MESSAGE: { countsTowardCap: false },
  writeGuideMessage: vi.fn().mockResolvedValue({
    id: "guide-msg",
    sender_type: "guide",
    sender_name: "Guide",
    participant_id: null,
    content: "test",
    image_url: null,
    step_number: 1,
    created_at: new Date().toISOString(),
  }),
  getRandomMessageBank: vi.fn().mockResolvedValue("Bank message"),
}));

vi.mock("../../services/pipeline/handlers/hint-request.js", () => ({
  handleHintRequest: vi.fn().mockResolvedValue({ handled: true, exhausted: false }),
}));

vi.mock("../../services/pipeline/handlers/question.js", () => ({
  handleQuestion: vi.fn().mockResolvedValue({ handled: true }),
}));

vi.mock("../../services/pipeline/handlers/silent.js", () => ({
  handleOffTopic: vi.fn().mockResolvedValue({ handled: true, deleted: false }),
  handleContextualComment: vi.fn().mockResolvedValue({ handled: true, deleted: false }),
  handlePromptInjection: vi.fn().mockResolvedValue({ handled: true, deleted: true }),
  handleInappropriate: vi.fn().mockResolvedValue({ handled: true, deleted: true }),
  handleClarification: vi.fn().mockResolvedValue({ handled: true, deleted: false }),
}));

// DeepSeekService is instantiated at module scope (`const llm = new DeepSeekService()`)
// so the mock must be a proper constructor.
vi.mock("../../services/llm/deepseek.js", () => {
  class MockDeepSeekService {
    classify = vi.fn().mockResolvedValue({ type: "answer-attempt" });
  }
  return { DeepSeekService: MockDeepSeekService };
});

import { db } from "../../db/index.js";
import {
  appendMessage,
  publishMessage,
  publishTyping,
} from "../../redis/index.js";
import { preFilter } from "../../services/pipeline/pre-filter.js";
import { classifyIntent } from "../../services/pipeline/classifier.js";
import {
  isGuideResponseCapReached,
  sendCapReachedMessage,
} from "../../services/pipeline/guide-response-cap.js";
import {
  updateIdleTimestamp,
  handleIdleResume,
  removeFromIdleTracking,
} from "../../services/pipeline/idle-timer.js";
import {
  handleAnswerAttempt,
  handleAnswerAttemptWithoutLLM,
  writeGuideMessage,
} from "../../services/pipeline/handlers/answer-attempt.js";
import { handleHintRequest } from "../../services/pipeline/handlers/hint-request.js";
import { handleQuestion } from "../../services/pipeline/handlers/question.js";
import {
  handleClarification,
  handlePromptInjection,
  handleInappropriate,
} from "../../services/pipeline/handlers/silent.js";
import { checkGuideRateLimit } from "../../redis/index.js";
import { processIncomingMessage } from "../../services/pipeline/orchestrator.js";

// ── Helpers ─────────────────────────────────────────────────────────

const basePayload = {
  event_id: "event-1",
  event_code: "ABCD1234",
  participant_id: "p1",
  participant_name: "TestUser",
  text: "hello",
  message_id: "msg-1",
  timestamp: new Date().toISOString(),
};

const eventRow = {
  id: "event-1",
  status: "IN_PROGRESS",
  route_id: "route-1",
  current_stop: 1,
  current_block_id: "block-1",
  current_group_id: "group-1",
  hints_given: 0,
  wrong_attempts: 0,
  guide_response_count: 5,
  language: "en",
};

const userMsg = {
  id: "user-msg-1",
  sender_type: "user",
  sender_name: "TestUser",
  participant_id: "p1",
  content: "hello",
  image_url: null,
  step_number: 1,
  created_at: new Date().toISOString(),
};

describe("processIncomingMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: event exists and is IN_PROGRESS
    (db.query.events.findFirst as any).mockResolvedValue(eventRow);

    // User message insert returning
    (db as any).returning.mockResolvedValue([userMsg]);

    // Block data for classification (orchestrator Step 8)
    (db.query.routeBlocks.findFirst as any).mockResolvedValue({
      type: "question",
      config: { type: "question", clue: "Find the fountain", accepted_answers: ["fountain"], hints: [] },
    });

    // Reset pipeline mocks to defaults (clearAllMocks does not reset implementations)
    (preFilter as any).mockResolvedValue({ action: "pass" });
    (classifyIntent as any).mockResolvedValue({ type: "answer-attempt" });
    (isGuideResponseCapReached as any).mockResolvedValue(false);
    (sendCapReachedMessage as any).mockResolvedValue(undefined);
    (updateIdleTimestamp as any).mockReturnValue(false);
    (handleIdleResume as any).mockResolvedValue(undefined);
    (handleAnswerAttempt as any).mockResolvedValue({ handled: true, correct: false });
    (handleAnswerAttemptWithoutLLM as any).mockResolvedValue(false);
    (writeGuideMessage as any).mockResolvedValue({
      id: "guide-msg", sender_type: "guide", sender_name: "Guide",
      participant_id: null, content: "test", image_url: null,
      step_number: 1, created_at: new Date().toISOString(),
    });
    (handleClarification as any).mockResolvedValue({ handled: true, deleted: false });
    (checkGuideRateLimit as any).mockResolvedValue({ allowed: true, current: 1, limit: 1 });
  });

  it("broadcasts user message immediately before any handler", async () => {
    await processIncomingMessage(basePayload);

    // User message stored + broadcast
    expect(db.insert).toHaveBeenCalled();
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_type: "user",
        sender_name: "TestUser",
        content: "hello",
        participant_id: "p1",
      }),
    );
    expect(appendMessage).toHaveBeenCalledWith(
      "ABCD1234",
      expect.objectContaining({ sender_type: "user", content: "hello" }),
    );
    expect(publishMessage).toHaveBeenCalledWith(
      "ABCD1234",
      expect.objectContaining({ sender_type: "user", content: "hello" }),
    );
  });

  it("calls handler after user message is stored", async () => {
    await processIncomingMessage(basePayload);

    expect(appendMessage).toHaveBeenCalled();
    expect(handleAnswerAttempt).toHaveBeenCalled();

    // Verify ordering: appendMessage called before handleAnswerAttempt
    const appendOrder = (appendMessage as any).mock.invocationCallOrder[0];
    const handlerOrder = (handleAnswerAttempt as any).mock.invocationCallOrder[0];
    expect(appendOrder).toBeLessThan(handlerOrder);
  });

  it("routes to correct handler based on classification (answer-attempt)", async () => {
    (classifyIntent as any).mockResolvedValue({ type: "answer-attempt" });

    await processIncomingMessage(basePayload);

    expect(handleAnswerAttempt).toHaveBeenCalledWith(
      expect.anything(), // llm instance
      expect.objectContaining({
        eventId: "event-1",
        eventCode: "ABCD1234",
        currentBlockId: "block-1",
        currentStop: 1,
      }),
      "hello",
    );
  });

  it("pre-filter drop: no handler called", async () => {
    (preFilter as any).mockResolvedValue({ action: "drop" });

    await processIncomingMessage(basePayload);

    // User message is still stored
    expect(appendMessage).toHaveBeenCalled();

    // But no handler is invoked
    expect(handleAnswerAttempt).not.toHaveBeenCalled();
    expect(handleQuestion).not.toHaveBeenCalled();
    expect(handleHintRequest).not.toHaveBeenCalled();
    expect(handleClarification).not.toHaveBeenCalled();

    // Idle timestamp still updated
    expect(updateIdleTimestamp).toHaveBeenCalledWith("ABCD1234", "event-1", "en");
  });

  it("pre-filter respond: writeGuideMessage called", async () => {
    (preFilter as any).mockResolvedValue({ action: "respond", response: "Too long" });

    await processIncomingMessage(basePayload);

    expect(writeGuideMessage).toHaveBeenCalledWith(
      "event-1",
      "ABCD1234",
      1,
      "Too long",
      null,
      undefined,
      { countsTowardCap: false },
    );

    // No classification or handler called
    expect(classifyIntent).not.toHaveBeenCalled();
    expect(handleAnswerAttempt).not.toHaveBeenCalled();

    // Idle timestamp updated
    expect(updateIdleTimestamp).toHaveBeenCalledWith("ABCD1234", "event-1", "en");
  });

  it("guide cap reached: no LLM work, message that isn't an answer gets the cap notice", async () => {
    (isGuideResponseCapReached as any).mockResolvedValue(true);
    (handleAnswerAttemptWithoutLLM as any).mockResolvedValue(false);

    await processIncomingMessage(basePayload);

    expect(sendCapReachedMessage).toHaveBeenCalledWith("event-1", "ABCD1234", 1, "en");

    // No LLM classification or LLM-backed handler
    expect(handleAnswerAttempt).not.toHaveBeenCalled();
    expect(classifyIntent).not.toHaveBeenCalled();

    // Idle timestamp updated
    expect(updateIdleTimestamp).toHaveBeenCalledWith("ABCD1234", "event-1", "en");
  });

  it("guide cap reached: a correct answer still advances via the deterministic matcher", async () => {
    (isGuideResponseCapReached as any).mockResolvedValue(true);
    (handleAnswerAttemptWithoutLLM as any).mockResolvedValue(true);

    await processIncomingMessage({ ...basePayload, text: "fountain" });

    expect(handleAnswerAttemptWithoutLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        eventCode: "ABCD1234",
        currentBlockId: "block-1",
      }),
      "fountain",
    );

    // The hunt moved on, so no dead-end notice and still no LLM
    expect(sendCapReachedMessage).not.toHaveBeenCalled();
    expect(classifyIntent).not.toHaveBeenCalled();
  });

  it("guide cap reached: a hint request still serves a hint", async () => {
    (isGuideResponseCapReached as any).mockResolvedValue(true);
    (handleAnswerAttemptWithoutLLM as any).mockResolvedValue(false);

    await processIncomingMessage({ ...basePayload, text: "we are stuck, any hint?" });

    // Hints are scripted, so they stay reachable and force-advance the block
    // once exhausted — the escape hatch for a group that can't answer
    expect(handleHintRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        eventCode: "ABCD1234",
        currentBlockId: "block-1",
      }),
    );
    expect(sendCapReachedMessage).not.toHaveBeenCalled();
    expect(classifyIntent).not.toHaveBeenCalled();
  });

  it("guide cap reached: an answer wins over hint keywords in the same message", async () => {
    (isGuideResponseCapReached as any).mockResolvedValue(true);
    (handleAnswerAttemptWithoutLLM as any).mockResolvedValue(true);

    await processIncomingMessage({
      ...basePayload,
      text: "stuck on this — is it the fountain?",
    });

    expect(handleHintRequest).not.toHaveBeenCalled();
    expect(sendCapReachedMessage).not.toHaveBeenCalled();
  });

  it("guide cap reached: the escape hatches ignore the shared guide rate limit", async () => {
    (isGuideResponseCapReached as any).mockResolvedValue(true);
    (handleAnswerAttemptWithoutLLM as any).mockResolvedValue(true);
    // A teammate typed moments ago
    (checkGuideRateLimit as any).mockResolvedValue({ allowed: false, current: 2, limit: 1 });

    await processIncomingMessage({ ...basePayload, text: "fountain" });

    // The answer must still land — this is the only way out of a capped hunt
    expect(handleAnswerAttemptWithoutLLM).toHaveBeenCalled();
  });

  it("guide cap reached: the cap notice itself is rate limited", async () => {
    (isGuideResponseCapReached as any).mockResolvedValue(true);
    (handleAnswerAttemptWithoutLLM as any).mockResolvedValue(false);
    (checkGuideRateLimit as any).mockResolvedValue({ allowed: false, current: 2, limit: 1 });

    await processIncomingMessage({ ...basePayload, text: "nice weather today" });

    expect(sendCapReachedMessage).not.toHaveBeenCalled();
  });

  it("pre-filter responses are still sent on a capped event", async () => {
    (isGuideResponseCapReached as any).mockResolvedValue(true);
    (preFilter as any).mockResolvedValue({ action: "respond", response: "Too long" });

    await processIncomingMessage(basePayload);

    expect(writeGuideMessage).toHaveBeenCalledWith(
      "event-1",
      "ABCD1234",
      1,
      "Too long",
      null,
      undefined,
      { countsTowardCap: false },
    );
  });

  it("LLM failure falls back to clarification", async () => {
    (classifyIntent as any).mockResolvedValue(null);

    await processIncomingMessage(basePayload);

    expect(handleClarification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        eventCode: "ABCD1234",
        currentStop: 1,
        messageId: "user-msg-1",
      }),
    );
  });

  it("guide typing on/off always fired", async () => {
    await processIncomingMessage(basePayload);

    // Typing on
    expect(publishTyping).toHaveBeenCalledWith("ABCD1234", expect.objectContaining({
      type: "guide_typing",
      is_typing: true,
    }));

    // Typing off
    expect(publishTyping).toHaveBeenCalledWith("ABCD1234", expect.objectContaining({
      type: "guide_typing",
      is_typing: false,
    }));

    // Typing on was called before typing off
    const calls = (publishTyping as any).mock.calls;
    const onCall = calls.findIndex((c: any) => c[1].is_typing === true);
    const offCall = calls.findIndex((c: any) => c[1].is_typing === false);
    expect(onCall).toBeLessThan(offCall);
  });

  it("idle timer updated after processing", async () => {
    await processIncomingMessage(basePayload);

    expect(updateIdleTimestamp).toHaveBeenCalledWith("ABCD1234", "event-1", "en");
  });

  it("event not IN_PROGRESS: silently dropped, no message stored", async () => {
    (db.query.events.findFirst as any).mockResolvedValue({
      ...eventRow,
      status: "COMPLETED",
    });

    await processIncomingMessage(basePayload);

    // No message inserted
    expect(db.insert).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
    expect(publishMessage).not.toHaveBeenCalled();
    expect(handleAnswerAttempt).not.toHaveBeenCalled();
    expect(publishTyping).not.toHaveBeenCalled();
  });

  it("prompt-injection classification: handler invoked and user message deleted", async () => {
    (classifyIntent as any).mockResolvedValue({ type: "prompt-injection" });

    await processIncomingMessage(basePayload);

    expect(handlePromptInjection).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        eventCode: "ABCD1234",
        messageId: "user-msg-1",
      }),
      "hello",
    );

    // No other handler should be called
    expect(handleAnswerAttempt).not.toHaveBeenCalled();
    expect(handleQuestion).not.toHaveBeenCalled();
    expect(handleHintRequest).not.toHaveBeenCalled();
  });

  it("inappropriate classification: handler invoked", async () => {
    (classifyIntent as any).mockResolvedValue({ type: "inappropriate" });

    await processIncomingMessage(basePayload);

    expect(handleInappropriate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        eventCode: "ABCD1234",
        messageId: "user-msg-1",
      }),
    );

    expect(handleAnswerAttempt).not.toHaveBeenCalled();
  });

  it("guide rate limit rejected: no handler invoked", async () => {
    (checkGuideRateLimit as any).mockResolvedValue({ allowed: false, current: 10, limit: 10 });

    await processIncomingMessage(basePayload);

    // User message is still stored and broadcast
    expect(appendMessage).toHaveBeenCalled();

    // But no classification or handler is invoked
    expect(classifyIntent).not.toHaveBeenCalled();
    expect(handleAnswerAttempt).not.toHaveBeenCalled();
    expect(handleQuestion).not.toHaveBeenCalled();
    expect(handleHintRequest).not.toHaveBeenCalled();
    expect(handleClarification).not.toHaveBeenCalled();

    // Idle timestamp still updated
    expect(updateIdleTimestamp).toHaveBeenCalledWith("ABCD1234", "event-1", "en");
  });

  it("guide typing off fires even when handler throws", async () => {
    (handleAnswerAttempt as any).mockRejectedValue(new Error("handler error"));

    await expect(processIncomingMessage(basePayload)).rejects.toThrow("handler error");

    // Typing off should still be called (finally block)
    expect(publishTyping).toHaveBeenCalledWith("ABCD1234", expect.objectContaining({
      type: "guide_typing",
      is_typing: false,
    }));
  });
});
