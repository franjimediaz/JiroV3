import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(resolve("apps/web/package.json"));
function loader(overrides = {}) {
  const cache = new Map();
  return function load(file) {
    const path = resolve(file); if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function("require", "module", "exports", code)(id => {
      if (id in overrides) return overrides[id];
      if (id === "server-only") return {};
      if (id.startsWith(".") || id.startsWith("@/")) {
        const base = id.startsWith("@/") ? resolve("apps/web", id.slice(2)) : resolve(dirname(path), id);
        for (const suffix of [".ts", ".tsx"]) if (existsSync(base + suffix)) return load(base + suffix);
      }
      return require(id);
    }, module, module.exports);
    return module.exports;
  };
}
const load = loader();
const { parseProfileInput } = load("apps/web/lib/profile/validation.ts");
const { finishEmailChange } = load("apps/web/lib/profile/emailSaga.ts");
const op = { id: "operation", old_auth_email: "old@example.test", old_db_email: "old@example.test", new_email: "new@example.test" };
function fixture(options = {}) {
  const state = { auth: op.new_email, database: op.old_db_email, ...options.state };
  const events = [];
  const store = {
    async read() { events.push("read"); if (options.readFails) throw Error(); return { ...state }; },
    async writeDatabase(previous, next) { events.push("db"); assert.equal(previous, op.old_db_email); if (options.commitThenFail) state.database = next; if (options.dbFails || options.commitThenFail) throw Error(); state.database = next; },
    async restoreAuth(previous) { events.push("rollback"); assert.equal(previous, op.old_auth_email); if (options.rollbackFails) throw Error(); if (!options.badRollback) state.auth = previous; },
    async close(status) { events.push(status); if (options.journalFails) throw Error(); },
    log(reason) { events.push(reason); },
  };
  return { state, events, store };
}
test("profile validates all fields before mutations and rejects identity/role injection", () => {
  assert.deepEqual(parseProfileInput({ action: "details", name: " Ana ", surname: " Pérez " }), { action: "details", name: "Ana", surname: "Pérez" });
  assert.equal(parseProfileInput({ action: "email", email: " ANA@EXAMPLE.TEST " }).email, "ana@example.test");
  for (const input of [null, {}, { action: "constructor" }, { action: "details", name: "", surname: "Pérez" },
    { action: "details", name: "Ana", surname: "Pérez", role: "admin" }, { action: "email", email: "invalid" },
    { action: "email", email: "a@b.test", uid: "another-user" },
    { action: "password", currentPassword: "old", password: "short", confirmPassword: "short" },
    { action: "password", currentPassword: "old", password: "a-long-password", confirmPassword: "different" },
    { action: "password", currentPassword: "a-long-password", password: "a-long-password", confirmPassword: "a-long-password" }]) assert.throws(() => parseProfileInput(input));
});
test("email only succeeds after both sources are read and equal", async () => {
  const f = fixture(); await finishEmailChange(op, f.store);
  assert.deepEqual(f.events, ["read", "db", "read", "completed"]);
  assert.equal(f.state.auth, f.state.database);
});
test("DB failure restores the previous Auth value and never returns success", async () => {
  const f = fixture({ dbFails: true }); await assert.rejects(finishEmailChange(op, f.store), /ROLLED_BACK/);
  assert.equal(f.state.auth, op.old_auth_email); assert.equal(f.state.database, op.old_db_email);
  assert.ok(f.events.includes("rolled_back")); assert.ok(!f.events.includes("completed"));
});
test("rollback failure is logged and persistently marked for reconciliation", async () => {
  const f = fixture({ dbFails: true, rollbackFails: true });
  await assert.rejects(finishEmailChange(op, f.store), /RECONCILIATION/);
  assert.ok(f.events.includes("auth_rollback_failed")); assert.ok(f.events.includes("reconciliation_required"));
});
test("a nominally successful rollback is verified rather than trusted", async () => {
  const f = fixture({ dbFails: true, badRollback: true });
  await assert.rejects(finishEmailChange(op, f.store), /RECONCILIATION/);
  assert.ok(!f.events.includes("rolled_back"));
});
test("lost DB response after commit is resolved by reading both sources", async () => {
  const f = fixture({ commitThenFail: true }); await finishEmailChange(op, f.store);
  assert.equal(f.events.at(-1), "completed"); assert.ok(!f.events.includes("rollback"));
});
test("concurrent values are not overwritten by rollback", async () => {
  const f = fixture({ state: { database: "external@example.test" } });
  await assert.rejects(finishEmailChange(op, f.store), /RECONCILIATION/);
  assert.ok(!f.events.includes("db")); assert.ok(!f.events.includes("rollback"));
});
test("unknown read outcome and failed journal write never confirm success", async () => {
  for (const options of [{ readFails: true }, { journalFails: true }, { dbFails: true, rollbackFails: true, journalFails: true }]) {
    const f = fixture(options); await assert.rejects(finishEmailChange(op, f.store), /RECONCILIATION/);
    assert.ok(f.events.includes("reconciliation_required"));
  }
});

function serverFixture({ immediate = false, dbFails = false, rollbackFails = false, passwordError = false, wrongPassword = false } = {}) {
  const rows = { users: [{ uid: "self", name: "Ana", surname: "Pérez", email: op.old_db_email }], profile_email_changes: [] };
  const auth = { id: "self", email: op.old_auth_email };
  const events = [];
  const admin = {
    auth: { admin: {
      async getUserById(uid) { assert.equal(uid, "self"); return { data: { user: { ...auth } }, error: null }; },
      async updateUserById(uid, input) { assert.equal(uid, "self"); events.push("rollback"); if (rollbackFails) return { error: {} }; Object.assign(auth, input, { new_email: "" }); return { error: null }; },
    } },
    from(table) {
      let mode = "select", values, filters = [];
      const q = {
        select() { return q; }, eq(k, v) { filters.push(row => row[k] === v); return q; },
        is(k, v) { return q.eq(k, v); }, in(k, vs) { filters.push(row => vs.includes(row[k])); return q; },
        update(v) { mode = "update"; values = v; return q; }, insert(v) { mode = "insert"; values = v; return q; },
        async single() { return q.maybeSingle(); },
        async maybeSingle() {
          if (mode === "insert") {
            events.push("journal");
            if (rows[table].some(row => ["starting", "pending_confirmation", "applying", "reconciliation_required"].includes(row.status))) return { error: {} };
            const row = { id: "operation", ...values }; rows[table].push(row); return { data: { ...row }, error: null };
          }
          const row = rows[table].find(row => filters.every(fn => fn(row)));
          if (mode === "update" && row) {
            if (table === "users" && "email" in values) { events.push("db"); if (dbFails) return { error: {} }; }
            Object.assign(row, values);
          }
          return { data: row ? { ...row } : null, error: null };
        },
      }; return q;
    },
  };
  const ctx = { user: { id: "self" }, supabase: { auth: { async updateUser(input, options) {
    events.push("auth"); assert.equal(rows.profile_email_changes[0].status, "starting");
    assert.equal(options.emailRedirectTo, "https://jiro.test/auth/profile-callback");
    if (immediate) auth.email = input.email; else auth.new_email = input.email;
    return { data: { user: { ...auth } }, error: null };
  } } } };
  const server = loader({ "@/lib/supabase/admin": { supabaseAdmin: admin },
    "@supabase/supabase-js": { createClient: () => ({ auth: {
      async signInWithPassword(input) { events.push("reauthenticate"); assert.equal(input.email, auth.email); return { data: { user: { id: "self" } }, error: wrongPassword ? {} : null }; },
      async updateUser(input) { events.push("password"); assert.deepEqual(Object.keys(input), ["password"]); return { data: { user: { id: "self" } }, error: passwordError ? {} : null }; },
      async signOut(options) { events.push("revoke_temporary_session"); assert.equal(options.scope, "local"); },
    } }) },
  })("apps/web/lib/profile/server.ts");
  return { rows, auth, events, ctx, server };
}
test("server journals first, retains old DB email until confirmation and then synchronizes", async () => {
  const f = serverFixture();
  const pending = await f.server.updateProfile(f.ctx, { action: "email", email: op.new_email }, "https://jiro.test");
  assert.equal(pending.status, "pending_confirmation"); assert.equal(f.rows.users[0].email, op.old_db_email);
  assert.deepEqual(f.events, ["journal", "auth"]);
  f.auth.email = op.new_email; f.auth.new_email = "";
  assert.equal((await f.server.updateProfile(f.ctx, { action: "finishEmail" }, "https://jiro.test")).status, "completed");
  assert.equal(f.rows.users[0].email, op.new_email);
});
test("server supports immediate Auth changes and blocks concurrent pending requests", async () => {
  const f = serverFixture({ immediate: true });
  assert.equal((await f.server.updateProfile(f.ctx, { action: "email", email: op.new_email }, "https://jiro.test")).status, "completed");
  assert.deepEqual(f.events, ["journal", "auth", "db"]);
  const pending = serverFixture();
  await pending.server.updateProfile(pending.ctx, { action: "email", email: op.new_email }, "https://jiro.test");
  await assert.rejects(pending.server.updateProfile(pending.ctx, { action: "email", email: "other@example.test" }, "https://jiro.test"));
  assert.equal(pending.events.filter(x => x === "auth").length, 1);
});
test("server preserves durable marker on failed compensation; successful compensation closes it", async () => {
  for (const rollbackFails of [false, true]) {
    const f = serverFixture({ immediate: true, dbFails: true, rollbackFails });
    await assert.rejects(f.server.updateProfile(f.ctx, { action: "email", email: op.new_email }, "https://jiro.test"));
    assert.equal(f.rows.profile_email_changes[0].status, rollbackFails ? "reconciliation_required" : "rolled_back");
  }
});
test("details only update the current DB user and do not mutate Auth", async () => {
  const f = serverFixture(); f.rows.users.push({ uid: "other", name: "Other", surname: "User", email: "other@example.test" });
  await f.server.updateProfile(f.ctx, parseProfileInput({ action: "details", name: "Ana María", surname: "Pérez López" }), "https://jiro.test");
  assert.equal(f.rows.users[0].name, "Ana María"); assert.equal(f.rows.users[1].name, "Other"); assert.deepEqual(f.events, []);
});
test("password requires current credentials, obeys Auth failures and closes its temporary session", async () => {
  const input = parseProfileInput({ action: "password", currentPassword: "old-secret", password: "new-password-long", confirmPassword: "new-password-long" });
  for (const options of [{}, { wrongPassword: true }, { passwordError: true }]) {
    const f = serverFixture(options);
    if (options.wrongPassword || options.passwordError) await assert.rejects(f.server.updateProfile(f.ctx, input, "https://jiro.test"));
    else assert.equal((await f.server.updateProfile(f.ctx, input, "https://jiro.test")).status, "completed");
    assert.equal(f.events[0], "reauthenticate"); assert.equal(f.events.at(-1), "revoke_temporary_session");
    if (options.wrongPassword) assert.ok(!f.events.includes("password"));
    assert.ok(!("password" in f.rows.users[0]));
  }
});
test("preexisting email divergence is recorded without touching Auth", async () => {
  const f = serverFixture(); f.rows.users[0].email = "divergent@example.test";
  await assert.rejects(f.server.updateProfile(f.ctx, { action: "email", email: op.new_email }, "https://jiro.test"));
  assert.equal(f.rows.profile_email_changes[0].status, "reconciliation_required"); assert.deepEqual(f.events, ["journal"]);
});
test("PKCE callback exchanges code and returns to profile without reporting success", async () => {
  let received;
  const route = loader({ "@/lib/supabase/server": { createClient: async () => ({ auth: { exchangeCodeForSession: async code => { received = code; return { error: null }; } } }) } })("apps/web/app/auth/profile-callback/route.ts");
  const result = await route.GET(new Request("https://jiro.test/auth/profile-callback?code=test-code&next=https://evil.test"));
  assert.equal(received, "test-code"); assert.equal(result.headers.get("location"), "https://jiro.test/mi-perfil?emailConfirmation=1");
  const invalid = await route.GET(new Request("https://jiro.test/auth/profile-callback?error=expired"));
  assert.equal(invalid.headers.get("location"), "https://jiro.test/mi-perfil?emailConfirmation=error");
});
test("API rejects unauthenticated/cross-origin requests and validates before update", async () => {
  let mutations = 0, signedIn = true;
  const route = loader({
    "@/lib/auth/getCurrentUser": { requireUser: async () => { if (!signedIn) throw Error("session required"); return { user: { id: "self" } }; } },
    "@/lib/profile/server": { updateProfile: async () => { mutations++; }, getProfile: async () => ({ name: "Ana" }) },
    "@/lib/security/rateLimit": { enforceRateLimit: async () => {} },
    "@/lib/auth/handleApiError": { handleApiError: error => new Response("error", { status: error.status || 401 }) },
  })("apps/web/app/api/profile/route.ts");
  const request = (body, origin = "https://jiro.test") => new Request("https://jiro.test/api/profile", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await route.POST(request({ action: "finishEmail" }, "https://evil.test"))).status, 403);
  signedIn = false; assert.equal((await route.GET()).status, 401);
  assert.equal((await route.POST(request({ action: "finishEmail" }))).status, 401);
  signedIn = true; assert.equal((await route.POST(request({ action: "email", email: "bad" }))).status, 400);
  assert.equal(mutations, 0);
});
