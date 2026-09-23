import { vi, describe, it, expect, beforeEach } from "vitest";

// Deferred stand-ins for the Redis round trips, so a reconnect can be squeezed
// into the window while an unsubscribe is still in flight.
const deferredUnsubscribes: Array<() => void> = [];

vi.mock("../redis/pubsub.js", () => ({
  subscribeToEvent: vi.fn().mockResolvedValue(undefined),
  unsubscribeFromEvent: vi.fn(),
}));

import { subscribeToEvent, unsubscribeFromEvent } from "../redis/pubsub.js";
import {
  subscribeEvent,
  unsubscribeEvent,
  unsubscribeAll,
  isEventSubscribed,
  subscriptionRefCount,
  resetSubscriptionState,
} from "../ws/subscriptions.js";

const getConnections = () => new Map();

function hangingUnsubscribe(): Promise<void> {
  return new Promise<void>((resolve) => {
    deferredUnsubscribes.push(resolve);
  });
}

describe("ws event subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferredUnsubscribes.length = 0;
    resetSubscriptionState();
    vi.mocked(subscribeToEvent).mockResolvedValue(undefined);
    vi.mocked(unsubscribeFromEvent).mockResolvedValue(undefined);
  });

  it("subscribes once for an event and counts every connection", async () => {
    await subscribeEvent("abcd2345", getConnections);
    await subscribeEvent("abcd2345", getConnections);

    expect(subscribeToEvent).toHaveBeenCalledTimes(1);
    expect(subscriptionRefCount("abcd2345")).toBe(2);
    expect(isEventSubscribed("abcd2345")).toBe(true);
  });

  it("keeps the subscription until the last connection has gone", async () => {
    await subscribeEvent("abcd2345", getConnections);
    await subscribeEvent("abcd2345", getConnections);

    await unsubscribeEvent("abcd2345");
    expect(unsubscribeFromEvent).not.toHaveBeenCalled();
    expect(isEventSubscribed("abcd2345")).toBe(true);

    await unsubscribeEvent("abcd2345");
    expect(unsubscribeFromEvent).toHaveBeenCalledTimes(1);
    expect(isEventSubscribed("abcd2345")).toBe(false);
  });

  it("survives a reconnect that lands while the unsubscribe is in flight", async () => {
    await subscribeEvent("abcd2345", getConnections);
    vi.mocked(subscribeToEvent).mockClear();

    // The last socket closes; the Redis unsubscribe stalls mid-flight
    vi.mocked(unsubscribeFromEvent).mockImplementationOnce(hangingUnsubscribe);
    const leaving = unsubscribeEvent("abcd2345");

    // The player reconnects before Redis answers
    const rejoining = subscribeEvent("abcd2345", getConnections);

    // Let the queued operations reach the stalled unsubscribe
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deferredUnsubscribes).toHaveLength(1);
    deferredUnsubscribes[0]();

    await Promise.all([leaving, rejoining]);

    // The channels are live again — this is the case that used to leave the
    // event flagged as subscribed with nothing actually listening.
    expect(isEventSubscribed("abcd2345")).toBe(true);
    expect(subscriptionRefCount("abcd2345")).toBe(1);
    expect(subscribeToEvent).toHaveBeenCalledTimes(1);
  });

  it("does not tear down channels a still-connected player needs", async () => {
    await subscribeEvent("abcd2345", getConnections);

    vi.mocked(unsubscribeFromEvent).mockImplementationOnce(hangingUnsubscribe);
    const leaving = unsubscribeEvent("abcd2345");
    const rejoining = subscribeEvent("abcd2345", getConnections);

    await new Promise((resolve) => setTimeout(resolve, 0));
    deferredUnsubscribes[0]();
    await Promise.all([leaving, rejoining]);

    // One teardown for the departing socket, none afterwards
    expect(unsubscribeFromEvent).toHaveBeenCalledTimes(1);
    expect(isEventSubscribed("abcd2345")).toBe(true);
  });

  it("keeps events independent", async () => {
    await subscribeEvent("abcd2345", getConnections);
    await subscribeEvent("efgh6789", getConnections);

    await unsubscribeEvent("abcd2345");

    expect(isEventSubscribed("abcd2345")).toBe(false);
    expect(isEventSubscribed("efgh6789")).toBe(true);
  });

  it("clears everything on shutdown", async () => {
    await subscribeEvent("abcd2345", getConnections);
    await subscribeEvent("efgh6789", getConnections);

    await unsubscribeAll();

    expect(unsubscribeFromEvent).toHaveBeenCalledTimes(2);
    expect(isEventSubscribed("abcd2345")).toBe(false);
    expect(subscriptionRefCount("efgh6789")).toBe(0);
  });

  it("does not go negative when a close arrives without a matching open", async () => {
    await unsubscribeEvent("abcd2345");

    expect(subscriptionRefCount("abcd2345")).toBe(0);
    expect(unsubscribeFromEvent).not.toHaveBeenCalled();

    await subscribeEvent("abcd2345", getConnections);
    expect(subscriptionRefCount("abcd2345")).toBe(1);
    expect(isEventSubscribed("abcd2345")).toBe(true);
  });
});
