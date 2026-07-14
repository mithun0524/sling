import { test } from "node:test";
import assert from "node:assert/strict";
import { cmdAdd, cmdRun, cmdLs, cmdShow, cmdRm, IO } from "../src/commands.js";
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
  assert.equal(saved.headers["sec-ch-ua"], undefined); // cleaned
  assert.equal(saved.headers["authorization"], "Bearer {{tok}}");
  assert.deepEqual(saved.vars, ["tenant", "tok"]);
});

test("run substitutes vars and executes", async () => {
  const { io, out } = fakeIO();
  io.load = () => ({ demo: { method: "GET", url: "https://x.com/{{id}}", headers: {}, body: null, vars: ["id"] } });
  const code = await cmdRun("demo", ["id=99"], io);
  assert.equal(code, 0);
  assert.ok(out.join("\n").includes("200"));
});

test("run errors and fires nothing when a var is missing", async () => {
  let fired = false;
  const { io, err } = fakeIO({ execute: async () => { fired = true; return { status: 200, elapsedMs: 1, body: "" }; } });
  io.load = () => ({ demo: { method: "GET", url: "https://x.com/{{id}}", headers: {}, body: null, vars: ["id"] } });
  const code = await cmdRun("demo", [], io);
  assert.equal(code, 1);
  assert.equal(fired, false);
  assert.ok(err.join("\n").toLowerCase().includes("id"));
});

test("run on unknown name errors", async () => {
  const { io, err } = fakeIO();
  const code = await cmdRun("ghost", [], io);
  assert.equal(code, 1);
  assert.ok(err.join("\n").toLowerCase().includes("ls"));
});

test("ls lists names; rm deletes", () => {
  const { io, out } = fakeIO();
  io.load = () => ({ a: { method: "GET", url: "u", headers: {}, body: null, vars: [] } });
  assert.equal(cmdLs(io), 0);
  assert.ok(out.join("\n").includes("a"));
});
