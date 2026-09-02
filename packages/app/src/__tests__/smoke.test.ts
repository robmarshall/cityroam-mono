import { describe, it, expect } from "vitest";
import { ApiError } from "../lib/api";

// Smoke test: proves the package's module graph resolves under the workspace
// (including the @cityroam/shared TS exports) and that the error type the whole
// UI branches on carries the fields it promises.
describe("app smoke", () => {
  it("builds an ApiError from a JSON error body", () => {
    const err = new ApiError(404, {
      error: "Event not found",
      code: "EVENT_NOT_FOUND",
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(404);
    expect(err.code).toBe("EVENT_NOT_FOUND");
    expect(err.message).toBe("Event not found");
  });

  it("falls back to a status message when the body has no error text", () => {
    const err = new ApiError(500);

    expect(err.message).toBe("Request failed with status 500");
    expect(err.code).toBeUndefined();
  });
});
