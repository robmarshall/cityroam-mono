import { z } from "zod";
import { MAX_BLOCK_DELAY_MS } from "../constants/index.js";

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
  image_url: z.string().url("Invalid image URL").nullable().optional().default(null),
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

/** Server-side schema for POST /admin/upload request body */
export const imageUploadRequestSchema = z.object({
  filename: z.string().trim().min(1, "Filename is required"),
  content_type: z.string().refine(
    (val) => ALLOWED_IMAGE_TYPES.includes(val),
    "Only JPEG and PNG images are allowed"
  ),
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
  image_url: z.string().url(),
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
  ]),
  language: z.string().trim().min(2).max(5).optional().default("en"),
  content: z.string().trim().min(1, "Content is required"),
  is_active: z.boolean().optional().default(true),
});
