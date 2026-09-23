import { promises as fs } from "node:fs";
import path from "node:path";
import type { FetchLike } from "../client/http.js";

/**
 * Loading image bytes for `upload_image`, from a local file inside one of the
 * configured image roots or from an http(s) URL. Every failure is an
 * `ImageSourceError` whose message the model can act on.
 */

/** Same limit as the admin upload (shared `imageUploadSchema`). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const URL_FETCH_TIMEOUT_MS = 15_000;

export type ImageContentType = "image/jpeg" | "image/png";
const ALLOWED_CONTENT_TYPES: readonly string[] = ["image/jpeg", "image/png"];

export class ImageSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageSourceError";
  }
}

export interface LoadedImage {
  bytes: Uint8Array;
  /** Default upload filename (basename of the file or URL path). */
  filename: string;
  /** Where the bytes came from, for messages (real path or URL). */
  origin: string;
}

/** JPEG starts FF D8 FF, PNG starts 89 50 4E 47. Anything else: null. */
export function sniffImageType(bytes: Uint8Array): ImageContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  return null;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} bytes`;
}

const tooLarge = (what: string, size?: number) =>
  new ImageSourceError(
    `${what} is larger than the 5 MB upload limit${size !== undefined ? ` (${formatBytes(size)})` : ""}. ` +
      "Resize or recompress it (e.g. 2000px on the long edge, JPEG quality 80–85) and try again.",
  );

/** True when `target` is `root` itself or below it. Both must be real (resolved) paths. */
export function isInsideRoot(root: string, target: string): boolean {
  // win32 path.relative compares case-insensitively.
  const rel = path.relative(root, target);
  if (rel === "") return false;
  if (path.isAbsolute(rel)) return false; // different drive on Windows
  return rel !== ".." && !rel.startsWith(`..${path.sep}`);
}

function errCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : undefined;
}

/**
 * Reads a local image. The path (after resolving symlinks with realpath) must
 * lie inside one of `roots`, also realpath-resolved, so neither `..` segments
 * nor a symlink pointing out of a root can reach other files.
 */
export async function readLocalImage(inputPath: string, roots: readonly string[]): Promise<LoadedImage> {
  if (roots.length === 0) {
    throw new ImageSourceError(
      "Local file uploads are disabled: no image folders are configured. Set CITYROAM_IMAGE_ROOTS in the MCP server's " +
        `environment to the folder(s) holding route photos (separate several with "${path.delimiter}") and restart the ` +
        "server, or pass source.url with an http(s) link instead.",
    );
  }
  if (!path.isAbsolute(inputPath)) {
    throw new ImageSourceError(
      `source.path must be an absolute path (got "${inputPath}"). Allowed folders: ${roots.join(", ")}`,
    );
  }

  let realFile: string;
  try {
    realFile = await fs.realpath(inputPath);
  } catch (err) {
    const code = errCode(err);
    if (code === "ENOENT" || code === "ENOTDIR") throw new ImageSourceError(`No such file: ${inputPath}`);
    throw new ImageSourceError(`Cannot read ${inputPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let inside = false;
  for (const root of roots) {
    let realRoot: string;
    try {
      realRoot = await fs.realpath(root);
    } catch {
      continue; // a missing root allows nothing
    }
    if (isInsideRoot(realRoot, realFile)) {
      inside = true;
      break;
    }
  }
  if (!inside) {
    const resolvedNote = path.resolve(inputPath) !== realFile ? ` (resolves to ${realFile})` : "";
    throw new ImageSourceError(
      `Refusing to read ${inputPath}${resolvedNote}: it is outside the allowed image folders (CITYROAM_IMAGE_ROOTS: ` +
        `${roots.join(", ")}). Copy the photo into one of them, or add its folder to CITYROAM_IMAGE_ROOTS and restart.`,
    );
  }

  const stat = await fs.stat(realFile);
  if (!stat.isFile()) throw new ImageSourceError(`${inputPath} is not a regular file.`);
  if (stat.size === 0) throw new ImageSourceError(`${inputPath} is empty.`);
  if (stat.size > MAX_IMAGE_BYTES) throw tooLarge(inputPath, stat.size);

  const bytes = new Uint8Array(await fs.readFile(realFile));
  if (bytes.length > MAX_IMAGE_BYTES) throw tooLarge(inputPath, bytes.length);
  return { bytes, filename: path.basename(realFile), origin: realFile };
}

/** Origin + path only: signed query strings never reach messages. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "(invalid URL)";
  }
}

function isTimeout(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * Downloads an image over http(s): 15 s overall timeout (headers and body),
 * JPEG/PNG content type, streamed with a hard 5 MB cap.
 */
export async function fetchImageUrl(
  rawUrl: string,
  fetchImpl: FetchLike,
  options: { timeoutMs?: number } = {},
): Promise<LoadedImage> {
  const timeoutMs = options.timeoutMs ?? URL_FETCH_TIMEOUT_MS;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ImageSourceError(`source.url is not a valid URL: "${rawUrl}".`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ImageSourceError(`source.url must be an http(s) URL (got "${url.protocol}").`);
  }
  const shown = redactUrl(url.href);

  let response: Response;
  try {
    response = await fetchImpl(url.href, {
      method: "GET",
      headers: { Accept: "image/jpeg, image/png" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (isTimeout(err)) throw new ImageSourceError(`Downloading ${shown} timed out after ${timeoutMs / 1000}s.`);
    throw new ImageSourceError(`Could not download ${shown}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const discard = () => response.body?.cancel().catch(() => {});
  if (!response.ok) {
    await discard();
    throw new ImageSourceError(`Downloading ${shown} failed with HTTP ${response.status}.`);
  }

  const contentType = (response.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    await discard();
    throw new ImageSourceError(
      `${shown} is not served as an image (Content-Type "${contentType || "none"}"); only image/jpeg and image/png ` +
        "are accepted. Link directly to the image file, not to a web page showing it.",
    );
  }

  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    await discard();
    throw tooLarge(shown, declared);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel().catch(() => {});
          throw tooLarge(shown);
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    if (err instanceof ImageSourceError) throw err;
    if (isTimeout(err)) throw new ImageSourceError(`Downloading ${shown} timed out after ${timeoutMs / 1000}s.`);
    throw new ImageSourceError(`Download of ${shown} failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (bytes.length === 0) throw new ImageSourceError(`${shown} returned an empty body.`);

  let filename = "";
  try {
    filename = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  } catch {
    filename = url.pathname.split("/").pop() ?? "";
  }
  return { bytes, filename, origin: shown };
}
