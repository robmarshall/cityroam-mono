import { useEffect, useRef, useState } from "react";
import type {
  AdminImageUploadResponse,
  AdminRouteImageResponse,
} from "@cityroam/shared/types";
import {
  imageUploadSchema,
  routeImageSlugSchema,
} from "@cityroam/shared/validation";
import { parseImagePlaceholder } from "@cityroam/shared/utils";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";

type AuthFetch = ReturnType<typeof useAuthFetch>;

const BTN_SMALL =
  "whitespace-nowrap rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

/** Checks a file is an acceptable upload; slug photos must be JPEG. */
function validateFile(file: File, requireJpeg: boolean): string | null {
  const result = imageUploadSchema.safeParse({
    type: file.type,
    size: file.size,
    filename: file.name,
  });
  if (!result.success) return result.error.issues[0]?.message ?? "Invalid image";
  if (requireJpeg && file.type !== "image/jpeg") {
    return "Slug photos must be JPEG (they are stored as <slug>.jpg)";
  }
  return null;
}

function replaceWarning(slug: string): string {
  return (
    `Upload this photo for {{IMAGE:${slug}}}?\n\n` +
    `It replaces any existing photo for "${slug}" everywhere it is used: ` +
    `every block, hint and language version of every route that references ` +
    `this slug. The CDN may keep serving the old photo for a while.`
  );
}

/**
 * Requests a pre-signed URL and PUTs the file to S3. With `slug` the object
 * lands at the fixed key `{{IMAGE:slug}}` resolves to; without, it is a one-off.
 */
export async function uploadRouteImage(
  authFetch: AuthFetch,
  file: File,
  slug?: string,
): Promise<AdminImageUploadResponse> {
  const presigned = await authFetch(() =>
    api.post<AdminImageUploadResponse>("/admin/upload", {
      filename: file.name,
      content_type: file.type,
      ...(slug ? { slug } : {}),
    }),
  );
  const put = await fetch(presigned.upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error("Failed to upload image to storage");
  return presigned;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof Error) return err.message || fallback;
  return fallback;
}

/** Suggests a slug from a filename: "IMG Town_Hall.JPG" -> "img-town-hall". */
function slugFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/**
 * An image preview that degrades to a grey tile instead of a broken image —
 * the normal state for a placeholder whose photo has not been uploaded yet.
 */
export function ImagePreview({
  src,
  fallbackLabel = "Image not uploaded yet",
  className = "h-24 w-36",
}: {
  src: string | null;
  fallbackLabel?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-100 p-2 text-center text-xs text-gray-500`}
      >
        {fallbackLabel}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={`${className} rounded-md border border-gray-200 bg-gray-100 object-cover`}
    />
  );
}

/**
 * Shown under an image field. For a `{{IMAGE:slug}}` placeholder it previews
 * the resolved CDN photo and offers "Upload photo for this slug", which writes
 * straight to the slug's key. That changes nothing in the route, so it never
 * touches the form or marks anything unsaved. For a plain URL it just previews.
 */
export function RouteImageFieldTools({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const authFetch = useAuthFetch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  const slug = parseImagePlaceholder(trimmed);

  const [resolved, setResolved] = useState<{ slug: string; url: string | null } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    setStatus(null);
    setVersion(null);
    setLookupError(null);
    if (!slug) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      authFetch(() =>
        api.get<AdminRouteImageResponse>(`/admin/route-images/${encodeURIComponent(slug)}`),
      )
        .then((res) => {
          if (!cancelled) setResolved({ slug: res.slug, url: res.url });
        })
        .catch((err) => {
          if (!cancelled) setLookupError(errorMessage(err, "Could not resolve slug"));
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, authFetch]);

  if (!slug) {
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
    return (
      <div className="mt-2">
        <ImagePreview
          src={trimmed}
          fallbackLabel="Image could not be loaded"
          className={compact ? "h-16 w-24" : "h-24 w-36"}
        />
      </div>
    );
  }

  async function handleFile(file: File) {
    if (!slug) return;
    const invalid = validateFile(file, true);
    if (invalid) {
      setStatus({ kind: "error", text: invalid });
      return;
    }
    if (!window.confirm(replaceWarning(slug))) return;
    setUploading(true);
    setStatus(null);
    try {
      await uploadRouteImage(authFetch, file, slug);
      setVersion(Date.now());
      setStatus({
        kind: "ok",
        text: "Photo uploaded. The route itself is unchanged, so there is nothing to save.",
      });
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err, "Failed to upload image") });
    } finally {
      setUploading(false);
    }
  }

  const baseUrl = resolved?.slug === slug ? resolved.url : null;
  // Cache-bust after an upload so the preview shows the new photo immediately.
  const previewUrl = baseUrl && version ? `${baseUrl}?v=${version}` : baseUrl;

  return (
    <div className="mt-2 flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-2">
      <ImagePreview
        src={previewUrl}
        fallbackLabel={
          resolved?.slug === slug && !resolved.url ? "No CDN configured" : "Not uploaded yet"
        }
        className={compact ? "h-16 w-24" : "h-24 w-36"}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-gray-600">
          Placeholder <code className="rounded bg-gray-200 px-1">{slug}</code> — photo lives at{" "}
          <code className="break-all rounded bg-gray-200 px-1">route-images/{slug}.jpg</code>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={BTN_SMALL}
        >
          {uploading ? "Uploading..." : "Upload photo for this slug"}
        </button>
        {lookupError && <p className="text-xs text-red-600">{lookupError}</p>}
        {status && (
          <p className={`text-xs ${status.kind === "ok" ? "text-green-700" : "text-red-600"}`}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The general "upload to slug" path: pick a JPEG, name a slug, and the photo
 * is stored at that slug's key. `onUploaded` receives the `{{IMAGE:slug}}`
 * placeholder for the caller to put in the (still unsaved) form field.
 */
export function UploadToSlugButton({
  onUploaded,
  onError,
  disabled,
  initialSlug,
}: {
  onUploaded: (placeholder: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  initialSlug?: string | null;
}) {
  const authFetch = useAuthFetch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    const invalid = validateFile(file, true);
    if (invalid) {
      onError(invalid);
      return;
    }
    const answer = window.prompt(
      "Slug for this photo (lowercase letters, digits and hyphens, e.g. leeds-town-hall-facade):",
      initialSlug || slugFromFilename(file.name),
    );
    if (answer === null) return;
    const parsed = routeImageSlugSchema.safeParse(answer);
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Invalid slug");
      return;
    }
    const slug = parsed.data;
    if (!window.confirm(replaceWarning(slug))) return;
    setUploading(true);
    try {
      const res = await uploadRouteImage(authFetch, file, slug);
      onUploaded(res.placeholder ?? `{{IMAGE:${slug}}}`);
    } catch (err) {
      onError(errorMessage(err, "Failed to upload image"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || uploading}
        title="Store a JPEG at a reusable {{IMAGE:slug}} key and use the placeholder here"
        className="whitespace-nowrap rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload to slug"}
      </button>
    </>
  );
}
