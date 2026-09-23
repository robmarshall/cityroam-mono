import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import {
  ADMIN_API_KEY_ENVS,
  ADMIN_API_KEY_SCOPES,
  type AdminApiKeyEnv,
  type AdminApiKeyScope,
} from "@cityroam/shared/constants";
import { db } from "../db/index.js";
import { adminApiKeys } from "../db/schema/index.js";
import { constantTimeEquals } from "./constant-time.js";
import { createLogger } from "./logger.js";

const log = createLogger("api-keys");

/**
 * Admin API key tokens look like
 *
 *   crk_<env>_<keyId>_<secret>
 *
 * - env:    dev | stg | prd — a key only works on the deployment whose
 *           API_KEY_ENV matches, so a staging key cannot touch production.
 * - keyId:  the row's UUID as fixed-width base62 (22 chars), used for lookup.
 * - secret: 32 random bytes as base64url (43 chars). Only sha256(secret) is
 *           stored. 256 bits of entropy leaves nothing to brute-force, so a
 *           slow password hash would add latency and no security.
 */
export const API_KEY_TOKEN_PREFIX = "crk_";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_ID_LENGTH = 22; // 62^22 > 2^128
const SECRET_BYTES = 32;

/** last_used_at / last_used_ip are written at most this often per key. */
export const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

const TOKEN_PATTERN = new RegExp(
  `^crk_(${ADMIN_API_KEY_ENVS.join("|")})_([0-9A-Za-z]{${KEY_ID_LENGTH}})_([A-Za-z0-9_-]{43})$`,
);

export function uuidToBase62(uuid: string): string {
  let n = BigInt(`0x${uuid.replace(/-/g, "")}`);
  let out = "";
  while (n > 0n) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(KEY_ID_LENGTH, "0");
}

/** Inverse of uuidToBase62, or null when the value does not fit in 128 bits. */
export function base62ToUuid(value: string): string | null {
  let n = 0n;
  for (const ch of value) {
    const digit = BASE62.indexOf(ch);
    if (digit < 0) return null;
    n = n * 62n + BigInt(digit);
  }
  if (n >= 1n << 128n) return null;
  const hex = n.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function isApiKeyToken(token: string): boolean {
  return token.startsWith(API_KEY_TOKEN_PREFIX);
}

export interface ParsedApiKey {
  env: AdminApiKeyEnv;
  keyId: string;
  secret: string;
}

/** Splits a token into its parts, or null when it is not well-formed. */
export function parseApiKey(token: string): ParsedApiKey | null {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const keyId = base62ToUuid(match[2]);
  if (!keyId) return null;
  return { env: match[1] as AdminApiKeyEnv, keyId, secret: match[3] };
}

export interface GeneratedApiKey {
  id: string;
  /** The full token. Shown to the admin once and never stored. */
  token: string;
  /** `crk_<env>_<keyId>` — safe to store and display. */
  prefix: string;
  tokenHash: string;
  last4: string;
}

export function generateApiKey(env: AdminApiKeyEnv): GeneratedApiKey {
  const id = randomUUID();
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const prefix = `${API_KEY_TOKEN_PREFIX}${env}_${uuidToBase62(id)}`;
  return {
    id,
    token: `${prefix}_${secret}`,
    prefix,
    tokenHash: hashApiKeySecret(secret),
    last4: secret.slice(-4),
  };
}

export interface VerifiedApiKey {
  id: string;
  name: string;
  scopes: AdminApiKeyScope[];
}

const KNOWN_SCOPES = new Set<string>(ADMIN_API_KEY_SCOPES);

// Compared against when the key id is unknown, so a miss costs the same
// hash-and-compare as a wrong secret.
const DUMMY_HASH = "0".repeat(64);

/**
 * Resolves a bearer token to a live key, or null. Unknown id, wrong secret,
 * wrong environment, revoked and expired all come back as the same null so
 * the caller cannot tell them apart.
 */
export async function verifyApiKey(
  token: string,
  opts: { expectedEnv: string | undefined; ip: string; now?: Date },
): Promise<VerifiedApiKey | null> {
  const parsed = parseApiKey(token);
  if (!parsed) return null;

  const now = opts.now ?? new Date();

  const row = await db.query.adminApiKeys.findFirst({
    where: eq(adminApiKeys.id, parsed.keyId),
  });

  const secretMatches = constantTimeEquals(
    hashApiKeySecret(parsed.secret),
    row?.token_hash ?? DUMMY_HASH,
  );

  if (!row || !secretMatches) return null;
  // An unset API_KEY_ENV accepts no key at all rather than every key.
  if (!opts.expectedEnv || parsed.env !== opts.expectedEnv) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && row.expires_at.getTime() <= now.getTime()) return null;

  await touchLastUsed(row.id, row.last_used_at, opts.ip, now);

  return {
    id: row.id,
    name: row.name,
    // A scope dropped from the constants since the key was issued grants nothing.
    scopes: row.scopes.filter((s): s is AdminApiKeyScope => KNOWN_SCOPES.has(s)),
  };
}

/**
 * Records use at most once per LAST_USED_WRITE_INTERVAL_MS so a busy key does
 * not turn every read into a write. The WHERE repeats the staleness test so
 * concurrent requests race to a single update. A failure here never fails the
 * request.
 */
async function touchLastUsed(
  id: string,
  lastUsedAt: Date | null,
  ip: string,
  now: Date,
): Promise<void> {
  if (lastUsedAt && now.getTime() - lastUsedAt.getTime() < LAST_USED_WRITE_INTERVAL_MS) {
    return;
  }

  const staleBefore = new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS);
  try {
    await db
      .update(adminApiKeys)
      .set({ last_used_at: now, last_used_ip: ip })
      .where(
        and(
          eq(adminApiKeys.id, id),
          or(isNull(adminApiKeys.last_used_at), lt(adminApiKeys.last_used_at, staleBefore)),
        ),
      );
  } catch (err) {
    log.warn("failed to record api key use", {
      key_id: id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
