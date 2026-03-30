import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { eq, and, asc, gt, sql } from "drizzle-orm";
import type {
  EventDetailResponse,
  JoinEventResponse,
  MessageHistoryResponse,
  ChatMessagePayload,
} from "@cityroam/shared/types";
import {
  joinEventRequestSchema,
  eventCodeSchema,
  changeNameRequestSchema,
} from "@cityroam/shared/validation";
import { MAX_PARTICIPANTS } from "@cityroam/shared/constants";
import { db } from "../db/index.js";
import {
  events,
  participants,
  messages,
  stops,
  messageBanks,
  routes,
} from "../db/schema/index.js";
import {
  setSession,
  getSession,
  deleteSession,
  appendMessage,
  getMessages,
  getMessagesSince,
  checkJoinRateLimit,
  checkNameChangeRateLimit,
  publishMessage,
  publishControl,
} from "../redis/index.js";
import {
  sessionAuth,
  resolveSession,
  setSessionCookie,
  clearSessionCookie,
  COOKIE_NAME,
  AppError,
} from "../middleware/index.js";
import type { SessionContext } from "../middleware/index.js";

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
    event.status !== "COMPLETED" &&
    event.status !== "EXPIRED" &&
    event.status !== "REFUNDED"
  ) {
    await db
      .update(events)
      .set({ status: "EXPIRED" })
      .where(eq(events.id, event.id));
    event.status = "EXPIRED";
  }

  // Optional session resolution
  const token = getCookie(c, COOKIE_NAME);
  const session = await resolveSession(c);
  let currentParticipant: EventDetailResponse["current_participant"] = null;
  if (session && session.event_code === code && token) {
    currentParticipant = {
      id: session.participant_id,
      display_name: session.display_name,
      is_lead: session.is_lead,
      token,
    };
  }

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

  const leadParticipant = participantRows.find((p) => p.is_lead && p.is_active);

  const response: EventDetailResponse = {
    event: {
      code: event.code,
      status: event.status as EventDetailResponse["event"]["status"],
      current_stop: event.current_stop,
      started_at: event.started_at ? new Date(event.started_at).toISOString() : null,
      created_at: new Date(event.created_at).toISOString(),
    },
    participants: participantRows,
    lead_name: leadParticipant?.display_name ?? null,
    current_participant: currentParticipant,
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

  // Look up event
  const event = await db.query.events.findFirst({
    where: eq(events.code, code),
  });

  if (!event) {
    throw new AppError(404, "Event not found", "EVENT_NOT_FOUND");
  }

  if (event.status === "EXPIRED") {
    throw new AppError(410, "Event has expired", "EVENT_EXPIRED");
  }

  if (event.status === "COMPLETED") {
    throw new AppError(410, "Event is completed", "EVENT_COMPLETED");
  }

  if (event.status === "REFUNDED") {
    throw new AppError(410, "Event has been refunded", "EVENT_REFUNDED");
  }

  // Count active participants
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participants)
    .where(
      and(eq(participants.event_id, event.id), eq(participants.is_active, true))
    );

  if (countResult.count >= MAX_PARTICIPANTS) {
    throw new AppError(403, "Event is full", "EVENT_FULL");
  }

  // Check if this is the first joiner (any participants at all)
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participants)
    .where(eq(participants.event_id, event.id));

  const isLead = totalResult.count === 0;
  const token = crypto.randomUUID();

  // Insert participant
  const [newParticipant] = await db
    .insert(participants)
    .values({
      event_id: event.id,
      display_name,
      token,
      is_lead: isLead,
    })
    .returning();

  // If lead (first joiner), update event
  if (isLead) {
    await db
      .update(events)
      .set({
        lead_participant_id: newParticipant.id,
        status: "WAITING",
      })
      .where(eq(events.id, event.id));
  }

  // Store session in Redis
  await setSession(token, {
    participant_id: newParticipant.id,
    event_id: event.id,
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
    .where(eq(participants.event_id, event.id));

  const participantCount = participantRows.filter((p) => p.is_active).length;

  // Publish control event
  await publishControl(code, {
    type: "participant_joined",
    data: { name: display_name, participant_count: participantCount },
  });

  const response: JoinEventResponse = {
    participant: {
      id: newParticipant.id,
      display_name: newParticipant.display_name,
      is_lead: newParticipant.is_lead,
    },
    token,
    event: {
      code,
      status: (isLead ? "WAITING" : event.status) as JoinEventResponse["event"]["status"],
      current_stop: event.current_stop,
    },
    messages: cachedMessages,
    participants: participantRows,
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

  const event = await db.query.events.findFirst({
    where: eq(events.code, code),
  });

  if (!event || event.status !== "WAITING") {
    throw new AppError(400, "Event cannot be started", "INVALID_INPUT");
  }

  // Update event to IN_PROGRESS
  const now = new Date();
  await db
    .update(events)
    .set({
      status: "IN_PROGRESS",
      started_at: now,
      current_stop: 1,
    })
    .where(eq(events.id, event.id));

  // Select random opening template
  const openingTemplates = await db
    .select()
    .from(messageBanks)
    .where(
      and(
        eq(messageBanks.type, "opening"),
        eq(messageBanks.is_active, true)
      )
    );

  if (openingTemplates.length === 0) {
    throw new AppError(500, "No opening templates available", "INTERNAL_ERROR");
  }

  const template =
    openingTemplates[Math.floor(Math.random() * openingTemplates.length)];

  // Look up first stop
  const firstStop = await db.query.stops.findFirst({
    where: and(
      eq(stops.route_id, event.route_id),
      eq(stops.stop_number, 1)
    ),
  });

  if (!firstStop) {
    throw new AppError(500, "Route stop not found", "INTERNAL_ERROR");
  }

  // Look up route for template vars
  const route = await db.query.routes.findFirst({
    where: eq(routes.id, event.route_id),
  });

  if (!route) {
    throw new AppError(500, "Route not found", "INTERNAL_ERROR");
  }

  // Populate template
  let content = template.content
    .replace(/\{\{FIRST_STOP_DIRECTIONS\}\}/g, firstStop.directions_from_previous)
    .replace(/\{\{FIRST_CLUE\}\}/g, firstStop.clue)
    .replace(/\{\{CITY_NAME\}\}/g, route.city)
    .replace(/\{\{TOTAL_STOPS\}\}/g, String(route.total_stops));

  // Insert opening message
  const [openingMessage] = await db
    .insert(messages)
    .values({
      event_id: event.id,
      step_number: 1,
      sender_type: "guide",
      sender_name: "Guide",
      content,
      participant_id: null,
      image_url: null,
    })
    .returning();

  const messagePayload: ChatMessagePayload = {
    id: openingMessage.id,
    sender_type: openingMessage.sender_type as ChatMessagePayload["sender_type"],
    sender_name: openingMessage.sender_name,
    participant_id: openingMessage.participant_id,
    content: openingMessage.content,
    image_url: openingMessage.image_url ?? null,
    step_number: openingMessage.step_number,
    created_at: new Date(openingMessage.created_at).toISOString(),
  };

  // Cache and publish
  await appendMessage(code, messagePayload);
  await publishMessage(code, messagePayload);

  // Publish game started control event
  await publishControl(code, {
    type: "game_started",
    data: { started_by: session.display_name },
  });

  // If stop has images, create a second message with the first image
  const stopImages = (firstStop.images as string[]) ?? [];
  if (stopImages.length > 0) {
    const [imageMessage] = await db
      .insert(messages)
      .values({
        event_id: event.id,
        step_number: 1,
        sender_type: "guide",
        sender_name: "Guide",
        content: "",
        participant_id: null,
        image_url: stopImages[0],
      })
      .returning();

    const imagePayload: ChatMessagePayload = {
      id: imageMessage.id,
      sender_type: imageMessage.sender_type as ChatMessagePayload["sender_type"],
      sender_name: imageMessage.sender_name,
      participant_id: imageMessage.participant_id,
      content: imageMessage.content,
      image_url: imageMessage.image_url ?? null,
      step_number: imageMessage.step_number,
      created_at: new Date(imageMessage.created_at).toISOString(),
    };

    await appendMessage(code, imagePayload);
    await publishMessage(code, imagePayload);
  }

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

  // Update participant to inactive
  await db
    .update(participants)
    .set({
      is_active: false,
      left_at: new Date(),
      left_reason: "voluntary",
    })
    .where(eq(participants.id, session.participant_id));

  // If lead and event is WAITING, reassign lead
  if (session.is_lead && event.status === "WAITING") {
    const nextLead = await db.query.participants.findFirst({
      where: and(
        eq(participants.event_id, event.id),
        eq(participants.is_active, true)
      ),
      orderBy: asc(participants.joined_at),
    });

    if (nextLead) {
      await db
        .update(participants)
        .set({ is_lead: true })
        .where(eq(participants.id, nextLead.id));

      await db
        .update(events)
        .set({ lead_participant_id: nextLead.id })
        .where(eq(events.id, event.id));
    }
  }

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
            gt(messages.created_at, new Date(since))
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
        .where(eq(messages.event_id, event.id))
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
    image_url: msg.image_url ?? null,
    step_number: msg.step_number,
    created_at: new Date(msg.created_at).toISOString(),
  };
}
