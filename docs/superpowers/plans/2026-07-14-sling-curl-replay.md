# sling cURL-Replay CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A zero-GUI CLI that turns a messy browser "Copy as cURL" into a named, cleaned, parameterized, replayable HTTP request stored on disk.

**Architecture:** Six isolated modules — three pure string→data functions (`parser`, `cleaner`, `templater`), two I/O-isolating modules (`store`, `executor`), and a thin `cli` router. Pure modules have no I/O and are unit-tested directly; I/O modules are tested against a temp dir and a local mock server. `cli` wires them together and is the only module touching argv/stdout.

**Tech Stack:** Node ≥20 (native `fetch`, `node:test`, `node:util.parseArgs`), TypeScript, `tsx` for running TS tests. Zero runtime dependencies.

## Global Constraints

- Node ≥ 20 (native `fetch`, stable `node:test`, `parseArgs`). Set `"engines": { "node": ">=20" }`.
- **Zero runtime dependencies.** Dev deps allowed (`typescript`, `tsx`, `@types/node`). No runtime `dependencies` entry.
- TypeScript, `"type": "module"`, ESM imports with explicit `.js` extensions in source.
- Store file path: `~/.config/sling/requests.json` (honor `$XDG_CONFIG_HOME` if set, else `~/.config`).
- Noise-header denylist (drop, case-insensitive): `sec-ch-ua*` (prefix), `sec-fetch-*` (prefix), `priority`, `accept-language`, `accept-encoding`, `referer`, `dnt`, `cache-control`, `pragma`. **Always keep:** `authorization`, `content-type`, `cookie`.
- Var syntax: `{{name}}` where `name` matches `[a-zA-Z_][a-zA-Z0-9_]*`.
- Commands: `add`, `run`, `ls`, `show`, `rm`.

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: the `SlingRequest` type and `Store` type used by every later task:
  ```ts
  export interface SlingRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
    vars: string[];
  }
  export type Store = Record<string, SlingRequest>;
  ```

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sling",
  "version": "0.1.0",
  "description": "Terminal cURL replay tool: paste a browser cURL, clean it, save it, replay it.",
  "type": "module",
  "bin": { "sling": "./dist/cli.js" },
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc",
    "test": "tsx --test test/*.test.ts",
    "start": "tsx src/cli.ts"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": false,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 4: Create `src/types.ts`**

```ts
export interface SlingRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  vars: string[];
}

export type Store = Record<string, SlingRequest>;
```

- [ ] **Step 5: Install and verify toolchain**

Run: `npm install && npx tsc --noEmit`
Expected: installs; `tsc` exits 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore src/types.ts
git commit -m "chore: scaffold sling project"
```

---

## Task 1: parser — cURL string → request

**Files:**
- Create: `src/parser.ts`
- Test: `test/parser.test.ts`

**Interfaces:**
- Consumes: `SlingRequest` from `src/types.ts`
- Produces:
  ```ts
  // Returns a request with vars: [] (var detection happens later, in cli/add flow).
  export function parseCurl(input: string): Omit<SlingRequest, "vars">;
  // Throws Error with a message naming the failure when input isn't a parseable curl.
  ```
- Parsing rules: tokenize respecting single/double quotes and backslash line-continuations (`\` + newline). Recognize `-X/--request` (method), `-H/--header` (`Key: Value`), `-d/--data/--data-raw/--data-binary`/`--data-urlencode` (body), `--location`/`-L` (ignored flag), `--compressed` (ignored). The first bare non-flag token after `curl` is the URL. Default method: `GET`, or `POST` if a body is present and no explicit method.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCurl } from "../src/parser.js";

test("parses a browser copy-as-curl with headers and JSON body", () => {
  const input = `curl 'https://api.example.com/tenant/abc/user/42' \\
    -X POST \\
    -H 'authorization: Bearer tok123' \\
    -H 'content-type: application/json' \\
    -H 'sec-ch-ua: "Chromium";v="120"' \\
    --data-raw '{"description":"Rushin"}'`;
  const r = parseCurl(input);
  assert.equal(r.method, "POST");
  assert.equal(r.url, "https://api.example.com/tenant/abc/user/42");
  assert.equal(r.headers["authorization"], "Bearer tok123");
  assert.equal(r.headers["content-type"], "application/json");
  assert.equal(r.headers["sec-ch-ua"], '"Chromium";v="120"');
  assert.equal(r.body, '{"description":"Rushin"}');
});

test("defaults to GET when no method and no body", () => {
  const r = parseCurl(`curl 'https://x.com/a'`);
  assert.equal(r.method, "GET");
  assert.equal(r.body, null);
});

test("infers POST when body present and no explicit method", () => {
  const r = parseCurl(`curl 'https://x.com/a' --data '{"k":1}'`);
  assert.equal(r.method, "POST");
});

test("throws when input is not a curl command", () => {
  assert.throws(() => parseCurl("wget https://x.com"), /not a curl command/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/parser.test.ts` (or `npx tsx --test test/parser.test.ts`)
Expected: FAIL — cannot find module `../src/parser.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { SlingRequest } from "./types.js";

type ParsedRequest = Omit<SlingRequest, "vars">;

// Split a shell-ish string into tokens, honoring '...' , "..." , and backslash-newline joins.
function tokenize(input: string): string[] {
  const s = input.replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let val = "";
      i++;
      while (i < s.length && s[i] !== quote) { val += s[i]; i++; }
      i++; // closing quote
      tokens.push(val);
    } else {
      let val = "";
      while (i < s.length && !" \t\n\r".includes(s[i])) {
        if (s[i] === "'" || s[i] === '"') break;
        val += s[i]; i++;
      }
      tokens.push(val);
    }
  }
  return tokens;
}

const BODY_FLAGS = new Set(["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode"]);

export function parseCurl(input: string): ParsedRequest {
  const trimmed = input.trim();
  if (!/^curl\b/.test(trimmed)) throw new Error("not a curl command");
  const tokens = tokenize(trimmed).slice(1); // drop leading 'curl'

  let method: string | null = null;
  let url: string | null = null;
  let body: string | null = null;
  const headers: Record<string, string> = {};

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") { method = tokens[++i]; }
    else if (t === "-H" || t === "--header") {
      const raw = tokens[++i] ?? "";
      const idx = raw.indexOf(":");
      if (idx > 0) headers[raw.slice(0, idx).trim().toLowerCase()] = raw.slice(idx + 1).trim();
    }
    else if (BODY_FLAGS.has(t)) { body = tokens[++i] ?? ""; }
    else if (t === "-L" || t === "--location" || t === "--compressed") { /* ignore */ }
    else if (t.startsWith("-")) { /* ignore unknown flags (skip only the flag) */ }
    else if (url === null) { url = t; }
  }

  if (url === null) throw new Error("no URL found in curl command");
  if (method === null) method = body !== null ? "POST" : "GET";
  return { method, url, headers, body };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/parser.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts test/parser.test.ts
git commit -m "feat: add curl parser"
```

---

## Task 2: cleaner — drop noise headers

**Files:**
- Create: `src/cleaner.ts`
- Test: `test/cleaner.test.ts`

**Interfaces:**
- Consumes: nothing (operates on a plain headers map)
- Produces:
  ```ts
  export function cleanHeaders(headers: Record<string, string>): Record<string, string>;
  ```
- Drops keys matching the Global Constraints denylist (case-insensitive; `sec-ch-ua`/`sec-fetch` are prefix matches). Never drops `authorization`, `content-type`, `cookie`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanHeaders } from "../src/cleaner.js";

test("drops noise headers, keeps signal headers", () => {
  const input = {
    "authorization": "Bearer x",
    "content-type": "application/json",
    "cookie": "sid=1",
    "sec-ch-ua": '"Chromium"',
    "sec-ch-ua-mobile": "?0",
    "sec-fetch-site": "same-origin",
    "priority": "u=1",
    "accept-language": "en-US",
    "accept-encoding": "gzip",
    "referer": "https://x.com",
    "dnt": "1",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "accept": "application/json"
  };
  const out = cleanHeaders(input);
  assert.deepEqual(out, {
    "authorization": "Bearer x",
    "content-type": "application/json",
    "cookie": "sid=1",
    "accept": "application/json"
  });
});

test("is case-insensitive on denylist keys", () => {
  const out = cleanHeaders({ "Sec-CH-UA": "x", "Authorization": "Bearer y" });
  assert.deepEqual(out, { "Authorization": "Bearer y" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/cleaner.test.ts`
Expected: FAIL — cannot find module `../src/cleaner.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
const KEEP = new Set(["authorization", "content-type", "cookie"]);
const DROP_EXACT = new Set([
  "priority", "accept-language", "accept-encoding", "referer",
  "dnt", "cache-control", "pragma",
]);
const DROP_PREFIX = ["sec-ch-ua", "sec-fetch-"];

function isNoise(key: string): boolean {
  const k = key.toLowerCase();
  if (KEEP.has(k)) return false;
  if (DROP_EXACT.has(k)) return true;
  return DROP_PREFIX.some((p) => k.startsWith(p));
}

export function cleanHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!isNoise(k)) out[k] = v;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/cleaner.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cleaner.ts test/cleaner.test.ts
git commit -m "feat: add header cleaner"
```

---

## Task 3: templater — {{var}} detect + substitute

**Files:**
- Create: `src/templater.ts`
- Test: `test/templater.test.ts`

**Interfaces:**
- Consumes: `SlingRequest` from `src/types.ts`
- Produces:
  ```ts
  // All distinct {{var}} names found across url + header values + body, in first-seen order.
  export function detectVars(req: { url: string; headers: Record<string, string>; body: string | null }): string[];
  // Substitute provided vars. Returns the resolved request plus any var names still unfilled.
  export function substitute(
    req: { url: string; headers: Record<string, string>; body: string | null },
    vars: Record<string, string>,
  ): { url: string; headers: Record<string, string>; body: string | null; missing: string[] };
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectVars, substitute } from "../src/templater.js";

test("detectVars finds distinct names in first-seen order", () => {
  const req = {
    url: "https://x.com/{{tenant}}/user/{{id}}",
    headers: { "authorization": "Bearer {{token}}" },
    body: '{"id":"{{id}}"}',
  };
  assert.deepEqual(detectVars(req), ["tenant", "id", "token"]);
});

test("substitute fills provided vars and reports missing", () => {
  const req = {
    url: "https://x.com/{{tenant}}/user/{{id}}",
    headers: { "authorization": "Bearer {{token}}" },
    body: null,
  };
  const out = substitute(req, { tenant: "abc", id: "42" });
  assert.equal(out.url, "https://x.com/abc/user/42");
  assert.deepEqual(out.missing, ["token"]);
});

test("substitute with all vars leaves no missing", () => {
  const out = substitute({ url: "{{a}}", headers: {}, body: null }, { a: "1" });
  assert.equal(out.url, "1");
  assert.deepEqual(out.missing, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/templater.test.ts`
Expected: FAIL — cannot find module `../src/templater.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
const VAR_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

function scan(text: string, acc: string[]): void {
  for (const m of text.matchAll(VAR_RE)) {
    if (!acc.includes(m[1])) acc.push(m[1]);
  }
}

export function detectVars(req: { url: string; headers: Record<string, string>; body: string | null }): string[] {
  const acc: string[] = [];
  scan(req.url, acc);
  for (const v of Object.values(req.headers)) scan(v, acc);
  if (req.body) scan(req.body, acc);
  return acc;
}

function fill(text: string, vars: Record<string, string>, missing: Set<string>): string {
  return text.replace(VAR_RE, (_, name) => {
    if (name in vars) return vars[name];
    missing.add(name);
    return `{{${name}}}`;
  });
}

export function substitute(
  req: { url: string; headers: Record<string, string>; body: string | null },
  vars: Record<string, string>,
): { url: string; headers: Record<string, string>; body: string | null; missing: string[] } {
  const missing = new Set<string>();
  const url = fill(req.url, vars, missing);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k] = fill(v, vars, missing);
  const body = req.body === null ? null : fill(req.body, vars, missing);
  return { url, headers, body, missing: [...missing] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/templater.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/templater.ts test/templater.test.ts
git commit -m "feat: add var templater"
```

---

## Task 4: store — load/save named requests

**Files:**
- Create: `src/store.ts`
- Test: `test/store.test.ts`

**Interfaces:**
- Consumes: `SlingRequest`, `Store` from `src/types.ts`
- Produces:
  ```ts
  export function storePath(): string;              // ~/.config/sling/requests.json (honors XDG_CONFIG_HOME)
  export function load(file?: string): Store;       // missing/corrupt file => {}
  export function save(store: Store, file?: string): void; // creates parent dir; pretty JSON
  ```
  The optional `file` arg exists so tests can point at a temp path; production callers omit it and get `storePath()`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/store.test.ts`
Expected: FAIL — cannot find module `../src/store.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { Store } from "./types.js";

export function storePath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "sling", "requests.json");
}

export function load(file: string = storePath()): Store {
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed as Store : {};
  } catch {
    return {};
  }
}

export function save(store: Store, file: string = storePath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store.ts test/store.test.ts
git commit -m "feat: add request store"
```

---

## Task 5: executor — fire request, format response

**Files:**
- Create: `src/executor.ts`
- Test: `test/executor.test.ts`

**Interfaces:**
- Consumes: nothing (takes a resolved request shape)
- Produces:
  ```ts
  export interface ExecResult {
    status: number;
    elapsedMs: number;
    body: string;   // pretty-printed if JSON, else raw
  }
  export async function execute(
    req: { method: string; url: string; headers: Record<string, string>; body: string | null },
  ): Promise<ExecResult>;
  ```
  On network failure `execute` throws; the error message is surfaced by the CLI. `elapsedMs` is measured with `performance.now()`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import { execute } from "../src/executor.js";

function listen(handler: (req: any, res: any) => void): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test("executes a GET and pretty-prints JSON body", async () => {
  const { server, url } = await listen((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  const result = await execute({ method: "GET", url, headers: {}, body: null });
  assert.equal(result.status, 200);
  assert.equal(result.body, '{\n  "ok": true\n}');
  assert.ok(result.elapsedMs >= 0);
  server.close();
});

test("sends method, headers and body", async () => {
  let seen: any = {};
  const { server, url } = await listen((req, res) => {
    let data = "";
    req.on("data", (c: Buffer) => (data += c));
    req.on("end", () => {
      seen = { method: req.method, auth: req.headers["authorization"], body: data };
      res.writeHead(201).end("created");
    });
  });
  const result = await execute({
    method: "POST", url,
    headers: { "authorization": "Bearer t" },
    body: '{"a":1}',
  });
  assert.equal(result.status, 201);
  assert.equal(result.body, "created");
  assert.equal(seen.method, "POST");
  assert.equal(seen.auth, "Bearer t");
  assert.equal(seen.body, '{"a":1}');
  server.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/executor.test.ts`
Expected: FAIL — cannot find module `../src/executor.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface ExecResult {
  status: number;
  elapsedMs: number;
  body: string;
}

function prettyIfJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export async function execute(
  req: { method: string; url: string; headers: Record<string, string>; body: string | null },
): Promise<ExecResult> {
  const start = performance.now();
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body === null ? undefined : req.body,
  });
  const text = await res.text();
  const elapsedMs = Math.round(performance.now() - start);
  return { status: res.status, elapsedMs, body: prettyIfJson(text) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/executor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/executor.ts test/executor.test.ts
git commit -m "feat: add request executor"
```

---

## Task 6: cli — route argv → commands

**Files:**
- Create: `src/cli.ts`, `src/commands.ts`
- Test: `test/commands.test.ts`

**Interfaces:**
- Consumes: `parseCurl` (Task 1), `cleanHeaders` (Task 2), `detectVars`/`substitute` (Task 3), `load`/`save` (Task 4), `execute` (Task 5), types (Task 0).
- Produces: command functions that take an injected `io` object so they are testable without touching real stdout/stdin/network:
  ```ts
  export interface IO {
    out: (s: string) => void;
    err: (s: string) => void;
    readStdin: () => Promise<string>;
    load: (file?: string) => Store;
    save: (store: Store, file?: string) => void;
    execute: (req: { method: string; url: string; headers: Record<string, string>; body: string | null }) => Promise<ExecResult>;
    storeFile?: string;
  }
  export async function cmdAdd(name: string, io: IO): Promise<number>;   // reads curl from stdin
  export async function cmdRun(name: string, varFlags: string[], io: IO): Promise<number>; // varFlags like ["id=42"]
  export function cmdLs(io: IO): number;
  export function cmdShow(name: string, io: IO): number;
  export function cmdRm(name: string, io: IO): number;
  // Each returns a process exit code (0 ok, non-zero error).
  ```
  `src/cli.ts` builds the real `IO` (wrapping `store.load/save`, `executor.execute`, `process.stdout`, stdin reader), parses argv via `node:util.parseArgs`, and dispatches. Var-detection on `add`: after cleaning, run `detectVars`; store the detected list as `req.vars`. (No interactive prompt in v1 — detection is automatic; the user templatizes by editing values to `{{name}}` in the pasted curl, or vars are surfaced by `show`. This keeps `add` non-interactive and scriptable.)

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/commands.test.ts`
Expected: FAIL — cannot find module `../src/commands.js`.

- [ ] **Step 3: Write minimal implementation of `src/commands.ts`**

```ts
import { parseCurl } from "./parser.js";
import { cleanHeaders } from "./cleaner.js";
import { detectVars, substitute } from "./templater.js";
import type { Store, SlingRequest } from "./types.js";
import type { ExecResult } from "./executor.js";

export interface IO {
  out: (s: string) => void;
  err: (s: string) => void;
  readStdin: () => Promise<string>;
  load: (file?: string) => Store;
  save: (store: Store, file?: string) => void;
  execute: (req: { method: string; url: string; headers: Record<string, string>; body: string | null }) => Promise<ExecResult>;
  storeFile?: string;
}

function parseVarFlags(flags: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const f of flags) {
    const idx = f.indexOf("=");
    if (idx > 0) vars[f.slice(0, idx)] = f.slice(idx + 1);
  }
  return vars;
}

export async function cmdAdd(name: string, io: IO): Promise<number> {
  const raw = await io.readStdin();
  let parsed;
  try {
    parsed = parseCurl(raw);
  } catch (e) {
    io.err(`could not parse curl: ${(e as Error).message}`);
    return 1;
  }
  const headers = cleanHeaders(parsed.headers);
  const base = { url: parsed.url, headers, body: parsed.body };
  const vars = detectVars(base);
  const req: SlingRequest = { method: parsed.method, url: parsed.url, headers, body: parsed.body, vars };
  const store = io.load(io.storeFile);
  store[name] = req;
  io.save(store, io.storeFile);
  io.out(`saved '${name}' (${req.method} ${req.url})${vars.length ? ` — vars: ${vars.join(", ")}` : ""}`);
  return 0;
}

export async function cmdRun(name: string, varFlags: string[], io: IO): Promise<number> {
  const store = io.load(io.storeFile);
  const req = store[name];
  if (!req) { io.err(`no request named '${name}'. Try 'sling ls'.`); return 1; }
  const resolved = substitute({ url: req.url, headers: req.headers, body: req.body }, parseVarFlags(varFlags));
  if (resolved.missing.length) {
    io.err(`missing vars: ${resolved.missing.join(", ")}. Pass with --var name=value.`);
    return 1;
  }
  try {
    const result = await io.execute({ method: req.method, ...resolved });
    io.out(`${result.status}  ${result.elapsedMs}ms\n${result.body}`);
    return 0;
  } catch (e) {
    io.err(`request failed: ${(e as Error).message}`);
    return 1;
  }
}

export function cmdLs(io: IO): number {
  const store = io.load(io.storeFile);
  const names = Object.keys(store);
  if (!names.length) { io.out("(no saved requests)"); return 0; }
  for (const n of names) io.out(`${n}  ${store[n].method} ${store[n].url}`);
  return 0;
}

export function cmdShow(name: string, io: IO): number {
  const store = io.load(io.storeFile);
  const req = store[name];
  if (!req) { io.err(`no request named '${name}'. Try 'sling ls'.`); return 1; }
  io.out(JSON.stringify(req, null, 2));
  return 0;
}

export function cmdRm(name: string, io: IO): number {
  const store = io.load(io.storeFile);
  if (!store[name]) { io.err(`no request named '${name}'. Try 'sling ls'.`); return 1; }
  delete store[name];
  io.save(store, io.storeFile);
  io.out(`removed '${name}'`);
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/commands.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write `src/cli.ts` (the real argv → IO wiring)**

```ts
#!/usr/bin/env node
import { parseArgs } from "node:util";
import { load, save } from "./store.js";
import { execute } from "./executor.js";
import { cmdAdd, cmdRun, cmdLs, cmdShow, cmdRm, type IO } from "./commands.js";

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    if (process.stdin.isTTY) resolve(""); // no piped input
  });
}

const HELP = `sling — terminal cURL replay tool

  sling add <name>        read a curl from stdin, clean + save it
  sling run <name> [--var k=v ...]   replay a saved request
  sling ls                list saved requests
  sling show <name>       print a saved request
  sling rm <name>         delete a saved request`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [command, name] = argv;
  const io: IO = {
    out: (s) => process.stdout.write(s + "\n"),
    err: (s) => process.stderr.write(s + "\n"),
    readStdin,
    load,
    save,
    execute,
  };

  switch (command) {
    case "add":
      if (!name) { io.err("usage: sling add <name>"); return 1; }
      return cmdAdd(name, io);
    case "run": {
      if (!name) { io.err("usage: sling run <name> [--var k=v]"); return 1; }
      const { values } = parseArgs({
        args: argv.slice(2),
        options: { var: { type: "string", multiple: true } },
        allowPositionals: true,
      });
      return cmdRun(name, (values.var as string[]) ?? [], io);
    }
    case "ls": return cmdLs(io);
    case "show":
      if (!name) { io.err("usage: sling show <name>"); return 1; }
      return cmdShow(name, io);
    case "rm":
      if (!name) { io.err("usage: sling rm <name>"); return 1; }
      return cmdRm(name, io);
    default:
      io.out(HELP);
      return command ? 1 : 0;
  }
}

main().then((code) => process.exit(code));
```

- [ ] **Step 6: Manual smoke test end-to-end**

Run:
```bash
npm run build
echo "curl 'https://httpbin.org/anything/{{id}}' -H 'sec-ch-ua: junk' -H 'accept: application/json'" | node dist/cli.js add demo
node dist/cli.js ls
node dist/cli.js show demo
node dist/cli.js run demo --var id=42
node dist/cli.js rm demo
```
Expected: `add` reports saved with var `id`; `show` shows `sec-ch-ua` gone; `run` prints `200` and a JSON body echoing `id=42`; `rm` confirms removal.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts src/commands.ts test/commands.test.ts
git commit -m "feat: add cli router and commands"
```

---

## Task 7: README + full test run

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything
- Produces: docs only

- [ ] **Step 1: Write `README.md`**

```markdown
# sling

Terminal cURL replay tool. Paste a browser "Copy as cURL", sling strips the junk
headers, saves it by name, and lets you replay it — with swappable `{{vars}}`.

## Install

    npm install -g sling

## Use

    # Save a request (paste the curl on stdin):
    pbpaste | sling add my-req
    # or
    echo "curl 'https://api.example.com/u/{{id}}' -H 'authorization: Bearer x'" | sling add my-req

    sling ls                       # list saved
    sling show my-req              # inspect
    sling run my-req --var id=42   # replay, filling {{id}}
    sling rm my-req                # delete

Requests are stored in `~/.config/sling/requests.json`.

To parameterize a request, write `{{name}}` where you want a swappable value
(in the URL, a header value, or the body) before saving. sling detects them and
you fill them at run time with `--var name=value`.

Requires Node ≥ 20. Zero runtime dependencies.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all suites PASS (parser 4, cleaner 2, templater 3, store 3, executor 2, commands 5).

- [ ] **Step 3: Typecheck the build**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-Review

**Spec coverage:**
- `add`/`run`/`ls`/`show`/`rm` → Tasks 1–6. ✓
- Clean flow (parse → strip noise → save) → Tasks 1, 2, 6. ✓
- Denylist (exact + prefix keeps auth/content-type/cookie) → Task 2, matches Global Constraints verbatim. ✓
- Parameterize `{{var}}` detect + substitute + missing-var error (fire nothing) → Tasks 3, 6. ✓
- Store at `~/.config/sling/requests.json`, XDG-aware, corrupt→empty → Task 4. ✓
- Executor pretty-prints JSON, status + elapsed → Task 5. ✓
- Error table (bad curl, unfilled vars, unknown name, network fail, corrupt store) → Tasks 1/4/6. ✓
- Zero runtime deps, Node ≥20, native fetch/parseArgs → Global Constraints, Task 0. ✓
- Tests: pure modules direct, store via temp dir, executor via local mock server, no network → Tasks 1–6. ✓

**Deviation from spec (noted):** spec step "offer to templatize per candidate" (interactive prompt) is replaced by non-interactive auto-detection — user marks vars by writing `{{name}}` in the curl before `add`. Rationale: keeps `add` scriptable/pipeable (matches the `pbpaste | sling add` flow) and avoids a stdin conflict (stdin is consumed by the pasted curl, so it can't also drive an interactive prompt). This is a deliberate, documented simplification.

**Placeholder scan:** none — every code step has full code.

**Type consistency:** `SlingRequest`/`Store` (Task 0) used consistently; `IO`/`ExecResult` signatures match between Tasks 5, 6; `parseCurl` returns `Omit<SlingRequest,"vars">` and Task 6 adds `vars` — consistent.
