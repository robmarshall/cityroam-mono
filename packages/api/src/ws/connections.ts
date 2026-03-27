import type { WebSocket } from "ws";

/**
 * In-memory map of active WebSocket connections, keyed by event code,
 * then by participant ID.
 */
const connections = new Map<string, Map<string, WebSocket>>();

/**
 * Register a WebSocket connection for a participant in an event.
 * Returns true if this is the first connection for the event
 * (caller should subscribe to the event's Redis channel).
 */
export function addConnection(
  eventCode: string,
  participantId: string,
  ws: WebSocket,
): boolean {
  let eventMap = connections.get(eventCode);
  const isFirst = !eventMap;

  if (!eventMap) {
    eventMap = new Map<string, WebSocket>();
    connections.set(eventCode, eventMap);
  }

  eventMap.set(participantId, ws);
  return isFirst;
}

/**
 * Remove a participant's WebSocket connection from an event.
 * Returns true if this was the last connection for the event
 * (caller should unsubscribe from the event's Redis channel).
 */
export function removeConnection(
  eventCode: string,
  participantId: string,
): boolean {
  const eventMap = connections.get(eventCode);
  if (!eventMap) {
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
