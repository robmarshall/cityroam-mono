import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { eq, and, asc, gt, ne, sql } from "drizzle-orm";
import type {
  EventDetailResponse,
  JoinEventResponse,
  MessageHistoryResponse,
  ChatMessagePayload,
  SupportedLanguage,
  ActionBlockConfig,
} from "@cityroam/shared/types";
import {
  joinEventRequestSchema,
  eventCodeSchema,
  changeNameRequestSchema,
} from "@cityroam/shared/validation";
import { MAX_PARTICIPANTS, TERMINAL_STATUSES, SUPPORTED_LANGUAGES } from "@cityroam/shared/constants";
import { db } from "../db/index.js";
import {
  events,
  participants,
  messages,
  routes,
  routeGroups,
  routeBlocks,
} from "../db/schema/index.js";
import {
  setSession,
  getSession,
  deleteSession,
  deleteSessionsByEventId,
  getMessages,
  getMessagesSince,
  checkJoinRateLimit,
  checkNameChangeRateLimit,
  publishControl,
} from "../redis/index.js";
import { runGroup } from "../services/group-runner.js";
import { ensureActiveLead } from "../services/lead.js";
import { createLogger } from "../lib/logger.js";
import {
  sessionAuth,
  resolveSession,
  setSessionCookie,
  clearSessionCookie,
  COOKIE_NAME,
  AppError,
} from "../middleware/index.js";
import type { SessionContext } from "../middleware/index.js";
import { publicImageUrl } from "../lib/image-url.js";

const log = createLogger("events");

export const eventRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /event/:code
// ---------------------------------------------------------------------------
eventRoutes.get("/event/:code", async (c) => {
  const code = eventCodeSchema.parse(c.req.param("code"));

  const event = await db.query.events.findFirst({
    where: eq(events.code, code),
  });

  if (!event) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  // Lazy expiry
  if (
    event.expires_at &&
    new Date(event.expires_at) < new Date() &&
    !TERMINAL_STATUSES.has(event.status)
  ) {
    await db
      .update(events)
      .set({ status: "EXPIRED" })
      .where(eq(events.id, event.id));
    event.status = "EXPIRED";
    try {
      await deleteSessionsByEventId(event.id);
    } catch (err) {
      // Sessions TTL naturally — don't block the request on Redis failure
    }
  }

  // Optional session resolution
  const token = getCookie(c, COOKIE_NAME);
  const session = await resolveSession(c);

  // Build participant list
  const participantRows = await db
    .select({
      id: participants.id,
      display_name: participants.display_name,
      is_lead: participants.is_lead,
      is_active: participants.is_active,
    })
    .from(participants)
    .where(eq(participants.event_id, event.id));

  // Only report a current participant while they are still active — a swept
  // player must see the join form rather than be redirected into a session
  // the WS server will reject.
  let currentParticipant: EventDetailResponse["current_participant"] = null;
  if (session && session.event_code === code && token) {
    const row = participantRows.find((p) => p.id === session.participant_id);
    if (row?.is_active) {
      currentParticipant = {
        id: row.id,
        display_name: row.display_name,
        is_lead: row.is_lead,
        token,
      };
    }
  }

  const leadParticipant = participantRows.find((p) => p.is_lead && p.is_active);

  const isTerminal = TERMINAL_STATUSES.has(event.status);

  // Find available language variants for this route family
  const familyRoutes = await db
    .select({ language: routes.language })
    .from(routes)
    .where(and(eq(routes.route_family_id, event.route_family_id), eq(routes.is_active, true)));
  const availableLanguages = familyRoutes.map((r) => r.language) as SupportedLanguage[];

  // Surface an outstanding action block. action_waiting is only broadcast
  // once, so a client that reloaded or reconnected late would otherwise never
  // learn the hunt is waiting on the lead to confirm.
  let pendingAction: EventDetailResponse["pending_action"] = null;
  if (!isTerminal && event.current_block_id) {
    const currentBlock = await db.query.routeBlocks.findFirst({
      where: eq(routeBlocks.id, event.current_block_id),
      columns: { id: true, type: true, config: true },
    });

    if (currentBlock?.type === "action") {
      const config = currentBlock.config as ActionBlockConfig;
      pendingAction = { block_id: currentBlock.id, label: config.label };
    }
  }

  const response: EventDetailResponse = {
    event: {
      code: event.code,
      status: event.status as EventDetailResponse["event"]["status"],
      current_stop: event.current_stop,
      started_at: event.started_at ? new Date(event.started_at).toISOString() : null,
      created_at: new Date(event.created_at).toISOString(),
      language: event.language as EventDetailResponse["event"]["language"],
    },
    participants: isTerminal ? [] : participantRows,
    lead_name: isTerminal ? null : (leadParticipant?.display_name ?? null),
    current_participant: isTerminal ? null : currentParticipant,
    pending_action: pendingAction,
    available_languages: availableLanguages,
  };

  return c.json(response, 200);
});

// ---------------------------------------------------------------------------
// POST /event/:code/join
// ---------------------------------------------------------------------------
eventRoutes.post("/event/:code/join", async (c) => {
  const code = eventCodeSchema.parse(c.req.param("code"));
  const body = await c.req.json();
  const { display_name } = joinEventRequestSchema.parse(body);

  // Rate limit check
  const rateLimit = await checkJoinRateLimit(code);
  if (!rateLimit.allowed) {
    throw new AppError(429, "Too many join attempts", "RATE_LIMITED");
  }

  // An existing cookie lets a swept/departed player reclaim their identity
  const existingToken = getCookie(c, COOKIE_NAME);

  // Transaction for atomic participant creation + lead election
  const { newParticipant, eventData, isLead } = await db.transaction(async (tx) => {
    // Lock the event row to serialize concurrent joins
    await tx.execute(sql`SELECT 1 FROM events WHERE code = ${code} FOR UPDATE`);

    const lockedEvent = await tx.query.events.findFirst({
      where: eq(events.code, code),
    });

    if (!lockedEvent) {
      throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
    }

    if (TERMINAL_STATUSES.has(lockedEvent.status)) {
      const labels: Record<string, string> = {
        EXPIRED: "Event has expired",
        COMPLETED: "Event is completed",
        REFUNDED: "Event has been refunded",
      };
      throw new AppError(
        410,
        labels[lockedEvent.status] ?? "Event is no longer active",
        `EVENT_${lockedEvent.status}`,
      );
    }

    // Count active participants
    const [countResult] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(participants)
      .where(
        and(eq(participants.event_id, lockedEvent.id), eq(participants.is_active, true))
      );

    if (countResult.count >= MAX_PARTICIPANTS) {
      throw new AppError(403, "Event is full", "EVENT_FULL");
    }

    // The lead is whoever is currently active and flagged — an event whose
    // lead has left or timed out has none, so the next joiner takes it
    const activeLead = await tx.query.participants.findFirst({
      where: and(
        eq(participants.event_id, lockedEvent.id),
        eq(participants.is_active, true),
        eq(participants.is_lead, true),
      ),
      columns: { id: true },
    });

    const takesLead = !activeLead;

    // A returning player who still holds their cookie reclaims their
    // participant row instead of creating a duplicate
    const returning = existingToken
      ? await tx.query.participants.findFirst({
          where: and(
            eq(participants.token, existingToken),
            eq(participants.event_id, lockedEvent.id),
            eq(participants.is_active, false),
          ),
        })
      : undefined;

    if (returning) {
      const [reactivated] = await tx
        .update(participants)
        .set({
          display_name,
          is_active: true,
          is_lead: takesLead,
          last_seen_at: new Date(),
          left_at: null,
          left_reason: null,
        })
        .where(eq(participants.id, returning.id))
        .returning();

      if (takesLead) {
        await tx
          .update(events)
          .set({ lead_participant_id: reactivated.id })
          .where(eq(events.id, lockedEvent.id));
      }

      return { newParticipant: reactivated, eventData: lockedEvent, isLead: takesLead };
    }

    const joinToken = crypto.randomUUID();

    // Insert participant
    const [created] = await tx
      .insert(participants)
      .values({
        event_id: lockedEvent.id,
        display_name,
        token: joinToken,
        is_lead: takesLead,
      })
      .returning();

    // If lead, update event
    if (takesLead) {
      await tx
        .update(events)
        .set({
          lead_participant_id: created.id,
          status: lockedEvent.status === "NOT_STARTED" ? "WAITING" : lockedEvent.status,
        })
        .where(eq(events.id, lockedEvent.id));
    }

    return { newParticipant: created, eventData: lockedEvent, isLead: takesLead };
  });

  const token = newParticipant.token;

  // Claiming the lead only promotes a fresh event out of NOT_STARTED; an
  // event mid-hunt keeps the status it already had
  const resultingStatus =
    isLead && eventData.status === "NOT_STARTED" ? "WAITING" : eventData.status;

  // Store session in Redis
  await setSession(token, {
    participant_id: newParticipant.id,
    event_id: eventData.id,
    event_code: code,
    display_name: newParticipant.display_name,
    is_lead: newParticipant.is_lead,
  });

  // Set session cookie
  setSessionCookie(c, token);

  // Get existing messages
  const cachedMessages = await getMessages(code);

  // Get participant list
  const participantRows = await db
    .select({
      id: participants.id,
      display_name: participants.display_name,
      is_lead: participants.is_lead,
      is_active: participants.is_active,
    })
    .from(participants)
    .where(eq(participants.event_id, eventData.id));

  const participantCount = participantRows.filter((p) => p.is_active).length;

  // Publish control event
  await publishControl(code, {
    type: "participant_joined",
    data: {
      participant_id: newParticipant.id,
      name: display_name,
      participant_count: participantCount,
    },
  });

  // Find available language variants for this route family
  const joinFamilyRoutes = await db
    .select({ language: routes.language })
    .from(routes)
    .where(and(eq(routes.route_family_id, eventData.route_family_id), eq(routes.is_active, true)));
  const joinAvailableLanguages = joinFamilyRoutes.map((r) => r.language) as SupportedLanguage[];

  const response: JoinEventResponse = {
    participant: {
      id: newParticipant.id,
      display_name: newParticipant.display_name,
      is_lead: newParticipant.is_lead,
    },
    token,
    event: {
      code,
      status: resultingStatus as JoinEventResponse["event"]["status"],
      current_stop: eventData.current_stop,
      language: eventData.language as JoinEventResponse["event"]["language"],
    },
    messages: cachedMessages,
    participants: participantRows,
    available_languages: joinAvailableLanguages,
  };

  return c.json(response, 201);
});

// ---------------------------------------------------------------------------
// POST /event/:code/start (requires sessionAuth)
// ---------------------------------------------------------------------------
eventRoutes.post("/event/:code/start", sessionAuth, async (c) => {
  const code = eventCodeSchema.parse(c.req.param("code"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (c as any).get("session") as SessionContext;

  if (session.event_code !== code || !session.is_lead) {
    throw new AppError(
      403,
      "Only the lead can start the game",
      "UNAUTHORIZED"
    );
  }

  // Transaction for atomic status check + start
  const { event, firstGroup } = await db.transaction(async (tx) => {
    // Lock the event row to prevent concurrent starts
    await tx.execute(sql`SELECT 1 FROM events WHERE code = ${code} FOR UPDATE`);

    const lockedEvent = await tx.query.events.findFirst({
      where: eq(events.code, code),
    });

    if (!lockedEvent || lockedEvent.status !== "WAITING") {
      throw new AppError(400, "Event cannot be started", "INVALID_INPUT");
    }

    // Load the first group for the route
    const group = await tx
      .select()
      .from(routeGroups)
      .where(eq(routeGroups.route_id, lockedEvent.route_id))
      .orderBy(asc(routeGroups.position))
      .limit(1)
      .then((rows) => rows[0]);

    if (!group) {
      throw new AppError(500, "Route has no groups", "INTERNAL_ERROR");
    }

    // Update event to IN_PROGRESS with first group
    const now = new Date();
    await tx
      .update(events)
      .set({
        status: "IN_PROGRESS",
        started_at: now,
        current_stop: 1,
        current_group_id: group.id,
        current_block_id: null,
        current_block_index: 0,
      })
      .where(eq(events.id, lockedEvent.id));

    return { event: lockedEvent, firstGroup: group };
  });

  // Publish game started control event
  await publishControl(code, {
    type: "game_started",
    data: { started_by: session.display_name },
  });

  // Run the first group asynchronously (don't block the HTTP response)
  runGroup(event.id, code, firstGroup.id).catch((err) => {
    log.error("runGroup failed after game start", {
      eventCode: code,
      eventId: event.id,
      groupId: firstGroup.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return c.json({ success: true }, 200);
});

// ---------------------------------------------------------------------------
// POST /event/:code/leave (requires sessionAuth)
// ---------------------------------------------------------------------------
eventRoutes.post("/event/:code/leave", sessionAuth, async (c) => {
  const code = eventCodeSchema.parse(c.req.param("code"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (c as any).get("session") as SessionContext;

  if (session.event_code !== code) {
    throw new AppError(403, "Session does not match event", "UNAUTHORIZED");
  }

  // Look up event once
  const event = await db.query.events.findFirst({
    where: eq(events.code, code),
  });

  if (!event) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  if (TERMINAL_STATUSES.has(event.status)) {
    throw new AppError(410, "Event has ended", "EVENT_COMPLETED");
  }

  // Update participant to inactive. is_lead is cleared too so that
  // "active lead" is the only meaning is_lead ever carries.
  await db
    .update(participants)
    .set({
      is_active: false,
      is_lead: false,
      left_at: new Date(),
      left_reason: "voluntary",
    })
    .where(eq(participants.id, session.participant_id));

  // Promote a replacement lead if this leaver was the lead — in any
  // non-terminal status, not just WAITING
  await ensureActiveLead(event.id, code);

  // Delete Redis session using cookie token
  const token = getCookie(c, COOKIE_NAME);
  if (token) {
    await deleteSession(token);
  }

  // Clear cookie
  clearSessionCookie(c);

  // Count remaining active participants
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participants)
    .where(
      and(
        eq(participants.event_id, event.id),
        eq(participants.is_active, true)
      )
    );
  const participantCount = countResult.count;

  // Publish control event
  await publishControl(code, {
    type: "participant_left",
    data: {
      participant_id: session.participant_id,
      name: session.display_name,
      participant_count: participantCount,
      reason: "voluntary",
    },
  });

  return c.json({ success: true }, 200);
});

// ---------------------------------------------------------------------------
// POST /event/:code/name (requires sessionAuth)
// ---------------------------------------------------------------------------
eventRoutes.post("/event/:code/name", sessionAuth, async (c) => {
  const code = eventCodeSchema.parse(c.req.param("code"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (c as any).get("session") as SessionContext;

  if (session.event_code !== code) {
    throw new AppError(403, "Session does not match event", "UNAUTHORIZED");
  }

  const event = await db.query.events.findFirst({
    where: eq(events.code, code),
    columns: { status: true },
  });

  if (!event) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  if (TERMINAL_STATUSES.has(event.status)) {
    throw new AppError(410, "Event has ended", "EVENT_COMPLETED");
  }

  const body = await c.req.json();
  const { name } = changeNameRequestSchema.parse(body);

  // Don't allow changing to the same name
  if (name === session.display_name) {
    return c.json({ success: true, display_name: name }, 200);
  }

  // Rate limit: 3 name changes per event per participant
  const rateLimit = await checkNameChangeRateLimit(code, session.participant_id);
  if (!rateLimit.allowed) {
    throw new AppError(429, "Too many name changes", "RATE_LIMITED");
  }

  const oldName = session.display_name;

  // Update display_name in DB
  await db
    .update(participants)
    .set({ display_name: name })
    .where(eq(participants.id, session.participant_id));

  // Update Redis session data
  const token = getCookie(c, COOKIE_NAME);
  if (token) {
    await setSession(token, {
      ...session,
      display_name: name,
    });
  }

  // Publish name_changed control event
  await publishControl(code, {
    type: "name_changed",
    data: {
      participant_id: session.participant_id,
      old_name: oldName,
      new_name: name,
    },
  });

  return c.json({ success: true, display_name: name }, 200);
});

// ---------------------------------------------------------------------------
// PUT /event/:code/language (requires sessionAuth)
// ---------------------------------------------------------------------------
eventRoutes.put("/event/:code/language", sessionAuth, async (c) => {
  const code = eventCodeSchema.parse(c.req.param("code"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (c as any).get("session") as SessionContext;

  if (session.event_code !== code || !session.is_lead) {
    throw new AppError(
      403,
      "Only the lead can change the language",
      "UNAUTHORIZED"
    );
  }

  const body = await c.req.json();
  const { language } = body as { language: string };

  if (!language || !SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
    throw new AppError(400, "Unsupported language", "INVALID_INPUT");
  }

  const event = await db.query.events.findFirst({
    where: eq(events.code, code),
  });

  if (!event) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  if (event.status !== "NOT_STARTED" && event.status !== "WAITING") {
    throw new AppError(400, "Language cannot be changed after the game has started", "INVALID_INPUT");
  }

  // Find the route variant for the requested language in this family
  const variant = await db.query.routes.findFirst({
    where: and(
      eq(routes.route_family_id, event.route_family_id),
      eq(routes.language, language),
      eq(routes.is_active, true),
    ),
  });

  if (!variant) {
    throw new AppError(404, "No route available in this language", "ROUTE_NOT_FOUND");
  }

  // Update event with new language and route
  await db
    .update(events)
    .set({
      language: language,
      route_id: variant.id,
    })
    .where(eq(events.id, event.id));

  // Publish control event so all connected clients update
  await publishControl(code, {
    type: "language_changed",
    data: { language },
  });

  return c.json({ success: true, language, route_id: variant.id }, 200);
});

// ---------------------------------------------------------------------------
// GET /event/:code/messages
// ---------------------------------------------------------------------------
eventRoutes.get("/event/:code/messages", async (c) => {
  const code = eventCodeSchema.parse(c.req.param("code"));

  const event = await db.query.events.findFirst({
    where: eq(events.code, code),
  });

  if (!event) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  if (TERMINAL_STATUSES.has(event.status)) {
    throw new AppError(410, "Event has ended", "EVENT_COMPLETED");
  }

  const since = c.req.query("since");
  let messageList: ChatMessagePayload[];

  if (since) {
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      throw new AppError(400, "Invalid 'since' date format", "INVALID_INPUT");
    }

    // Try Redis first
    messageList = await getMessagesSince(code, since);

    // Fall back to DB if empty
    if (messageList.length === 0) {
      const dbMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.event_id, event.id),
            gt(messages.created_at, new Date(since)),
            ne(messages.sender_type, "dropped"),
          )
        )
        .orderBy(asc(messages.created_at));

      messageList = dbMessages.map(mapDbMessageToPayload);
    }
  } else {
    // Try Redis first
    messageList = await getMessages(code);

    // Fall back to DB if empty
    if (messageList.length === 0) {
      const dbMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.event_id, event.id),
            ne(messages.sender_type, "dropped"),
          )
        )
        .orderBy(asc(messages.created_at));

      messageList = dbMessages.map(mapDbMessageToPayload);
    }
  }

  const response: MessageHistoryResponse = { messages: messageList };
  return c.json(response, 200);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mapDbMessageToPayload(msg: typeof messages.$inferSelect): ChatMessagePayload {
  return {
    id: msg.id,
    sender_type: msg.sender_type as ChatMessagePayload["sender_type"],
    sender_name: msg.sender_name,
    participant_id: msg.participant_id,
    content: msg.content,
    image_url: publicImageUrl(msg.image_url),
    step_number: msg.step_number,
    created_at: new Date(msg.created_at).toISOString(),
  };
}
