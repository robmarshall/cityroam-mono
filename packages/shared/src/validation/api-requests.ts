import { z } from "zod";
import { displayNameSchema } from "./user-input.js";

export const joinEventRequestSchema = z.object({
  display_name: displayNameSchema,
});

export const startEventRequestSchema = z.object({
  token: z.string().min(1, "Participant token is required"),
});

export const changeNameRequestSchema = z.object({
  name: displayNameSchema,
});
