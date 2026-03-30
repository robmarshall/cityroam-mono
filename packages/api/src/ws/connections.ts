import type { WebSocket } from "ws";

/**
 * In-memory map of active WebSocket connections, keyed by event code,
 * then by participant ID.
 */
const connections = new Map<string, Map<string, WebSocket>>();

export interface AddConnectionResult {
  /** True if this is the first connection for the event (caller should subscribe to Redis). */
  isFirstForEvent: boolean;
  /** The previous WebSocket for this participant, if one was replaced (caller should close it). */
  previousWs: WebSocket | null;
}

/**
 * Register a WebSocket connection for a participant in an event.
 * If the participant already has a connection, the old one is returned
 * so the caller can close it (preventing race conditions on close).
 */
export function addConnection(
  eventCode: string,
  participantId: string,
  ws: WebSocket,
): AddConnectionResult {
  let eventMap = connections.get(eventCode);
  const isFirstForEvent = !eventMap;

  if (!eventMap) {
    eventMap = new Map<string, WebSocket>();
    connections.set(eventCode, eventMap);
  }

  const previousWs = eventMap.get(participantId) ?? null;
  eventMap.set(participantId, ws);
  return { isFirstForEvent, previousWs };
}

/**
 * Remove a participant's WebSocket connection from an event.
 * Only removes if the stored socket matches `ws` (identity check),
 * preventing a stale close handler from removing a newer connection.
 * Returns true if this was the last connection for the event
 * (caller should unsubscribe from the event's Redis channel).
 */
export function removeConnection(
  eventCode: string,
  participantId: string,
  ws: WebSocket,
): boolean {
  const eventMap = connections.get(eventCode);
  if (!eventMap) {
    return false;
  }

  // Only remove if the stored socket is the same instance
  const stored = eventMap.get(participantId);
  if (stored !== ws) {
    return false;
  }

  eventMap.delete(participantId);

  if (eventMap.size === 0) {
    connections.delete(eventCode);
    return true;
  }

  return false;
}

/**
 * Get all active connections for a given event code.
 */
export function getConnections(
  eventCode: string,
): Map<string, WebSocket> | undefined {
  return connections.get(eventCode);
}

/**
 * Check whether a participant has an active WebSocket connection for an event.
 */
export function hasConnection(
  participantId: string,
  eventCode: string,
): boolean {
  const eventMap = connections.get(eventCode);
  return eventMap?.has(participantId) ?? false;
}

/**
 * Get the total number of active connections across all events.
 */
export function getConnectionCount(): number {
  let count = 0;
  for (const eventMap of connections.values()) {
    count += eventMap.size;
  }
  return count;
}

/**
 * Get all event codes that currently have active connections.
 */
export function getAllEventCodes(): string[] {
  return Array.from(connections.keys());
}

/**
 * Close every active connection with the given code and reason,
 * then clear the in-memory map. Used for graceful shutdown.
 */
export function closeAllConnections(code: number, reason: string): void {
  for (const eventMap of connections.values()) {
    for (const ws of eventMap.values()) {
      ws.close(code, reason);
    }
  }
  connections.clear();
}
