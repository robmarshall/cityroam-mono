import { z } from "zod";

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const routeSchema = z.object({
  city: z.string().trim().min(1, "City is required"),
  name: z.string().trim().min(1, "Route name is required"),
  description: z.string().trim().optional(),
  estimated_duration_mins: z.number().positive("Duration must be greater than 0"),
  estimated_distance_km: z.number().positive("Distance must be greater than 0"),
  is_active: z.boolean().optional().default(true),
});

export const stopSchema = z.object({
  name: z.string().trim().min(1, "Stop name is required"),
  directions_from_previous: z.string().trim().optional(),
  clue: z.string().trim().min(1, "Clue is required"),
  accepted_answers: z
    .array(z.string().trim().min(1))
    .min(1, "At least one accepted answer is required"),
  hints: z
    .array(z.string().trim().min(1))
    .min(2, "At least 2 hints are required")
    .max(3, "At most 3 hints are allowed"),
  correct_response: z.string().trim().optional(),
  fun_fact: z.string().trim().optional(),
  images: z.array(z.string()).optional().default([]),
  google_maps_link: z.string().url("Invalid Google Maps URL").optional().or(z.literal("")),
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
  status: z.enum(["NOT_STARTED", "WAITING", "IN_PROGRESS", "COMPLETED", "EXPIRED"]),
});

export const stopReorderSchema = z.object({
  stop_ids: z.array(z.string().uuid()).min(1, "At least one stop ID is required"),
});
