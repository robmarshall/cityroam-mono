import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Position rewrites use one `UPDATE … SET position = CASE WHEN id = $1 THEN $2 … END`.
// postgres.js sends JS numbers as untyped parameters, so Postgres resolves the
// CASE to text and rejects it ("column position is of type integer but
// expression is of type text") unless every THEN value is cast. The unit tests
// mock the database, so this guards the SQL text itself.
describe("CASE position updates", () => {
  it("casts every THEN value to integer in the admin routes", () => {
    const source = readFileSync(new URL("../routes/admin.ts", import.meta.url), "utf8");
    const thens = [...source.matchAll(/THEN \$\{[^}]+\}(\S*)`/g)];
    expect(thens.length).toBeGreaterThanOrEqual(7);
    for (const [match, suffix] of thens) {
      expect(suffix, match).toBe("::integer");
    }
  });
});
