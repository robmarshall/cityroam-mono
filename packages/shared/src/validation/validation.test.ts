import { describe, expect, it } from "vitest";
import {
  displayNameSchema,
  chatMessageSchema,
  eventCodeSchema,
  routeSchema,
  imageUploadSchema,
  joinEventRequestSchema,
  startEventRequestSchema,
} from "./index.js";

describe("displayNameSchema", () => {
  it("accepts valid display names", () => {
    expect(displayNameSchema.parse("Alice")).toBe("Alice");
    expect(displayNameSchema.parse("Bob's Team")).toBe("Bob's Team");
    expect(displayNameSchema.parse("Mary-Jane")).toBe("Mary-Jane");
    expect(displayNameSchema.parse("Player 1")).toBe("Player 1");
  });

  it("trims whitespace", () => {
    expect(displayNameSchema.parse("  Alice  ")).toBe("Alice");
  });

  it("rejects empty string", () => {
    expect(() => displayNameSchema.parse("")).toThrow();
  });

  it("rejects single character name", () => {
    expect(() => displayNameSchema.parse("A")).toThrow();
  });

  it("rejects whitespace-only string", () => {
    expect(() => displayNameSchema.parse("   ")).toThrow();
  });

  it("rejects names over 20 characters", () => {
    expect(() => displayNameSchema.parse("A".repeat(21))).toThrow();
  });

  it("rejects names with HTML tags", () => {
    expect(() => displayNameSchema.parse("<script>alert</script>")).toThrow();
    expect(() => displayNameSchema.parse("hi<b>bold</b>")).toThrow();
  });

  it("rejects names with special characters", () => {
    expect(() => displayNameSchema.parse("Alice!")).toThrow();
    expect(() => displayNameSchema.parse("Bob@home")).toThrow();
    expect(() => displayNameSchema.parse("name#1")).toThrow();
  });
});

describe("chatMessageSchema", () => {
  it("accepts valid messages", () => {
    expect(chatMessageSchema.parse("Hello there")).toBe("Hello there");
    expect(chatMessageSchema.parse("ab")).toBe("ab"); // min length
  });

  it("trims whitespace", () => {
    expect(chatMessageSchema.parse("  hello  ")).toBe("hello");
  });

  it("rejects messages shorter than 2 chars", () => {
    expect(() => chatMessageSchema.parse("a")).toThrow();
  });

  it("rejects messages longer than 200 chars", () => {
    expect(() => chatMessageSchema.parse("x".repeat(201))).toThrow();
  });

  it("accepts messages at exactly 200 chars", () => {
    expect(chatMessageSchema.parse("x".repeat(200))).toHaveLength(200);
  });
});

describe("eventCodeSchema", () => {
  it("accepts valid lowercase event codes", () => {
    expect(eventCodeSchema.parse("abcdefgh")).toBe("abcdefgh");
    expect(eventCodeSchema.parse("234567")).toBe("234567"); // 6 chars min
  });

  it("normalises uppercase to lowercase", () => {
    expect(eventCodeSchema.parse("ABCDEFGH")).toBe("abcdefgh");
    expect(eventCodeSchema.parse("AbCdEfGh")).toBe("abcdefgh");
  });

  it("rejects codes with ambiguous characters", () => {
    expect(() => eventCodeSchema.parse("abcdefg0")).toThrow();
    expect(() => eventCodeSchema.parse("abcdefgi")).toThrow();
  });

  it("rejects too-short codes", () => {
    expect(() => eventCodeSchema.parse("abcde")).toThrow();
  });

  it("rejects too-long codes", () => {
    expect(() => eventCodeSchema.parse("abcdefghj")).toThrow();
  });
});

describe("routeSchema", () => {
  const validRoute = {
    city: "Leeds",
    name: "City Centre Discovery",
    estimated_duration_mins: 90,
    estimated_distance_km: 2.5,
  };

  it("accepts valid route data", () => {
    const result = routeSchema.parse(validRoute);
    expect(result.city).toBe("Leeds");
    expect(result.is_active).toBe(true); // default
  });

  it("accepts optional fields", () => {
    const result = routeSchema.parse({
      ...validRoute,
      description: "A fun route",
      is_active: false,
    });
    expect(result.description).toBe("A fun route");
    expect(result.is_active).toBe(false);
  });

  it("rejects empty city", () => {
    expect(() => routeSchema.parse({ ...validRoute, city: "" })).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => routeSchema.parse({ ...validRoute, name: "" })).toThrow();
  });

  it("rejects non-positive duration", () => {
    expect(() =>
      routeSchema.parse({ ...validRoute, estimated_duration_mins: 0 }),
    ).toThrow();
    expect(() =>
      routeSchema.parse({ ...validRoute, estimated_duration_mins: -1 }),
    ).toThrow();
  });

  it("rejects non-positive distance", () => {
    expect(() =>
      routeSchema.parse({ ...validRoute, estimated_distance_km: 0 }),
    ).toThrow();
  });
});

describe("imageUploadSchema", () => {
  it("accepts valid JPEG upload", () => {
    const result = imageUploadSchema.parse({
      type: "image/jpeg",
      size: 1024,
      filename: "photo.jpg",
    });
    expect(result.type).toBe("image/jpeg");
  });

  it("accepts valid PNG upload", () => {
    const result = imageUploadSchema.parse({
      type: "image/png",
      size: 2048,
      filename: "photo.png",
    });
    expect(result.type).toBe("image/png");
  });

  it("rejects unsupported image types", () => {
    expect(() =>
      imageUploadSchema.parse({
        type: "image/gif",
        size: 1024,
        filename: "anim.gif",
      }),
    ).toThrow();
  });

  it("rejects files over 5MB", () => {
    expect(() =>
      imageUploadSchema.parse({
        type: "image/jpeg",
        size: 5 * 1024 * 1024 + 1,
        filename: "big.jpg",
      }),
    ).toThrow();
  });

  it("accepts files at exactly 5MB", () => {
    const result = imageUploadSchema.parse({
      type: "image/jpeg",
      size: 5 * 1024 * 1024,
      filename: "exact.jpg",
    });
    expect(result.size).toBe(5 * 1024 * 1024);
  });

  it("rejects empty filename", () => {
    expect(() =>
      imageUploadSchema.parse({
        type: "image/jpeg",
        size: 1024,
        filename: "",
      }),
    ).toThrow();
  });
});

describe("joinEventRequestSchema", () => {
  it("accepts valid join request", () => {
    const result = joinEventRequestSchema.parse({ display_name: "Alice" });
    expect(result.display_name).toBe("Alice");
  });

  it("validates display_name through displayNameSchema", () => {
    expect(() =>
      joinEventRequestSchema.parse({ display_name: "" }),
    ).toThrow();
    expect(() =>
      joinEventRequestSchema.parse({ display_name: "<script>" }),
    ).toThrow();
  });
});

describe("startEventRequestSchema", () => {
  it("accepts valid start request", () => {
    const result = startEventRequestSchema.parse({ token: "abc123" });
    expect(result.token).toBe("abc123");
  });

  it("rejects empty token", () => {
    expect(() => startEventRequestSchema.parse({ token: "" })).toThrow();
  });
});
