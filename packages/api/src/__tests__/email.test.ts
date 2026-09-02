import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockResendEmailsSend = vi.fn();
vi.mock("resend", () => {
  const ResendMock = function (this: any) {
    this.emails = { send: mockResendEmailsSend };
  } as any;
  return { Resend: ResendMock };
});

vi.mock("../db/index.js", () => {
  const mockDb: any = {
    update: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    where: vi.fn(async () => []),
  };
  return { db: mockDb, disconnectDb: vi.fn(), schema: {} };
});

import { db } from "../db/index.js";
import { sendEventCodeEmail, emailRetryPolicy } from "../services/email.js";

const originalBackoff = emailRetryPolicy.backoffMs;

beforeEach(() => {
  mockResendEmailsSend.mockReset();
  (db as any).update.mockClear();
  (db as any).set.mockClear();
  emailRetryPolicy.backoffMs = [0, 0];
});

afterEach(() => {
  emailRetryPolicy.backoffMs = originalBackoff;
});

const request = {
  eventId: "11111111-1111-1111-1111-111111111111",
  code: "ABCD1234",
  buyerEmail: "buyer@example.com",
  language: "en" as const,
};

/** What was written to the event row on the last update. */
function lastWrite(): Record<string, unknown> {
  return (db as any).set.mock.calls.at(-1)![0];
}

describe("sendEventCodeEmail", () => {
  it("sends once when the first attempt succeeds", async () => {
    mockResendEmailsSend.mockResolvedValueOnce({ data: { id: "email_1" } });

    const outcome = await sendEventCodeEmail(request);

    expect(outcome).toMatchObject({ sent: true, attempts: 1, error: null });
    expect(mockResendEmailsSend).toHaveBeenCalledOnce();
  });

  it("records the send on the event and clears any earlier failure", async () => {
    mockResendEmailsSend.mockResolvedValueOnce({ data: { id: "email_1" } });

    await sendEventCodeEmail(request);

    const written = lastWrite();
    expect(written.code_email_sent_at).toBeInstanceOf(Date);
    expect(written.code_email_failed_at).toBeNull();
    expect(written.code_email_error).toBeNull();
  });

  it("retries a thrown error and reports the attempt it succeeded on", async () => {
    mockResendEmailsSend
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({ data: { id: "email_2" } });

    const outcome = await sendEventCodeEmail(request);

    expect(outcome.sent).toBe(true);
    expect(outcome.attempts).toBe(2);
    expect(lastWrite().code_email_sent_at).toBeInstanceOf(Date);
  });

  it("treats a returned { error } as a failure", async () => {
    // The Resend SDK reports most API failures by returning rather than
    // throwing, so a bare try/catch would call this a success.
    mockResendEmailsSend
      .mockResolvedValueOnce({ error: { message: "rate limit exceeded" } })
      .mockResolvedValueOnce({ data: { id: "email_2" } });

    const outcome = await sendEventCodeEmail(request);

    expect(outcome.sent).toBe(true);
    expect(outcome.attempts).toBe(2);
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured number of attempts", async () => {
    mockResendEmailsSend.mockRejectedValue(new Error("resend is down"));

    const outcome = await sendEventCodeEmail(request);

    expect(outcome.sent).toBe(false);
    expect(outcome.attempts).toBe(emailRetryPolicy.maxAttempts);
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(emailRetryPolicy.maxAttempts);
  });

  it("flags the event so an admin can see the buyer never got their code", async () => {
    mockResendEmailsSend.mockRejectedValue(new Error("resend is down"));

    await sendEventCodeEmail(request);

    const written = lastWrite();
    expect(written.code_email_failed_at).toBeInstanceOf(Date);
    expect(written.code_email_error).toContain("resend is down");
    expect(written).not.toHaveProperty("code_email_sent_at");
  });

  it("waits between attempts", async () => {
    emailRetryPolicy.backoffMs = [40, 40];
    mockResendEmailsSend.mockRejectedValue(new Error("resend is down"));

    const started = Date.now();
    await sendEventCodeEmail(request);

    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
  });

  it("never throws, so a webhook can still answer 200", async () => {
    mockResendEmailsSend.mockRejectedValue(new Error("resend is down"));
    (db as any).where.mockRejectedValueOnce(new Error("database is down"));

    await expect(sendEventCodeEmail(request)).resolves.toMatchObject({ sent: false });
  });

  it("skips the row update when there is no event to record against", async () => {
    mockResendEmailsSend.mockResolvedValueOnce({ data: { id: "email_1" } });

    const outcome = await sendEventCodeEmail({ ...request, eventId: null });

    expect(outcome.sent).toBe(true);
    expect((db as any).update).not.toHaveBeenCalled();
  });
});
