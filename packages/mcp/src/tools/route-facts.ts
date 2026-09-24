import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { AdminRouteFactsResponse, RouteFacts } from "@cityroam/shared/types";
import {
  ROUTE_FACTS_COVERED,
  ROUTE_FACTS_STEP_FREE,
  ROUTE_FACTS_TOILETS,
  routeFactsInputSchema,
} from "@cityroam/shared/validation";
import { z } from "zod";
import { errorResult, guard, okResult } from "../result.js";
import type { ToolContext } from "./context.js";

/**
 * Route facts: the practical facts the marketing site's "Route at a glance"
 * shows for a route family (api-reference.md > Route Facts).
 *
 * update_route_facts is GET-merge-PUT: only the facts given change (null
 * clears one), the merged set is re-parsed with the shared
 * `routeFactsInputSchema` (the one the API parses) before anything is sent,
 * and the API then replaces the whole set. Input shapes are plain wire
 * shapes, as everywhere in this server.
 */

const FACT_KEYS = [
  "startPoint",
  "distanceKm",
  "durationMins",
  "stops",
  "stepFree",
  "dogs",
  "toilets",
  "covered",
] as const;
type FactKey = (typeof FACT_KEYS)[number];

const optionalLabel = (lang: string) =>
  z.string().nullable().optional().describe(`${lang} label; blank or null shows the English one`);

const startPointShape = z
  .looseObject({
    label: z
      .looseObject({
        en: z.string().describe("English place name, e.g. \"City Square\" (required)"),
        es: optionalLabel("Spanish"),
        fr: optionalLabel("French"),
        de: optionalLabel("German"),
        nl: optionalLabel("Dutch"),
      })
      .describe("The start point's name in each language"),
    lat: z.number().describe("Latitude, -90 to 90"),
    lng: z.number().describe("Longitude, -180 to 180"),
    mapUrl: z.string().describe("https://maps.google.com/?q=<lat>,<lng>"),
  })
  .describe("Where the game starts. Never a stop (it would give an answer away).");

export const routeFactsToolInputShapes = {
  get_route_facts: {
    family_id: z.string().min(1).describe("Route family id (uuid)"),
  },
  update_route_facts: {
    family_id: z.string().min(1).describe("Route family id (uuid)"),
    startPoint: startPointShape
      .nullable()
      .optional()
      .describe("Replaces the whole start point (all four parts), or null to clear it. To change one label, pass the full object from get_route_facts."),
    distanceKm: z.number().nullable().optional().describe("Walking distance in km (> 0, ≤ 100). Canonical for the marketing site."),
    durationMins: z.number().nullable().optional().describe("Walking time in whole minutes (1–1440). Canonical for the marketing site."),
    stops: z.number().nullable().optional().describe("Number of answer stops (whole number). Never name them."),
    stepFree: z.enum(ROUTE_FACTS_STEP_FREE).nullable().optional().describe('"mostly" = with a short detour or a hand'),
    dogs: z.boolean().nullable().optional().describe("Whether dogs are welcome"),
    toilets: z.enum(ROUTE_FACTS_TOILETS).nullable().optional().describe("Nearest public toilets"),
    covered: z.enum(ROUTE_FACTS_COVERED).nullable().optional().describe("How much of the walk is under a roof"),
    dry_run: z.boolean().optional().describe("Validate and show the request and the changes without saving"),
  },
} as const;

export const routeFactsToolOutputShapes = {
  get_route_facts: {
    route_family_id: z.string(),
    facts: z.looseObject({ updatedAt: z.string().nullable() }),
  },
} as const;

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const HIDDEN = "not set (hidden on the site)";

function show(key: FactKey, facts: Omit<RouteFacts, "updatedAt">): string {
  const v = facts[key];
  if (v === null || v === undefined) return HIDDEN;
  if (key === "startPoint") {
    const sp = facts.startPoint!;
    const others = (["es", "fr", "de", "nl"] as const)
      .map((l) => `${l}: ${sp.label[l] ?? "(English)"}`)
      .join(", ");
    return `"${sp.label.en}" (${others}) at ${sp.lat},${sp.lng} ${sp.mapUrl}`;
  }
  if (key === "distanceKm") return `${v} km`;
  if (key === "durationMins") return `${v} mins`;
  return String(v);
}

export function formatRouteFacts(familyId: string, facts: RouteFacts): string {
  const lines = [`Route facts for family id=${familyId} (${facts.updatedAt ? `last saved ${facts.updatedAt}` : "never saved"}):`];
  for (const key of FACT_KEYS) lines.push(`- ${key}: ${show(key, facts)}`);
  return lines.join("\n");
}

export function registerRouteFactsTools(server: McpServer, ctx: ToolContext): void {
  const { config, http } = ctx;
  const env = config.env;
  const path = (familyId: string) => `/admin/route-families/${encodeURIComponent(familyId)}/facts`;

  server.registerTool(
    "get_route_facts",
    {
      title: "Get route facts",
      description:
        "Get a route family's route facts (start point, distance, walking time, stops, step-free, dogs, toilets, cover) as the marketing site's \"Route at a glance\" shows them. Null facts are hidden on the site.",
      inputSchema: routeFactsToolInputShapes.get_route_facts,
      outputSchema: routeFactsToolOutputShapes.get_route_facts,
      annotations: READ_ONLY,
    },
    ({ family_id }) =>
      guard(env, async () => {
        const { data } = await http.get<AdminRouteFactsResponse>(path(family_id));
        return okResult(env, formatRouteFacts(data.route_family_id, data.facts), { structured: { ...data } });
      }),
  );

  server.registerTool(
    "update_route_facts",
    {
      title: "Update route facts",
      description:
        "Change some of a route family's route facts; the ones you leave out keep their current value and null clears one (hides it on the site). Only enter facts someone has checked on the ground. The merged set is validated with the shared schema before anything is sent. Use dry_run first.",
      inputSchema: routeFactsToolInputShapes.update_route_facts,
      annotations: WRITE,
    },
    ({ family_id, dry_run, ...fields }) =>
      guard(env, async () => {
        const given = FACT_KEYS.filter((k) => fields[k] !== undefined);
        if (given.length === 0) {
          return errorResult(env, "Error: give at least one fact to change (null clears one). Nothing was sent.");
        }

        const { data } = await http.get<AdminRouteFactsResponse>(path(family_id));
        const { updatedAt: _updatedAt, ...current } = data.facts;
        const merged: Record<string, unknown> = { ...current };
        for (const key of given) merged[key] = fields[key];

        const parsed = routeFactsInputSchema.safeParse(merged);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ");
          return errorResult(env, `Error: invalid route facts — ${issues}. Nothing was sent.`);
        }
        const body = parsed.data;
        const changes = given.map((k) => `- ${k}: ${show(k, current)} → ${show(k, body)}`).join("\n");

        if (dry_run) {
          return okResult(
            env,
            `Dry run: nothing was sent. Would PUT ${path(family_id)} ${JSON.stringify(body)}\nChanges:\n${changes}`,
            { structured: { dry_run: true, method: "PUT", path: path(family_id), body } },
          );
        }

        const { data: saved } = await http.put<AdminRouteFactsResponse>(path(family_id), body);
        return okResult(env, `Updated route facts.\nChanges:\n${changes}\n${formatRouteFacts(saved.route_family_id, saved.facts)}`, {
          structured: { dry_run: false, ...saved },
        });
      }),
  );
}
