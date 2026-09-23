/**
 * Bring both accepted input shapes to one loose model:
 *
 * - the bulk-create payload (`POST /admin/routes/bulk-groups` body:
 *   `{ route, groups: [{ name, blocks: [{ type, config, delay_ms }] }] }`), and
 * - the stored route (`GET /admin/routes/:id`, `AdminRouteDetailResponse`:
 *   `{ route: { id, … }, route_family, groups: [{ id, name, blocks: [{ id, … }] }] }`).
 *
 * The model is deliberately untyped at the leaves: the linter must report on
 * payloads that fail the schema, so rules read fields defensively.
 */

export type Obj = Record<string, unknown>;

export function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface NBlock {
  id?: string;
  type: unknown;
  config: Obj | undefined;
  delay_ms: unknown;
}

export interface NGroup {
  id?: string;
  name?: string;
  blocks: NBlock[];
}

export interface NormalizedRoute {
  shape: "bulk" | "admin";
  route: Obj | undefined;
  groups: NGroup[];
  /** What the shared bulk-create schema is run against. */
  payload: unknown;
}

function isAdminShape(input: Obj): boolean {
  return (
    "route_family" in input ||
    (isObj(input.route) && typeof input.route.id === "string")
  );
}

function toBlock(raw: unknown): NBlock {
  if (!isObj(raw)) return { type: undefined, config: undefined, delay_ms: undefined };
  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    type: raw.type,
    config: isObj(raw.config) ? raw.config : undefined,
    delay_ms: raw.delay_ms,
  };
}

function toGroup(raw: unknown): NGroup {
  if (!isObj(raw)) return { blocks: [] };
  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    name: typeof raw.name === "string" ? raw.name : undefined,
    blocks: Array.isArray(raw.blocks) ? raw.blocks.map(toBlock) : [],
  };
}

export function normalize(input: unknown): NormalizedRoute {
  if (!isObj(input)) {
    return { shape: "bulk", route: undefined, groups: [], payload: input };
  }

  const groups = Array.isArray(input.groups) ? input.groups.map(toGroup) : [];

  if (!isAdminShape(input)) {
    return {
      shape: "bulk",
      route: isObj(input.route) ? input.route : undefined,
      groups,
      payload: input,
    };
  }

  // Stored route: keep only the fields routeSchema / routeBlockSchema know, so
  // server-managed ones (id, total_stops, timestamps, group_id) don't matter.
  const r = isObj(input.route) ? input.route : {};
  const route: Obj = {
    name: r.name,
    description: r.description ?? undefined,
    language: r.language,
    route_family_id: r.route_family_id,
    estimated_duration_mins: r.estimated_duration_mins,
    estimated_distance_km: r.estimated_distance_km,
    is_active: r.is_active,
  };
  const family = isObj(input.route_family) ? input.route_family : undefined;
  if (family && typeof family.city === "string") route.city = family.city;

  const rawGroups = Array.isArray(input.groups) ? input.groups : [];
  const payload = {
    route,
    groups: rawGroups.map((g) => {
      if (!isObj(g)) return g;
      return {
        name: g.name,
        blocks: Array.isArray(g.blocks)
          ? g.blocks.map((b) =>
              isObj(b)
                ? { position: b.position, type: b.type, config: b.config, delay_ms: b.delay_ms }
                : b,
            )
          : g.blocks,
      };
    }),
  };

  return { shape: "admin", route, groups, payload };
}
