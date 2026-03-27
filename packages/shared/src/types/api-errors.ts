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
  | "INTERNAL_ERROR";
