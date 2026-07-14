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
