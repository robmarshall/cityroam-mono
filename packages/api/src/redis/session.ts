import { SESSION_TOKEN_EXPIRY_HOURS } from "@cityroam/shared/constants";
import { redis } from "./client.js";

export interface SessionData {
  participant_id: string;
  event_id: string;
  event_code: string;
}

const SESSION_TTL_SECONDS = SESSION_TOKEN_EXPIRY_HOURS * 60 * 60;

function sessionKey(token: string): string {
  return `session:${token}`;
}

export async function setSession(
  token: string,
  data: SessionData,
): Promise<void> {
  await redis.setex(sessionKey(token), SESSION_TTL_SECONDS, JSON.stringify(data));
}

export async function getSession(
  token: string,
): Promise<SessionData | null> {
  const raw = await redis.get(sessionKey(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function deleteSession(token: string): Promise<void> {
  await redis.del(sessionKey(token));
}
