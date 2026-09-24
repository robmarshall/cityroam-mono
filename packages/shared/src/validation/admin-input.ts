import { z } from "zod";
import {
  MAX_BLOCK_DELAY_MS,
  ADMIN_API_KEY_SCOPES,
  ADMIN_API_KEY_UNGRANTABLE_SCOPES,
  ADMIN_API_KEY_EXPIRY_DAYS,
  SUPPORTED_LANGUAGES,
} from "../constants/index.js";
import {
  isValidRouteImageRef,
  IMAGE_SLUG_PATTERN,
  IMAGE_SLUG_MAX_LENGTH,
} from "../utils/index.js";

/**
 * A route image reference: an absolute http(s) URL (typically the CDN URL that
 * POST /admin/upload returns) or a `{{IMAGE:slug}}` placeholder with a lowercase
 * kebab-case slug, which resolves at runtime to `<cdn>/route-images/<slug>.jpg`.
 */
export const routeImageRefSchema = z
  .string()
  .trim()
  .refine(isValidRouteImageRef, {
    message:
      "Image must be an http(s) URL or a placeholder like {{IMAGE:leeds-town-hall-facade}} (lowercase letters, digits and hyphens)",
  });

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const routeSchema = z.object({
  name: z.string().trim().min(1, "Route name is required"),
  description: z.string().trim().optional(),
  language: z.string().trim().min(2).max(5).optional().default("en"),
  route_family_id: z.preprocess((val) => (val === "" ? undefined : val), z.string().uuid().optional()),
  city: z.string().trim().min(1).optional(), // Used to auto-create a route family when route_family_id is not provided
  estimated_duration_mins: z.number().positive("Duration must be greater than 0").max(1440, "Duration cannot exceed 24 hours"),
  estimated_distance_km: z.number().positive("Distance must be greater than 0").max(100, "Distance cannot exceed 100 km"),
  is_active: z.boolean().optional().default(true),
}).refine(
  (data) => data.route_family_id || data.city,
  { message: "Either route_family_id or city must be provided", path: ["route_family_id"] },
);

export const sequenceItemSchema = z.object({
  content: z.string().default(""),
  image_url: routeImageRefSchema.nullable().optional().default(null),
  delay_ms: z.number().int().min(0).max(10000).default(0),
});

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const imageUploadSchema = z.object({
  type: z.string().refine(
    (val) => ALLOWED_IMAGE_TYPES.includes(val),
    "Only JPEG and PNG images are allowed"
  ),
  size: z.number().max(MAX_IMAGE_SIZE_BYTES, "Image must be at most 5MB"),
  filename: z.string().trim().min(1, "Filename is required"),
});

/**
 * A route image slug — the `slug` in `{{IMAGE:slug}}`. Lowercase kebab-case,
 * at most IMAGE_SLUG_MAX_LENGTH characters.
 */
export const routeImageSlugSchema = z
  .string()
  .trim()
  .max(IMAGE_SLUG_MAX_LENGTH, `Slug must be at most ${IMAGE_SLUG_MAX_LENGTH} characters`)
  .regex(
    IMAGE_SLUG_PATTERN,
    "Slug must be lowercase letters, digits and single hyphens (e.g. leeds-town-hall-facade)",
  );

/**
 * Server-side schema for POST /admin/upload request body.
 *
 * With `slug`, the upload targets the fixed key `route-images/<slug>.jpg` that
 * `{{IMAGE:slug}}` resolves to, so the content type must be JPEG. Without it,
 * the upload is a one-off at `uploads/<timestamp>_<filename>`.
 */
export const imageUploadRequestSchema = z
  .object({
    filename: z.string().trim().min(1, "Filename is required"),
    content_type: z.string().refine(
      (val) => ALLOWED_IMAGE_TYPES.includes(val),
      "Only JPEG and PNG images are allowed"
    ),
    slug: routeImageSlugSchema.optional(),
  })
  .refine((data) => data.slug === undefined || data.content_type === "image/jpeg", {
    message: "Slug photos must be JPEG (they are stored as <slug>.jpg)",
    path: ["content_type"],
  });

export const adminUpdateEventStatusSchema = z.object({
  status: z.enum(["NOT_STARTED", "WAITING", "IN_PROGRESS", "COMPLETED", "EXPIRED", "REFUNDED"]).optional(),
  refund_requested: z.boolean().optional(),
  refund_note: z.string().max(2000, "Refund note must be at most 2000 characters").optional(),
}).refine(
  (data) => data.status !== undefined || data.refund_requested !== undefined || data.refund_note !== undefined,
  { message: "At least one field must be provided" },
);

export const adminCreateEventSchema = z.object({
  route_id: z.string().uuid("Valid route ID is required"),
  buyer_email: z.string().email("Invalid email").optional(),
  expires_in_days: z.number().int().min(1).max(365).optional(),
});

// --- Block & Group schemas ---

export const messageBlockConfigSchema = z.object({
  type: z.literal("message"),
  content: z.string().trim().min(1),
});

export const imageBlockConfigSchema = z.object({
  type: z.literal("image"),
  image_url: routeImageRefSchema,
});

export const questionBlockConfigSchema = z.object({
  type: z.literal("question"),
  clue: z.string().trim().min(1),
  accepted_answers: z.array(z.string().trim().min(1)).min(1),
  hints: z.array(z.array(sequenceItemSchema)).min(2).max(3),
});

export const actionBlockConfigSchema = z.object({
  type: z.literal("action"),
  label: z.string().trim().min(1),
});

export const mapBlockConfigSchema = z.object({
  type: z.literal("map"),
  google_maps_link: z.string().url(),
});

export const blockConfigSchema = z.discriminatedUnion("type", [
  messageBlockConfigSchema,
  imageBlockConfigSchema,
  questionBlockConfigSchema,
  actionBlockConfigSchema,
  mapBlockConfigSchema,
]);

export const routeBlockSchema = z.object({
  position: z.number().int().min(0).optional(),
  type: z.enum(["message", "image", "question", "action", "map"]),
  config: blockConfigSchema,
  delay_ms: z.number().int().min(0).max(MAX_BLOCK_DELAY_MS).default(0),
}).refine((data) => data.type === data.config.type, {
  message: "Block type must match config type",
  path: ["type"],
});

export const routeGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  blocks: z.array(routeBlockSchema).min(1).max(50),
});

export const groupUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

/**
 * Body of POST /admin/routes/:id/groups. `name` alone appends an empty group
 * (the original contract). `blocks` creates the group's blocks in the same
 * transaction, with the same per-group limit as bulk create; `position`
 * inserts the group at that index and shifts later groups up (clamped to the
 * end, so it can never leave a gap).
 */
export const groupCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  blocks: z.array(routeBlockSchema).max(50, "Maximum 50 blocks per group").optional(),
  position: z.number().int().min(0).optional(),
});

export const bulkRouteGroupCreateSchema = z.object({
  route: routeSchema,
  groups: z.array(routeGroupSchema).min(1, "At least one group is required").max(30, "Maximum 30 groups per route"),
});

export const groupReorderSchema = z.object({
  group_ids: z.array(z.string().uuid()).min(1),
});

export const blockReorderSchema = z.object({
  block_ids: z.array(z.string().uuid()).min(1),
});

export const blockMoveSchema = z.object({
  target_group_id: z.string().uuid("Valid group ID is required"),
  position: z.number().int().min(0),
});

export const messageBankSchema = z.object({
  type: z.enum([
    "success",
    "failure",
    "hint-exhausted",
    "hint-offer",
    "hint-decline",
    "clarification",
    "unknown-answer",
    "completion",
    "over-length",
    "guide-degraded",
    "guide-busy",
    "guide-identity-ai",
    "guide-identity-machine",
    "guide-identity-person",
    "guide-identity-who",
    "early-answer",
  ]),
  language: z.string().trim().min(2).max(5).optional().default("en"),
  content: z.string().trim().min(1, "Content is required"),
  is_active: z.boolean().optional().default(true),
});

/**
 * Query of GET /admin/message-banks. `type` stays free-form (an unknown type
 * simply matches nothing, as before); `language` must be one of the languages
 * the app supports, so a typo fails loudly instead of returning an empty list.
 */
export const messageBankListQuerySchema = z.object({
  type: z.string().trim().min(1).optional(),
  language: z
    .string()
    .trim()
    .refine((val) => (SUPPORTED_LANGUAGES as readonly string[]).includes(val), {
      message: `Language must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`,
    })
    .optional(),
});

// --- Admin API keys ---

/**
 * Body of the (session-only) key-creation endpoint. `routes:publish` is
 * refused: activating a route so it can be sold is a human-only action, so no
 * key may ever carry it.
 */
export const adminApiKeyCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  scopes: z
    .array(z.enum(ADMIN_API_KEY_SCOPES))
    .min(1, "At least one scope is required")
    .refine((scopes) => new Set(scopes).size === scopes.length, "Scopes must not repeat")
    .refine(
      (scopes) => !scopes.some((s) => ADMIN_API_KEY_UNGRANTABLE_SCOPES.includes(s)),
      "routes:publish cannot be granted to an API key: activating a route is human-only",
    ),
  expires_in_days: z
    .union([
      z.literal(ADMIN_API_KEY_EXPIRY_DAYS[0]),
      z.literal(ADMIN_API_KEY_EXPIRY_DAYS[1]),
      z.literal(ADMIN_API_KEY_EXPIRY_DAYS[2]),
      z.null(),
    ])
    .optional(),
});
