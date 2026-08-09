import { z } from "zod";
import {
  MIN_DISPLAY_NAME_LENGTH,
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
  .min(MIN_DISPLAY_NAME_LENGTH, "DISPLAY_NAME_TOO_SHORT")
  .max(MAX_DISPLAY_NAME_LENGTH, "DISPLAY_NAME_TOO_LONG")
  .refine((val) => !HTML_TAG_REGEX.test(val), "DISPLAY_NAME_HTML")
  .refine(
    (val) => DISPLAY_NAME_CHARS_REGEX.test(val),
    "DISPLAY_NAME_INVALID_CHARS"
  );

export const chatMessageSchema = z
  .string()
  .trim()
  .min(MIN_MESSAGE_LENGTH, "MESSAGE_TOO_SHORT")
  .max(MAX_MESSAGE_LENGTH, "MESSAGE_TOO_LONG")
  .refine((val) => val.trim().length > 0, "MESSAGE_EMPTY");

const eventCodeRegex = new RegExp(`^[${EVENT_CODE_ALPHABET}]{6,${EVENT_CODE_LENGTH}}$`);

export const eventCodeSchema = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().regex(eventCodeRegex, "EVENT_CODE_INVALID"));
