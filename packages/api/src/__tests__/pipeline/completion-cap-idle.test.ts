import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

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
      stops: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
      messageBanks: { findFirst: vi.fn() },
      routeBlocks: { findFirst: vi.fn() },
      routeGroups: { findFirst: vi.fn() },
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
    stops: { route_id: "stops.route_id", stop_number: "stops.stop_number" },
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

vi.mock("../../services/pipeline/guide-response-cap.js", () => ({
  incrementGuideResponseCount: vi.fn().mockResolvedValue(undefined),
  isGuideResponseCapReached: vi.fn().mockResolvedValue(false),
  sendCapReachedMessage: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "../../db/index.js";
import {
  appendMessage,
  publishMessage,
  publishControl,
} from "../../redis/index.js";
import { handleGameCompletion } from "../../services/pipeline/handlers/game-completion.js";
import {
  isGuideResponseCapReached,
  sendCapReachedMessage,
  incrementGuideResponseCount,
} from "../../services/pipeline/guide-response-cap.js";
import {
  updateIdleTimestamp,
  handleIdleResume,
  removeFromIdleTracking,
  startIdleTimer,
  stopIdleTimer,
  getTrackedEvents,
} from "../../services/pipeline/idle-timer.js";

// ── Game completion ─────────────────────────────────────────────────

describe("handleGameCompletion", () => {
  const ctx = {
    eventId: "event-1",
    eventCode: "ABCD1234",
    routeId: "route-1",
    currentStop: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Route data for template population
    (db.query.routes.findFirst as any).mockResolvedValue({
      total_stops: 5,
      estimated_distance_km: 3.2,
      city: "Portland",
    });

    // getRandomMessageBank uses db.select().from().where() chain.
    // The chain mock returns mockDb from each call. The final `.where()` needs to resolve
    // to an array of rows when awaited. Mock it here:
    (db as any).where.mockResolvedValue([
      { content: "You visited {{TOTAL_STOPS}} stops over {{DISTANCE_KM}}km in {{CITY_NAME}}! Leave a review: {{REVIEW_LINK}}" },
    ]);

    // returning() for the inserted system message
    const sysMsg = {
      id: "sys-msg-1",
      sender_type: "system",
      sender_name: "System",
      participant_id: null,
      content: "You visited 5 stops over 3.2km in Portland! Leave a review: https://review.test.com",
      image_url: null,
      step_number: 5,
      created_at: new Date().toISOString(),
    };
    (db as any).returning.mockResolvedValue([sysMsg]);
  });

  it("sends completion message with populated template variables, sets COMPLETED, publishes game_complete", async () => {
    await handleGameCompletion(ctx);

    // Event updated to COMPLETED
    expect(db.update).toHaveBeenCalled();
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED" }),
    );

    // System message inserted
    expect(db.insert).toHaveBeenCalled();
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: "event-1",
        sender_type: "system",
      }),
    );

    // Published to Redis
    expect(appendMessage).toHaveBeenCalledWith("ABCD1234", expect.objectContaining({ sender_type: "system" }));
    expect(publishMessage).toHaveBeenCalledWith("ABCD1234", expect.objectContaining({ sender_type: "system" }));

    // Control event
    expect(publishControl).toHaveBeenCalledWith("ABCD1234", {
      type: "game_complete",
      data: { summary: expect.stringContaining("Portland") },
    });
  });

  it("uses sender_type system, not guide", async () => {
    await handleGameCompletion(ctx);

    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_type: "system",
        sender_name: "System",
      }),
    );

    // Does NOT call incrementGuideResponseCount
    expect(incrementGuideResponseCount).not.toHaveBeenCalled();
  });
});

// ── Guide response cap ──────────────────────────────────────────────

describe("guide-response-cap", () => {
  let realIsCapReached: typeof isGuideResponseCapReached;
  let realSendCapReached: typeof sendCapReachedMessage;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Import the actual (unmocked) module — DB + schema are still mocked
    const actual = await vi.importActual<typeof import("../../services/pipeline/guide-response-cap.js")>(
      "../../services/pipeline/guide-response-cap.js",
    );
    realIsCapReached = actual.isGuideResponseCapReached;
    realSendCapReached = actual.sendCapReachedMessage;
  });

  it("returns false when guide_response_count < MAX", async () => {
    (db.query.events.findFirst as any).mockResolvedValue({ guide_response_count: 50 });
    expect(await realIsCapReached("event-1")).toBe(false);
  });

  it("returns true when guide_response_count >= MAX (100)", async () => {
    (db.query.events.findFirst as any).mockResolvedValue({ guide_response_count: 100 });
    expect(await realIsCapReached("event-1")).toBe(true);
  });

  it("sendCapReachedMessage inserts system message with correct text", async () => {
    const sysMsg = {
      id: "cap-msg-1",
      sender_type: "system",
      sender_name: "System",
      participant_id: null,
      content: "The guide has reached its message limit for this event.",
      image_url: null,
      step_number: 3,
      created_at: new Date().toISOString(),
    };
    (db as any).returning.mockResolvedValue([sysMsg]);

    await realSendCapReached("event-1", "CODE1234", 3);

    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_type: "system",
        content: "The guide has reached its message limit for this event.",
      }),
    );
    expect(appendMessage).toHaveBeenCalledWith("CODE1234", expect.objectContaining({
      content: "The guide has reached its message limit for this event.",
    }));
    expect(publishMessage).toHaveBeenCalledWith("CODE1234", expect.objectContaining({
      sender_type: "system",
    }));
  });

  it("no guide response after cap reached", async () => {
    (db.query.events.findFirst as any).mockResolvedValue({ guide_response_count: 100 });
    const reached = await realIsCapReached("event-1");
    expect(reached).toBe(true);
    // When cap is reached, incrementGuideResponseCount should not be called
    expect(incrementGuideResponseCount).not.toHaveBeenCalled();
  });
});

// ── Idle timer ──────────────────────────────────────────────────────

describe("idle-timer", () => {
  const SCAN_INTERVAL_MS = 60_000;
  const IDLE_PROMPT_TIMEOUT_MS = 3_600_000;
  const IDLE_PAUSE_TIMEOUT_MS = 5_400_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Default mock for scan: event is IN_PROGRESS
    (db.query.events.findFirst as any).mockResolvedValue({
      status: "IN_PROGRESS",
      current_stop: 1,
      current_group_id: "group-1",
      current_block_id: "block-1",
      route_id: "route-1",
    });

    // Mock returning for writeSystemMessage inside idle-timer
    const sysMsg = {
      id: "idle-msg",
      sender_type: "system",
      sender_name: "System",
      participant_id: null,
      content: "",
      image_url: null,
      step_number: 1,
      created_at: new Date().toISOString(),
    };
    (db as any).returning.mockResolvedValue([sysMsg]);
  });

  afterEach(() => {
    stopIdleTimer();
    vi.useRealTimers();
  });

  it("updateIdleTimestamp tracks events and returns false for new event", () => {
    const result = updateIdleTimestamp("TEST1234", "event-1");
    expect(result).toBe(false);
    expect(getTrackedEvents().has("TEST1234")).toBe(true);
  });

  it("updateIdleTimestamp returns true if event was paused", () => {
    updateIdleTimestamp("TEST1234", "event-1");

    // Manually set pauseSent to true to simulate pause state
    const state = getTrackedEvents().get("TEST1234")!;
    state.pauseSent = true;

    const result = updateIdleTimestamp("TEST1234", "event-1");
    expect(result).toBe(true);
  });

  it("sends nudge after IDLE_PROMPT_TIMEOUT_MS", async () => {
    startIdleTimer();
    updateIdleTimestamp("TEST1234", "event-1");

    // Advance past prompt timeout + one scan interval so the scan fires after timeout elapsed
    vi.advanceTimersByTime(IDLE_PROMPT_TIMEOUT_MS + SCAN_INTERVAL_MS);

    // Flush microtasks so async scanIdleEvents completes
    await vi.advanceTimersByTimeAsync(0);

    expect(appendMessage).toHaveBeenCalledWith(
      "TEST1234",
      expect.objectContaining({
        sender_type: "system",
      }),
    );

    expect(publishMessage).toHaveBeenCalledWith(
      "TEST1234",
      expect.objectContaining({
        sender_type: "system",
      }),
    );

    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Still exploring? Send a message when you're ready to continue.",
        sender_type: "system",
      }),
    );
  });

  it("sends pause message after IDLE_PAUSE_TIMEOUT_MS", async () => {
    startIdleTimer();
    updateIdleTimestamp("TEST1234", "event-1");

    vi.advanceTimersByTime(IDLE_PAUSE_TIMEOUT_MS + SCAN_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "It's been a while \u2014 the game is paused. Send any message to pick up where you left off.",
        sender_type: "system",
      }),
    );

    expect(publishMessage).toHaveBeenCalledWith(
      "TEST1234",
      expect.objectContaining({
        sender_type: "system",
      }),
    );
  });

  it("handleIdleResume sends welcome back with current clue", async () => {
    (db.query.events.findFirst as any).mockResolvedValue({
      current_stop: 2,
      current_group_id: "group-1",
      current_block_id: "block-1",
      route_id: "route-1",
    });
    (db.query.stops.findFirst as any).mockResolvedValue({
      clue: "Look for the red door",
    });

    const sysMsg = {
      id: "resume-msg",
      sender_type: "system",
      sender_name: "System",
      participant_id: null,
      content: 'Welcome back. Here\'s your current clue: "Look for the red door"',
      image_url: null,
      step_number: 2,
      created_at: new Date().toISOString(),
    };
    (db as any).returning.mockResolvedValue([sysMsg]);

    await handleIdleResume("event-1", "TEST1234");

    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Welcome back. Here\'s your current clue: "Look for the red door"',
        sender_type: "system",
      }),
    );
    expect(appendMessage).toHaveBeenCalledWith("TEST1234", expect.objectContaining({
      sender_type: "system",
    }));
  });

  it("removeFromIdleTracking removes event from map", () => {
    updateIdleTimestamp("TEST1234", "event-1");
    expect(getTrackedEvents().has("TEST1234")).toBe(true);

    removeFromIdleTracking("TEST1234");
    expect(getTrackedEvents().has("TEST1234")).toBe(false);
  });
});
