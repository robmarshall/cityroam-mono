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
  handleHintNudge,
  type HintNudgeContext,
} from "../../services/pipeline/handlers/hint-nudge.js";

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

function makeCtx(overrides: Partial<HintNudgeContext> = {}): HintNudgeContext {
  return {
    eventId: "evt-1",
    eventCode: "ABC123",
    currentStop: 1,
    language: "en",
    ...overrides,
  };
}

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: returning always gives a message-like object so writeGuideMessage works
  (db as any).returning.mockResolvedValue([mockMsg]);
});

// =====================================================================
// hint-nudge handler
// =====================================================================

describe("handleHintNudge", () => {
  it("uses message bank hint-offer content when available", async () => {
    // getRandomMessageBank: where returns bank message
    (db as any).where.mockResolvedValueOnce([{ content: "Need a hint?" }]);

    const ctx = makeCtx();
    await handleHintNudge(ctx);

    // The guide message should use the bank content
    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("Need a hint?");
  });

  it("falls back to English fallback when no bank message and language is en", async () => {
    // getRandomMessageBank: no messages found
    (db as any).where.mockResolvedValueOnce([]);

    const ctx = makeCtx({ language: "en" });
    await handleHintNudge(ctx);

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("Would you like a hint?");
  });

  it("falls back to Spanish fallback for language es", async () => {
    // First where: no messages for "es", second where: fallback to "en" also empty
    (db as any).where
      .mockResolvedValueOnce([])  // es lookup
      .mockResolvedValueOnce([]); // en fallback lookup

    const ctx = makeCtx({ language: "es" });
    await handleHintNudge(ctx);

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("\u00bfTe gustar\u00eda una pista?");
  });

  it("falls back to French fallback for language fr", async () => {
    (db as any).where
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const ctx = makeCtx({ language: "fr" });
    await handleHintNudge(ctx);

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("Voulez-vous un indice ?");
  });

  it("falls back to German fallback for language de", async () => {
    (db as any).where
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const ctx = makeCtx({ language: "de" });
    await handleHintNudge(ctx);

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("M\u00f6chtest du einen Hinweis?");
  });

  it("falls back to Dutch fallback for language nl", async () => {
    (db as any).where
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const ctx = makeCtx({ language: "nl" });
    await handleHintNudge(ctx);

    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.content).toBe("Wil je een hint?");
  });

  it("sets hint_offered=true on event in DB", async () => {
    (db as any).where.mockResolvedValueOnce([{ content: "Need a hint?" }]);

    const ctx = makeCtx();
    await handleHintNudge(ctx);

    expect((db as any).update).toHaveBeenCalled();
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({ hint_offered: true }),
    );
  });

  it("calls writeGuideMessage with correct eventId, eventCode, currentStop", async () => {
    (db as any).where.mockResolvedValueOnce([{ content: "Hint time?" }]);

    const ctx = makeCtx({ eventId: "evt-42", eventCode: "XYZ999", currentStop: 3 });
    await handleHintNudge(ctx);

    // writeGuideMessage inserts with event_id, step_number
    const insertCalls = (db as any).values.mock.calls;
    const msgInsert = insertCalls[0][0];
    expect(msgInsert.event_id).toBe("evt-42");
    expect(msgInsert.step_number).toBe(3);

    // appendMessage and publishMessage called with eventCode
    expect(appendMessage).toHaveBeenCalledWith(
      "XYZ999",
      expect.objectContaining({ id: "msg-1" }),
    );
    expect(publishMessage).toHaveBeenCalledWith(
      "XYZ999",
      expect.objectContaining({ id: "msg-1" }),
    );
  });
});
