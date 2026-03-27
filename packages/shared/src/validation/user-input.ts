import { z } from "zod";
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
  EVENT_CODE_LENGTH,
  EVENT_CODE_ALPHABET,
} from "../constants/index.js";

const HTML_TAG_REGEX = /<[^>]*>/;
const DISPLAY_NAME_CHARS_REGEX = /^[a-zA-Z0-9 '\-]+$/;

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required")
  .max(MAX_DISPLAY_NAME_LENGTH, `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`)
  .refine((val) => !HTML_TAG_REGEX.test(val), "Display name must not contain HTML tags")
  .refine(
    (val) => DISPLAY_NAME_CHARS_REGEX.test(val),
    "Display name may only contain letters, numbers, spaces, hyphens, and apostrophes"
  );

export const chatMessageSchema = z
  .string()
  .trim()
  .min(MIN_MESSAGE_LENGTH, `Message must be at least ${MIN_MESSAGE_LENGTH} characters`)
  .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`)
  .refine((val) => val.trim().length > 0, "Message must not be empty");

const eventCodeRegex = new RegExp(`^[${EVENT_CODE_ALPHABET}]{6,${EVENT_CODE_LENGTH}}$`);

export const eventCodeSchema = z
  .string()
  .regex(eventCodeRegex, "Invalid event code format");
