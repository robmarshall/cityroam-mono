import { vi, describe, it, expect, beforeEach } from "vitest";

import { redis } from "../../redis/client.js";
import {
  isLLMUnhealthy,
  recordLLMFailure,
  recordLLMSuccess,
  withHealthTracking,
  LLM_FAILURE_THRESHOLD,
} from "../../services/pipeline/llm-health.js";

describe("LLM circuit breaker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (redis.get as any).mockResolvedValue(null);
    (redis.eval as any).mockResolvedValue(1);
    (redis.del as any).mockResolvedValue(1);
  });

  describe("isLLMUnhealthy", () => {
    it("reports healthy when no flag is set", async () => {
      expect(await isLLMUnhealthy()).toBe(false);
    });

    it("reports unhealthy when the flag is present", async () => {
      (redis.get as any).mockResolvedValue("1");
      expect(await isLLMUnhealthy()).toBe(true);
    });

    it("assumes healthy when Redis itself is broken", async () => {
      // A broken breaker must never be worse than no breaker
      (redis.get as any).mockRejectedValue(new Error("connection refused"));
      expect(await isLLMUnhealthy()).toBe(false);
    });
  });

  describe("recordLLMFailure", () => {
    it("counts the failure and can open the breaker in one round trip", async () => {
      (redis.eval as any).mockResolvedValue(LLM_FAILURE_THRESHOLD);

      await recordLLMFailure();

      expect(redis.eval).toHaveBeenCalledTimes(1);
      const args = (redis.eval as any).mock.calls[0];
      expect(args[1]).toBe(2); // two keys: counter and flag
      expect(args[4]).toBe(String(LLM_FAILURE_THRESHOLD));
    });

    it("swallows Redis errors", async () => {
      (redis.eval as any).mockRejectedValue(new Error("connection refused"));
      await expect(recordLLMFailure()).resolves.toBeUndefined();
    });
  });

  describe("recordLLMSuccess", () => {
    it("clears both the counter and the flag", async () => {
      await recordLLMSuccess();
      expect(redis.del).toHaveBeenCalledWith("llm:failures", "llm:unhealthy");
    });

    it("swallows Redis errors", async () => {
      (redis.del as any).mockRejectedValue(new Error("connection refused"));
      await expect(recordLLMSuccess()).resolves.toBeUndefined();
    });
  });

  describe("withHealthTracking", () => {
    it("passes calls through and clears the breaker on success", async () => {
      const inner = { classify: vi.fn().mockResolvedValue({ type: "answer-attempt" }) };

      const result = await withHealthTracking(inner).classify("prompt");

      expect(result).toEqual({ type: "answer-attempt" });
      expect(inner.classify).toHaveBeenCalledWith("prompt");
      expect(redis.del).toHaveBeenCalled();
    });

    it("records a failure when the provider returns null", async () => {
      const inner = { classify: vi.fn().mockResolvedValue(null) };

      const result = await withHealthTracking(inner).classify("prompt");

      expect(result).toBeNull();
      expect(redis.eval).toHaveBeenCalled();
    });

    it("skips the call entirely while the breaker is open", async () => {
      // The point of the breaker: no waiting out a 30s provider timeout on
      // every message while DeepSeek is down.
      (redis.get as any).mockResolvedValue("1");
      const inner = { classify: vi.fn().mockResolvedValue({ type: "question" }) };

      const result = await withHealthTracking(inner).classify("prompt");

      expect(result).toBeNull();
      expect(inner.classify).not.toHaveBeenCalled();
    });
  });
});
