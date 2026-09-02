/**
 * The en-route marker: what the guide knows while the group is walking
 * between blocks, and what it is careful not to know.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock db ─────────────────────────────────────────────────────────
vi.mock("../../db/index.js", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema/index.js")>(
    "../../db/schema/index.js",
  );
  const mockDb: any = {
    query: {
      events: { findFirst: vi.fn() },
    },
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    orderBy: vi.fn().mockResolvedValue([]),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: realSchema };
});

import { db } from "../../db/index.js";
import { redis } from "../../redis/client.js";
import {
  buildEnRouteContext,
  clearEnRoute,
  enRouteTtlMs,
  getEnRoute,
  loadEnRouteTail,
  resolveNextQuestionBlock,
  setEnRoute,
} from "../../services/enroute.js";

const mockDb = db as any;

function block(
  id: string,
  position: number,
  type: string,
  config: Record<string, unknown>,
) {
  return { id, position, type, config: { type, ...config }, group_id: "group-1", delay_ms: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.orderBy.mockResolvedValue([]);
  vi.mocked(redis.get).mockResolvedValue(null);
  vi.mocked(redis.setex).mockResolvedValue("OK");
  vi.mocked(redis.del).mockResolvedValue(1);
});

describe("marker lifecycle", () => {
  it("round-trips the state through Redis with a TTL", async () => {
    const state = { groupId: "group-1", fromBlockId: "block-1", stepNumber: 2 };

    await setEnRoute("evt-1", state, 90_000);

    expect(redis.setex).toHaveBeenCalledWith("enroute:evt-1", 90, JSON.stringify(state));

    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(state));
    await expect(getEnRoute("evt-1")).resolves.toEqual(state);
  });

  it("reports no walk when nothing is stored", async () => {
    await expect(getEnRoute("evt-1")).resolves.toBeNull();
  });

  it("survives a Redis failure rather than taking the sequence down with it", async () => {
    vi.mocked(redis.setex).mockRejectedValue(new Error("connection lost"));
    await expect(setEnRoute("evt-1", { groupId: "g", fromBlockId: "b", stepNumber: 1 }, 1000))
      .resolves.toBeUndefined();

    vi.mocked(redis.get).mockRejectedValue(new Error("connection lost"));
    await expect(getEnRoute("evt-1")).resolves.toBeNull();
  });

  it("clears on request", async () => {
    await clearEnRoute("evt-1");
    expect(redis.del).toHaveBeenCalledWith("enroute:evt-1");
  });

  it("sizes the TTL to the delays still to be waited out, within bounds", () => {
    expect(enRouteTtlMs(0)).toBe(120_000);
    expect(enRouteTtlMs(300_000)).toBe(420_000);
    // Clamped so a mis-authored tail can't leave a marker for an hour
    expect(enRouteTtlMs(60 * 60_000)).toBe(30 * 60_000);
  });
});

describe("loadEnRouteTail", () => {
  it("returns the blocks after the solved one, and the directions after the map", async () => {
    mockDb.orderBy.mockResolvedValue([
      block("q1", 0, "question", { clue: "Find it", accepted_answers: ["Town Hall"] }),
      block("m1", 1, "message", { content: "Built in 1858." }),
      block("map1", 2, "map", { google_maps_link: "https://maps.example/1" }),
      block("m2", 3, "message", { content: "Cross the bridge and turn left." }),
    ]);

    const tail = await loadEnRouteTail("group-1", "q1");

    expect(tail.notes).toEqual(["Built in 1858.", "Cross the bridge and turn left."]);
    expect(tail.mapLink).toBe("https://maps.example/1");
    expect(tail.directions).toBe("Cross the bridge and turn left.");
  });

  it("never includes the solved question's own clue", async () => {
    mockDb.orderBy.mockResolvedValue([
      block("q1", 0, "question", { clue: "Find the tallest building", accepted_answers: ["x"] }),
      block("m1", 1, "message", { content: "Nice work." }),
    ]);

    const tail = await loadEnRouteTail("group-1", "q1");

    expect(JSON.stringify(tail)).not.toContain("tallest building");
  });

  it("falls back to the last message when the group has no map", async () => {
    mockDb.orderBy.mockResolvedValue([
      block("q1", 0, "question", { clue: "Find it", accepted_answers: ["x"] }),
      block("m1", 1, "message", { content: "First." }),
      block("m2", 2, "message", { content: "Head north along the canal." }),
    ]);

    const tail = await loadEnRouteTail("group-1", "q1");

    expect(tail.mapLink).toBeNull();
    expect(tail.directions).toBe("Head north along the canal.");
  });
});

describe("resolveNextQuestionBlock", () => {
  it("finds the next question from where the runner has got to", async () => {
    mockDb.query.events.findFirst.mockResolvedValue({
      route_id: "route-1",
      current_group_id: "group-2",
      current_block_index: 1,
    });
    mockDb.orderBy.mockResolvedValue([
      block("m1", 0, "message", { content: "Welcome to stop two." }),
      block("q2", 1, "question", { clue: "Next riddle", accepted_answers: ["Museum"] }),
    ]);

    const next = await resolveNextQuestionBlock("evt-1");

    expect(next?.id).toBe("q2");
    expect(next?.config.accepted_answers).toEqual(["Museum"]);
  });

  it("returns nothing when the next blocking block is an action, not a question", async () => {
    mockDb.query.events.findFirst.mockResolvedValue({
      route_id: "route-1",
      current_group_id: "group-2",
      current_block_index: 0,
    });
    mockDb.orderBy.mockResolvedValue([
      block("a1", 0, "action", { label: "Everyone here?" }),
      block("q2", 1, "question", { clue: "Next riddle", accepted_answers: ["Museum"] }),
    ]);

    await expect(resolveNextQuestionBlock("evt-1")).resolves.toBeNull();
  });

  it("returns nothing when the event is not on a group", async () => {
    mockDb.query.events.findFirst.mockResolvedValue({
      route_id: "route-1",
      current_group_id: null,
      current_block_index: 0,
    });

    await expect(resolveNextQuestionBlock("evt-1")).resolves.toBeNull();
  });
});

describe("buildEnRouteContext", () => {
  it("is null when no walk is in progress, so handlers keep today's behaviour", async () => {
    await expect(buildEnRouteContext("evt-1")).resolves.toBeNull();
    expect(mockDb.query.events.findFirst).not.toHaveBeenCalled();
  });

  it("carries the marker plus the question they are walking towards", async () => {
    vi.mocked(redis.get).mockResolvedValue(
      JSON.stringify({ groupId: "group-1", fromBlockId: "q1", stepNumber: 2 }),
    );
    mockDb.query.events.findFirst.mockResolvedValue({
      route_id: "route-1",
      current_group_id: "group-2",
      current_block_index: 0,
    });
    mockDb.orderBy.mockResolvedValue([
      block("q2", 0, "question", { clue: "Next riddle", accepted_answers: ["Museum"] }),
    ]);

    const ctx = await buildEnRouteContext("evt-1");

    expect(ctx).toMatchObject({
      groupId: "group-1",
      fromBlockId: "q1",
      stepNumber: 2,
      nextQuestionBlockId: "q2",
    });
    expect(ctx?.nextQuestionConfig?.accepted_answers).toEqual(["Museum"]);
  });
});
