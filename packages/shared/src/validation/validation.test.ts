import { describe, expect, it } from "vitest";
import {
  displayNameSchema,
  chatMessageSchema,
  eventCodeSchema,
  routeSchema,
  stopSchema,
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

  it("rejects whitespace-only string", () => {
    expect(() => displayNameSchema.parse("   ")).toThrow();
  });

  it("rejects names over 30 characters", () => {
    expect(() => displayNameSchema.parse("A".repeat(31))).toThrow();
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

  it("rejects messages longer than 500 chars", () => {
    expect(() => chatMessageSchema.parse("x".repeat(501))).toThrow();
  });

  it("accepts messages at exactly 500 chars", () => {
    expect(chatMessageSchema.parse("x".repeat(500))).toHaveLength(500);
  });
});

describe("eventCodeSchema", () => {
  it("accepts valid event codes", () => {
    expect(eventCodeSchema.parse("ABCDEFGH")).toBe("ABCDEFGH");
    expect(eventCodeSchema.parse("234567")).toBe("234567"); // 6 chars min
  });

  it("rejects codes with ambiguous characters", () => {
    expect(() => eventCodeSchema.parse("ABCDEFG0")).toThrow();
    expect(() => eventCodeSchema.parse("ABCDEFGI")).toThrow();
  });

  it("rejects too-short codes", () => {
    expect(() => eventCodeSchema.parse("ABCDE")).toThrow();
  });

  it("rejects too-long codes", () => {
    expect(() => eventCodeSchema.parse("ABCDEFGHJ")).toThrow();
  });

  it("rejects lowercase", () => {
    expect(() => eventCodeSchema.parse("abcdefgh")).toThrow();
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

describe("stopSchema", () => {
  const validStop = {
    name: "Town Hall",
    clue: "Find the big clock",
    accepted_answers: ["town hall"],
    hints: ["Look up", "Near the square"],
  };

  it("accepts valid stop data", () => {
    const result = stopSchema.parse(validStop);
    expect(result.name).toBe("Town Hall");
    expect(result.images).toEqual([]); // default
  });

  it("accepts 3 hints", () => {
    const result = stopSchema.parse({
      ...validStop,
      hints: ["one", "two", "three"],
    });
    expect(result.hints).toHaveLength(3);
  });

  it("rejects fewer than 2 hints", () => {
    expect(() =>
      stopSchema.parse({ ...validStop, hints: ["only one"] }),
    ).toThrow();
  });

  it("rejects more than 3 hints", () => {
    expect(() =>
      stopSchema.parse({ ...validStop, hints: ["a", "b", "c", "d"] }),
    ).toThrow();
  });

  it("rejects empty accepted_answers", () => {
    expect(() =>
      stopSchema.parse({ ...validStop, accepted_answers: [] }),
    ).toThrow();
  });

  it("rejects empty stop name", () => {
    expect(() => stopSchema.parse({ ...validStop, name: "" })).toThrow();
  });

  it("rejects empty clue", () => {
    expect(() => stopSchema.parse({ ...validStop, clue: "" })).toThrow();
  });

  it("accepts valid google_maps_link", () => {
    const result = stopSchema.parse({
      ...validStop,
      google_maps_link: "https://maps.google.com/place",
    });
    expect(result.google_maps_link).toBe("https://maps.google.com/place");
  });

  it("accepts empty string for google_maps_link", () => {
    const result = stopSchema.parse({
      ...validStop,
      google_maps_link: "",
    });
    expect(result.google_maps_link).toBe("");
  });

  it("rejects invalid google_maps_link", () => {
    expect(() =>
      stopSchema.parse({ ...validStop, google_maps_link: "not-a-url" }),
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
