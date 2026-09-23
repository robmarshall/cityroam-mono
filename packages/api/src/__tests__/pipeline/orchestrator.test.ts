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

// The busy-notice limit is imported straight from the module, since
// redis/index.js does not re-export it.
vi.mock("../../redis/rate-limit.js", () => ({
  checkGuideBusyNoticeRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, current: 1, limit: 1 }),
  checkParticipantRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, current: 1, limit: 10 }),
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

vi.mock("../../services/pipeline/handlers/hint-nudge.js", () => ({
  handleHintNudge: vi.fn().mockResolvedValue(undefined),
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

// The en-route marker lives in Redis; mocked so tests can put the group
// mid-walk without standing up a fake key-value store.
vi.mock("../../services/enroute.js", () => ({
  buildEnRouteContext: vi.fn().mockResolvedValue(null),
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
  getRandomMessageBank,
} from "../../services/pipeline/handlers/answer-attempt.js";
import { handleHintRequest } from "../../services/pipeline/handlers/hint-request.js";
import { handleQuestion } from "../../services/pipeline/handlers/question.js";
import {
  handleClarification,
  handlePromptInjection,
  handleInappropriate,
} from "../../services/pipeline/handlers/silent.js";
import { checkGuideRateLimit } from "../../redis/index.js";
import { checkGuideBusyNoticeRateLimit } from "../../redis/rate-limit.js";
import { handleHintNudge } from "../../services/pipeline/handlers/hint-nudge.js";
import { buildEnRouteContext } from "../../services/enroute.js";
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
    (buildEnRouteContext as any).mockResolvedValue(null);
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
    (handleHintNudge as any).mockResolvedValue(undefined);
    (checkGuideRateLimit as any).mockResolvedValue({ allowed: true, current: 1, limit: 1 });
    (checkGuideBusyNoticeRateLimit as any).mockResolvedValue({ allowed: true, current: 1, limit: 1 });
    // getRandomMessageBank is used by the degraded/busy notices
    (getRandomMessageBank as any).mockResolvedValue("Bank message");
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

  // ── Degraded mode: the classifier is unavailable ──────────────────
  //
  // A provider outage must not dead-end a hunt. Both scripted routes out of a
  // question block stay open on keyword matching alone, and anything else is
  // told so rather than being fed the same clarification line forever.

  describe("classifier unavailable", () => {
    beforeEach(() => {
      (classifyIntent as any).mockResolvedValue(null);
    });

    it("serves a hint when the message reads as a hint request", async () => {
      await processIncomingMessage({
        ...basePayload,
        text: "we are completely stuck, any hint?",
      });

      expect(handleHintRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "event-1",
          eventCode: "ABCD1234",
          currentBlockId: "block-1",
          hintsGiven: 0,
        }),
      );
      expect(handleClarification).not.toHaveBeenCalled();
    });

    it("serves a hint when the message asks to move on", async () => {
      await processIncomingMessage({ ...basePayload, text: "can we skip this one" });

      // Hints are the only scripted route that force-advances a block once
      // they run out, so a skip request is routed there.
      expect(handleHintRequest).toHaveBeenCalled();
      expect(handleClarification).not.toHaveBeenCalled();
    });

    it("accepts a correct answer via the deterministic matcher", async () => {
      await processIncomingMessage({ ...basePayload, text: "it is the fountain" });

      expect(handleAnswerAttempt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventId: "event-1", currentBlockId: "block-1" }),
        "it is the fountain",
      );
      expect(handleHintRequest).not.toHaveBeenCalled();
    });

    it("an answer wins over hint keywords in the same message", async () => {
      await processIncomingMessage({
        ...basePayload,
        text: "stuck on this — is it the fountain?",
      });

      expect(handleAnswerAttempt).toHaveBeenCalled();
      expect(handleHintRequest).not.toHaveBeenCalled();
    });

    it("unrecognised text gets the degraded bank message, not a clarification", async () => {
      await processIncomingMessage({ ...basePayload, text: "what a lovely day" });

      expect(handleClarification).not.toHaveBeenCalled();
      expect(writeGuideMessage).toHaveBeenCalledWith(
        "event-1",
        "ABCD1234",
        1,
        "Bank message",
        null,
        undefined,
        { countsTowardCap: false },
      );
      expect(getRandomMessageBank).toHaveBeenCalledWith("guide-degraded", "en");
    });

    it("falls back to built-in wording when the bank has no degraded entry", async () => {
      (getRandomMessageBank as any).mockResolvedValue(null);

      await processIncomingMessage({ ...basePayload, text: "what a lovely day" });

      const content = (writeGuideMessage as any).mock.calls[0][3];
      expect(content).toContain("hint");
    });

    it("the degraded notice is rate limited, and stays silent rather than nagging", async () => {
      (checkGuideRateLimit as any).mockResolvedValue({ allowed: false, current: 2, limit: 1 });

      await processIncomingMessage({ ...basePayload, text: "what a lovely day" });

      expect(writeGuideMessage).not.toHaveBeenCalled();
      // A busy notice would just restate the degraded line a teammate triggered
      expect(checkGuideBusyNoticeRateLimit).not.toHaveBeenCalled();
    });

    it("a hint request still lands while the rate limit is blocking", async () => {
      (checkGuideRateLimit as any).mockResolvedValue({ allowed: false, current: 2, limit: 1 });

      await processIncomingMessage({ ...basePayload, text: "no idea, give us a hint" });

      expect(handleHintRequest).toHaveBeenCalled();
    });
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

  // ── Shared guide rate limit ────────────────────────────────────────
  //
  // The limit is one guide response per 5s across the whole group. It exists
  // to stop the guide answering five people at once, so it applies to
  // conversational replies only. Anything that moves the hunt along has to
  // get through, or a correct answer typed moments after a teammate's chatter
  // disappears with no reply and no error.

  describe("shared guide rate limit", () => {
    beforeEach(() => {
      (checkGuideRateLimit as any).mockResolvedValue({ allowed: false, current: 2, limit: 1 });
    });

    it("a correct answer within the window still advances", async () => {
      (classifyIntent as any).mockResolvedValue({ type: "answer-attempt" });

      await processIncomingMessage({ ...basePayload, text: "fountain" });

      expect(handleAnswerAttempt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventId: "event-1", currentBlockId: "block-1" }),
        "fountain",
      );
      // Answers never consume the conversational budget
      expect(checkGuideRateLimit).not.toHaveBeenCalled();
    });

    it("a hint request within the window is still served", async () => {
      (classifyIntent as any).mockResolvedValue({ type: "hint-request" });

      await processIncomingMessage({ ...basePayload, text: "give us a hint" });

      expect(handleHintRequest).toHaveBeenCalled();
      expect(checkGuideRateLimit).not.toHaveBeenCalled();
    });

    it("a hint nudge within the window is still answered", async () => {
      (classifyIntent as any).mockResolvedValue({ type: "hint-nudge" });

      await processIncomingMessage({ ...basePayload, text: "this is impossible" });

      expect(handleHintNudge).toHaveBeenCalled();
    });

    it("moderation still runs within the window", async () => {
      (classifyIntent as any).mockResolvedValue({ type: "prompt-injection" });

      await processIncomingMessage(basePayload);

      expect(handlePromptInjection).toHaveBeenCalled();
    });

    it("a question within the window skips the LLM reply but still says something", async () => {
      (classifyIntent as any).mockResolvedValue({ type: "question" });

      await processIncomingMessage({ ...basePayload, text: "how far is the next stop?" });

      // No second LLM call for the reply
      expect(handleQuestion).not.toHaveBeenCalled();

      // But the player is not left with nothing
      expect(getRandomMessageBank).toHaveBeenCalledWith("guide-busy", "en");
      expect(writeGuideMessage).toHaveBeenCalledWith(
        "event-1",
        "ABCD1234",
        1,
        "Bank message",
        null,
        undefined,
        { countsTowardCap: false },
      );
      expect(updateIdleTimestamp).toHaveBeenCalledWith("ABCD1234", "event-1", "en");
    });

    it("the busy notice is itself limited, so a chatty group is not spammed", async () => {
      (classifyIntent as any).mockResolvedValue({ type: "question" });
      (checkGuideBusyNoticeRateLimit as any).mockResolvedValue({
        allowed: false,
        current: 2,
        limit: 1,
      });

      await processIncomingMessage({ ...basePayload, text: "how far is the next stop?" });

      expect(handleQuestion).not.toHaveBeenCalled();
      expect(writeGuideMessage).not.toHaveBeenCalled();
    });

    it("chitchat within the window makes no LLM reply call and stays silent", async () => {
      (classifyIntent as any).mockResolvedValue({ type: "off-topic-chat" });

      await processIncomingMessage({ ...basePayload, text: "who wants a coffee after" });

      // Off-topic chat has no guide reply by design, limited or not, so there
      // is nothing to hold back and no notice to send.
      expect(handleQuestion).not.toHaveBeenCalled();
      expect(writeGuideMessage).not.toHaveBeenCalled();
      expect(checkGuideRateLimit).not.toHaveBeenCalled();
    });

    it("a clarification within the window is replaced by the busy notice", async () => {
      (classifyIntent as any).mockResolvedValue({ type: "clarification" });

      await processIncomingMessage({ ...basePayload, text: "asdkjh" });

      expect(handleClarification).not.toHaveBeenCalled();
      expect(getRandomMessageBank).toHaveBeenCalledWith("guide-busy", "en");
    });
  });

  it("a conversational reply inside the window still updates the idle timer", async () => {
    (checkGuideRateLimit as any).mockResolvedValue({ allowed: false, current: 10, limit: 10 });
    (classifyIntent as any).mockResolvedValue({ type: "question" });

    await processIncomingMessage(basePayload);

    // User message is still stored and broadcast
    expect(appendMessage).toHaveBeenCalled();
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

// =====================================================================
// The walk between blocks
// =====================================================================

describe("processIncomingMessage while the group is walking", () => {
  const walkingEvent = { ...eventRow, current_block_id: null };

  const enRoute = {
    groupId: "group-1",
    fromBlockId: "block-1",
    stepNumber: 1,
    nextQuestionBlockId: "block-2",
    nextQuestionConfig: {
      type: "question",
      clue: "Find the lion statue",
      accepted_answers: ["lion"],
      hints: [],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (db.query.events.findFirst as any).mockResolvedValue(walkingEvent);
    (db as any).returning.mockResolvedValue([userMsg]);
    (preFilter as any).mockResolvedValue({ action: "pass" });
    (isGuideResponseCapReached as any).mockResolvedValue(false);
    (updateIdleTimestamp as any).mockReturnValue(false);
    (buildEnRouteContext as any).mockResolvedValue(enRoute);
    (checkGuideRateLimit as any).mockResolvedValue({ allowed: true, current: 1, limit: 1 });
    // clearAllMocks leaves implementations in place, including a rejection an
    // earlier test installed
    (handleAnswerAttempt as any).mockResolvedValue({ handled: true, correct: false });
    (handleHintRequest as any).mockResolvedValue({ handled: true, exhausted: false });
    (handleQuestion as any).mockResolvedValue({ handled: true });
  });

  it("hands the question handler the walk context instead of nothing", async () => {
    (classifyIntent as any).mockResolvedValue({ type: "question" });

    await processIncomingMessage({ ...basePayload, text: "which way at the bridge?" });

    expect(handleQuestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currentBlockId: null, enRoute }),
      "which way at the bridge?",
    );
    expect(handleClarification).not.toHaveBeenCalled();
  });

  it("classifies against the clue they are walking towards", async () => {
    (classifyIntent as any).mockResolvedValue({ type: "answer-attempt" });

    await processIncomingMessage({ ...basePayload, text: "the lion?" });

    expect(classifyIntent).toHaveBeenCalledWith(
      expect.anything(),
      "Find the lion statue",
      "the lion?",
      "en",
    );
    // No block to load: the clue came from the resolved next question
    expect(db.query.routeBlocks.findFirst).not.toHaveBeenCalled();
  });

  it("passes the walk context to the answer and hint handlers", async () => {
    (classifyIntent as any).mockResolvedValue({ type: "answer-attempt" });
    await processIncomingMessage({ ...basePayload, text: "the lion" });
    expect(handleAnswerAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enRoute }),
      "the lion",
    );

    (classifyIntent as any).mockResolvedValue({ type: "hint-request" });
    await processIncomingMessage({ ...basePayload, text: "any hints?" });
    expect(handleHintRequest).toHaveBeenCalledWith(expect.objectContaining({ enRoute }));
  });

  it("does not look for a walk while the group is parked on a block", async () => {
    (db.query.events.findFirst as any).mockResolvedValue(eventRow);
    (classifyIntent as any).mockResolvedValue({ type: "question" });

    await processIncomingMessage({ ...basePayload, text: "how far?" });

    expect(buildEnRouteContext).not.toHaveBeenCalled();
  });
});
