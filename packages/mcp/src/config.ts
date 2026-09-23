import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Server configuration, read once at startup from the environment.
 *
 * The server is pinned to one City Roam environment. Staging is the default;
 * production needs an explicit second opt-in, and the API key's env segment
 * (`crk_<env>_…`) must match the pinned environment so a key pasted into the
 * wrong config fails before any request is sent.
 */

export const CITYROAM_ENVS = ["staging", "production", "local"] as const;
export type CityRoamEnv = (typeof CITYROAM_ENVS)[number];

export interface Config {
  env: CityRoamEnv;
  /** Base URL of the admin HTTP API, without a trailing slash. */
  apiUrl: string;
  /** Full `crk_…` token. Never log it. */
  apiKey: string;
  /** Directory holding the `docs/llm-authoring` markdown files. */
  docsDir: string;
  /** Directories `upload_image` may read from (used from Phase 7). */
  imageRoots: string[];
}

export const DEFAULT_API_URLS: Record<CityRoamEnv, string> = {
  staging: "https://api-staging.cityroam.co.uk",
  production: "https://api.cityroam.co.uk",
  local: "http://localhost:3001",
};

/** Env segment an API key must carry for each environment. */
export const KEY_PREFIXES: Record<CityRoamEnv, string> = {
  staging: "crk_stg_",
  production: "crk_prd_",
  local: "crk_dev_",
};

export const KEY_ENV_VARS: Record<CityRoamEnv, string> = {
  staging: "CITYROAM_API_KEY_STAGING",
  production: "CITYROAM_API_KEY_PRODUCTION",
  local: "CITYROAM_API_KEY_LOCAL",
};

/** Tag prefixed to every tool result so the transcript shows where it ran. */
export const ENV_TAGS: Record<CityRoamEnv, string> = {
  staging: "[staging]",
  production: "[PRODUCTION]",
  local: "[local]",
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** `packages/mcp/../../docs/llm-authoring`, from either `src/` or `dist/`. */
export function defaultDocsDir(): string {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  return path.resolve(packageRoot, "../../docs/llm-authoring");
}

type Env = Record<string, string | undefined>;

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadConfig(env: Env = process.env): Config {
  const rawEnv = nonEmpty(env.CITYROAM_ENV) ?? "staging";
  if (!(CITYROAM_ENVS as readonly string[]).includes(rawEnv)) {
    throw new ConfigError(
      `CITYROAM_ENV must be one of ${CITYROAM_ENVS.join(", ")} (got "${rawEnv}").`,
    );
  }
  const cityroamEnv = rawEnv as CityRoamEnv;

  if (cityroamEnv === "production" && env.CITYROAM_ALLOW_PRODUCTION !== "1") {
    throw new ConfigError(
      "Refusing to start against PRODUCTION: set CITYROAM_ALLOW_PRODUCTION=1 as well as CITYROAM_ENV=production.",
    );
  }

  const keyVar = KEY_ENV_VARS[cityroamEnv];
  const apiKey = nonEmpty(env[keyVar]);
  if (!apiKey) {
    throw new ConfigError(
      `No API key for ${cityroamEnv}: set ${keyVar} to an admin API key (created in the admin panel under API keys).`,
    );
  }

  const expectedPrefix = KEY_PREFIXES[cityroamEnv];
  if (!apiKey.startsWith(expectedPrefix)) {
    // Name only the env segment of the key, never the key itself.
    const found = /^crk_([a-z]+)_/.exec(apiKey)?.[1];
    throw new ConfigError(
      `${keyVar} is not a ${cityroamEnv} key: expected a key starting "${expectedPrefix}"` +
        (found ? `, got a "crk_${found}_" key.` : ", got something that is not a City Roam API key."),
    );
  }

  const apiUrl = (nonEmpty(env.CITYROAM_API_URL) ?? DEFAULT_API_URLS[cityroamEnv]).replace(/\/+$/, "");
  try {
    const url = new URL(apiUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
  } catch {
    throw new ConfigError(`CITYROAM_API_URL is not a valid http(s) URL: "${apiUrl}".`);
  }

  const docsDir = path.resolve(nonEmpty(env.CITYROAM_DOCS_DIR) ?? defaultDocsDir());

  const imageRoots = (nonEmpty(env.CITYROAM_IMAGE_ROOTS) ?? "")
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));

  return { env: cityroamEnv, apiUrl, apiKey, docsDir, imageRoots };
}
