import { describe, expect, it } from "vitest";
import {
  OWL_FILL_PARTS,
  OWL_FILL_PATH,
  OWL_ICON_COLORS,
  OWL_STROKE,
  OWL_STROKE_PARTS,
  OWL_STROKE_PATH,
  owlIconSvg,
  owlStrokeWidth,
  owlSvg,
} from "./owl.js";

describe("owl mark", () => {
  it("keeps every number on the 24-unit grid", () => {
    const numbers = `${OWL_STROKE_PATH} ${OWL_FILL_PATH}`.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // Arc commands carry radii and flags as well as coordinates; all of them
    // still sit inside the viewBox.
    for (const n of numbers) {
      expect(Math.abs(n)).toBeLessThanOrEqual(24);
    }
  });

  it("writes path numbers without floating-point noise", () => {
    expect(`${OWL_STROKE_PATH} ${OWL_FILL_PATH}`).not.toMatch(/\d\.\d{4,}/);
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
    expect(svg).toContain('fill="&#34;red"');
  });

  it("draws every part, strokes and evenodd fills in the same colour", () => {
    for (const d of Object.values(OWL_STROKE_PARTS)) expect(OWL_STROKE_PATH).toContain(d);
    for (const d of Object.values(OWL_FILL_PARTS)) expect(OWL_FILL_PATH).toContain(d);
    const svg = owlSvg({ color: "#123456" });
    expect(svg).toContain(`<path d="${OWL_STROKE_PATH}" fill="none" stroke="#123456"`);
    expect(svg).toContain(`<path d="${OWL_FILL_PATH}" fill="#123456" fill-rule="evenodd"/>`);
  });

  it("builds the square icon from the same drawing", () => {
    const icon = owlIconSvg({ ...OWL_ICON_COLORS });
    expect(icon).toContain(`fill="${OWL_ICON_COLORS.background}"`);
    expect(icon).toContain(`d="${OWL_STROKE_PATH}"`);
    expect(icon).toContain(`d="${OWL_FILL_PATH}"`);
    expect(icon).toContain('aria-label="City Roam"');
  });
});
