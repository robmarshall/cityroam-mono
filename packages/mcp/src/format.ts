import type {
  AdminMessageBankListResponse,
  AdminRouteDetailResponse,
  AdminRouteFamilyDetailResponse,
  AdminRouteFamilyListResponse,
  AdminRouteListResponse,
  RouteBlock,
} from "@cityroam/shared/types";
import type { Issue, LintResult } from "./lint/index.js";

/** Plain-text renderings of API responses, kept short for the model's context. */

export const BLOCK_PREVIEW_CHARS = 80;

/** Collapses whitespace and cuts to `max` chars (with an ellipsis). */
export function preview(text: string, max = BLOCK_PREVIEW_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The text a player sees for a block, whatever its type. */
export function blockText(block: Pick<RouteBlock, "type" | "config">): string {
  const config = block.config as unknown as Record<string, unknown>;
  const field =
    block.type === "message" ? config.content
    : block.type === "image" ? config.image_url
    : block.type === "question" ? config.clue
    : block.type === "action" ? config.label
    : block.type === "map" ? config.google_maps_link
    : undefined;
  return typeof field === "string" ? field : JSON.stringify(config);
}

function questionExtras(block: RouteBlock): string {
  if (block.type !== "question") return "";
  const config = block.config as unknown as { accepted_answers?: unknown[]; hints?: unknown[] };
  const answers = Array.isArray(config.accepted_answers) ? config.accepted_answers.length : 0;
  const hints = Array.isArray(config.hints) ? config.hints.length : 0;
  return ` (${answers} answers, ${hints} hints)`;
}

function routeHeader(route: AdminRouteDetailResponse["route"]): string {
  return (
    `Route "${route.name}" id=${route.id} [${route.language}] ${route.is_active ? "ACTIVE" : "inactive"}` +
    ` · ${route.total_stops} stops · ${route.estimated_duration_mins} min · ${route.estimated_distance_km} km`
  );
}

/**
 * One line per block: `pos type delay | first 80 chars  #block-id`, under a
 * header line per group with its name and id.
 */
export function formatRouteCompact(detail: AdminRouteDetailResponse): string {
  const { route, route_family: family, groups } = detail;
  const lines = [
    routeHeader(route),
    `Family "${family.name}" (${family.city}) id=${family.id}`,
    `${groups.length} groups, ${groups.reduce((n, g) => n + g.blocks.length, 0)} blocks`,
  ];
  if (route.description) lines.push(`Description: ${preview(route.description, 200)}`);
  for (const group of groups) {
    lines.push("", `Group ${group.position} "${group.name}" id=${group.id}`);
    if (group.blocks.length === 0) lines.push("  (no blocks)");
    for (const block of group.blocks) {
      lines.push(
        `  ${block.position} ${block.type} ${block.delay_ms}ms | ${preview(blockText(block))}${questionExtras(block)}  #${block.id}`,
      );
    }
  }
  return lines.join("\n");
}

/** Full detail: the header plus the complete JSON (every block config). */
export function formatRouteTree(detail: AdminRouteDetailResponse): string {
  return `${routeHeader(detail.route)}\n\n${JSON.stringify(detail, null, 2)}`;
}

export function formatRouteFamilies(families: AdminRouteFamilyListResponse["route_families"]): string {
  if (families.length === 0) return "No route families.";
  const lines = [`${families.length} route ${families.length === 1 ? "family" : "families"}:`];
  for (const f of families) {
    lines.push(`- "${f.name}" (${f.city}) id=${f.id}`);
    if (f.routes.length === 0) lines.push("    (no routes)");
    for (const r of f.routes) {
      lines.push(`    [${r.language}] ${r.is_active ? "ACTIVE  " : "inactive"} "${r.name}" id=${r.id}`);
    }
  }
  return lines.join("\n");
}

type RouteListItem = AdminRouteListResponse["routes"][number];

function routeLine(r: RouteListItem): string {
  return (
    `- [${r.language}] ${r.is_active ? "ACTIVE  " : "inactive"} "${r.name}" id=${r.id}` +
    ` · family=${r.route_family_id} · ${r.group_count} groups · ${r.total_stops} stops`
  );
}

export function formatRouteList(routes: RouteListItem[]): string {
  if (routes.length === 0) return "No routes match.";
  return [`${routes.length} route${routes.length === 1 ? "" : "s"}:`, ...routes.map(routeLine)].join("\n");
}

export function formatRouteFamily(detail: AdminRouteFamilyDetailResponse): string {
  const f = detail.route_family;
  const lines = [`Route family "${f.name}" (${f.city}) id=${f.id}`];
  lines.push(detail.routes.length === 0 ? "No routes." : `${detail.routes.length} route variant(s):`);
  lines.push(...detail.routes.map(routeLine));
  return lines.join("\n");
}

export function formatMessageBanks(entries: AdminMessageBankListResponse["message_banks"]): string {
  if (entries.length === 0) return "No message bank entries match.";
  const lines = [`${entries.length} message bank entr${entries.length === 1 ? "y" : "ies"}:`];
  for (const m of entries) {
    lines.push(`- ${m.type} [${m.language}]${m.is_active ? "" : " (inactive)"} id=${m.id}: ${preview(m.content, 300)}`);
  }
  return lines.join("\n");
}

function issueLine(issue: Issue): string {
  const block = issue.block_id ? ` (block ${issue.block_id})` : "";
  return `    - [${issue.rule}] ${issue.path || "(route)"}${block}: ${issue.message} — ${issue.citation}`;
}

function issueSection(title: string, issues: Issue[]): string[] {
  if (issues.length === 0) return [];
  const lines = [`${title} (${issues.length}):`];
  const byGroup = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = issue.group_name ? `Group "${issue.group_name}"` : "Route";
    const list = byGroup.get(key) ?? [];
    list.push(issue);
    byGroup.set(key, list);
  }
  for (const [group, list] of byGroup) {
    lines.push(`  ${group}:`, ...list.map(issueLine));
  }
  return lines;
}

export function formatLintResult(subject: string, result: LintResult): string {
  const { errors, warnings } = result;
  const verdict =
    errors.length === 0 && warnings.length === 0 ? "no issues"
    : `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`;
  const lines = [`Lint ${subject}: ${verdict}.`];
  if (errors.length > 0) lines.push("Errors mean the API would reject the route or players would see broken content.");
  lines.push(...issueSection("Errors", errors), ...issueSection("Warnings", warnings));
  return lines.join("\n");
}
