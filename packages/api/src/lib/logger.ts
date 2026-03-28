/**
 * Structured JSON logger for the API.
 *
 * All log output is a single JSON line per entry, making it easy to
 * aggregate, filter, and parse in production log tooling.
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...data,
  };

  const line = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

/**
 * Create a scoped logger for a specific component (e.g. "pipeline", "ws", "llm").
 */
export function createLogger(component: string) {
  return {
    info(message: string, data?: Record<string, unknown>) {
      emit("info", component, message, data);
    },
    warn(message: string, data?: Record<string, unknown>) {
      emit("warn", component, message, data);
    },
    error(message: string, data?: Record<string, unknown>) {
      emit("error", component, message, data);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
