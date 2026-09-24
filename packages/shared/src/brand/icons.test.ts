import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ICON_FILES, iconFileContents } from "./icon-files.js";

// The favicons are static files (Next serves src/app/icon.svg; the app build
// copies public/favicon.svg), so they are generated from owl.ts rather than
// imported. If this fails, run `npm run icons -w @cityroam/shared`.
const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("brand icon files", () => {
  it.each(ICON_FILES)("%s is generated from the current owl", (rel) => {
    const onDisk = readFileSync(path.join(packagesDir, rel), "utf8").replace(/\r\n/g, "\n");
    expect(onDisk).toBe(iconFileContents());
  });
});
