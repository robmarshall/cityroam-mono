import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ADMIN_API_KEY_GRANTABLE_SCOPES } from "@cityroam/shared/constants";
import {
  apiKeyStatus,
  buildCreatePayload,
  INITIAL_NEW_KEY_FORM,
  newKeyFormReducer,
  OFFERED_SCOPES,
  type NewKeyFormAction,
  type NewKeyFormState,
} from "../lib/api-key-form";

// The admin package has no DOM test environment (no jsdom / testing-library
// in the workspace), so the page is rendered with react-dom/server and the
// form's behaviour is exercised through the same reducer and Save-time
// payload builder the component uses.

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store.clear();
  store.set("cityroam_admin_token", "session-jwt");
  vi.stubGlobal("localStorage", localStorageStub);
  fetchSpy = vi.fn(async () =>
    new Response(JSON.stringify({ api_keys: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderPage(): Promise<string> {
  const { AuthProvider } = await import("../contexts/AuthContext");
  const { default: ApiKeysPage } = await import("../pages/ApiKeysPage");
  return renderToString(
    createElement(MemoryRouter, null, createElement(AuthProvider, null, createElement(ApiKeysPage))),
  );
}

async function renderForm(state: NewKeyFormState, onSave = vi.fn()): Promise<string> {
  const { NewKeyForm } = await import("../pages/ApiKeysPage");
  return renderToString(
    createElement(NewKeyForm, {
      state,
      dispatch: vi.fn(),
      onSave,
      onCancel: vi.fn(),
      saving: false,
      error: null,
    }),
  );
}

describe("ApiKeysPage", () => {
  it("renders the page and sends nothing while rendering", async () => {
    const html = await renderPage();
    expect(html).toContain("API Keys");
    expect(html).toContain("New key");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders the new-key form with a Save button, the grantable scopes and the expiry choices", async () => {
    const onSave = vi.fn();
    const html = await renderForm(INITIAL_NEW_KEY_FORM, onSave);

    expect(html).toContain(">Save<");
    for (const scope of ADMIN_API_KEY_GRANTABLE_SCOPES) {
      expect(html).toContain(`value="${scope}"`);
    }
    expect(html).not.toContain("routes:publish");
    for (const label of ["30 days", "90 days", "365 days", "Never"]) {
      expect(html).toContain(label);
    }
    // No <form> element, so Enter in a field cannot submit behind Save's back.
    expect(html).not.toContain("<form");
    expect(onSave).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("filling in the form changes local state only; nothing is sent until Save", async () => {
    const actions: NewKeyFormAction[] = [
      { type: "setName", name: "Claude staging" },
      { type: "toggleScope", scope: "routes:write" },
      { type: "toggleScope", scope: "images:write" },
      { type: "toggleScope", scope: "images:write" },
      { type: "setExpiry", expiry: "30" },
    ];
    let state = INITIAL_NEW_KEY_FORM;
    for (const action of actions) {
      state = newKeyFormReducer(state, action);
      await renderForm(state);
    }
    expect(fetchSpy).not.toHaveBeenCalled();

    // What Save sends.
    const built = buildCreatePayload(state);
    expect(built).toEqual({
      ok: true,
      payload: { name: "Claude staging", scopes: ["routes:read", "routes:write"], expires_in_days: 30 },
    });

    const { api } = await import("../lib/api");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ api_key: {}, token: "crk_dev_x" }), { status: 201 }),
    );
    if (built.ok) await api.apiKeys.create(built.payload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/admin/api-keys");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Claude staging",
      scopes: ["routes:read", "routes:write"],
      expires_in_days: 30,
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-jwt");
  });
});

describe("new key form state", () => {
  it("never offers or accepts routes:publish", () => {
    expect(OFFERED_SCOPES).not.toContain("routes:publish");
    const state = newKeyFormReducer(INITIAL_NEW_KEY_FORM, { type: "toggleScope", scope: "routes:publish" });
    expect(state.scopes).not.toContain("routes:publish");
  });

  it("maps Never to expires_in_days null", () => {
    const state = newKeyFormReducer({ ...INITIAL_NEW_KEY_FORM, name: "x" }, { type: "setExpiry", expiry: "never" });
    expect(buildCreatePayload(state)).toMatchObject({ ok: true, payload: { expires_in_days: null } });
  });

  it("refuses to save without a name or scopes", () => {
    expect(buildCreatePayload(INITIAL_NEW_KEY_FORM)).toEqual({ ok: false, error: "Name is required." });
    const noScopes = newKeyFormReducer({ ...INITIAL_NEW_KEY_FORM, name: "x" }, { type: "toggleScope", scope: "routes:read" });
    expect(buildCreatePayload(noScopes)).toEqual({ ok: false, error: "Pick at least one scope." });
  });
});

describe("apiKeyStatus", () => {
  const now = new Date("2026-09-23T12:00:00Z");

  it("is revoked when revoked_at is set, whatever the expiry", () => {
    expect(apiKeyStatus({ revoked_at: "2026-09-01T00:00:00Z", expires_at: null }, now)).toBe("revoked");
  });

  it("is expired once expires_at has passed", () => {
    expect(apiKeyStatus({ revoked_at: null, expires_at: "2026-09-23T11:59:59Z" }, now)).toBe("expired");
  });

  it("is active otherwise", () => {
    expect(apiKeyStatus({ revoked_at: null, expires_at: null }, now)).toBe("active");
    expect(apiKeyStatus({ revoked_at: null, expires_at: "2026-12-01T00:00:00Z" }, now)).toBe("active");
  });
});

describe("admin api client", () => {
  it("revokes via POST /admin/api-keys/:id/revoke and lists audit entries by actor", async () => {
    const { api } = await import("../lib/api");
    fetchSpy.mockImplementation(async () => new Response("{}", { status: 200 }));

    await api.apiKeys.revoke("abc");
    await api.auditLog.list({ actor_id: "abc", limit: 20 });
    await api.apiKeys.list();

    const calls = fetchSpy.mock.calls.map(([url, init]) => [(init as RequestInit).method, url]);
    expect(calls).toEqual([
      ["POST", "/admin/api-keys/abc/revoke"],
      ["GET", "/admin/audit-log?actor_id=abc&limit=20"],
      ["GET", "/admin/api-keys"],
    ]);
  });
});
