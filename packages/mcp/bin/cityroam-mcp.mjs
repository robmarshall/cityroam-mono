#!/usr/bin/env node
// Runs the stdio MCP server from source. @cityroam/shared ships TypeScript,
// so the server always runs through tsx (like the API's `node --import tsx`).
import { register } from "tsx/esm/api";

register();
await import("../src/index.ts");
