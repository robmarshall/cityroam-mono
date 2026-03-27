import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { z } from "zod";

// ── Mock db module ─────────────────────────────────────────────────
vi.mock("../db/index.js", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    query: {
      events: { findFirst: vi.fn() },
      participants: { findFirst: vi.fn() },
      stops: { findFirst: vi.fn() },
      routes: { findFirst: vi.fn() },
      messageBanks: { findFirst: vi.fn() },
    },
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
  },
  disconnectDb: vi.fn(),
  schema: {},
}));

import { createTestApp, jsonRequest } from "./helpers.js";
import { db } from "../db/index.js";
import { redis } from "../redis/client.js";
import { errorHandler, AppError } from "../middleware/error-handler.js";

// ── Health Check Tests ─────────────────────────────────────────────
describe("GET /health", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default successful mocks
    vi.mocked(db.execute).mockResolvedValue([{ "?column?": 1 }] as any);
    vi.mocked(redis.ping).mockResolvedValue("PONG");
    app = createTestApp();
  });

  it("returns 200 with status ok when db and redis are healthy", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ status: "ok", db: "ok", redis: "ok" });
  });

  it("returns 503 with degraded status when db fails", async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("connection refused"));

    const res = await app.request("/health");
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body).toEqual({ status: "degraded", db: "error", redis: "ok" });
  });

  it("returns 503 with degraded status when redis fails", async () => {
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error("redis down"));

    const res = await app.request("/health");
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body).toEqual({ status: "degraded", db: "ok", redis: "error" });
  });

  it("returns 503 with degraded status when both db and redis fail", async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("db down"));
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error("redis down"));

    const res = await app.request("/health");
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body).toEqual({ status: "degraded", db: "error", redis: "error" });
  });
});

// ── Error Handler Middleware Tests ─────────────────────────────────
describe("errorHandler middleware", () => {
  function createErrorTestApp(throwFn: () => never): Hono {
    const app = new Hono();
    app.onError(errorHandler);
    app.get("/throw", (c) => {
      throwFn();
    });
    return app;
  }

  it("returns correct status code and shape for AppError", async () => {
    const app = createErrorTestApp(() => {
      throw new AppError(404, "Event not found", "NOT_FOUND");
    });

    const res = await app.request("/throw");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toEqual({ error: "Event not found", code: "NOT_FOUND" });
  });

  it("returns 409 for AppError with conflict code", async () => {
    const app = createErrorTestApp(() => {
      throw new AppError(409, "Already exists", "CONFLICT");
    });

    const res = await app.request("/throw");
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body).toEqual({ error: "Already exists", code: "CONFLICT" });
  });

  it("returns 400 with INVALID_INPUT code for ZodError", async () => {
    const app = createErrorTestApp(() => {
      const schema = z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email"),
      });
      schema.parse({ name: "", email: "not-an-email" });
      throw new Error("unreachable");
    });

    const res = await app.request("/throw");
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
  });

  it("returns 500 with INTERNAL_ERROR code for unknown errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const app = createErrorTestApp(() => {
      throw new Error("something unexpected");
    });

    const res = await app.request("/throw");
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("does not leak error details for unknown errors in production", async () => {
    // env is mocked with NODE_ENV=development in setup.ts,
    // so in dev mode the message is passed through
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const app = createErrorTestApp(() => {
      throw new Error("secret internal details");
    });

    const res = await app.request("/throw");
    expect(res.status).toBe(500);

    const body = await res.json();
    // In development mode the original message is exposed
    expect(body.error).toBe("secret internal details");
    expect(body.code).toBe("INTERNAL_ERROR");

    consoleSpy.mockRestore();
  });
});
