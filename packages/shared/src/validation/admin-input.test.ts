import { describe, expect, it } from "vitest";
import {
  adminLoginSchema,
  routeSchema,
  sequenceItemSchema,
  imageUploadRequestSchema,
  adminUpdateEventStatusSchema,
  adminCreateEventSchema,
  messageBlockConfigSchema,
  imageBlockConfigSchema,
  questionBlockConfigSchema,
  actionBlockConfigSchema,
  mapBlockConfigSchema,
  blockConfigSchema,
  routeBlockSchema,
  routeGroupSchema,
  groupUpdateSchema,
  bulkRouteGroupCreateSchema,
  groupReorderSchema,
  blockReorderSchema,
  blockMoveSchema,
  messageBankSchema,
} from "./admin-input.js";

// ---------------------------------------------------------------------------
// adminLoginSchema
// ---------------------------------------------------------------------------
describe("adminLoginSchema", () => {
  it("accepts valid credentials", () => {
    const result = adminLoginSchema.parse({ username: "admin", password: "secret" });
    expect(result.username).toBe("admin");
    expect(result.password).toBe("secret");
  });

  it("trims username whitespace", () => {
    const result = adminLoginSchema.parse({ username: "  admin  ", password: "secret" });
    expect(result.username).toBe("admin");
  });

  it("does not trim password", () => {
    const result = adminLoginSchema.parse({ username: "admin", password: "  secret  " });
    expect(result.password).toBe("  secret  ");
  });

  it("rejects empty username", () => {
    expect(() => adminLoginSchema.parse({ username: "", password: "secret" })).toThrow();
  });

  it("rejects whitespace-only username", () => {
    expect(() => adminLoginSchema.parse({ username: "   ", password: "secret" })).toThrow();
  });

  it("rejects empty password", () => {
    expect(() => adminLoginSchema.parse({ username: "admin", password: "" })).toThrow();
  });

  it("rejects missing username", () => {
    expect(() => adminLoginSchema.parse({ password: "secret" })).toThrow();
  });

  it("rejects missing password", () => {
    expect(() => adminLoginSchema.parse({ username: "admin" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// routeSchema — only refine logic & defaults (basics tested in validation.test.ts)
// ---------------------------------------------------------------------------
describe("routeSchema (refine & defaults)", () => {
  const base = {
    name: "Route A",
    estimated_duration_mins: 60,
    estimated_distance_km: 3,
  };

  it("accepts route_family_id without city", () => {
    const result = routeSchema.parse({
      ...base,
      route_family_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(result.route_family_id).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("rejects when neither route_family_id nor city is provided", () => {
    expect(() => routeSchema.parse(base)).toThrow("Either route_family_id or city must be provided");
  });

  it("converts empty-string route_family_id to undefined via preprocess", () => {
    // With empty route_family_id and a city, it should still pass
    const result = routeSchema.parse({ ...base, route_family_id: "", city: "London" });
    expect(result.route_family_id).toBeUndefined();
    expect(result.city).toBe("London");
  });

  it("rejects invalid uuid for route_family_id", () => {
    expect(() => routeSchema.parse({ ...base, route_family_id: "not-a-uuid" })).toThrow();
  });

  it("defaults language to 'en'", () => {
    const result = routeSchema.parse({ ...base, city: "Leeds" });
    expect(result.language).toBe("en");
  });

  it("defaults is_active to true", () => {
    const result = routeSchema.parse({ ...base, city: "Leeds" });
    expect(result.is_active).toBe(true);
  });

  it("accepts custom language", () => {
    const result = routeSchema.parse({ ...base, city: "Leeds", language: "fr" });
    expect(result.language).toBe("fr");
  });

  it("rejects language shorter than 2 chars", () => {
    expect(() => routeSchema.parse({ ...base, city: "Leeds", language: "e" })).toThrow();
  });

  it("rejects language longer than 5 chars", () => {
    expect(() => routeSchema.parse({ ...base, city: "Leeds", language: "english" })).toThrow();
  });

  it("rejects duration exceeding 1440", () => {
    expect(() => routeSchema.parse({ ...base, city: "Leeds", estimated_duration_mins: 1441 })).toThrow();
  });

  it("rejects distance exceeding 100 km", () => {
    expect(() => routeSchema.parse({ ...base, city: "Leeds", estimated_distance_km: 101 })).toThrow();
  });

  it("accepts boundary values for duration and distance", () => {
    const result = routeSchema.parse({
      ...base,
      city: "Leeds",
      estimated_duration_mins: 1440,
      estimated_distance_km: 100,
    });
    expect(result.estimated_duration_mins).toBe(1440);
    expect(result.estimated_distance_km).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// sequenceItemSchema
// ---------------------------------------------------------------------------
describe("sequenceItemSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = sequenceItemSchema.parse({
      content: "Hello",
      image_url: "https://example.com/img.png",
      delay_ms: 500,
    });
    expect(result.content).toBe("Hello");
    expect(result.image_url).toBe("https://example.com/img.png");
    expect(result.delay_ms).toBe(500);
  });

  it("applies defaults for missing fields", () => {
    const result = sequenceItemSchema.parse({});
    expect(result.content).toBe("");
    expect(result.image_url).toBeNull();
    expect(result.delay_ms).toBe(0);
  });

  it("accepts null image_url", () => {
    const result = sequenceItemSchema.parse({ image_url: null });
    expect(result.image_url).toBeNull();
  });

  it("rejects invalid image_url", () => {
    expect(() => sequenceItemSchema.parse({ image_url: "not-a-url" })).toThrow();
  });

  it("rejects negative delay_ms", () => {
    expect(() => sequenceItemSchema.parse({ delay_ms: -1 })).toThrow();
  });

  it("rejects delay_ms over 10000", () => {
    expect(() => sequenceItemSchema.parse({ delay_ms: 10001 })).toThrow();
  });

  it("accepts boundary delay_ms values", () => {
    expect(sequenceItemSchema.parse({ delay_ms: 0 }).delay_ms).toBe(0);
    expect(sequenceItemSchema.parse({ delay_ms: 10000 }).delay_ms).toBe(10000);
  });

  it("rejects non-integer delay_ms", () => {
    expect(() => sequenceItemSchema.parse({ delay_ms: 1.5 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// imageUploadRequestSchema
// ---------------------------------------------------------------------------
describe("imageUploadRequestSchema", () => {
  it("accepts valid JPEG request", () => {
    const result = imageUploadRequestSchema.parse({ filename: "photo.jpg", content_type: "image/jpeg" });
    expect(result.filename).toBe("photo.jpg");
    expect(result.content_type).toBe("image/jpeg");
  });

  it("accepts valid PNG request", () => {
    const result = imageUploadRequestSchema.parse({ filename: "photo.png", content_type: "image/png" });
    expect(result.content_type).toBe("image/png");
  });

  it("trims filename whitespace", () => {
    const result = imageUploadRequestSchema.parse({ filename: "  photo.jpg  ", content_type: "image/jpeg" });
    expect(result.filename).toBe("photo.jpg");
  });

  it("rejects empty filename", () => {
    expect(() => imageUploadRequestSchema.parse({ filename: "", content_type: "image/jpeg" })).toThrow();
  });

  it("rejects whitespace-only filename", () => {
    expect(() => imageUploadRequestSchema.parse({ filename: "   ", content_type: "image/jpeg" })).toThrow();
  });

  it("rejects unsupported content_type", () => {
    expect(() => imageUploadRequestSchema.parse({ filename: "f.gif", content_type: "image/gif" })).toThrow();
    expect(() => imageUploadRequestSchema.parse({ filename: "f.webp", content_type: "image/webp" })).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => imageUploadRequestSchema.parse({ filename: "f.jpg" })).toThrow();
    expect(() => imageUploadRequestSchema.parse({ content_type: "image/jpeg" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// adminUpdateEventStatusSchema
// ---------------------------------------------------------------------------
describe("adminUpdateEventStatusSchema", () => {
  it("accepts valid status update", () => {
    const result = adminUpdateEventStatusSchema.parse({ status: "COMPLETED" });
    expect(result.status).toBe("COMPLETED");
  });

  it("accepts all valid status values", () => {
    for (const s of ["NOT_STARTED", "WAITING", "IN_PROGRESS", "COMPLETED", "EXPIRED", "REFUNDED"]) {
      expect(adminUpdateEventStatusSchema.parse({ status: s }).status).toBe(s);
    }
  });

  it("accepts refund_requested alone", () => {
    const result = adminUpdateEventStatusSchema.parse({ refund_requested: true });
    expect(result.refund_requested).toBe(true);
  });

  it("accepts refund_note alone", () => {
    const result = adminUpdateEventStatusSchema.parse({ refund_note: "Customer asked" });
    expect(result.refund_note).toBe("Customer asked");
  });

  it("rejects when no fields are provided (refine)", () => {
    expect(() => adminUpdateEventStatusSchema.parse({})).toThrow("At least one field must be provided");
  });

  it("rejects invalid status value", () => {
    expect(() => adminUpdateEventStatusSchema.parse({ status: "INVALID" })).toThrow();
  });

  it("rejects refund_note over 2000 characters", () => {
    expect(() => adminUpdateEventStatusSchema.parse({ refund_note: "x".repeat(2001) })).toThrow();
  });

  it("accepts refund_note at exactly 2000 characters", () => {
    const result = adminUpdateEventStatusSchema.parse({ refund_note: "x".repeat(2000) });
    expect(result.refund_note).toHaveLength(2000);
  });
});

// ---------------------------------------------------------------------------
// adminCreateEventSchema
// ---------------------------------------------------------------------------
describe("adminCreateEventSchema", () => {
  const validUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("accepts valid input with only required fields", () => {
    const result = adminCreateEventSchema.parse({ route_id: validUuid });
    expect(result.route_id).toBe(validUuid);
    expect(result.buyer_email).toBeUndefined();
    expect(result.expires_in_days).toBeUndefined();
  });

  it("accepts all optional fields", () => {
    const result = adminCreateEventSchema.parse({
      route_id: validUuid,
      buyer_email: "test@example.com",
      expires_in_days: 30,
    });
    expect(result.buyer_email).toBe("test@example.com");
    expect(result.expires_in_days).toBe(30);
  });

  it("rejects invalid uuid for route_id", () => {
    expect(() => adminCreateEventSchema.parse({ route_id: "bad" })).toThrow();
  });

  it("rejects missing route_id", () => {
    expect(() => adminCreateEventSchema.parse({})).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() => adminCreateEventSchema.parse({ route_id: validUuid, buyer_email: "not-email" })).toThrow();
  });

  it("rejects expires_in_days below 1", () => {
    expect(() => adminCreateEventSchema.parse({ route_id: validUuid, expires_in_days: 0 })).toThrow();
  });

  it("rejects expires_in_days above 365", () => {
    expect(() => adminCreateEventSchema.parse({ route_id: validUuid, expires_in_days: 366 })).toThrow();
  });

  it("accepts boundary expires_in_days values", () => {
    expect(adminCreateEventSchema.parse({ route_id: validUuid, expires_in_days: 1 }).expires_in_days).toBe(1);
    expect(adminCreateEventSchema.parse({ route_id: validUuid, expires_in_days: 365 }).expires_in_days).toBe(365);
  });

  it("rejects non-integer expires_in_days", () => {
    expect(() => adminCreateEventSchema.parse({ route_id: validUuid, expires_in_days: 1.5 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// messageBlockConfigSchema
// ---------------------------------------------------------------------------
describe("messageBlockConfigSchema", () => {
  it("accepts valid message config", () => {
    const result = messageBlockConfigSchema.parse({ type: "message", content: "Hello" });
    expect(result.type).toBe("message");
    expect(result.content).toBe("Hello");
  });

  it("trims content whitespace", () => {
    const result = messageBlockConfigSchema.parse({ type: "message", content: "  Hello  " });
    expect(result.content).toBe("Hello");
  });

  it("rejects empty content", () => {
    expect(() => messageBlockConfigSchema.parse({ type: "message", content: "" })).toThrow();
  });

  it("rejects whitespace-only content", () => {
    expect(() => messageBlockConfigSchema.parse({ type: "message", content: "   " })).toThrow();
  });

  it("rejects wrong type literal", () => {
    expect(() => messageBlockConfigSchema.parse({ type: "image", content: "Hello" })).toThrow();
  });

  it("rejects missing content", () => {
    expect(() => messageBlockConfigSchema.parse({ type: "message" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// imageBlockConfigSchema
// ---------------------------------------------------------------------------
describe("imageBlockConfigSchema", () => {
  it("accepts valid image config", () => {
    const result = imageBlockConfigSchema.parse({ type: "image", image_url: "https://example.com/img.png" });
    expect(result.type).toBe("image");
  });

  it("rejects invalid URL", () => {
    expect(() => imageBlockConfigSchema.parse({ type: "image", image_url: "not-a-url" })).toThrow();
  });

  it("rejects missing image_url", () => {
    expect(() => imageBlockConfigSchema.parse({ type: "image" })).toThrow();
  });

  it("rejects wrong type literal", () => {
    expect(() => imageBlockConfigSchema.parse({ type: "message", image_url: "https://example.com/img.png" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// questionBlockConfigSchema
// ---------------------------------------------------------------------------
describe("questionBlockConfigSchema", () => {
  const validHints = [
    [{ content: "Hint 1" }],
    [{ content: "Hint 2" }],
  ];

  const validQuestion = {
    type: "question",
    clue: "What is the capital?",
    accepted_answers: ["London"],
    hints: validHints,
  };

  it("accepts valid question config", () => {
    const result = questionBlockConfigSchema.parse(validQuestion);
    expect(result.type).toBe("question");
    expect(result.clue).toBe("What is the capital?");
    expect(result.accepted_answers).toEqual(["London"]);
  });

  it("accepts multiple accepted answers", () => {
    const result = questionBlockConfigSchema.parse({
      ...validQuestion,
      accepted_answers: ["London", "london"],
    });
    expect(result.accepted_answers).toHaveLength(2);
  });

  it("trims clue whitespace", () => {
    const result = questionBlockConfigSchema.parse({ ...validQuestion, clue: "  What?  " });
    expect(result.clue).toBe("What?");
  });

  it("trims accepted answer whitespace", () => {
    const result = questionBlockConfigSchema.parse({ ...validQuestion, accepted_answers: ["  London  "] });
    expect(result.accepted_answers[0]).toBe("London");
  });

  it("rejects empty clue", () => {
    expect(() => questionBlockConfigSchema.parse({ ...validQuestion, clue: "" })).toThrow();
  });

  it("rejects empty accepted_answers array", () => {
    expect(() => questionBlockConfigSchema.parse({ ...validQuestion, accepted_answers: [] })).toThrow();
  });

  it("rejects empty string in accepted_answers", () => {
    expect(() => questionBlockConfigSchema.parse({ ...validQuestion, accepted_answers: [""] })).toThrow();
  });

  it("rejects fewer than 2 hint arrays", () => {
    expect(() =>
      questionBlockConfigSchema.parse({ ...validQuestion, hints: [[{ content: "Only one" }]] }),
    ).toThrow();
  });

  it("rejects more than 3 hint arrays", () => {
    expect(() =>
      questionBlockConfigSchema.parse({
        ...validQuestion,
        hints: [
          [{ content: "1" }],
          [{ content: "2" }],
          [{ content: "3" }],
          [{ content: "4" }],
        ],
      }),
    ).toThrow();
  });

  it("accepts exactly 3 hint arrays", () => {
    const result = questionBlockConfigSchema.parse({
      ...validQuestion,
      hints: [[{ content: "1" }], [{ content: "2" }], [{ content: "3" }]],
    });
    expect(result.hints).toHaveLength(3);
  });

  it("applies sequenceItem defaults within hints", () => {
    const result = questionBlockConfigSchema.parse(validQuestion);
    expect(result.hints[0][0].delay_ms).toBe(0);
    expect(result.hints[0][0].image_url).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// actionBlockConfigSchema
// ---------------------------------------------------------------------------
describe("actionBlockConfigSchema", () => {
  it("accepts valid action config", () => {
    const result = actionBlockConfigSchema.parse({ type: "action", label: "Take a photo" });
    expect(result.type).toBe("action");
    expect(result.label).toBe("Take a photo");
  });

  it("trims label whitespace", () => {
    const result = actionBlockConfigSchema.parse({ type: "action", label: "  Go  " });
    expect(result.label).toBe("Go");
  });

  it("rejects empty label", () => {
    expect(() => actionBlockConfigSchema.parse({ type: "action", label: "" })).toThrow();
  });

  it("rejects whitespace-only label", () => {
    expect(() => actionBlockConfigSchema.parse({ type: "action", label: "   " })).toThrow();
  });

  it("rejects missing label", () => {
    expect(() => actionBlockConfigSchema.parse({ type: "action" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// mapBlockConfigSchema
// ---------------------------------------------------------------------------
describe("mapBlockConfigSchema", () => {
  it("accepts valid map config", () => {
    const result = mapBlockConfigSchema.parse({
      type: "map",
      google_maps_link: "https://maps.google.com/place/123",
    });
    expect(result.type).toBe("map");
  });

  it("rejects invalid URL", () => {
    expect(() => mapBlockConfigSchema.parse({ type: "map", google_maps_link: "not-a-url" })).toThrow();
  });

  it("rejects missing google_maps_link", () => {
    expect(() => mapBlockConfigSchema.parse({ type: "map" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// blockConfigSchema (discriminated union)
// ---------------------------------------------------------------------------
describe("blockConfigSchema", () => {
  it("routes to message config", () => {
    const result = blockConfigSchema.parse({ type: "message", content: "Hi" });
    expect(result.type).toBe("message");
  });

  it("routes to image config", () => {
    const result = blockConfigSchema.parse({ type: "image", image_url: "https://example.com/img.png" });
    expect(result.type).toBe("image");
  });

  it("routes to question config", () => {
    const result = blockConfigSchema.parse({
      type: "question",
      clue: "What?",
      accepted_answers: ["Yes"],
      hints: [[{ content: "h1" }], [{ content: "h2" }]],
    });
    expect(result.type).toBe("question");
  });

  it("routes to action config", () => {
    const result = blockConfigSchema.parse({ type: "action", label: "Do it" });
    expect(result.type).toBe("action");
  });

  it("routes to map config", () => {
    const result = blockConfigSchema.parse({ type: "map", google_maps_link: "https://maps.google.com" });
    expect(result.type).toBe("map");
  });

  it("rejects unknown type", () => {
    expect(() => blockConfigSchema.parse({ type: "unknown", content: "Hi" })).toThrow();
  });

  it("rejects missing type", () => {
    expect(() => blockConfigSchema.parse({ content: "Hi" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// routeBlockSchema (with type/config.type refine)
// ---------------------------------------------------------------------------
describe("routeBlockSchema", () => {
  it("accepts valid block with matching type and config.type", () => {
    const result = routeBlockSchema.parse({
      type: "message",
      config: { type: "message", content: "Hello" },
    });
    expect(result.type).toBe("message");
    expect(result.delay_ms).toBe(0); // default
  });

  it("defaults delay_ms to 0", () => {
    const result = routeBlockSchema.parse({
      type: "action",
      config: { type: "action", label: "Go" },
    });
    expect(result.delay_ms).toBe(0);
  });

  it("accepts custom delay_ms", () => {
    const result = routeBlockSchema.parse({
      type: "message",
      config: { type: "message", content: "Hello" },
      delay_ms: 5000,
    });
    expect(result.delay_ms).toBe(5000);
  });

  it("rejects mismatched type and config.type (refine)", () => {
    expect(() =>
      routeBlockSchema.parse({
        type: "message",
        config: { type: "image", image_url: "https://example.com/img.png" },
      }),
    ).toThrow("Block type must match config type");
  });

  it("accepts optional position", () => {
    const result = routeBlockSchema.parse({
      position: 3,
      type: "message",
      config: { type: "message", content: "Hello" },
    });
    expect(result.position).toBe(3);
  });

  it("rejects negative position", () => {
    expect(() =>
      routeBlockSchema.parse({
        position: -1,
        type: "message",
        config: { type: "message", content: "Hello" },
      }),
    ).toThrow();
  });

  it("rejects delay_ms over 300000", () => {
    expect(() =>
      routeBlockSchema.parse({
        type: "message",
        config: { type: "message", content: "Hello" },
        delay_ms: 300001,
      }),
    ).toThrow();
  });

  it("accepts delay_ms at boundary 300000", () => {
    const result = routeBlockSchema.parse({
      type: "message",
      config: { type: "message", content: "Hello" },
      delay_ms: 300000,
    });
    expect(result.delay_ms).toBe(300000);
  });

  it("rejects non-integer delay_ms", () => {
    expect(() =>
      routeBlockSchema.parse({
        type: "message",
        config: { type: "message", content: "Hello" },
        delay_ms: 1.5,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// routeGroupSchema
// ---------------------------------------------------------------------------
describe("routeGroupSchema", () => {
  const validBlock = {
    type: "message" as const,
    config: { type: "message" as const, content: "Hello" },
  };

  it("accepts valid group", () => {
    const result = routeGroupSchema.parse({ name: "Start", blocks: [validBlock] });
    expect(result.name).toBe("Start");
    expect(result.blocks).toHaveLength(1);
  });

  it("trims name whitespace", () => {
    const result = routeGroupSchema.parse({ name: "  Start  ", blocks: [validBlock] });
    expect(result.name).toBe("Start");
  });

  it("rejects empty name", () => {
    expect(() => routeGroupSchema.parse({ name: "", blocks: [validBlock] })).toThrow();
  });

  it("rejects whitespace-only name", () => {
    expect(() => routeGroupSchema.parse({ name: "   ", blocks: [validBlock] })).toThrow();
  });

  it("rejects name over 100 characters", () => {
    expect(() => routeGroupSchema.parse({ name: "a".repeat(101), blocks: [validBlock] })).toThrow();
  });

  it("accepts name at exactly 100 characters", () => {
    const result = routeGroupSchema.parse({ name: "a".repeat(100), blocks: [validBlock] });
    expect(result.name).toHaveLength(100);
  });

  it("rejects empty blocks array", () => {
    expect(() => routeGroupSchema.parse({ name: "Start", blocks: [] })).toThrow();
  });

  it("rejects more than 50 blocks", () => {
    const blocks = Array.from({ length: 51 }, () => validBlock);
    expect(() => routeGroupSchema.parse({ name: "Start", blocks })).toThrow();
  });

  it("accepts exactly 50 blocks", () => {
    const blocks = Array.from({ length: 50 }, () => validBlock);
    const result = routeGroupSchema.parse({ name: "Start", blocks });
    expect(result.blocks).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// groupUpdateSchema
// ---------------------------------------------------------------------------
describe("groupUpdateSchema", () => {
  it("accepts valid name", () => {
    const result = groupUpdateSchema.parse({ name: "Updated" });
    expect(result.name).toBe("Updated");
  });

  it("trims name whitespace", () => {
    const result = groupUpdateSchema.parse({ name: "  Updated  " });
    expect(result.name).toBe("Updated");
  });

  it("rejects empty name", () => {
    expect(() => groupUpdateSchema.parse({ name: "" })).toThrow();
  });

  it("rejects whitespace-only name", () => {
    expect(() => groupUpdateSchema.parse({ name: "   " })).toThrow();
  });

  it("rejects name over 100 characters", () => {
    expect(() => groupUpdateSchema.parse({ name: "a".repeat(101) })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// bulkRouteGroupCreateSchema
// ---------------------------------------------------------------------------
describe("bulkRouteGroupCreateSchema", () => {
  const validRoute = {
    name: "Route A",
    city: "Leeds",
    estimated_duration_mins: 60,
    estimated_distance_km: 3,
  };
  const validGroup = {
    name: "Group 1",
    blocks: [{ type: "message" as const, config: { type: "message" as const, content: "Hi" } }],
  };

  it("accepts valid bulk create input", () => {
    const result = bulkRouteGroupCreateSchema.parse({ route: validRoute, groups: [validGroup] });
    expect(result.route.name).toBe("Route A");
    expect(result.groups).toHaveLength(1);
  });

  it("rejects empty groups array", () => {
    expect(() => bulkRouteGroupCreateSchema.parse({ route: validRoute, groups: [] })).toThrow(
      "At least one group is required",
    );
  });

  it("rejects more than 30 groups", () => {
    const groups = Array.from({ length: 31 }, (_, i) => ({ ...validGroup, name: `Group ${i}` }));
    expect(() => bulkRouteGroupCreateSchema.parse({ route: validRoute, groups })).toThrow();
  });

  it("accepts exactly 30 groups", () => {
    const groups = Array.from({ length: 30 }, (_, i) => ({ ...validGroup, name: `Group ${i}` }));
    const result = bulkRouteGroupCreateSchema.parse({ route: validRoute, groups });
    expect(result.groups).toHaveLength(30);
  });

  it("validates nested route schema (refine applies)", () => {
    expect(() =>
      bulkRouteGroupCreateSchema.parse({
        route: { name: "Route", estimated_duration_mins: 60, estimated_distance_km: 3 },
        groups: [validGroup],
      }),
    ).toThrow("Either route_family_id or city must be provided");
  });

  it("rejects missing route", () => {
    expect(() => bulkRouteGroupCreateSchema.parse({ groups: [validGroup] })).toThrow();
  });

  it("rejects missing groups", () => {
    expect(() => bulkRouteGroupCreateSchema.parse({ route: validRoute })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// groupReorderSchema
// ---------------------------------------------------------------------------
describe("groupReorderSchema", () => {
  const validUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("accepts valid group_ids array", () => {
    const result = groupReorderSchema.parse({ group_ids: [validUuid] });
    expect(result.group_ids).toEqual([validUuid]);
  });

  it("accepts multiple uuids", () => {
    const uuid2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
    const result = groupReorderSchema.parse({ group_ids: [validUuid, uuid2] });
    expect(result.group_ids).toHaveLength(2);
  });

  it("rejects empty array", () => {
    expect(() => groupReorderSchema.parse({ group_ids: [] })).toThrow();
  });

  it("rejects invalid uuid in array", () => {
    expect(() => groupReorderSchema.parse({ group_ids: ["not-a-uuid"] })).toThrow();
  });

  it("rejects missing group_ids", () => {
    expect(() => groupReorderSchema.parse({})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// blockReorderSchema
// ---------------------------------------------------------------------------
describe("blockReorderSchema", () => {
  const validUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("accepts valid block_ids array", () => {
    const result = blockReorderSchema.parse({ block_ids: [validUuid] });
    expect(result.block_ids).toEqual([validUuid]);
  });

  it("rejects empty array", () => {
    expect(() => blockReorderSchema.parse({ block_ids: [] })).toThrow();
  });

  it("rejects invalid uuid in array", () => {
    expect(() => blockReorderSchema.parse({ block_ids: ["bad"] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// blockMoveSchema
// ---------------------------------------------------------------------------
describe("blockMoveSchema", () => {
  const validUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("accepts valid move input", () => {
    const result = blockMoveSchema.parse({ target_group_id: validUuid, position: 0 });
    expect(result.target_group_id).toBe(validUuid);
    expect(result.position).toBe(0);
  });

  it("rejects invalid target_group_id", () => {
    expect(() => blockMoveSchema.parse({ target_group_id: "bad", position: 0 })).toThrow();
  });

  it("rejects negative position", () => {
    expect(() => blockMoveSchema.parse({ target_group_id: validUuid, position: -1 })).toThrow();
  });

  it("rejects non-integer position", () => {
    expect(() => blockMoveSchema.parse({ target_group_id: validUuid, position: 1.5 })).toThrow();
  });

  it("rejects missing target_group_id", () => {
    expect(() => blockMoveSchema.parse({ position: 0 })).toThrow();
  });

  it("rejects missing position", () => {
    expect(() => blockMoveSchema.parse({ target_group_id: validUuid })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// messageBankSchema
// ---------------------------------------------------------------------------
describe("messageBankSchema", () => {
  it("accepts valid message bank entry", () => {
    const result = messageBankSchema.parse({ type: "success", content: "Well done!" });
    expect(result.type).toBe("success");
    expect(result.content).toBe("Well done!");
    expect(result.language).toBe("en"); // default
    expect(result.is_active).toBe(true); // default
  });

  it("accepts all valid type values", () => {
    const types = [
      "success",
      "failure",
      "hint-exhausted",
      "hint-offer",
      "hint-decline",
      "clarification",
      "unknown-answer",
      "completion",
      "over-length",
    ] as const;
    for (const t of types) {
      expect(messageBankSchema.parse({ type: t, content: "msg" }).type).toBe(t);
    }
  });

  it("defaults language to 'en'", () => {
    const result = messageBankSchema.parse({ type: "success", content: "Hi" });
    expect(result.language).toBe("en");
  });

  it("defaults is_active to true", () => {
    const result = messageBankSchema.parse({ type: "success", content: "Hi" });
    expect(result.is_active).toBe(true);
  });

  it("accepts custom language and is_active", () => {
    const result = messageBankSchema.parse({
      type: "success",
      content: "Bien fait!",
      language: "fr",
      is_active: false,
    });
    expect(result.language).toBe("fr");
    expect(result.is_active).toBe(false);
  });

  it("trims content whitespace", () => {
    const result = messageBankSchema.parse({ type: "success", content: "  Well done!  " });
    expect(result.content).toBe("Well done!");
  });

  it("rejects empty content", () => {
    expect(() => messageBankSchema.parse({ type: "success", content: "" })).toThrow();
  });

  it("rejects whitespace-only content", () => {
    expect(() => messageBankSchema.parse({ type: "success", content: "   " })).toThrow();
  });

  it("rejects invalid type", () => {
    expect(() => messageBankSchema.parse({ type: "invalid", content: "Hi" })).toThrow();
  });

  it("rejects language shorter than 2 chars", () => {
    expect(() => messageBankSchema.parse({ type: "success", content: "Hi", language: "e" })).toThrow();
  });

  it("rejects language longer than 5 chars", () => {
    expect(() => messageBankSchema.parse({ type: "success", content: "Hi", language: "english" })).toThrow();
  });

  it("trims language whitespace", () => {
    const result = messageBankSchema.parse({ type: "success", content: "Hi", language: "  fr  " });
    expect(result.language).toBe("fr");
  });

  it("rejects missing type", () => {
    expect(() => messageBankSchema.parse({ content: "Hi" })).toThrow();
  });

  it("rejects missing content", () => {
    expect(() => messageBankSchema.parse({ type: "success" })).toThrow();
  });
});
