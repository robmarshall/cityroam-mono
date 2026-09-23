/**
 * Logging for the stdio server. stdout carries the MCP protocol, so every
 * diagnostic goes to stderr — never write to stdout (console logging) in this package.
 */
export function logError(message: string): void {
  process.stderr.write(`[cityroam-mcp] ${message}\n`);
}
