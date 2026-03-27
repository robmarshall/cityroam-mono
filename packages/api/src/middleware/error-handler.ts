import type { ErrorHandler } from "hono";
import { z } from "zod";
import { env } from "../env.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.statusCode as any);
  }

  if (err instanceof z.ZodError) {
    const message = err.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: message, code: "INVALID_INPUT" }, 400);
  }

  // Don't leak stack traces in production
  const message =
    env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  console.error("[error]", err);

  return c.json({ error: message, code: "INTERNAL_ERROR" }, 500);
};
