import { describe, it, expect } from "vitest";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_ORDER,
  formatDate,
} from "../lib/event-utils";

// Smoke test: proves the package's module graph resolves under the workspace
// (including the @cityroam/shared TS exports) and that the status tables the
// event list renders from stay in step with each other.
describe("admin smoke", () => {
  it("covers every ordered status in both lookup tables", () => {
    expect(STATUS_ORDER.length).toBeGreaterThan(0);

    for (const status of STATUS_ORDER) {
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(STATUS_COLORS[status]).toBeTruthy();
    }

    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...STATUS_ORDER].sort());
    expect(Object.keys(STATUS_COLORS).sort()).toEqual([...STATUS_ORDER].sort());
  });

  it("formats an ISO timestamp without throwing", () => {
    const formatted = formatDate("2026-01-15T14:30:00.000Z");

    expect(formatted).toContain("2026");
    expect(formatted).not.toContain("Invalid");
  });
});
