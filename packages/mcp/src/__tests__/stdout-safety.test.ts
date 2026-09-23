import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * stdout carries the MCP protocol: a stray console write corrupts the stream
 * and breaks the client. Everything must log to stderr (see log.ts).
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

// Built from parts so this file does not match its own check.
const FORBIDDEN = [["console", "log"].join("."), ["console", "info"].join("."), ["process", "stdout", "write"].join(".")];

describe("stdout safety", () => {
  it("no source file writes to stdout", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return FORBIDDEN.filter((f) => text.includes(f)).map((f) => `${path.relative(SRC, file)}: ${f}`);
    });
    expect(offenders).toEqual([]);
  });
});
