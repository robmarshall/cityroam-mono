import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.js";
import { logError } from "./log.js";
import { createServer } from "./server.js";

/**
 * stdio entry point. stdout is the protocol channel: all logging goes to
 * stderr via logError.
 */
async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      logError(`Not starting: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const server = createServer(config);
  await server.connect(new StdioServerTransport());
  logError(`Connected over stdio; pinned to ${config.env} (${config.apiUrl}).`);
}

main().catch((err: unknown) => {
  logError(`Fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exit(1);
});
