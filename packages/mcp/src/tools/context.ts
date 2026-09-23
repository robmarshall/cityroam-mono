import type { HttpClient } from "../client/http.js";
import type { Config } from "../config.js";

/** What every tool and resource handler needs. */
export interface ToolContext {
  config: Config;
  http: HttpClient;
}
