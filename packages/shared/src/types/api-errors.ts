export interface ApiErrorResponse {
  error: string;
  code?: string;
}

export type ApiErrorCode =
  | "EVENT_NOT_FOUND"
  | "EVENT_FULL"
  | "EVENT_EXPIRED"
  | "EVENT_COMPLETED"
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "EVENT_REFUNDED"
  | "INTERNAL_ERROR";

export type ValidationErrorCode =
  | "DISPLAY_NAME_TOO_SHORT"
  | "DISPLAY_NAME_TOO_LONG"
  | "DISPLAY_NAME_HTML"
  | "DISPLAY_NAME_INVALID_CHARS"
  | "MESSAGE_TOO_SHORT"
  | "MESSAGE_TOO_LONG"
  | "MESSAGE_EMPTY"
  | "EVENT_CODE_INVALID";
