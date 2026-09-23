/** Small builders for lint fixtures, in the bulk-create payload shape. */

export type Block = { type: string; config: Record<string, unknown>; delay_ms?: number };
export type Group = { name: string; blocks: Block[] };

export const msg = (content: string, delay_ms = 2000): Block => ({
  type: "message",
  config: { type: "message", content },
  delay_ms,
});

export const img = (image_url: string, delay_ms = 1500): Block => ({
  type: "image",
  config: { type: "image", image_url },
  delay_ms,
});

export const map = (google_maps_link: string, delay_ms = 500): Block => ({
  type: "map",
  config: { type: "map", google_maps_link },
  delay_ms,
});

export const action = (label: string, delay_ms = 0): Block => ({
  type: "action",
  config: { type: "action", label },
  delay_ms,
});

export const hint = (content: string, image_url: string | null = null) => [
  { content, image_url, delay_ms: 0 },
];

export const question = (
  overrides: Partial<{ clue: string; accepted_answers: unknown[]; hints: unknown[] }> = {},
  delay_ms = 0,
): Block => ({
  type: "question",
  config: {
    type: "question",
    clue: "I stand with columns tall and proud, where justice once was served aloud.",
    accepted_answers: ["Leeds Town Hall", "Town Hall"],
    hints: [hint("Think civic buildings."), hint("It's on The Headrow.")],
    ...overrides,
  },
  delay_ms,
});

export const intro = (): Group => ({
  name: "Introduction",
  blocks: [
    msg("Right then. Welcome to {{CITY_NAME}}.", 0),
    msg("{{TOTAL_STOPS}} stops, roughly {{DISTANCE_KM}}km.", 1500),
    msg("Head to The Headrow. Look for the tall columns.", 3000),
  ],
});

export const location = (name = "Leeds Town Hall", slug = "leeds-town-hall-facade"): Group => ({
  name,
  blocks: [
    question(),
    img(`{{IMAGE:${slug}}}`, 1500),
    msg("Brodrick designed this when he was 30. He died in poverty in Paris.", 2000),
    map("https://maps.google.com/?q=Leeds+Town+Hall", 500),
    msg("Walk south down Vicar Lane, past the markets. About 5 minutes.", 4000),
    msg("Kirkgate Market on your right is one of the largest covered markets in Europe.", 45000),
  ],
});

export const closing = (): Group => ({
  name: "Finish",
  blocks: [msg("That's all {{TOTAL_STOPS}} stops done.", 0), msg("Leave a review: {{REVIEW_LINK}}", 2000)],
});

export const routeMeta = (overrides: Record<string, unknown> = {}) => ({
  city: "Leeds",
  name: "Leeds City Centre Discovery",
  language: "en",
  estimated_duration_mins: 60,
  estimated_distance_km: 2.5,
  is_active: false,
  ...overrides,
});

/** A clean route: intro, two location groups, closing group. */
export const payload = (
  groups: Group[] = [intro(), location(), location("Corn Exchange", "corn-exchange-dome"), closing()],
  route: Record<string, unknown> = {},
) => ({ route: routeMeta(route), groups });

/** Clean route with one location group replaced/edited. */
export const withLocation = (edit: (g: Group) => Group) =>
  payload([intro(), edit(location()), location("Corn Exchange", "corn-exchange-dome"), closing()]);
