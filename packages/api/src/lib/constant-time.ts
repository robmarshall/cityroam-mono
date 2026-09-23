import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Length-independent equality. Hashing first gives timingSafeEqual the
 * equal-length buffers it requires, so the comparison leaks neither the
 * secret's content nor its length.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}
