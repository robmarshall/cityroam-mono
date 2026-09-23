import { describe, it, expect, vi, beforeEach } from "vitest";

// The S3 service against a fake client: listing pagination and the cap, and
// how HeadObject misses are told apart from real failures.

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public readonly input: Record<string, unknown>) {}
  }
  return {
    S3Client: class {
      send = mockSend;
    },
    PutObjectCommand: class PutObjectCommand extends Command {},
    HeadObjectCommand: class HeadObjectCommand extends Command {},
    ListObjectsV2Command: class ListObjectsV2Command extends Command {},
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://s3.test.com/signed"),
}));

// setup.ts mocks this module for every other test; this file wants the real one.
const { headObject, listObjects, MAX_LISTED_OBJECTS } =
  await vi.importActual<typeof import("../services/s3.js")>("../services/s3.js");

function page(keys: string[], next?: string) {
  return {
    Contents: keys.map((Key, i) => ({ Key, Size: 100 + i, LastModified: new Date(0) })),
    IsTruncated: next !== undefined,
    NextContinuationToken: next,
  };
}

beforeEach(() => {
  mockSend.mockReset();
});

describe("listObjects", () => {
  it("follows continuation tokens to the end of the prefix", async () => {
    mockSend
      .mockResolvedValueOnce(page(["route-images/a.jpg", "route-images/b.jpg"], "t1"))
      .mockResolvedValueOnce(page(["route-images/c.jpg"], "t2"))
      .mockResolvedValueOnce(page(["route-images/d.jpg"]));

    const { objects, truncated } = await listObjects("route-images/");

    expect(truncated).toBe(false);
    expect(objects.map((o) => o.key)).toEqual([
      "route-images/a.jpg",
      "route-images/b.jpg",
      "route-images/c.jpg",
      "route-images/d.jpg",
    ]);
    expect(objects[0]).toEqual({ key: "route-images/a.jpg", size: 100, last_modified: new Date(0) });

    const inputs = mockSend.mock.calls.map(([cmd]) => cmd.input);
    expect(inputs.map((i) => i.ContinuationToken)).toEqual([undefined, "t1", "t2"]);
    expect(inputs.every((i) => i.Prefix === "route-images/" && i.Bucket === "test-bucket")).toBe(true);
    expect(inputs[0].MaxKeys).toBe(1000);
  });

  it("stops at the cap and says the listing was truncated", async () => {
    mockSend
      .mockResolvedValueOnce(page(["k/1", "k/2"], "t1"))
      .mockResolvedValueOnce(page(["k/3", "k/4"], "t2"));

    const { objects, truncated } = await listObjects("k/", 3);

    expect(truncated).toBe(true);
    expect(objects.map((o) => o.key)).toEqual(["k/1", "k/2", "k/3"]);
    // Never asks S3 for more than the cap still allows.
    expect(mockSend.mock.calls.map(([cmd]) => cmd.input.MaxKeys)).toEqual([3, 1]);
  });

  it("reports truncation when the cap is hit exactly with more pages left", async () => {
    mockSend.mockResolvedValueOnce(page(["k/1", "k/2"], "t1"));

    const { objects, truncated } = await listObjects("k/", 2);

    expect(objects).toHaveLength(2);
    expect(truncated).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("handles an empty prefix", async () => {
    mockSend.mockResolvedValueOnce({ IsTruncated: false });
    expect(await listObjects("route-images/")).toEqual({ objects: [], truncated: false });
  });

  it("caps at 5000 objects by default", () => {
    expect(MAX_LISTED_OBJECTS).toBe(5000);
  });
});

describe("headObject", () => {
  it("returns size and last modified for an existing object", async () => {
    const at = new Date("2026-09-01T00:00:00Z");
    mockSend.mockResolvedValueOnce({ ContentLength: 512, LastModified: at });

    expect(await headObject("route-images/a.jpg")).toEqual({ size: 512, last_modified: at });
    expect(mockSend.mock.calls[0][0].input).toEqual({ Bucket: "test-bucket", Key: "route-images/a.jpg" });
  });

  it("returns null for a missing object", async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error("NotFound"), { name: "NotFound" }));
    expect(await headObject("route-images/a.jpg")).toBeNull();

    mockSend.mockRejectedValueOnce(
      Object.assign(new Error("x"), { name: "Unknown", $metadata: { httpStatusCode: 404 } }),
    );
    expect(await headObject("route-images/a.jpg")).toBeNull();
  });

  it("rethrows anything else, including a 403", async () => {
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error("Forbidden"), { name: "Forbidden", $metadata: { httpStatusCode: 403 } }),
    );
    await expect(headObject("route-images/a.jpg")).rejects.toThrow("Forbidden");
  });
});
