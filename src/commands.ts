import { parseCurl } from "./parser.js";
import { cleanHeaders } from "./cleaner.js";
import { detectVars, substitute } from "./templater.js";
import type { Store, SlingRequest } from "./types.js";
import type { ExecResult } from "./executor.js";

export interface IO {
  out: (s: string) => void;
  err: (s: string) => void;
  readStdin: () => Promise<string>;
  readClipboard: () => Promise<string>;
  prompt: (question: string) => Promise<string>;
  openEditor: (text: string) => Promise<string>;
  isTTY: boolean;
  env: Record<string, string | undefined>;
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

const isEnvMissing = (m: string): boolean => m.startsWith("env:");

export async function cmdAdd(name: string, io: IO): Promise<number> {
  let raw = await io.readStdin();
  if (!raw.trim()) raw = await io.readClipboard();
  if (!raw.trim()) { io.err("nothing to read — pipe a curl or copy one to the clipboard first."); return 1; }
  let parsed;
  try {
    parsed = parseCurl(raw);
  } catch (e) {
    io.err(`could not parse curl: ${(e as Error).message}`);
    return 1;
  }
  const headers = cleanHeaders(parsed.headers);
  const vars = detectVars({ url: parsed.url, headers, body: parsed.body });
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

  const base = { url: req.url, headers: req.headers, body: req.body };
  const vars = parseVarFlags(varFlags);
  let resolved = substitute(base, vars, io.env);

  // Prompt for still-missing NORMAL vars when interactive. env: vars are never prompted.
  const promptable = resolved.missing.filter((m) => !isEnvMissing(m));
  if (promptable.length && io.isTTY) {
    for (const name of promptable) vars[name] = await io.prompt(`${name}? › `);
    resolved = substitute(base, vars, io.env);
  }

  if (resolved.missing.length) {
    const parts = resolved.missing.map((m) => isEnvMissing(m) ? `${m} (set ${m.slice(4)} in your environment)` : m);
    io.err(`missing: ${parts.join(", ")}. Pass vars with --var name=value.`);
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

export async function cmdEdit(name: string, io: IO): Promise<number> {
  const store = io.load(io.storeFile);
  const req = store[name];
  if (!req) { io.err(`no request named '${name}'. Try 'sling ls'.`); return 1; }

  const edited = await io.openEditor(JSON.stringify(req, null, 2));
  let parsed: any;
  try {
    parsed = JSON.parse(edited);
  } catch (e) {
    io.err(`invalid JSON — '${name}' left unchanged: ${(e as Error).message}`);
    return 1;
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.method !== "string" || typeof parsed.url !== "string") {
    io.err(`edited request needs at least string 'method' and 'url' — '${name}' left unchanged.`);
    return 1;
  }
  const headers = (parsed.headers && typeof parsed.headers === "object") ? parsed.headers : {};
  const body = typeof parsed.body === "string" ? parsed.body : null;
  const vars = detectVars({ url: parsed.url, headers, body });
  store[name] = { method: parsed.method, url: parsed.url, headers, body, vars };
  io.save(store, io.storeFile);
  io.out(`updated '${name}'${vars.length ? ` — vars: ${vars.join(", ")}` : ""}`);
  return 0;
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
