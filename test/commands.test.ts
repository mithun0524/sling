import { test } from "node:test";
import assert from "node:assert/strict";
import { cmdAdd, cmdRun, cmdEdit, cmdLs, cmdShow, cmdRm, IO } from "../src/commands.js";
import type { Store } from "../src/types.js";
import type { ExecResult } from "../src/executor.js";

function fakeIO(overrides: Partial<IO> = {}): { io: IO; out: string[]; err: string[]; store: () => Store } {
  const out: string[] = [];
  const err: string[] = [];
  let mem: Store = {};
  const io: IO = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    readStdin: async () => "",
    readClipboard: async () => "",
    prompt: async () => "",
    openEditor: async (t) => t,
    isTTY: false,
    env: {},
    load: () => mem,
    save: (s) => { mem = s; },
    execute: async (): Promise<ExecResult> => ({ status: 200, elapsedMs: 1, body: "ok" }),
    ...overrides,
  };
  return { io, out, err, store: () => mem };
}

test("add parses, cleans, detects vars and saves", async () => {
  const curl = `curl 'https://x.com/{{tenant}}/u/42' -H 'authorization: Bearer {{tok}}' -H 'sec-ch-ua: a' --data-raw '{"k":1}'`;
  const { io, store } = fakeIO({ readStdin: async () => curl });
  const code = await cmdAdd("demo", io);
  assert.equal(code, 0);
  const saved = store()["demo"];
  assert.equal(saved.method, "POST");
  assert.equal(saved.headers["sec-ch-ua"], undefined);
  assert.equal(saved.headers["authorization"], "Bearer {{tok}}");
  assert.deepEqual(saved.vars, ["tenant", "tok"]);
});

test("add falls back to clipboard when stdin is empty", async () => {
  const { io, store } = fakeIO({
    readStdin: async () => "",
    readClipboard: async () => `curl 'https://x.com/a'`,
  });
  const code = await cmdAdd("clip", io);
  assert.equal(code, 0);
  assert.equal(store()["clip"].url, "https://x.com/a");
});

test("add errors when both stdin and clipboard are empty", async () => {
  const { io, err } = fakeIO();
  const code = await cmdAdd("nope", io);
  assert.equal(code, 1);
  assert.ok(err.join("\n").toLowerCase().includes("nothing to read"));
});

test("run substitutes vars and executes", async () => {
  const { io, out } = fakeIO();
  io.load = () => ({ demo: { method: "GET", url: "https://x.com/{{id}}", headers: {}, body: null, vars: ["id"] } });
  const code = await cmdRun("demo", ["id=99"], io);
  assert.equal(code, 0);
  assert.ok(out.join("\n").includes("200"));
});

test("run hard-fails on missing var when non-interactive", async () => {
  let fired = false;
  const { io, err } = fakeIO({ isTTY: false, execute: async () => { fired = true; return { status: 200, elapsedMs: 1, body: "" }; } });
  io.load = () => ({ demo: { method: "GET", url: "https://x.com/{{id}}", headers: {}, body: null, vars: ["id"] } });
  const code = await cmdRun("demo", [], io);
  assert.equal(code, 1);
  assert.equal(fired, false);
  assert.ok(err.join("\n").toLowerCase().includes("id"));
});

test("run prompts for missing var when interactive, then fires", async () => {
  const asked: string[] = [];
  const { io, out } = fakeIO({
    isTTY: true,
    prompt: async (q) => { asked.push(q); return "77"; },
  });
  const captured: any[] = [];
  io.execute = async (r) => { captured.push(r); return { status: 200, elapsedMs: 1, body: "ok" }; };
  io.load = () => ({ demo: { method: "GET", url: "https://x.com/{{id}}", headers: {}, body: null, vars: ["id"] } });
  const code = await cmdRun("demo", [], io);
  assert.equal(code, 0);
  assert.equal(asked.length, 1);
  assert.equal(captured[0].url, "https://x.com/77");
  assert.ok(out.join("\n").includes("200"));
});

test("run resolves {{env:TOKEN}} from environment", async () => {
  const captured: any[] = [];
  const { io } = fakeIO({ env: { API_TOKEN: "secret123" } });
  io.execute = async (r) => { captured.push(r); return { status: 200, elapsedMs: 1, body: "ok" }; };
  io.load = () => ({ demo: { method: "GET", url: "https://x.com", headers: { authorization: "Bearer {{env:API_TOKEN}}" }, body: null, vars: [] } });
  const code = await cmdRun("demo", [], io);
  assert.equal(code, 0);
  assert.equal(captured[0].headers.authorization, "Bearer secret123");
});

test("run fails and fires nothing when env var missing (even interactive)", async () => {
  let fired = false;
  const { io, err } = fakeIO({ isTTY: true, env: {} });
  io.execute = async () => { fired = true; return { status: 200, elapsedMs: 1, body: "" }; };
  io.load = () => ({ demo: { method: "GET", url: "https://x.com", headers: { authorization: "Bearer {{env:API_TOKEN}}" }, body: null, vars: [] } });
  const code = await cmdRun("demo", [], io);
  assert.equal(code, 1);
  assert.equal(fired, false);
  assert.ok(err.join("\n").includes("env:API_TOKEN"));
});

test("run on unknown name errors", async () => {
  const { io, err } = fakeIO();
  const code = await cmdRun("ghost", [], io);
  assert.equal(code, 1);
  assert.ok(err.join("\n").toLowerCase().includes("ls"));
});

test("edit rewrites request via editor and re-detects vars", async () => {
  const { io, store } = fakeIO({
    openEditor: async () => JSON.stringify({ method: "GET", url: "https://x.com/{{newvar}}", headers: {}, body: null, vars: [] }),
  });
  io.load = () => ({ demo: { method: "GET", url: "https://x.com/old", headers: {}, body: null, vars: [] } });
  let saved: Store = {};
  io.save = (s) => { saved = s; };
  const code = await cmdEdit("demo", io);
  assert.equal(code, 0);
  assert.equal(saved["demo"].url, "https://x.com/{{newvar}}");
  assert.deepEqual(saved["demo"].vars, ["newvar"]);
});

test("edit rejects broken JSON and leaves request unchanged", async () => {
  const original = { method: "GET", url: "https://x.com/keep", headers: {}, body: null, vars: [] };
  const { io, err } = fakeIO({ openEditor: async () => "{ this is not json" });
  io.load = () => ({ demo: { ...original } });
  let saveCalled = false;
  io.save = () => { saveCalled = true; };
  const code = await cmdEdit("demo", io);
  assert.equal(code, 1);
  assert.equal(saveCalled, false);
  assert.ok(err.join("\n").toLowerCase().includes("invalid json"));
});

test("edit unknown name errors", async () => {
  const { io, err } = fakeIO();
  const code = await cmdEdit("ghost", io);
  assert.equal(code, 1);
  assert.ok(err.join("\n").toLowerCase().includes("ls"));
});

test("ls lists names; rm deletes", () => {
  const { io, out } = fakeIO();
  io.load = () => ({ a: { method: "GET", url: "u", headers: {}, body: null, vars: [] } });
  assert.equal(cmdLs(io), 0);
  assert.ok(out.join("\n").includes("a"));
});

test("show prints a saved request", () => {
  const { io, out } = fakeIO();
  io.load = () => ({ a: { method: "GET", url: "u", headers: {}, body: null, vars: [] } });
  assert.equal(cmdShow("a", io), 0);
  assert.ok(out.join("\n").includes('"method"'));
});
