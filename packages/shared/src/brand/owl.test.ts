import { describe, expect, it } from "vitest";
import { OWL_PARTS, OWL_PATH, OWL_STROKE, owlStrokeWidth, owlSvg } from "./owl.js";

describe("owl mark", () => {
  it("keeps every coordinate on the 24-unit grid", () => {
    const numbers = OWL_PATH.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // Arc commands carry radii and flags as well as coordinates; all of them
    // still sit inside the viewBox.
    for (const n of numbers) {
      expect(Math.abs(n)).toBeLessThanOrEqual(24);
    }
  });

  it("uses the heavier stroke at small sizes", () => {
    expect(owlStrokeWidth(16)).toBe(OWL_STROKE.small);
    expect(owlStrokeWidth(24)).toBe(OWL_STROKE.small);
    expect(owlStrokeWidth(48)).toBe(OWL_STROKE.regular);
  });

  it("is decorative unless given a title", () => {
    expect(owlSvg()).toContain('aria-hidden="true"');
    expect(owlSvg()).not.toContain("<title>");

    const labelled = owlSvg({ title: "City Roam" });
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain("<title>City Roam</title>");
  });

  it("escapes the title and colour", () => {
    const svg = owlSvg({ title: '<a & "b">', color: '"red' });
    expect(svg).not.toMatch(/<a /);
    expect(svg).toContain("&#60;a &#38; &#34;b&#34;&#62;");
    expect(svg).toContain('stroke="&#34;red"');
  });

  it("draws every part in the single path", () => {
    for (const d of Object.values(OWL_PARTS)) expect(OWL_PATH).toContain(d);
  });
});
