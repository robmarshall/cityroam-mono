import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { SUPPORTED_LANGUAGES } from "@cityroam/shared/constants";
import type {
  AdminMessageBankListResponse,
  AdminRouteDetailResponse,
  AdminRouteFamilyDetailResponse,
  AdminRouteFamilyListResponse,
  AdminRouteListResponse,
  SupportedLanguage,
} from "@cityroam/shared/types";
import { messageBankSchema } from "@cityroam/shared/validation";
import { z } from "zod";
import {
  formatLintResult,
  formatMessageBanks,
  formatRouteCompact,
  formatRouteFamilies,
  formatRouteFamily,
  formatRouteList,
  formatRouteTree,
} from "../format.js";
import { lintRoute } from "../lint/index.js";
import { errorResult, guard, okResult } from "../result.js";
import type { ToolContext } from "./context.js";

/**
 * Read-only tools. Input shapes are plain wire shapes — no transforms,
 * preprocessors or defaults — because MCP clients render and validate the
 * generated JSON Schema literally. Defaults are applied in the handlers.
 */

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const languageEnum = z.enum(SUPPORTED_LANGUAGES as [SupportedLanguage, ...SupportedLanguage[]]);
const messageBankTypeEnum = z.enum(messageBankSchema.shape.type.options);
const id = (what: string) => z.string().min(1).describe(`${what} id (uuid)`);

export const readToolInputShapes = {
  list_route_families: {
    city: z.string().optional().describe("Only families in this city (case-insensitive exact match)"),
  },
  get_route_family: {
    family_id: id("Route family"),
  },
  list_routes: {
    family_id: z.string().optional().describe("Only routes in this route family"),
    language: languageEnum.optional().describe("Only routes in this language"),
    is_active: z.boolean().optional().describe("Only active (true) or inactive (false) routes"),
  },
  get_route: {
    route_id: id("Route"),
    format: z
      .enum(["compact", "tree"])
      .optional()
      .describe('"compact" (default): one line per block with ids. "tree": full JSON including every block config.'),
  },
  list_message_banks: {
    type: messageBankTypeEnum.optional().describe("Only entries of this message bank type"),
    language: languageEnum.optional().describe("Only entries in this language"),
  },
  validate_route: {
    route_id: z.string().optional().describe("Lint the stored route with this id. Give exactly one of route_id or payload."),
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Lint an unsaved route: the POST /admin/routes/bulk-groups body ({ route, groups }). Give exactly one of route_id or payload."),
  },
} as const;

const routeSummary = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string(),
  route_family_id: z.string(),
  is_active: z.boolean(),
  group_count: z.number(),
  total_stops: z.number(),
});

const family = z.object({ id: z.string(), name: z.string(), city: z.string() });

const issue = z.object({
  rule: z.string(),
  message: z.string(),
  path: z.string(),
  group_name: z.string().optional(),
  block_id: z.string().optional(),
  citation: z.string(),
});

export const readToolOutputShapes = {
  list_route_families: {
    route_families: z.array(
      family.extend({
        routes: z.array(z.object({ id: z.string(), language: z.string(), name: z.string(), is_active: z.boolean() })),
      }),
    ),
  },
  get_route_family: {
    route_family: family,
    routes: z.array(routeSummary),
  },
  list_routes: {
    routes: z.array(routeSummary),
  },
  list_message_banks: {
    message_banks: z.array(
      z.object({ id: z.string(), type: z.string(), language: z.string(), content: z.string(), is_active: z.boolean() }),
    ),
  },
  validate_route: {
    valid: z.boolean().describe("True when there are no errors (warnings allowed)"),
    errors: z.array(issue),
    warnings: z.array(issue),
  },
} as const;

export function registerReadTools(server: McpServer, ctx: ToolContext): void {
  const { config, http } = ctx;
  const env = config.env;

  server.registerTool(
    "list_route_families",
    {
      title: "List route families",
      description:
        "List route families (one per city route) with their language variants and ids. A family groups the translations of one route.",
      inputSchema: readToolInputShapes.list_route_families,
      outputSchema: readToolOutputShapes.list_route_families,
      annotations: READ_ONLY,
    },
    ({ city }) =>
      guard(env, async () => {
        const { data } = await http.get<AdminRouteFamilyListResponse>("/admin/route-families");
        const wanted = city?.trim().toLowerCase();
        const families = wanted
          ? data.route_families.filter((f) => f.city.trim().toLowerCase() === wanted)
          : data.route_families;
        return okResult(env, formatRouteFamilies(families), { structured: { route_families: families } });
      }),
  );

  server.registerTool(
    "get_route_family",
    {
      title: "Get route family",
      description: "Get one route family and all of its route variants (languages, active flag, group counts).",
      inputSchema: readToolInputShapes.get_route_family,
      outputSchema: readToolOutputShapes.get_route_family,
      annotations: READ_ONLY,
    },
    ({ family_id }) =>
      guard(env, async () => {
        const { data } = await http.get<AdminRouteFamilyDetailResponse>(
          `/admin/route-families/${encodeURIComponent(family_id)}`,
        );
        return okResult(env, formatRouteFamily(data), { structured: { ...data } });
      }),
  );

  server.registerTool(
    "list_routes",
    {
      title: "List routes",
      description: "List routes (newest first) with language, active flag, family id and group count. Filters are optional.",
      inputSchema: readToolInputShapes.list_routes,
      outputSchema: readToolOutputShapes.list_routes,
      annotations: READ_ONLY,
    },
    ({ family_id, language, is_active }) =>
      guard(env, async () => {
        const { data } = await http.get<AdminRouteListResponse>("/admin/routes");
        const routes = data.routes.filter(
          (r) =>
            (family_id === undefined || r.route_family_id === family_id) &&
            (language === undefined || r.language === language) &&
            (is_active === undefined || r.is_active === is_active),
        );
        return okResult(env, formatRouteList(routes), { structured: { routes } });
      }),
  );

  server.registerTool(
    "get_route",
    {
      title: "Get route",
      description:
        'Get a route with its groups and blocks. format "compact" (default) shows one line per block (position, type, delay, first 80 chars, block id); "tree" returns the full JSON with every block config.',
      inputSchema: readToolInputShapes.get_route,
      annotations: READ_ONLY,
    },
    ({ route_id, format }) =>
      guard(env, async () => {
        const { data } = await http.get<AdminRouteDetailResponse>(`/admin/routes/${encodeURIComponent(route_id)}`);
        return okResult(env, (format ?? "compact") === "tree" ? formatRouteTree(data) : formatRouteCompact(data));
      }),
  );

  server.registerTool(
    "list_message_banks",
    {
      title: "List message banks",
      description:
        "List guide message bank entries (success, failure, hint-offer, …), optionally filtered by type and language.",
      inputSchema: readToolInputShapes.list_message_banks,
      outputSchema: readToolOutputShapes.list_message_banks,
      annotations: READ_ONLY,
    },
    ({ type, language }) =>
      guard(env, async () => {
        const { data } = await http.get<AdminMessageBankListResponse>("/admin/message-banks", { type, language });
        // The API ignores `language` until the Phase 4 fix ships, so filter here too.
        const entries = data.message_banks.filter(
          (m) => (type === undefined || m.type === type) && (language === undefined || m.language === language),
        );
        return okResult(env, formatMessageBanks(entries), { structured: { message_banks: entries } });
      }),
  );

  server.registerTool(
    "validate_route",
    {
      title: "Validate route",
      description:
        "Lint a route against the shared schemas and the content guide, without changing anything. Give route_id to lint a stored route, or payload (a bulk-groups body) to lint a draft before creating it. Errors block creation; warnings are content-guide advice.",
      inputSchema: readToolInputShapes.validate_route,
      outputSchema: readToolOutputShapes.validate_route,
      annotations: READ_ONLY,
    },
    ({ route_id, payload }) =>
      guard(env, async () => {
        if ((route_id === undefined) === (payload === undefined)) {
          return errorResult(env, "Error: give exactly one of route_id (a stored route) or payload (a draft route).");
        }
        let input: unknown = payload;
        let subject = "draft route";
        if (route_id !== undefined) {
          const { data } = await http.get<AdminRouteDetailResponse>(`/admin/routes/${encodeURIComponent(route_id)}`);
          input = data;
          subject = `route "${data.route.name}" id=${data.route.id}`;
        }
        const result = lintRoute(input);
        return okResult(env, formatLintResult(subject, result), {
          structured: { valid: result.errors.length === 0, errors: result.errors, warnings: result.warnings },
        });
      }),
  );
}
