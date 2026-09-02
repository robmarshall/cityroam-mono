import { vi, describe, it, expect, beforeEach } from "vitest";
import { redisSub } from "../redis/client.js";
import {
  subscribeToEvent,
  unsubscribeFromEvent,
  eventHandlerCount,
  controlChannel,
} from "../redis/pubsub.js";

const sub = redisSub as unknown as {
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

/** The single process-wide "message" listener the module attaches. */
function fanout(): (channel: string, message: string) => void {
  const call = sub.on.mock.calls.find((c: unknown[]) => c[0] === "message");
  if (!call) throw new Error("no message listener attached");
  return call[1] as (channel: string, message: string) => void;
}

function controlPayload(name: string): string {
  return JSON.stringify({
    type: "lead_changed",
    data: { participant_id: "p1", name },
  });
}

describe("redis event pub/sub", () => {
  beforeEach(() => {
    sub.subscribe.mockClear();
    sub.unsubscribe.mockClear();
  });

  it("attaches exactly one redis listener no matter how many events subscribe", async () => {
    await subscribeToEvent("aaaa1111", { onControl: vi.fn() });
    await subscribeToEvent("bbbb2222", { onControl: vi.fn() });
    await subscribeToEvent("cccc3333", { onControl: vi.fn() });

    const messageListeners = sub.on.mock.calls.filter(
      (c: unknown[]) => c[0] === "message",
    );
    expect(messageListeners).toHaveLength(1);
  });

  it("delivers to every handler registered for the code", async () => {
    const first = vi.fn();
    const second = vi.fn();

    await subscribeToEvent("dddd4444", { onControl: first });
    await subscribeToEvent("dddd4444", { onControl: second });

    expect(eventHandlerCount("dddd4444")).toBe(2);

    fanout()(controlChannel("dddd4444"), controlPayload("Alice"));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0][0]).toBe("dddd4444");
  });

  it("stops delivering once the event is unsubscribed", async () => {
    const handler = vi.fn();
    await subscribeToEvent("eeee5555", { onControl: handler });

    await unsubscribeFromEvent("eeee5555");
    expect(eventHandlerCount("eeee5555")).toBe(0);

    fanout()(controlChannel("eeee5555"), controlPayload("Alice"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("routes only to the event the channel names", async () => {
    const mine = vi.fn();
    const theirs = vi.fn();

    await subscribeToEvent("ffff6666", { onControl: mine });
    await subscribeToEvent("gggg7777", { onControl: theirs });

    fanout()(controlChannel("ffff6666"), controlPayload("Alice"));

    expect(mine).toHaveBeenCalledTimes(1);
    expect(theirs).not.toHaveBeenCalled();
  });

  it("survives a corrupted payload and a throwing handler", async () => {
    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();

    await subscribeToEvent("hhhh8888", { onControl: throwing });
    await subscribeToEvent("hhhh8888", { onControl: healthy });

    expect(() => fanout()(controlChannel("hhhh8888"), "not json")).not.toThrow();
    expect(healthy).not.toHaveBeenCalled();

    expect(() =>
      fanout()(controlChannel("hhhh8888"), controlPayload("Alice")),
    ).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it("subscribes only to the channels the caller has handlers for", async () => {
    await subscribeToEvent("iiii9999", { onMessage: vi.fn() });

    expect(sub.subscribe).toHaveBeenCalledWith("event:iiii9999:messages");
  });
});
