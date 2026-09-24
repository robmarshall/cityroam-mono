import { describe, it, expect } from "vitest";
import { lintRoute, type LintResult, type RuleId } from "../index.js";
import { countSentences, owlPun, successOpener } from "../text.js";
import {
  action,
  closing,
  hint,
  img,
  intro,
  location,
  map,
  msg,
  payload,
  question,
  routeMeta,
  withLocation,
  type Group,
} from "./fixtures.js";

const errorRules = (r: LintResult) => r.errors.map((i) => i.rule);
const warningRules = (r: LintResult) => r.warnings.map((i) => i.rule);
const hasError = (input: unknown, rule: RuleId) => errorRules(lintRoute(input)).includes(rule);
const hasWarning = (input: unknown, rule: RuleId, opts = {}) =>
  warningRules(lintRoute(input, opts)).includes(rule);

describe("baseline", () => {
  it("a clean route has no errors and no warnings", () => {
    expect(lintRoute(payload())).toEqual({ errors: [], warnings: [] });
  });

  it("every issue carries a rule, message, path and citation", () => {
    const bad = withLocation((g) => ({ ...g, blocks: [img("{{IMAGE:x}}"), ...g.blocks] }));
    bad.groups[1].blocks.push({ type: "message", config: { type: "image", image_url: "{{IMAGE:y}}" } });
    const r = lintRoute(bad);
    for (const i of [...r.errors, ...r.warnings]) {
      expect(i.rule).toBeTruthy();
      expect(i.message).toBeTruthy();
      expect(i.path).toMatch(/^(route|groups)/);
      expect(i.citation).toMatch(/\.(md|ts)/);
    }
  });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe("error: schema", () => {
  it("passes a valid payload", () => {
    expect(hasError(payload(), "schema")).toBe(false);
  });

  it("maps Zod issues with a formatted path and group name", () => {
    const bad = withLocation((g) => ({ ...g, blocks: [...g.blocks, img("leeds.jpg")] }));
    const r = lintRoute(bad);
    const issue = r.errors.find((i) => i.rule === "schema");
    expect(issue).toMatchObject({
      path: "groups[1].blocks[6].config.image_url",
      group_name: "Leeds Town Hall",
      citation: expect.stringContaining("Image URLs"),
    });
  });

  it("rejects route metadata the API would reject", () => {
    const zero = lintRoute(payload(undefined, { estimated_duration_mins: 0 }));
    expect(zero.errors.map((i) => i.path)).toEqual(["route.estimated_duration_mins"]);
    const noFamily = lintRoute(payload(undefined, { city: undefined }));
    expect(noFamily.errors.map((i) => i.path)).toEqual(["route.route_family_id"]);
  });

  it("rejects a block delay over 5 minutes", () => {
    expect(hasError(withLocation((g) => ({ ...g, blocks: [...g.blocks, msg("Late.", 300_001)] })), "schema")).toBe(true);
    expect(hasError(withLocation((g) => ({ ...g, blocks: [...g.blocks, msg("Late.", 300_000)] })), "schema")).toBe(false);
  });

  it("reports non-object input without throwing", () => {
    expect(errorRules(lintRoute("nope"))).toContain("schema");
    expect(errorRules(lintRoute(null))).toContain("schema");
  });
});

describe("error: block-type-mismatch", () => {
  it("passes when type matches config.type", () => {
    expect(hasError(payload(), "block-type-mismatch")).toBe(false);
  });

  it("fails when type differs from config.type, without a duplicate schema issue", () => {
    const bad = withLocation((g) => ({
      ...g,
      blocks: [...g.blocks, { type: "message", config: { type: "map", google_maps_link: "https://maps.google.com/?q=X" }, delay_ms: 0 }],
    }));
    const r = lintRoute(bad);
    expect(errorRules(r)).toEqual(["block-type-mismatch"]);
    expect(r.errors[0].path).toBe("groups[1].blocks[6].type");
  });
});

describe("error: hint-count (2-3 hints)", () => {
  it("passes with 2 and 3 hints", () => {
    const three = question({ hints: [hint("a"), hint("b"), hint("c")] });
    expect(hasError(withLocation((g) => ({ ...g, blocks: [three, ...g.blocks.slice(1)] })), "hint-count")).toBe(false);
  });

  it("fails with 1 hint", () => {
    const one = question({ hints: [hint("a")] });
    const r = lintRoute(withLocation((g) => ({ ...g, blocks: [one, ...g.blocks.slice(1)] })));
    expect(r.errors).toEqual([
      expect.objectContaining({ rule: "hint-count", path: "groups[1].blocks[0].config.hints", citation: expect.stringContaining("Hints") }),
    ]);
  });

  it("fails with 4 hints", () => {
    const four = question({ hints: [hint("a"), hint("b"), hint("c"), hint("d")] });
    expect(hasError(withLocation((g) => ({ ...g, blocks: [four, ...g.blocks.slice(1)] })), "hint-count")).toBe(true);
  });
});

describe("error: max-groups (30)", () => {
  const groups = (n: number): Group[] => [intro(), ...Array.from({ length: n - 2 }, (_, i) => location(`Stop ${i}`)), closing()];

  it("passes with 30 groups", () => {
    expect(hasError(payload(groups(30)), "max-groups")).toBe(false);
  });

  it("fails with 31 groups", () => {
    const r = lintRoute(payload(groups(31)));
    expect(r.errors.find((i) => i.rule === "max-groups")?.message).toContain("maximum is 30");
  });
});

describe("error: max-blocks (50 per group)", () => {
  const fill = (n: number) => withLocation((g) => ({ ...g, blocks: [...g.blocks, ...Array.from({ length: n - g.blocks.length }, () => msg("More.", 2000))] }));

  it("passes with 50 blocks", () => {
    expect(hasError(fill(50), "max-blocks")).toBe(false);
  });

  it("fails with 51 blocks", () => {
    const r = lintRoute(fill(51));
    expect(r.errors.find((i) => i.rule === "max-blocks")).toMatchObject({ path: "groups[1].blocks", group_name: "Leeds Town Hall" });
  });
});

describe("error: template-malformed", () => {
  const withText = (content: string) => withLocation((g) => ({ ...g, blocks: [...g.blocks, msg(content)] }));

  it("passes well-formed variables", () => {
    expect(hasError(withText("Welcome to {{CITY_NAME}}, {{TOTAL_STOPS}} stops, {{DISTANCE_KM}}km. {{REVIEW_LINK}}"), "template-malformed")).toBe(false);
    expect(hasError(withText("I'm {{GUIDE_NAME}}."), "template-malformed")).toBe(false);
  });

  it.each([
    ["spaces", "Welcome to {{ CITY_NAME }}."],
    ["lowercase", "Welcome to {{city_name}}."],
    ["single braces", "Welcome to {CITY_NAME}."],
    ["unclosed", "Welcome to {{CITY_NAME."],
  ])("fails on %s", (_label, content) => {
    expect(hasError(withText(content), "template-malformed")).toBe(true);
  });

  it("checks hint text too", () => {
    const q = question({ hints: [hint("In {{CITY_NAME }}."), hint("b")] });
    const r = lintRoute(withLocation((g) => ({ ...g, blocks: [q, ...g.blocks.slice(1)] })));
    expect(r.errors[0]).toMatchObject({ rule: "template-malformed", path: "groups[1].blocks[0].config.hints[0][0].content" });
  });
});

describe("error: template-unknown", () => {
  const withText = (content: string) => withLocation((g) => ({ ...g, blocks: [...g.blocks, msg(content)] }));

  it("passes the route variables in message and hint text", () => {
    const q = question({ hints: [hint("You're in {{CITY_NAME}}."), hint("{{GUIDE_NAME}} again.")] });
    expect(hasError(withLocation((g) => ({ ...g, blocks: [q, ...g.blocks.slice(1)] })), "template-unknown")).toBe(false);
    expect(hasError(withText("I'm {{GUIDE_NAME}}. Welcome to {{CITY_NAME}}."), "template-unknown")).toBe(false);
  });

  it("fails on {{GUIDE_NAME}} in a clue", () => {
    const q = question({ clue: "{{GUIDE_NAME}} asks: which hall?" });
    const r = lintRoute(withLocation((g) => ({ ...g, blocks: [q, ...g.blocks.slice(1)] })));
    expect(r.errors[0]).toMatchObject({ rule: "template-unknown", path: "groups[1].blocks[0].config.clue" });
  });

  it.each([
    ["an unknown key", "Welcome to {{CITY}}."],
    ["the bank-only ANSWER", "It was {{ANSWER}}."],
    ["an image placeholder in text", "Look: {{IMAGE:leeds-town-hall}}"],
  ])("fails on %s", (_label, content) => {
    expect(hasError(withText(content), "template-unknown")).toBe(true);
  });

  it("fails on any variable in a clue (clues are not substituted)", () => {
    const q = question({ clue: "The grandest hall in {{CITY_NAME}}." });
    const r = lintRoute(withLocation((g) => ({ ...g, blocks: [q, ...g.blocks.slice(1)] })));
    expect(r.errors[0]).toMatchObject({ rule: "template-unknown", path: "groups[1].blocks[0].config.clue" });
  });

  it("fails on a variable in an action label", () => {
    expect(hasError(withLocation((g) => ({ ...g, blocks: [action("Ready for {{CITY_NAME}}?"), ...g.blocks] })), "template-unknown")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

describe("warning: first-group-question", () => {
  it("passes when the first group is a question-free introduction", () => {
    expect(hasWarning(payload(), "first-group-question")).toBe(false);
  });

  it("fails when the first group contains a question", () => {
    const r = lintRoute(payload([location(), location("Corn Exchange"), closing()]));
    expect(r.warnings.find((i) => i.rule === "first-group-question")?.path).toBe("groups[0].blocks[0]");
  });
});

describe("warning: group-missing-question", () => {
  it("passes when only the intro and closing groups lack a question", () => {
    expect(hasWarning(payload(), "group-missing-question")).toBe(false);
  });

  it("fails when a middle group has no question", () => {
    const narrative: Group = { name: "Interlude", blocks: [msg("A pause.", 0)] };
    const r = lintRoute(payload([intro(), location(), narrative, location("Corn Exchange"), closing()]));
    expect(r.warnings.filter((i) => i.rule === "group-missing-question")).toEqual([
      expect.objectContaining({ path: "groups[2]", group_name: "Interlude" }),
    ]);
  });
});

describe("warning: image-before-question", () => {
  it("passes when images follow the question", () => {
    expect(hasWarning(payload(), "image-before-question")).toBe(false);
  });

  it("fails when an image precedes the question", () => {
    const r = lintRoute(withLocation((g) => ({ ...g, blocks: [img("{{IMAGE:spoiler}}", 0), ...g.blocks] })));
    expect(r.warnings.find((i) => i.rule === "image-before-question")?.path).toBe("groups[1].blocks[0]");
  });

  it("allows an intro hero image (no question in the group)", () => {
    const hero: Group = { ...intro(), blocks: [img("https://cdn.example.com/leeds.jpg", 0), ...intro().blocks] };
    expect(hasWarning(payload([hero, location(), closing()]), "image-before-question")).toBe(false);
  });
});

describe("warning: too-many-images (>2 per group)", () => {
  it("passes with 2 images", () => {
    expect(hasWarning(withLocation((g) => ({ ...g, blocks: [...g.blocks, img("{{IMAGE:b}}", 15000)] })), "too-many-images")).toBe(false);
  });

  it("fails with 3 images", () => {
    const three = withLocation((g) => ({ ...g, blocks: [...g.blocks, img("{{IMAGE:b}}", 2000), img("{{IMAGE:c}}", 2000)] }));
    expect(hasWarning(three, "too-many-images")).toBe(true);
  });
});

describe("warning: message-too-long", () => {
  const withText = (content: string) => withLocation((g) => ({ ...g, blocks: [...g.blocks, msg(content)] }));

  it("passes 3 short sentences", () => {
    expect(hasWarning(withText("Brodrick designed this at 30. He died in poverty in Paris. Architecture's a tough business."), "message-too-long")).toBe(false);
  });

  it("fails 4 sentences", () => {
    expect(hasWarning(withText("One. Two. Three. Four."), "message-too-long")).toBe(true);
  });

  it("fails over 300 characters", () => {
    expect(hasWarning(withText(`${"word ".repeat(62)}end`), "message-too-long")).toBe(true);
  });

  it("checks hint text", () => {
    const q = question({ hints: [hint("One. Two. Three. Four."), hint("b")] });
    expect(hasWarning(withLocation((g) => ({ ...g, blocks: [q, ...g.blocks.slice(1)] })), "message-too-long")).toBe(true);
  });

  it("counts sentences without splitting abbreviations or decimals", () => {
    expect(countSentences("Walk down St. John's Road. It's 2.5km.")).toBe(2);
    expect(countSentences("I won't judge. Much.")).toBe(2);
    expect(countSentences("¿Listos? ¡Vamos! Seguid el río")).toBe(3);
    expect(countSentences("")).toBe(0);
    expect(countSentences("Hier steht seit etwa 627 n. Chr. eine Kirche. Seit dem 13. Jahrhundert.", "de")).toBe(2);
    expect(countSentences("Opened in 1858. The organ has 6,500 pipes.", "en")).toBe(2);
  });
});

describe("warning: delay-free-run (4+ consecutive delay_ms 0)", () => {
  it("passes with 3 consecutive zero-delay blocks", () => {
    const g: Group = { ...intro(), blocks: [msg("a", 0), msg("b", 0), msg("c", 0), msg("d", 1500)] };
    expect(hasWarning(payload([g, location(), closing()]), "delay-free-run")).toBe(false);
  });

  it("fails with 4 consecutive zero-delay blocks", () => {
    const g: Group = { ...intro(), blocks: [msg("a", 0), msg("b", 0), msg("c", 0), msg("d", 0)] };
    const r = lintRoute(payload([g, location(), closing()]));
    expect(r.warnings.find((i) => i.rule === "delay-free-run")?.path).toBe("groups[0].blocks[0]");
  });

  it("treats a question as the end of a run (it pauses the flow)", () => {
    const g: Group = { name: "Stop", blocks: [msg("a", 0), msg("b", 0), question(), msg("c", 0), msg("d", 0)] };
    expect(hasWarning(payload([intro(), g, closing()]), "delay-free-run")).toBe(false);
  });
});

describe("warning: duplicate-success-message", () => {
  const after = (content: string, language = "en") =>
    payload([intro(), { name: "Stop", blocks: [question(), img("{{IMAGE:a}}"), msg(content)] }, closing()], { language });

  it("passes a fun fact after the question", () => {
    expect(hasWarning(after("Brodrick designed this when he was 30."), "duplicate-success-message")).toBe(false);
  });

  it.each([
    ["en", "Well done! Brodrick designed this."],
    ["en", "Correct. Brodrick designed this."],
    ["en", "That's the one — Brodrick designed this."],
    ["es", "¡Esa es! Brodrick lo diseñó."],
    ["fr", "C'est ça. Brodrick l'a conçu."],
    ["de", "Stimmt. Brodrick hat es entworfen."],
    ["nl", "Klopt. Brodrick heeft het ontworpen."],
    ["es", "Well done. Brodrick lo diseñó."],
  ])("fails in %s: %s", (language, content) => {
    expect(hasWarning(after(content, language), "duplicate-success-message")).toBe(true);
  });

  it("does not match narration that merely starts with the words", () => {
    expect(successOpener("Correct change only at the kiosk.", "en")).toBeNull();
    expect(successOpener("Ahí está la catedral más antigua.", "es")).toBeNull();
  });

  it("falls back to English for an unlisted language", () => {
    expect(successOpener("Well done.", "it")).toBe("well done");
    expect(successOpener("Esatto.", "it")).toBeNull();
  });
});

describe("warning: too-many-en-route (max 3 blocks)", () => {
  it("passes with 3 en-route blocks", () => {
    const g = withLocation((l) => ({ ...l, blocks: [...l.blocks, img("{{IMAGE:m}}", 15000), msg("Later.", 90000)] }));
    expect(hasWarning(g, "too-many-en-route")).toBe(false);
  });

  it("fails with 4 en-route blocks", () => {
    const g = withLocation((l) => ({ ...l, blocks: [...l.blocks, msg("b", 60000), msg("c", 90000), msg("d", 120000)] }));
    expect(hasWarning(g, "too-many-en-route")).toBe(true);
  });
});

describe("warning: accepted-answer-count", () => {
  const answers = (list: string[]) => withLocation((g) => ({ ...g, blocks: [question({ accepted_answers: list }), ...g.blocks.slice(1)] }));

  it("passes 2 and 6 answers", () => {
    expect(hasWarning(answers(["A", "B"]), "accepted-answer-count")).toBe(false);
    expect(hasWarning(answers(["A", "B", "C", "D", "E", "F"]), "accepted-answer-count")).toBe(false);
  });

  it("fails 1 answer", () => {
    expect(hasWarning(answers(["Leeds Town Hall"]), "accepted-answer-count")).toBe(true);
  });

  it("fails 7 answers", () => {
    expect(hasWarning(answers(["A", "B", "C", "D", "E", "F", "G"]), "accepted-answer-count")).toBe(true);
  });
});

describe("warning: map-link-format", () => {
  const withMap = (link: string) => withLocation((g) => ({ ...g, blocks: [...g.blocks, map(link)] }));

  it("passes https://maps.google.com/?q=…", () => {
    expect(hasWarning(withMap("https://maps.google.com/?q=Leeds+Corn+Exchange"), "map-link-format")).toBe(false);
  });

  it.each([
    "https://www.google.com/maps/place/Leeds+Town+Hall",
    "https://goo.gl/maps/abc123",
    "http://maps.google.com/?q=Leeds+Town+Hall",
    "https://maps.google.com/?q=",
  ])("fails %s", (link) => {
    expect(hasWarning(withMap(link), "map-link-format")).toBe(true);
  });
});

describe("warning: active-with-placeholders", () => {
  it("passes an inactive route with placeholders", () => {
    expect(hasWarning(payload(), "active-with-placeholders")).toBe(false);
  });

  it("passes an active route with only uploaded URLs", () => {
    const g = withLocation((l) => ({ ...l, blocks: [l.blocks[0], img("https://cdn.example.com/a.jpg"), ...l.blocks.slice(2)] }));
    const clean = { route: routeMeta({ is_active: true }), groups: [g.groups[0], g.groups[1], closing()] };
    expect(hasWarning(clean, "active-with-placeholders")).toBe(false);
  });

  it("fails an active route with placeholders", () => {
    const r = lintRoute(payload(undefined, { is_active: true }));
    const issue = r.warnings.find((i) => i.rule === "active-with-placeholders");
    expect(issue).toMatchObject({ path: "route.is_active" });
    expect(issue?.message).toContain("leeds-town-hall-facade, corn-exchange-dome");
  });

  it("fails when is_active is omitted (the schema defaults it to true)", () => {
    const r = lintRoute(payload(undefined, { is_active: undefined }));
    expect(r.warnings.find((i) => i.rule === "active-with-placeholders")?.message).toContain("defaults to true");
  });

  it("counts hint image placeholders", () => {
    const q = question({ hints: [hint("Look:", "{{IMAGE:hint-photo}}"), hint("b")] });
    const g: Group = { name: "Stop", blocks: [q, msg("Fact.")] };
    const r = lintRoute(payload([intro(), g, closing()], { is_active: true }));
    expect(r.warnings.find((i) => i.rule === "active-with-placeholders")?.message).toContain("hint-photo");
  });
});

describe("warning: placeholder-not-uploaded (uploadedSlugs)", () => {
  it("is skipped without uploadedSlugs", () => {
    expect(hasWarning(payload(), "placeholder-not-uploaded")).toBe(false);
  });

  it("passes when every slug is uploaded", () => {
    const uploadedSlugs = new Set(["leeds-town-hall-facade", "corn-exchange-dome"]);
    expect(hasWarning(payload(), "placeholder-not-uploaded", { uploadedSlugs })).toBe(false);
  });

  it("fails for each missing slug occurrence", () => {
    const r = lintRoute(payload(), { uploadedSlugs: new Set(["leeds-town-hall-facade"]) });
    expect(r.warnings.filter((i) => i.rule === "placeholder-not-uploaded")).toEqual([
      expect.objectContaining({ path: "groups[2].blocks[1].config.image_url", group_name: "Corn Exchange" }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Admin GET shape
// ---------------------------------------------------------------------------

describe("warning: guide-pun", () => {
  const withText = (content: string) => withLocation((g) => ({ ...g, blocks: [...g.blocks, msg(content, 2000)] }));

  it.each([
    ["hoot", "What a hoot."],
    ["twit-twoo", "Twit-twoo, off we go."],
    ["wise old owl", "Ask the wise old owl."],
    ["owlsome", "That was owlsome."],
    ["whooo", "Whooo knows."],
    ["Spanish cliché", "Lo dice el búho sabio."],
    ["German call", "Schuhu."],
    ["Dutch call", "Oehoe."],
  ])("warns on %s", (_label, content) => {
    expect(hasWarning(withText(content), "guide-pun")).toBe(true);
  });

  it("checks hint text too", () => {
    const q = question({ hints: [hint("Don't give a hoot about the door."), hint("b")] });
    const r = lintRoute(withLocation((g) => ({ ...g, blocks: [q, ...g.blocks.slice(1)] })));
    expect(r.warnings.find((w) => w.rule === "guide-pun")).toMatchObject({
      path: "groups[1].blocks[0].config.hints[0][0].content",
      citation: "guide-personality.md > The Owl",
    });
  });

  it.each([
    ["the name", "I'm {{GUIDE_NAME}}. I'll keep this brief."],
    ["a plain owl mention", "There are owls on the city's coat of arms."],
    ["words that contain the letters", "Shooting stars, who knows, the town's wholesale market."],
  ])("passes %s", (_label, content) => {
    expect(hasWarning(withText(content), "guide-pun")).toBe(false);
    expect(owlPun(content)).toBeNull();
  });
});

describe("admin GET /admin/routes/:id shape", () => {
  const ts = "2026-01-01T00:00:00.000Z";
  const toDetail = (p: ReturnType<typeof payload>) => ({
    route: {
      id: "11111111-1111-4111-8111-111111111111",
      name: p.route.name,
      description: "",
      language: p.route.language,
      route_family_id: "22222222-2222-4222-8222-222222222222",
      total_stops: p.groups.length,
      estimated_duration_mins: p.route.estimated_duration_mins,
      estimated_distance_km: p.route.estimated_distance_km,
      is_active: p.route.is_active,
      created_at: ts,
      updated_at: ts,
    },
    route_family: { id: "22222222-2222-4222-8222-222222222222", name: "Leeds", city: "Leeds", created_at: ts, updated_at: ts },
    groups: p.groups.map((g, gi) => ({
      id: `group-${gi}`,
      route_id: "11111111-1111-4111-8111-111111111111",
      position: gi,
      name: g.name,
      created_at: ts,
      updated_at: ts,
      blocks: g.blocks.map((b, bi) => ({
        id: `block-${gi}-${bi}`,
        group_id: `group-${gi}`,
        position: bi,
        type: b.type,
        config: b.config,
        delay_ms: b.delay_ms ?? 0,
        created_at: ts,
      })),
    })),
  });

  it("lints a clean stored route without issues", () => {
    expect(lintRoute(toDetail(payload()))).toEqual({ errors: [], warnings: [] });
  });

  it("reports block ids on issues", () => {
    const bad = toDetail(withLocation((g) => ({ ...g, blocks: [question({ hints: [hint("a")] }), ...g.blocks.slice(1)] })));
    const r = lintRoute(bad);
    expect(r.errors).toEqual([
      expect.objectContaining({ rule: "hint-count", block_id: "block-1-0", group_name: "Leeds Town Hall" }),
    ]);
  });
});
