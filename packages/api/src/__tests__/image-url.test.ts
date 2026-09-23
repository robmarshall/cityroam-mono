import { describe, it, expect } from "vitest";
import { publicImageUrl } from "../lib/image-url.js";

// AWS_CDN_BASE_URL is "https://cdn.test.com" via the env mock in setup.ts.
describe("publicImageUrl", () => {
  it("resolves an {{IMAGE:slug}} placeholder to its route-images key on the CDN", () => {
    expect(publicImageUrl("{{IMAGE:leeds-town-hall-facade}}")).toBe(
      "https://cdn.test.com/route-images/leeds-town-hall-facade.jpg",
    );
  });

  it("drops a malformed placeholder instead of emitting a broken URL", () => {
    expect(publicImageUrl("{{IMAGE:Leeds Town Hall}}")).toBeNull();
  });

  it("still absolutizes legacy bare keys and passes absolute URLs through", () => {
    expect(publicImageUrl("uploads/1699_photo.png")).toBe(
      "https://cdn.test.com/uploads/1699_photo.png",
    );
    expect(publicImageUrl("https://cdn.test.com/uploads/1_a.png")).toBe(
      "https://cdn.test.com/uploads/1_a.png",
    );
  });

  it("returns null for no image", () => {
    expect(publicImageUrl(null)).toBeNull();
  });
});
