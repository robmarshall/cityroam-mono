import type { EventStatus } from "@cityroam/shared/types";

export const STATUS_LABELS: Record<EventStatus, string> = {
  NOT_STARTED: "Not Started",
  WAITING: "Waiting",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  EXPIRED: "Expired",
  REFUNDED: "Refunded",
};

export const STATUS_COLORS: Record<EventStatus, { bg: string; text: string }> = {
  NOT_STARTED: { bg: "bg-gray-100", text: "text-gray-700" },
  WAITING: { bg: "bg-yellow-100", text: "text-yellow-700" },
  IN_PROGRESS: { bg: "bg-blue-100", text: "text-blue-700" },
  COMPLETED: { bg: "bg-green-100", text: "text-green-700" },
  EXPIRED: { bg: "bg-red-100", text: "text-red-700" },
  REFUNDED: { bg: "bg-orange-100", text: "text-orange-700" },
};

export const STATUS_ORDER: EventStatus[] = [
  "NOT_STARTED",
  "WAITING",
  "IN_PROGRESS",
  "COMPLETED",
  "EXPIRED",
  "REFUNDED",
];

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
