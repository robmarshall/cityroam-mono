// Game limits
export const MAX_PARTICIPANTS = 10;
export const MAX_MESSAGE_LENGTH = 200;
export const MIN_MESSAGE_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 30;
export const MAX_GUIDE_RESPONSES_PER_EVENT = 100;

// Timeouts (milliseconds)
export const PARTICIPANT_OFFLINE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const IDLE_PROMPT_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
export const IDLE_PAUSE_TIMEOUT_MS = 90 * 60 * 1000; // 90 minutes
export const WEBSOCKET_PING_INTERVAL_MS = 30 * 1000; // 30 seconds
export const TYPING_INDICATOR_DEBOUNCE_MS = 3 * 1000; // 3 seconds
export const GUIDE_RATE_LIMIT_MS = 5 * 1000; // 5 seconds
export const PARTICIPANT_RATE_LIMIT_COUNT = 3; // max messages
export const PARTICIPANT_RATE_LIMIT_WINDOW_MS = 10 * 1000; // in 10 seconds

// Event lifecycle
export const EVENT_EXPIRY_DAYS = 90;
export const SESSION_TOKEN_EXPIRY_HOURS = 24;

// Event code
export const EVENT_CODE_LENGTH = 8;
export const EVENT_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/i/l
