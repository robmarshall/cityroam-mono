import { describe, expect, it } from "vitest";
import { z } from "zod";
import { STAGING_KEY, callTool, fakeFetch, json, testConfig, textOf } from "../../__tests__/helpers.js";
import { connectWith } from "../../images/__tests__/fixtures.js";
import type { FetchLike } from "../../client/http.js";
import { messageBankToolInputShapes, registerMessageBankTools } from "../message-banks.js";

const ts = "2026-09-01T00:00:00.000Z";
const ID = "33333333-3333-4333-8333-333333333333";

function connect(fetch: FetchLike) {
  return connectWith(testConfig(), fetch, registerMessageBankTools);
}

const echo = () =>
  fakeFetch((call) => {
    const body = JSON.parse(call.body ?? "{}");
    const id = call.method === "PUT" ? call.url.pathname.split("/").pop() : ID;
    return json({ message_bank: { id, ...body, created_at: ts, updated_at: ts } }, call.method === "POST" ? 201 : 200);
  });

describe("message bank tools", () => {
  it("registers create and update (no delete) with transform-free input schemas", async () => {
    const client = await connect(echo().fetch);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["create_message_bank_entry", "update_message_bank_entry"]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(false);
      expect(tool.annotations?.destructiveHint).toBe(false);
      const schema = tool.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    }
    const update = tools.find((t) => t.name === "update_message_bank_entry")!;
    expect((update.inputSchema as { required?: string[] }).required?.sort()).toEqual(
      ["content", "id", "is_active", "language", "type"],
    );
    for (const [name, shape] of Object.entries(messageBankToolInputShapes)) {
      for (const [field, schema] of Object.entries(shape)) {
        const input = z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" });
        const output = z.toJSONSchema(schema, { io: "output", unrepresentable: "throw" });
        expect(input, `${name}.${field}`).toEqual(output);
        expect(JSON.stringify(input), `${name}.${field}`).not.toContain('"default"');
      }
    }
  });

  it("create → POST /admin/message-banks with the validated (trimmed, defaulted) body", async () => {
    const { fetch, calls } = echo();
    const result = await callTool(await connect(fetch), "create_message_bank_entry", {
      type: "success",
      language: "fr",
      content: "  Bien joué !  ",
    });
    expect(result.isError).toBeFalsy();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url.pathname).toBe("/admin/message-banks");
    expect(calls[0].headers.authorization).toBe(`Bearer ${STAGING_KEY}`);
    expect(JSON.parse(calls[0].body!)).toEqual({ type: "success", language: "fr", content: "Bien joué !", is_active: true });
    expect(textOf(result)).toMatch(/^\[staging\] Created message bank entry \[success\/fr\] active id=/);
    expect(result.structuredContent).toMatchObject({ dry_run: false, message_bank: { id: ID, content: "Bien joué !" } });
  });

  it("update → PUT /admin/message-banks/:id with every field", async () => {
    const { fetch, calls } = echo();
    const result = await callTool(await connect(fetch), "update_message_bank_entry", {
      id: ID,
      type: "hint-exhausted",
      language: "en",
      content: "It was {{ANSWER}}. On we go.",
      is_active: false,
    });
    expect(result.isError).toBeFalsy();
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url.pathname).toBe(`/admin/message-banks/${ID}`);
    expect(JSON.parse(calls[0].body!)).toEqual({
      type: "hint-exhausted",
      language: "en",
      content: "It was {{ANSWER}}. On we go.",
      is_active: false,
    });
    expect(textOf(result)).toContain("inactive");
    expect(textOf(result)).not.toContain("Warning");
  });

  it("rejects an invalid body with messageBankSchema before any HTTP", async () => {
    const { fetch, calls } = echo();
    const client = await connect(fetch);
    const blank = await callTool(client, "create_message_bank_entry", { type: "success", language: "en", content: "   " });
    expect(blank.isError).toBe(true);
    expect(textOf(blank)).toContain("content: Content is required");
    expect(textOf(blank)).toContain("Nothing was sent");

    const badType = await callTool(client, "create_message_bank_entry", { type: "cheer", language: "en", content: "x" });
    expect(badType.isError).toBe(true);

    const missingActive = await callTool(client, "update_message_bank_entry", {
      id: ID,
      type: "success",
      language: "en",
      content: "x",
    });
    expect(missingActive.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("dry_run sends nothing and shows the exact request", async () => {
    const { fetch, calls } = echo();
    const client = await connect(fetch);
    const created = await callTool(client, "create_message_bank_entry", {
      type: "failure",
      language: "en",
      content: "Not quite.",
      dry_run: true,
    });
    const updated = await callTool(client, "update_message_bank_entry", {
      id: ID,
      type: "failure",
      language: "en",
      content: "Not quite.",
      is_active: true,
      dry_run: true,
    });
    expect(calls).toHaveLength(0);
    expect(textOf(created)).toContain(
      'Dry run: nothing was sent. Would POST /admin/message-banks {"type":"failure","language":"en","content":"Not quite.","is_active":true}',
    );
    expect(textOf(updated)).toContain(`Would PUT /admin/message-banks/${ID}`);
    expect(updated.structuredContent).toMatchObject({ dry_run: true, method: "PUT" });
  });

  it("warns when {{ANSWER}} is used outside hint-exhausted", async () => {
    const { fetch } = echo();
    const result = await callTool(await connect(fetch), "create_message_bank_entry", {
      type: "success",
      language: "en",
      content: "Yes, {{ANSWER}}!",
      dry_run: true,
    });
    expect(textOf(result)).toContain("Warning: {{ANSWER}} is only substituted in hint-exhausted entries");
  });

  it("surfaces API errors verbatim", async () => {
    const { fetch } = fakeFetch(() => json({ error: "Message bank entry not found", code: "MESSAGE_BANK_NOT_FOUND" }, 404));
    const result = await callTool(await connect(fetch), "update_message_bank_entry", {
      id: ID,
      type: "success",
      language: "en",
      content: "x",
      is_active: true,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Error MESSAGE_BANK_NOT_FOUND (HTTP 404): Message bank entry not found");
  });
});
