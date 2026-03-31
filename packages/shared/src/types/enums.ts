export type EventStatus =
  | "NOT_STARTED"
  | "WAITING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "EXPIRED"
  | "REFUNDED";

export type SenderType = "user" | "guide" | "system" | "dropped";

export type ParticipantLeftReason = "voluntary" | "timeout";

export type MessageBankType =
  | "success"
  | "failure"
  | "hint-exhausted"
  | "clarification"
  | "unknown-answer"
  | "opening"
  | "completion"
  | "over-length";
