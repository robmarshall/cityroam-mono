import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { SUPPORTED_LANGUAGES } from "@cityroam/shared/constants";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { messageBankSchema } from "@cityroam/shared/validation";
import { z } from "zod";
import { errorResult, guard, okResult } from "../result.js";
import type { ToolContext } from "./context.js";

/**
 * Message bank writes. Deleting an entry is deliberately not offered: the
 * API keeps `DELETE /admin/message-banks/:id` session-only (use the admin
 * panel, or set is_active: false). Bodies are validated locally with the
 * shared `messageBankSchema` — the one the API parses — before any request.
 */

const languageEnum = z.enum(SUPPORTED_LANGUAGES as [SupportedLanguage, ...SupportedLanguage[]]);
const messageBankTypeEnum = z.enum(messageBankSchema.shape.type.options);

const common = {
  type: messageBankTypeEnum.describe("Message bank type (which moment of the game the guide says it in)"),
  language: languageEnum.describe("Language of the entry"),
  content: z
    .string()
    .describe("The guide's line. {{ANSWER}} is substituted only in hint-exhausted entries."),
};

export const messageBankToolInputShapes = {
  create_message_bank_entry: {
    ...common,
    is_active: z.boolean().optional().describe("Whether the guide may use it (default true)"),
    dry_run: z.boolean().optional().describe("Validate and show the request without creating anything"),
  },
  update_message_bank_entry: {
    id: z.string().min(1).describe("Message bank entry id (uuid)"),
    ...common,
    is_active: z
      .boolean()
      .describe("Whether the guide may use it. Required: the update replaces every field, so omitting it would re-enable the entry."),
    dry_run: z.boolean().optional().describe("Validate and show the request without changing anything"),
  },
} as const;

const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

interface MessageBankEntry {
  id: string;
  type: string;
  language: string;
  content: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

function validate(input: unknown): { ok: true; body: z.output<typeof messageBankSchema> } | { ok: false; message: string } {
  const parsed = messageBankSchema.safeParse(input);
  if (parsed.success) return { ok: true, body: parsed.data };
  const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ");
  return { ok: false, message: `Error: invalid message bank entry — ${issues}. Nothing was sent.` };
}

function answerWarning(type: string, content: string): string | undefined {
  if (type !== "hint-exhausted" && content.includes("{{ANSWER}}")) {
    return `Warning: {{ANSWER}} is only substituted in hint-exhausted entries; in a ${type} entry players would see it literally.`;
  }
  return undefined;
}

function describeEntry(e: MessageBankEntry): string {
  return `[${e.type}/${e.language}] ${e.is_active ? "active" : "inactive"} id=${e.id}: ${e.content}`;
}

function write(
  ctx: ToolContext,
  method: "POST" | "PUT",
  path: string,
  input: Record<string, unknown>,
  dryRun: boolean | undefined,
): Promise<CallToolResult> {
  const env = ctx.config.env;
  return guard(env, async () => {
    const checked = validate(input);
    if (!checked.ok) return errorResult(env, checked.message);
    const body = checked.body;
    const warning = answerWarning(body.type, body.content);
    const prefix = warning ? `${warning}\n` : "";

    if (dryRun) {
      return okResult(env, `${prefix}Dry run: nothing was sent. Would ${method} ${path} ${JSON.stringify(body)}`, {
        structured: { dry_run: true, method, path, body },
      });
    }

    const { data } =
      method === "POST"
        ? await ctx.http.post<{ message_bank: MessageBankEntry }>(path, body)
        : await ctx.http.put<{ message_bank: MessageBankEntry }>(path, body);
    const saved = data.message_bank;
    const verb = method === "POST" ? "Created" : "Updated";
    return okResult(env, `${prefix}${verb} message bank entry ${describeEntry(saved)}`, {
      structured: { dry_run: false, message_bank: saved },
    });
  });
}

export function registerMessageBankTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "create_message_bank_entry",
    {
      title: "Create message bank entry",
      description:
        "Add a guide line to a message bank (success, failure, hint-offer, …) for one language. Read cityroam://docs/guide-personality first for tone. There is no delete tool: deleting is admin-panel only; deactivate with update_message_bank_entry is_active: false instead.",
      inputSchema: messageBankToolInputShapes.create_message_bank_entry,
      annotations: WRITE,
    },
    ({ dry_run, ...fields }) => write(ctx, "POST", "/admin/message-banks", fields, dry_run),
  );

  server.registerTool(
    "update_message_bank_entry",
    {
      title: "Update message bank entry",
      description:
        "Replace a message bank entry's type, language, content and is_active (all required — the API replaces every field). Use list_message_banks to find the id and current values.",
      inputSchema: messageBankToolInputShapes.update_message_bank_entry,
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ id, dry_run, ...fields }) =>
      write(ctx, "PUT", `/admin/message-banks/${encodeURIComponent(id)}`, fields, dry_run),
  );
}
