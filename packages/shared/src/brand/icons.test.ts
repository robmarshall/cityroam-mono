import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OWL_PATH } from "./owl.js";

// The square brand icon exists twice as a static file: the marketing site's
// favicon (Next serves src/app/icon.svg) and the player app's favicon. Neither
// build can import the other, so this test keeps them identical and on the
// current owl drawing.
const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ICONS = ["marketing/src/app/icon.svg", "app/public/favicon.svg"];

function read(rel: string): string {
  return readFileSync(path.join(packagesDir, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("brand icon files", () => {
  it("keeps the app favicon identical to the marketing icon", () => {
    const [marketing, app] = ICONS.map(read);
    expect(app).toBe(marketing);
  });

  it.each(ICONS)("%s draws the owl from owl.ts", (rel) => {
    expect(read(rel)).toContain(`d="${OWL_PATH}"`);
  });
});
