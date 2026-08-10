import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../db/index.js", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema/index.js")>(
    "../db/schema/index.js",
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
      routeGroups: { findFirst: vi.fn() },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    orderBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    // Default: the current_block_id compare-and-swap claims the advance
    returning: vi.fn(() => [{ id: "evt-1" }]),
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    transaction: vi.fn((fn: any) => fn(mockDb)),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: realSchema };
});

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

// ── Mock game-completion ────────────────────────────────────────────
vi.mock("../services/pipeline/handlers/game-completion.js", () => ({
  handleGameCompletion: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock template-vars ──────────────────────────────────────────────
vi.mock("../services/template-vars.js", () => ({
  buildRouteTemplateVars: vi.fn().mockResolvedValue({ CITY: "London" }),
  applyTemplateVars: vi.fn((content: string) => content.replace("{{CITY}}", "London")),
}));

// ── Imports (after mocks) ───────────────────────────────────────────
import { db } from "../db/index.js";
import { publishTyping, publishControl } from "../redis/index.js";
import { writeGuideMessage } from "../services/pipeline/handlers/answer-attempt.js";
import { handleGameCompletion } from "../services/pipeline/handlers/game-completion.js";
import { applyTemplateVars } from "../services/template-vars.js";
import { runGroup, advanceAfterBlock } from "../services/group-runner.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makeBlock(
  id: string,
  position: number,
  config: Record<string, unknown>,
  delay_ms = 500,
) {
  return {
    id,
    group_id: "group-1",
    position,
    delay_ms,
    config,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

const messageBlock = (id: string, pos: number, content = "Hello") =>
  makeBlock(id, pos, { type: "message", content }, 500);

const imageBlock = (id: string, pos: number, url = "https://img.test/a.png") =>
  makeBlock(id, pos, { type: "image", image_url: url }, 500);

const mapBlock = (id: string, pos: number, link = "https://maps.google.com/test") =>
  makeBlock(id, pos, { type: "map", google_maps_link: link }, 500);

const questionBlock = (id: string, pos: number, clue = "Find the thing") =>
  makeBlock(id, pos, {
    type: "question",
    clue,
    accepted_answers: ["answer"],
    hints: [],
  }, 500);

const actionBlock = (id: string, pos: number, label = "Continue") =>
  makeBlock(id, pos, { type: "action", label }, 0);

function makeGroup(id: string, position: number, routeId = "route-1") {
  return { id, route_id: routeId, position, name: `Group ${position}` };
}

const defaultEvent = {
  route_id: "route-1",
  current_stop: 1,
  language: "en",
};

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Helper: set up db.query.events.findFirst to return an event and
 * orderBy to return blocks then groups (in order of calls).
 */
function setupForRunGroup(
  blocks: ReturnType<typeof makeBlock>[],
  groups: ReturnType<typeof makeGroup>[],
  event = defaultEvent,
) {
  (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(event);
  // First orderBy call: loadGroupBlocks
  // Second orderBy call: loadRouteGroups (if advanceToNextGroup is reached)
  (db as any).orderBy
    .mockResolvedValueOnce(blocks)
    .mockResolvedValueOnce(groups);
}

// =====================================================================
// runGroup
// =====================================================================

describe("runGroup", () => {
  it("sends message blocks in order via writeGuideMessage", async () => {
    const blocks = [messageBlock("b1", 0, "First"), messageBlock("b2", 1, "Second")];
    const groups = [makeGroup("group-1", 0), makeGroup("group-2", 1)];
    setupForRunGroup(blocks, groups);

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).toHaveBeenCalledTimes(2);
    expect(writeGuideMessage).toHaveBeenNthCalledWith(
      1, "evt-1", "ABC123", 1, expect.any(String), null, "message",
    );
    expect(writeGuideMessage).toHaveBeenNthCalledWith(
      2, "evt-1", "ABC123", 1, expect.any(String), null, "message",
    );
  });

  it("sends image blocks with image_url", async () => {
    const blocks = [imageBlock("b1", 0, "https://img.test/photo.jpg")];
    const groups = [makeGroup("group-1", 0), makeGroup("group-2", 1)];
    setupForRunGroup(blocks, groups);

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).toHaveBeenCalledWith(
      "evt-1", "ABC123", 1, "", "https://img.test/photo.jpg", "image",
    );
  });

  it("sends map blocks with google_maps_link", async () => {
    const blocks = [mapBlock("b1", 0, "https://maps.google.com/xyz")];
    const groups = [makeGroup("group-1", 0), makeGroup("group-2", 1)];
    setupForRunGroup(blocks, groups);

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(writeGuideMessage).toHaveBeenCalledWith(
      "evt-1", "ABC123", 1, "https://maps.google.com/xyz", null, "map",
    );
  });

  it("stops at question block and sets current_block_id in DB", async () => {
    const blocks = [
      messageBlock("b1", 0),
      questionBlock("b2", 1, "What is this?"),
    ];
    // No groups needed since it stops at question
    (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(defaultEvent);
    (db as any).orderBy.mockResolvedValueOnce(blocks);

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    // Question clue sent
    expect(writeGuideMessage).toHaveBeenCalledWith(
      "evt-1", "ABC123", 1, "What is this?", null, "question",
    );

    // current_block_id set
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({ current_block_id: "b2" }),
    );
  });

  it("stops at action block and publishes action_waiting control event", async () => {
    const blocks = [actionBlock("b1", 0, "Take a photo")];
    (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(defaultEvent);
    (db as any).orderBy.mockResolvedValueOnce(blocks);

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({ current_block_id: "b1" }),
    );
    expect(publishControl).toHaveBeenCalledWith("ABC123", {
      type: "action_waiting",
      data: { block_id: "b1", label: "Take a photo" },
    });
  });

  it("empty group: advances to next group", async () => {
    const groups = [makeGroup("group-1", 0), makeGroup("group-2", 1)];
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(defaultEvent)
      .mockResolvedValue(defaultEvent);
    // First orderBy: loadGroupBlocks for group-1 (empty)
    // Second orderBy: loadRouteGroups (for advanceToNextGroup)
    // Third orderBy: loadGroupBlocks for group-2 (from recursive runGroup)
    (db as any).orderBy
      .mockResolvedValueOnce([]) // group-1 blocks: empty
      .mockResolvedValueOnce(groups) // route groups
      .mockResolvedValueOnce([]) // group-2 blocks: also empty (triggers completion)
      .mockResolvedValueOnce(groups); // route groups again

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    // Should have updated to next group
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        current_group_id: "group-2",
        current_block_id: null,
      }),
    );
  });

  it("event not found: returns safely without error", async () => {
    (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await runGroup("evt-missing", "ABC123", "group-1");

    expect(writeGuideMessage).not.toHaveBeenCalled();
  });

  it("all blocks sent without blocking: advances to next group", async () => {
    const blocks = [messageBlock("b1", 0)];
    const groups = [makeGroup("group-1", 0), makeGroup("group-2", 1)];
    setupForRunGroup(blocks, groups);

    // For the recursive runGroup call on group-2
    (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(defaultEvent);
    (db as any).orderBy
      .mockResolvedValueOnce([questionBlock("b3", 0)]); // group-2 has a question (stops recursion)

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        current_group_id: "group-2",
        current_block_id: null,
        current_stop: 2,
      }),
    );
  });

  it("template variables applied to message content via applyTemplateVars", async () => {
    const blocks = [messageBlock("b1", 0, "Welcome to {{CITY}}")];
    const groups = [makeGroup("group-1", 0), makeGroup("group-2", 1)];
    setupForRunGroup(blocks, groups);

    // Recursive call setup
    (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(defaultEvent);
    (db as any).orderBy.mockResolvedValueOnce([questionBlock("b2", 0)]);

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(applyTemplateVars).toHaveBeenCalledWith("Welcome to {{CITY}}", { CITY: "London" });
    // writeGuideMessage receives the transformed content
    expect(writeGuideMessage).toHaveBeenCalledWith(
      "evt-1", "ABC123", 1, "Welcome to London", null, "message",
    );
  });
});

// =====================================================================
// advanceAfterBlock
// =====================================================================

describe("advanceAfterBlock", () => {
  it("resumes sending from the block after the specified one", async () => {
    const blocks = [
      questionBlock("b1", 0),
      messageBlock("b2", 1, "After question"),
      questionBlock("b3", 2, "Next question"),
    ];

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "b1", group_id: "group-1" });
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(defaultEvent);
    // First orderBy: loadGroupBlocks
    (db as any).orderBy.mockResolvedValueOnce(blocks);

    const promise = advanceAfterBlock("evt-1", "ABC123", "b1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    // Should send b2 (message) then stop at b3 (question), not send b1 again
    // writeGuideMessage called for b2 (message) and b3 (question clue)
    expect(writeGuideMessage).toHaveBeenCalledTimes(2);
    expect(writeGuideMessage).toHaveBeenNthCalledWith(
      1, "evt-1", "ABC123", 1, expect.stringContaining("After question"), null, "message",
    );
    expect(writeGuideMessage).toHaveBeenNthCalledWith(
      2, "evt-1", "ABC123", 1, "Next question", null, "question",
    );
  });

  it("all remaining blocks sent: advances to next group", async () => {
    const blocks = [questionBlock("b1", 0), messageBlock("b2", 1)];
    const groups = [makeGroup("group-1", 0), makeGroup("group-2", 1)];

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "b1", group_id: "group-1" });
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(defaultEvent);
    (db as any).orderBy
      .mockResolvedValueOnce(blocks)
      .mockResolvedValueOnce(groups);

    // Recursive call for group-2
    (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(defaultEvent);
    (db as any).orderBy.mockResolvedValueOnce([questionBlock("b3", 0)]);

    const promise = advanceAfterBlock("evt-1", "ABC123", "b1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        current_group_id: "group-2",
        current_block_id: null,
      }),
    );
  });

  it("stops at next question/action block", async () => {
    const blocks = [
      questionBlock("b1", 0),
      messageBlock("b2", 1),
      questionBlock("b3", 2, "Next question"),
    ];

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "b1", group_id: "group-1" });
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(defaultEvent);
    (db as any).orderBy.mockResolvedValueOnce(blocks);

    const promise = advanceAfterBlock("evt-1", "ABC123", "b1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    // Stops at b3 (question), sets current_block_id
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({ current_block_id: "b3" }),
    );
  });

  it("clears current_block_id before walking the remaining blocks", async () => {
    const blocks = [questionBlock("b1", 0), messageBlock("b2", 1)];

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "b1", group_id: "group-1" });
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(defaultEvent);
    (db as any).orderBy
      .mockResolvedValueOnce(blocks)
      .mockResolvedValueOnce([makeGroup("group-1", 0)]);

    const promise = advanceAfterBlock("evt-1", "ABC123", "b1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect((db as any).set).toHaveBeenNthCalledWith(1, { current_block_id: null });
  });

  it("a second advance for the same block is ignored", async () => {
    // The compare-and-swap matched nothing — someone already advanced
    (db as any).returning.mockReturnValueOnce([]);

    await advanceAfterBlock("evt-1", "ABC123", "b1");

    expect(db.query.routeBlocks.findFirst).not.toHaveBeenCalled();
    expect(writeGuideMessage).not.toHaveBeenCalled();
    expect(handleGameCompletion).not.toHaveBeenCalled();
  });

  it("does not advance twice when two correct answers race", async () => {
    const blocks = [questionBlock("b1", 0), messageBlock("b2", 1, "After")];

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "b1", group_id: "group-1" });
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(defaultEvent);
    (db as any).orderBy
      .mockResolvedValueOnce(blocks)
      .mockResolvedValueOnce([makeGroup("group-1", 0)]);

    // Only the first caller wins the claim
    (db as any).returning
      .mockReturnValueOnce([{ id: "evt-1" }])
      .mockReturnValueOnce([]);

    const first = advanceAfterBlock("evt-1", "ABC123", "b1");
    const second = advanceAfterBlock("evt-1", "ABC123", "b1");
    await vi.advanceTimersByTimeAsync(10000);
    await Promise.all([first, second]);

    // "After" is sent once, and the group completes once
    expect(writeGuideMessage).toHaveBeenCalledTimes(1);
    expect(handleGameCompletion).toHaveBeenCalledTimes(1);
  });

  it("block not found: returns safely", async () => {
    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(undefined);

    await advanceAfterBlock("evt-1", "ABC123", "nonexistent");

    expect(writeGuideMessage).not.toHaveBeenCalled();
  });

  it("event not found: returns safely", async () => {
    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "b1", group_id: "group-1" });
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(undefined);

    await advanceAfterBlock("evt-1", "ABC123", "b1");

    expect(writeGuideMessage).not.toHaveBeenCalled();
  });

  it("block not in group: returns safely", async () => {
    const blocks = [messageBlock("b2", 0), messageBlock("b3", 1)];

    (db.query.routeBlocks.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "b-other", group_id: "group-1" });
    (db.query.events.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValue(defaultEvent);
    (db as any).orderBy.mockResolvedValueOnce(blocks);

    await advanceAfterBlock("evt-1", "ABC123", "b-other");

    // Block "b-other" not found in blocks array, so returns safely
    expect(writeGuideMessage).not.toHaveBeenCalled();
  });
});

// =====================================================================
// advanceToNextGroup (indirect via runGroup)
// =====================================================================

describe("advanceToNextGroup (indirect)", () => {
  it("updates current_group_id, current_block_id=null, current_stop", async () => {
    const blocks = [messageBlock("b1", 0)];
    const groups = [makeGroup("group-1", 0), makeGroup("group-2", 1)];
    setupForRunGroup(blocks, groups);

    // Recursive call: group-2 has a question so it stops
    (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(defaultEvent);
    (db as any).orderBy.mockResolvedValueOnce([questionBlock("b2", 0)]);

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        current_group_id: "group-2",
        current_block_id: null,
        current_stop: 2,
      }),
    );
  });

  it("last group: triggers handleGameCompletion", async () => {
    const blocks = [messageBlock("b1", 0)];
    const groups = [makeGroup("group-1", 0)]; // Only one group
    setupForRunGroup(blocks, groups);

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(handleGameCompletion).toHaveBeenCalledWith({
      eventId: "evt-1",
      eventCode: "ABC123",
      routeId: "route-1",
      currentStop: 1,
      language: "en",
    });
  });

  it("current group not found in route groups: returns safely", async () => {
    const blocks = [messageBlock("b1", 0)];
    // group-1 is not in the groups list
    const groups = [makeGroup("group-99", 0)];
    setupForRunGroup(blocks, groups);

    const promise = runGroup("evt-1", "ABC123", "group-1");
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    // No advancement, no completion
    expect(handleGameCompletion).not.toHaveBeenCalled();
    expect((db as any).set).not.toHaveBeenCalledWith(
      expect.objectContaining({ current_group_id: expect.any(String) }),
    );
  });
});
