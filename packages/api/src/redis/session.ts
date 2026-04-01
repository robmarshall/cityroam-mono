import { SESSION_TOKEN_EXPIRY_HOURS } from "@cityroam/shared/constants";
import { eq } from "drizzle-orm";
import { redis } from "./client.js";
import { db } from "../db/index.js";
import { participants } from "../db/schema/index.js";

export interface SessionData {
  participant_id: string;
  event_id: string;
  event_code: string;
  display_name: string;
  is_lead: boolean;
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

export async function deleteSessionsByEventId(eventId: string): Promise<void> {
  const rows = await db.query.participants.findMany({
    where: eq(participants.event_id, eventId),
    columns: { token: true },
  });

  const keys = rows
    .map((r) => r.token)
    .filter(Boolean)
    .map((token) => sessionKey(token));

  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
