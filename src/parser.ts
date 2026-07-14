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
