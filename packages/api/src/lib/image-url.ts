import { resolveImageUrl } from "@cityroam/shared/utils";
import { env } from "../env.js";

/**
 * Absolutize a stored image reference against the configured CDN.
 *
 * Call this at every boundary where an image reference leaves the API, not when
 * storing one: the database keeps whatever the admin saved, so moving the CDN to
 * a new domain only needs an env change rather than a data migration.
 */
export function publicImageUrl(imageUrl: string | null | undefined): string | null {
  return resolveImageUrl(imageUrl, env.AWS_CDN_BASE_URL);
}
