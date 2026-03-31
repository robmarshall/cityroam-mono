import { describe, it, expect } from "vitest";
import { deterministicAnswerMatch } from "../../services/pipeline/deterministic-match.js";

describe("deterministicAnswerMatch", () => {
  const answers = ["Town Hall", "City Hall"];

  it("matches exact answer (case insensitive)", () => {
    expect(deterministicAnswerMatch("town hall", answers)).toBe(true);
    expect(deterministicAnswerMatch("TOWN HALL", answers)).toBe(true);
    expect(deterministicAnswerMatch("Town Hall", answers)).toBe(true);
  });

  it("matches answer embedded in a sentence", () => {
    expect(deterministicAnswerMatch("I think it's the Town Hall", answers)).toBe(true);
    expect(deterministicAnswerMatch("maybe city hall?", answers)).toBe(true);
  });

  it("strips leading articles", () => {
    expect(deterministicAnswerMatch("the town hall", answers)).toBe(true);
    expect(deterministicAnswerMatch("a town hall", answers)).toBe(true);
    expect(deterministicAnswerMatch("an old town hall", ["old town hall"])).toBe(true);
  });

  it("handles whitespace", () => {
    expect(deterministicAnswerMatch("  town hall  ", answers)).toBe(true);
  });

  it("does not match partial words (word boundary)", () => {
    expect(deterministicAnswerMatch("starting", ["art"])).toBe(false);
    expect(deterministicAnswerMatch("townhall", answers)).toBe(false);
  });

  it("does not match unrelated strings", () => {
    expect(deterministicAnswerMatch("the park", answers)).toBe(false);
    expect(deterministicAnswerMatch("something else entirely", answers)).toBe(false);
  });

  it("returns false for empty message", () => {
    expect(deterministicAnswerMatch("", answers)).toBe(false);
    expect(deterministicAnswerMatch("   ", answers)).toBe(false);
  });

  it("returns false for empty accepted answers", () => {
    expect(deterministicAnswerMatch("town hall", [])).toBe(false);
  });

  it("handles single-word answers", () => {
    expect(deterministicAnswerMatch("bridge", ["Bridge"])).toBe(true);
    expect(deterministicAnswerMatch("I see the bridge!", ["Bridge"])).toBe(true);
    expect(deterministicAnswerMatch("bridgework", ["Bridge"])).toBe(false);
  });

  it("handles answers with special regex characters", () => {
    expect(deterministicAnswerMatch("st. paul's", ["St. Paul's"])).toBe(true);
  });
});
