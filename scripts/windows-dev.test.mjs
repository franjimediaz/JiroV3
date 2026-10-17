import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, symlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseListeners, ancestorPids, isRepoDevProcess, freeDevPorts, repoRoot } from "./kill-dev-ports.mjs";
import { cleanTargets, removeTarget } from "./clean-install.mjs";
import { probeTurbo } from "./dev.mjs";

test("netstat matches only exact local listening ports, including IPv6", () => {
  assert.deepEqual(parseListeners(`
  TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  12
  TCP  [::]:3001  [::]:0  LISTENING  13
  TCP  0.0.0.0:30001  0.0.0.0:0  LISTENING  14
  TCP  127.0.0.1:5555  127.0.0.1:3000  ESTABLISHED  15
  TCP  0.0.0.0:3002  0.0.0.0:0  LISTENING  16
  TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  invalid
  `), [{ port: 3000, pid: 12 }, { port: 3001, pid: 13 }]);
});

test("process ownership excludes ancestors, unknown commands and other repositories", () => {
  const processes = [{ ProcessId: 9, ParentProcessId: 8 }, { ProcessId: 8, ParentProcessId: 7 }, { ProcessId: 7, ParentProcessId: 0 }];
  const protectedPids = ancestorPids(processes, 9);
  assert.deepEqual([...protectedPids], [9, 8, 7]);
  const item = { ProcessId: 20, Name: "node.exe", CommandLine: 'node "C:\\src\\Jiro\\node_modules\\next\\dist\\server\\lib\\start-server.js"' };
  assert.equal(isRepoDevProcess(item, "C:\\src\\Jiro", protectedPids), true);
  assert.equal(isRepoDevProcess({ ...item, ProcessId: 8 }, "C:\\src\\Jiro", protectedPids), false);
  assert.equal(isRepoDevProcess(item, "C:\\src\\Other", protectedPids), false);
  assert.equal(isRepoDevProcess(item, "C:\\src\\Ji", protectedPids), false);
  assert.equal(isRepoDevProcess({ ...item, CommandLine: null }, "C:\\src\\Jiro", protectedPids), false);
  assert.equal(isRepoDevProcess({ ...item, Name: "other.exe" }, "C:\\src\\Jiro", protectedPids), false);
});

test("cleanup removes only build/dependency artifacts and tolerates partial deletion", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "jiro-clean-test-")));
  try {
    const artifacts = ["node_modules/.pnpm/next/node_modules/next/dist/compiled", "apps/web/.next/cache", "apps/web/node_modules", "apps/nested/demo/.next", "packages/ui/.next", ".turbo", "pdf-service/node_modules"];
    for (const path of artifacts) await mkdir(join(root, path), { recursive: true });
    await writeFile(join(root, "apps/web/.env.local"), "keep");
    const targets = await cleanTargets(root);
    assert.equal(targets.length, 7);
    for (const target of targets) await removeTarget(root, target);
    for (const target of targets) await removeTarget(root, target);
    assert.equal(await readFile(join(root, "apps/web/.env.local"), "utf8"), "keep");
    await assert.rejects(removeTarget(root, root), /fuera/);
    await assert.rejects(removeTarget(root, resolve(root, "..", "other")), /fuera/);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3 }); }
});

test("cleanup does not traverse a workspace junction outside the root", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "jiro-links-test-")));
  const outside = await realpath(await mkdtemp(join(tmpdir(), "jiro-outside-test-")));
  try {
    await mkdir(join(root, "apps"));
    await mkdir(join(outside, ".next"));
    await writeFile(join(outside, ".next", "keep"), "safe");
    await symlink(outside, join(root, "apps", "linked"), process.platform === "win32" ? "junction" : "dir");
    assert.equal((await cleanTargets(root)).some(path => path.includes("linked")), false);
    await assert.rejects(removeTarget(root, join(root, "apps", "linked", ".next")), /fuera/);
    assert.equal(await readFile(join(outside, ".next", "keep"), "utf8"), "safe");
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
    await rm(outside, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("cleanup passes bounded Windows retry options and only ignores ENOENT", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "jiro-retry-test-")));
  try {
    await removeTarget(root, join(root, "node_modules"), async (_path, options) => {
      assert.deepEqual(options, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
      throw Object.assign(new Error("gone"), { code: "ENOENT" });
    });
    await assert.rejects(removeTarget(root, join(root, "node_modules"), async () => {
      throw Object.assign(new Error("locked"), { code: "EBUSY" });
    }), { code: "EBUSY" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Turbo probe handles missing binaries, failed native execution and success", () => {
  const require = { resolve: () => "turbo-cli" };
  assert.equal(probeTurbo(require, () => ({ status: 0, stdout: "2.6.0\n" })).cli, "turbo-cli");
  assert.equal(probeTurbo(require, () => ({ status: 1 })).cli, undefined);
  assert.equal(probeTurbo(require, () => ({ error: { code: "UNKNOWN" } })).reason, "UNKNOWN");
  assert.equal(probeTurbo({ resolve() { throw Object.assign(new Error(), { code: "MODULE_NOT_FOUND" }); } }).reason, "MODULE_NOT_FOUND");
});

test("port cleanup tolerates a sibling exiting during inspection and never kills a foreign owner", async () => {
  let killed = false;
  let readsAfterKill = 0;
  let kills = 0;
  const line = (port, pid) => `TCP 0.0.0.0:${port} 0.0.0.0:0 LISTENING ${pid}`;
  const owners = [1000001, 1000002].map(pid => ({ ProcessId: pid, ParentProcessId: 0, Name: "node.exe", CommandLine: `node "${repoRoot}node_modules/next/dist/server/lib/start-server.js"` }));
  const run = (file, args) => {
    if (file === "netstat.exe") return !killed ? `${line(3000, 1000001)}\n${line(3001, 1000002)}` : ++readsAfterKill === 1 ? line(3001, 1000002) : "";
    if (file === "powershell.exe") return JSON.stringify(killed ? [] : owners);
    assert.equal(file, "taskkill.exe");
    assert.deepEqual(args, ["/PID", "1000001", "/T", "/F"]);
    killed = true; kills++;
    return "";
  };
  await freeDevPorts({ run, platform: "win32" });
  assert.equal(kills, 1);
  await assert.rejects(freeDevPorts({ platform: "win32", run(file) {
    if (file === "netstat.exe") return line(3000, 1000003);
    if (file === "powershell.exe") return JSON.stringify([{ ProcessId: 1000003, Name: "node.exe", CommandLine: "another app" }]);
    assert.fail("Must not kill a foreign process");
  } }), /no se reconoce/);
});
