import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type {
  AdminImageUploadResponse,
  AdminRouteImageListResponse,
  AdminRouteImageResponse,
} from "@cityroam/shared/types";
import { routeImageKey } from "@cityroam/shared/utils";
import { routeImageSlugSchema } from "@cityroam/shared/validation";
import { z } from "zod";
import { ApiError, type FetchLike } from "../client/http.js";
import type { CityRoamEnv } from "../config.js";
import {
  ImageSourceError,
  MAX_IMAGE_BYTES,
  fetchImageUrl,
  formatBytes,
  readLocalImage,
  redactUrl,
  sniffImageType,
  type LoadedImage,
} from "../images/source.js";
import {
  MAX_SCANNED_ROUTES,
  collectImageRefs,
  describeScan,
  scanRoutes,
  type ImageUsage,
  type InvalidImageRef,
} from "../images/usage.js";
import { errorResult, guard, okResult } from "../result.js";
import type { ToolContext } from "./context.js";

/**
 * Image tools: `upload_image` (local file or URL → presigned S3 PUT) and
 * `list_image_slugs` (placeholder usage vs. what is uploaded). Input shapes
 * are plain wire shapes — no transforms or defaults; handlers validate.
 */

export interface ImageToolOptions {
  /**
   * fetch used for the presigned S3 PUT and for `source.url` downloads — both
   * go outside the admin API, so they do not use the API client. Injected for
   * tests; defaults to the global fetch.
   */
  fetchImpl?: FetchLike;
}

export const PRESIGNED_PUT_TIMEOUT_MS = 60_000;

export const imageToolInputShapes = {
  upload_image: {
    source: z
      .strictObject({
        path: z
          .string()
          .min(1)
          .optional()
          .describe("Absolute path to a local JPEG/PNG inside one of the CITYROAM_IMAGE_ROOTS folders"),
        url: z.string().min(1).optional().describe("http(s) URL of a JPEG/PNG to download (15 s timeout, 5 MB cap)"),
      })
      .describe("Where the image comes from: give exactly one of path or url"),
    slug: z
      .string()
      .optional()
      .describe(
        "Placeholder slug (lowercase kebab-case, e.g. leeds-town-hall-facade). Uploads to route-images/<slug>.jpg so every {{IMAGE:slug}} resolves to it. JPEG only. Omit for a one-off upload that returns an absolute URL.",
      ),
    filename: z.string().min(1).optional().describe("Upload filename; defaults to the source's file name"),
    overwrite: z
      .boolean()
      .optional()
      .describe(
        "Slug mode only: replace a photo that already exists (or might exist) for this slug. Default false. The new photo shows everywhere the slug is used.",
      ),
    dry_run: z
      .boolean()
      .optional()
      .describe("Run every check (file, type, size, slug, existing photo) but upload nothing"),
  },
  list_image_slugs: {
    route_id: z.string().min(1).optional().describe("Only this route"),
    family_id: z.string().min(1).optional().describe("Only the routes (language variants) in this route family"),
  },
} as const;

const usage = z.object({
  route_id: z.string(),
  route_name: z.string(),
  language: z.string(),
  group: z.string(),
  block_id: z.string(),
  field: z.enum(["image_block", "hint"]),
});

export const imageToolOutputShapes = {
  list_image_slugs: {
    used: z.array(
      z.object({
        slug: z.string(),
        uploaded: z.union([z.boolean(), z.literal("unknown")]),
        usages: z.array(usage),
      }),
    ),
    uploaded_unused: z.array(z.string()).describe("Uploaded slugs no scanned route uses"),
    invalid_refs: z.array(usage.extend({ value: z.string() })),
    scanned_routes: z.number(),
    truncated: z.boolean().describe("True when not every matching route was scanned"),
    uploaded_state: z.string().describe('"known", or why uploaded is "unknown"'),
  },
} as const;

const UPLOAD_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  // Only with overwrite: true can an existing photo be replaced; without it the tool refuses.
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const LIST_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

type Existence = { state: "exists" | "missing" | "unknown"; detail: string; url: string | null };

async function checkExistence(ctx: ToolContext, slug: string): Promise<Existence> {
  try {
    const { data } = await ctx.http.get<AdminRouteImageResponse>(`/admin/route-images/${encodeURIComponent(slug)}`);
    if (data.exists === true) {
      const when = data.last_modified ? `, uploaded ${data.last_modified}` : "";
      const size = typeof data.size === "number" ? ` (${formatBytes(data.size)}${when})` : "";
      return { state: "exists", detail: `a photo already exists at ${data.key}${size}`, url: data.url };
    }
    if (data.exists === false) return { state: "missing", detail: `no photo at ${data.key} yet`, url: data.url };
    return {
      state: "unknown",
      detail: `the API could not check whether ${data.key} exists (exists: null — usually a missing S3 permission), so it may exist`,
      url: data.url,
    };
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    return {
      state: "unknown",
      detail: `the existence check failed (${err.code}${err.status ? `, HTTP ${err.status}` : ""}: ${err.message}), so a photo may exist`,
      url: null,
    };
  }
}

/** "used by N routes (…)" for the overwrite refusal. Never throws. */
async function describeSlugUsage(ctx: ToolContext, slug: string): Promise<string> {
  try {
    const scan = await scanRoutes(ctx.http, {});
    const byRoute = new Map<string, { name: string; language: string; count: number }>();
    for (const detail of scan.details) {
      for (const u of collectImageRefs(detail).usages) {
        if (u.slug !== slug) continue;
        const entry = byRoute.get(u.route_id) ?? { name: u.route_name, language: u.language, count: 0 };
        entry.count++;
        byRoute.set(u.route_id, entry);
      }
    }
    const list = [...byRoute.entries()]
      .map(([id, r]) => `"${r.name}" [${r.language}] id=${id} (${r.count} reference${r.count === 1 ? "" : "s"})`)
      .join("; ");
    const scope = describeScan(scan);
    if (byRoute.size === 0) return `No route uses {{IMAGE:${slug}}} (${scope}).`;
    return `{{IMAGE:${slug}}} is used by ${byRoute.size} route${byRoute.size === 1 ? "" : "s"} — all would show the new photo: ${list} (${scope}).`;
  } catch (err) {
    return `Could not count the routes using this slug: ${err instanceof Error ? err.message : String(err)}.`;
  }
}

function envNote(env: CityRoamEnv): string {
  if (env === "local") return "This went to the local environment's bucket only.";
  const other = env === "staging" ? "production" : "staging";
  return `This went to the ${env} bucket only; ${other} has a separate bucket, so upload the photo there too before a route using it goes live on ${other}.`;
}

async function putToPresignedUrl(
  fetchImpl: FetchLike,
  uploadUrl: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<void> {
  let response: Response;
  try {
    // No Authorization header: the signature is in the URL, and S3 rejects a second auth mechanism.
    response = await fetchImpl(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: bytes as unknown as BodyInit,
      signal: AbortSignal.timeout(PRESIGNED_PUT_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const why =
      name === "TimeoutError" || name === "AbortError"
        ? `timed out after ${PRESIGNED_PUT_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new ImageSourceError(`Uploading to storage (${redactUrl(uploadUrl)}) failed: ${why}. Nothing was stored; try again.`);
  }
  if (!response.ok) {
    const text = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 300);
    throw new ImageSourceError(
      `Storage rejected the upload with HTTP ${response.status}${text ? `: ${text}` : ""}. Nothing was stored; the presigned URL lasts 5 minutes, so run upload_image again.`,
    );
  }
  await response.body?.cancel().catch(() => {});
}

function defaultFilename(loaded: LoadedImage, slug: string | undefined, type: string): string {
  const ext = type === "image/png" ? ".png" : ".jpg";
  if (slug) return `${slug}.jpg`;
  const name = loaded.filename.trim();
  return name || `image${ext}`;
}

type UploadArgs = {
  source: { path?: string; url?: string };
  slug?: string;
  filename?: string;
  overwrite?: boolean;
  dry_run?: boolean;
};

async function uploadImage(ctx: ToolContext, fetchImpl: FetchLike, args: UploadArgs): Promise<CallToolResult> {
  const env = ctx.config.env;
  const { source } = args;
  if ((source.path === undefined) === (source.url === undefined)) {
    return errorResult(env, "Error: source needs exactly one of path (a local file) or url (an http(s) link).");
  }

  let slug: string | undefined;
  if (args.slug !== undefined) {
    const parsed = routeImageSlugSchema.safeParse(args.slug);
    if (!parsed.success) {
      return errorResult(env, `Error: invalid slug "${args.slug}": ${parsed.error.issues.map((i) => i.message).join("; ")}.`);
    }
    slug = parsed.data;
  }

  let loaded: LoadedImage;
  try {
    loaded =
      source.path !== undefined
        ? await readLocalImage(source.path, ctx.config.imageRoots)
        : await fetchImageUrl(source.url!, fetchImpl);
  } catch (err) {
    if (err instanceof ImageSourceError) return errorResult(env, `Error: ${err.message}`);
    throw err;
  }

  const { bytes } = loaded;
  if (bytes.length > MAX_IMAGE_BYTES) {
    return errorResult(env, `Error: ${loaded.origin} is larger than the 5 MB upload limit (${formatBytes(bytes.length)}).`);
  }
  const contentType = sniffImageType(bytes);
  if (!contentType) {
    const head = Array.from(bytes.slice(0, 4), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    return errorResult(
      env,
      `Error: ${loaded.origin} is not a JPEG or PNG image (it starts with ${head || "nothing"}; JPEG starts FF D8 FF, PNG 89 50 4E 47). A file extension alone does not make it an image.`,
    );
  }
  if (slug && contentType !== "image/jpeg") {
    return errorResult(
      env,
      `Error: ${loaded.origin} is a PNG, but slug photos must be JPEG (they are stored as route-images/${slug}.jpg). Convert it first, e.g. \`magick in.png -quality 85 out.jpg\` or \`ffmpeg -i in.png out.jpg\`, or omit slug for a one-off upload.`,
    );
  }

  const filename = args.filename?.trim() || defaultFilename(loaded, slug, contentType);
  const kind = contentType === "image/png" ? "PNG" : "JPEG";
  const size = formatBytes(bytes.length);

  let existence: Existence | undefined;
  if (slug) {
    existence = await checkExistence(ctx, slug);
    if (existence.state !== "missing" && args.overwrite !== true) {
      const usageText = await describeSlugUsage(ctx, slug);
      return errorResult(
        env,
        `Error: refusing to upload to {{IMAGE:${slug}}}: ${existence.detail}. ${usageText} ` +
          "Pass overwrite: true to replace it (after confirming with the user), or pick a different slug.",
      );
    }
  }

  const body: { filename: string; content_type: string; slug?: string } = { filename, content_type: contentType };
  if (slug) body.slug = slug;

  if (args.dry_run) {
    const lines = [
      `Dry run: nothing was uploaded. ${kind}, ${size}, from ${loaded.origin}.`,
      slug
        ? `Target: route-images/${slug}.jpg — ${existence!.detail}${existence!.state !== "missing" ? " (would be overwritten: overwrite is true)" : ""}.`
        : "Target: a one-off key under uploads/ (returns an absolute URL).",
      `Would send POST /admin/upload ${JSON.stringify(body)}, then PUT ${bytes.length} bytes with Content-Type ${contentType} to the presigned URL.`,
    ];
    return okResult(env, lines.join("\n"), {
      structured: {
        dry_run: true,
        content_type: contentType,
        bytes: bytes.length,
        request: body,
        ...(slug ? { slug, placeholder: `{{IMAGE:${slug}}}`, key: routeImageKey(slug), existing: existence!.state } : {}),
      },
    });
  }

  const { data: upload } = await ctx.http.post<AdminImageUploadResponse>("/admin/upload", body);
  try {
    await putToPresignedUrl(fetchImpl, upload.upload_url, contentType, bytes);
  } catch (err) {
    if (err instanceof ImageSourceError) return errorResult(env, `Error: ${err.message}`);
    throw err;
  }

  const overwrote = existence !== undefined && existence.state !== "missing";
  const lines: string[] = [];
  let imageUrl: string | null;
  if (slug) {
    imageUrl = upload.placeholder ?? `{{IMAGE:${slug}}}`;
    lines.push(`Uploaded ${kind} (${size}) to ${upload.key}.`);
    lines.push(`Use image_url "${imageUrl}" in image blocks and hints; blocks already using it pick the photo up with no edit.`);
    lines.push(upload.url ? `CDN URL: ${upload.url}` : "No CDN URL: this environment has no CDN base configured.");
    if (overwrote) {
      lines.push(
        `${existence!.state === "exists" ? "This replaced the previous photo" : "This replaced any previous photo at that key"}. The CDN may keep serving the old image until its cache expires.`,
      );
    }
  } else {
    imageUrl = upload.url;
    lines.push(`Uploaded ${kind} (${size}) to ${upload.key}.`);
    lines.push(
      imageUrl
        ? `Use image_url "${imageUrl}" (absolute URL) on the block or hint.`
        : "Warning: the API returned no URL for this upload; do not store the raw key as an image_url.",
    );
  }
  lines.push(envNote(env));

  return okResult(env, lines.join("\n"), {
    structured: {
      dry_run: false,
      image_url: imageUrl,
      url: upload.url,
      key: upload.key,
      content_type: contentType,
      bytes: bytes.length,
      overwrote,
      ...(slug ? { slug, placeholder: imageUrl } : {}),
    },
  });
}

type UsedSlug = { slug: string; uploaded: boolean | "unknown"; usages: ImageUsage[] };

async function listImageSlugs(ctx: ToolContext, args: { route_id?: string; family_id?: string }): Promise<CallToolResult> {
  const env = ctx.config.env;
  if (args.route_id !== undefined && args.family_id !== undefined) {
    return errorResult(env, "Error: give route_id or family_id, not both (or neither for every route).");
  }

  const scan = await scanRoutes(ctx.http, args);
  if (args.family_id !== undefined && scan.matched === 0) {
    return errorResult(env, `Error: no routes found in family ${args.family_id}.`);
  }

  const bySlug = new Map<string, ImageUsage[]>();
  const invalid: InvalidImageRef[] = [];
  for (const detail of scan.details) {
    const refs = collectImageRefs(detail);
    for (const { slug, ...u } of refs.usages) {
      const list = bySlug.get(slug) ?? [];
      list.push(u);
      bySlug.set(slug, list);
    }
    invalid.push(...refs.invalid);
  }

  let uploaded: Set<string> | undefined;
  let listingTruncated = false;
  let uploadedState = "known";
  try {
    const { data } = await ctx.http.get<AdminRouteImageListResponse>("/admin/route-images");
    uploaded = new Set(data.images.map((i) => i.slug));
    listingTruncated = data.truncated;
    if (listingTruncated) {
      uploadedState =
        "the bucket listing was truncated, so slugs missing from it are reported as unknown rather than not uploaded";
    }
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    uploadedState =
      `GET /admin/route-images failed (${err.code}${err.status ? `, HTTP ${err.status}` : ""}: ${err.message}); ` +
      "the API's S3 user probably lacks s3:ListBucket, or the key lacks images:read";
  }

  const used: UsedSlug[] = [...bySlug.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([slug, usages]) => ({
      slug,
      uploaded: uploaded === undefined ? "unknown" : uploaded.has(slug) ? true : listingTruncated ? "unknown" : false,
      usages,
    }));
  const uploadedUnused = uploaded ? [...uploaded].filter((s) => !bySlug.has(s)).sort() : [];

  const scope =
    args.route_id !== undefined
      ? `route ${args.route_id}`
      : args.family_id !== undefined
        ? `family ${args.family_id}`
        : "all routes";
  const lines = [`Image placeholders in ${scope}: ${describeScan(scan)}.`];
  if (uploadedState !== "known") lines.push(`Uploaded state unknown for some slugs: ${uploadedState}.`);
  if (used.length === 0) lines.push("No {{IMAGE:slug}} placeholders are used.");
  const mark = (u: UsedSlug["uploaded"]) => (u === true ? "uploaded" : u === false ? "NOT UPLOADED" : "upload unknown");
  for (const s of used) {
    lines.push(`- ${s.slug}: ${mark(s.uploaded)}, ${s.usages.length} usage${s.usages.length === 1 ? "" : "s"}`);
    for (const u of s.usages) {
      lines.push(`    "${u.route_name}" [${u.language}] group "${u.group}" ${u.field === "hint" ? "hint" : "image block"} #${u.block_id}`);
    }
  }
  if (uploaded) {
    lines.push(
      uploadedUnused.length
        ? `Uploaded but not used by the scanned routes: ${uploadedUnused.join(", ")}`
        : "Every uploaded slug is used by the scanned routes.",
    );
  }
  if (invalid.length) {
    lines.push(`Invalid image references (neither an http(s) URL nor {{IMAGE:slug}}):`);
    for (const r of invalid) {
      lines.push(`    ${JSON.stringify(r.value)} in "${r.route_name}" [${r.language}] group "${r.group}" #${r.block_id} (${r.field})`);
    }
  }

  return okResult(env, lines.join("\n"), {
    structured: {
      used,
      uploaded_unused: uploadedUnused,
      invalid_refs: invalid,
      scanned_routes: scan.details.length,
      truncated: scan.truncated || scan.failed.length > 0,
      uploaded_state: uploadedState,
    },
  });
}

export function registerImageTools(server: McpServer, ctx: ToolContext, options: ImageToolOptions = {}): void {
  const env = ctx.config.env;
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));

  server.registerTool(
    "upload_image",
    {
      title: "Upload image",
      description:
        "Upload a JPEG/PNG (≤ 5 MB) from a local file inside CITYROAM_IMAGE_ROOTS or an http(s) URL. With slug, it becomes the photo for every {{IMAGE:slug}} placeholder (JPEG only) and the result gives the placeholder; without slug it is a one-off upload and the result gives an absolute URL. Refuses to replace an existing (or possibly existing) slug photo unless overwrite is true. Staging and production have separate buckets. dry_run runs every check without uploading.",
      inputSchema: imageToolInputShapes.upload_image,
      annotations: UPLOAD_ANNOTATIONS,
    },
    (args) => guard(env, () => uploadImage(ctx, fetchImpl, args)),
  );

  server.registerTool(
    "list_image_slugs",
    {
      title: "List image slugs",
      description: `List the {{IMAGE:slug}} placeholders used by one route, a route family, or every route (at most ${MAX_SCANNED_ROUTES} routes, newest first), with whether each slug has a photo uploaded in this environment, where each is used, uploaded slugs nothing uses, and invalid image references.`,
      inputSchema: imageToolInputShapes.list_image_slugs,
      outputSchema: imageToolOutputShapes.list_image_slugs,
      annotations: LIST_ANNOTATIONS,
    },
    (args) => guard(env, () => listImageSlugs(ctx, args)),
  );
}
