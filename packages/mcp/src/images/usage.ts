import type { AdminRouteDetailResponse, AdminRouteListResponse } from "@cityroam/shared/types";
import { isAbsoluteHttpUrl, parseImagePlaceholder } from "@cityroam/shared/utils";
import { ApiError, type HttpClient } from "../client/http.js";

/**
 * Where `{{IMAGE:slug}}` placeholders are used across stored routes. Image
 * references live in two places (the same ones the linter checks): an image
 * block's `image_url` and each hint item's `image_url`.
 */

/** Most routes a single scan fetches in detail; beyond this the result says it is partial. */
export const MAX_SCANNED_ROUTES = 50;
const SCAN_CONCURRENCY = 4;

export type ImageRefField = "image_block" | "hint";

export interface ImageUsage {
  route_id: string;
  route_name: string;
  language: string;
  group: string;
  block_id: string;
  field: ImageRefField;
}

export interface InvalidImageRef extends ImageUsage {
  value: string;
}

export interface RouteImageRefs {
  usages: Array<ImageUsage & { slug: string }>;
  /** Values that are neither an absolute http(s) URL nor a well-formed placeholder. */
  invalid: InvalidImageRef[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every image reference in a stored route, split into placeholder usages and invalid values. */
export function collectImageRefs(detail: AdminRouteDetailResponse): RouteImageRefs {
  const out: RouteImageRefs = { usages: [], invalid: [] };
  const { route } = detail;
  for (const group of detail.groups ?? []) {
    for (const block of group.blocks ?? []) {
      const base = {
        route_id: route.id,
        route_name: route.name,
        language: route.language,
        group: group.name,
        block_id: block.id,
      };
      const visit = (value: unknown, field: ImageRefField) => {
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (trimmed === "") return;
        const slug = parseImagePlaceholder(trimmed);
        if (slug) out.usages.push({ ...base, field, slug });
        else if (!isAbsoluteHttpUrl(trimmed)) out.invalid.push({ ...base, field, value });
      };
      const config: unknown = block.config;
      if (!isObj(config)) continue;
      if (config.type === "image") visit(config.image_url, "image_block");
      if (Array.isArray(config.hints)) {
        for (const hint of config.hints) {
          if (!Array.isArray(hint)) continue;
          for (const item of hint) if (isObj(item)) visit(item.image_url, "hint");
        }
      }
    }
  }
  return out;
}

export interface RouteScan {
  details: AdminRouteDetailResponse[];
  /** Routes matching the selection before the cap. */
  matched: number;
  /** True when more routes matched than MAX_SCANNED_ROUTES, so only the first were read. */
  truncated: boolean;
  /** Routes whose detail GET failed. */
  failed: Array<{ route_id: string; error: string }>;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.code}${err.status ? ` (HTTP ${err.status})` : ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Reads the selected routes in detail: one route, the routes of a family, or
 * every route (newest first, as `GET /admin/routes` orders them), capped.
 */
export async function scanRoutes(
  http: HttpClient,
  selection: { route_id?: string; family_id?: string },
  cap = MAX_SCANNED_ROUTES,
): Promise<RouteScan> {
  if (selection.route_id !== undefined) {
    // A missing route is a caller error, so let it throw.
    const { data } = await http.get<AdminRouteDetailResponse>(`/admin/routes/${encodeURIComponent(selection.route_id)}`);
    return { details: [data], matched: 1, truncated: false, failed: [] };
  }

  const { data } = await http.get<AdminRouteListResponse>("/admin/routes");
  const matching = data.routes.filter(
    (r) => selection.family_id === undefined || r.route_family_id === selection.family_id,
  );
  const selected = matching.slice(0, cap);

  const details: Array<AdminRouteDetailResponse | undefined> = new Array(selected.length);
  const failed: RouteScan["failed"] = [];
  let next = 0;
  const worker = async () => {
    while (next < selected.length) {
      const index = next++;
      const id = selected[index].id;
      try {
        details[index] = (await http.get<AdminRouteDetailResponse>(`/admin/routes/${encodeURIComponent(id)}`)).data;
      } catch (err) {
        failed.push({ route_id: id, error: describeError(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, selected.length) }, worker));

  return {
    details: details.filter((d): d is AdminRouteDetailResponse => d !== undefined),
    matched: matching.length,
    truncated: matching.length > selected.length,
    failed,
  };
}

/** One-line summary of what a scan covered, for tool text. */
export function describeScan(scan: RouteScan): string {
  const parts = [`scanned ${scan.details.length} route${scan.details.length === 1 ? "" : "s"}`];
  if (scan.truncated) {
    parts.push(`only the newest ${scan.details.length + scan.failed.length} of ${scan.matched} were read (scan cap), so the counts may be incomplete`);
  }
  if (scan.failed.length > 0) {
    parts.push(`${scan.failed.length} could not be read (${scan.failed.map((f) => `${f.route_id}: ${f.error}`).join("; ")})`);
  }
  return parts.join("; ");
}
