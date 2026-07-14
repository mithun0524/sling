import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, save } from "../src/store.js";

test("load returns {} for a missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "sling-"));
  const f = join(dir, "nope.json");
  assert.deepEqual(load(f), {});
  rmSync(dir, { recursive: true, force: true });
});

test("load returns {} for a corrupt file", () => {
  const dir = mkdtempSync(join(tmpdir(), "sling-"));
  const f = join(dir, "bad.json");
  writeFileSync(f, "{not json");
  assert.deepEqual(load(f), {});
  rmSync(dir, { recursive: true, force: true });
});

test("save then load round-trips, creating parent dirs", () => {
  const dir = mkdtempSync(join(tmpdir(), "sling-"));
  const f = join(dir, "nested", "requests.json");
  const store = { hello: { method: "GET", url: "https://x.com", headers: {}, body: null, vars: [] } };
  save(store, f);
  assert.deepEqual(load(f), store);
  rmSync(dir, { recursive: true, force: true });
});
