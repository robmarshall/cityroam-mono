import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { SESSION_TOKEN_EXPIRY_HOURS } from "@cityroam/shared/constants";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { events, participants } from "../db/schema/index.js";
import { getSession, setSession } from "../redis/session.js";
import { AppError } from "./error-handler.js";

export const COOKIE_NAME = "cityroam_session";

const COOKIE_MAX_AGE = SESSION_TOKEN_EXPIRY_HOURS * 60 * 60;

export interface SessionContext {
  participant_id: string;
  event_id: string;
  event_code: string;
  display_name: string;
  is_lead: boolean;
}

/**
 * Sets the session cookie on the response.
 */
export function setSessionCookie(c: any, token: string): void {
  const isDev = env.NODE_ENV === "development";
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isDev,
    sameSite: isDev ? "Lax" : "None",
    domain: isDev ? undefined : env.COOKIE_DOMAIN,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Clears the session cookie from the response.
 */
export function clearSessionCookie(c: any): void {
  const isDev = env.NODE_ENV === "development";
  deleteCookie(c, COOKIE_NAME, {
    httpOnly: true,
    secure: !isDev,
    sameSite: isDev ? "Lax" : "None",
    domain: isDev ? undefined : env.COOKIE_DOMAIN,
    path: "/",
  });
}

/**
 * Reads session token from cookie and resolves participant context.
 * Returns null if no valid session found (does not throw).
 */
export async function resolveSession(c: any): Promise<SessionContext | null> {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return null;

  // Redis fast path
  const session = await getSession(token);
  if (session) {
    return {
      participant_id: session.participant_id,
      event_id: session.event_id,
      event_code: session.event_code,
      display_name: session.display_name,
      is_lead: session.is_lead,
    };
  }

  // DB fallback — look up participant by token
  const participant = await db.query.participants.findFirst({
    where: eq(participants.token, token),
    columns: {
      id: true,
      event_id: true,
      display_name: true,
      is_lead: true,
      is_active: true,
    },
  });

  if (!participant || !participant.is_active) return null;

  // Get event code for the session
  const event = await db.query.events.findFirst({
    where: eq(events.id, participant.event_id),
    columns: { code: true },
  });

  const eventCode = event?.code ?? "";

  // Re-populate Redis session store
  await setSession(token, {
    participant_id: participant.id,
    event_id: participant.event_id,
    event_code: eventCode,
    display_name: participant.display_name,
    is_lead: participant.is_lead,
  });

  return {
    participant_id: participant.id,
    event_id: participant.event_id,
    event_code: eventCode,
    display_name: participant.display_name,
    is_lead: participant.is_lead,
  };
}

/**
 * Auth middleware — requires a valid session.
 * Attaches session context to c.set("session", ...).
 * Returns 401 if no valid session found.
 */
export const sessionAuth: MiddlewareHandler = async (c, next) => {
  const session = await resolveSession(c);
  if (!session) {
    throw new AppError(401, "Authentication required", "UNAUTHORIZED");
  }
  c.set("session" as any, session);
  await next();
};
