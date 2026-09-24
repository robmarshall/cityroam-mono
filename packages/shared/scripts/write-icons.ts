/**
 * Writes the static favicon files from the owl in src/brand/owl.ts:
 *   packages/marketing/src/app/icon.svg  (Next serves it as the site favicon)
 *   packages/app/public/favicon.svg      (the player app's favicon)
 * Run `npm run icons -w @cityroam/shared` after changing the owl;
 * src/brand/icons.test.ts fails until the files match.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICON_FILES, iconFileContents } from "../src/brand/icon-files.js";

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

for (const rel of ICON_FILES) {
  writeFileSync(path.join(packagesDir, rel), iconFileContents());
  console.log(`wrote packages/${rel}`);
}
