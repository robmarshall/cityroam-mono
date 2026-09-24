/**
 * Where each rule comes from. Sections are headings in docs/llm-authoring/*.md
 * (" > " separates a heading from its sub-heading).
 */
export const CITATIONS = {
  schema:
    "api-reference.md > Creating a New Route (Bulk) (enforced by bulkRouteGroupCreateSchema in packages/shared/src/validation/admin-input.ts)",
  blockTypes: "data-model.md > Blocks > Block Types",
  hints: "content-guide.md > Hints",
  limits: "api-reference.md > Bulk Create Limits",
  imageUrls: "content-guide.md > Images > Image URLs",
  delays: "content-guide.md > Route Structure > Delays Between Blocks",
  templates: "content-guide.md > Template Variables in Message Blocks",
  intro: "content-guide.md > Route Structure > Typical Location Group",
  groupQuestion: "content-guide.md > Route Structure > Typical Location Group",
  imagesNot: "content-guide.md > Images > When NOT to Use Images",
  wallOfText: "content-guide.md > Anti-Patterns (Wall of text)",
  delayFree: "content-guide.md > Anti-Patterns (Delay-free dumps)",
  duplicateSuccess:
    "content-guide.md > Post-Answer Enrichment > Rules; content-guide.md > Anti-Patterns (Duplicating the success message)",
  enRoute: "content-guide.md > En-Route Commentary > Rules",
  acceptedAnswers: "content-guide.md > Accepted Answers",
  mapBlocks: "content-guide.md > Map Blocks",
  owl: "guide-personality.md > The Owl",
} as const;
